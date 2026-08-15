// instagram-webhook — receiver público (Meta Instagram Messaging).
// URL: /functions/v1/instagram-webhook/{connection_id}
// GET handshake: ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
// POST events: { object: "instagram", entry: [{ id: <ig_business_account_id>, messaging: [...] }] }
// HMAC SHA-256 validado com app_secret da conexão.
// verify_jwt = false.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { hmacSha256Hex, timingSafeEqual, GRAPH_BASE } from '../_shared/meta-graph.ts';
import { IG_GRAPH_BASE } from '../_shared/ig-graph.ts';
import { decryptSecret, encryptSecret } from '../_shared/meta-crypto.ts';
import { loadPlatformMetaApp } from '../_shared/meta-oauth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

function supa() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

async function acquireConversationLock(sb: SupabaseClient, conversationId: string, ttlMs = 45_000): Promise<string | null> {
  const { data, error } = await sb.rpc('try_acquire_conversation_lock_token', {
    p_conv: conversationId,
    p_ttl_ms: ttlMs,
  });
  if (error) {
    console.error('[ig-webhook] conversation lock unavailable; failing closed', error.message);
    return null;
  }
  return typeof data === 'string' ? data : null;
}

async function releaseConversationLock(sb: SupabaseClient, conversationId: string, lockToken: string): Promise<void> {
  try {
    const { error } = await sb.rpc('release_conversation_lock_token', { p_conv: conversationId, p_lock_token: lockToken });
    if (error) console.error('[ig-webhook] conversation lock release failed', error.message);
  } catch (_) { /* best-effort */ }
}

async function isOwnConnectedInstagramAccount(sb: any, conn: any, senderId: string): Promise<boolean> {
  if (!senderId) return false;
  const { data } = await sb
    .from('instagram_connections')
    .select('id')
    .eq('organization_id', conn.organization_id)
    .eq('ig_business_account_id', senderId)
    .neq('id', conn.id)
    .in('status', ['active', 'partial'])
    .limit(1)
    .maybeSingle();
  return !!data?.id;
}

function flowAuthorizesAgent(flow: any, agentId: string): boolean {
  if (!flow || flow.status !== 'active') return false;
  const blocks = Array.isArray(flow.flow_blocks) ? flow.flow_blocks : [];
  return blocks.some((block: any) =>
    block?.type === 'ai_takeover' && String(block?.data?.agent_id ?? '') === agentId
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractConnectionIdFromPath(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return UUID_RE.test(last) ? last : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const pathConnectionId = extractConnectionIdFromPath(url);

  // ---------- GET handshake ----------
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    // Compat: aceitar ?conn= como fallback caso o usuário tenha colado a URL antiga.
    const connId = pathConnectionId ?? url.searchParams.get('conn');
    if (mode !== 'subscribe' || !token || !challenge || !connId) {
      return new Response('bad request', { status: 400 });
    }
    const sb = supa();
    const { data: conn } = await sb
      .from('instagram_connections')
      .select('id, webhook_verify_token')
      .eq('id', connId)
      .maybeSingle();
    if (!conn || conn.webhook_verify_token !== token) {
      console.log('[ig-verify] reject', { has_path_id: !!pathConnectionId });
      return new Response('forbidden', { status: 403 });
    }
    await sb
      .from('instagram_connections')
      .update({ webhook_subscribed_at: new Date().toISOString() })
      .eq('id', conn.id);
    console.log('[ig-verify] ok', { connection_id: conn.id });
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const rawBody = await req.text();
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return new Response('invalid json', { status: 400 }); }

  if (payload?.object !== 'instagram') {
    return new Response('ok', { status: 200 });
  }

  const sb = supa();
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  // Resolver conexão: prioriza path; fallback resolve pelo entry.id (ig_business_account_id) entre conexões ativas.
  let resolvedConn: any = null;
  if (pathConnectionId) {
    const { data } = await sb
      .from('instagram_connections')
      .select('*')
      .eq('id', pathConnectionId)
      .maybeSingle();
    resolvedConn = data ?? null;
  }

  for (const entry of entries) {
    let conn = resolvedConn;
    if (!conn) {
      const entryId = String(entry?.id ?? '');
      if (!entryId) continue;
      const { data } = await sb
        .from('instagram_connections')
        .select('*')
        .eq('ig_business_account_id', entryId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      conn = data ?? null;
    }
    if (!conn) {
      console.log('[ig-webhook] no connection match', { entry_id: entry?.id });
      continue;
    }

    // Valida HMAC
    let valid = false;
    let sigError: string | null = null;
    let recoveredPlatformSecret = false;
    try {
      let appSecret = conn.app_secret_encrypted
        ? await decryptSecret(conn.app_secret_encrypted)
        : '';

      // Conexões OAuth antigas foram criadas antes de o App Secret ser
      // persistido nelas. Recupera apenas o segredo do app da plataforma e
      // somente quando a conexão declara pertencer ao mesmo App ID. Além de
      // restaurar a entrega imediatamente, faz o backfill para os próximos
      // eventos não dependerem desta consulta.
      if (!appSecret && conn.auth_mode === 'platform_oauth') {
        const platformApp = await loadPlatformMetaApp();
        if (String(conn.app_id ?? '') !== String(platformApp.app_id)) {
          sigError = 'platform_app_mismatch';
        } else {
          appSecret = platformApp.app_secret;
          recoveredPlatformSecret = true;
          await sb.from('instagram_connections').update({
            app_secret_encrypted: await encryptSecret(platformApp.app_secret),
          }).eq('id', conn.id);
        }
      }
      if (!appSecret) {
        sigError = sigError ?? 'app_secret_missing';
      } else {
        const expected = 'sha256=' + (await hmacSha256Hex(appSecret, rawBody));
        valid = sig.length > 0 && timingSafeEqual(sig, expected);
      }
    } catch (e) {
      sigError = String((e as Error)?.message ?? e);
      console.error('[ig-webhook] sig check error', e);
    }
    if (!valid) {
      const eventFingerprint = await fingerprintWebhookEntry(entry);
      const summary = {
        reason: sigError ?? 'HMAC mismatch',
        entry_id: String(entry?.id ?? ''),
        event_fingerprint: eventFingerprint,
        sig_present: sig.length > 0,
        sig_prefix: sig ? sig.slice(0, 16) : null,
        has_messaging: Array.isArray(entry?.messaging) && entry.messaging.length > 0,
        has_changes: Array.isArray(entry?.changes) && entry.changes.length > 0,
        change_fields: Array.isArray(entry?.changes) ? entry.changes.map((c: any) => c?.field).filter(Boolean) : [],
      };
      await recordInvalidSignature(sb, conn, entry, summary, sigError);
      if (sigError === 'app_secret_missing') {
        await sb.from('instagram_connections')
          .update({ status: 'error', last_error: 'app_secret ausente — reconfigure a integração' })
          .eq('id', conn.id);
      }
      // A conexão é conhecida, porém a assinatura pertence a outro App Secret.
      // Confirma o recebimento sem processar o payload para impedir retentativas da Meta.
      return new Response('ignored', { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
    }

    if (
      recoveredPlatformSecret
      || /app_secret|assinatura|hmac/i.test(String(conn.last_error ?? ''))
    ) {
      await sb.from('instagram_connections').update({
        status: conn.status === 'error' ? 'active' : conn.status,
        last_error: null,
      }).eq('id', conn.id);
    }

    // 1) DM events
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const m of messaging) {
      try {
        await handleEvent(sb, conn, m);
      } catch (e) {
        console.error('[ig-webhook] event error', e);
        await sb.from('instagram_webhook_logs').insert({
          connection_id: conn.id,
          organization_id: conn.organization_id,
          event_type: 'event_error',
          payload: m,
          signature_valid: true,
          error: String(e),
        });
      }
    }

    // 2) Comment / mention events (para automações ManyChat-style)
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const ch of changes) {
      try {
        await handleChange(sb, conn, ch);
      } catch (e) {
        console.error('[ig-webhook] change error', e);
        await sb.from('instagram_webhook_logs').insert({
          connection_id: conn.id,
          organization_id: conn.organization_id,
          event_type: 'change_error',
          payload: ch,
          signature_valid: true,
          error: String(e),
        });
      }
    }
  }

  return new Response('ok', { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
});

async function handleEvent(sb: any, conn: any, evt: any) {
  if (evt?.message?.is_echo) return;

  const senderId = String(evt?.sender?.id ?? '');
  if (!senderId) return;

  // Uma organização pode conectar mais de um perfil próprio. Quando um perfil
  // envia DM para o outro, a Meta entrega a mensagem como inbound comum no
  // segundo webhook. Sem esta trava, dois agentes se respondem infinitamente.
  if (await isOwnConnectedInstagramAccount(sb, conn, senderId)) {
    console.warn('[ig-webhook] own-account echo blocked', {
      connection_id: conn.id,
      sender_id: senderId,
    });
    await sb.from('instagram_webhook_logs').insert({
      connection_id: conn.id,
      organization_id: conn.organization_id,
      event_type: 'own_account_echo_blocked',
      payload: { sender_id: senderId, message_id: evt?.message?.mid ?? null },
      signature_valid: true,
    });
    return;
  }

  if (evt?.reaction) {
    await handleReactionEvent(sb, conn, evt, senderId);
    return;
  }

  const postback = evt?.postback ?? null;
  const msg = evt.message ?? (postback ? {
    mid: postback.mid ?? null,
    text: postback.title ?? postback.payload ?? 'Continuar',
    quick_reply: { payload: postback.payload ?? '' },
  } : {});
  const mid = String(msg?.mid ?? '');
  if (!mid && !msg?.text && !msg?.attachments && !msg?.reaction && !postback) return;

  // 1) localizar conversa desta caixa Instagram específica (incluindo 'closed')
  //    - filtra por instagram_connection_id (caixa isolada)
  //    - se estiver 'closed', reabre para preservar histórico do lead
  const { data: existing } = await sb
    .from('webchat_conversations')
    .select('id, status, current_agent_id, instagram_ai_flow_id')
    .eq('organization_id', conn.organization_id)
    .eq('channel', 'instagram')
    .eq('instagram_connection_id', conn.id)
    .eq('ig_sender_id', senderId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);

  let conversationId: string;
  let currentAgentId: string | null = null;
  let instagramAiFlowId: string | null = null;
  let conversationStatus = 'waiting_human';
  let visitorName: string | null = null;

  try {
    if (conn.ig_auth_style === 'ig_user_token' && conn.ig_user_access_token_encrypted) {
      const token = await decryptSecret(conn.ig_user_access_token_encrypted);
      const prof = await fetch(`${IG_GRAPH_BASE}/${senderId}?fields=name,username&access_token=${encodeURIComponent(token)}`).then((r) => r.json());
      visitorName = prof?.name ?? prof?.username ?? null;
    } else if (conn.page_access_token_encrypted) {
      const token = await decryptSecret(conn.page_access_token_encrypted);
      const prof = await fetch(`${GRAPH_BASE}/${senderId}?fields=name,username&access_token=${encodeURIComponent(token)}`).then((r) => r.json());
      visitorName = prof?.name ?? prof?.username ?? null;
    }
  } catch { /* ignore */ }

  if (existing && existing.length > 0) {
    conversationId = existing[0].id;
    currentAgentId = existing[0].current_agent_id ?? null;
    instagramAiFlowId = existing[0].instagram_ai_flow_id ?? null;
    conversationStatus = existing[0].status ?? 'waiting_human';
    const wasClosed = existing[0].status === 'closed';
    const nowIso = new Date().toISOString();
    const patch: any = {
      last_inbound_at: nowIso,
      last_message_at: nowIso,
      ...(visitorName ? { visitor_name: visitorName } : {}),
    };
    if (wasClosed) {
      patch.status = currentAgentId && instagramAiFlowId ? 'bot_active' : 'waiting_human';
      patch.needs_human = !(currentAgentId && instagramAiFlowId);
      patch.closed_at = null;
      patch.reopened_at = nowIso;
      conversationStatus = patch.status;
    }
    await sb.from('webchat_conversations').update(patch).eq('id', conversationId);
    if (wasClosed) {
      try {
        await sb.from('webchat_messages').insert({
          conversation_id: conversationId,
          sender_type: 'system',
          direction: 'system',
          content: '🔄 Conversa reaberta automaticamente (nova mensagem do lead).',
          metadata: { reopened_at: nowIso, source: 'instagram-webhook' },
        });
      } catch (_) { /* non-fatal */ }
      console.log('[instagram-webhook] 🔄 reopened closed conversation:', conversationId);
    }

  } else {
    const { data: widget } = await sb
      .from('webchat_widgets')
      .select('id')
      .eq('organization_id', conn.organization_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const { data: created, error: insErr } = await sb.from('webchat_conversations').insert({
      organization_id: conn.organization_id,
      widget_id: widget?.id ?? null,
      channel: 'instagram',
      status: 'waiting_human',
      needs_human: true,
      visitor_id: crypto.randomUUID(),
      visitor_name: visitorName ?? `Instagram ${senderId.slice(-4)}`,
      instagram_connection_id: conn.id,
      ig_sender_id: senderId,
      last_inbound_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    }).select('id').single();
    if (insErr) throw insErr;
    conversationId = created.id;
  }

  await sb.from('instagram_connections').update({ last_inbound_at: new Date().toISOString() }).eq('id', conn.id);

  // 2) extrair conteúdo
  const { content, contentType, metadata } = await extractContent(msg, conn);

  // 3) inserir mensagem (idempotente por ig_message_id)
  const { error: msgErr } = await sb.from('webchat_messages').insert({
    conversation_id: conversationId,
    direction: 'inbound',
    sender_type: 'visitor',
    content,
    content_type: contentType,
    message_type: contentType,
    ig_message_id: mid || null,
    metadata,
  });
  if (msgErr && (msgErr as any).code === '23505') {
    console.log('[ig-webhook] duplicate inbound ignored', { message_id: mid, conversation_id: conversationId });
    return;
  }
  if (msgErr) throw msgErr;

  await sb.from('instagram_webhook_logs').insert({
    connection_id: conn.id,
    organization_id: conn.organization_id,
    event_type: 'inbound',
    payload: evt,
    signature_valid: true,
  });

  // 4) Uma interação com a Opening DM retoma o fluxo exatamente na próxima etapa.
  const isStoryReply = !!(evt?.message?.reply_to?.story || (metadata as any)?.ig_type === 'story_mention');
  let flowMatched = false;
  try {
    const interactionPayload = String(msg?.quick_reply?.payload ?? postback?.payload ?? '').trim() || null;
    flowMatched = await resumePendingInstagramFlow(
      sb,
      conn,
      senderId,
      conversationId,
      mid,
      content,
      interactionPayload,
    );
  } catch (continuationError) {
    console.error('[ig-webhook] continuation lookup error', continuationError);
  }

  // Confirma a atribuição antes de decidir entre automação e atendimento pelo
  // agente. Quando a IA já assumiu, ela é dona da conversa e novos gatilhos não
  // reiniciam o fluxo no meio do atendimento.
  if (!flowMatched && currentAgentId && instagramAiFlowId && conversationStatus === 'bot_active') {
    const { data: assignedAgent } = await sb
      .from('product_agents')
      .select('id')
      .eq('id', currentAgentId)
      .eq('organization_id', conn.organization_id)
      .eq('is_active', true)
      .maybeSingle();
    const { data: authorizingFlow } = await sb
      .from('instagram_flows')
      .select('id, status, flow_blocks')
      .eq('id', instagramAiFlowId)
      .eq('organization_id', conn.organization_id)
      .maybeSingle();
    if (!assignedAgent || !flowAuthorizesAgent(authorizingFlow, currentAgentId)) {
      currentAgentId = null;
      instagramAiFlowId = null;
      conversationStatus = 'waiting_human';
      await sb.from('webchat_conversations').update({
        current_agent_id: null,
        instagram_ai_flow_id: null,
        status: 'waiting_human',
        needs_human: true,
      }).eq('id', conversationId);
    }
  }

  // Sem continuação pendente, avalia os gatilhos normais de DM e Story.
  try {
    if (!flowMatched && !(currentAgentId && instagramAiFlowId && conversationStatus === 'bot_active')) {
      const { data: flows } = await sb.from('instagram_flows')
        .select('*').eq('organization_id', conn.organization_id)
        .in('trigger_type', isStoryReply ? ['story_reply','dm_keyword'] : ['dm_keyword'])
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      const orderedFlows = [...(flows ?? [])].sort((a, b) =>
        dmFlowSpecificity(b, isStoryReply) - dmFlowSpecificity(a, isStoryReply),
      );
      for (const flow of orderedFlows) {
        if (flow.connection_id && flow.connection_id !== conn.id) continue;
        if (!matchesDmTrigger(flow, content)) continue;
        const { data: execution, error: executionError } = await sb.functions.invoke('ig-flow-executor', {
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
            apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          },
          body: {
            flow_id: flow.id, connection_id: conn.id,
            trigger_source: isStoryReply ? 'story_reply' : 'dm',
            source_id: mid, sender_ig_id: senderId,
            conversation_id: conversationId, trigger_text: content, sender_name: visitorName,
          },
        });
        if (!executionError && !(execution as any)?.error) {
          flowMatched = true;
          break;
        }
      }
    }
  } catch (fe) {
    console.error('[ig-webhook] flow trigger error', fe);
  }

  // 5) Sem fluxo, nunca escolhemos uma IA implicitamente. A conversa só continua
  // com IA quando um bloco "IA assume" vinculou explicitamente um agente ativo.
  if (!flowMatched && (!currentAgentId || !instagramAiFlowId || conversationStatus !== 'bot_active')) {
    await sb.from('webchat_conversations').update({
      status: 'waiting_human',
      needs_human: true,
    }).eq('id', conversationId);
  }

  if (!flowMatched && currentAgentId && instagramAiFlowId && conversationStatus === 'bot_active') {
    const lockToken = await acquireConversationLock(sb, conversationId);
    if (!lockToken) {
      console.warn('[ig-webhook] bot call skipped: conversation locked', { conversation_id: conversationId });
      return;
    }
    try {
      const transcription = (metadata as any)?.transcription as string | undefined;
      const botMessage = transcription && transcription.trim().length > 0
        ? transcription
        : (content && content.trim().length > 0 ? content : '[mensagem]');
      const { data: botRes } = await sb.functions.invoke('webchat-bot', {
        body: {
          conversation_id: conversationId,
          message: botMessage,
          channel: 'instagram',
          trigger: 'inbound_instagram',
          agent_id: currentAgentId,
        },
      });
      const chunks: string[] = (Array.isArray((botRes as any)?.chunks)
        ? (botRes as any).chunks
        : ((botRes as any)?.response ? [(botRes as any).response] : []))
        .filter((chunk: unknown) => typeof chunk === 'string' && chunk.trim().length > 0)
        .slice(0, 2);
      let lastSendError: any = null;
      for (const chunk of chunks) {
        if (!chunk || typeof chunk !== 'string') continue;
        const { data: sendData, error: sendErr } = await sb.functions.invoke('instagram-send', {
          body: { connection_id: conn.id, conversation_id: conversationId, recipient_id: senderId, text: chunk, skip_db_insert: true },
          headers: {
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
            apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          },
        });
        if (sendErr || (sendData as any)?.ok === false) {
          lastSendError = {
            error: (sendData as any)?.error ?? sendErr?.message ?? 'Falha ao enviar DM',
            code: (sendData as any)?.code ?? null,
            subcode: (sendData as any)?.subcode ?? null,
            fbtrace_id: (sendData as any)?.fbtrace_id ?? null,
            hint: (sendData as any)?.hint ?? null,
          };
          console.error('[ig-webhook] bot chunk send failed', lastSendError);
          break;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      if (lastSendError) {
        // Marca a última bolha outbound do bot/agente como failed com o motivo real.
        const { data: lastMsg } = await sb
          .from('webchat_messages')
          .select('id, metadata')
          .eq('conversation_id', conversationId)
          .eq('direction', 'outbound')
          .in('sender_type', ['bot', 'agent'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastMsg?.id) {
          const baseMeta = (lastMsg.metadata as Record<string, unknown>) || {};
          await sb.from('webchat_messages').update({
            metadata: { ...baseMeta, delivery_status: 'failed', ...lastSendError, failed_at: new Date().toISOString() },
          }).eq('id', lastMsg.id);
        }
      }
    } catch (e) {
      console.error('[ig-webhook] webchat-bot invoke error', e);
    } finally {
      await releaseConversationLock(sb, conversationId, lockToken);
    }
  }
}

function matchesDmTrigger(flow: any, text: string): boolean {
  const cfg = flow.trigger_config ?? {};
  const keywords: string[] = Array.isArray(cfg.keywords) ? cfg.keywords.filter(Boolean) : [];
  if (keywords.length === 0) return true;
  const match = cfg.match ?? 'any';
  const cs = !!cfg.case_sensitive;
  const t = cs ? text : text.toLowerCase();
  const ks = cs ? keywords : keywords.map(k => String(k).toLowerCase());
  if (match === 'exact') return ks.some(k => t.trim() === k.trim());
  if (match === 'all') return ks.every(k => t.includes(k));
  if (match === 'regex') {
    try { return ks.some(k => new RegExp(k, cs ? '' : 'i').test(text)); } catch { return false; }
  }
  return ks.some(k => t.includes(k));
}

async function handleReactionEvent(sb: any, conn: any, evt: any, senderId: string) {
  const reaction = evt?.reaction ?? {};
  const messageId = String(reaction?.mid ?? '');
  const action = String(reaction?.action ?? 'react');
  const emoji = String(reaction?.emoji ?? reaction?.reaction ?? '');
  if (!messageId) return;

  const { data: conversation } = await sb
    .from('webchat_conversations')
    .select('id')
    .eq('organization_id', conn.organization_id)
    .eq('channel', 'instagram')
    .eq('instagram_connection_id', conn.id)
    .eq('ig_sender_id', senderId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  await sb.from('instagram_webhook_logs').insert({
    connection_id: conn.id,
    organization_id: conn.organization_id,
    event_type: 'message_reaction',
    payload: evt,
    signature_valid: true,
  });

  const { data: flows } = await sb
    .from('instagram_flows')
    .select('*')
    .eq('organization_id', conn.organization_id)
    .eq('trigger_type', 'message_reaction')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  for (const flow of flows ?? []) {
    if (flow.connection_id && flow.connection_id !== conn.id) continue;
    const config = flow.trigger_config ?? {};
    const expectedAction = String(config.reaction_action ?? 'react');
    const expectedEmoji = String(config.emoji ?? '').trim();
    if (expectedAction !== 'any' && expectedAction !== action) continue;
    if (expectedEmoji && expectedEmoji !== emoji) continue;

    const sourceId = `${messageId}:${action}:${emoji}`;
    const { data: duplicate } = await sb
      .from('instagram_flow_runs')
      .select('id')
      .eq('flow_id', flow.id)
      .eq('source_id', sourceId)
      .limit(1)
      .maybeSingle();
    if (duplicate) continue;

    const { data: execution, error: executionError } = await sb.functions.invoke('ig-flow-executor', {
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
      body: {
        flow_id: flow.id,
        connection_id: conn.id,
        trigger_source: 'message_reaction',
        source_id: sourceId,
        sender_ig_id: senderId,
        conversation_id: conversation?.id ?? null,
        trigger_text: emoji,
        reaction: { message_id: messageId, action, emoji },
      },
    });
    if (executionError || (execution as any)?.error) {
      console.error('[ig-webhook] reaction executor error', {
        flow_id: flow.id,
        message_id: messageId,
        error: await functionErrorMessage(executionError, execution),
      });
      continue;
    }
    break;
  }
}

function dmFlowSpecificity(flow: any, isStoryReply: boolean): number {
  const cfg = flow?.trigger_config ?? {};
  const keywords = Array.isArray(cfg.keywords) ? cfg.keywords.filter(Boolean) : [];
  return (flow?.connection_id ? 8 : 0)
    + (keywords.length > 0 ? 4 : 0)
    + (isStoryReply && flow?.trigger_type === 'story_reply' ? 2 : 0);
}

async function resumePendingInstagramFlow(
  sb: any,
  conn: any,
  senderId: string,
  conversationId: string,
  sourceId: string,
  inboundText: string,
  interactionPayload?: string | null,
): Promise<boolean> {
  let query = sb
    .from('instagram_flow_continuations')
    .select('*')
    .eq('connection_id', conn.id)
    .eq('sender_ig_id', senderId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  if (interactionPayload) query = query.eq('interaction_payload', interactionPayload);
  let { data: pending } = await query.maybeSingle();

  // Uma resposta digitada também é uma interação válida e abre a janela de 24h.
  if (!pending && interactionPayload) {
    const fallback = await sb
      .from('instagram_flow_continuations')
      .select('*')
      .eq('connection_id', conn.id)
      .eq('sender_ig_id', senderId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    pending = fallback.data ?? null;
  }
  if (!pending) return false;

  const { data: claimed } = await sb
    .from('instagram_flow_continuations')
    .update({ status: 'resuming', conversation_id: conversationId })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (!claimed) return false;

  const savedContext = pending.context ?? {};
  const { data: execution, error: executionError } = await sb.functions.invoke('ig-flow-executor', {
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    },
    body: {
      flow_id: pending.flow_id,
      connection_id: conn.id,
      trigger_source: interactionPayload ? 'postback' : 'dm',
      source_id: sourceId || `continuation:${pending.id}`,
      sender_ig_id: senderId,
      conversation_id: conversationId,
      trigger_text: inboundText,
      sender_name: savedContext.sender_name ?? null,
      lead_id: savedContext.lead_id ?? null,
      resume_from_block_id: pending.resume_block_id,
      continuation_id: pending.id,
    },
  });

  const errorMessage = executionError?.message ?? (execution as any)?.error ?? null;
  await sb.from('instagram_flow_continuations').update({
    status: errorMessage ? 'failed' : 'resumed',
    resumed_at: new Date().toISOString(),
    last_error: errorMessage ? String(errorMessage).slice(0, 1000) : null,
  }).eq('id', pending.id);

  if (errorMessage) {
    console.error('[ig-webhook] continuation failed', { continuation_id: pending.id, error: errorMessage });
    return false;
  }
  return true;
}

async function extractContent(msg: any, conn: any): Promise<{ content: string; contentType: string; metadata: Record<string, any> }> {
  if (msg?.text) {
    const quickReplyPayload = String(msg?.quick_reply?.payload ?? '').trim();
    return {
      content: String(msg.text),
      contentType: 'text',
      metadata: {
        ig_type: quickReplyPayload ? 'quick_reply' : 'text',
        ...(quickReplyPayload ? { quick_reply_payload: quickReplyPayload } : {}),
      },
    };
  }

  const atts = Array.isArray(msg?.attachments) ? msg.attachments : [];
  if (atts.length > 0) {
    const a = atts[0];
    const t = a?.type ?? 'file';
    const url = a?.payload?.url ?? null;
    let stored: { url: string | null; path: string; mime: string; bytes: Uint8Array } | null = null;
    if (url && msg?.mid) {
      try { stored = await downloadAndStoreMedia(conn, msg.mid, url, t); } catch (e) { console.error('[ig-webhook] media err', e); }
    }
    const kindMap: Record<string, 'image' | 'audio' | 'video' | 'document' | 'sticker'> = {
      image: 'image', audio: 'audio', video: 'video', file: 'document', story_mention: 'image', ig_reel: 'video',
    };
    const ctMap: Record<string, string> = {
      image: 'image', audio: 'audio', video: 'video', file: 'file', story_mention: 'image', share: 'text', ig_reel: 'file',
    };
    const kind = kindMap[t] ?? 'document';
    const labelByKind: Record<string, string> = {
      audio: '[áudio]', image: '[imagem]', video: '[vídeo]', document: '[arquivo]', sticker: '[figurinha]',
    };
    const meta: Record<string, any> = {
      ig_type: t,
      attachments: atts,
      media: stored?.url ? {
        url: stored.url,
        kind,
        mime: stored.mime,
        storage_path: stored.path,
        size_bytes: stored.bytes?.byteLength ?? null,
      } : null,
    };

    if ((kind === 'audio' || kind === 'image') && stored?.bytes) {
      try {
        const b64 = bytesToBase64(stored.bytes);
        const sb = supa();
        const mediaKind: 'audio' | 'image' = kind === 'audio' ? 'audio' : 'image';
        const { data: tRes } = await sb.functions.invoke('process-media-message', {
          body: {
            kind: mediaKind,
            base64: b64,
            mime: stored.mime ?? (mediaKind === 'audio' ? 'audio/mp4' : 'image/jpeg'),
            organization_id: conn.organization_id,
          },
        });
        const txt = (tRes as any)?.text ? String((tRes as any).text).trim() : '';
        if (txt) {
          meta.transcription = mediaKind === 'audio'
            ? `🎙️ Áudio do cliente (transcrito): ${txt}`
            : `🖼️ Imagem do cliente: ${txt}`;
        } else {
          meta.transcription = mediaKind === 'audio'
            ? '🎙️ [Áudio recebido — não consegui transcrever. Peça ao cliente para reenviar ou descrever em texto.]'
            : '🖼️ [Imagem recebida — não consegui analisar o conteúdo. Peça para reenviar ou descrever.]';
          console.warn(`[ig-webhook] media NOT processed (${mediaKind}); fallback placeholder`);
        }
      } catch (tErr) {
        console.warn('[ig-webhook] media processing failed:', (tErr as any)?.message ?? tErr);
        meta.transcription = kind === 'audio'
          ? '🎙️ [Áudio recebido — não consegui transcrever.]'
          : '🖼️ [Imagem recebida — não consegui analisar.]';
      }
    }

    return {
      content: stored?.url ? (labelByKind[kind] ?? `[${t}]`) : (url ?? `[${t}]`),
      contentType: ctMap[t] ?? 'text',
      metadata: meta,
    };
  }

  if (msg?.reaction) return { content: String(msg.reaction.emoji ?? '❤️'), contentType: 'text', metadata: { ig_type: 'reaction', reaction: msg.reaction } };

  return { content: '[mensagem]', contentType: 'text', metadata: { ig_type: 'unknown', raw: msg } };
}

async function downloadAndStoreMedia(conn: any, mid: string, url: string, type: string): Promise<{ url: string | null; path: string; mime: string; bytes: Uint8Array }> {
  const bin = await fetch(url);
  if (!bin.ok) throw new Error(`download ${bin.status}`);
  const buf = new Uint8Array(await bin.arrayBuffer());
  const ct = bin.headers.get('content-type') ?? 'application/octet-stream';
  const ext = guessExt(ct, type);
  const path = `${conn.organization_id}/${conn.id}/${mid}${ext}`;
  const sb = supa();
  const { error } = await sb.storage.from('instagram-media').upload(path, buf, { contentType: ct, upsert: true });
  if (error) throw error;
  const { data: signed } = await sb.storage.from('instagram-media').createSignedUrl(path, 60 * 60 * 24 * 7);
  return { url: signed?.signedUrl ?? null, path, mime: ct, bytes: buf };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

function guessExt(mime: string, type: string): string {
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mpeg')) return '.mp3';
  if (type === 'image') return '.jpg';
  if (type === 'video') return '.mp4';
  if (type === 'audio') return '.mp3';
  return '';
}

// ============================================================
// AUTOMAÇÕES ManyChat-style: comments / mentions
// ============================================================
async function handleChange(sb: any, conn: any, change: any) {
  const field = String(change?.field ?? '');
  const value = change?.value ?? {};

  await sb.from('instagram_webhook_logs').insert({
    connection_id: conn.id,
    organization_id: conn.organization_id,
    event_type: `change:${field}`,
    payload: change,
    signature_valid: true,
  });

  if (field === 'comments') {
    const commentId = String(value?.id ?? '');
    const fromId = String(value?.from?.id ?? '');
    const fromUser = String(value?.from?.username ?? '');
    const text = String(value?.text ?? '');
    const mediaId = String(value?.media?.id ?? '');
    if (!commentId || !text) return;
    // skip próprio: cobre o ID legado e o IG User ID retornado pelo Instagram Login.
    if (fromId && (fromId === String(conn.ig_business_account_id) || fromId === String(conn.ig_user_id ?? ''))) return;
    // dedup
    const { data: dup } = await sb.from('instagram_comment_replies')
      .select('id').eq('connection_id', conn.id).eq('comment_id', commentId).maybeSingle();
    if (dup) {
      await writeCommentDiagnostics(sb, conn, change, {
        comment_id: commentId,
        media_id: mediaId,
        normalized_text: normalizeForLog(text),
        result: 'duplicate_comment',
        matched_flow_ids: [],
        evaluations: [],
      });
      return;
    }

    // Avaliar todos os fluxos ativos para que o diagnóstico também explique
    // gatilhos incompatíveis (por exemplo, DM configurada para um comentário).
    const { data: flows } = await sb.from('instagram_flows')
      .select('*')
      .eq('organization_id', conn.organization_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    const evaluations: Array<Record<string, unknown>> = [];
    const matchedFlowIds: string[] = [];
    const orderedFlows = [...(flows ?? [])].sort((a, b) =>
      commentFlowSpecificity(b, mediaId, conn.id) - commentFlowSpecificity(a, mediaId, conn.id),
    );
    for (const flow of orderedFlows) {
      const evaluation = evaluateCommentTrigger(flow, text, mediaId, conn.id);
      evaluations.push({ flow_id: flow.id, flow_name: flow.name, ...evaluation });
      if (!evaluation.matched) continue;
      const { data: execution, error: executionError } = await sb.functions.invoke('ig-flow-executor', {
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        },
        body: {
          flow_id: flow.id,
          connection_id: conn.id,
          trigger_source: 'comment',
          source_id: commentId,
          comment_id: commentId,
          sender_ig_id: fromId || null,
          sender_name: fromUser || null,
          trigger_text: text,
        },
      });
      if (executionError || (execution as any)?.error) {
        const errorMessage = await functionErrorMessage(executionError, execution);
        evaluations[evaluations.length - 1] = {
          ...evaluations[evaluations.length - 1],
          result: 'executor_error',
          error: errorMessage,
        };
        console.error('[ig-webhook] comment executor error', { flow_id: flow.id, comment_id: commentId, error: errorMessage });
      } else {
        matchedFlowIds.push(flow.id);
        evaluations[evaluations.length - 1] = {
          ...evaluations[evaluations.length - 1],
          result: (execution as any)?.skipped ? `skipped:${(execution as any).skipped}` : 'execution_created',
          run_id: (execution as any)?.run_id ?? null,
        };
        break;
      }
    }
    await writeCommentDiagnostics(sb, conn, change, {
      comment_id: commentId,
      media_id: mediaId,
      normalized_text: normalizeForLog(text),
      result: matchedFlowIds.length > 0 ? 'matched' : 'no_match',
      matched_flow_ids: matchedFlowIds,
      evaluations,
    });
    return;
  }

  if (field === 'mentions') {
    const mediaId = String(value?.media_id ?? '');
    const commentId = String(value?.comment_id ?? '');
    const { data: flows } = await sb.from('instagram_flows')
      .select('*').eq('organization_id', conn.organization_id).eq('trigger_type', 'mention').eq('status', 'active');
    for (const flow of flows ?? []) {
      if (flow.connection_id && flow.connection_id !== conn.id) continue;
      await sb.functions.invoke('ig-flow-executor', {
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
          apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        },
        body: {
          flow_id: flow.id, connection_id: conn.id, trigger_source: 'mention',
          source_id: commentId || mediaId, comment_id: commentId || null,
        },
      });
    }
    return;
  }
}

function evaluateCommentTrigger(flow: any, text: string, mediaId: string, connectionId: string): { matched: boolean; reason: string } {
  if (flow.connection_id && flow.connection_id !== connectionId) return { matched: false, reason: 'different_connection' };
  if (flow.trigger_type !== 'comment_keyword' && flow.trigger_type !== 'mention') return { matched: false, reason: 'incompatible_trigger_type' };
  const cfg = flow.trigger_config ?? {};
  // post filter
  const postIds: string[] = Array.isArray(cfg.post_ids) ? cfg.post_ids.filter(Boolean) : [];
  if (postIds.length > 0 && (!mediaId || !postIds.includes(mediaId))) return { matched: false, reason: 'post_not_targeted' };
  const keywords: string[] = Array.isArray(cfg.keywords) ? cfg.keywords.filter(Boolean) : [];
  if (keywords.length === 0) return { matched: true, reason: 'any_comment' };
  const match = cfg.match ?? 'any';
  const cs = !!cfg.case_sensitive;
  const t = cs ? text : text.toLocaleLowerCase('pt-BR');
  const ks = cs ? keywords.map(String) : keywords.map(k => String(k).toLocaleLowerCase('pt-BR'));
  let matched = false;
  if (match === 'exact') matched = ks.some(k => t.trim() === k.trim());
  else if (match === 'all') matched = ks.every(k => t.includes(k));
  if (match === 'regex') {
    try { matched = ks.some(k => new RegExp(k, cs ? '' : 'i').test(text)); } catch { return { matched: false, reason: 'invalid_regex' }; }
  } else if (match !== 'exact' && match !== 'all') {
    matched = ks.some(k => t.includes(k));
  }
  return { matched, reason: matched ? `keyword_${match}` : `keyword_${match}_not_found` };
}

function commentFlowSpecificity(flow: any, mediaId: string, connectionId: string): number {
  const cfg = flow?.trigger_config ?? {};
  const postIds: string[] = Array.isArray(cfg.post_ids) ? cfg.post_ids.filter(Boolean) : [];
  const keywords: string[] = Array.isArray(cfg.keywords) ? cfg.keywords.filter(Boolean) : [];
  return (flow?.connection_id === connectionId ? 8 : 0)
    + (mediaId && postIds.includes(mediaId) ? 4 : 0)
    + (keywords.length > 0 ? 2 : 0);
}

function normalizeForLog(text: string): string {
  return text.trim().toLocaleLowerCase('pt-BR').slice(0, 300);
}

async function fingerprintWebhookEntry(entry: any): Promise<string> {
  const messaging = (Array.isArray(entry?.messaging) ? entry.messaging : []).map((evt: any) => ({
    sender: String(evt?.sender?.id ?? ''),
    recipient: String(evt?.recipient?.id ?? ''),
    message: String(evt?.message?.mid ?? evt?.postback?.mid ?? ''),
    timestamp: String(evt?.timestamp ?? ''),
  }));
  const changes = (Array.isArray(entry?.changes) ? entry.changes : []).map((change: any) => ({
    field: String(change?.field ?? ''),
    id: String(
      change?.value?.id
      ?? change?.value?.comment_id
      ?? change?.value?.message_id
      ?? change?.value?.media?.id
      ?? '',
    ),
    created_time: String(change?.value?.created_time ?? ''),
  }));
  const canonical = JSON.stringify({ entry_id: String(entry?.id ?? ''), messaging, changes });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function recordInvalidSignature(
  sb: any,
  conn: any,
  entry: any,
  summary: Record<string, unknown>,
  sigError: string | null,
) {
  const fingerprint = String(summary.event_fingerprint ?? '');
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: previous } = await sb
    .from('instagram_webhook_logs')
    .select('id, payload_summary')
    .eq('connection_id', conn.id)
    .eq('event_type', 'invalid_signature')
    .contains('payload_summary', { event_fingerprint: fingerprint })
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previous) {
    const duplicateCount = Number(previous.payload_summary?.duplicate_count ?? 1) + 1;
    await sb.from('instagram_webhook_logs').update({
      payload_summary: {
        ...previous.payload_summary,
        duplicate_count: duplicateCount,
        last_seen_at: new Date().toISOString(),
      },
    }).eq('id', previous.id);
    return;
  }

  await sb.from('instagram_webhook_logs').insert({
    connection_id: conn.id,
    organization_id: conn.organization_id,
    event_type: 'invalid_signature',
    payload: entry,
    payload_summary: { ...summary, duplicate_count: 1, last_seen_at: new Date().toISOString() },
    signature_valid: false,
    error: sigError ?? 'HMAC mismatch — evento assinado por outro App Secret',
  });
}

async function functionErrorMessage(error: any, data: any): Promise<string> {
  if (data?.error) return String(data.error).slice(0, 1000);
  try {
    if (error?.context?.text) return String(await error.context.text()).slice(0, 1000);
  } catch { /* ignore */ }
  return String(error?.message ?? error ?? 'unknown_executor_error').slice(0, 1000);
}

async function writeCommentDiagnostics(sb: any, conn: any, change: any, summary: Record<string, unknown>) {
  const { error } = await sb.from('instagram_webhook_logs').insert({
    connection_id: conn.id,
    organization_id: conn.organization_id,
    event_type: summary.result === 'matched' ? 'comment_match' : 'comment_no_match',
    payload: change,
    payload_summary: summary,
    signature_valid: true,
    error: summary.result === 'no_match' ? 'Nenhuma automação de comentário correspondeu ao evento' : null,
  });
  if (error) console.error('[ig-webhook] diagnostics insert failed', error.message);
}

