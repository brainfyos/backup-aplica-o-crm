// Cliente HTTP para o novo padrão "Instagram API with Instagram Login".
// Base: https://graph.instagram.com/v21.0
// Usa Instagram User Access Token (System User / IG Business Login).
// Endpoints são keyed por IG User ID (não por Facebook Page ID).

export const IG_GRAPH_VERSION = 'v21.0';
export const IG_GRAPH_BASE = `https://graph.instagram.com/${IG_GRAPH_VERSION}`;

export interface IgGraphErrorShape {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class IgGraphError extends Error {
  status: number;
  graph?: IgGraphErrorShape;
  constructor(status: number, message: string, graph?: IgGraphErrorShape) {
    super(message);
    this.status = status;
    this.graph = graph;
  }
}

export async function igGraphFetch<T = unknown>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${IG_GRAPH_BASE}${path}`;
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
    const err = (body as { error?: IgGraphErrorShape })?.error;
    throw new IgGraphError(res.status, err?.message ?? `IG Graph ${res.status}`, err);
  }
  return body as T;
}

export const IG_SUBSCRIBED_FIELDS_NEW = [
  'messages',
  'messaging_postbacks',
  'message_reactions',
  'comments',
  'mentions',
];

export interface IgSubscribeResult {
  granted: string[];
  attempted: string[];
  failed: { field: string; code?: number; subcode?: number; message: string }[];
  error_summary: string | null;
}

async function readSubscribed(igUserId: string, token: string): Promise<string[]> {
  try {
    const res = await igGraphFetch<any>(`/${igUserId}/subscribed_apps`, token);
    const rows = Array.isArray(res?.data) ? res.data : [];
    const fields = new Set<string>();
    for (const row of rows) {
      const list = row?.subscribed_fields;
      if (Array.isArray(list)) list.forEach((f: string) => fields.add(f));
    }
    return Array.from(fields);
  } catch (e) {
    console.error('[ig-graph] read subscribed_apps failed', (e as IgGraphError).graph ?? String(e));
    return [];
  }
}

/**
 * Inscreve os campos do webhook via /{ig_user_id}/subscribed_apps.
 * Faz POST em lote e, se falhar, tenta campo a campo.
 * Lê de volta com GET para confirmar o que a Meta efetivamente gravou.
 */
export async function igSubscribeWebhookFields(opts: {
  ig_user_id: string;
  ig_user_token: string;
  fields?: string[];
}): Promise<IgSubscribeResult> {
  const fields = opts.fields ?? IG_SUBSCRIBED_FIELDS_NEW;
  const failed: IgSubscribeResult['failed'] = [];

  console.log('[ig-graph] subscribe start', { ig_user_id: opts.ig_user_id, fields });

  let batchOk = false;
  try {
    await igGraphFetch(
      `/${opts.ig_user_id}/subscribed_apps?subscribed_fields=${fields.join(',')}`,
      opts.ig_user_token,
      { method: 'POST' },
    );
    batchOk = true;
  } catch (e) {
    const ge = e as IgGraphError;
    console.error('[ig-graph] batch failed', {
      status: ge.status,
      code: ge.graph?.code,
      subcode: ge.graph?.error_subcode,
      message: ge.graph?.message,
      fbtrace_id: ge.graph?.fbtrace_id,
    });
  }

  if (!batchOk) {
    for (const field of fields) {
      try {
        await igGraphFetch(
          `/${opts.ig_user_id}/subscribed_apps?subscribed_fields=${field}`,
          opts.ig_user_token,
          { method: 'POST' },
        );
      } catch (e) {
        const ge = e as IgGraphError;
        failed.push({
          field,
          code: ge.graph?.code,
          subcode: ge.graph?.error_subcode,
          message: ge.graph?.message ?? String(e),
        });
      }
    }
  }

  const granted = await readSubscribed(opts.ig_user_id, opts.ig_user_token);
  console.log('[ig-graph] subscribe result', { batchOk, granted, failed_count: failed.length });

  const missing = fields.filter(f => !granted.includes(f));
  if (missing.length && !failed.length) {
    for (const field of missing) {
      failed.push({
        field,
        message: 'Meta aceitou o POST mas o campo não aparece em GET /subscribed_apps — provavelmente o token do IG não tem escopo para este field.',
      });
    }
  }

  const error_summary = failed.length
    ? `Falharam: ${failed.map(f => f.field).join(', ')}`
    : null;

  return { granted, attempted: fields, failed, error_summary };
}
