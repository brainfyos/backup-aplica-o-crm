const URL_RE = /https?:\/\/[^\s<>()\[\]"']+/gi;

export const UNVERIFIED_LINK_FALLBACK =
  'Não encontrei um link oficial confirmado na base agora. Vou confirmar com a equipe antes de te enviar.';

function stripTrailingPunctuation(value) {
  return String(value || '').replace(/[.,;!?]+$/, '');
}

export function normalizeApprovedUrl(value) {
  const raw = stripTrailingPunctuation(value).trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname === '/') parsed.pathname = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function extractUrls(value) {
  const urls = new Set();
  const visit = (item) => {
    if (typeof item === 'string') {
      for (const match of item.match(URL_RE) || []) {
        const normalized = normalizeApprovedUrl(match);
        if (normalized) urls.add(normalized);
      }
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value);
  return [...urls];
}

function collectUrlFields(value, parentKey = '') {
  const urls = new Set();
  const visit = (item, key) => {
    if (typeof item === 'string') {
      if (/(?:url|link)$/i.test(key)) extractUrls(item).forEach((url) => urls.add(url));
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, key));
      return;
    }
    if (!item || typeof item !== 'object') return;
    Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(value, parentKey);
  return [...urls];
}

/**
 * Builds an allowlist only from structured, operator-controlled URL fields.
 * Free-form prompts, chat history and model output must never be passed here.
 */
export function collectApprovedUrls({ ctas = [], materials = [], toolConfigs = null, explicit = [] } = {}) {
  const approved = new Set();
  const add = (values) => extractUrls(values).forEach((url) => approved.add(url));

  for (const cta of Array.isArray(ctas) ? ctas : []) {
    add([cta?.action_url, cta?.video_url]);
  }
  for (const material of Array.isArray(materials) ? materials : []) {
    add([material?.url, material?.file_url]);
  }
  collectUrlFields(toolConfigs).forEach((url) => approved.add(url));
  add(explicit);
  return [...approved];
}

/**
 * Fail closed: if the model produced even one URL absent from the official
 * registry, discard the whole answer. Keeping surrounding promises such as
 * “vou enviar o vídeo real” would still mislead the customer.
 */
export function guardOutboundUrls(text, approvedUrls = [], fallback = UNVERIFIED_LINK_FALLBACK) {
  const source = String(text || '');
  const found = extractUrls(source);
  if (!found.length) return { text: source, blocked: [], altered: false };

  const approved = new Set(
    (Array.isArray(approvedUrls) ? approvedUrls : [])
      .map(normalizeApprovedUrl)
      .filter(Boolean),
  );
  const blocked = found.filter((url) => !approved.has(url));
  if (!blocked.length) return { text: source, blocked: [], altered: false };

  return { text: fallback, blocked, altered: true };
}
