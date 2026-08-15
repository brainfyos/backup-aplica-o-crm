// instagram-send
// Envia DM/comment reply/like. Suporta 2 modos:
//   - page_token (legado): POST graph.facebook.com/{page_id}/messages
//   - ig_user_token (novo): POST graph.instagram.com/{ig_user_id}/messages
// recipient.id = ig_sender_id (PSID/IG-scoped id).
// Detecta janela 24h via RPC is_within_24h_window.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { igGraphFetch, IgGraphError } from '../_shared/ig-graph.ts';
import { igPageGraphFetch } from '../_shared/ig-page-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type IgFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

/** Retorna um fetcher que já embute o token e o base URL correto do modo da conexão.
 *  No modo `ig_user_token` o `ownerId` é o IG User ID (o que `/me` devolve em graph.instagram.com),
 *  NÃO o `ig_business_account_id` herdado do graph.facebook.com. Se a coluna estiver vazia
 *  (conexão antiga), descobrimos via `/me` e fazemos self-heal na tabela.
 */
async function buildFetcher(
  sb: any,
  conn: any,
): Promise<{ fetcher: IgFetcher; ownerId: string; mode: 'page_token' | 'ig_user_token' }> {
  if (conn.ig_auth_style === 'ig_user_token') {
    if (!conn.ig_user_access_token_encrypted) throw new Error('conexão sem IG User Access Token');
    const token = await decryptSecret(conn.ig_user_access_token_encrypted);
    const fetcher: IgFetcher = (path, init = {}) => igGraphFetch(path, token, init);
    let ownerId: string | null = conn.ig_user_id ? String(conn.ig_user_id) : null;
    if (!ownerId) {
      try {
        const me = await igGraphFetch<any>(`/me?fields=id,user_id`, token);
        ownerId = String(me?.id ?? me?.user_id ?? '');
        if (ownerId) {
          await sb.from('instagram_connections').update({ ig_user_id: ownerId }).eq('id', conn.id);
          console.log('[instagram-send] self-heal ig_user_id', { connection_id: conn.id, ig_user_id: ownerId });
        }
      } catch (e) {
        console.error('[instagram-send] /me lookup failed', e);
      }
      if (!ownerId) ownerId = String(conn.ig_business_account_id);
    }
    return { fetcher, ownerId, mode: 'ig_user_token' };
  }
  if (!conn.page_access_token_encrypted) {
    const err = new Error('conexão sem Page Access Token') as any;
    err.reason = 'missing_page_token';
    throw err;
  }
  if (!conn.fb_page_id) {
    const err = new Error('FACEBOOK_PAGE_ID_MISSING') as any;
    err.reason = 'fb_page_id_missing';
    throw err;
  }
  const token = await decryptSecret(conn.page_access_token_encrypted);
  // Facebook Page mode follows the isolated Instagram Page Graph v25.0 client.
  // Do not use meta-graph here: that helper is intentionally pinned to the
  // WhatsApp Graph version and caused this request to diverge from the proven
  // Page Messaging request.
  const fetcher: IgFetcher = (path, init = {}) => igPageGraphFetch(path, token, init);
  return { fetcher, ownerId: String(conn.fb_page_id), mode: 'page_token' };
}

function maskId(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v);
  if (s.length <= 4) return '****';
  return `${s.slice(0, 2)}***${s.slice(-3)}`;
}


Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const request_id = crypto.randomUUID().slice(0, 8);
  console.log('[instagram-send] request_received', {
    request_id,
    method: req.method,
    has_auth: !!req.headers.get('Authorization'),
    ct: req.headers.get('content-type'),
  });

  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed', stage: 'method_check', request_id }, 405);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized', stage: 'auth_check', request_id }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(
      supabaseUrl,
      serviceKey,
    );

    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      console.warn('[instagram-send] request_bad_json', { request_id, err: String(e) });
      return json({ error: 'invalid_json', stage: 'parse_body', request_id }, 400);
    }

    const bearerToken = authHeader.slice('Bearer '.length).trim();
    const isInternalCall = bearerToken === serviceKey;
    let callerUserId: string | null = null;
    if (!isInternalCall) {
      const authClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(bearerToken);
      callerUserId = claimsError ? null : String(claimsData?.claims?.sub ?? '') || null;
      if (!callerUserId) {
        console.warn('[instagram-send] auth_rejected', { request_id, reason: 'invalid_bearer' });
        return json({ error: 'Unauthorized', stage: 'auth_check', request_id }, 401);
      }
    }

    const authorizeConnection = async (conn: any): Promise<Response | null> => {
      if (isInternalCall) return null;
      const [{ data: membership }, { data: profile }, { data: roles }] = await Promise.all([
        sb.from('user_organizations').select('id').eq('user_id', callerUserId).eq('organization_id', conn.organization_id).maybeSingle(),
        sb.from('profiles').select('id').eq('id', callerUserId).eq('organization_id', conn.organization_id).maybeSingle(),
        sb.from('user_roles').select('role').eq('user_id', callerUserId).eq('role', 'super_admin').limit(1),
      ]);
      if (membership || profile || (roles?.length ?? 0) > 0) return null;
      console.warn('[instagram-send] auth_rejected', { request_id, reason: 'org_forbidden', connection_id: conn.id });
      return json({ error: 'Forbidden', stage: 'authorization', request_id }, 403);
    };

  const {
    connection_id,
    organization_id,
    conversation_id,
    recipient_id,
    text,
    media,
    tag,
    type,
    comment_id,
    quick_replies,
    buttons,
    sender_ig_id,
    sender_name,
    skip_db_insert,
  } = body ?? {};

  const sendType: string = type || 'dm';

  // --- COMMENT REPLY (público) ---
  if (sendType === 'comment_reply') {
    if (!connection_id || !comment_id || !text) return json({ error: 'connection_id, comment_id e text são obrigatórios' }, 400);
    const { data: conn } = await sb.from('instagram_connections').select('*').eq('id', connection_id).maybeSingle();
    if (!conn) return json({ error: 'connection not found' }, 404);
    const authError = await authorizeConnection(conn);
    if (authError) return authError;
    try {
      const { fetcher } = await buildFetcher(sb, conn);
      const res = await fetcher<any>(`/${comment_id}/replies?message=${encodeURIComponent(String(text))}`, { method: 'POST' });
      await sb.from('instagram_comment_replies').upsert({
        connection_id, comment_id, replied_public: true,
      }, { onConflict: 'connection_id,comment_id' });
      return json({ ok: true, comment_reply_id: (res as any)?.id ?? null });
    } catch (e) {
      const ge = e as GraphError | IgGraphError;
      return json({ error: (ge as any).graph?.message ?? String(e) }, (ge as any).status ?? 500);
    }
  }

  // --- LIKE COMMENT ---
  if (sendType === 'like_comment') {
    if (!connection_id || !comment_id) return json({ error: 'connection_id e comment_id são obrigatórios' }, 400);
    const { data: conn } = await sb.from('instagram_connections').select('*').eq('id', connection_id).maybeSingle();
    if (!conn) return json({ error: 'connection not found' }, 404);
    const authError = await authorizeConnection(conn);
    if (authError) return authError;
    console.log('[instagram-send] like_comment_start', {
      connection_id,
      comment_id,
      ig_auth_style: conn.ig_auth_style,
      has_ig_user_id: !!conn.ig_user_id,
      has_ig_user_token: !!conn.ig_user_access_token_encrypted,
      has_page_token: !!conn.page_access_token_encrypted,
    });
    try {
      const { data: existingLike } = await sb.from('instagram_comment_replies')
        .select('liked').eq('connection_id', connection_id).eq('comment_id', comment_id).maybeSingle();
      if (existingLike?.liked === true) {
        console.log('[instagram-send] like_comment_already_liked', { connection_id, comment_id });
        return json({ ok: true, success: true, already_liked: true });
      }

      let likeResult: any = null;
      if (conn.ig_auth_style === 'ig_user_token') {
        // Instagram API with Instagram Login: POST graph.instagram.com/{ig_user_id}/likes?comment_id=...
        if (!conn.ig_user_access_token_encrypted) throw new Error('conexão sem IG User Access Token');
        const token = await decryptSecret(conn.ig_user_access_token_encrypted);
        let ownerId: string | null = conn.ig_user_id ? String(conn.ig_user_id) : null;
        if (!ownerId) {
          const me = await igGraphFetch<any>(`/me?fields=id,user_id`, token);
          ownerId = String(me?.id ?? me?.user_id ?? '');
          if (ownerId) await sb.from('instagram_connections').update({ ig_user_id: ownerId }).eq('id', conn.id);
        }
        if (!ownerId) throw new Error('não foi possível resolver ig_user_id');
        const path = `/${encodeURIComponent(ownerId)}/likes?comment_id=${encodeURIComponent(String(comment_id))}`;
        console.log('[instagram-send] like_comment_dispatch', { host: 'graph.instagram.com', ownerId, comment_id, mode: 'ig_user_token' });
        likeResult = await igGraphFetch<any>(path, token, { method: 'POST' });
      } else {
        // Page Token (Facebook Login, Graph v25.0):
        // POST graph.facebook.com/v25.0/{ig_user_id}/likes?comment_id=...
        if (!conn.page_access_token_encrypted) throw new Error('conexão sem Page Access Token');
        if (!conn.ig_business_account_id) throw new Error('conexão sem Instagram Business Account ID');
        const token = await decryptSecret(conn.page_access_token_encrypted);
        const ownerId = String(conn.ig_business_account_id);
        const path = `/${encodeURIComponent(ownerId)}/likes?comment_id=${encodeURIComponent(String(comment_id))}`;
        console.log('[instagram-send] like_comment_dispatch', { host: 'graph.facebook.com/v25.0', ownerId, comment_id, mode: 'page_token' });
        likeResult = await igPageGraphFetch<any>(path, token, { method: 'POST' });
      }
      console.log('[instagram-send] like_comment_result', {
        success: likeResult?.success === true,
        body: JSON.stringify(likeResult ?? {}).slice(0, 300),
      });
      if (likeResult?.success !== true) {
        throw new Error(`Instagram não confirmou a curtida: ${JSON.stringify(likeResult ?? {})}`);
      }
      await sb.from('instagram_comment_replies').upsert({
        connection_id, comment_id, liked: true,
      }, { onConflict: 'connection_id,comment_id' });
      console.log('[instagram-send] like_comment_success', { connection_id, comment_id });
      return json({ ok: true, success: true });
    } catch (e) {
      const ge = e as any;
      const graph = ge?.graph;
      const message = graph?.message ?? String(e);
      console.error('[instagram-send] like_comment_error', {
        status: ge?.status, code: graph?.code, subcode: graph?.error_subcode,
        message: String(message).slice(0, 300), fbtrace_id: graph?.fbtrace_id,
      });
      return json({
        error: message,
        code: graph?.code,
        subcode: graph?.error_subcode,
        hint: /permission|Permissions|scope/i.test(String(message))
          ? 'Verifique se o token possui instagram_manage_comments (ou pages_read_engagement no modo Página) e se o App Review foi aprovado.'
          : undefined,
      }, ge?.status ?? 500);
    }
  }




  let connId = connection_id;
  let toId = recipient_id;

  console.log('[instagram-send] dm_start', {
    connection_id: connId ?? null,
    conversation_id: conversation_id ?? null,
    has_recipient: !!toId,
    send_type: sendType,
    tag: tag ?? null,
    has_comment_id: !!comment_id,
  });

  if (conversation_id && (!connId || !toId)) {
    const { data: conv } = await sb
      .from('webchat_conversations')
      .select('instagram_connection_id, ig_sender_id, organization_id')
      .eq('id', conversation_id)
      .maybeSingle();
    if (!conv) {
      console.warn('[instagram-send] dm_early_return', { reason: 'conversation_not_found', conversation_id });
      return json({ error: 'conversation not found' }, 404);
    }
    connId = connId ?? conv.instagram_connection_id;
    toId = toId ?? conv.ig_sender_id;
    console.log('[instagram-send] dm_resolved_from_conversation', {
      conversation_id, connId, has_recipient: !!toId,
    });
  }

  if (!connId) {
    console.warn('[instagram-send] dm_early_return', { reason: 'missing_connection_id', conversation_id });
    return json({ error: 'missing connection_id' }, 400);
  }
  if (sendType !== 'private_reply' && !toId) {
    console.warn('[instagram-send] dm_early_return', { reason: 'INSTAGRAM_RECIPIENT_IGSID_MISSING', conversation_id, connId, send_type: sendType });
    return json({ error: 'INSTAGRAM_RECIPIENT_IGSID_MISSING', message: 'IGSID do destinatário ausente na conversa.', stage: 'validate_recipient', request_id }, 422);
  }

  if (sendType === 'private_reply' && !comment_id) {
    console.warn('[instagram-send] dm_early_return', { reason: 'private_reply_missing_comment_id', connId });
    return json({ error: 'private_reply requer comment_id' }, 400);
  }

  const { data: conn, error: connErr } = await sb
    .from('instagram_connections')
    .select('*')
    .eq('id', connId)
    .maybeSingle();
  if (connErr || !conn) {
    console.warn('[instagram-send] dm_early_return', { reason: 'connection_not_found', connId, err: connErr?.message });
    return json({ error: 'connection not found' }, 404);
  }
  const authError = await authorizeConnection(conn);
  if (authError) return authError;
  if (organization_id && conn.organization_id !== organization_id) {
    console.warn('[instagram-send] dm_early_return', { reason: 'org_mismatch', connId, expected: organization_id, actual: conn.organization_id });
    return json({ error: 'org mismatch' }, 403);
  }
  {
    const { assertOrgActive } = await import('../_shared/org-status.ts');
    const guard = await assertOrgActive(sb, conn.organization_id);
    if (!guard.ok) {
      console.warn('[instagram-send] dm_early_return', { reason: 'org_guard_failed', connId, status: guard.status, body: guard.body });
      return json(guard.body, guard.status);
    }
  }
  if (conn.status !== 'active') {
    console.warn('[instagram-send] dm_early_return', { reason: 'connection_inactive', connId, status: conn.status });
    return json({ error: `connection inactive` }, 422);
  }

  if (sendType === 'dm' && conversation_id && !tag) {
    const { data: ok, error: rpcErr } = await sb.rpc('is_within_24h_window', { _conversation_id: conversation_id });
    console.log('[instagram-send] dm_24h_check', { conversation_id, within_window: ok, rpc_error: rpcErr?.message ?? null });
    if (ok === false) {
      console.warn('[instagram-send] dm_early_return', { reason: 'out_of_window', conversation_id, connId });
      return json({
        error: 'OUT_OF_WINDOW',
        message: 'Fora da janela de 24h do Instagram. Aguarde o usuário enviar uma mensagem ou interagir com a Opening DM.',
      }, 422);
    }
  }

  let fetcherBundle: { fetcher: IgFetcher; ownerId: string; mode: string };
  try {
    fetcherBundle = await buildFetcher(sb, conn);
  } catch (e: any) {
    const reason = e?.reason ?? 'build_fetcher_error';
    console.error('[instagram-send] dm_early_return', { request_id, reason, connId, ig_auth_style: conn.ig_auth_style, error: String(e?.message ?? e) });
    if (reason === 'fb_page_id_missing') {
      return json({ error: 'FACEBOOK_PAGE_ID_MISSING', message: 'A conexão do Instagram não possui o Facebook Page ID necessário para o envio da mensagem.', hint: 'Reconecte o Instagram (falta Facebook Page ID).', stage: 'build_fetcher', request_id }, 422);
    }
    return json({ error: e?.message ?? 'build_fetcher_error', stage: 'build_fetcher', hint: 'Reconecte a integração do Instagram.', request_id }, 500);
  }

  const { fetcher, ownerId, mode } = fetcherBundle;

  const payload: any = sendType === 'private_reply'
    ? { recipient: { comment_id: String(comment_id) } }
    : {
        recipient: { id: String(toId) },
        // A Page Token DM must match the proven Graph v25.0 payload exactly:
        // ordinary replies carry only recipient + message. Message-tag fields
        // are included solely when a tag was explicitly requested.
        ...((tag || mode === 'ig_user_token')
          ? { messaging_type: tag ? 'MESSAGE_TAG' : 'RESPONSE', ...(tag ? { tag } : {}) }
          : {}),
      };

  const message: any = {};
  if (media?.url) {
    message.attachment = { type: media.type ?? 'image', payload: { url: media.url, is_reusable: false } };
  } else {
    message.text = String(text ?? '');
  }
  if (Array.isArray(quick_replies) && quick_replies.length > 0) {
    message.quick_replies = quick_replies.slice(0, 13).map((q: any) => ({
      content_type: 'text',
      title: String(q.title ?? q.label ?? '').slice(0, 20),
      payload: String(q.payload ?? q.title ?? ''),
    }));
  }
  if (Array.isArray(buttons) && buttons.length > 0) {
    message.attachment = {
      type: 'template',
      payload: {
        template_type: 'button',
        text: String(text ?? '').slice(0, 640) || '.',
        buttons: buttons.slice(0, 3).map((b: any) => {
          const title = String(b.title ?? b.label ?? '').slice(0, 20);
          const url = String(b.url ?? '');
          if (b.type === 'web_url' || url) {
            return { type: 'web_url', title, url };
          }
          return {
            type: 'postback',
            title,
            payload: String(b.payload ?? b.title ?? ''),
          };
        }),
      },
    };
    delete message.text;
  }
  payload.message = message;

  const dispatchLog = {
    request_id,
    mode,
    graph_mode: mode === 'page_token' ? 'FACEBOOK_LOGIN' : 'IG_LOGIN',
    endpoint_resource_type: mode === 'page_token' ? 'PAGE' : 'IG_USER',
    graph_version: mode === 'page_token' ? 'v25.0' : 'instagram-login',
    resource_id_masked: maskId(ownerId),
    recipient_id_masked: maskId(toId as string | null),
    send_type: sendType,
    tag: tag ?? null,
    has_media: !!media?.url,
    endpoint: `/${ownerId}/messages`,
  };
  console.log('[instagram-send] dm_dispatch', dispatchLog);

  let res: any;
  try {
    res = await fetcher(`/${ownerId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    console.log('[instagram-send] dm_success', { request_id, mode, ownerId: maskId(ownerId), message_id: (res as any)?.message_id ?? null });

  } catch (e) {
    const ge = e as GraphError | IgGraphError;
    const graph = (ge as any).graph;
    const msg = graph?.message ?? String(e);
    const code = graph?.code;
    const subcode = graph?.error_subcode;
    const fbtrace_id = graph?.fbtrace_id;
    // 100 = "Unsupported get/post request" — geralmente owner id errado (IG User ID vs IGBA legado)
    const idLikelyStale = code === 100 || /Unsupported\s+get\/post\s+request/i.test(String(msg));
    const isPermission = /permission|Permissions|scope|OAuth/i.test(String(msg)) || code === 10 || code === 200 || code === 190;
    const isRecipientOut = code === 551 || /recipient|not a valid|cannot message/i.test(String(msg));
    let hint: string | undefined;
    if (isPermission) {
      hint = mode === 'page_token'
        ? 'Reconecte a página concedendo instagram_manage_messages e pages_messaging (login como admin da página).'
        : 'Reconecte o Instagram concedendo instagram_business_manage_messages.';
    } else if (idLikelyStale && conn.ig_auth_style === 'ig_user_token') {
      hint = 'IG User ID pode estar desatualizado. Abra Integrações → Instagram → Testar para reconciliar o ID, ou reconecte a conta.';
    } else if (isRecipientOut) {
      hint = 'Instagram rejeitou o destinatário. Aguarde uma nova mensagem do lead ou reconecte a conta.';
    }
    const http_status = (ge as any).status ?? 500;
    console.error('[instagram-send] dm_error', {
      request_id, mode, ownerId: maskId(ownerId), http_status, code, subcode, fbtrace_id,
      message: String(msg).slice(0, 300),
    });
    // Se aparentar ID errado, força novo lookup na próxima chamada
    if (idLikelyStale && conn.ig_auth_style === 'ig_user_token' && conn.ig_user_id) {
      await sb.from('instagram_connections').update({ ig_user_id: null }).eq('id', conn.id);
    }
    if (conversation_id && !skip_db_insert) {
      await sb.from('webchat_messages').insert({
        conversation_id,
        direction: 'outbound',
        sender_type: 'agent',
        content: text ?? '[mídia]',
        content_type: 'text',
        metadata: { delivery_status: 'failed', error: msg, code, subcode, fbtrace_id, hint, http_status, request_id },
      });
    }
    return json({ error: 'META_API_ERROR', message: msg, code, subcode, fbtrace_id, hint, http_status, stage: 'meta_dispatch', request_id }, http_status);
  }


  const mid = res?.message_id ?? null;

  // Se private_reply e temos sender_ig_id, resolvemos/creamos a conversa para
  // registrar a mensagem enviada no inbox Conversas.
  let effectiveConvId: string | null = conversation_id ?? null;
  if (sendType === 'private_reply') {
    await sb.from('instagram_comment_replies').upsert({
      connection_id: connId, comment_id, replied_private: true,
    }, { onConflict: 'connection_id,comment_id' });

    if (!effectiveConvId && sender_ig_id) {
      try {
        effectiveConvId = await upsertConversationForSender(sb, conn, String(sender_ig_id), sender_name ?? null);
      } catch (e) {
        console.error('[instagram-send] upsert conv for private_reply failed', e);
      }
    }
  }

  if (effectiveConvId && !skip_db_insert) {
    await sb.from('webchat_messages').insert({
      conversation_id: effectiveConvId,
      direction: 'outbound',
      sender_type: 'agent',
      content: text ?? (media?.url ?? '[mídia]'),
      content_type: media?.url ? (media.type === 'image' ? 'image' : media.type === 'audio' ? 'audio' : 'file') : 'text',
      message_type: media?.type ?? 'text',
      ig_message_id: mid,
      metadata: {
        delivery_status: 'sent',
        send_type: sendType,
        ...(sendType === 'private_reply' ? { trigger_comment_id: comment_id } : {}),
        ...(media ? { media } : {}),
      },
    });
    await sb.from('webchat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', effectiveConvId);
  } else if (effectiveConvId && skip_db_insert) {
    // Só atualiza last_message_at — a bolha já foi inserida pelo caller (webchat-bot).
    await sb.from('webchat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', effectiveConvId);
  }

  return json({ ok: true, ig_message_id: mid, conversation_id: effectiveConvId, request_id });
  } catch (e: any) {
    console.error('[instagram-send] handler_exception', { request_id, error: String(e?.message ?? e), stack: String(e?.stack ?? '').slice(0, 400) });
    return json({ error: 'HANDLER_EXCEPTION', message: String(e?.message ?? e), stage: 'handler_exception', request_id }, 500);
  }
});


async function upsertConversationForSender(sb: any, conn: any, senderIgId: string, senderName: string | null): Promise<string> {
  const { data: existing } = await sb
    .from('webchat_conversations')
    .select('id')
    .eq('organization_id', conn.organization_id)
    .eq('channel', 'instagram')
    .eq('instagram_connection_id', conn.id)
    .eq('ig_sender_id', senderIgId)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: widget } = await sb
    .from('webchat_widgets')
    .select('id')
    .eq('organization_id', conn.organization_id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await sb.from('webchat_conversations').insert({
    organization_id: conn.organization_id,
    widget_id: widget?.id ?? null,
    channel: 'instagram',
    status: 'bot_active',
    visitor_id: crypto.randomUUID(),
    visitor_name: senderName || `Instagram ${senderIgId.slice(-4)}`,
    instagram_connection_id: conn.id,
    ig_sender_id: senderIgId,
    last_message_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;
  return created.id;
}


function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
