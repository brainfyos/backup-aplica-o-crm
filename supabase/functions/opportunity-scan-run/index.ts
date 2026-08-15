// Radar IA — executa análise de oportunidades em conversas
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { recordLovableUsage } from '../_shared/ai-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const MODEL = 'google/gemini-2.5-flash';

interface ScanFilters {
  product_ids?: string[];
  assigned_user_ids?: string[];
  agent_ids?: string[];
  tag_ids?: string[];
  sector_ids?: string[];
  channels?: string[];
  statuses?: string[];
  squad_ids?: string[];
  temperatures?: string[];
  min_score?: number;
  min_deal_value?: number;
  exclude_product_ids?: string[];
  exclude_assigned_user_ids?: string[];
  exclude_agent_ids?: string[];
  exclude_tag_ids?: string[];
  exclude_sector_ids?: string[];
  exclude_channels?: string[];
  exclude_lead_ids?: string[];
  require_no_tags?: boolean;
  require_no_sector?: boolean;
  require_no_assigned?: boolean;
  inactivity_days_min?: number;
  inactivity_days_max?: number;
  min_client_messages?: number;
  include_ai_active?: boolean;
}

interface ActionConfig {
  apply_tag_id?: string;
  create_task?: { enabled: boolean; due_in_hours?: number };
  notify_owner?: boolean;
  notify_admin?: boolean;
  transfer_to_user_id?: string;
  add_to_outreach?: boolean;
}

interface ActionsConfig {
  hot?: ActionConfig;
  warm?: ActionConfig;
  cold?: ActionConfig;
  lost?: ActionConfig;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const {
      organization_id,
      triggered_by,
      filters = {} as ScanFilters,
      actions_config = {} as ActionsConfig,
      trigger_type = 'manual',
      schedule_id = null,
      preview_only = false,
    } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!preview_only && !apiKey) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurado no backend' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Buscar conversas candidatas
    const candidates = await fetchCandidates(supabase, organization_id, filters);

    if (preview_only) {
      return new Response(JSON.stringify({
        total_candidates: candidates.length,
        estimated_cost_cents: Math.ceil(candidates.length * 0.5),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 2. Criar registro do scan
    const { data: scan, error: scanErr } = await supabase
      .from('opportunity_scans')
      .insert({
        organization_id,
        triggered_by,
        trigger_type,
        schedule_id,
        filters,
        actions_config,
        status: 'running',
        total_candidates: candidates.length,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (scanErr) {
      return new Response(JSON.stringify({ error: 'Erro ao criar scan: ' + scanErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resposta imediata; processa em background
    const processing = processScan(supabase, scan.id, organization_id, candidates, actions_config);
    // @ts-ignore EdgeRuntime
    if (typeof EdgeRuntime !== 'undefined') {
      // @ts-ignore
      EdgeRuntime.waitUntil(processing);
    } else {
      processing.catch((e) => console.error('scan error', e));
    }

    return new Response(JSON.stringify({ scan_id: scan.id, total_candidates: candidates.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('opportunity-scan-run error', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchCandidates(supabase: any, orgId: string, f: ScanFilters) {
  let q = supabase
    .from('webchat_conversations')
    .select('id, lead_id, product_id, assigned_user_id, current_agent_id, sector_id, channel, status, last_message_at, visitor_name, visitor_phone, visitor_email, created_at')
    .eq('organization_id', orgId)
    .neq('status', 'closed');

  // Inclusões diretas
  if (f.statuses?.length) q = q.in('status', f.statuses);
  if (f.product_ids?.length) q = q.in('product_id', f.product_ids);
  if (f.assigned_user_ids?.length) q = q.in('assigned_user_id', f.assigned_user_ids);
  if (f.agent_ids?.length) q = q.in('current_agent_id', f.agent_ids);
  if (f.sector_ids?.length) q = q.in('sector_id', f.sector_ids);
  if (f.channels?.length) q = q.in('channel', f.channels);
  if (!f.include_ai_active) q = q.is('current_agent_id', null);

  // Exclusões (PostgREST: not.in.(...))
  const notIn = (col: string, ids?: string[]) => {
    if (ids?.length) q = q.not(col, 'in', `(${ids.join(',')})`);
  };
  notIn('product_id', f.exclude_product_ids);
  notIn('assigned_user_id', f.exclude_assigned_user_ids);
  notIn('current_agent_id', f.exclude_agent_ids);
  notIn('sector_id', f.exclude_sector_ids);
  notIn('channel', f.exclude_channels);

  // Toggles "sem ..."
  if (f.require_no_sector) q = q.is('sector_id', null);
  if (f.require_no_assigned) q = q.is('assigned_user_id', null);

  // Janela de inatividade
  const maxDays = f.inactivity_days_max ?? 30;
  const minDays = f.inactivity_days_min ?? 0;
  const maxDate = new Date(Date.now() - minDays * 86400000).toISOString();
  const minDate = new Date(Date.now() - maxDays * 86400000).toISOString();
  q = q.gte('last_message_at', minDate).lte('last_message_at', maxDate);

  q = q.order('last_message_at', { ascending: false }).limit(500);
  const { data, error } = await q;
  if (error) throw error;
  let convs = data || [];

  const leadIds = convs.map((c: any) => c.lead_id).filter(Boolean);

  // Filtros por tag (inclusão / exclusão / require_no_tags)
  if (leadIds.length && (f.tag_ids?.length || f.exclude_tag_ids?.length || f.require_no_tags)) {
    const { data: allTags } = await supabase
      .from('lead_tag_assignments')
      .select('lead_id, tag_id')
      .in('lead_id', leadIds);
    const byLead = new Map<string, Set<string>>();
    for (const t of allTags || []) {
      if (!byLead.has(t.lead_id)) byLead.set(t.lead_id, new Set());
      byLead.get(t.lead_id)!.add(t.tag_id);
    }
    convs = convs.filter((c: any) => {
      const tagsForLead = byLead.get(c.lead_id) || new Set();
      if (f.require_no_tags && tagsForLead.size > 0) return false;
      if (f.tag_ids?.length && !f.tag_ids.some((t) => tagsForLead.has(t))) return false;
      if (f.exclude_tag_ids?.length && f.exclude_tag_ids.some((t) => tagsForLead.has(t))) return false;
      return true;
    });
  } else if (f.tag_ids?.length) {
    // Conversas sem lead não podem ter tag
    convs = [];
  }

  // Filtros baseados em leads (temperatura/valor/squad/exclude_lead_ids)
  const needLeadJoin =
    (f.temperatures?.length || 0) > 0 ||
    !!f.min_deal_value ||
    (f.squad_ids?.length || 0) > 0 ||
    (f.exclude_lead_ids?.length || 0) > 0;

  if (needLeadJoin) {
    const remainIds = convs.map((c: any) => c.lead_id).filter(Boolean);
    if (remainIds.length) {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, temperature, deal_value, squad_id')
        .in('id', remainIds);
      const leadMap = new Map<string, any>((leads || []).map((l: any) => [l.id, l]));
      const excludeSet = new Set(f.exclude_lead_ids || []);
      convs = convs.filter((c: any) => {
        if (!c.lead_id) return false;
        if (excludeSet.has(c.lead_id)) return false;
        const l = leadMap.get(c.lead_id);
        if (!l) return false;
        if (f.temperatures?.length && !f.temperatures.includes(l.temperature)) return false;
        if (f.min_deal_value && (Number(l.deal_value) || 0) < f.min_deal_value) return false;
        if (f.squad_ids?.length && !f.squad_ids.includes(l.squad_id)) return false;
        return true;
      });
    } else {
      convs = [];
    }
  } else if (f.exclude_lead_ids?.length) {
    const excludeSet = new Set(f.exclude_lead_ids);
    convs = convs.filter((c: any) => !c.lead_id || !excludeSet.has(c.lead_id));
  }

  return convs;
}

async function processScan(supabase: any, scanId: string, orgId: string, conversations: any[], actions: ActionsConfig) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  let hot = 0, warm = 0, cold = 0, lost = 0, analyzed = 0, potentialRev = 0;

  // Processar em batches de 8
  const BATCH = 8;
  for (let i = 0; i < conversations.length; i += BATCH) {
    const batch = conversations.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((c) => classifyConversation(supabase, orgId, c, apiKey!)));

    for (const r of results) {
      if (!r) continue;
      analyzed++;
      if (r.classification === 'hot') hot++;
      else if (r.classification === 'warm') warm++;
      else if (r.classification === 'cold') cold++;
      else if (r.classification === 'lost') lost++;
      potentialRev += r.lead_snapshot?.deal_value || 0;

      await supabase.from('opportunity_scan_items').insert({
        scan_id: scanId,
        organization_id: orgId,
        conversation_id: r.conversation_id,
        lead_id: r.lead_id,
        classification: r.classification,
        score: r.score,
        reason: r.reason,
        signals: r.signals,
        suggested_action: r.suggested_action,
        followup_message: r.followup_message,
        lead_snapshot: r.lead_snapshot,
      });

      // Aplicar ações automáticas
      await applyActions(supabase, orgId, r, actions);
    }

    // Atualiza progresso
    await supabase.from('opportunity_scans').update({
      total_analyzed: analyzed, hot_count: hot, warm_count: warm, cold_count: cold, lost_count: lost,
      potential_revenue: potentialRev,
    }).eq('id', scanId);
  }

  await supabase.from('opportunity_scans').update({
    status: 'completed',
    finished_at: new Date().toISOString(),
    total_analyzed: analyzed, hot_count: hot, warm_count: warm, cold_count: cold, lost_count: lost,
    potential_revenue: potentialRev,
    cost_cents: Math.ceil(analyzed * 0.3),
  }).eq('id', scanId);
}

async function classifyConversation(supabase: any, orgId: string, conv: any, apiKey: string) {
  try {
    // Últimas 20 mensagens
    const { data: messages } = await supabase
      .from('webchat_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const msgs = (messages || []).reverse();
    const clientMsgs = msgs.filter((m: any) => m.role === 'user').length;

    // Heurística rápida: sem mensagens do cliente
    if (clientMsgs === 0) {
      return {
        conversation_id: conv.id, lead_id: conv.lead_id,
        classification: 'cold', score: 10,
        reason: 'Nenhuma mensagem do cliente — apenas mensagens iniciais sem engajamento.',
        signals: ['sem_resposta_cliente'],
        suggested_action: 'Considerar arquivar ou tentar abordagem nova.',
        followup_message: '',
        lead_snapshot: await getLeadSnapshot(supabase, conv),
      };
    }

    const leadSnap = await getLeadSnapshot(supabase, conv);
    const daysSince = Math.floor((Date.now() - new Date(conv.last_message_at).getTime()) / 86400000);
    const lastMsgFromClient = msgs[msgs.length - 1]?.role === 'user';

    const transcript = msgs.map((m: any) => `${m.role === 'user' ? 'CLIENTE' : 'EMPRESA'}: ${m.content?.slice(0, 300) || ''}`).join('\n');

    const prompt = `Você é um especialista em vendas analisando uma conversa para classificar o potencial do lead.

DADOS DO LEAD:
${JSON.stringify(leadSnap, null, 2)}

CONVERSA (últimas mensagens):
${transcript}

CONTEXTO:
- Dias desde última mensagem: ${daysSince}
- Última mensagem foi do cliente: ${lastMsgFromClient}
- Total de mensagens do cliente: ${clientMsgs}

Classifique como:
- "hot": demonstrou forte interesse, pediu detalhes/preço, parou de responder mas estava engajado, OU última msg do cliente sem resposta da empresa
- "warm": interesse moderado, fez algumas perguntas, conversa em andamento
- "cold": pouco engajamento, sem sinais claros de compra
- "lost": demonstrou desinteresse, rejeição, ou tempo demais sem atividade

Retorne JSON estrito:
{
  "classification": "hot|warm|cold|lost",
  "score": 0-100,
  "reason": "explicação curta em 1-2 frases",
  "signals": ["sinal1", "sinal2"],
  "suggested_action": "ação concreta recomendada",
  "followup_message": "mensagem pronta de follow-up que o vendedor pode enviar (máx 2 linhas, tom profissional, em português)"
}`;

    const res = await fetch(LOVABLE_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      console.error('AI error', res.status, await res.text());
      return null;
    }

    const ai = await res.json();
    await recordLovableUsage(supabase, orgId, 'analysis_insights', MODEL, ai?.usage, 'opportunity-scan-run');
    const content = ai.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return {
      conversation_id: conv.id,
      lead_id: conv.lead_id,
      classification: parsed.classification || 'cold',
      score: parsed.score || 0,
      reason: parsed.reason || '',
      signals: parsed.signals || [],
      suggested_action: parsed.suggested_action || '',
      followup_message: parsed.followup_message || '',
      lead_snapshot: leadSnap,
    };
  } catch (err) {
    console.error('classify error', err);
    return null;
  }
}

async function getLeadSnapshot(supabase: any, conv: any) {
  if (!conv.lead_id) {
    return {
      name: conv.visitor_name, phone: conv.visitor_phone, email: conv.visitor_email,
      deal_value: 0, product_id: conv.product_id,
    };
  }
  const { data: lead } = await supabase
    .from('leads')
    .select('name, email, phone, deal_value, product_id, current_stage_id, assigned_to, temperature')
    .eq('id', conv.lead_id)
    .maybeSingle();
  return lead || {};
}

async function applyActions(supabase: any, orgId: string, item: any, actions: ActionsConfig) {
  const cfg = actions[item.classification as keyof ActionsConfig];
  if (!cfg) return;

  try {
    if (cfg.apply_tag_id && item.lead_id) {
      await supabase.from('lead_tag_assignments').insert({
        lead_id: item.lead_id, tag_id: cfg.apply_tag_id,
      }).select();
    }

    if (cfg.create_task?.enabled && item.lead_id) {
      const dueAt = new Date(Date.now() + (cfg.create_task.due_in_hours ?? 24) * 3600000).toISOString();
      const { data: lead } = await supabase.from('leads').select('assigned_to').eq('id', item.lead_id).maybeSingle();
      await supabase.from('tasks').insert({
        organization_id: orgId,
        lead_id: item.lead_id,
        title: `🎯 Radar IA — ${item.classification.toUpperCase()}`,
        description: `${item.reason}\n\nSugestão: ${item.suggested_action}\n\nFollow-up sugerido:\n${item.followup_message}`,
        due_date: dueAt,
        assigned_to: lead?.assigned_to,
        status: 'pending',
        priority: item.classification === 'hot' ? 'high' : 'medium',
      });
    }

    if (cfg.transfer_to_user_id && item.lead_id) {
      await supabase.from('leads').update({ assigned_to: cfg.transfer_to_user_id }).eq('id', item.lead_id);
    }

    if (cfg.notify_owner && item.lead_id) {
      const { data: lead } = await supabase.from('leads').select('assigned_to').eq('id', item.lead_id).maybeSingle();
      if (lead?.assigned_to) {
        await supabase.from('notifications').insert({
          user_id: lead.assigned_to,
          organization_id: orgId,
          title: `🎯 Lead ${item.classification.toUpperCase()} detectado`,
          message: item.reason,
          type: 'opportunity_radar',
          metadata: { lead_id: item.lead_id, classification: item.classification },
        });
      }
    }

    await supabase.from('opportunity_scan_items')
      .update({ action_applied: true, action_applied_at: new Date().toISOString() })
      .eq('scan_id', item.scan_id)
      .eq('conversation_id', item.conversation_id);
  } catch (e) {
    console.error('applyActions error', e);
  }
}
