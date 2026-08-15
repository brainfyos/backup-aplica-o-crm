// Cliente HTTP fino do Meta Graph API (WhatsApp Cloud).
// Versão fixa para upgrade controlado.

export const GRAPH_VERSION = 'v21.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface GraphErrorShape {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class GraphError extends Error {
  status: number;
  graph?: GraphErrorShape;
  constructor(status: number, message: string, graph?: GraphErrorShape) {
    super(message);
    this.status = status;
    this.graph = graph;
  }
}

export async function graphFetch<T = unknown>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${GRAPH_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const err = (body as { error?: GraphErrorShape })?.error;
    throw new GraphError(res.status, err?.message ?? `Graph ${res.status}`, err);
  }
  return body as T;
}

// HMAC SHA-256 hex (para validar X-Hub-Signature-256 do webhook Meta).
export async function hmacSha256Hex(key: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
