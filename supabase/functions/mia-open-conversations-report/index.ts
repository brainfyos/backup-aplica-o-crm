import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ANALYSIS_VERSION } from '../_shared/mia-open-analysis.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const ALLOWED_ROLES = new Set(['super_admin', 'admin', 'manager']);
const OPEN_STATUSES = ['bot_active', 'waiting_human', 'human_active'];

interface OpenConversationRow {
  id: string;
  last_message_at: string | null;
  status: string;
}

interface AssessmentRow {
  conversation_id: string;
  analysis_version: string;
  source_last_message_at: string | null;
  category: string;
  close_probability: number;
  intent_score: number;
  urgency_score: number;
  deal_value: number | null;
  analyzed_at: string;
  [key: string]: unknown;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function loadOpenConversations(admin: SupabaseClient, organizationId: string): Promise<OpenConversationRow[]> {
  const rows: OpenConversationRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin.from('webchat_conversations')
      .select('id,last_message_at,status')
      .eq('organization_id', organizationId)
      .in('status', OPEN_STATUSES)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as OpenConversationRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function loadAssessments(admin: SupabaseClient, organizationId: string, ids: string[]): Promise<AssessmentRow[]> {
  const rows: AssessmentRow[] = [];
  // Keep PostgREST URLs below the gateway limit. A 400-UUID `in` filter is
  // roughly 15 KB and fails before reaching the database in larger accounts.
  const pageSize = 50;
  for (let index = 0; index < ids.length; index += pageSize) {
    const { data, error } = await admin.from('mia_open_conversation_assessments')
      .select('*')
      .eq('organization_id', organizationId)
      .in('conversation_id', ids.slice(index, index + pageSize));
    if (error) throw error;
    rows.push(...((data ?? []) as AssessmentRow[]));
  }
  return rows;
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

async function buildReport(admin: SupabaseClient, organizationId: string) {
  const open = await loadOpenConversations(admin, organizationId);
  const ids = open.map((row) => row.id);
  const assessments = ids.length ? await loadAssessments(admin, organizationId, ids) : [];
  const openMap = new Map(open.map((row) => [row.id, row]));
  const fresh = assessments.filter((assessment) => {
    const conversation = openMap.get(assessment.conversation_id);
    return conversation && assessment.analysis_version === ANALYSIS_VERSION
      && sameInstant(assessment.source_last_message_at, conversation.last_message_at);
  });
  fresh.sort((a, b) => (b.close_probability - a.close_probability) || (b.intent_score - a.intent_score) || (b.urgency_score - a.urgency_score));
  const count = (category: string) => fresh.filter((assessment) => assessment.category === category).length;
  const pipelineValue = fresh
    .filter((assessment) => ['ready_to_close', 'high_potential'].includes(assessment.category))
    .reduce((sum, assessment) => sum + Number(assessment.deal_value ?? 0), 0);
  const latestAnalyzedAt = fresh.reduce<string | null>((latest, assessment) =>
    !latest || assessment.analyzed_at > latest ? assessment.analyzed_at : latest, null);
  const { data: latestRun, error: runError } = await admin.from('mia_open_report_runs')
    .select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (runError) throw runError;
  return {
    generated_at: latestAnalyzedAt,
    coverage: {
      open_total: open.length,
      analyzed_fresh: fresh.length,
      pending_or_stale: Math.max(0, open.length - fresh.length),
      percent: open.length ? Math.round((fresh.length / open.length) * 100) : 0,
    },
    summary: {
      ready_to_close: count('ready_to_close'),
      high_potential: count('high_potential'),
      needs_human: count('needs_human'),
      at_risk: count('at_risk'),
      nurture: count('nurture'),
      unqualified: count('unqualified'),
      potential_pipeline_value: pipelineValue,
    },
    run: latestRun ?? null,
    conversations: fresh,
  };
}

async function startRun(
  admin: SupabaseClient,
  organizationId: string,
  userId: string,
  maxConversations?: number,
  requestedConversationIds?: string[],
) {
  const { data: activeRun, error: activeError } = await admin.from('mia_open_report_runs')
    .select('*').eq('organization_id', organizationId).in('status', ['queued', 'running'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (activeError) throw activeError;
  if (activeRun) return activeRun;

  const open = await loadOpenConversations(admin, organizationId);
  const batchLimit = Number.isFinite(maxConversations)
    ? Math.min(5000, Math.max(1, Math.trunc(maxConversations as number)))
    : null;
  // A pilot run must remain cheap even when the account has thousands of open
  // conversations, so limit candidates before loading their assessments.
  const requestedSet = requestedConversationIds?.length
    ? new Set(requestedConversationIds)
    : null;
  const requestedOpen = requestedSet ? open.filter((conversation) => requestedSet.has(conversation.id)) : open;
  const candidates = batchLimit ? requestedOpen.slice(0, batchLimit) : requestedOpen;
  const ids = candidates.map((row) => row.id);
  const assessments = ids.length ? await loadAssessments(admin, organizationId, ids) : [];
  const assessmentMap = new Map(assessments.map((assessment) => [assessment.conversation_id, assessment]));
  const stale = candidates.filter((conversation) => {
    const assessment = assessmentMap.get(conversation.id);
    return !assessment || assessment.analysis_version !== ANALYSIS_VERSION
      || !sameInstant(assessment.source_last_message_at, conversation.last_message_at);
  });
  const { data: run, error: runError } = await admin.from('mia_open_report_runs').insert({
    organization_id: organizationId,
    requested_by: userId,
    status: stale.length ? 'queued' : 'completed',
    open_total: open.length,
    queued_total: stale.length,
    processed_total: 0,
    failed_total: 0,
    completed_at: stale.length ? null : new Date().toISOString(),
  }).select('*').single();
  if (runError) throw runError;

  for (let index = 0; index < stale.length; index += 300) {
    const rows = stale.slice(index, index + 300).map((conversation) => ({
      run_id: run.id,
      organization_id: organizationId,
      conversation_id: conversation.id,
      source_last_message_at: conversation.last_message_at,
      status: 'pending',
      attempts: 0,
    }));
    const { error } = await admin.from('mia_open_conversation_analysis_queue').insert(rows);
    if (error) {
      await admin.from('mia_open_report_runs').update({ status: 'failed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', run.id);
      throw error;
    }
  }
  return run;
}

async function invokeWorker(runId: string) {
  const baseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!baseUrl || !serviceKey) throw new Error('Configuração interna do worker ausente.');
  const response = await fetch(`${baseUrl}/functions/v1/mia-open-conversation-worker`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    body: JSON.stringify({ run_id: runId, limit: 2 }),
    signal: AbortSignal.timeout(115_000),
  });
  if (!response.ok) throw new Error(`Worker ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'missing_server_configuration' }, 500);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'unauthorized' }, 401);
    const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
      admin.from('profiles').select('organization_id').eq('id', user.id).maybeSingle(),
      admin.from('user_roles').select('role').eq('user_id', user.id),
    ]);
    if (profileError || rolesError) throw profileError ?? rolesError;
    if (!profile?.organization_id) return json({ error: 'organization_not_found' }, 403);
    if (!(roleRows ?? []).some((row: { role: string }) => ALLOWED_ROLES.has(row.role))) return json({ error: 'forbidden' }, 403);
    if (!await featureEnabled(admin, profile.organization_id)) return json({ error: 'mia_not_in_plan' }, 403);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'latest';
    const organizationId = profile.organization_id;
    if (action === 'start') {
      const requestedLimit = typeof body.max_conversations === 'number' ? body.max_conversations : undefined;
      const requestedConversationIds = Array.isArray(body.conversation_ids)
        ? body.conversation_ids.filter((value): value is string => typeof value === 'string')
        : undefined;
      const run = await startRun(admin, organizationId, user.id, requestedLimit, requestedConversationIds);
      return json({ run, report: await buildReport(admin, organizationId) });
    }
    if (action === 'process') {
      if (typeof body.run_id !== 'string') return json({ error: 'run_id_required' }, 400);
      const { data: run, error: runError } = await admin.from('mia_open_report_runs')
        .select('id,status').eq('id', body.run_id).eq('organization_id', organizationId).maybeSingle();
      if (runError) throw runError;
      if (!run) return json({ error: 'run_not_found' }, 404);
      if (['queued', 'running'].includes(run.status)) await invokeWorker(run.id);
      return json({ report: await buildReport(admin, organizationId) });
    }
    if (action !== 'latest') return json({ error: 'unsupported_action' }, 400);
    return json({ report: await buildReport(admin, organizationId) });
  } catch (error) {
    console.error('[mia-open-conversations-report]', error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
