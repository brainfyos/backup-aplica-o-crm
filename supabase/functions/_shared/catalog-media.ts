// Utilitários de extração e validação de mídia de páginas de catálogo.
// Objetivo: NUNCA gravar URL de imagem inventada pela IA — só URLs que
// existem de fato no HTML da página e que respondem como imagem.

const JUNK_PATTERNS = [
  "logo", "sprite", "icon", "favicon", "placeholder", "avatar", "banner-ads",
  "pixel", "tracking", "1x1", "blank", "spacer", "watermark", "whatsapp",
  "facebook", "instagram", "youtube", "loading", "lazy-", "no-image",
  "sem-foto", "semfoto", "default",
];

export function absolutize(src: string, baseUrl: string): string | null {
  try {
    const clean = src.trim().replace(/&amp;/g, "&");
    if (!clean || clean.startsWith("data:") || clean.startsWith("blob:")) return null;
    return new URL(clean, baseUrl).toString();
  } catch {
    return null;
  }
}

export function isJunkImage(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.endsWith(".svg") || lower.includes(".svg?")) return true;
  if (lower.endsWith(".gif")) return true;
  return JUNK_PATTERNS.some((p) => lower.includes(p));
}

function pickFromSrcset(srcset: string): string[] {
  return srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/**
 * Extrai URLs reais de imagem do HTML da página (img/src, data-src, srcset,
 * og:image, JSON-LD). Retorna absolutas, únicas e sem lixo (logos, ícones...).
 */
export function extractImageCandidates(html: string, baseUrl: string, limit = 40): string[] {
  const found: string[] = [];
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    const abs = absolutize(raw, baseUrl);
    if (!abs) return;
    if (!/^https?:\/\//i.test(abs)) return;
    if (isJunkImage(abs)) return;
    if (!found.includes(abs)) found.push(abs);
  };

  // og:image / twitter:image
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi)) {
    const content = m[0].match(/content=["']([^"']+)["']/i)?.[1];
    push(content);
  }

  // <img ...>
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = tag.match(/(?:data-)?srcset=["']([^"']+)["']/i)?.[1];
    if (srcset) pickFromSrcset(srcset).forEach(push);
    const src =
      tag.match(/\bdata-(?:src|original|lazy|lazy-src|image)=["']([^"']+)["']/i)?.[1] ||
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    push(src);
  }

  // <source srcset> (picture)
  for (const m of html.matchAll(/<source\b[^>]*srcset=["']([^"']+)["'][^>]*>/gi)) {
    pickFromSrcset(m[1]).forEach(push);
  }

  // JSON-LD com campo image
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const json = JSON.parse(m[1].trim());
      const walk = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== "object") return;
        const img = (node as any).image ?? (node as any).photo;
        if (typeof img === "string") push(img);
        else if (Array.isArray(img)) img.forEach((i) => push(typeof i === "string" ? i : i?.url));
        else if (img && typeof img === "object") push(img.url);
        Object.values(node).forEach(walk);
      };
      walk(json);
    } catch {
      // ignora JSON-LD inválido
    }
  }

  return found.slice(0, limit);
}

/** Extrai os blocos JSON-LD como texto (preço, área, quartos vivem aqui). */
export function extractStructuredData(html: string, maxChars = 6000): string {
  const blocks: string[] = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim();
    if (raw.length > 0 && raw.length < 20000) blocks.push(raw);
  }
  return blocks.join("\n").slice(0, maxChars);
}

/** Confere se a URL responde e é realmente uma imagem. */
export async function isImageReachable(url: string, timeoutMs = 6000): Promise<boolean> {
  const attempt = async (method: "HEAD" | "GET") => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VendusCatalogBot/1.0)" },
      });
      if (!res.ok) return false;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (method === "GET") await res.body?.cancel();
      if (!ct) return true;
      return ct.startsWith("image/");
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  };

  if (await attempt("HEAD")) return true;
  return await attempt("GET");
}

/** Valida uma lista de URLs em paralelo, preservando a ordem. */
export async function filterReachableImages(urls: string[], max = 6): Promise<string[]> {
  const unique = Array.from(new Set(urls)).slice(0, max * 3);
  const results = await Promise.all(
    unique.map(async (u) => ((await isImageReachable(u)) ? u : null)),
  );
  return results.filter((u): u is string => !!u).slice(0, max);
}

const NON_ITEM_URL_PATTERNS = [
  "/politica", "/privacidade", "/privacy", "/termos", "/terms", "/contato",
  "/contact", "/sobre", "/about", "/blog", "/noticia", "/faq", "/ajuda",
  "/login", "/cadastro", "/carrinho", "/checkout", "/institucional",
  "/trabalhe", "/cookies", "/lgpd", "/mapa-do-site", "/sitemap",
];

/** Descarta páginas institucionais/listagem pela URL. */
export function isLikelyNonItemUrl(url: string): boolean {
  const lower = url.toLowerCase();
  const path = (() => {
    try {
      return new URL(lower).pathname;
    } catch {
      return lower;
    }
  })();
  if (path === "/" || path === "") return true;
  return NON_ITEM_URL_PATTERNS.some((p) => path.includes(p));
}
