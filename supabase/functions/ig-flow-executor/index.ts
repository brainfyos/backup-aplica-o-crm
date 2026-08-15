// ig-flow-executor — executa blocos de um instagram_flow linearmente.
// Contexto: { flow_id, connection_id, trigger_source, source_id?, sender_ig_id?, comment_id?, conversation_id?, trigger_text?, dry_run? }

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function supa() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

async function acquireConversationLock(sb: SupabaseClient, conversationId: string, ttlMs = 45_000): Promise<string | null> {
  const { data, error } = await sb.rpc('try_acquire_conversation_lock_token', {
    p_conv: conversationId,
    p_ttl_ms: ttlMs,
  });
  if (error) {
    console.error('[ig-flow-executor] conversation lock unavailable; failing closed', error.message);
    return null;
  }
  return typeof data === 'string' ? data : null;
}

async function releaseConversationLock(sb: SupabaseClient, conversationId: string, lockToken: string): Promise<void> {
  try {
    const { error } = await sb.rpc('release_conversation_lock_token', {
      p_conv: conversationId,
      p_lock_token: lockToken,
    });
    if (error) console.warn('[ig-flow-executor] failed to release conversation lock', error.message);
  } catch (error) {
    console.warn('[ig-flow-executor] failed to release conversation lock', error);
  }
}

function textVariants(data: any): string[] {
  const raw = [
    data?.text,
    ...(Array.isArray(data?.variations) ? data.variations : []),
  ];
  return Array.from(new Set(raw.map((value) => String(value ?? '').trim()).filter(Boolean)));
}

function selectTextVariant(data: any): { text: string; index: number; count: number } {
  const variants = textVariants(data);
  if (variants.length === 0) return { text: '', index: -1, count: 0 };
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const index = random[0] % variants.length;
  return { text: variants[index], index, count: variants.length };
}

type StepResult = { block_id: string; type: string; ok: boolean; error?: string; info?: any; duration_ms?: number };

const BLOCK_TIMEOUT_MS = 25_000;
const INTERNAL_CALL_TIMEOUT_MS = 18_000;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const bearerToken = authHeader.slice('Bearer '.length).trim();
  const isInternalCall = bearerToken === serviceKey;
  let callerUserId: string | null = null;
  if (!isInternalCall) {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: authData } = await authClient.auth.getUser(bearerToken);
    callerUserId = authData?.user?.id ?? null;
    if (!callerUserId) return json({ error: 'unauthorized' }, 401);
  }

  const sb = supa();
  const ctx: any = await req.json().catch(() => ({}));
  const { action, flow_id, connection_id, trigger_source, source_id, sender_ig_id, comment_id, conversation_id, trigger_text, dry_run } = ctx ?? {};

  if (!flow_id) return json({ error: 'flow_id required' }, 400);

  const { data: flow } = await sb.from('instagram_flows').select('*').eq('id', flow_id).maybeSingle();
  if (!flow) return json({ error: 'flow not found' }, 404);
  if (!isInternalCall) {
    const [{ data: belongs }, { data: superRoles }] = await Promise.all([
      sb.rpc('user_belongs_to_organization', { _user_id: callerUserId, _org_id: flow.organization_id }),
      sb.from('user_roles').select('role').eq('user_id', callerUserId).eq('role', 'super_admin').limit(1),
    ]);
    if (!belongs && (superRoles?.length ?? 0) === 0) return json({ error: 'forbidden' }, 403);
  }
  if (action === 'repair_failed_runs') {
    const result = await repairFailedRuns(sb, flow, Math.min(Math.max(Number(ctx.limit) || 50, 1), 100));
    return json({ ok: true, ...result });
  }
  if (!dry_run && flow.status !== 'active') return json({ ok: true, skipped: 'flow not active' });

  // Limpa somente execuções antigas desta organização. O valor de finished_at
  // é operacional; a duração real deve ser calculada pelos passos já gravados.
  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await sb.from('instagram_flow_runs').update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: 'executor_crash_or_timeout',
    })
      .eq('organization_id', flow.organization_id)
      .eq('status', 'running')
      .lt('started_at', cutoff);
  } catch (_) { /* non-fatal */ }

  const connId = connection_id ?? flow.connection_id;
  if (flow.connection_id && connId !== flow.connection_id) {
    return json({ error: 'connection does not belong to this flow' }, 403);
  }
  if (!dry_run && !connId) return json({ error: 'flow connection required' }, 422);
  if (connId) {
    const { data: connection } = await sb
      .from('instagram_connections')
      .select('id, organization_id, status')
      .eq('id', connId)
      .maybeSingle();
    if (!connection || connection.organization_id !== flow.organization_id) {
      return json({ error: 'connection does not belong to flow organization' }, 403);
    }
    if (!dry_run && !['active', 'partial'].includes(String(connection.status))) {
      return json({ error: 'connection inactive' }, 422);
    }
  }

  // Dedup por comentário
  if (!dry_run && comment_id && connId) {
    const { error: dedupErr } = await sb.from('instagram_comment_replies')
      .insert({ connection_id: connId, comment_id, flow_id });
    if (dedupErr && (dedupErr as any).code === '23505') {
      return json({ ok: true, skipped: 'duplicate_comment' });
    }
  }

  // throttle por sender — grava run visível como 'skipped' em vez de sumir
  if (!dry_run && !ctx.resume_from_block_id && sender_ig_id && flow.throttle_per_sender_hours > 0) {
    const cutoff = new Date(Date.now() - flow.throttle_per_sender_hours * 3600 * 1000).toISOString();
    const { data: recent } = await sb.from('instagram_flow_runs')
      .select('id, started_at').eq('flow_id', flow_id).eq('sender_ig_id', sender_ig_id)
      .in('status', ['completed', 'partial', 'running'])
      .gte('started_at', cutoff).order('started_at', { ascending: false }).limit(1);
    if (recent && recent.length > 0) {
      const now = new Date().toISOString();
      const nextAllowedAt = new Date(
        new Date(recent[0].started_at).getTime() + flow.throttle_per_sender_hours * 3600 * 1000,
      ).toISOString();
      await sb.from('instagram_flow_runs').insert({
        organization_id: flow.organization_id,
        flow_id,
        connection_id: connId,
        trigger_source: trigger_source || 'manual',
        source_id: source_id ?? comment_id ?? null,
        sender_ig_id,
        conversation_id: conversation_id ?? null,
        status: 'skipped',
        error: 'throttled_by_sender',
        started_at: now,
        finished_at: now,
        payload: {
          trigger_text,
          ctx,
          skip_reason: 'throttled_by_sender',
          throttle_hours: flow.throttle_per_sender_hours,
          previous_run_id: recent[0].id,
          previous_run_at: recent[0].started_at,
          next_allowed_at: nextAllowedAt,
        },
      });
      return json({ ok: true, skipped: 'throttled', throttle_hours: flow.throttle_per_sender_hours, next_allowed_at: nextAllowedAt });
    }
  }


  const blocks: any[] = Array.isArray(flow.flow_blocks) ? flow.flow_blocks : [];
  const startId: string | null = ctx.resume_from_block_id || flow.start_block_id || blocks[0]?.id || null;
  if (!startId) return json({ ok: true, skipped: 'empty flow' });

  // Para comment triggers: resolver eagerly conversa + lead pelo sender_ig_id.
  // Assim os blocos apply_tag / assign_lead / enroll_cadence funcionam mesmo sem DM prévia,
  // e o private_reply enviado depois aparece no Conversas.
  if (!dry_run && trigger_source === 'comment' && sender_ig_id && connId && !conversation_id) {
    try {
      const resolved = await ensureConversationAndLead(sb, flow, connId, sender_ig_id, ctx.sender_name);
      if (resolved.conversation_id) ctx.conversation_id = resolved.conversation_id;
      if (resolved.lead_id) ctx.lead_id = resolved.lead_id;
    } catch (e) {
      console.error('[ig-flow-executor] resolve conversation error', e);
    }
  }

  let runId: string | null = null;
  if (!dry_run) {
    const { data: run, error: runError } = await sb.from('instagram_flow_runs').insert({
      organization_id: flow.organization_id,
      flow_id,
      connection_id: connId,
      trigger_source: trigger_source || 'manual',
      source_id: source_id ?? comment_id ?? null,
      sender_ig_id: sender_ig_id ?? null,
      conversation_id: ctx.conversation_id ?? null,
      status: 'running',
      payload: { trigger_text, ctx },
    }).select('id').single();
    if (runError && (runError as any).code === '23505') {
      return json({ ok: true, skipped: 'duplicate_event' });
    }
    if (runError) return json({ error: runError.message ?? 'failed to create flow run' }, 500);
    runId = run?.id ?? null;
    ctx.run_id = runId;
  }

  const executed: string[] = [];
  const stepResults: StepResult[] = [];
  const dryPlan: Array<{ block_id: string; type: string; action: string; preview?: string }> = [];
  let awaitingInteraction = false;

  try {
    const byId = new Map(blocks.map(b => [b.id, b]));
    let currentId: string | null = startId;
    let safety = 50;
    while (currentId && safety-- > 0) {
      const block = byId.get(currentId);
      if (!block) break;
      executed.push(block.id);
      let nextOverride: string | null = null;
      if (dry_run) {
        nextOverride = simulateBlock(block, ctx, dryPlan);
      } else {
        const started = Date.now();
        console.log('[ig-flow-executor] block_start', { run_id: runId, block_id: block.id, type: block.type, comment_id: ctx.comment_id ?? null });
        const res = await executeBlockWithTimeout(sb, flow, block, ctx);
        console.log('[ig-flow-executor] block_end', { run_id: runId, block_id: block.id, type: block.type, ok: res.ok, error: res.error?.slice?.(0, 300) });
        stepResults.push({
          block_id: block.id,
          type: block.type,
          ok: res.ok,
          error: res.error,
          info: res.info,
          duration_ms: Date.now() - started,
        });
        if (runId) {
          await sb.from('instagram_flow_runs').update({
            payload: { trigger_text, ctx, executed: [...executed], step_results: [...stepResults] },
          }).eq('id', runId);
        }
        nextOverride = res.next ?? null;
        if (res.pause) {
          awaitingInteraction = true;
          break;
        }
      }

      currentId = nextOverride ?? (block.next_block_id || block.data?.next_block_id || null);
    }
    if (dry_run) return json({ ok: true, dry_run: true, plan: dryPlan, executed });

    const failedCount = stepResults.filter(s => !s.ok).length;
    const finalStatus = failedCount === 0 ? 'completed' : failedCount === stepResults.length ? 'failed' : 'partial';
    await sb.from('instagram_flow_runs').update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      conversation_id: ctx.conversation_id ?? null,
      error: failedCount > 0 ? stepResults.filter(s => !s.ok).map(s => `${s.type}: ${s.error}`).join(' | ').slice(0, 500) : null,
      payload: { trigger_text, ctx, executed, step_results: stepResults, awaiting_interaction: awaitingInteraction },
    }).eq('id', runId);
    return json({ ok: true, run_id: runId, executed, step_results: stepResults, status: finalStatus, awaiting_interaction: awaitingInteraction });
  } catch (e) {
    console.error('[ig-flow-executor] fatal', e);
    if (!dry_run) {
      await sb.from('instagram_flow_runs').update({
        status: 'failed', finished_at: new Date().toISOString(), error: String((e as Error).message ?? e),
        payload: { trigger_text, ctx, executed, step_results: stepResults },
      }).eq('id', runId);
    }
    return json({ error: String(e) }, 500);
  }
});

async function repairFailedRuns(sb: any, flow: any, limit: number) {
  const { data: candidates, error } = await sb
    .from('instagram_flow_runs')
    .select('*')
    .eq('flow_id', flow.id)
    .in('status', ['failed', 'partial', 'running'])
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const summary = {
    inspected: candidates?.length ?? 0,
    waiting_interaction: 0,
    resumed: 0,
    resolved_warning: 0,
    skipped: 0,
    errors: [] as Array<{ run_id: string; error: string }>,
  };
  const blocks: any[] = Array.isArray(flow.flow_blocks) ? flow.flow_blocks : [];
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const staleCutoff = Date.now() - 10 * 60 * 1000;

  for (const run of candidates ?? []) {
    try {
      const payload = run.payload && typeof run.payload === 'object' ? run.payload : {};
      const previousRepair = payload.bulk_retry?.status;
      if (['waiting_interaction', 'resumed', 'resolved_warning'].includes(previousRepair)) {
        summary.skipped++;
        continue;
      }
      if (run.status === 'running' && new Date(run.started_at).getTime() > staleCutoff) {
        summary.skipped++;
        continue;
      }

      const steps: any[] = Array.isArray(payload.step_results) ? payload.step_results : [];
      const openingIndex = steps.findIndex((step) => step.type === 'ig_private_reply' && step.ok);
      const nonFatalOnly = steps.some((step) => !step.ok)
        && steps.filter((step) => !step.ok).every((step) => (
          step.type === 'ig_like_comment'
          && /Authorization Error|100\/33/i.test(String(step.error ?? ''))
        ));

      if (nonFatalOnly) {
        await sb.from('instagram_flow_runs').update({
          status: 'completed',
          error: null,
          finished_at: run.finished_at ?? new Date().toISOString(),
          payload: {
            ...payload,
            bulk_retry: { status: 'resolved_warning', repaired_at: new Date().toISOString() },
          },
        }).eq('id', run.id);
        summary.resolved_warning++;
        continue;
      }

      if (openingIndex < 0 || !run.connection_id || !run.sender_ig_id) {
        summary.skipped++;
        continue;
      }

      const failedAfterOpening = steps.slice(openingIndex + 1).find((step) => !step.ok);
      const openingBlock = blockById.get(steps[openingIndex]?.block_id);
      const resumeBlockId = failedAfterOpening?.block_id
        ?? openingBlock?.next_block_id
        ?? openingBlock?.data?.next_block_id
        ?? null;
      if (!resumeBlockId || !blockById.has(resumeBlockId)) {
        summary.skipped++;
        continue;
      }

      let latestInbound: any = null;
      if (run.conversation_id) {
        const inboundResult = await sb
          .from('webchat_messages')
          .select('id, content, created_at')
          .eq('conversation_id', run.conversation_id)
          .eq('direction', 'inbound')
          .gt('created_at', run.started_at)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        latestInbound = inboundResult.data ?? null;
      }

      if (latestInbound) {
        const execution = await safeInvoke(sb, 'ig-flow-executor', {
          flow_id: flow.id,
          connection_id: run.connection_id,
          trigger_source: 'dm',
          source_id: `bulk-retry:${run.id}:${latestInbound.id}`,
          sender_ig_id: run.sender_ig_id,
          conversation_id: run.conversation_id,
          trigger_text: latestInbound.content ?? '',
          resume_from_block_id: resumeBlockId,
        });
        if (!execution.ok || execution.data?.error) {
          throw new Error(execution.error ?? execution.data?.error ?? 'Falha ao retomar execução');
        }
        await sb.from('instagram_flow_runs').update({
          payload: {
            ...payload,
            bulk_retry: {
              status: 'resumed',
              repaired_at: new Date().toISOString(),
              resumed_run_id: execution.data?.run_id ?? null,
            },
          },
        }).eq('id', run.id);
        summary.resumed++;
        continue;
      }

      const { data: existingContinuation } = await sb
        .from('instagram_flow_continuations')
        .select('id')
        .eq('connection_id', run.connection_id)
        .eq('flow_id', flow.id)
        .eq('sender_ig_id', run.sender_ig_id)
        .eq('status', 'pending')
        .maybeSingle();

      if (!existingContinuation) {
        const savedContext = payload.ctx ?? {};
        const { error: continuationError } = await sb.from('instagram_flow_continuations').insert({
          organization_id: flow.organization_id,
          flow_id: flow.id,
          run_id: run.id,
          connection_id: run.connection_id,
          sender_ig_id: run.sender_ig_id,
          conversation_id: run.conversation_id ?? savedContext.conversation_id ?? null,
          comment_id: savedContext.comment_id ?? (run.trigger_source === 'comment' ? run.source_id : null),
          resume_block_id: resumeBlockId,
          interaction_payload: null,
          context: {
            trigger_text: payload.trigger_text ?? savedContext.trigger_text ?? '',
            sender_name: savedContext.sender_name ?? null,
            lead_id: savedContext.lead_id ?? null,
          },
        });
        if (continuationError) throw continuationError;
      }

      await sb.from('instagram_flow_runs').update({
        payload: {
          ...payload,
          bulk_retry: {
            status: 'waiting_interaction',
            repaired_at: new Date().toISOString(),
            resume_block_id: resumeBlockId,
          },
        },
      }).eq('id', run.id);
      summary.waiting_interaction++;
    } catch (runError) {
      summary.errors.push({
        run_id: run.id,
        error: String((runError as Error)?.message ?? runError).slice(0, 500),
      });
    }
  }

  return summary;
}

async function ensureConversationAndLead(
  sb: any,
  flow: any,
  connId: string,
  senderIgId: string,
  senderName?: string | null,
): Promise<{ conversation_id: string | null; lead_id: string | null }> {
  // 1) Conversa
  const { data: existing } = await sb
    .from('webchat_conversations')
    .select('id, lead_id')
    .eq('organization_id', flow.organization_id)
    .eq('channel', 'instagram')
    .eq('instagram_connection_id', connId)
    .eq('ig_sender_id', senderIgId)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  let convId: string | null = existing?.id ?? null;
  let leadId: string | null = existing?.lead_id ?? null;

  if (!convId) {
    const { data: widget } = await sb
      .from('webchat_widgets')
      .select('id')
      .eq('organization_id', flow.organization_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    const { data: created, error: convErr } = await sb.from('webchat_conversations').insert({
      organization_id: flow.organization_id,
      widget_id: widget?.id ?? null,
      channel: 'instagram',
      status: 'bot_active',
      visitor_id: crypto.randomUUID(),
      visitor_name: senderName || `Instagram ${senderIgId.slice(-4)}`,
      instagram_connection_id: connId,
      ig_sender_id: senderIgId,
      last_message_at: new Date().toISOString(),
    }).select('id').single();
    if (convErr) throw convErr;
    convId = created.id;
  }

  // 2) Lead — auto-create se não existir
  if (!leadId && convId) {
    const leadName = senderName || `Instagram ${senderIgId.slice(-4)}`;
    const { data: createdLead, error: leadErr } = await sb.from('leads').insert({
      organization_id: flow.organization_id,
      name: leadName,
      source: 'instagram',
      notes: `Instagram: @${senderName ?? ''} (id ${senderIgId})`,
    }).select('id').single();
    if (!leadErr && createdLead?.id) {
      leadId = createdLead.id;
      await sb.from('webchat_conversations').update({ lead_id: leadId }).eq('id', convId);
    } else if (leadErr) {
      console.error('[ig-flow-executor] auto-create lead failed', leadErr);
    }
  }

  return { conversation_id: convId, lead_id: leadId };
}

function simulateBlock(block: any, ctx: any, plan: any[]): string | null {
  const d = block.data ?? {};
  const type = block.type;
  const variants = textVariants(d);
  const previewSource = variants[0] ?? d.prompt ?? '';
  const preview = renderTemplate(previewSource, ctx).slice(0, 200)
    + (variants.length > 1 ? ` (+${variants.length - 1} variações)` : '');
  switch (type) {
    case 'ig_reply_comment': plan.push({ block_id: block.id, type, action: 'Responder comentário publicamente', preview }); return null;
    case 'ig_private_reply': plan.push({ block_id: block.id, type, action: 'Enviar DM privada ao autor do comentário', preview }); return null;
    case 'ig_like_comment': plan.push({ block_id: block.id, type, action: 'Curtir comentário' }); return null;
    case 'ig_send_dm': case 'message': case 'text':
      plan.push({ block_id: block.id, type, action: 'Enviar mensagem no DM', preview }); return null;
    case 'wait': plan.push({ block_id: block.id, type, action: `Aguardar ${d.seconds ?? 1}s` }); return null;
    case 'apply_tag': plan.push({ block_id: block.id, type, action: `Aplicar tag ${d.tag_name ?? d.tag_id ?? '?'}` }); return null;
    case 'ai_takeover': plan.push({ block_id: block.id, type, action: 'IA assume a conversa', preview }); return null;
    case 'enroll_cadence': plan.push({ block_id: block.id, type, action: `Inscrever lead na cadência ${d.cadence_name ?? d.cadence_id ?? '?'}` }); return null;
    case 'assign_lead': plan.push({ block_id: block.id, type, action: `Atribuir lead` }); return null;
    case 'condition_text': case 'condition': {
      const keywords: string[] = Array.isArray(d.keywords) ? d.keywords : [];
      const match = d.match ?? 'any';
      const text = String(ctx.trigger_text ?? '').toLowerCase();
      let ok = false;
      if (keywords.length === 0) ok = true;
      else if (match === 'all') ok = keywords.every(k => text.includes(String(k).toLowerCase()));
      else if (match === 'exact') ok = keywords.some(k => text.trim() === String(k).toLowerCase().trim());
      else ok = keywords.some(k => text.includes(String(k).toLowerCase()));
      plan.push({ block_id: block.id, type, action: `Condição: ${ok ? 'verdadeiro' : 'falso'}` });
      return ok ? (d.true_next_block_id ?? null) : (d.false_next_block_id ?? null);
    }
  }
  return null;
}

async function safeInvoke(_sb: any, fn: string, body: any): Promise<{ ok: boolean; data?: any; error?: string }> {
  const baseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!baseUrl || !serviceKey) return { ok: false, error: 'backend_internal_auth_missing' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERNAL_CALL_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw ? { raw } : null; }
    if (!response.ok || (data && typeof data === 'object' && data.error)) {
      const message = data?.message ?? data?.error ?? data?.details ?? raw ?? `HTTP ${response.status}`;
      const code = data?.code ? ` [${data.code}${data?.subcode ? `/${data.subcode}` : ''}]` : '';
      return { ok: false, error: `${String(message)}${code}`.slice(0, 1000), data };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e as Error)?.name === 'AbortError'
      ? `internal_call_timeout_${Math.round(INTERNAL_CALL_TIMEOUT_MS / 1000)}s:${fn}`
      : ((e as Error)?.message ?? String(e)) };
  } finally {
    clearTimeout(timer);
  }
}

async function executeBlockWithTimeout(
  sb: any,
  flow: any,
  block: any,
  ctx: any,
): Promise<{ ok: boolean; error?: string; info?: any; next?: string | null; pause?: boolean }> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      executeBlock(sb, flow, block, ctx),
      new Promise<{ ok: boolean; error: string }>((resolve) => {
        timer = setTimeout(() => resolve({
          ok: false,
          error: `timeout_${Math.round(BLOCK_TIMEOUT_MS / 1000)}s`,
        }), BLOCK_TIMEOUT_MS) as unknown as number;
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function executeBlock(
  sb: any,
  flow: any,
  block: any,
  ctx: any,
): Promise<{ ok: boolean; error?: string; info?: any; next?: string | null; pause?: boolean }> {
  const d = block.data ?? {};
  const type = block.type;
  const connId = ctx.connection_id ?? flow.connection_id;

  switch (type) {
    case 'ig_reply_comment': {
      const selected = selectTextVariant(d);
      if (!ctx.comment_id || !selected.text) return { ok: false, error: 'faltam comment_id/text' };
      const renderedText = renderTemplate(selected.text, ctx);
      const r = await safeInvoke(sb, 'instagram-send', {
        type: 'comment_reply', connection_id: connId, comment_id: ctx.comment_id, text: renderedText,
      });
      return {
        ok: r.ok,
        error: r.error,
        info: {
          ...(r.data ?? {}),
          selected_text: renderedText,
          variation_index: selected.index,
          variation_count: selected.count,
        },
      };
    }
    case 'ig_private_reply': {
      if (!ctx.comment_id || !d.text) return { ok: false, error: 'faltam comment_id/text' };
      const r = await safeInvoke(sb, 'instagram-send', {
        type: 'private_reply',
        connection_id: connId,
        comment_id: ctx.comment_id,
        sender_ig_id: ctx.sender_ig_id ?? null,
        sender_name: ctx.sender_name ?? null,
        text: renderTemplate(d.text, ctx),
        quick_replies: d.quick_replies,
        buttons: d.buttons,
      });
      // Se instagram-send criou/retornou conversation_id, usa daqui pra frente
      if (r.ok && r.data?.conversation_id) ctx.conversation_id = r.data.conversation_id;
      if (r.ok) ctx.__pr_used_comment_id = ctx.comment_id;
      const quickReplies = Array.isArray(d.quick_replies) ? d.quick_replies : [];
      const resumeBlockId = block.next_block_id || d.next_block_id || null;
      if (
        r.ok
        && ctx.trigger_source === 'comment'
        && ctx.sender_ig_id
        && resumeBlockId
      ) {
        const interactionPayload = String(quickReplies[0]?.payload ?? '').trim() || null;
        await sb.from('instagram_flow_continuations').update({
          status: 'cancelled',
          last_error: 'replaced_by_new_opening_dm',
        })
          .eq('connection_id', connId)
          .eq('flow_id', flow.id)
          .eq('sender_ig_id', ctx.sender_ig_id)
          .eq('status', 'pending');
        const { error: continuationError } = await sb.from('instagram_flow_continuations').insert({
          organization_id: flow.organization_id,
          flow_id: flow.id,
          run_id: ctx.run_id ?? null,
          connection_id: connId,
          sender_ig_id: ctx.sender_ig_id,
          conversation_id: ctx.conversation_id ?? null,
          comment_id: ctx.comment_id,
          resume_block_id: resumeBlockId,
          interaction_payload: interactionPayload,
          context: {
            trigger_text: ctx.trigger_text ?? '',
            sender_name: ctx.sender_name ?? null,
            lead_id: ctx.lead_id ?? null,
          },
        });
        if (continuationError) {
          return {
            ok: false,
            error: `Falha ao preparar a continuaÃ§Ã£o: ${continuationError.message}`,
            info: r.data,
          };
        }
        return {
          ok: true,
          info: { ...(r.data ?? {}), awaiting_interaction: true },
          pause: true,
        };
      }
      return { ok: r.ok, error: r.error, info: r.data };
    }
    case 'ig_like_comment': {
      if (!ctx.comment_id) return { ok: false, error: 'falta comment_id' };
      const r = await safeInvoke(sb, 'instagram-send', {
        type: 'like_comment', connection_id: connId, comment_id: ctx.comment_id,
      });
      // Curtir o comentário é uma ação complementar. A Meta pode recusá-la
      // mesmo quando responder ao comentário e enviar a Opening DM continuam
      // permitidos; nesse caso registramos o aviso sem derrubar o fluxo.
      if (!r.ok && /Authorization Error|100\/33/i.test(String(r.error ?? ''))) {
        return {
          ok: true,
          info: { ...(r.data ?? {}), skipped: true, warning: r.error },
        };
      }
      return { ok: r.ok, error: r.error, info: r.data };
    }
    case 'ig_send_dm': case 'message': case 'text': {
      if (!ctx.sender_ig_id && !ctx.conversation_id) return { ok: false, error: 'sem destinatário' };
      const text = renderTemplate(d.text ?? d.content ?? '', ctx);

      // Comentários permitem uma única Opening DM explícita. Nunca convertemos
      // silenciosamente um bloco de DM em private reply, porque isso mascara uma
      // sequência inválida e tenta continuar sem opt-in do usuário.
      if (ctx.comment_id) {
        return {
          ok: false,
          error: 'Use o bloco Opening DM para responder ao comentário. DMs seguintes exigem uma nova interação do usuário.',
        };
      }

      const r = await safeInvoke(sb, 'instagram-send', {
        type: 'dm',
        connection_id: connId,
        conversation_id: ctx.conversation_id,
        recipient_id: ctx.sender_ig_id,
        text,
        media: d.media,
        quick_replies: d.quick_replies,
        buttons: d.buttons,
      });
      if (r.ok) {
        if (r.data?.conversation_id) ctx.conversation_id = r.data.conversation_id;
        return { ok: true, info: { ...(r.data ?? {}), used: 'dm' } };
      }

      const outOfWindow = /OUT_OF_WINDOW|janela 24h/i.test(String(r.error ?? '')) || r.data?.error === 'OUT_OF_WINDOW';
      if (outOfWindow) {
        return {
          ok: false,
          error: 'Sem janela de 24h aberta. Aguarde o usuário responder ou interagir antes de enviar outra DM.',
          info: r.data,
        };
      }

      return { ok: r.ok, error: r.error, info: r.data };
    }
    case 'wait': case 'delay': {
      const secs = Math.min(30, Number(d.seconds ?? d.delay_seconds ?? 1));
      await new Promise((r) => setTimeout(r, secs * 1000));
      return { ok: true };
    }
    case 'apply_tag': {
      if (!d.tag_id) return { ok: false, error: 'tag_id ausente no bloco' };
      // Resolver lead_id em cascata: ctx.lead_id → conv.lead_id → criar
      let leadId: string | null = ctx.lead_id ?? null;
      if (!leadId && ctx.conversation_id) {
        const { data: conv } = await sb.from('webchat_conversations').select('lead_id').eq('id', ctx.conversation_id).maybeSingle();
        leadId = conv?.lead_id ?? null;
      }
      if (!leadId && ctx.sender_ig_id) {
        try {
          const resolved = await ensureConversationAndLead(sb, flow, connId, ctx.sender_ig_id, ctx.sender_name);
          if (resolved.conversation_id) ctx.conversation_id = resolved.conversation_id;
          if (resolved.lead_id) { leadId = resolved.lead_id; ctx.lead_id = leadId; }
        } catch (e) {
          return { ok: false, error: `resolve lead: ${(e as Error).message}` };
        }
      }
      if (!leadId) return { ok: false, error: 'sem lead para aplicar tag' };
      const { error: tagErr } = await sb.from('lead_tag_assignments').upsert(
        { lead_id: leadId, tag_id: d.tag_id, source: 'automation' },
        { onConflict: 'lead_id,tag_id' },
      );
      if (tagErr) return { ok: false, error: tagErr.message };
      return { ok: true, info: { lead_id: leadId, tag_id: d.tag_id } };
    }
    case 'ai_takeover': {
      if (!ctx.conversation_id) return { ok: false, error: 'sem conversation_id' };
      if (!d.agent_id) return { ok: false, error: 'agent_id ausente' };
      const { data: agent } = await sb
        .from('product_agents')
        .select('id, name, organization_id, is_active')
        .eq('id', d.agent_id)
        .eq('organization_id', flow.organization_id)
        .eq('is_active', true)
        .maybeSingle();
      if (!agent) return { ok: false, error: 'agente inválido, inativo ou de outra organização' };

      const { data: assignedConversation, error: takeoverError } = await sb
        .from('webchat_conversations')
        .update({
          current_agent_id: agent.id,
          instagram_ai_flow_id: flow.id,
          status: 'bot_active',
          needs_human: false,
          assigned_user_id: null,
        })
        .eq('id', ctx.conversation_id)
        .eq('organization_id', flow.organization_id)
        .select('id')
        .maybeSingle();
      if (takeoverError) return { ok: false, error: takeoverError.message };
      if (!assignedConversation) return { ok: false, error: 'conversa não pertence à organização do fluxo' };

      const lockToken = await acquireConversationLock(sb, ctx.conversation_id);
      if (!lockToken) return { ok: true, info: { skipped: 'conversation_locked' } };
      try {
        const msg = [d.prompt, ctx.trigger_text].filter(Boolean).join('\n\n') || '[iniciar atendimento]';
        const r = await safeInvoke(sb, 'webchat-bot', {
          conversation_id: ctx.conversation_id, message: msg, channel: 'instagram',
          trigger: 'ig_flow_ai_takeover', agent_id: agent.id,
        });
        if (!r.ok) return { ok: false, error: r.error };
        const chunks: string[] = Array.isArray(r.data?.chunks) ? r.data.chunks : (r.data?.response ? [r.data.response] : []);
        for (const chunk of chunks.filter((value) => typeof value === 'string' && value.trim()).slice(0, 2)) {
          if (!chunk) continue;
          await safeInvoke(sb, 'instagram-send', {
            type: 'dm', connection_id: connId, conversation_id: ctx.conversation_id, recipient_id: ctx.sender_ig_id, text: chunk,
            skip_db_insert: true,
          });
          await new Promise((r) => setTimeout(r, 800));
        }
        return { ok: true, info: { agent_id: agent.id, agent_name: agent.name, chunks: Math.min(chunks.length, 2) } };
      } finally {
        await releaseConversationLock(sb, ctx.conversation_id, lockToken);
      }
    }
    case 'enroll_cadence': {
      if (!d.cadence_id) return { ok: false, error: 'cadence_id ausente' };
      let leadId: string | null = ctx.lead_id ?? null;
      if (!leadId && ctx.conversation_id) {
        const { data: conv } = await sb.from('webchat_conversations').select('lead_id').eq('id', ctx.conversation_id).maybeSingle();
        leadId = conv?.lead_id ?? null;
      }
      if (!leadId) return { ok: false, error: 'sem lead para cadência' };
      const r = await safeInvoke(sb, 'cadence-enroll', {
        cadence_id: d.cadence_id, lead_ids: [leadId], source: 'instagram_flow', source_ref: { flow_id: flow.id },
      });
      return { ok: r.ok, error: r.error };
    }
    case 'assign_lead': {
      let leadId: string | null = ctx.lead_id ?? null;
      if (!leadId && ctx.conversation_id) {
        const { data: conv } = await sb.from('webchat_conversations').select('lead_id').eq('id', ctx.conversation_id).maybeSingle();
        leadId = conv?.lead_id ?? null;
      }
      if (!leadId) return { ok: false, error: 'sem lead para atribuir' };
      const patch: any = {};
      if (d.sector_id) patch.sector_id = d.sector_id;
      if (d.user_id) { patch.assigned_seller_id = d.user_id; patch.closer_id = d.user_id; }
      if (Object.keys(patch).length) {
        const { error: upErr } = await sb.from('leads').update(patch).eq('id', leadId);
        if (upErr) return { ok: false, error: upErr.message };
        if (ctx.conversation_id) {
          if (d.sector_id) await sb.from('webchat_conversations').update({ sector_id: d.sector_id }).eq('id', ctx.conversation_id);
          if (d.user_id) await sb.from('webchat_conversations').update({ assigned_to: d.user_id }).eq('id', ctx.conversation_id);
        }
      }
      return { ok: true };
    }
    case 'condition_text': case 'condition': {
      const keywords: string[] = Array.isArray(d.keywords) ? d.keywords : [];
      const match = d.match ?? 'any';
      const text = String(ctx.trigger_text ?? '').toLowerCase();
      let ok = false;
      if (keywords.length === 0) ok = true;
      else if (match === 'all') ok = keywords.every(k => text.includes(String(k).toLowerCase()));
      else if (match === 'exact') ok = keywords.some(k => text.trim() === String(k).toLowerCase().trim());
      else ok = keywords.some(k => text.includes(String(k).toLowerCase()));
      return { ok: true, next: ok ? (d.true_next_block_id ?? null) : (d.false_next_block_id ?? null) };
    }
    default:
      console.warn('[ig-flow-executor] unknown block type', type);
      return { ok: false, error: `bloco desconhecido: ${type}` };
  }
}

function renderTemplate(t: string, ctx: any): string {
  return String(t ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    if (k === 'text' || k === 'trigger_text') return String(ctx.trigger_text ?? '');
    if (k === 'sender') return String(ctx.sender_name ?? '');
    return '';
  });
}
