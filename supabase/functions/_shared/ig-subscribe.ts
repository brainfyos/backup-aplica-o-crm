// Helper compartilhado para inscrever campos do webhook em uma Página do Facebook
// vinculada a uma conta Instagram Business. Faz debug_token + tentativa em lote,
// fallback campo-a-campo e leitura final via GET /subscribed_apps.

import { graphFetch, GraphError, GRAPH_VERSION } from './meta-graph.ts';

export const IG_SUBSCRIBED_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_reactions',
  'feed',
  'mention',
];

export interface FieldFailure {
  field: string;
  code?: number;
  subcode?: number;
  message: string;
}

export interface SubscribeResult {
  granted: string[];             // fonte de verdade: GET /subscribed_apps
  attempted: string[];           // campos que tentamos
  failed: FieldFailure[];        // campos que a Meta rejeitou individualmente
  token_scopes: string[] | null; // escopos que o debug_token reportou
  missing_scopes: string[];      // escopos esperados que não estão no token
  error_summary: string | null;
}

const SCOPE_HINTS: Record<string, string[]> = {
  messages: ['instagram_manage_messages', 'pages_messaging'],
  messaging_postbacks: ['instagram_manage_messages', 'pages_messaging'],
  message_reactions: ['instagram_manage_messages', 'pages_messaging'],
  feed: ['pages_read_engagement'],
  mention: ['instagram_manage_comments'],
};

function explainGraphFailure(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('page access token is required') || lower.includes('token de acesso à página')) {
    return 'O token usado não é um Page Access Token válido para esta Página. Gere um token da Página no Facebook/Graph API Explorer e confirme no Access Token Debugger que Type = PAGE.';
  }
  return message;
}

async function debugToken(pageAccessToken: string, appId: string, appSecret: string): Promise<string[] | null> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(pageAccessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[ig-subscribe] debug_token failed', body);
      return null;
    }
    const scopes = body?.data?.scopes;
    return Array.isArray(scopes) ? scopes : null;
  } catch (e) {
    console.error('[ig-subscribe] debug_token threw', String(e));
    return null;
  }
}

async function readSubscribed(fbPageId: string, pageAccessToken: string): Promise<string[]> {
  try {
    const res = await graphFetch<any>(`/${fbPageId}/subscribed_apps`, pageAccessToken);
    const rows = Array.isArray(res?.data) ? res.data : [];
    // Meta pode devolver várias apps; unificamos os fields
    const fields = new Set<string>();
    for (const row of rows) {
      const list = row?.subscribed_fields;
      if (Array.isArray(list)) list.forEach((f: string) => fields.add(f));
    }
    return Array.from(fields);
  } catch (e) {
    console.error('[ig-subscribe] read subscribed_apps failed', (e as GraphError).graph ?? String(e));
    return [];
  }
}

export async function subscribeIgWebhookFields(opts: {
  fb_page_id: string;
  page_access_token: string;
  app_id?: string;
  app_secret?: string;
  fields?: string[];
}): Promise<SubscribeResult> {
  const fields = opts.fields ?? IG_SUBSCRIBED_FIELDS;
  const failed: FieldFailure[] = [];

  const tokenScopes = opts.app_id && opts.app_secret
    ? await debugToken(opts.page_access_token, opts.app_id, opts.app_secret)
    : null;

  console.log('[ig-subscribe] start', {
    fb_page_id: opts.fb_page_id,
    fields,
    token_scopes: tokenScopes,
  });

  // Tenta em lote primeiro
  let batchOk = false;
  try {
    await graphFetch(
      `/${opts.fb_page_id}/subscribed_apps?subscribed_fields=${fields.join(',')}`,
      opts.page_access_token,
      { method: 'POST' },
    );
    batchOk = true;
  } catch (e) {
    const ge = e as GraphError;
    console.error('[ig-subscribe] batch failed', {
      status: ge.status,
      code: ge.graph?.code,
      subcode: ge.graph?.error_subcode,
      message: ge.graph?.message,
      fbtrace_id: ge.graph?.fbtrace_id,
    });
  }

  // Se falhou em lote, tenta campo a campo para saber quais passam
  if (!batchOk) {
    for (const field of fields) {
      try {
        await graphFetch(
          `/${opts.fb_page_id}/subscribed_apps?subscribed_fields=${field}`,
          opts.page_access_token,
          { method: 'POST' },
        );
      } catch (e) {
        const ge = e as GraphError;
        failed.push({
          field,
          code: ge.graph?.code,
          subcode: ge.graph?.error_subcode,
          message: explainGraphFailure(ge.graph?.message ?? String(e)),
        });
        console.error('[ig-subscribe] field failed', {
          field,
          code: ge.graph?.code,
          subcode: ge.graph?.error_subcode,
          message: ge.graph?.message,
        });
      }
    }
  }

  // Fonte de verdade: o que a Meta diz que está inscrito
  const granted = await readSubscribed(opts.fb_page_id, opts.page_access_token);
  console.log('[ig-subscribe] result', { batchOk, granted, failed_count: failed.length });

  // Se algum campo do plano ficou de fora, considera falha (mesmo que batch tenha retornado 200 —
  // Meta às vezes aceita e dropa silenciosamente por falta de permissão)
  const missingFromGranted = fields.filter(f => !granted.includes(f));
  if (missingFromGranted.length && !failed.length) {
    // Batch "OK" mas nada gravou → provável escopo faltando
    for (const field of missingFromGranted) {
      failed.push({
        field,
        message: 'Meta aceitou o POST mas o campo não aparece em GET /subscribed_apps — provavelmente escopo do token não cobre este field.',
      });
    }
  }

  const neededScopes = new Set<string>();
  for (const f of failed) (SCOPE_HINTS[f.field] ?? []).forEach(s => neededScopes.add(s));
  const missing_scopes = tokenScopes
    ? Array.from(neededScopes).filter(s => !tokenScopes.includes(s))
    : Array.from(neededScopes);

  const error_summary = failed.length
    ? `Falharam: ${failed.map(f => f.field).join(', ')}${missing_scopes.length ? ` — token sem: ${missing_scopes.join(', ')}` : ''}`
    : null;

  return {
    granted,
    attempted: fields,
    failed,
    token_scopes: tokenScopes,
    missing_scopes,
    error_summary,
  };
}
