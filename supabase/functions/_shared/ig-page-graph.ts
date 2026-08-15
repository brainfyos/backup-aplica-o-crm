// Cliente isolado para a integração Instagram via Facebook Login + Page Access Token.
// Fixo em Graph v25.0 conforme PRD. Não compartilha versão com o WhatsApp (que
// segue em v21.0 via `_shared/meta-graph.ts`).

export const IG_PAGE_GRAPH_VERSION = 'v25.0';
export const IG_PAGE_GRAPH_BASE = `https://graph.facebook.com/${IG_PAGE_GRAPH_VERSION}`;

export interface IgPageGraphErrorShape {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class IgPageGraphError extends Error {
  status: number;
  graph?: IgPageGraphErrorShape;
  constructor(status: number, message: string, graph?: IgPageGraphErrorShape) {
    super(message);
    this.status = status;
    this.graph = graph;
  }
}

export async function igPageGraphFetch<T = unknown>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${IG_PAGE_GRAPH_BASE}${path}`;
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
    const err = (body as { error?: IgPageGraphErrorShape })?.error;
    throw new IgPageGraphError(res.status, err?.message ?? `Graph ${res.status}`, err);
  }
  return body as T;
}

export interface DebugTokenInfo {
  type: string | null;        // 'USER' | 'PAGE' | 'SYSTEM_USER' | ...
  app_id: string | null;
  scopes: string[];
  expires_at: number | null;             // epoch seconds
  data_access_expires_at: number | null; // epoch seconds
  user_id: string | null;
  raw: any;
}

/** Debug token via /debug_token — usa app_id|app_secret como bearer. */
export async function debugAccessToken(
  inputToken: string,
  appId: string,
  appSecret: string,
): Promise<DebugTokenInfo | null> {
  try {
    const url = `${IG_PAGE_GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const res = await fetch(url);
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || !body?.data) return null;
    const d = body.data;
    return {
      type: d.type ?? null,
      app_id: d.app_id ?? null,
      scopes: Array.isArray(d.scopes) ? d.scopes : [],
      expires_at: d.expires_at ?? null,
      data_access_expires_at: d.data_access_expires_at ?? null,
      user_id: d.user_id ? String(d.user_id) : null,
      raw: d,
    };
  } catch (e) {
    console.error('[ig-page-graph] debug_token failed', String(e));
    return null;
  }
}

export interface PageEntry {
  id: string;
  name: string | null;
  access_token: string;
  instagram_business_account?: { id: string } | null;
}

/** Lista páginas via /me/accounts com o Page Access Token embutido. */
export async function listPagesForUserToken(userToken: string): Promise<PageEntry[]> {
  const out: PageEntry[] = [];
  let url = `${IG_PAGE_GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100`;
  // paginação simples
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${userToken}` } });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message ?? `Graph ${res.status}`;
      throw new IgPageGraphError(res.status, msg, body?.error);
    }
    for (const p of body?.data ?? []) {
      out.push({
        id: String(p.id),
        name: p.name ?? null,
        access_token: String(p.access_token ?? ''),
        instagram_business_account: p.instagram_business_account ?? null,
      });
    }
    const next = body?.paging?.next as string | undefined;
    if (!next) break;
    url = next;
  }
  return out;
}
