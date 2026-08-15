// meta-whatsapp-webhook
// Receiver público da Meta Cloud API.
// GET: handshake (?hub.mode=subscribe + verify_token).
// POST: eventos (mensagens, status). Valida X-Hub-Signature-256.
// verify_jwt = false (público — segurança via verify_token + HMAC).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { normalizePhoneBR } from '../_shared/phone.ts';
import { isOptOutMessage, markLeadOptOut } from '../_shared/optin-guard.ts';
import { fireAndForgetJourneyEvent } from '../_shared/journey-bus.ts';


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

async function acquireConversationLock(sb: SupabaseClient, conversationId: string, ttlMs = 45_000): Promise<string | null> {
  const { data, error } = await sb.rpc('try_acquire_conversation_lock_token', {
    p_conv: conversationId,
    p_ttl_ms: ttlMs,
  });
  if (error) {
    console.error('[meta-whatsapp-webhook] conversation lock unavailable; failing closed', error.message);
    return null;
  }
  return typeof data === 'string' ? data : null;
}

async function releaseConversationLock(sb: SupabaseClient, conversationId: string, lockToken: string): Promise<void> {
  try {
    const { error } = await sb.rpc('release_conversation_lock_token', { p_conv: conversationId, p_lock_token: lockToken });
    if (error) console.error('[meta-whatsapp-webhook] conversation lock release failed', error.message);
  } catch (_) { /* best-effort */ }
}

function supa() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** Substitui {chave} pelos dados do lead (nome, email, telefone e campos personalizados). */
async function interpolateLeadVars(sb: any, text: string, leadId: string | null): Promise<string> {
  if (!text || !leadId) return text;
  try {
    const { data: lead } = await sb
      .from('leads').select('name, email, phone, metadata').eq('id', leadId).maybeSingle();
    if (!lead) return text;
    const vars: Record<string, string> = {};
    const cf = ((lead as any)?.metadata?.custom_fields ?? {}) as Record<string, any>;
    for (const [k, v] of Object.entries(cf)) {
      if (v === null || v === undefined || v === '') continue;
      vars[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
    if (lead.name) { vars.nome = lead.name; vars.name = lead.name; }
    if (lead.email) vars.email = lead.email;
    if (lead.phone) { vars.telefone = lead.phone; vars.phone = lead.phone; }
    return text.replace(/\{([\w.-]+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  } catch {
    return text;
  }
}


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractConnectionIdFromPath(url: URL): string | null {
  // Aceita /functions/v1/meta-whatsapp-webhook/{uuid}
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return UUID_RE.test(last) ? last : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const pathConnectionId = extractConnectionIdFromPath(url);

  // -------- GET handshake --------
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode !== 'subscribe' || !token || !challenge) {
      return new Response('bad request', { status: 400 });
    }
    const sb = supa();
    // Resolve por path id (preferido) ou pelo próprio token (retrocompat).
    let connRow: { id: string; webhook_verify_token: string } | null = null;
    if (pathConnectionId) {
      const { data } = await sb
        .from('whatsapp_meta_connections')
        .select('id, webhook_verify_token')
        .eq('id', pathConnectionId)
        .maybeSingle();
      connRow = data ?? null;
    } else {
      const { data } = await sb
        .from('whatsapp_meta_connections')
        .select('id, webhook_verify_token')
        .eq('webhook_verify_token', token)
        .limit(1)
        .maybeSingle();
      connRow = data ?? null;
    }
    if (!connRow || connRow.webhook_verify_token !== token) {
      console.log('[verify] reject', { has_path_id: !!pathConnectionId });
      return new Response('forbidden', { status: 403 });
    }
    // Marca que a Meta validou o webhook desta conexão.
    await sb
      .from('whatsapp_meta_connections')
      .update({ webhook_subscribed_at: new Date().toISOString() })
      .eq('id', connRow.id);
    console.log('[verify] ok', { connection_id: connRow.id });
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const rawBody = await req.text();
  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return new Response('invalid json', { status: 400 }); }

  const sb = supa();

  // Quando a URL carrega o connection_id, resolve uma vez e usa o mesmo
  // App Secret para validar a assinatura de TODO o payload (preferido).
  let pinnedConn: any = null;
  if (pathConnectionId) {
    const { data } = await sb
      .from('whatsapp_meta_connections')
      .select('id, organization_id, app_secret_encrypted, access_token_encrypted')
      .eq('id', pathConnectionId)
      .maybeSingle();
    pinnedConn = data ?? null;
    if (!pinnedConn) return new Response('forbidden', { status: 403 });

    // Valida HMAC ANTES de processar (assinatura cobre o body inteiro).
    const sig = req.headers.get('x-hub-signature-256') ?? '';
    if (!sig.startsWith('sha256=')) return new Response('forbidden', { status: 403 });
    try {
      const appSecret = await decryptSecret(pinnedConn.app_secret_encrypted);
      const expected = 'sha256=' + (await hmacSha256Hex(appSecret, rawBody));
      if (!timingSafeEqual(sig, expected)) {
        await sb.from('whatsapp_meta_webhook_logs').insert({
          connection_id: pinnedConn.id,
          organization_id: pinnedConn.organization_id,
          event_type: 'invalid_signature',
          payload,
          processed: false,
          error: 'HMAC mismatch',
        });
        return new Response('forbidden', { status: 403 });
      }
    } catch (e) {
      console.error('signature check failed (pinned)', e);
      return new Response('forbidden', { status: 403 });
    }
  }

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value ?? {};
      const phoneNumberId = value?.metadata?.phone_number_id;

      // Resolve conexão: pinned (path) tem prioridade; fallback por phone_number_id.
      let conn: any = pinnedConn;
      if (!conn) {
        if (!phoneNumberId) continue;
        const { data } = await sb
          .from('whatsapp_meta_connections')
          .select('id, organization_id, app_secret_encrypted, access_token_encrypted')
          .eq('phone_number_id', phoneNumberId)
          .limit(1)
          .maybeSingle();
        conn = data ?? null;
      }
      if (!conn) {
        await sb.from('whatsapp_meta_webhook_logs').insert({
          event_type: 'unknown_phone_id',
          payload,
          processed: false,
          error: `phone_number_id ${phoneNumberId ?? '-'} not registered`,
        });
        continue;
      }


      // valida assinatura HMAC (apenas no caminho fallback — pinnedConn já validou).
      if (!pinnedConn) {
        try {
          const sig = req.headers.get('x-hub-signature-256') ?? '';
          if (sig.startsWith('sha256=')) {
            const appSecret = await decryptSecret(conn.app_secret_encrypted);
            const expected = 'sha256=' + (await hmacSha256Hex(appSecret, rawBody));
            if (!timingSafeEqual(sig, expected)) {
              await sb.from('whatsapp_meta_webhook_logs').insert({
                connection_id: conn.id,
                organization_id: conn.organization_id,
                event_type: 'invalid_signature',
                payload,
                processed: false,
                error: 'HMAC mismatch',
              });
              return new Response('forbidden', { status: 403 });
            }
          }
        } catch (e) {
          console.error('signature check failed', e);
        }
      }


      // mensagens recebidas
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        try {
          await handleInboundMessage(sb, conn, msg, contacts);
        } catch (e) {
          console.error('inbound error', e);
          await sb.from('whatsapp_meta_webhook_logs').insert({
            connection_id: conn.id,
            organization_id: conn.organization_id,
            event_type: 'inbound_error',
            payload: msg,
            processed: false,
            error: String(e),
          });
        }
      }

      // status callbacks
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        try { await handleStatus(sb, st); } catch (e) { console.error('status error', e); }
      }

      // template status updates
      if (change?.field === 'message_template_status_update') {
        try {
          await sb.from('whatsapp_meta_templates')
            .update({ status: value?.event ?? 'PENDING', rejected_reason: value?.reason ?? null })
            .eq('connection_id', conn.id)
            .eq('meta_template_id', String(value?.message_template_id ?? ''));
        } catch (e) { console.error('tpl status error', e); }
      }
    }
  }

  // Sempre 200 — Meta reenvia se receber qualquer outro código
  return new Response('ok', { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
});

async function handleInboundMessage(sb: any, conn: any, msg: any, contacts: any[]) {
  const fromRaw = String(msg.from ?? '');
  const fromNorm = normalizePhoneBR(fromRaw) ?? fromRaw;
  const metaMsgId = String(msg.id ?? '');
  const contactName = contacts?.[0]?.profile?.name ?? null;

  // 1) localizar conversa desta caixa Meta específica (incluindo 'closed')
  //    - filtra por meta_connection_id para nunca invadir outra caixa (Evolution/IG/outra Meta)
  //    - se estiver 'closed', reabre para preservar o histórico do lead
  const { data: existing } = await sb
    .from('webchat_conversations')
    .select('id, status, lead_id')
    .eq('organization_id', conn.organization_id)
    .eq('channel', 'whatsapp')
    .eq('meta_connection_id', conn.id)
    .eq('visitor_phone_normalized', fromNorm)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);

  let conversationId: string;
  if (existing && existing.length > 0) {
    conversationId = existing[0].id;
    const wasClosed = existing[0].status === 'closed';
    const nowIso = new Date().toISOString();
    const patch: any = {
      last_inbound_at: nowIso,
      last_message_at: nowIso,
      ...(contactName ? { visitor_name: contactName } : {}),
    };
    if (wasClosed) {
      patch.status = 'bot_active';
      patch.closed_at = null;
      patch.reopened_at = nowIso;
    }
    await sb.from('webchat_conversations').update(patch).eq('id', conversationId);
    if (wasClosed) {
      try {
        await sb.from('webchat_messages').insert({
          conversation_id: conversationId,
          sender_type: 'system',
          direction: 'system',
          content: '🔄 Conversa reaberta automaticamente (nova mensagem do lead).',
          metadata: { reopened_at: nowIso, source: 'meta-whatsapp-webhook' },
        });
      } catch (_) { /* non-fatal */ }
      console.log('[meta-whatsapp-webhook] 🔄 reopened closed conversation:', conversationId);
    }

  } else {
    // achar widget ativo da org (compat com webchat schema)
    const { data: widget } = await sb
      .from('webchat_widgets')
      .select('id')
      .eq('organization_id', conn.organization_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const { data: created, error: insErr } = await sb
      .from('webchat_conversations')
      .insert({
        organization_id: conn.organization_id,
        widget_id: widget?.id ?? null,
        channel: 'whatsapp',
        status: 'bot_active',
        visitor_id: crypto.randomUUID(),
        visitor_phone: fromNorm,
        visitor_name: contactName ?? fromNorm,
        meta_connection_id: conn.id,
        last_inbound_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insErr) throw insErr;
    conversationId = created.id;
  }

  // 2) extrair conteúdo
  const { content, contentType, metadata } = await extractContent(msg, conn);

  // 3) inserir mensagem (idempotente por meta_message_id)
  const { data: inboundRow, error: msgErr } = await sb.from('webchat_messages').insert({
    conversation_id: conversationId,
    direction: 'inbound',
    sender_type: 'visitor',
    content,
    content_type: contentType,
    message_type: contentType,
    meta_message_id: metaMsgId,
    metadata,
  }).select('id, created_at').single();
  if (msgErr && (msgErr as any).code === '23505') {
    console.log('[meta-whatsapp-webhook] duplicate inbound ignored', { message_id: metaMsgId, conversation_id: conversationId });
    return;
  }
  if (msgErr) throw msgErr;

  // 4) log
  await sb.from('whatsapp_meta_webhook_logs').insert({
    connection_id: conn.id,
    organization_id: conn.organization_id,
    event_type: 'inbound:' + (msg.type ?? 'unknown'),
    payload: msg,
    processed: true,
  });

  // 4.1) Meta CTWA (Click-to-WhatsApp Ads): captura ctwa_clid + ad_id do referral
  //      Persiste na conversa/lead e publica evento na Jornada. Cron marketing-sync
  //      resolve depois qual anúncio ganhou o crédito.
  try {
    const ref = msg.referral;
    if (ref && (ref.ctwa_clid || ref.source_id)) {
      const ctwaClid: string | null = ref.ctwa_clid ?? null;
      const adExternalId: string | null = ref.source_id ?? null;

      // grava referral na metadata da conversa (para replay) — merge para não apagar campaign_id/pending_payment_data
      const { data: convMetaRow } = await sb
        .from('webchat_conversations')
        .select('metadata')
        .eq('id', conversationId)
        .maybeSingle();
      const existingMeta = ((convMetaRow as any)?.metadata ?? {}) as Record<string, unknown>;
      await sb.from('webchat_conversations')
        .update({
          metadata: { ...existingMeta, referral: ref, ctwa_clid: ctwaClid, ad_id: adExternalId },
        })
        .eq('id', conversationId);

      // se a conversa já está vinculada a um lead, persiste no lead
      const { data: convRow } = await sb
        .from('webchat_conversations').select('lead_id').eq('id', conversationId).maybeSingle();
      const leadId = (convRow as any)?.lead_id ?? null;
      if (leadId) {
        if (ctwaClid) await sb.from('leads').update({ ctwa_clid: ctwaClid }).eq('id', leadId).is('ctwa_clid', null);
        // tenta atribuir imediatamente (best-effort — pode ficar pendente até o marketing-sync rodar)
        try { await sb.rpc('resolve_click_attribution', { p_lead_id: leadId }); } catch (_) {}
      }

      fireAndForgetJourneyEvent(sb, {
        organization_id: conn.organization_id,
        subject_type: 'lead',
        subject_id: leadId ?? conversationId,
        event_type: 'meta_ctwa_received' as any,
        event_category: 'origin',
        source_module: 'meta-whatsapp-webhook',
        channel: 'whatsapp',
        source: 'meta_ctwa',
        title: 'Clique em anúncio (CTWA)',
        description: ref.headline ?? ref.body ?? null,
        payload: {
          ctwa_clid: ctwaClid,
          ad_external_id: adExternalId,
          source_type: ref.source_type,
          source_url: ref.source_url,
          headline: ref.headline,
          body: ref.body,
        },
        lead_id: leadId,
        conversation_id: conversationId,
        dedupe_key: ctwaClid ? `ctwa:${ctwaClid}` : `ctwa-ad:${adExternalId}:${conversationId}`,
      });
    }
  } catch (e) {
    console.warn('[meta-webhook] referral capture failed:', (e as Error).message);
  }


  // 4.5) Button actions: resposta a botão de template aplica etiqueta / opt-out / cadência.
  //      Origem das ações: metadata.template_button_actions da conversa (webhooks e envios avulsos)
  //      ou meta_template_config.button_actions da campanha (metadata.campaign_id).
  let optOutFromButton = false;
  let buttonHandled = false; // resposta imediata já enviada → não chamar o bot padrão
  try {
    const buttonPayload = (metadata as any)?.payload ?? (metadata as any)?.interactive?.button_reply?.id ?? null;
    const isButtonReply = !!buttonPayload || msg.type === 'button' || msg.type === 'interactive';
    if (isButtonReply && content) {
      const { data: convRow } = await sb
        .from('webchat_conversations').select('lead_id, metadata').eq('id', conversationId).maybeSingle();
      const convMeta = ((convRow as any)?.metadata ?? {}) as Record<string, any>;
      const campaignId = convMeta.campaign_id ?? null;
      const leadId = (convRow as any)?.lead_id ?? null;

      let actions: Record<string, any> = (convMeta.template_button_actions ?? {}) as Record<string, any>;
      let origin = 'conversation';
      if (!Object.keys(actions).length && campaignId) {
        const { data: campRow } = await sb
          .from('campaigns').select('meta_template_config').eq('id', campaignId).maybeSingle();
        actions = ((campRow as any)?.meta_template_config?.button_actions ?? {}) as Record<string, any>;
        origin = 'campaign';
      }

      // Matching: exato pelo texto do botão (case-insensitive) ou pelo payload
      const key = Object.keys(actions).find((k) =>
        k.toLowerCase() === String(content).trim().toLowerCase() ||
        (buttonPayload && k.toLowerCase() === String(buttonPayload).toLowerCase()),
      );
      const action = key ? actions[key] : null;
      if (action) {
        const outcome: Record<string, any> = {};
        if (action.tag_id && leadId) {
          try {
            await sb.from('lead_tag_assignments').upsert(
              { lead_id: leadId, tag_id: action.tag_id, source: 'webhook' },
              { onConflict: 'lead_id,tag_id', ignoreDuplicates: true },
            );
          } catch (e) { console.error('[button tag] insert error', e); }
        }

        // Opt-out tem prioridade absoluta: nunca inscreve, responde ou chama IA.
        if (action.opt_out && leadId) {
          await markLeadOptOut(sb, leadId, conn.organization_id);
          optOutFromButton = true;
          buttonHandled = true;
          outcome.opt_out = { applied: true };
        }

        if (!optOutFromButton && action.cadence_id && leadId) {
          try {
            const { data: enrollRes, error: enrollErr } = await sb.functions.invoke('cadence-enroll', {
              body: {
                cadence_id: action.cadence_id,
                lead_ids: [leadId],
                source: 'template_button',
                source_ref: {
                  button: content,
                  origin,
                  inbound_message_id: inboundRow?.id ?? null,
                  inbound_at: inboundRow?.created_at ?? new Date().toISOString(),
                  conversation_id: conversationId,
                },
              },
            });
            outcome.cadence_enroll = enrollErr ? { error: enrollErr.message } : enrollRes;
            console.log('[button cadence] enroll result', JSON.stringify(outcome.cadence_enroll));
          } catch (e) {
            outcome.cadence_enroll = { error: (e as Error).message };
            console.error('[button cadence] enroll error', e);
          }
        }
        if (!optOutFromButton && action.stop_cadence && action.cadence_id && leadId) {
          try {
            await sb.functions.invoke('cadence-stop', { body: { cadence_id: action.cadence_id, lead_id: leadId, reason: 'template_button' } });
          } catch (e) { console.error('[button cadence] stop error', e); }
        }

        // Resposta imediata ao clique: texto fixo ou agente de IA
        const replyMode = action.reply_mode ?? (action.reply_text ? 'text' : 'none');
        const enrollmentResult = outcome.cadence_enroll as Record<string, any> | undefined;
        const enrollmentSucceeded = !action.cadence_id || (
          !enrollmentResult?.error &&
          (Number(enrollmentResult?.enrolled ?? 0) > 0 || Number(enrollmentResult?.skipped_existing ?? 0) > 0)
        );
        if (!optOutFromButton && enrollmentSucceeded && replyMode === 'text' && action.reply_text) {
          try {
            const text = await interpolateLeadVars(sb, String(action.reply_text), leadId);
            await sb.functions.invoke('meta-whatsapp-send', {
              body: {
                connection_id: conn.id,
                organization_id: conn.organization_id,
                conversation_id: conversationId,
                to: fromNorm,
                type: 'text',
                text,
              },
            });
            buttonHandled = true;
            outcome.reply = { mode: 'text', sent: true };
          } catch (e) {
            outcome.reply = { mode: 'text', error: (e as Error).message };
            console.error('[button reply text] send error', e);
          }
        } else if (!optOutFromButton && enrollmentSucceeded && replyMode === 'ai') {
          try {
            if (action.reply_agent_id) {
              await sb.from('webchat_conversations')
                .update({ current_agent_id: action.reply_agent_id })
                .eq('id', conversationId);
            }
            const { data: botRes } = await sb.functions.invoke('webchat-bot', {

              body: {
                conversation_id: conversationId,
                message: content,
                visitor_name: contactName ?? fromNorm,
                channel: 'whatsapp',
                trigger: 'template_button',
                agent_id: action.reply_agent_id ?? undefined,
                button_context: 'campaign_continuation',
              },
            });
            const chunks: string[] = Array.isArray((botRes as any)?.chunks)
              ? (botRes as any).chunks
              : ((botRes as any)?.response ? [(botRes as any).response] : []);
            for (const chunk of chunks) {
              if (!chunk || typeof chunk !== 'string') continue;
              await sb.functions.invoke('meta-whatsapp-send', {
                body: {
                  connection_id: conn.id,
                  organization_id: conn.organization_id,
                  conversation_id: conversationId,
                  to: fromNorm,
                  type: 'text',
                  text: chunk,
                },
              });
            }
            buttonHandled = true;
            outcome.reply = { mode: 'ai', chunks: chunks.length };
          } catch (e) {
            outcome.reply = { mode: 'ai', error: (e as Error).message };
            console.error('[button reply ai] error', e);
          }
        } else if (!optOutFromButton && !enrollmentSucceeded) {
          // A ação foi reconhecida, mas a inscrição falhou. Evita confirmação falsa
          // e também impede que o bot padrão responda ao mesmo clique.
          buttonHandled = true;
          outcome.reply = { skipped: true, reason: enrollmentResult?.reason ?? enrollmentResult?.error ?? 'cadence_enrollment_failed' };
        }

        await sb.from('whatsapp_meta_webhook_logs').insert({
          connection_id: conn.id,
          organization_id: conn.organization_id,
          event_type: 'template_button_action',
          payload: { lead_id: leadId, origin, campaign_id: campaignId, button: content, applied: action, outcome },
          processed: true,
        });
      }
    }

  } catch (e) { console.error('[button action] error', e); }


  // 4.6) Opt-out detection (soft opt-in): se for botão "Sair da lista" ou texto equivalente,
  //      marca lead, cancela cadências/campanhas e envia confirmação. NÃO chama o bot.
  try {
    const buttonPayload = (metadata as any)?.payload ?? (metadata as any)?.interactive?.button_reply?.id ?? null;
    if (optOutFromButton || isOptOutMessage(content, buttonPayload)) {
      // resolve lead vinculado à conversa (se houver)
      const { data: convRow } = await sb
        .from('webchat_conversations').select('lead_id').eq('id', conversationId).maybeSingle();
      const leadId = (convRow as any)?.lead_id ?? null;
      if (leadId && !optOutFromButton) await markLeadOptOut(sb, leadId, conn.organization_id);

      // Confirmação ao usuário
      try {
        await sb.functions.invoke('meta-whatsapp-send', {
          body: {
            connection_id: conn.id,
            organization_id: conn.organization_id,
            conversation_id: conversationId,
            to: fromNorm,
            type: 'text',
            text: 'Você foi removido(a) da nossa lista. Não enviaremos mais mensagens automáticas. Se quiser voltar, é só responder por aqui.',
          },
        });
      } catch (e) { console.error('[opt-out confirmation] send error', e); }

      await sb.from('whatsapp_meta_webhook_logs').insert({
        connection_id: conn.id,
        organization_id: conn.organization_id,
        event_type: 'opt_out',
        payload: { lead_id: leadId, button: buttonPayload, text: content },
        processed: true,
      });
      return; // não dispara webchat-bot
    }
  } catch (e) { console.error('[opt-out detection] error', e); }

  // 5) disparar webchat-bot e despachar resposta via meta-whatsapp-send
  if (buttonHandled) {
    console.log('[meta-whatsapp-webhook] bot skipped: resposta imediata do botão já enviada');
    return;
  }
  // Conversa marcada como "sem agente de IA" (envio de template puramente programado)
  try {
    const { data: convFlagRow } = await sb
      .from('webchat_conversations').select('metadata').eq('id', conversationId).maybeSingle();
    if (((convFlagRow as any)?.metadata ?? {}).no_ai_agent === true) {
      console.log('[meta-whatsapp-webhook] bot skipped: conversa sem agente de IA');
      return;
    }
  } catch (e) { console.error('[no_ai_agent check] error', e); }

  const lockToken = await acquireConversationLock(sb, conversationId);

  if (!lockToken) {
    console.warn('[meta-whatsapp-webhook] bot call skipped: conversation locked', { conversation_id: conversationId });
    return;
  }
  try {

    // Para áudio, usamos a transcrição (Whisper) como mensagem para o bot
    // para que a IA realmente "ouça" o que foi dito.
    const transcription = (metadata as any)?.transcription as string | undefined;
    const botMessage = transcription && transcription.trim().length > 0
      ? transcription
      : (content && content.trim().length > 0 ? content : `[${contentType || 'mensagem'}]`);

    // Detecta clique em botão de continuidade de template (campanha HSM).
    // O LLM recebe só o texto do botão e tende a escalar para humano por achar
    // a mensagem ambígua. Sinalizamos como abertura de conversa.
    const buttonPayloadHint = (metadata as any)?.payload ?? (metadata as any)?.interactive?.button_reply?.id ?? null;
    const isBtnReply = !!buttonPayloadHint || msg.type === 'button' || msg.type === 'interactive';
    const continuationButtons = ['continuar conversa', 'quero saber mais', 'tenho interesse', 'me conta mais', 'continuar', 'saber mais'];
    const isContinuationButton = isBtnReply && continuationButtons.includes(String(botMessage || '').trim().toLowerCase());

    const { data: botRes } = await sb.functions.invoke('webchat-bot', {
      body: {
        conversation_id: conversationId,
        message: botMessage,
        visitor_name: contactName ?? fromNorm,
        channel: 'whatsapp',
        trigger: 'inbound_whatsapp_meta',
        button_context: isContinuationButton ? 'campaign_continuation' : undefined,
      },
    });
    const chunks: string[] = Array.isArray((botRes as any)?.chunks)
      ? (botRes as any).chunks
      : ((botRes as any)?.response ? [(botRes as any).response] : []);
    for (const chunk of chunks) {
      if (!chunk || typeof chunk !== 'string') continue;
      try {
        await sb.functions.invoke('meta-whatsapp-send', {
          body: {
            connection_id: conn.id,
            organization_id: conn.organization_id,
            conversation_id: conversationId,
            to: fromNorm,
            type: 'text',
            text: chunk,
          },
        });
      } catch (sendErr) {
        console.error('meta-whatsapp-send error', sendErr);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch (e) {
    console.error('webchat-bot invoke error', e);
  } finally {
    await releaseConversationLock(sb, conversationId, lockToken);
  }
}

async function extractContent(msg: any, conn: any): Promise<{ content: string; contentType: string; metadata: Record<string, any> }> {
  const type = msg.type ?? 'text';
  const baseMeta: Record<string, any> = { meta_type: type };

  if (type === 'text') return { content: msg.text?.body ?? '', contentType: 'text', metadata: baseMeta };
  if (type === 'button') return { content: msg.button?.text ?? '', contentType: 'text', metadata: { ...baseMeta, payload: msg.button?.payload } };
  if (type === 'interactive') {
    const i = msg.interactive ?? {};
    const txt = i.button_reply?.title ?? i.list_reply?.title ?? i.nfm_reply?.response_json ?? '';
    return { content: String(txt), contentType: 'text', metadata: { ...baseMeta, interactive: i } };
  }
  if (type === 'location') {
    const l = msg.location ?? {};
    return { content: `📍 ${l.name ?? ''} ${l.address ?? ''}`.trim() || `${l.latitude},${l.longitude}`, contentType: 'text', metadata: { ...baseMeta, location: l } };
  }
  if (type === 'contacts') {
    const raw = Array.isArray(msg.contacts) ? msg.contacts : [];
    const norm = raw.map((c: any) => {
      const name = c?.name?.formatted_name || [c?.name?.first_name, c?.name?.last_name].filter(Boolean).join(' ') || 'Contato';
      const phoneObj = Array.isArray(c?.phones) ? c.phones[0] : null;
      let phone = (phoneObj?.wa_id || phoneObj?.phone || '').replace(/[^\d+]/g, '');
      if (phone.startsWith('+')) phone = phone.slice(1);
      return { name, phone, raw_vcard: null };
    });
    return { content: '📇 Contato compartilhado', contentType: 'contact', metadata: { ...baseMeta, contacts: norm } };
  }
  if (type === 'reaction') {
    return { content: msg.reaction?.emoji ?? '', contentType: 'text', metadata: { ...baseMeta, reaction: msg.reaction } };
  }

  // mídia: image, audio, video, document, sticker, voice
  const mediaSpec = msg[type];
  if (mediaSpec?.id) {
    try {
      const accessToken = await decryptSecret(conn.access_token_encrypted);
      const downloaded = await downloadAndStoreMedia(conn, mediaSpec.id, mediaSpec.mime_type, accessToken);

      const isAudio = type === 'audio' || type === 'voice';
      const kind = type === 'image' ? 'image'
        : isAudio ? 'audio'
        : type === 'video' ? 'video'
        : type === 'sticker' ? 'sticker'
        : 'document';
      const ct = kind === 'image' ? 'image'
        : kind === 'audio' ? 'audio'
        : kind === 'video' ? 'video'
        : 'file';

      const labelByKind: Record<string, string> = {
        audio: '[áudio]', image: '[imagem]', video: '[vídeo]', document: '[documento]', sticker: '[figurinha]',
      };
      const caption = (mediaSpec.caption ?? '').toString().trim();
      const shortContent = caption || labelByKind[kind] || `[${type}]`;

      const meta: Record<string, any> = {
        ...baseMeta,
        media: {
          url: downloaded.url,
          kind,
          mime: downloaded.mime ?? mediaSpec.mime_type ?? null,
          storage_path: downloaded.path,
          caption: mediaSpec.caption ?? null,
          filename: mediaSpec.filename ?? null,
          size_bytes: downloaded.bytes?.byteLength ?? null,
        },
      };

      // Áudio/voz → Whisper. Imagem → Vision. Ambos via process-media-message
      // usando a chave OpenAI da empresa (passamos organization_id).
      if ((isAudio || kind === 'image') && downloaded.bytes) {
        try {
          const b64 = bytesToBase64(downloaded.bytes);
          const sb = supa();
          const mediaKind: 'audio' | 'image' = isAudio ? 'audio' : 'image';
          const { data: tRes } = await sb.functions.invoke('process-media-message', {
            body: {
              kind: mediaKind,
              base64: b64,
              mime: downloaded.mime ?? mediaSpec.mime_type ?? (isAudio ? 'audio/ogg' : 'image/jpeg'),
              caption: mediaSpec.caption ?? undefined,
              organization_id: conn.organization_id,
            },
          });
          const txt = (tRes as any)?.text ? String((tRes as any).text).trim() : '';
          if (txt) {
            if (mediaKind === 'audio') {
              meta.transcription = `🎙️ Áudio do cliente (transcrito): ${txt}`;
            } else {
              const cap = (mediaSpec.caption ?? '').toString().trim();
              meta.transcription = cap
                ? `🖼️ Imagem (legenda: "${cap}"): ${txt}`
                : `🖼️ Imagem do cliente: ${txt}`;
            }
          } else {
            meta.transcription = mediaKind === 'audio'
              ? '🎙️ [Áudio recebido — não consegui transcrever. Peça ao cliente para reenviar ou descrever em texto.]'
              : '🖼️ [Imagem recebida — não consegui analisar o conteúdo. Peça para reenviar ou descrever.]';
            console.warn(`[meta-whatsapp-webhook] media NOT processed (${mediaKind}); fallback placeholder`);
          }
        } catch (tErr) {
          console.warn('[meta-whatsapp-webhook] media processing failed:', (tErr as any)?.message ?? tErr);
          meta.transcription = isAudio
            ? '🎙️ [Áudio recebido — não consegui transcrever.]'
            : '🖼️ [Imagem recebida — não consegui analisar.]';
        }
      }

      return { content: shortContent, contentType: ct, metadata: meta };
    } catch (e) {
      console.error('media download error', e);
      return { content: `[${type}]`, contentType: 'text', metadata: { ...baseMeta, media: { id: mediaSpec.id, error: String(e) } } };
    }
  }

  return { content: `[${type}]`, contentType: 'text', metadata: baseMeta };
}

async function downloadAndStoreMedia(conn: any, mediaId: string, _mime: string, accessToken: string): Promise<{ url: string | null; path: string; mime: string; bytes: Uint8Array }> {
  const meta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((r) => r.json());
  const url = meta?.url;
  if (!url) throw new Error('no media url');
  const bin = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const buf = new Uint8Array(await bin.arrayBuffer());
  const contentType = meta?.mime_type ?? bin.headers.get('content-type') ?? 'application/octet-stream';
  const ext = guessExt(contentType);
  const path = `${conn.organization_id}/${conn.id}/${mediaId}${ext}`;
  const sb = supa();
  const { error } = await sb.storage.from('whatsapp-meta-media').upload(path, buf, { contentType, upsert: true });
  if (error) throw error;
  const { data: signed } = await sb.storage.from('whatsapp-meta-media').createSignedUrl(path, 60 * 60 * 24 * 7);
  return { url: signed?.signedUrl ?? null, path, mime: contentType, bytes: buf };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

function guessExt(mime: string): string {
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mpeg')) return '.mp3';
  if (mime.includes('pdf')) return '.pdf';
  return '';
}

async function handleStatus(sb: any, st: any) {
  const id = String(st.id ?? '');
  const status = String(st.status ?? '');
  if (!id || !status) return;

  // Resume erro do Meta (para sent/delivered/read normalmente vem vazio)
  const err0 = Array.isArray(st.errors) && st.errors.length ? st.errors[0] : null;
  const errSummary = err0
    ? `${err0.code ?? ''} ${err0.title ?? ''}${err0?.error_data?.details ? `: ${err0.error_data.details}` : ''}`.trim()
    : null;

  // Atualiza a mensagem e persiste o status bruto no metadata
  const { data: msgRow } = await sb
    .from('webchat_messages')
    .select('id, conversation_id, metadata')
    .eq('meta_message_id', id)
    .maybeSingle();

  if (msgRow) {
    const newMeta = { ...(msgRow.metadata ?? {}), meta_status: {
      status,
      timestamp: st.timestamp ?? null,
      recipient_id: st.recipient_id ?? null,
      ...(err0 ? { code: err0.code, title: err0.title, details: err0?.error_data?.details ?? null } : {}),
    } };
    await sb
      .from('webchat_messages')
      .update({ delivery_status: status, metadata: newMeta })
      .eq('id', msgRow.id);

    // Propaga falhas para campaign_targets (match por conversation_id nas últimas 24h)
    if ((status === 'failed' || status === 'undelivered') && msgRow.conversation_id) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      await sb
        .from('campaign_targets')
        .update({ status: 'failed', error: errSummary || `meta status: ${status}` })
        .eq('conversation_id', msgRow.conversation_id)
        .eq('status', 'sent')
        .gte('sent_at', since);
    }
  } else {
    // Fallback: pelo menos atualiza pelo wamid
    await sb.from('webchat_messages').update({ delivery_status: status }).eq('meta_message_id', id);
  }
}

