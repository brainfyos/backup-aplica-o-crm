import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isServiceRoleRequest, serviceRoleUnauthorizedResponse } from '../_shared/service-auth.ts';
import { ANALYSIS_VERSION, analyzeOpenConversation, type OpenConversationMessage } from '../_shared/mia-open-analysis.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const MAX_MESSAGES = 2_500;
const PAGE_SIZE = 500;

interface QueueJob {
  id: string;
  run_id: string;
  organization_id: string;
  conversation_id: string;
  attempts: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function fetchMessages(admin: SupabaseClient, conversationId: string) {
  const messages: OpenConversationMessage[] = [];
  let total = 0;
  for (let from = 0; from < MAX_MESSAGES; from += PAGE_SIZE) {
    const base = admin.from('webchat_messages');
    const query = (from === 0
      ? base.select('content,direction,sender_type,created_at', { count: 'exact' })
      : base.select('content,direction,sender_type,created_at'))
      .eq('conversation_id', conversationId)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    const { data, error, count } = await query;
    if (error) throw new Error(`Falha ao carregar mensagens: ${error.message}`);
    if (from === 0) total = count ?? data?.length ?? 0;
    messages.push(...((data ?? []) as OpenConversationMessage[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { messages, total: Math.max(total, messages.length) };
}

async function updateRun(admin: SupabaseClient, runId: string) {
  const [{ data: rows, error }, { data: currentRun, error: runError }] = await Promise.all([
    admin.from('mia_open_conversation_analysis_queue').select('status').eq('run_id', runId),
    admin.from('mia_open_report_runs').select('started_at').eq('id', runId).maybeSingle(),
  ]);
  if (error || runError) throw error ?? runError;
  const statuses = (rows ?? []) as Array<{ status: string }>;
  const processed = statuses.filter((row) => ['completed', 'skipped'].includes(row.status)).length;
  const failed = statuses.filter((row) => row.status === 'failed').length;
  const active = statuses.filter((row) => ['pending', 'processing'].includes(row.status)).length;
  const status = active > 0 ? 'running' : failed > 0 ? 'partial' : 'completed';
  const { error: updateError } = await admin.from('mia_open_report_runs').update({
    status,
    processed_total: processed,
    failed_total: failed,
    started_at: currentRun?.started_at ?? new Date().toISOString(),
    completed_at: active === 0 ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', runId);
  if (updateError) throw updateError;
  return { status, processed, failed, remaining: active };
}

async function featureEnabled(admin: SupabaseClient, organizationId: string): Promise<boolean> {
  const { data, error } = await admin.from('organizations')
    .select('plan_id, platform_plans!inner(feature_mia)')
    .eq('id', organizationId)
    .maybeSingle();
  if (error) throw error;
  const plan = (data as { platform_plans?: { feature_mia?: boolean } | null } | null)?.platform_plans;
  return plan?.feature_mia === true;
}

async function markSkipped(admin: SupabaseClient, jobId: string) {
  const { error } = await admin.from('mia_open_conversation_analysis_queue').update({
    status: 'skipped', claimed_at: null, updated_at: new Date().toISOString(),
  }).eq('id', jobId);
  if (error) throw error;
}

async function processJob(admin: SupabaseClient, job: QueueJob) {
  if (!await featureEnabled(admin, job.organization_id)) {
    await markSkipped(admin, job.id);
    return { job, skipped: true, reason: 'feature_disabled' };
  }
  const { data: conversation, error: conversationError } = await admin
    .from('webchat_conversations')
    .select('id,organization_id,lead_id,product_id,status,channel,visitor_name,needs_human,detected_intent,last_inbound_at,last_message_at,assigned_user_id,current_agent_id')
    .eq('id', job.conversation_id)
    .eq('organization_id', job.organization_id)
    .maybeSingle();
  if (conversationError) throw new Error(`Falha ao carregar conversa: ${conversationError.message}`);
  if (!conversation || conversation.status === 'closed') {
    await markSkipped(admin, job.id);
    return { job, skipped: true, reason: 'conversation_closed' };
  }

  const leadPromise = conversation.lead_id
    ? admin.from('leads').select('id,name,temperature,current_stage_id,expected_close_date,next_action,bant_budget,bant_authority,bant_need,bant_timing,product_id').eq('id', conversation.lead_id).eq('organization_id', job.organization_id).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const dealPromise = conversation.lead_id
    ? admin.from('deals').select('id,status,deal_value,plan_name,product_id,updated_at').eq('organization_id', job.organization_id).eq('lead_id', conversation.lead_id).not('status', 'in', '(won,lost,cancelled)').order('deal_value', { ascending: false }).limit(1).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const ownerPromise = conversation.assigned_user_id
    ? admin.from('profiles').select('full_name').eq('id', conversation.assigned_user_id).eq('organization_id', job.organization_id).maybeSingle()
    : conversation.current_agent_id
      ? admin.from('product_agents').select('name').eq('id', conversation.current_agent_id).maybeSingle()
      : Promise.resolve({ data: null, error: null });

  const [{ messages, total }, leadResult, dealResult, ownerResult] = await Promise.all([
    fetchMessages(admin, conversation.id), leadPromise, dealPromise, ownerPromise,
  ]);
  if (leadResult.error) throw new Error(`Falha ao carregar lead: ${leadResult.error.message}`);
  if (dealResult.error) throw new Error(`Falha ao carregar negócio: ${dealResult.error.message}`);
  if (ownerResult.error) throw new Error(`Falha ao carregar responsável: ${ownerResult.error.message}`);

  const productId = conversation.product_id ?? leadResult.data?.product_id ?? dealResult.data?.product_id ?? null;
  const productResult = productId
    ? await admin.from('products').select('id,name').eq('id', productId).eq('organization_id', job.organization_id).maybeSingle()
    : { data: null, error: null };
  if (productResult.error) throw new Error(`Falha ao carregar produto: ${productResult.error.message}`);
  const ownerData = ownerResult.data as { full_name?: string; name?: string } | null;
  const ownerName = ownerData?.full_name ?? ownerData?.name ?? null;
  const assessment = await analyzeOpenConversation(admin, job.organization_id, {
    conversation,
    lead: leadResult.data,
    deal: dealResult.data,
    product: productResult.data,
    ownerName,
    messages,
    totalMessageCount: total,
  });

  const { error: assessmentError } = await admin.from('mia_open_conversation_assessments').upsert({
    conversation_id: conversation.id,
    organization_id: job.organization_id,
    lead_id: conversation.lead_id,
    visitor_name: conversation.visitor_name ?? leadResult.data?.name ?? 'Contato sem nome',
    channel: conversation.channel ?? 'webchat',
    conversation_status: conversation.status,
    owner_id: conversation.assigned_user_id ?? conversation.current_agent_id ?? null,
    owner_name: ownerName,
    product_id: productResult.data?.id ?? null,
    product_name: productResult.data?.name ?? null,
    deal_id: dealResult.data?.id ?? null,
    deal_value: dealResult.data?.deal_value ?? null,
    ...assessment,
    source_last_message_at: conversation.last_message_at,
    source_message_count: total,
    analysis_version: ANALYSIS_VERSION,
    analyzed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'conversation_id' });
  if (assessmentError) throw new Error(`Falha ao salvar análise: ${assessmentError.message}`);
  const { error: queueError } = await admin.from('mia_open_conversation_analysis_queue').update({
    status: 'completed', last_error: null, claimed_at: null, updated_at: new Date().toISOString(),
  }).eq('id', job.id);
  if (queueError) throw queueError;
  return { job, skipped: false, category: assessment.category };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!isServiceRoleRequest(req)) return serviceRoleUnauthorizedResponse(corsHeaders);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'missing_server_configuration' }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const runId = typeof body.run_id === 'string' ? body.run_id : null;
    const limit = Math.max(1, Math.min(Number(body.limit) || 2, 5));
    const staleBefore = new Date(Date.now() - 12 * 60_000).toISOString();
    await admin.from('mia_open_conversation_analysis_queue').update({ status: 'failed', claimed_at: null, last_error: 'worker_timeout', updated_at: new Date().toISOString() }).eq('status', 'processing').lt('claimed_at', staleBefore).gte('attempts', 4);
    await admin.from('mia_open_conversation_analysis_queue').update({ status: 'pending', claimed_at: null, updated_at: new Date().toISOString() }).eq('status', 'processing').lt('claimed_at', staleBefore).lt('attempts', 4);

    const { data, error: claimError } = await admin.rpc('claim_mia_open_analysis_jobs', { p_run_id: runId, p_limit: limit });
    if (claimError) throw new Error(`Falha ao reservar fila: ${claimError.message}`);
    const jobs = (data ?? []) as QueueJob[];
    if (!jobs.length) {
      if (runId) return json({ processed: 0, runs: [await updateRun(admin, runId)] });
      return json({ processed: 0, runs: [] });
    }

    const results = await Promise.allSettled(jobs.map((job) => processJob(admin, job)));
    const affectedRuns = new Set<string>();
    for (let index = 0; index < results.length; index += 1) {
      const job = jobs[index];
      affectedRuns.add(job.run_id);
      const result = results[index];
      if (result.status === 'rejected') {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        await admin.from('mia_open_conversation_analysis_queue').update({
          status: job.attempts >= 4 ? 'failed' : 'pending',
          last_error: message.slice(0, 1_000),
          claimed_at: null,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id);
      }
    }
    const runStates = [];
    for (const affectedRunId of affectedRuns) runStates.push(await updateRun(admin, affectedRunId));
    return json({ processed: jobs.length, succeeded: results.filter((result) => result.status === 'fulfilled').length, runs: runStates });
  } catch (error) {
    console.error('[mia-open-conversation-worker]', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
