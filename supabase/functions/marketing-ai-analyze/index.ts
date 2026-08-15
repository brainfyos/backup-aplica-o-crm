// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { aiChat, describeAIError } from '../_shared/ai-call.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Purchase bruto da Meta não é prova de venda. Habilitar só após conciliação checkout/CRM.
const SALES_VERIFIED = false;

type Finding = {
  scope: 'campaign' | 'adset' | 'ad' | 'account' | 'operation';
  scope_ref_id: string | null;
  scope_ref_label: string | null;
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  evidence: Record<string, any>;
  metrics: Record<string, any>;
  period_start: string;
  period_end: string;
};

type Recommendation = {
  action_type: string;
  target_type: 'campaign' | 'adset' | 'ad' | 'account';
  target_ref_id: string | null;
  target_label: string | null;
  current_state: Record<string, any>;
  proposed_state: Record<string, any>;
  rationale: string;
  data_used: Record<string, any>;
  risk: 'low' | 'medium' | 'high';
  expected_result: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { organization_id, window_days: requestedWindow = 14 } = await req.json().catch(() => ({}));
    const window_days = Math.max(1, Math.min(90, Number(requestedWindow) || 14));
    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await userClient.auth.getUser();
    if (!authData.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const [{ data: membership }, { data: superRole }] = await Promise.all([
      sb.from('user_organizations').select('organization_id').eq('user_id', authData.user.id)
        .eq('organization_id', organization_id).maybeSingle(),
      sb.from('user_roles').select('role').eq('user_id', authData.user.id)
        .eq('role', 'super_admin').maybeSingle(),
    ]);
    if (!membership && !superRole) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const now = new Date();
    const start = new Date(now); start.setDate(start.getDate() - window_days);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // Load campaigns + insights
    const [{ data: campaigns }, { data: ads }, { data: insights }] = await Promise.all([
      sb.from('marketing_campaigns').select('external_id, name, status, objective, daily_budget')
        .eq('organization_id', organization_id).eq('provider', 'meta').limit(1000),
      sb.from('marketing_ads').select('external_id, name, status, adset_external_id, campaign_external_id')
        .eq('organization_id', organization_id).eq('provider', 'meta').limit(2000),
      sb.from('marketing_insights_daily')
        .select('entity_type, entity_external_id, date, spend, impressions, clicks, ctwa_clicks')
        .eq('organization_id', organization_id).eq('provider', 'meta').gte('date', iso(start))
        .limit(20000),
    ]);

    const findings: Finding[] = [];
    const recs: Omit<Recommendation, 'target_label'> & { target_label: string | null; _findingIdx: number }[] = [];

    const adToCamp: Record<string, string> = {};
    (ads ?? []).forEach((a: any) => { if (a.campaign_external_id) adToCamp[a.external_id] = a.campaign_external_id; });

    // Aggregate per campaign
    const agg: Record<string, { spend: number; clicks: number; impressions: number; leads: number; purchases: number; revenue: number }> = {};
    for (const i of (insights ?? []) as any[]) {
      if (i.entity_type !== 'ad') continue;
      const camp = adToCamp[i.entity_external_id]; if (!camp) continue;
      const m = (agg[camp] ||= { spend: 0, clicks: 0, impressions: 0, leads: 0, purchases: 0, revenue: 0 });
      m.spend += Number(i.spend || 0);
      m.clicks += Number(i.clicks || 0);
      m.impressions += Number(i.impressions || 0);
      m.leads += Number(i.ctwa_clicks || 0);
    }

    const period_start = iso(start);
    const period_end = iso(now);

    // Deterministic rules
    for (const c of (campaigns ?? []) as any[]) {
      const m = agg[c.external_id];
      if (!m || m.spend < 10) continue;
      const roas = m.spend > 0 ? m.revenue / m.spend : 0;
      const cpl = m.leads > 0 ? m.spend / m.leads : null;
      const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;

      // High ROAS -> scale
      if (SALES_VERIFIED && roas >= 3 && m.purchases >= 3) {
        const idx = findings.length;
        findings.push({
          scope: 'campaign', scope_ref_id: c.external_id, scope_ref_label: c.name,
          category: 'roas_high', severity: 'medium',
          title: `Escalar "${c.name}" — ROAS ${roas.toFixed(1)}x`,
          summary: `Campanha rentável nos últimos ${window_days} dias. ROAS ${roas.toFixed(1)}x, ${m.purchases} vendas, receita R$ ${m.revenue.toFixed(0)}.`,
          evidence: { roas, spend: m.spend, revenue: m.revenue, purchases: m.purchases },
          metrics: m, period_start, period_end,
        });
        const proposed_budget = c.daily_budget ? Math.round(Number(c.daily_budget) * 1.2 * 100) / 100 : null;
        recs.push({
          action_type: 'increase_budget', target_type: 'campaign',
          target_ref_id: c.external_id, target_label: c.name,
          current_state: { daily_budget: c.daily_budget },
          proposed_state: { daily_budget: proposed_budget },
          rationale: `ROAS ${roas.toFixed(1)}x sustentado. Aumento gradual de 20% respeita a curva de aprendizado da Meta.`,
          data_used: { window_days, roas, purchases: m.purchases, revenue: m.revenue },
          risk: 'low',
          expected_result: `+~${Math.round(m.leads * 0.2)} leads/dia, mantendo ROAS acima de 2.5x`,
          _findingIdx: idx,
        });
      }

      // Spend without sales
      if (SALES_VERIFIED && m.spend >= 100 && m.purchases === 0) {
        const idx = findings.length;
        findings.push({
          scope: 'campaign', scope_ref_id: c.external_id, scope_ref_label: c.name,
          category: 'spend_no_sales', severity: 'high',
          title: `Pausar "${c.name}" — R$ ${m.spend.toFixed(0)} gastos sem vendas`,
          summary: `${window_days} dias sem conversão. ${m.leads} leads, ${m.clicks} cliques, 0 compras.`,
          evidence: { spend: m.spend, leads: m.leads, purchases: 0 },
          metrics: m, period_start, period_end,
        });
        recs.push({
          action_type: 'pause', target_type: 'campaign',
          target_ref_id: c.external_id, target_label: c.name,
          current_state: { status: c.status },
          proposed_state: { status: 'PAUSED' },
          rationale: 'Gasto consistente sem venda no período. Vale pausar para reanalisar público/criativo antes de continuar.',
          data_used: { window_days, spend: m.spend, leads: m.leads },
          risk: 'medium',
          expected_result: `Economiza ~R$ ${(m.spend / window_days).toFixed(0)}/dia até revisão.`,
          _findingIdx: idx,
        });
      }

      // Low CTR (creative fatigue proxy)
      if (m.impressions >= 5000 && ctr < 0.8) {
        const idx = findings.length;
        findings.push({
          scope: 'campaign', scope_ref_id: c.external_id, scope_ref_label: c.name,
          category: 'creative_fatigue', severity: 'medium',
          title: `Trocar criativo de "${c.name}" — CTR ${ctr.toFixed(2)}%`,
          summary: `CTR abaixo de 0,8% após ${m.impressions.toLocaleString('pt-BR')} impressões. Sinal clássico de saturação.`,
          evidence: { ctr, impressions: m.impressions, clicks: m.clicks },
          metrics: m, period_start, period_end,
        });
        recs.push({
          action_type: 'swap_creative', target_type: 'campaign',
          target_ref_id: c.external_id, target_label: c.name,
          current_state: { ctr },
          proposed_state: { action: 'test_new_variations', variants: 3 },
          rationale: 'Público está vendo o mesmo criativo há muito tempo. Novas variações revitalizam o CTR.',
          data_used: { window_days, ctr, impressions: m.impressions },
          risk: 'low',
          expected_result: 'CTR volta para 1.2%+ e CPC cai 15-25%.',
          _findingIdx: idx,
        });
      }

      // High CPL
      if (m.leads >= 5 && cpl && cpl > 50) {
        const idx = findings.length;
        findings.push({
          scope: 'campaign', scope_ref_id: c.external_id, scope_ref_label: c.name,
          category: 'cpl_high', severity: 'medium',
          title: `CPL alto em "${c.name}" — R$ ${cpl.toFixed(2)}`,
          summary: `Custo por lead acima do saudável. Revise segmentação/criativo.`,
          evidence: { cpl, leads: m.leads, spend: m.spend },
          metrics: m, period_start, period_end,
        });
      }
    }

    // Operation-level: no conversion tracking
    const totalPurchases = Object.values(agg).reduce((s, m) => s + m.purchases, 0);
    const totalSpend = Object.values(agg).reduce((s, m) => s + m.spend, 0);
    if (SALES_VERIFIED && totalSpend > 200 && totalPurchases === 0) {
      findings.push({
        scope: 'operation', scope_ref_id: null, scope_ref_label: 'Rastreamento',
        category: 'no_conversion_tracking', severity: 'high',
        title: 'Configure o rastreamento de vendas',
        summary: `R$ ${totalSpend.toFixed(0)} investidos e nenhuma compra atribuída. Ative Pixel + CAPI para medir resultado.`,
        evidence: { totalSpend, totalPurchases },
        metrics: {}, period_start, period_end,
      });
    }

    // Enrich summaries via LLM (best-effort; safe if it fails)
    if (findings.length > 0) {
      try {
        const prompt = `Você é analista sênior de Meta Ads. Reescreva cada resumo abaixo em 1-2 frases claras, em português-BR, tom consultivo e direto. Responda APENAS um JSON no formato {"summaries":[{"i":0,"s":"..."}, ...]}\n\n${JSON.stringify(findings.map((f, i) => ({ i, title: f.title, summary: f.summary, metrics: f.metrics })))}`;
        const { response } = await aiChat({
          organizationId: organization_id, capability: 'analysis_insights',
          model: 'google/gemini-3-flash-preview', supabase: sb, label: 'marketing-ai-analyze',
          body: { messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } },
        });
        if (response.ok) {
          const data = await response.json();
          const txt = data?.choices?.[0]?.message?.content ?? '{}';
          const parsed = JSON.parse(txt);
          for (const s of (parsed?.summaries ?? [])) {
            if (typeof s?.i === 'number' && typeof s?.s === 'string' && findings[s.i]) {
              findings[s.i].summary = s.s;
            }
          }
        }
      } catch (e) { console.warn('LLM enrichment failed:', e); }
    }

    // Persist
    const { data: insertedFindings, error: fErr } = await sb
      .from('marketing_ai_findings')
      .insert(findings.map((f) => ({ ...f, organization_id })))
      .select('id');
    if (fErr) throw fErr;

    const idMap = insertedFindings?.map((r: any) => r.id) ?? [];
    if (recs.length > 0) {
      const recsToInsert = recs.map((r) => {
        const { _findingIdx, ...rest } = r;
        return { ...rest, finding_id: idMap[_findingIdx] ?? null, organization_id };
      });
      const { error: rErr } = await sb.from('marketing_ai_recommendations').insert(recsToInsert);
      if (rErr) throw rErr;
    }

    return new Response(JSON.stringify({
      ok: true,
      findings_created: findings.length,
      recommendations_created: recs.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('marketing-ai-analyze error:', e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
