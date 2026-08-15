import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordLovableUsage } from "../_shared/ai-router.ts";
import {
  extractImageCandidates,
  extractStructuredData,
  filterReachableImages,
  isLikelyNonItemUrl,
} from "../_shared/catalog-media.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncBody {
  organization_id: string;
  product_id?: string | null;
  base_url: string;
  item_pattern?: string; // ex: "/imovel/" — substring obrigatória na URL
  catalog_type?: string; // imoveis | produtos | veiculos | generico
  max_items?: number;
}

const CATALOG_SCHEMAS: Record<string, string> = {
  imoveis: "Imóveis: campos esperados — bairro, cidade, estado, quartos, banheiros, vagas, area_m2, tipo (apartamento/casa/comercial), suites.",
  veiculos: "Veículos: campos esperados — marca, modelo, ano, km, combustivel, cambio, cor, tipo.",
  produtos: "Produtos: campos esperados — categoria, marca, sku, estoque, variantes.",
  generico: "Genérico: extraia os atributos mais relevantes do produto/item.",
};

function normalizeDiscoveredUrl(raw: string, baseUrl: string): string | null {
  try {
    const clean = raw.trim().replace(/&amp;/g, "&").replace(/\\+$/, "");
    if (!clean || clean.startsWith("#") || clean.startsWith("javascript:")) return null;
    const url = new URL(clean, baseUrl);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractPageLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/\bhref=(?:["']([^"']+)["']|([^\s>]+))/gi)) {
    const normalized = normalizeDiscoveredUrl(match[1] || match[2], baseUrl);
    if (normalized && !links.includes(normalized)) links.push(normalized);
  }
  return links;
}

function extractLinkedItemSnippets(html: string, baseUrl: string): Map<string, string> {
  const snippets = new Map<string, string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=(?:["']([^"']+)["']|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)) {
    const normalized = normalizeDiscoveredUrl(match[1] || match[2], baseUrl);
    if (!normalized || !normalized.toLowerCase().includes("/imovel/")) continue;
    snippets.set(normalized, match[0].slice(0, 12000));
  }
  return snippets;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let logId: string | null = null;

  try {
    const body = (await req.json()) as SyncBody;

    if (!body.organization_id || !body.base_url) {
      return new Response(JSON.stringify({ error: "organization_id and base_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Firecrawl not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiKey) {
      return new Response(JSON.stringify({ error: "Lovable AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const catalogType = body.catalog_type || "generico";
    const maxItems = Math.min(body.max_items ?? 30, 50);

    // Identifica usuário se autenticado (pra registrar created_by)
    let userId: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth) {
      const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
      userId = user?.id ?? null;
    }

    // Cria log de sync
    const { data: logRow } = await supabase
      .from("catalog_sync_logs")
      .insert({
        organization_id: body.organization_id,
        product_id: body.product_id ?? null,
        source_type: "firecrawl",
        base_url: body.base_url,
        catalog_type: catalogType,
        status: "running",
        created_by: userId,
      })
      .select("id")
      .single();
    logId = logRow?.id ?? null;

    // 1. MAP — descobre URLs do site
    console.log("[catalog-sync] Mapping", body.base_url);
    const mapRes = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: body.base_url, limit: 500, includeSubdomains: false }),
    });
    const mapData = await mapRes.json();
    if (!mapRes.ok) throw new Error(mapData.error || "Map failed");

    let urls: string[] = Array.isArray(mapData.links) ? mapData.links : [];

    // Alguns portais imobiliários expõem no map apenas a página de listagem.
    // Fazemos um scrape da URL informada para descobrir os links reais dos itens.
    let discoveryHtml = "";
    const discoveryRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: body.base_url,
        formats: ["html", "links"],
        onlyMainContent: false,
      }),
    });
    if (discoveryRes.ok) {
      const discoveryData = await discoveryRes.json();
      const discoveryPayload = discoveryData.data ?? discoveryData;
      discoveryHtml = typeof discoveryPayload?.html === "string" ? discoveryPayload.html : "";
      const linkedUrls = Array.isArray(discoveryPayload?.links) ? discoveryPayload.links : [];
      const htmlUrls = discoveryHtml ? extractPageLinks(discoveryHtml, body.base_url) : [];
      urls.push(...linkedUrls, ...htmlUrls);
    } else {
      console.warn("[catalog-sync] listing discovery failed; continuing with map results");
    }

    // Uma URL de ficha passada diretamente também precisa ser processada, inclusive
    // em sites SPA que usam #/ads/... e não aparecem no sitemap/map.
    urls.push(body.base_url);
    urls = Array.from(new Set(urls.map((u) => normalizeDiscoveredUrl(u, body.base_url)).filter((u): u is string => !!u)));
    if (body.item_pattern) {
      const pat = body.item_pattern.toLowerCase();
      urls = urls.filter((u) => u.toLowerCase().includes(pat));
    }
    // Descarta páginas institucionais / listagem (privacidade, termos, blog, home...)
    urls = urls.filter((u) => !isLikelyNonItemUrl(u));
    urls = urls.slice(0, maxItems);

    console.log(`[catalog-sync] Found ${urls.length} URLs to scrape`);

    let created = 0, updated = 0, failed = 0, skipped = 0;
    const itemSnippets = discoveryHtml ? extractLinkedItemSnippets(discoveryHtml, body.base_url) : new Map<string, string>();

    // 2. Para cada URL: scrape (markdown + html) + extract via IA
    for (const url of urls) {
      try {
        const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            formats: ["markdown", "html"],
            onlyMainContent: false,
          }),
        });
        const scrapeData = await scrapeRes.json();
        if (!scrapeRes.ok) {
          console.error("[catalog-sync] scrape failed for", url);
          failed++;
          continue;
        }
        const payload = scrapeData.data ?? scrapeData;
        const listingSnippet = itemSnippets.get(url) || "";
        const scrapedMarkdown: string = payload?.markdown || "";
        const scrapedHtml: string = payload?.html || payload?.rawHtml || "";
        // Portais protegidos por anti-bot podem devolver apenas o aviso de cookies na
        // ficha. O card da listagem ainda contém título, preço, atributos e foto reais.
        const markdown = listingSnippet
          ? `${scrapedMarkdown}\n\nDADOS DO CARD NA LISTAGEM:\n${listingSnippet}`
          : scrapedMarkdown;
        const html = listingSnippet ? `${scrapedHtml}\n${listingSnippet}` : scrapedHtml;
        if (!markdown && !html) { failed++; continue; }

        // Imagens REAIS da página (a IA nunca escreve URL — só escolhe)
        const imageCandidates = html ? extractImageCandidates(html, url) : [];
        const structured = html ? extractStructuredData(html) : "";

        const candidateList = imageCandidates
          .map((u, i) => `${i}: ${u}`)
          .join("\n") || "(nenhuma imagem encontrada na página)";

        // Extract via Lovable AI (tool calling pra structured output)
        const extractRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${aiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: `Você extrai dados estruturados de páginas web.
Tipo de catálogo: ${catalogType}.
${CATALOG_SCHEMAS[catalogType] || CATALOG_SCHEMAS.generico}
Sempre devolva preço como número (sem R$, sem pontos de milhar). Se não encontrar, retorne null.
REGRA CRÍTICA SOBRE IMAGENS: você NÃO pode escrever URLs de imagem. Você recebe uma lista numerada de imagens reais da página e deve devolver em image_indexes apenas os ÍNDICES das fotos que mostram o item (na ordem de relevância, no máximo 6). Ignore logotipos, ícones, banners e imagens de outros itens. Se nenhuma imagem for do item, devolva lista vazia.
is_item: true somente se a página for a ficha de UM item específico (com preço e/ou atributos próprios). Páginas institucionais, listagens, termos, privacidade, blog → false.`,
              },
              {
                role: "user",
                content: `URL: ${url}

DADOS ESTRUTURADOS DA PÁGINA (JSON-LD):
${structured || "(nenhum)"}

IMAGENS DISPONÍVEIS (use os índices):
${candidateList}

CONTEÚDO:
${markdown.slice(0, 20000)}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "extract_item",
                  description: "Extrai dados de um item de catálogo",
                  parameters: {
                    type: "object",
                    properties: {
                      is_item: { type: "boolean" },
                      title: { type: "string" },
                      description: { type: "string" },
                      price: { type: ["number", "null"] },
                      image_indexes: { type: "array", items: { type: "number" } },
                      attributes: { type: "object", additionalProperties: true },
                    },
                    required: ["title", "is_item"],
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "extract_item" } },
          }),
        });

        if (!extractRes.ok) {
          if (extractRes.status === 402) {
            throw new Error("Lovable AI: créditos insuficientes");
          }
          failed++;
          continue;
        }

        const extractData = await extractRes.json();
        await recordLovableUsage(supabase, body.organization_id, 'content_generation', 'google/gemini-3-flash-preview', extractData?.usage, 'catalog-sync-website');
        const tc = extractData.choices?.[0]?.message?.tool_calls?.[0];
        if (!tc) { failed++; continue; }
        const parsed = JSON.parse(tc.function.arguments);

        // Só grava se for realmente uma ficha de item com algum dado útil
        const attrs = (parsed.attributes && typeof parsed.attributes === "object") ? parsed.attributes : {};
        const hasAttrSignal = Object.values(attrs).some((v) => v !== null && v !== undefined && v !== "");
        if (parsed.is_item === false || (parsed.price == null && !hasAttrSignal)) {
          console.log("[catalog-sync] skipped non-item page:", url);
          skipped++;
          continue;
        }

        // Resolve índices → URLs reais → valida se a imagem responde
        const chosen: string[] = Array.isArray(parsed.image_indexes)
          ? parsed.image_indexes
              .map((i: any) => imageCandidates[Number(i)])
              .filter((u: any): u is string => typeof u === "string")
          : [];
        const fallback = chosen.length > 0 ? chosen : imageCandidates.slice(0, 6);
        const validImages = await filterReachableImages(fallback, 6);
        if (validImages.length === 0 && fallback.length > 0) {
          console.warn("[catalog-sync] no reachable image for", url);
        }

        const externalId = `firecrawl:${url}`;
        const thumbnail = validImages[0] ?? null;


        // Upsert por (org, product, external_id)
        const { data: existing } = await supabase
          .from("product_catalog_items")
          .select("id")
          .eq("organization_id", body.organization_id)
          .eq("external_id", externalId)
          .maybeSingle();

        const itemPayload = {
          organization_id: body.organization_id,
          product_id: body.product_id ?? null,
          external_id: externalId,
          title: parsed.title || "Sem título",
          description: parsed.description ?? null,
          price: parsed.price ?? null,
          currency: "BRL",
          url,
          thumbnail_url: thumbnail,
          images: validImages,
          attributes: attrs,
          source_type: "firecrawl",
          source_url: url,
          last_synced_at: new Date().toISOString(),
        };

        if (existing) {
          await supabase.from("product_catalog_items").update(itemPayload).eq("id", existing.id);
          updated++;
        } else {
          await supabase.from("product_catalog_items").insert(itemPayload);
          created++;
        }
      } catch (e) {
        console.error("[catalog-sync] item error:", e);
        failed++;
      }
    }

    if (logId) {
      await supabase.from("catalog_sync_logs").update({
        status: "completed",
        items_found: urls.length,
        items_created: created,
        items_updated: updated,
        items_failed: failed,
        finished_at: new Date().toISOString(),
      }).eq("id", logId);
    }

    return new Response(JSON.stringify({
      success: true,
      items_found: urls.length,
      items_created: created,
      items_updated: updated,
      items_failed: failed,
      items_skipped: skipped,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[catalog-sync] exception:", err);
    if (logId) {
      await supabase.from("catalog_sync_logs").update({
        status: "failed",
        error_message: err.message,
        finished_at: new Date().toISOString(),
      }).eq("id", logId);
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
