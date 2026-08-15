// deno-lint-ignore-file no-explicit-any
// Copiloto de Marketing: chat conversacional (não-stream nesta fase) com tools de leitura.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { aiChat, describeAIError } from '../_shared/ai-call.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SYSTEM = `Você é o Especialista de Tráfego do Vendus. Fale português-BR, com análise de mídia paga clara, direta e acionável.
Use SEMPRE as ferramentas disponíveis para responder com dados reais da organização autorizada. Nunca invente números.
Separe fatos de hipóteses. Eventos Purchase da Meta ainda não foram conciliados com checkout/CRM: nunca os trate como venda, receita ou ROAS confirmado.
Ao sugerir orçamento, pausa ou escala, cite a evidência, o risco e a próxima ação. Mudanças externas exigem confirmação nos controles do Vendus.
Considere objetivo, estágio de aprendizado, volume, CTR, CPC, CPL/conversão selecionada e qualidade do rastreamento.
Máximo 8 linhas por resposta. Use markdown enxuto.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_findings',
      description: 'Lista os diagnósticos abertos gerados pela análise de IA.',
      parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_recommendations',
      description: 'Lista as recomendações pendentes (ações propostas pela IA).',
      parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'campaign_performance',
      description: 'Retorna gasto, cliques e conversas iniciadas na Meta por campanha. Não contém vendas confirmadas.',
      parameters: { type: 'object', properties: { days: { type: 'number' } }, required: ['days'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'account_health',
      description: 'Verifica conexão da Meta, última sincronização, catálogo e metas de conversão.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'campaign_details',
      description: 'Busca uma campanha por nome ou ID com conjuntos, anúncios, orçamento e desempenho recente.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, days: { type: 'number' } },
        required: ['query'],
      },
    },
  },
];

async function runTool(sb: any, orgId: string, name: string, args: any) {
  if (name === 'list_findings') {
    const { data } = await sb.from('marketing_ai_findings')
      .select('id, category, severity, title, summary, scope_ref_label, created_at')
      .eq('organization_id', orgId).eq('status', 'open')
      .order('created_at', { ascending: false }).limit(args?.limit ?? 20);
    return data ?? [];
  }
  if (name === 'list_recommendations') {
    const { data } = await sb.from('marketing_ai_recommendations')
      .select('id, action_type, target_label, rationale, risk, expected_result, current_state, proposed_state, status')
      .eq('organization_id', orgId).eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(args?.limit ?? 20);
    return data ?? [];
  }
  if (name === 'campaign_performance') {
    const days = Math.max(1, Math.min(90, Number(args?.days ?? 14)));
    const since = new Date(); since.setDate(since.getDate() - days);
    const iso = since.toISOString().slice(0, 10);
    const [{ data: ads }, { data: ins }, { data: camps }] = await Promise.all([
      sb.from('marketing_ads').select('external_id, campaign_external_id').eq('organization_id', orgId).eq('provider', 'meta').limit(2000),
      sb.from('marketing_insights_daily').select('entity_type, entity_external_id, spend, clicks, ctwa_clicks')
        .eq('organization_id', orgId).eq('provider', 'meta').gte('date', iso).limit(20000),
      sb.from('marketing_campaigns').select('external_id, name, status, daily_budget').eq('organization_id', orgId).eq('provider', 'meta').limit(500),
    ]);
    const adToCamp: Record<string, string> = {};
    (ads ?? []).forEach((a: any) => { if (a.campaign_external_id) adToCamp[a.external_id] = a.campaign_external_id; });
    const agg: Record<string, any> = {};
    for (const i of (ins ?? []) as any[]) {
      if (i.entity_type !== 'ad') continue;
      const c = adToCamp[i.entity_external_id]; if (!c) continue;
      const m = (agg[c] ||= { spend: 0, clicks: 0, conversations: 0 });
      m.spend += Number(i.spend || 0); m.clicks += Number(i.clicks || 0);
      m.conversations += Number(i.ctwa_clicks || 0);
    }
    return (camps ?? []).map((c: any) => ({
      name: c.name, status: c.status, daily_budget: c.daily_budget,
      ...(agg[c.external_id] ?? { spend: 0, clicks: 0, conversations: 0 }),
      sales_status: 'unverified_checkout_crm',
    })).filter((x: any) => x.spend > 0).sort((a: any, b: any) => b.spend - a.spend).slice(0, 25);
  }
  if (name === 'account_health') {
    const [{ data: cred }, { count: campaigns }, { count: adsets }, { count: ads }, { count: goals }] = await Promise.all([
      sb.from('org_marketing_credentials')
        .select('account_name,ad_account_id,is_active,last_sync_at,last_sync_status,last_sync_error')
        .eq('organization_id', orgId).eq('provider', 'meta').eq('is_active', true).maybeSingle(),
      sb.from('marketing_campaigns').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('provider', 'meta'),
      sb.from('marketing_adsets').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('provider', 'meta'),
      sb.from('marketing_ads').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('provider', 'meta'),
      sb.from('marketing_conversion_goals').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).eq('provider', 'meta').eq('is_active', true),
    ]);
    return {
      connection: cred ?? null,
      catalog: { campaigns: campaigns ?? 0, adsets: adsets ?? 0, ads: ads ?? 0 },
      active_conversion_goals: goals ?? 0,
      sales_attribution: 'unverified_checkout_crm',
    };
  }
  if (name === 'campaign_details') {
    const query = String(args?.query ?? '').trim();
    const days = Math.max(1, Math.min(90, Number(args?.days ?? 14)));
    let builder = sb.from('marketing_campaigns')
      .select('external_id,name,status,objective,daily_budget,lifetime_budget,ad_account_id')
      .eq('organization_id', orgId).eq('provider', 'meta').limit(10);
    builder = /^\d+$/.test(query) ? builder.eq('external_id', query) : builder.ilike('name', `%${query}%`);
    const { data: campaigns } = await builder;
    if (!(campaigns ?? []).length) return { found: false };
    const campaignIds = campaigns.map((campaign: any) => campaign.external_id);
    const since = new Date(); since.setDate(since.getDate() - days);
    const [{ data: adsets }, { data: ads }, { data: insights }] = await Promise.all([
      sb.from('marketing_adsets').select('external_id,campaign_external_id,name,status,daily_budget,lifetime_budget')
        .eq('organization_id', orgId).eq('provider', 'meta').in('campaign_external_id', campaignIds).limit(500),
      sb.from('marketing_ads').select('external_id,campaign_external_id,name,status')
        .eq('organization_id', orgId).eq('provider', 'meta').in('campaign_external_id', campaignIds).limit(1000),
      sb.from('marketing_insights_daily').select('entity_external_id,spend,impressions,clicks,ctwa_clicks')
        .eq('organization_id', orgId).eq('provider', 'meta').eq('entity_type', 'ad')
        .gte('date', since.toISOString().slice(0, 10)).limit(20000),
    ]);
    const adToCampaign: Record<string, string> = {};
    (ads ?? []).forEach((ad: any) => { adToCampaign[ad.external_id] = ad.campaign_external_id; });
    const totals: Record<string, any> = {};
    for (const row of insights ?? []) {
      const campaignId = adToCampaign[row.entity_external_id]; if (!campaignId) continue;
      const total = (totals[campaignId] ||= { spend: 0, impressions: 0, clicks: 0, conversions: 0 });
      total.spend += Number(row.spend || 0);
      total.impressions += Number(row.impressions || 0);
      total.clicks += Number(row.clicks || 0);
      total.conversions += Number(row.ctwa_clicks || 0);
    }
    return {
      found: true,
      days,
      campaigns: campaigns.map((campaign: any) => ({
        ...campaign,
        adsets: (adsets ?? []).filter((row: any) => row.campaign_external_id === campaign.external_id),
        ads: (ads ?? []).filter((row: any) => row.campaign_external_id === campaign.external_id),
        performance: totals[campaign.external_id] ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
      })),
    };
  }
  return { error: 'unknown_tool' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { organization_id, messages } = await req.json();
    if (!organization_id || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'organization_id + messages required' }), {
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
    const safeMessages = messages.slice(-20).map((message: any) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: String(message?.content ?? '').slice(0, 4000),
    }));
    const conversation: any[] = [{ role: 'system', content: SYSTEM }, ...safeMessages];

    // Tool loop (max 5 rounds)
    for (let round = 0; round < 5; round++) {
      const { response, config } = await aiChat({
        organizationId: organization_id, capability: 'analysis_insights',
        model: 'google/gemini-3-flash-preview', supabase: sb, label: 'marketing-ai-copilot',
        body: { messages: conversation, tools: TOOLS, tool_choice: 'auto' },
      });
      if (!response.ok) {
        const msg = await describeAIError(response, config.provider);
        return new Response(JSON.stringify({ error: msg }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const data = await response.json();
      const msg = data?.choices?.[0]?.message;
      if (!msg) break;
      conversation.push(msg);
      const toolCalls = msg.tool_calls ?? [];
      if (!toolCalls.length) {
        return new Response(JSON.stringify({ content: msg.content ?? '' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      for (const tc of toolCalls) {
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* ignore */ }
        const result = await runTool(sb, organization_id, tc.function?.name, args);
        conversation.push({
          role: 'tool', tool_call_id: tc.id, name: tc.function?.name,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
    }

    return new Response(JSON.stringify({ content: 'Não consegui concluir a análise. Tente reformular a pergunta.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('marketing-ai-copilot error:', e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
