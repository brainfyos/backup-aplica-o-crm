// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

type Op = '>=' | '<=' | '>' | '<' | '==' | '!=';
type Condition = { metric: string; operator: Op; value: number };
type Action =
  | { type: 'pause' }
  | { type: 'activate' }
  | { type: 'increase_budget'; pct: number }
  | { type: 'decrease_budget'; pct: number };

type Rule = {
  id: string;
  organization_id: string;
  name: string;
  enabled: boolean;
  mode: 'suggest' | 'auto';
  scope: 'campaign' | 'adset' | 'ad';
  conditions: Condition[];
  window_days: number;
  action: Action;
  cooldown_hours: number;
  last_run_at: string | null;
};

type SafetyLimits = {
  max_budget_change_pct: number;
  max_daily_spend_cents: number;
  allow_auto_pause: boolean;
  allow_auto_budget: boolean;
  allow_auto_activate: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  timezone: string;
  blocked_campaign_ids: string[];
  max_actions_per_day: number;
};

const DEFAULT_LIMITS: SafetyLimits = {
  max_budget_change_pct: 30,
  max_daily_spend_cents: 0,
  allow_auto_pause: true,
  allow_auto_budget: false,
  allow_auto_activate: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: 'America/Sao_Paulo',
  blocked_campaign_ids: [],
  max_actions_per_day: 10,
};

const UNVERIFIED_SALES_METRICS = new Set(['purchases', 'revenue', 'roas']);

function compare(a: number, op: Op, b: number) {
  switch (op) {
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>':  return a > b;
    case '<':  return a < b;
    case '==': return a === b;
    case '!=': return a !== b;
  }
}

function computeMetric(name: string, m: any): number {
  switch (name) {
    case 'spend':       return m.spend;
    case 'clicks':      return m.clicks;
    case 'impressions': return m.impressions;
    case 'leads':       return m.leads;
    case 'purchases':   return m.purchases;
    case 'revenue':     return m.revenue;
    case 'roas':        return m.spend > 0 ? m.revenue / m.spend : 0;
    case 'ctr':         return m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
    case 'cpl':         return m.leads > 0 ? m.spend / m.leads : 0;
    case 'cpc':         return m.clicks > 0 ? m.spend / m.clicks : 0;
    case 'cpm':         return m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0;
    default:            return 0;
  }
}

function hourInSPTZ(tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    return Number(fmt.format(new Date()));
  } catch { return new Date().getUTCHours(); }
}

function inQuietHours(limits: SafetyLimits): boolean {
  const s = limits.quiet_hours_start, e = limits.quiet_hours_end;
  if (s == null || e == null) return false;
  const h = hourInSPTZ(limits.timezone);
  return s <= e ? (h >= s && h < e) : (h >= s || h < e);
}

async function graphPost(nodeId: string, token: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH}/${nodeId}`);
  url.searchParams.set('access_token', token);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  const res = await fetch(url.toString(), { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Meta ${res.status}`);
  return body;
}

function paramsFromState(state: Record<string, any>): Record<string, string> {
  const p: Record<string, string> = {};
  if (state.status) p.status = String(state.status).toUpperCase();
  if (state.daily_budget != null) {
    const v = Number(state.daily_budget);
    p.daily_budget = String(Math.round(v < 1000 ? v * 100 : v));
  }
  return p;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({}));
    const target_org: string | undefined = body.organization_id;
    const rule_id: string | undefined = body.rule_id;
    const triggered_by: 'cron' | 'manual' = body.triggered_by === 'manual' ? 'manual' : 'cron';

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Load enabled rules
    let q = sb.from('marketing_ai_rules').select('*').eq('enabled', true);
    if (target_org) q = q.eq('organization_id', target_org);
    if (rule_id) q = q.eq('id', rule_id);
    const { data: rules, error: re } = await q;
    if (re) return json({ error: re.message }, 500);

    const summary = { rules_evaluated: 0, matches: 0, recommendations: 0, executions: 0, skipped: 0 };

    for (const rule of (rules ?? []) as Rule[]) {
      summary.rules_evaluated++;

      const unsafeConditions = rule.conditions.filter((condition) => UNVERIFIED_SALES_METRICS.has(condition.metric));
      if (unsafeConditions.length > 0) {
        await Promise.all([
          sb.from('marketing_ai_rules').update({ enabled: false }).eq('id', rule.id),
          sb.from('marketing_ai_rule_runs').insert({
            rule_id: rule.id, organization_id: rule.organization_id,
            skipped_count: 1,
            skipped_reasons: [{ reason: 'unverified_sales_metric', metrics: unsafeConditions.map((condition) => condition.metric) }],
            triggered_by,
          }),
        ]);
        summary.skipped++;
        continue;
      }

      // Cooldown check
      if (rule.last_run_at) {
        const last = new Date(rule.last_run_at).getTime();
        const nextAllowed = last + rule.cooldown_hours * 3600 * 1000;
        if (Date.now() < nextAllowed && triggered_by !== 'manual') {
          await sb.from('marketing_ai_rule_runs').insert({
            rule_id: rule.id, organization_id: rule.organization_id,
            skipped_count: 1, skipped_reasons: [{ reason: 'cooldown', until: new Date(nextAllowed).toISOString() }],
            triggered_by,
          });
          continue;
        }
      }

      // Load safety limits
      const { data: limitsRow } = await sb.from('marketing_ai_safety_limits')
        .select('*').eq('organization_id', rule.organization_id).maybeSingle();
      const limits: SafetyLimits = { ...DEFAULT_LIMITS, ...(limitsRow ?? {}) };

      const now = new Date();
      const start = new Date(now); start.setDate(start.getDate() - rule.window_days);
      const iso = (d: Date) => d.toISOString().slice(0, 10);

      // Fetch entities and insights
      const [{ data: campaigns }, { data: adsets }, { data: ads }, { data: insights }] = await Promise.all([
        sb.from('marketing_campaigns').select('external_id, name, status, daily_budget')
          .eq('organization_id', rule.organization_id).eq('provider', 'meta').limit(2000),
        sb.from('marketing_adsets').select('external_id, name, status, daily_budget, campaign_external_id')
          .eq('organization_id', rule.organization_id).eq('provider', 'meta').limit(4000),
        sb.from('marketing_ads').select('external_id, name, status, adset_external_id, campaign_external_id')
          .eq('organization_id', rule.organization_id).eq('provider', 'meta').limit(6000),
        sb.from('marketing_insights_daily')
          .select('entity_type, entity_external_id, spend, impressions, clicks, ctwa_clicks, purchases, revenue')
          .eq('organization_id', rule.organization_id).eq('provider', 'meta').gte('date', iso(start))
          .limit(30000),
      ]);

      const adToAdset: Record<string, string> = {};
      const adToCamp: Record<string, string> = {};
      (ads ?? []).forEach((a: any) => {
        if (a.adset_external_id) adToAdset[a.external_id] = a.adset_external_id;
        if (a.campaign_external_id) adToCamp[a.external_id] = a.campaign_external_id;
      });
      const adsetToCamp: Record<string, string> = {};
      (adsets ?? []).forEach((s: any) => { if (s.campaign_external_id) adsetToCamp[s.external_id] = s.campaign_external_id; });

      // Aggregate by target scope
      const agg: Record<string, any> = {};
      for (const i of (insights ?? []) as any[]) {
        let key: string | null = null;
        if (rule.scope === 'ad' && i.entity_type === 'ad') key = i.entity_external_id;
        else if (rule.scope === 'adset') {
          if (i.entity_type === 'adset') key = i.entity_external_id;
          else if (i.entity_type === 'ad') key = adToAdset[i.entity_external_id];
        } else if (rule.scope === 'campaign') {
          if (i.entity_type === 'campaign') key = i.entity_external_id;
          else if (i.entity_type === 'adset') {
            const s = (adsets ?? []).find((x: any) => x.external_id === i.entity_external_id);
            key = s?.campaign_external_id ?? null;
          } else if (i.entity_type === 'ad') key = adToCamp[i.entity_external_id];
        }
        if (!key) continue;
        const m = (agg[key] ||= { spend: 0, clicks: 0, impressions: 0, leads: 0, purchases: 0, revenue: 0 });
        m.spend       += Number(i.spend || 0);
        m.clicks      += Number(i.clicks || 0);
        m.impressions += Number(i.impressions || 0);
        m.leads       += Number(i.ctwa_clicks || 0);
        m.purchases   += Number(i.purchases || 0);
        m.revenue     += Number(i.revenue || 0);
      }

      const universe = rule.scope === 'campaign' ? (campaigns ?? [])
                     : rule.scope === 'adset'    ? (adsets ?? [])
                     : (ads ?? []);

      // Match
      const matches: { entity: any; metrics: any }[] = [];
      for (const e of universe as any[]) {
        const m = agg[e.external_id];
        if (!m) continue;
        const ok = rule.conditions.every((c) => compare(computeMetric(c.metric, m), c.operator, Number(c.value)));
        if (ok) matches.push({ entity: e, metrics: m });
      }

      summary.matches += matches.length;

      // Count today's executions for max_actions_per_day
      const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
      const { count: todaysExecs } = await sb.from('marketing_ai_executions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', rule.organization_id)
        .gte('executed_at', startOfDay.toISOString());
      let remainingBudget = Math.max(0, limits.max_actions_per_day - (todaysExecs ?? 0));

      const skippedReasons: any[] = [];
      let recsCreated = 0, execsCreated = 0;

      // Load Meta token once (for auto)
      let token: string | null = null;
      if (rule.mode === 'auto' && matches.length > 0) {
        const { data: cred } = await sb.from('org_marketing_credentials')
          .select('access_token_encrypted').eq('organization_id', rule.organization_id).eq('provider', 'meta').maybeSingle();
        if (cred) token = await decryptSecret(cred.access_token_encrypted).catch(() => null);
      }

      for (const { entity, metrics } of matches) {
        // Build recommendation payload
        const target_type = rule.scope;
        const target_ref_id = entity.external_id;
        const target_label = entity.name;

        let current_state: Record<string, any> = {};
        let proposed_state: Record<string, any> = {};
        let action_type = '';
        let risk: 'low' | 'medium' | 'high' = 'low';

        if (rule.action.type === 'pause') {
          action_type = 'pause';
          current_state = { status: entity.status };
          proposed_state = { status: 'PAUSED' };
          risk = 'medium';
        } else if (rule.action.type === 'activate') {
          action_type = 'activate';
          current_state = { status: entity.status };
          proposed_state = { status: 'ACTIVE' };
          risk = 'medium';
        } else if (rule.action.type === 'increase_budget' || rule.action.type === 'decrease_budget') {
          const pct = Number(rule.action.pct) || 0;
          const sign = rule.action.type === 'increase_budget' ? 1 : -1;
          const cur = Number(entity.daily_budget || 0);
          if (!cur) { skippedReasons.push({ reason: 'no_budget', target: target_ref_id }); continue; }
          const curCurrency = cur >= 1000 ? cur / 100 : cur;
          const proposedCurrency = Math.max(1, Math.round(curCurrency * (1 + (sign * pct) / 100) * 100) / 100);
          action_type = rule.action.type;
          current_state = { daily_budget: curCurrency };
          proposed_state = { daily_budget: proposedCurrency };
          risk = pct > 25 ? 'medium' : 'low';
        }

        const { data: recRow } = await sb.from('marketing_ai_recommendations').insert({
          organization_id: rule.organization_id,
          action_type, target_type, target_ref_id, target_label,
          current_state, proposed_state,
          rationale: `Regra automática: "${rule.name}"`,
          data_used: { rule_id: rule.id, conditions: rule.conditions, window_days: rule.window_days, metrics },
          risk,
          expected_result: rule.mode === 'auto' ? 'Aplicado automaticamente pela regra.' : 'Aguardando revisão humana.',
          status: 'pending',
        }).select().maybeSingle();
        recsCreated++;

        // Auto execute
        if (rule.mode === 'auto' && recRow) {
          // Safety checks
          if (inQuietHours(limits)) {
            skippedReasons.push({ reason: 'quiet_hours', target: target_ref_id }); continue;
          }
          if (remainingBudget <= 0) {
            skippedReasons.push({ reason: 'daily_action_limit', target: target_ref_id }); continue;
          }
          if (limits.blocked_campaign_ids.length) {
            const campId = rule.scope === 'campaign' ? target_ref_id
                         : rule.scope === 'adset' ? entity.campaign_external_id
                         : entity.campaign_external_id;
            if (campId && limits.blocked_campaign_ids.includes(String(campId))) {
              skippedReasons.push({ reason: 'blocked_campaign', target: target_ref_id }); continue;
            }
          }
          if ((action_type === 'pause') && !limits.allow_auto_pause) {
            skippedReasons.push({ reason: 'auto_pause_disabled', target: target_ref_id }); continue;
          }
          if ((action_type === 'activate') && !limits.allow_auto_activate) {
            skippedReasons.push({ reason: 'auto_activate_disabled', target: target_ref_id }); continue;
          }
          if ((action_type === 'increase_budget' || action_type === 'decrease_budget')) {
            if (!limits.allow_auto_budget) {
              skippedReasons.push({ reason: 'auto_budget_disabled', target: target_ref_id }); continue;
            }
            const before = Number(current_state.daily_budget || 0);
            const after = Number(proposed_state.daily_budget || 0);
            const pct = before > 0 ? Math.abs((after - before) / before) * 100 : 0;
            if (pct > limits.max_budget_change_pct) {
              skippedReasons.push({ reason: 'exceeds_max_budget_change_pct', target: target_ref_id, pct }); continue;
            }
          }
          if (!token) {
            skippedReasons.push({ reason: 'meta_not_connected', target: target_ref_id }); continue;
          }

          const params = paramsFromState(proposed_state);
          let ok = true, err: string | null = null, provResp: any = null;
          try { provResp = await graphPost(target_ref_id, token, params); }
          catch (e) { ok = false; err = (e as Error).message; }

          await sb.from('marketing_ai_executions').insert({
            organization_id: rule.organization_id,
            recommendation_id: recRow.id,
            action_type, target_type, target_ref_id, target_label,
            previous_state: current_state,
            applied_state: proposed_state,
            status: ok ? 'success' : 'failed',
            error: err,
            provider_response: provResp ?? {},
          });
          await sb.from('marketing_ai_recommendations').update({
            status: ok ? 'applied' : 'failed',
            decided_at: new Date().toISOString(),
          }).eq('id', recRow.id);

          if (ok) { execsCreated++; remainingBudget--; }
        }
      }

      await sb.from('marketing_ai_rules').update({
        last_run_at: new Date().toISOString(),
        last_match_count: matches.length,
      }).eq('id', rule.id);

      await sb.from('marketing_ai_rule_runs').insert({
        rule_id: rule.id, organization_id: rule.organization_id,
        matched_count: matches.length,
        recommendations_created: recsCreated,
        executions_created: execsCreated,
        skipped_count: skippedReasons.length,
        skipped_reasons: skippedReasons,
        triggered_by,
      });

      summary.recommendations += recsCreated;
      summary.executions += execsCreated;
      summary.skipped += skippedReasons.length;
    }

    return json({ ok: true, ...summary });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'internal_error' }, 500);
  }
});
