// Bot-Loop Guard
// ---------------------------------------------------------------------------
// Detects when the other side of the conversation is another bot/AI/autoresponder
// and aborts our AI reply BEFORE any token is spent on the gateway.
//
// Sensitivity: Balanced.
//   - 1 STRONG signal trips immediately
//   - 2 WEAK signals within 3 turns / 30min trip
//
// Effect on trip:
//   - Conversation marked as 'waiting_human' (silent — no message back)
//   - Cadences for the lead are stopped
//   - Queued campaign_targets are cancelled
//   - admin_notification is inserted
//   - ai_router_failures gets an audit row
//
// Used by: webchat-bot, booking-reply-ai (inbound AI replies),
//          and as a passive check by manual-outreach / cadence-tick / campaign-dispatcher
//          (those call isBotLoopActive before sending).

export type BotLoopStrike = 'strong' | 'weak' | null;

export interface BotLoopEvaluation {
  strike: BotLoopStrike;
  reason: string | null;
}

const STRONG_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /\bsou\s+(?:um[a]?\s+)?(?:assistente|atendente|bot|rob[ôo]|ia|intelig[êe]ncia\s+artificial)\b/i, reason: 'self_declares_ai_pt' },
  { re: /\bassistente\s+virtual\b/i, reason: 'virtual_assistant_pt' },
  { re: /\beste?\s+(?:atendimento|canal|n[úu]mero)\s+(?:[ée]|est[áa])\s+(?:autom[áa]tico|automatizado)\b/i, reason: 'auto_channel_pt' },
  { re: /\b(respondendo|resposta)\s+automatic[ao]/i, reason: 'auto_reply_pt' },
  { re: /\b(I\s*am|I'?m)\s+(?:an?\s+)?(?:AI|chatbot|bot|virtual\s+assistant|automated\s+assistant)\b/i, reason: 'self_declares_ai_en' },
  { re: /\bas\s+an\s+AI\b/i, reason: 'as_an_ai_en' },
  { re: /\bauto[-\s]?reply\b/i, reason: 'auto_reply_en' },
  { re: /\bout\s+of\s+office\b/i, reason: 'out_of_office_en' },
  { re: /^\s*(?:\[bot\]|🤖|bot:|assistant:)/i, reason: 'bot_prefix' },
];

const GENERIC_GREETING_PATTERNS: RegExp[] = [
  /^\s*(?:ol[áa]|oi|bom\s+dia|boa\s+tarde|boa\s+noite)[!,.\s]+(?:em\s+que\s+posso\s+(?:ajudar|te\s+ajudar)|como\s+posso\s+(?:ajudar|te\s+ajudar))/i,
  /^\s*how\s+can\s+I\s+(?:help|assist)\s+you/i,
  /^\s*hello[!,.\s]+how\s+may\s+I\s+(?:help|assist)/i,
];

export interface EvaluateInput {
  inboundText: string;
  recentInbounds: { content: string; created_at: string }[]; // newest first, up to 3
  lastOutboundText?: string | null;
  isFirstInboundTurn?: boolean;
}

/** Returns the strongest signal found, or null. */
export function evaluateInbound(input: EvaluateInput): BotLoopEvaluation {
  const text = (input.inboundText ?? '').trim();
  if (!text) return { strike: null, reason: null };

  // STRONG
  for (const p of STRONG_PATTERNS) {
    if (p.re.test(text)) return { strike: 'strong', reason: p.reason };
  }

  // WEAK signals
  // 1) sub-human cadence: 3 inbound messages totaling < 4s
  if (input.recentInbounds && input.recentInbounds.length >= 3) {
    const t0 = new Date(input.recentInbounds[2].created_at).getTime();
    const t2 = new Date(input.recentInbounds[0].created_at).getTime();
    if (Number.isFinite(t0) && Number.isFinite(t2) && t2 - t0 >= 0 && t2 - t0 < 4000) {
      return { strike: 'weak', reason: 'sub_human_cadence' };
    }
  }

  // 2) structured first reply: >280 chars + >=2 bullets/numbering
  if (input.isFirstInboundTurn && text.length > 280) {
    const bullets = (text.match(/(^|\n)\s*(?:[-•]|\d+\.)\s+/g) ?? []).length;
    if (bullets >= 2) return { strike: 'weak', reason: 'structured_first_reply' };
  }

  // 3) literal echo of our last outbound (>=80% of our words present in inbound)
  if (input.lastOutboundText) {
    const ours = tokenize(input.lastOutboundText);
    if (ours.length >= 5) {
      const theirs = new Set(tokenize(text));
      const hits = ours.filter((w) => theirs.has(w)).length;
      if (hits / ours.length >= 0.8) {
        return { strike: 'weak', reason: 'echo_of_our_message' };
      }
    }
  }

  // 4) exact-duplicate inbound twice in a row
  if (input.recentInbounds && input.recentInbounds.length >= 2) {
    const a = (input.recentInbounds[0].content ?? '').trim();
    const b = (input.recentInbounds[1].content ?? '').trim();
    if (a && a === b && a.length > 20) {
      return { strike: 'weak', reason: 'duplicate_inbound' };
    }
  }

  // 5) generic greeting coming FROM the lead (not from us)
  for (const re of GENERIC_GREETING_PATTERNS) {
    if (re.test(text)) return { strike: 'weak', reason: 'lead_generic_greeting' };
  }

  return { strike: null, reason: null };
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4); // ignore short stopwords
}

// ---------------------------------------------------------------------------
// Integration with the database
// ---------------------------------------------------------------------------

export interface CheckBotLoopParams {
  conversationId: string;
  organizationId?: string | null;
  inboundText: string;
  /** Newest first. If omitted, the function fetches them. */
  recentInbounds?: { content: string; created_at: string }[];
  lastOutboundText?: string | null;
  isFirstInboundTurn?: boolean;
}

export interface CheckBotLoopResult {
  tripped: boolean;
  reason: string | null;
  strike: BotLoopStrike;
  alreadyDetected: boolean;
}

/** Returns true if the conversation is already flagged as bot-loop. */
export async function isBotLoopActive(sb: any, conversationId: string | null | undefined): Promise<boolean> {
  if (!conversationId) return false;
  try {
    const { data } = await sb
      .from('webchat_conversations')
      .select('bot_loop_detected_at')
      .eq('id', conversationId)
      .maybeSingle();
    return !!data?.bot_loop_detected_at;
  } catch { return false; }
}

/**
 * Main entrypoint. Call this BEFORE invoking the AI gateway.
 * Returns { tripped: true } if the caller must abort the AI reply.
 */
export async function checkBotLoop(sb: any, params: CheckBotLoopParams): Promise<CheckBotLoopResult> {
  const { conversationId, inboundText } = params;
  if (!conversationId) {
    return { tripped: false, reason: null, strike: null, alreadyDetected: false };
  }

  try {
    // Fast path: already flagged.
    const { data: conv } = await sb
      .from('webchat_conversations')
      .select('id, organization_id, bot_loop_detected_at, bot_loop_strike_count, bot_loop_last_strike_at')
      .eq('id', conversationId)
      .maybeSingle();

    if (!conv) return { tripped: false, reason: null, strike: null, alreadyDetected: false };
    if (conv.bot_loop_detected_at) {
      return { tripped: true, reason: 'already_detected', strike: null, alreadyDetected: true };
    }

    const orgId = params.organizationId ?? conv.organization_id;

    // Load recent context if not provided
    let recentInbounds = params.recentInbounds;
    let lastOutboundText = params.lastOutboundText ?? null;
    let isFirstInboundTurn = params.isFirstInboundTurn;

    if (!recentInbounds) {
      const { data: msgs } = await sb
        .from('webchat_messages')
        .select('content, created_at, sender_type')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(20);
      const all = (msgs ?? []) as any[];
      recentInbounds = all.filter((m) => m.sender_type === 'visitor' || m.sender_type === 'lead' || m.sender_type === 'user').slice(0, 3);
      const outbounds = all.filter((m) => m.sender_type === 'agent' || m.sender_type === 'bot' || m.sender_type === 'ai');
      lastOutboundText = outbounds[0]?.content ?? null;
      if (typeof isFirstInboundTurn !== 'boolean') {
        isFirstInboundTurn = recentInbounds.length <= 1;
      }
    }

    // Reset strikes if last strike was >30min ago
    let strikeCount = conv.bot_loop_strike_count ?? 0;
    const lastStrikeAt = conv.bot_loop_last_strike_at ? new Date(conv.bot_loop_last_strike_at).getTime() : 0;
    if (lastStrikeAt && Date.now() - lastStrikeAt > 30 * 60 * 1000) {
      strikeCount = 0;
    }

    const evaluation = evaluateInbound({
      inboundText,
      recentInbounds: recentInbounds!,
      lastOutboundText,
      isFirstInboundTurn,
    });

    if (!evaluation.strike) {
      return { tripped: false, reason: null, strike: null, alreadyDetected: false };
    }

    const willTrip = evaluation.strike === 'strong' || strikeCount + 1 >= 2;

    if (!willTrip) {
      // Just record the weak strike
      await sb.from('webchat_conversations').update({
        bot_loop_strike_count: strikeCount + 1,
        bot_loop_last_strike_at: new Date().toISOString(),
      }).eq('id', conversationId);
      return { tripped: false, reason: evaluation.reason, strike: 'weak', alreadyDetected: false };
    }

    // Trip the guard
    await tripBotLoop(sb, conversationId, orgId, evaluation.reason ?? 'unknown', inboundText);
    return { tripped: true, reason: evaluation.reason, strike: evaluation.strike, alreadyDetected: false };
  } catch (e) {
    console.warn('[bot-loop-guard] check error (non-fatal):', e);
    return { tripped: false, reason: null, strike: null, alreadyDetected: false };
  }
}

/** Marks the conversation as bot-loop, stops cadences, cancels campaigns and notifies admins. */
export async function tripBotLoop(
  sb: any,
  conversationId: string,
  organizationId: string | null | undefined,
  reason: string,
  inboundSample?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  console.warn(`[bot-loop-guard] TRIP conv=${conversationId} reason=${reason}`);

  // 1) Flag conversation
  try {
    await sb.from('webchat_conversations').update({
      status: 'waiting_human',
      current_agent_id: null,
      bot_loop_detected_at: now,
      bot_loop_reason: reason,
      bot_loop_last_strike_at: now,
    }).eq('id', conversationId);
  } catch (e) { console.error('[bot-loop-guard] update conv error', e); }

  // 2) Find the lead (if any) and stop cadences + cancel queued campaigns
  let leadId: string | null = null;
  try {
    const { data: conv } = await sb
      .from('webchat_conversations')
      .select('lead_id')
      .eq('id', conversationId)
      .maybeSingle();
    leadId = (conv as any)?.lead_id ?? null;
  } catch { /* ignore */ }

  if (leadId) {
    try {
      const { data: enrs } = await sb
        .from('cadence_enrollments')
        .select('id')
        .eq('lead_id', leadId)
        .eq('status', 'active');
      for (const e of (enrs ?? [])) {
        try {
          await sb.functions.invoke('cadence-stop', { body: { enrollment_id: (e as any).id, reason: 'bot_loop_detected' } });
        } catch (err) { console.error('[bot-loop-guard] cadence-stop err', err); }
      }
    } catch (e) { console.error('[bot-loop-guard] cadence lookup err', e); }

    try {
      await sb.from('campaign_targets').update({
        status: 'cancelled',
        error: 'bot_loop_detected',
      }).eq('lead_id', leadId).in('status', ['queued', 'sending']);
    } catch (e) { console.error('[bot-loop-guard] campaign_targets cancel err', e); }
  }

  // 3) Admin notification
  try {
    await sb.from('admin_notifications').insert({
      organization_id: organizationId,
      type: 'bot_loop_detected',
      title: 'IA pausada — possível outro bot detectado',
      body: `Conversa pausada automaticamente: motivo "${reason}". Reative na inbox quando confirmar.`,
      severity: 'warning',
      metadata: {
        conversation_id: conversationId,
        reason,
        inbound_sample: (inboundSample ?? '').slice(0, 240),
      },
    });
  } catch (e) { console.error('[bot-loop-guard] admin_notifications insert err', e); }

  // 4) Audit row (best-effort — ai_router_failures schema is { provider, error_type, error_message, ... })
  try {
    await sb.from('ai_router_failures').insert({
      organization_id: organizationId,
      provider: 'guard',
      error_type: 'bot_loop_detected',
      error_message: reason,
      metadata: { conversation_id: conversationId, inbound_sample: (inboundSample ?? '').slice(0, 240) },
    });
  } catch { /* best-effort */ }
}
