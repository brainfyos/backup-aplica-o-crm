// Mia — Tools (somente leitura). Executa consultas escopadas por organization_id do JWT.
// O agente Realtime chama esta function via tool calls.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = ["super_admin", "admin", "manager"];
const ALLOWED_TOOLS = new Set([
  // Fase 3 — Cobrar tarefa atrasada
  "charge_overdue_task",
  // Fase 8 — CRM Write
  "draft_create_lead",
  "draft_update_lead_stage",
  "draft_update_lead_temperature",
  "draft_create_note",
  "draft_create_calendar_event",
  "search_business_knowledge",
  // Fase 1
  "get_operation_summary",
  "get_team_status",
  "get_unanswered_conversations",
  "get_hot_leads",
  "get_overdue_tasks",
  "get_today_schedule",
  // Fase 3 — Analyst
  "get_lead_context",
  "get_conversation_summary",
  "get_conversation_messages",
  "get_seller_context",
  "get_pipeline_context",
  "get_followup_context",
  "get_daily_ai_summary",
  // Fase 4 — Messenger
  "resolve_recipient",
  "get_contact_context",
  "draft_whatsapp_message",
  "draft_email",
  "draft_internal_notification",
  "draft_push",
  // Fase 5 — Memória + conversa ativa
  "get_memory",
  "remember_fact",
  "forget_fact",
  "update_preference",
  "find_active_conversation",
  "draft_conversation_message",
  // Fase 6 — Gestão de atendimentos (toda a operação)
  "list_conversations",
  "get_conversation_detail",
  "list_agents",
  "get_agent_workload",
  "draft_assign_conversation",
  "draft_transfer_sector",
  "draft_close_conversation",
  "draft_takeover_from_agent",
  "draft_handback_to_agent",
  // Fase 7 — Agenda
  "find_calendar_event",
  "draft_reschedule_booking",
  "draft_cancel_booking",
]);

function startOfDayISO(d = new Date()) {
  const s = new Date(d); s.setHours(0, 0, 0, 0); return s.toISOString();
}
function endOfDayISO(d = new Date()) {
  const s = new Date(d); s.setHours(23, 59, 59, 999); return s.toISOString();
}

async function getOrgUserIds(admin: any, orgId: string): Promise<string[]> {
  const { data } = await admin.from("profiles").select("id").eq("organization_id", orgId);
  return (data ?? []).map((p: any) => p.id);
}

async function getOperationSummary(admin: any, orgId: string) {
  const userIds = await getOrgUserIds(admin, orgId);
  const todayStart = startOfDayISO();
  const todayEnd = endOfDayISO();
  const nowIso = new Date().toISOString();

  const [openConv, waitingConv, hotLeads, unassignedLeads, overdueTasks, todayEvents] = await Promise.all([
    admin.from("webchat_conversations").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).neq("status", "closed"),
    admin.from("webchat_conversations").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("status", "waiting_human"),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("temperature", "hot"),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).is("assigned_to", null),
    userIds.length
      ? admin.from("tasks").select("id", { count: "exact", head: true })
          .in("user_id", userIds).neq("status", "completed").lt("due_date", nowIso)
      : Promise.resolve({ count: 0 }),
    admin.from("calendar_events").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).gte("start_time", todayStart).lte("start_time", todayEnd),
  ]);

  return {
    conversas_abertas: openConv.count ?? 0,
    conversas_sem_resposta: waitingConv.count ?? 0,
    leads_quentes: hotLeads.count ?? 0,
    leads_sem_responsavel: unassignedLeads.count ?? 0,
    tarefas_atrasadas: overdueTasks.count ?? 0,
    reunioes_hoje: todayEvents.count ?? 0,
  };
}

async function getTeamStatus(admin: any, orgId: string) {
  const { data: profiles } = await admin.from("profiles")
    .select("id, full_name").eq("organization_id", orgId);
  if (!profiles?.length) return { equipe: [] };
  const nowIso = new Date().toISOString();
  const todayStart = startOfDayISO();
  const todayEnd = endOfDayISO();

  const ids = profiles.map((p: any) => p.id);
  const [convs, leads, tasks, events] = await Promise.all([
    admin.from("webchat_conversations").select("assigned_user_id")
      .eq("organization_id", orgId).neq("status", "closed").in("assigned_user_id", ids),
    admin.from("leads").select("assigned_to").eq("organization_id", orgId).in("assigned_to", ids),
    admin.from("tasks").select("user_id").in("user_id", ids).neq("status", "completed").lt("due_date", nowIso),
    admin.from("calendar_events").select("user_id").eq("organization_id", orgId)
      .gte("start_time", todayStart).lte("start_time", todayEnd).in("user_id", ids),
  ]);

  const count = (rows: any[], k: string) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const id = r[k]; if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };
  const cConv = count(convs.data ?? [], "assigned_user_id");
  const cLeads = count(leads.data ?? [], "assigned_to");
  const cTasks = count(tasks.data ?? [], "user_id");
  const cEvents = count(events.data ?? [], "user_id");

  return {
    equipe: profiles.map((p: any) => ({
      nome: p.full_name ?? "Sem nome",
      conversas_abertas: cConv.get(p.id) ?? 0,
      leads: cLeads.get(p.id) ?? 0,
      tarefas_atrasadas: cTasks.get(p.id) ?? 0,
      reunioes_hoje: cEvents.get(p.id) ?? 0,
    })).sort((a, b) => (b.conversas_abertas + b.tarefas_atrasadas) - (a.conversas_abertas + a.tarefas_atrasadas)),
  };
}

async function getUnansweredConversations(admin: any, orgId: string) {
  const { data } = await admin.from("webchat_conversations")
    .select("id, visitor_name, assigned_user_id, last_inbound_at, last_message_at, channel")
    .eq("organization_id", orgId).eq("status", "waiting_human")
    .order("last_inbound_at", { ascending: true, nullsFirst: false }).limit(20);

  const ids = Array.from(new Set((data ?? []).map((c: any) => c.assigned_user_id).filter(Boolean)));
  const nameMap = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", ids);
    for (const p of profs ?? []) nameMap.set(p.id, p.full_name ?? "—");
  }
  const now = Date.now();
  return {
    conversas: (data ?? []).map((c: any) => {
      const last = c.last_inbound_at ?? c.last_message_at;
      const minutos = last ? Math.round((now - new Date(last).getTime()) / 60000) : null;
      return {
        conversation_id: c.id,
        lead: c.visitor_name ?? "Visitante",
        canal: c.channel,
        responsavel: c.assigned_user_id ? nameMap.get(c.assigned_user_id) ?? "—" : "Sem responsável",
        tempo_sem_resposta_min: minutos,
      };
    }),
  };
}

async function getHotLeads(admin: any, orgId: string) {
  const { data } = await admin.from("leads")
    .select("name, assigned_to, temperature, last_contact_at, next_action")
    .eq("organization_id", orgId).eq("temperature", "hot")
    .order("last_contact_at", { ascending: false, nullsFirst: false }).limit(20);

  const ids = Array.from(new Set((data ?? []).map((l: any) => l.assigned_to).filter(Boolean)));
  const nameMap = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", ids);
    for (const p of profs ?? []) nameMap.set(p.id, p.full_name ?? "—");
  }
  return {
    leads: (data ?? []).map((l: any) => ({
      lead: l.name,
      responsavel: l.assigned_to ? nameMap.get(l.assigned_to) ?? "—" : "Sem responsável",
      proxima_acao: l.next_action ?? null,
    })),
  };
}

async function getOverdueTasks(admin: any, orgId: string) {
  const userIds = await getOrgUserIds(admin, orgId);
  if (!userIds.length) return { tarefas: [] };
  const nowIso = new Date().toISOString();
  const { data } = await admin.from("tasks")
    .select("title, user_id, priority, due_date")
    .in("user_id", userIds).neq("status", "completed").lt("due_date", nowIso)
    .order("due_date", { ascending: true }).limit(20);

  const ids = Array.from(new Set((data ?? []).map((t: any) => t.user_id).filter(Boolean)));
  const nameMap = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", ids);
    for (const p of profs ?? []) nameMap.set(p.id, p.full_name ?? "—");
  }
  const now = Date.now();
  return {
    tarefas: (data ?? []).map((t: any) => ({
      titulo: t.title,
      responsavel: nameMap.get(t.user_id) ?? "—",
      prioridade: t.priority ?? "media",
      dias_atraso: t.due_date ? Math.max(1, Math.round((now - new Date(t.due_date).getTime()) / 86400000)) : null,
    })),
  };
}

async function getTodaySchedule(admin: any, orgId: string) {
  const todayStart = startOfDayISO();
  const todayEnd = endOfDayISO();
  const { data } = await admin.from("calendar_events")
    .select("title, start_time, end_time, user_id, event_type, lead_id")
    .eq("organization_id", orgId).gte("start_time", todayStart).lte("start_time", todayEnd)
    .order("start_time", { ascending: true }).limit(50);

  const ids = Array.from(new Set((data ?? []).map((e: any) => e.user_id).filter(Boolean)));
  const nameMap = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", ids);
    for (const p of profs ?? []) nameMap.set(p.id, p.full_name ?? "—");
  }
  return {
    eventos: (data ?? []).map((e: any) => ({
      titulo: e.title,
      tipo: e.event_type ?? "reuniao",
      responsavel: nameMap.get(e.user_id) ?? "—",
      inicio: e.start_time,
    })),
  };
}

// ============================================================
// FASE 3 — Mia Analyst
// ============================================================

async function findProfileByName(admin: any, orgId: string, term: string) {
  if (!term) return null;
  const like = `%${term}%`;
  const { data } = await admin.from("profiles")
    .select("id, full_name, email")
    .eq("organization_id", orgId)
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .limit(5);
  return data ?? [];
}

async function findLead(admin: any, orgId: string, args: any) {
  if (args?.lead_id) {
    const { data } = await admin.from("leads").select("*").eq("id", args.lead_id).eq("organization_id", orgId).maybeSingle();
    return data ? [data] : [];
  }
  const term = String(args?.lead_name ?? "").trim();
  if (!term) return [];
  const like = `%${term}%`;
  const { data } = await admin.from("leads")
    .select("*")
    .eq("organization_id", orgId)
    .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
    .limit(5);
  return data ?? [];
}

async function getLeadContext(admin: any, orgId: string, args: any) {
  const matches = await findLead(admin, orgId, args);
  if (!matches.length) return { encontrado: false, mensagem: "Nenhum lead encontrado." };
  if (matches.length > 1 && !args?.lead_id) {
    return {
      encontrado: false,
      ambiguidade: true,
      candidatos: matches.map((l: any) => ({ id: l.id, nome: l.name, email: l.email, phone: l.phone })),
    };
  }
  const lead = matches[0];

  const [stage, owner, sdr, closer, tags, notes, tasks, deals, history, interactions] = await Promise.all([
    lead.current_stage_id
      ? admin.from("pipeline_stages").select("name").eq("id", lead.current_stage_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.assigned_to
      ? admin.from("profiles").select("full_name").eq("id", lead.assigned_to).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.sdr_id ? admin.from("profiles").select("full_name").eq("id", lead.sdr_id).maybeSingle() : Promise.resolve({ data: null }),
    lead.closer_id ? admin.from("profiles").select("full_name").eq("id", lead.closer_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("lead_tag_assignments").select("lead_tags(name, color)").eq("lead_id", lead.id).limit(10),
    admin.from("lead_notes").select("content, created_at").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(5),
    admin.from("tasks").select("title, due_date, status, priority").eq("lead_id", lead.id).neq("status", "completed").order("due_date", { ascending: true }).limit(5),
    admin.from("deals").select("deal_value, status, plan_name, updated_at").eq("lead_id", lead.id).order("updated_at", { ascending: false }).limit(5),
    admin.from("lead_stage_history").select("stage_id, changed_at").eq("lead_id", lead.id).order("changed_at", { ascending: false }).limit(5),
    admin.from("interactions").select("type, description, created_at").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(8),
  ]);

  return {
    encontrado: true,
    lead: {
      id: lead.id,
      nome: lead.name,
      email: lead.email,
      phone: lead.phone,
      empresa: lead.company,
      origem: lead.source,
      etapa: (stage as any)?.data?.name ?? null,
      temperatura: lead.temperature,
      responsavel: (owner as any)?.data?.full_name ?? null,
      sdr: (sdr as any)?.data?.full_name ?? null,
      closer: (closer as any)?.data?.full_name ?? null,
      proxima_acao: lead.next_action,
      ultimo_contato: lead.last_contact_at,
      criado_em: lead.created_at,
      utm: { source: lead.utm_source, medium: lead.utm_medium, campaign: lead.utm_campaign },
    },
    tags: (tags.data ?? []).map((t: any) => t.lead_tags?.name).filter(Boolean),
    notas_recentes: (notes.data ?? []).map((n: any) => ({ texto: String(n.content ?? "").slice(0, 280), em: n.created_at })),
    tarefas_abertas: tasks.data ?? [],
    deals: deals.data ?? [],
    jornada: {
      historico_etapas: history.data ?? [],
      interacoes_recentes: (interactions.data ?? []).map((i: any) => ({
        tipo: i.type, descricao: String(i.description ?? "").slice(0, 200), em: i.created_at,
      })),
    },
  };
}

async function fetchConversationForLeadOrId(admin: any, orgId: string, args: any) {
  if (args?.conversation_id) {
    const { data } = await admin.from("webchat_conversations").select("*").eq("id", args.conversation_id).eq("organization_id", orgId).maybeSingle();
    return data ?? null;
  }
  const leads = await findLead(admin, orgId, args);
  if (!leads.length) return null;
  const { data } = await admin.from("webchat_conversations")
    .select("*").eq("organization_id", orgId).eq("lead_id", leads[0].id)
    .order("last_message_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  return data;
}

async function generateConversationAISummary(admin: any, orgId: string, conv: any) {
  const { data: msgs } = await admin.from("webchat_messages")
    .select("direction, sender_type, content, created_at")
    .eq("conversation_id", conv.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false }).limit(30);

  const chronological = (msgs ?? []).slice().reverse();
  if (!chronological.length) {
    return { resumo: "Conversa sem mensagens.", sentimento: "neutro", objecoes: [], interesses: [], proximos_passos: [] };
  }

  const transcript = chronological.map((m: any) => {
    const who = m.direction === "outbound" ? "Atendente" : "Lead";
    return `${who}: ${String(m.content ?? "").slice(0, 400)}`;
  }).join("\n");

  const { aiChat } = await import("../_shared/ai-call.ts");
  const { response } = await aiChat({
    organizationId: orgId,
    capability: "analysis_insights",
    model: "google/gemini-3-flash-preview",
    label: "mia-conv-summary",
    supabase: admin,
    body: {
      messages: [
        { role: "system", content: "Você é uma analista comercial. Analise o histórico e retorne APENAS JSON válido com os campos: resumo (string curta, max 3 frases), sentimento (positivo|neutro|negativo), objecoes (string[]), interesses (string[]), proximos_passos (string[])." },
        { role: "user", content: `Histórico da conversa:\n${transcript}\n\nDevolva o JSON agora.` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    },
  });
  if (!response.ok) return { resumo: "Não foi possível gerar resumo agora.", sentimento: "neutro", objecoes: [], interesses: [], proximos_passos: [] };
  const j = await response.json().catch(() => null);
  const content = j?.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { resumo: String(content).slice(0, 400), sentimento: "neutro", objecoes: [], interesses: [], proximos_passos: [] };
  }
}

async function getConversationSummary(admin: any, orgId: string, args: any) {
  const conv = await fetchConversationForLeadOrId(admin, orgId, args);
  if (!conv) return { encontrado: false, mensagem: "Conversa não encontrada." };

  // cache em conversation_notes (uma linha 'ai_summary' por conversa)
  const { data: cached } = await admin.from("conversation_notes")
    .select("id, ai_summary, ai_summary_updated_at")
    .eq("conversation_id", conv.id)
    .not("ai_summary", "is", null)
    .order("ai_summary_updated_at", { ascending: false }).limit(1).maybeSingle();

  const lastMsgAt = conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
  const cachedAt = cached?.ai_summary_updated_at ? new Date(cached.ai_summary_updated_at).getTime() : 0;
  if (cached?.ai_summary && cachedAt >= lastMsgAt) {
    return { encontrado: true, conversation_id: conv.id, cached: true, ...cached.ai_summary };
  }

  const summary = await generateConversationAISummary(admin, orgId, conv);

  // upsert best-effort (não bloqueia resposta)
  admin.from("conversation_notes").insert({
    conversation_id: conv.id,
    user_id: conv.assigned_user_id ?? null,
    content: "[Mia · resumo automático]",
    ai_summary: summary,
    ai_summary_updated_at: new Date().toISOString(),
  }).then(() => {}).catch(() => {});

  return { encontrado: true, conversation_id: conv.id, cached: false, ...summary };
}

async function getConversationMessages(admin: any, orgId: string, args: any) {
  const conv = await fetchConversationForLeadOrId(admin, orgId, args);
  if (!conv) return { encontrado: false };
  const limit = Math.min(Number(args?.limit ?? 20), 50);
  const { data } = await admin.from("webchat_messages")
    .select("direction, sender_type, content, created_at")
    .eq("conversation_id", conv.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false }).limit(limit);
  return {
    encontrado: true,
    conversation_id: conv.id,
    mensagens: (data ?? []).reverse().map((m: any) => ({
      de: m.direction === "outbound" ? "atendente" : "lead",
      texto: String(m.content ?? "").slice(0, 400),
      em: m.created_at,
    })),
  };
}

async function getSellerContext(admin: any, orgId: string, args: any) {
  const term = String(args?.seller_name ?? "").trim();
  const candidates = await findProfileByName(admin, orgId, term);
  if (!candidates?.length) return { encontrado: false, mensagem: "Vendedor não encontrado." };
  if (candidates.length > 1) {
    return { encontrado: false, ambiguidade: true, candidatos: candidates.map((p: any) => ({ id: p.id, nome: p.full_name, email: p.email })) };
  }
  const seller = candidates[0];
  const nowIso = new Date().toISOString();
  const todayStart = startOfDayISO();
  const todayEnd = endOfDayISO();

  const [activeLeads, openConv, waitingConv, overdueTasks, todayEvents] = await Promise.all([
    admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("assigned_to", seller.id),
    admin.from("webchat_conversations").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("assigned_user_id", seller.id).neq("status", "closed"),
    admin.from("webchat_conversations").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("assigned_user_id", seller.id).eq("status", "waiting_human"),
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", seller.id).neq("status", "completed").lt("due_date", nowIso),
    admin.from("calendar_events").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("user_id", seller.id).gte("start_time", todayStart).lte("start_time", todayEnd),
  ]);

  const gargalo =
    ((waitingConv.count ?? 0) >= 5 && (overdueTasks.count ?? 0) >= 5) ? "alto"
    : ((waitingConv.count ?? 0) >= 3 || (overdueTasks.count ?? 0) >= 3) ? "medio"
    : "baixo";

  return {
    encontrado: true,
    vendedor: { id: seller.id, nome: seller.full_name, email: seller.email },
    leads_ativos: activeLeads.count ?? 0,
    conversas_abertas: openConv.count ?? 0,
    conversas_sem_resposta: waitingConv.count ?? 0,
    tarefas_atrasadas: overdueTasks.count ?? 0,
    reunioes_hoje: todayEvents.count ?? 0,
    nivel_gargalo: gargalo,
  };
}

async function getPipelineContext(admin: any, orgId: string, args: any) {
  let stagesQ = admin.from("pipeline_stages").select("id, name, order_index, product_id").eq("organization_id", orgId);
  if (args?.product_id) stagesQ = stagesQ.eq("product_id", args.product_id);
  const { data: stages } = await stagesQ.order("order_index", { ascending: true });
  if (!stages?.length) return { etapas: [] };

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows: any[] = [];
  for (const s of stages) {
    const [total, parados] = await Promise.all([
      admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("current_stage_id", s.id),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("current_stage_id", s.id).lt("updated_at", sevenDaysAgo),
    ]);
    rows.push({ etapa: s.name, total: total.count ?? 0, parados_7d: parados.count ?? 0 });
  }
  const gargalos = [...rows].sort((a, b) => b.parados_7d - a.parados_7d).slice(0, 3);
  return { etapas: rows, top_gargalos: gargalos };
}

async function getFollowupContext(admin: any, _orgId: string) {
  const nowIso = new Date().toISOString();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [activeCad, overdueRuns, staleConv] = await Promise.all([
    admin.from("cadences").select("id", { count: "exact", head: true }).eq("organization_id", _orgId).eq("is_active", true),
    admin.from("cadence_step_runs").select("id, scheduled_at, enrollment_id").eq("organization_id", _orgId).eq("status", "pending").lt("scheduled_at", nowIso).order("scheduled_at", { ascending: true }).limit(20),
    admin.from("webchat_conversations").select("id, visitor_name, last_message_at").eq("organization_id", _orgId).neq("status", "closed").lt("last_message_at", since24h).order("last_message_at", { ascending: true }).limit(10),
  ]);
  return {
    cadencias_ativas: activeCad.count ?? 0,
    followups_atrasados: (overdueRuns.data ?? []).length,
    followups_atrasados_amostra: overdueRuns.data ?? [],
    conversas_sem_retorno_24h: (staleConv.data ?? []).map((c: any) => ({ lead: c.visitor_name ?? "Visitante", ultima: c.last_message_at })),
  };
}

async function getDailyAISummary(admin: any, orgId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: cached } = await admin.from("mia_daily_summaries")
    .select("payload, updated_at").eq("organization_id", orgId).eq("summary_date", today).maybeSingle();
  if (cached?.payload && cached?.updated_at && (Date.now() - new Date(cached.updated_at).getTime() < 30 * 60 * 1000)) {
    return { ...cached.payload, cached: true };
  }

  const [op, followups, hot] = await Promise.all([
    getOperationSummary(admin, orgId),
    getFollowupContext(admin, orgId),
    getHotLeads(admin, orgId),
  ]);

  // oportunidades em risco: deals abertas sem update há >7d
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: riskDeals } = await admin.from("deals")
    .select("id, lead_id, deal_value, plan_name, updated_at")
    .eq("organization_id", orgId).eq("status", "open").lt("updated_at", sevenDaysAgo)
    .order("deal_value", { ascending: false }).limit(5);

  const recomendacoes: string[] = [];
  if ((op.conversas_sem_resposta ?? 0) > 0) recomendacoes.push(`Priorize as ${op.conversas_sem_resposta} conversas aguardando resposta.`);
  if ((op.leads_sem_responsavel ?? 0) > 0) recomendacoes.push(`Distribua os ${op.leads_sem_responsavel} leads sem responsável.`);
  if ((hot.leads?.length ?? 0) > 0) recomendacoes.push(`Foque nos ${hot.leads.length} leads quentes.`);
  if ((riskDeals?.length ?? 0) > 0) recomendacoes.push(`${riskDeals!.length} negociações estão paradas há mais de 7 dias.`);

  const payload = {
    cached: false,
    gerado_em: new Date().toISOString(),
    operacao: op,
    leads_quentes: hot.leads ?? [],
    oportunidades_em_risco: riskDeals ?? [],
    followups: followups,
    recomendacoes,
  };

  admin.from("mia_daily_summaries").upsert({
    organization_id: orgId,
    summary_date: today,
    payload,
    updated_at: new Date().toISOString(),
  }).then(() => {}).catch(() => {});

  return payload;
}

// ============= FASE 4 — MESSENGER =============

async function resolveRecipient(admin: any, orgId: string, args: any) {
  const query = String(args?.query ?? "").trim();
  const channel = String(args?.channel ?? "any");
  if (!query) return { encontrado: false, mensagem: "Informe um nome, e-mail ou telefone." };
  const like = `%${query}%`;

  const candidates: any[] = [];
  // Sellers (profiles)
  const { data: sellers } = await admin.from("profiles")
    .select("id, full_name, email, phone")
    .eq("organization_id", orgId)
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .limit(5);
  for (const s of sellers ?? []) {
    candidates.push({
      tipo: "vendedor", id: s.id, nome: s.full_name, email: s.email, telefone: s.phone ?? null,
    });
  }
  // Leads
  const { data: leads } = await admin.from("leads")
    .select("id, name, email, phone, assigned_to, current_stage_id")
    .eq("organization_id", orgId)
    .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
    .limit(5);
  for (const l of leads ?? []) {
    candidates.push({
      tipo: "lead", id: l.id, nome: l.name, email: l.email, telefone: l.phone, etapa_id: l.current_stage_id, responsavel_id: l.assigned_to,
    });
  }

  // Filtrar por canal
  let filtered = candidates;
  if (channel === "whatsapp") filtered = candidates.filter((c) => !!c.telefone);
  else if (channel === "email") filtered = candidates.filter((c) => !!c.email);

  if (!filtered.length) return { encontrado: false, mensagem: `Nenhum destinatário para "${query}" (canal: ${channel}).` };
  return {
    encontrado: true,
    total: filtered.length,
    ambiguidade: filtered.length > 1,
    candidatos: filtered,
  };
}

async function getContactContext(admin: any, orgId: string, args: any) {
  const recipientId = String(args?.recipient_id ?? "");
  const recipientType = String(args?.recipient_type ?? "lead");
  if (!recipientId) return { encontrado: false };

  if (recipientType === "lead") {
    const leadCtx = await getLeadContext(admin, orgId, { lead_id: recipientId });
    const { data: lastConv } = await admin.from("webchat_conversations")
      .select("id, last_inbound_at, last_message_at, status, channel")
      .eq("organization_id", orgId).eq("lead_id", recipientId)
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    let janela_24h = false;
    if (lastConv?.last_inbound_at) {
      janela_24h = (Date.now() - new Date(lastConv.last_inbound_at).getTime()) < 24 * 3600 * 1000;
    }
    return { ...leadCtx, ultima_conversa: lastConv ?? null, janela_24h_whatsapp: janela_24h };
  }
  // seller
  const { data: prof } = await admin.from("profiles")
    .select("id, full_name, email, phone").eq("id", recipientId).maybeSingle();
  return { encontrado: !!prof, vendedor: prof ?? null };
}

async function generateMessage(
  admin: any,
  orgId: string,
  systemPrompt: string,
  userPrompt: string,
  responseJson = false,
): Promise<string> {
  try {
    const { aiChat } = await import("../_shared/ai-call.ts");
    const { response } = await aiChat({
      organizationId: orgId,
      capability: "agent_chat",
      model: "google/gemini-3-flash-preview",
      label: "mia-messenger",
      supabase: admin,
      body: {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        ...(responseJson ? { response_format: { type: "json_object" } } : {}),
      },
    });
    if (!response.ok) return "";
    const j = await response.json().catch(() => null);
    return j?.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("[mia-tools] generateMessage error", e);
    return "";
  }
}

async function pickWhatsappConnection(admin: any, orgId: string) {
  // tenta Evolution primeiro (instância conectada)
  const { data: evo } = await admin.from("evolution_instances")
    .select("id, instance_name, status").eq("organization_id", orgId)
    .eq("status", "connected").order("is_default", { ascending: false }).limit(1).maybeSingle();
  if (evo) return { provider: "evolution", connection_id: evo.id, label: evo.instance_name };
  // tenta Meta Cloud
  const { data: meta } = await admin.from("whatsapp_meta_connections")
    .select("id, display_name, status").eq("organization_id", orgId)
    .eq("status", "connected").limit(1).maybeSingle();
  if (meta) return { provider: "meta", connection_id: meta.id, label: meta.display_name };
  return null;
}

async function draftWhatsappMessage(admin: any, orgId: string, userId: string, args: any) {
  const recipientType = String(args?.recipient_type ?? "lead");
  const recipientId = String(args?.recipient_id ?? "");
  const intent = String(args?.intent ?? "").trim();
  const tone = String(args?.tone ?? "profissional");
  if (!recipientId || !intent) return { ok: false, error: "missing_params" };

  const ctx = await getContactContext(admin, orgId, { recipient_id: recipientId, recipient_type: recipientType });
  if (!ctx?.encontrado && !ctx?.lead) return { ok: false, error: "recipient_not_found" };

  let recipientName = "", recipientPhone: string | null = null;
  if (recipientType === "lead") {
    recipientName = ctx?.lead?.nome ?? ctx?.lead?.name ?? "Lead";
    recipientPhone = ctx?.lead?.telefone ?? ctx?.lead?.phone ?? null;
  } else {
    recipientName = ctx?.vendedor?.full_name ?? "Vendedor";
    recipientPhone = ctx?.vendedor?.phone ?? null;
  }
  if (!recipientPhone) return { ok: false, error: "no_phone", recipient_name: recipientName };

  // Normaliza DDI 55
  let phoneDigits = String(recipientPhone).replace(/\D/g, "");
  if (!phoneDigits.startsWith("55")) phoneDigits = "55" + phoneDigits;

  const conn = await pickWhatsappConnection(admin, orgId);
  if (!conn) return { ok: false, error: "no_whatsapp_connection" };

  const contextSummary = JSON.stringify(ctx).slice(0, 2000);
  const sys = `Você é a Mia, assistente comercial. Gere UMA mensagem curta e ${tone} de WhatsApp para ${recipientName}. Máx 4 linhas. Sem emojis exagerados. Use o contexto do CRM para soar natural e específica. Responda APENAS o texto da mensagem, nada mais.`;
  const usr = `Objetivo: ${intent}\n\nContexto do CRM (resumo):\n${contextSummary}`;
  const body = (await generateMessage(admin, orgId, sys, usr)).trim();
  if (!body) return { ok: false, error: "ai_generation_failed" };

  const riskLevel = recipientType === "lead" ? "high" : "medium";
  const preview = `WhatsApp para ${recipientName} (${phoneDigits}): "${body.slice(0, 140)}${body.length > 140 ? "…" : ""}"`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId,
    user_id: userId,
    action_type: "send_whatsapp",
    payload: {
      to: phoneDigits,
      body,
      provider: conn.provider,
      connection_id: conn.connection_id,
      recipient_type: recipientType,
      recipient_id: recipientId,
      recipient_label: `${recipientName} <${phoneDigits}>`,
      janela_24h: ctx?.janela_24h_whatsapp ?? false,
    },
    preview,
    status: "waiting_confirmation",
    risk_level: riskLevel,
  }).select("id, preview, payload, risk_level").single();

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    action_id: inserted.id,
    preview: inserted.preview,
    risk_level: riskLevel,
    confirmation_phrase: riskLevel === "high" ? "Confirmo envio externo" : "Confirmo envio",
    narration: `${preview}. ${riskLevel === "high" ? 'Para enviar, diga "Confirmo envio externo".' : 'Confirma envio?'}`,
  };
}

async function draftEmail(admin: any, orgId: string, userId: string, args: any) {
  const recipientType = String(args?.recipient_type ?? "lead");
  const recipientId = String(args?.recipient_id ?? "");
  const intent = String(args?.intent ?? "").trim();
  const subjectHint = String(args?.subject_hint ?? "").trim();
  if (!recipientId || !intent) return { ok: false, error: "missing_params" };

  const ctx = await getContactContext(admin, orgId, { recipient_id: recipientId, recipient_type: recipientType });
  let recipientName = "", recipientEmail: string | null = null;
  if (recipientType === "lead") {
    recipientName = ctx?.lead?.nome ?? "Lead";
    recipientEmail = ctx?.lead?.email ?? null;
  } else {
    recipientName = ctx?.vendedor?.full_name ?? "Vendedor";
    recipientEmail = ctx?.vendedor?.email ?? null;
  }
  if (!recipientEmail) return { ok: false, error: "no_email", recipient_name: recipientName };

  const contextSummary = JSON.stringify(ctx).slice(0, 2000);
  const sys = `Você é a Mia, assistente comercial. Gere um e-mail profissional curto (máx 6 linhas) para ${recipientName}. Devolva APENAS JSON válido: {"subject":"...","body_html":"<p>...</p>"}. Use o contexto do CRM.`;
  const usr = `Objetivo: ${intent}\nDica de assunto: ${subjectHint || "(livre)"}\n\nContexto:\n${contextSummary}`;
  const raw = await generateMessage(admin, orgId, sys, usr, true);
  let parsed: any = {};
  try { parsed = JSON.parse(raw); } catch { parsed = { subject: subjectHint || "Mensagem", body_html: `<p>${raw}</p>` }; }
  const subject = String(parsed.subject ?? subjectHint ?? "Mensagem");
  const bodyHtml = String(parsed.body_html ?? parsed.body ?? "");
  if (!bodyHtml) return { ok: false, error: "ai_generation_failed" };

  const preview = `E-mail para ${recipientName} <${recipientEmail}> — Assunto: "${subject}"`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId,
    user_id: userId,
    action_type: "send_email",
    payload: {
      to: recipientEmail,
      subject,
      body_html: bodyHtml,
      recipient_type: recipientType,
      recipient_id: recipientId,
      recipient_label: `${recipientName} <${recipientEmail}>`,
    },
    preview,
    status: "waiting_confirmation",
    risk_level: "high",
  }).select("id, preview, payload, risk_level").single();

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    action_id: inserted.id,
    preview: inserted.preview,
    risk_level: "high",
    confirmation_phrase: "Confirmo envio externo",
    narration: `${preview}. Para enviar, diga "Confirmo envio externo".`,
  };
}

async function draftInternalNotification(admin: any, orgId: string, userId: string, args: any) {
  const audience = String(args?.audience ?? "user");
  const title = String(args?.title ?? "Mensagem da Mia").slice(0, 120);
  const message = String(args?.message ?? "").trim();
  if (!message) return { ok: false, error: "missing_message" };

  let userIds: string[] = [];
  let audienceLabel = "";

  if (audience === "user" && args?.target_id) {
    userIds = [String(args.target_id)];
    const { data: p } = await admin.from("profiles").select("full_name").eq("id", args.target_id).maybeSingle();
    audienceLabel = p?.full_name ?? "1 usuário";
  } else if (audience === "sector" && args?.target_id) {
    const { data: members } = await admin.from("sector_members").select("user_id").eq("sector_id", args.target_id);
    userIds = (members ?? []).map((m: any) => m.user_id);
    const { data: s } = await admin.from("sectors").select("name").eq("id", args.target_id).maybeSingle();
    audienceLabel = `Setor ${s?.name ?? args.target_id} (${userIds.length} pessoas)`;
  } else if (audience === "squad" && args?.target_id) {
    const { data: members } = await admin.from("squad_members").select("user_id").eq("squad_id", args.target_id);
    userIds = (members ?? []).map((m: any) => m.user_id);
    audienceLabel = `Squad (${userIds.length} pessoas)`;
  } else if (audience === "all") {
    userIds = await getOrgUserIds(admin, orgId);
    audienceLabel = `Toda a equipe (${userIds.length} pessoas)`;
  }
  if (!userIds.length) return { ok: false, error: "no_recipients" };

  const preview = `Notificação interna para ${audienceLabel}: "${message.slice(0, 120)}"`;
  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId,
    user_id: userId,
    action_type: "send_notification",
    payload: { user_ids: userIds, title, message, audience, audience_label: audienceLabel },
    preview,
    status: "waiting_confirmation",
    risk_level: "low",
  }).select("id, preview, payload, risk_level").single();
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    action_id: inserted.id,
    preview: inserted.preview,
    risk_level: "low",
    confirmation_phrase: "Confirmo",
    narration: `${preview}. Confirma?`,
  };
}

async function draftPush(admin: any, orgId: string, userId: string, args: any) {
  const targetUserId = String(args?.user_id ?? "");
  if (!targetUserId) return { ok: false, error: "missing_user_id" };
  return draftInternalNotification(admin, orgId, userId, {
    audience: "user",
    target_id: targetUserId,
    title: args?.title ?? "Mia",
    message: args?.body ?? "",
  });
}

// ============= FASE 5 — MEMÓRIA + AÇÃO EM CONVERSA ATIVA =============

async function getMemory(admin: any, orgId: string, userId: string) {
  const { data: prof } = await admin.from("profiles")
    .select("full_name, email").eq("id", userId).maybeSingle();
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const { data: mem } = await admin.from("mia_user_memory")
    .select("*").eq("user_id", userId).eq("organization_id", orgId).maybeSingle();

  return {
    usuario: {
      id: userId,
      nome: mem?.display_name ?? prof?.full_name ?? "Admin",
      email: prof?.email ?? null,
      papel: mem?.role_label ?? (roles ?? []).map((r: any) => r.role).join(", ") ?? "admin",
      timezone: mem?.timezone ?? "America/Sao_Paulo",
      locale: mem?.locale ?? "pt-BR",
    },
    empresa: { id: orgId, nome: org?.name ?? null },
    preferencias: mem?.preferences ?? {},
    fatos: mem?.facts ?? [],
    ultimas_entidades: mem?.last_active_entities ?? {},
  };
}

async function upsertMemory(admin: any, orgId: string, userId: string, patch: any) {
  const { data: existing } = await admin.from("mia_user_memory")
    .select("id, preferences, facts").eq("user_id", userId).eq("organization_id", orgId).maybeSingle();
  if (existing) {
    await admin.from("mia_user_memory").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await admin.from("mia_user_memory").insert({ user_id: userId, organization_id: orgId, ...patch });
  }
}

async function rememberFact(admin: any, orgId: string, userId: string, args: any) {
  const key = String(args?.key ?? "").trim().toLowerCase();
  const value = String(args?.value ?? "").trim();
  if (!key || !value) return { ok: false, error: "missing_key_or_value" };
  const { data: existing } = await admin.from("mia_user_memory")
    .select("facts, display_name").eq("user_id", userId).eq("organization_id", orgId).maybeSingle();
  const facts = Array.isArray(existing?.facts) ? existing.facts.filter((f: any) => f.key !== key) : [];
  facts.push({ key, value, source: "user", created_at: new Date().toISOString() });
  const patch: any = { facts };
  // Atalho: se a chave for "nome" ou "meu_nome", popular display_name também
  if (["nome", "meu_nome", "name"].includes(key) && !existing?.display_name) {
    patch.display_name = value;
  }
  await upsertMemory(admin, orgId, userId, patch);
  return { ok: true, narration: `Anotado: ${key} = ${value}.` };
}

async function forgetFact(admin: any, orgId: string, userId: string, args: any) {
  const key = String(args?.key ?? "").trim().toLowerCase();
  if (!key) return { ok: false, error: "missing_key" };
  const { data: existing } = await admin.from("mia_user_memory")
    .select("facts").eq("user_id", userId).eq("organization_id", orgId).maybeSingle();
  const facts = (existing?.facts ?? []).filter((f: any) => f.key !== key);
  await upsertMemory(admin, orgId, userId, { facts });
  return { ok: true, narration: `Esqueci ${key}.` };
}

async function updatePreference(admin: any, orgId: string, userId: string, args: any) {
  const key = String(args?.key ?? "").trim();
  const value = args?.value;
  if (!key) return { ok: false, error: "missing_key" };
  const { data: existing } = await admin.from("mia_user_memory")
    .select("preferences").eq("user_id", userId).eq("organization_id", orgId).maybeSingle();
  const preferences = { ...(existing?.preferences ?? {}), [key]: value };
  await upsertMemory(admin, orgId, userId, { preferences });
  return { ok: true, narration: `Preferência ${key} atualizada.` };
}

async function findActiveConversation(admin: any, orgId: string, args: any) {
  const query = String(args?.query ?? "").trim();
  if (!query) return { encontrado: false, motivo: "query_vazia", mensagem: "Informe um nome ou telefone." };
  const like = `%${query}%`;
  const phoneDigits = query.replace(/\D/g, "");

  // 1) BUSCA PRIMÁRIA: direto no inbox (webchat_conversations com status != closed)
  const orClauses: string[] = [`visitor_name.ilike.${like}`];
  if (phoneDigits) {
    orClauses.push(`visitor_phone.ilike.%${phoneDigits}%`);
    orClauses.push(`visitor_phone_normalized.ilike.%${phoneDigits}%`);
  }

  const baseSelect = "id, channel, status, lead_id, visitor_name, visitor_phone, last_message_at, last_inbound_at, assigned_user_id, evolution_instance_id, meta_connection_id, instagram_connection_id, ig_sender_id, sector_id";

  const { data: directConvs } = await admin.from("webchat_conversations")
    .select(baseSelect)
    .eq("organization_id", orgId)
    .neq("status", "closed")
    .or(orClauses.join(","))
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(10);

  let convs = directConvs ?? [];

  // 2) FALLBACK: se nada bateu no inbox, tenta ponte via leads (caso o nome só exista no lead, não no visitor_name)
  if (!convs.length) {
    const { data: leads } = await admin.from("leads")
      .select("id")
      .eq("organization_id", orgId)
      .or(`name.ilike.${like},email.ilike.${like}${phoneDigits ? `,phone.ilike.%${phoneDigits}%` : ""}`)
      .limit(10);
    const leadIds = (leads ?? []).map((l: any) => l.id);
    if (leadIds.length) {
      const { data: viaLead } = await admin.from("webchat_conversations")
        .select(baseSelect)
        .eq("organization_id", orgId)
        .neq("status", "closed")
        .in("lead_id", leadIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(10);
      convs = viaLead ?? [];
    }
  }

  if (!convs.length) {
    return {
      encontrado: false,
      motivo: "sem_atendimento_ativo",
      mensagem: `Não tem atendimento aberto com "${query}" no inbox. Se quiser, posso abrir um WhatsApp novo (outreach).`,
    };
  }

  const assignedIds = Array.from(new Set(convs.map((c: any) => c.assigned_user_id).filter(Boolean)));
  const sectorIds = Array.from(new Set(convs.map((c: any) => c.sector_id).filter(Boolean)));
  const nameMap = new Map<string, string>();
  const sectorMap = new Map<string, string>();
  if (assignedIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", assignedIds);
    for (const p of profs ?? []) nameMap.set(p.id, p.full_name ?? "—");
  }
  if (sectorIds.length) {
    const { data: secs } = await admin.from("sectors").select("id, name").in("id", sectorIds);
    for (const s of secs ?? []) sectorMap.set(s.id, s.name ?? "—");
  }

  const now = Date.now();
  const candidatos = convs.map((c: any) => {
    let provider: string | null = null;
    if (c.meta_connection_id) provider = "meta";
    else if (c.instagram_connection_id) provider = "instagram";
    else if (c.evolution_instance_id) provider = "evolution";
    else if (c.channel === "whatsapp") provider = "evolution";
    else provider = c.channel ?? "webchat";
    const inboundMs = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : null;
    const janela_24h = inboundMs ? (now - inboundMs) < 24 * 3600 * 1000 : false;
    return {
      conversation_id: c.id,
      lead_id: c.lead_id,
      nome: c.visitor_name,
      telefone: c.visitor_phone,
      canal: c.channel,
      provider,
      status: c.status,
      setor: c.sector_id ? sectorMap.get(c.sector_id) ?? null : null,
      responsavel: c.assigned_user_id ? nameMap.get(c.assigned_user_id) ?? "—" : "Sem responsável",
      assigned_user_id: c.assigned_user_id,
      ultima_mensagem: c.last_message_at,
      janela_24h_ok: janela_24h,
    };
  });

  return {
    encontrado: true,
    total: candidatos.length,
    ambiguidade: candidatos.length > 1,
    conversas: candidatos,
  };
}

async function draftConversationMessage(admin: any, orgId: string, userId: string, args: any) {
  const conversationId = String(args?.conversation_id ?? "");
  const intent = String(args?.intent ?? "").trim();
  const literalBody = String(args?.body ?? "").trim();
  const tone = String(args?.tone ?? "natural");
  if (!conversationId) return { ok: false, error: "missing_conversation_id" };
  if (!intent && !literalBody) return { ok: false, error: "missing_intent_or_body" };

  const { data: conv } = await admin.from("webchat_conversations")
    .select("id, organization_id, channel, lead_id, visitor_name, visitor_phone, visitor_phone_normalized, assigned_user_id, evolution_instance_id, meta_connection_id, instagram_connection_id, ig_sender_id, last_inbound_at")
    .eq("id", conversationId).eq("organization_id", orgId).maybeSingle();
  if (!conv) return { ok: false, error: "conversation_not_found" };

  // provider
  let provider: "evolution" | "meta" | "instagram" | "webchat" = "webchat";
  if (conv.meta_connection_id) provider = "meta";
  else if (conv.instagram_connection_id) provider = "instagram";
  else if (conv.evolution_instance_id || conv.channel === "whatsapp") provider = "evolution";

  // janela 24h (Meta/IG)
  const inboundMs = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : null;
  const janela_ok = inboundMs ? (Date.now() - inboundMs) < 24 * 3600 * 1000 : false;
  if ((provider === "meta" || provider === "instagram") && !janela_ok) {
    return {
      ok: false,
      error: "window_closed",
      narration: `A janela de 24h da conversa com ${conv.visitor_name ?? "este contato"} está fechada. Preciso de um template aprovado pra reabrir.`,
    };
  }

  // resolver "to"
  let to = "";
  if (provider === "instagram") {
    to = conv.ig_sender_id ?? "";
  } else {
    to = (conv.visitor_phone_normalized || conv.visitor_phone || "").replace(/\D/g, "");
    if (to && !to.startsWith("55")) to = "55" + to;
  }
  if (!to) return { ok: false, error: "no_destination" };

  // Gera corpo com IA (ou usa o body literal)
  let body = literalBody;
  if (!body) {
    // Pega últimas 6 mensagens pra contexto
    const { data: msgs } = await admin.from("webchat_messages")
      .select("direction, sender_type, content, created_at")
      .eq("conversation_id", conversationId).eq("is_deleted", false)
      .order("created_at", { ascending: false }).limit(6);
    const history = (msgs ?? []).slice().reverse().map((m: any) => {
      const who = m.direction === "outbound" ? "Atendente" : (conv.visitor_name ?? "Lead");
      return `${who}: ${String(m.content ?? "").slice(0, 300)}`;
    }).join("\n");

    const sys = `Você é a Mia escrevendo em nome do atendente. Gere UMA mensagem ${tone} para continuar a conversa de WhatsApp com ${conv.visitor_name ?? "o cliente"}. Máx 3 linhas, português BR natural. Responda APENAS o texto, sem aspas, sem assinatura.`;
    const usr = `Objetivo: ${intent}\n\nHistórico recente da conversa:\n${history || "(vazio)"}`;
    body = (await generateMessage(admin, orgId, sys, usr)).trim();
  }
  if (!body) return { ok: false, error: "ai_generation_failed" };

  // risco: medium se a conversa é minha, high se é de outro
  const isMine = !conv.assigned_user_id || conv.assigned_user_id === userId;
  const riskLevel = isMine ? "medium" : "high";

  // preview com últimas 2 mensagens pra confirmar contexto
  const { data: tail } = await admin.from("webchat_messages")
    .select("direction, content, created_at").eq("conversation_id", conversationId).eq("is_deleted", false)
    .order("created_at", { ascending: false }).limit(2);
  const tailText = (tail ?? []).slice().reverse().map((m: any) =>
    `${m.direction === "outbound" ? "→" : "←"} ${String(m.content ?? "").slice(0, 120)}`
  ).join("\n");

  const preview = `Resposta na conversa com ${conv.visitor_name ?? "—"} (${provider}): "${body.slice(0, 140)}${body.length > 140 ? "…" : ""}"`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId,
    user_id: userId,
    action_type: "send_conversation_message",
    payload: {
      conversation_id: conversationId,
      provider,
      to,
      body,
      recipient_type: "lead",
      recipient_id: conv.lead_id,
      recipient_label: `${conv.visitor_name ?? "—"} (conversa ${provider})`,
      assigned_to_other: !isMine,
      context_tail: tailText,
      meta_connection_id: conv.meta_connection_id,
      instagram_connection_id: conv.instagram_connection_id,
      evolution_instance_id: conv.evolution_instance_id,
      ig_sender_id: conv.ig_sender_id,
    },
    preview,
    status: "waiting_confirmation",
    risk_level: riskLevel,
  }).select("id, preview, risk_level").single();
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    action_id: inserted.id,
    preview: inserted.preview,
    risk_level: riskLevel,
    confirmation_phrase: riskLevel === "high" ? "Confirmo envio externo" : "Confirmo envio",
    narration: `Vou enviar pra ${conv.visitor_name ?? "—"} pelo ${provider}: "${body.slice(0, 100)}${body.length > 100 ? "…" : ""}". ${riskLevel === "high" ? 'Conversa é de outro vendedor — pra liberar, diga "Confirmo envio externo".' : 'Confirma envio?'}`,
    context_tail: tailText,
  };
}


// ============================================================
// FASE 6 — Gestão de atendimentos (escopo organização inteira)
// ============================================================

const CONV_SELECT = "id, channel, status, lead_id, visitor_name, visitor_phone, last_message_at, last_inbound_at, last_message_content, assigned_user_id, current_agent_id, sector_id, evolution_instance_id, meta_connection_id, instagram_connection_id, ig_sender_id";

async function hydrateConversations(admin: any, convs: any[]) {
  if (!convs.length) return [];
  const userIds = Array.from(new Set(convs.map((c: any) => c.assigned_user_id).filter(Boolean)));
  const sectorIds = Array.from(new Set(convs.map((c: any) => c.sector_id).filter(Boolean)));
  const agentIds = Array.from(new Set(convs.map((c: any) => c.current_agent_id).filter(Boolean)));
  const userMap = new Map<string, string>();
  const sectorMap = new Map<string, string>();
  const agentMap = new Map<string, string>();
  if (userIds.length) {
    const { data } = await admin.from("profiles").select("id, full_name").in("id", userIds);
    for (const p of data ?? []) userMap.set(p.id, p.full_name ?? "—");
  }
  if (sectorIds.length) {
    const { data } = await admin.from("sectors").select("id, name").in("id", sectorIds);
    for (const s of data ?? []) sectorMap.set(s.id, s.name ?? "—");
  }
  if (agentIds.length) {
    const { data } = await admin.from("product_agents").select("id, name").in("id", agentIds);
    for (const a of data ?? []) agentMap.set(a.id, a.name ?? "—");
  }
  const now = Date.now();
  return convs.map((c: any) => {
    let provider: string | null = null;
    if (c.meta_connection_id) provider = "meta";
    else if (c.instagram_connection_id) provider = "instagram";
    else if (c.evolution_instance_id || c.channel === "whatsapp") provider = "evolution";
    else provider = c.channel ?? "webchat";
    const inboundMs = c.last_inbound_at ? new Date(c.last_inbound_at).getTime() : null;
    return {
      conversation_id: c.id,
      lead_id: c.lead_id,
      nome: c.visitor_name,
      telefone: c.visitor_phone,
      canal: c.channel,
      provider,
      status: c.status,
      setor: c.sector_id ? sectorMap.get(c.sector_id) ?? null : null,
      sector_id: c.sector_id,
      responsavel: c.assigned_user_id ? userMap.get(c.assigned_user_id) ?? "—" : null,
      assigned_user_id: c.assigned_user_id,
      agente_ia: c.current_agent_id ? agentMap.get(c.current_agent_id) ?? null : null,
      current_agent_id: c.current_agent_id,
      aguardando_humano: c.status === "waiting_human",
      ultima_mensagem: c.last_message_at,
      ultima_msg_texto: typeof c.last_message_content === "string" ? c.last_message_content.slice(0, 160) : null,
      sem_resposta_min: inboundMs ? Math.round((now - inboundMs) / 60000) : null,
      janela_24h_ok: inboundMs ? (now - inboundMs) < 24 * 3600 * 1000 : false,
    };
  });
}

async function listConversations(admin: any, orgId: string, args: any) {
  const limit = Math.min(Number(args?.limit ?? 20), 50);
  let q = admin.from("webchat_conversations")
    .select(CONV_SELECT)
    .eq("organization_id", orgId)
    .neq("status", "closed")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  const status = String(args?.status ?? "").trim();
  if (status) q = q.eq("status", status);
  if (args?.sector_id) q = q.eq("sector_id", args.sector_id);
  if (args?.assigned_user_id) q = q.eq("assigned_user_id", args.assigned_user_id);
  if (args?.current_agent_id) q = q.eq("current_agent_id", args.current_agent_id);
  if (args?.channel) q = q.eq("channel", args.channel);
  if (args?.aguardando_humano === true) q = q.eq("status", "waiting_human");
  if (args?.com_agente_ia === true) q = q.not("current_agent_id", "is", null);
  if (args?.sem_responsavel === true) q = q.is("assigned_user_id", null);

  const minutos = Number(args?.sem_resposta_ha_minutos ?? 0);
  if (minutos > 0) {
    const cutoff = new Date(Date.now() - minutos * 60_000).toISOString();
    q = q.lt("last_inbound_at", cutoff).not("last_inbound_at", "is", null);
  }

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const conversas = await hydrateConversations(admin, data ?? []);
  return { ok: true, total: conversas.length, conversas };
}

async function getConversationDetail(admin: any, orgId: string, args: any) {
  const id = String(args?.conversation_id ?? "");
  if (!id) return { ok: false, error: "missing_conversation_id" };
  const { data: conv } = await admin.from("webchat_conversations")
    .select(CONV_SELECT + ", created_at, closed_at, accepted_at, accepted_by")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!conv) return { encontrado: false };
  const [hydrated] = await hydrateConversations(admin, [conv]);

  const [msgs, transfers, handoffs] = await Promise.all([
    admin.from("webchat_messages")
      .select("direction, sender_type, content, created_at")
      .eq("conversation_id", id).eq("is_deleted", false)
      .order("created_at", { ascending: false }).limit(Math.min(Number(args?.limit ?? 10), 30)),
    admin.from("conversation_transfers")
      .select("from_user_id, to_user_id, internal_note, created_at")
      .eq("conversation_id", id).order("created_at", { ascending: false }).limit(5),
    admin.from("agent_handoff_history")
      .select("from_agent_id, to_agent_id, reason, created_at")
      .eq("conversation_id", id).order("created_at", { ascending: false }).limit(5),
  ]);

  const mensagens = (msgs.data ?? []).slice().reverse().map((m: any) => ({
    de: m.direction === "outbound" ? "atendente" : "lead",
    texto: String(m.content ?? "").slice(0, 280),
    em: m.created_at,
  }));

  return { encontrado: true, conversa: hydrated, mensagens, transferencias: transfers.data ?? [], handoffs_ia: handoffs.data ?? [] };
}

async function listAgents(admin: any, orgId: string) {
  const { data: agents } = await admin.from("product_agents")
    .select("id, name, agent_type, is_active, active_in_inbox, active_in_chat, active_in_widget")
    .eq("organization_id", orgId).order("name", { ascending: true });
  if (!agents?.length) return { agentes: [] };

  const ids = agents.map((a: any) => a.id);
  const { data: convs } = await admin.from("webchat_conversations")
    .select("current_agent_id, status")
    .eq("organization_id", orgId).neq("status", "closed").in("current_agent_id", ids);

  const ativas = new Map<string, number>();
  const aguardando = new Map<string, number>();
  for (const c of convs ?? []) {
    if (!c.current_agent_id) continue;
    ativas.set(c.current_agent_id, (ativas.get(c.current_agent_id) ?? 0) + 1);
    if (c.status === "waiting_human") aguardando.set(c.current_agent_id, (aguardando.get(c.current_agent_id) ?? 0) + 1);
  }

  return {
    agentes: agents.map((a: any) => ({
      id: a.id,
      nome: a.name,
      tipo: a.agent_type,
      ativo: a.is_active,
      conversas_ativas: ativas.get(a.id) ?? 0,
      aguardando_humano: aguardando.get(a.id) ?? 0,
    })),
  };
}

async function getAgentWorkload(admin: any, orgId: string, args: any) {
  const term = String(args?.agent_name ?? "").trim();
  let agentId = args?.agent_id as string | undefined;
  if (!agentId && term) {
    const { data } = await admin.from("product_agents")
      .select("id, name").eq("organization_id", orgId).ilike("name", `%${term}%`).limit(2);
    if (!data?.length) return { encontrado: false, mensagem: `Agente "${term}" não encontrado.` };
    if (data.length > 1) return { encontrado: false, ambiguidade: true, candidatos: data };
    agentId = data[0].id;
  }
  if (!agentId) return { ok: false, error: "missing_agent" };

  const { data: agent } = await admin.from("product_agents").select("id, name").eq("id", agentId).maybeSingle();
  const { data: convs } = await admin.from("webchat_conversations")
    .select(CONV_SELECT)
    .eq("organization_id", orgId).neq("status", "closed").eq("current_agent_id", agentId)
    .order("last_message_at", { ascending: false, nullsFirst: false }).limit(20);

  const conversas = await hydrateConversations(admin, convs ?? []);
  const total = conversas.length;
  const aguardando = conversas.filter((c: any) => c.aguardando_humano).length;
  const paradas = conversas.filter((c: any) => (c.sem_resposta_min ?? 0) > 30).length;
  return { encontrado: true, agente: agent, total, aguardando_humano: aguardando, paradas_30min: paradas, conversas };
}

async function loadConv(admin: any, orgId: string, conversationId: string) {
  const { data } = await admin.from("webchat_conversations")
    .select(CONV_SELECT).eq("id", conversationId).eq("organization_id", orgId).maybeSingle();
  return data;
}

async function isAdminOrSuper(admin: any, userId: string) {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
}

async function draftAssignConversation(admin: any, orgId: string, userId: string, args: any) {
  const conv = await loadConv(admin, orgId, String(args?.conversation_id ?? ""));
  if (!conv) return { ok: false, error: "conversation_not_found" };
  let toUserId = args?.to_user_id as string | undefined;
  if (!toUserId && args?.to_user_name) {
    const term = String(args.to_user_name).trim();
    const { data } = await admin.from("profiles").select("id, full_name")
      .eq("organization_id", orgId).ilike("full_name", `%${term}%`).limit(2);
    if (!data?.length) return { ok: false, error: "user_not_found", narration: `Não achei vendedor "${term}".` };
    if (data.length > 1) return { ok: false, ambiguidade: true, candidatos: data };
    toUserId = data[0].id;
  }
  if (!toUserId) return { ok: false, error: "missing_user" };

  const { data: target } = await admin.from("profiles").select("full_name").eq("id", toUserId).maybeSingle();
  const previousAssigned = conv.assigned_user_id;
  const stealing = previousAssigned && previousAssigned !== toUserId;
  const isAdmin = await isAdminOrSuper(admin, userId);
  const riskLevel = stealing && !isAdmin ? "high" : "medium";

  const preview = `Atribuir conversa de ${conv.visitor_name ?? "—"} para ${target?.full_name ?? "—"}${stealing ? " (tirando do dono atual)" : ""}.`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "assign_conversation",
    payload: { conversation_id: conv.id, to_user_id: toUserId, from_user_id: previousAssigned, lead_id: conv.lead_id, recipient_label: conv.visitor_name },
    preview, status: "waiting_confirmation", risk_level: riskLevel,
  }).select("id, preview, risk_level").single();
  if (error) return { ok: false, error: error.message };

  return {
    ok: true, action_id: inserted.id, preview, risk_level: riskLevel,
    confirmation_phrase: riskLevel === "high" ? "Confirmo envio externo" : "Confirmo envio",
    narration: `${preview} ${riskLevel === "high" ? 'Tira de outro vendedor — pra liberar, diga "Confirmo envio externo".' : "Confirma?"}`,
  };
}

async function draftTransferSector(admin: any, orgId: string, userId: string, args: any) {
  const conv = await loadConv(admin, orgId, String(args?.conversation_id ?? ""));
  if (!conv) return { ok: false, error: "conversation_not_found" };
  let sectorId = args?.sector_id as string | undefined;
  if (!sectorId && args?.sector_name) {
    const term = String(args.sector_name).trim();
    const { data } = await admin.from("sectors").select("id, name")
      .eq("organization_id", orgId).ilike("name", `%${term}%`).limit(2);
    if (!data?.length) return { ok: false, error: "sector_not_found", narration: `Setor "${term}" não existe.` };
    if (data.length > 1) return { ok: false, ambiguidade: true, candidatos: data };
    sectorId = data[0].id;
  }
  if (!sectorId) return { ok: false, error: "missing_sector" };
  const { data: sec } = await admin.from("sectors").select("name").eq("id", sectorId).maybeSingle();
  const preview = `Mover conversa de ${conv.visitor_name ?? "—"} para o setor ${sec?.name ?? "—"}.`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "transfer_sector",
    payload: { conversation_id: conv.id, sector_id: sectorId, from_user_id: conv.assigned_user_id, recipient_label: conv.visitor_name },
    preview, status: "waiting_confirmation", risk_level: "medium",
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: "medium", confirmation_phrase: "Confirmo envio", narration: `${preview} Confirma?` };
}

async function draftCloseConversation(admin: any, orgId: string, userId: string, args: any) {
  const conv = await loadConv(admin, orgId, String(args?.conversation_id ?? ""));
  if (!conv) return { ok: false, error: "conversation_not_found" };
  const reason = String(args?.reason ?? "").trim() || null;
  const isAdmin = await isAdminOrSuper(admin, userId);
  const stealing = conv.assigned_user_id && conv.assigned_user_id !== userId;
  const riskLevel = stealing && !isAdmin ? "high" : "medium";
  const preview = `Encerrar conversa de ${conv.visitor_name ?? "—"}${reason ? ` (motivo: ${reason})` : ""}.`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "close_conversation",
    payload: { conversation_id: conv.id, reason, recipient_label: conv.visitor_name },
    preview, status: "waiting_confirmation", risk_level: riskLevel,
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: riskLevel, confirmation_phrase: riskLevel === "high" ? "Confirmo envio externo" : "Confirmo envio", narration: `${preview} Confirma?` };
}

async function draftTakeoverFromAgent(admin: any, orgId: string, userId: string, args: any) {
  const conv = await loadConv(admin, orgId, String(args?.conversation_id ?? ""));
  if (!conv) return { ok: false, error: "conversation_not_found" };
  if (!conv.current_agent_id) return { ok: false, error: "no_active_agent", narration: "Essa conversa não está com agente IA." };

  let toUserId = args?.to_user_id as string | undefined;
  if (!toUserId && args?.to_user_name) {
    const term = String(args.to_user_name).trim();
    const { data } = await admin.from("profiles").select("id, full_name")
      .eq("organization_id", orgId).ilike("full_name", `%${term}%`).limit(2);
    if (data?.length === 1) toUserId = data[0].id;
  }
  // Se não veio user, assume userId atual (Mia entrega pra quem pediu) — opcional
  const targetName = toUserId
    ? (await admin.from("profiles").select("full_name").eq("id", toUserId).maybeSingle()).data?.full_name ?? "—"
    : "fila humana";
  const preview = `Tirar agente IA da conversa de ${conv.visitor_name ?? "—"} e ${toUserId ? `passar pra ${targetName}` : "mandar pra fila humana"}.`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "takeover_from_agent",
    payload: { conversation_id: conv.id, from_agent_id: conv.current_agent_id, to_user_id: toUserId ?? null, recipient_label: conv.visitor_name },
    preview, status: "waiting_confirmation", risk_level: "medium",
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: "medium", confirmation_phrase: "Confirmo envio", narration: `${preview} Confirma?` };
}

async function draftHandbackToAgent(admin: any, orgId: string, userId: string, args: any) {
  const conv = await loadConv(admin, orgId, String(args?.conversation_id ?? ""));
  if (!conv) return { ok: false, error: "conversation_not_found" };
  let agentId = args?.agent_id as string | undefined;
  if (!agentId && args?.agent_name) {
    const term = String(args.agent_name).trim();
    const { data } = await admin.from("product_agents")
      .select("id, name").eq("organization_id", orgId).ilike("name", `%${term}%`).eq("is_active", true).limit(2);
    if (!data?.length) return { ok: false, error: "agent_not_found", narration: `Agente "${term}" não achado.` };
    if (data.length > 1) return { ok: false, ambiguidade: true, candidatos: data };
    agentId = data[0].id;
  }
  if (!agentId) return { ok: false, error: "missing_agent" };
  const { data: ag } = await admin.from("product_agents").select("name").eq("id", agentId).maybeSingle();
  const preview = `Devolver conversa de ${conv.visitor_name ?? "—"} pro agente IA ${ag?.name ?? "—"}.`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "handback_to_agent",
    payload: { conversation_id: conv.id, to_agent_id: agentId, from_user_id: conv.assigned_user_id, recipient_label: conv.visitor_name },
    preview, status: "waiting_confirmation", risk_level: "medium",
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: "medium", confirmation_phrase: "Confirmo envio", narration: `${preview} Confirma?` };
}


// ============================================================
// FASE 7 — Agenda (find / reschedule / cancel)
// ============================================================

async function findCalendarEvent(admin: any, orgId: string, args: any) {
  const query = String(args?.query ?? "").trim();
  const whenHint = String(args?.when_hint ?? "").toLowerCase();
  if (!query) return { encontrado: false, motivo: "missing_query" };

  // Lead match opcional
  let leadIds: string[] = [];
  const { data: leads } = await admin.from("leads")
    .select("id, name").eq("organization_id", orgId).ilike("name", `%${query}%`).limit(5);
  leadIds = (leads ?? []).map((l: any) => l.id);

  const now = new Date();
  let fromIso = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  let toIso: string | null = new Date(now.getTime() + 60 * 24 * 3600 * 1000).toISOString();

  if (whenHint.includes("hoje")) {
    fromIso = startOfDayISO(now);
    toIso = endOfDayISO(now);
  } else if (whenHint.includes("amanh")) {
    const t = new Date(now); t.setDate(t.getDate() + 1);
    fromIso = startOfDayISO(t); toIso = endOfDayISO(t);
  } else if (whenHint.includes("semana")) {
    const end = new Date(now); end.setDate(end.getDate() + 7);
    toIso = end.toISOString();
  }

  let q = admin.from("calendar_events")
    .select("id, title, description, start_time, end_time, location, status, lead_id, user_id, meet_link, attendees")
    .eq("organization_id", orgId)
    .neq("status", "cancelled")
    .gte("start_time", fromIso);
  if (toIso) q = q.lte("start_time", toIso);

  const { data: events } = await q.order("start_time", { ascending: true }).limit(50);
  const list = events ?? [];

  // filtra por título OU lead match
  const filtered = list.filter((e: any) => {
    const t = String(e.title ?? "").toLowerCase();
    const d = String(e.description ?? "").toLowerCase();
    const qLow = query.toLowerCase();
    if (t.includes(qLow) || d.includes(qLow)) return true;
    if (e.lead_id && leadIds.includes(e.lead_id)) return true;
    return false;
  });

  if (!filtered.length) return { encontrado: false, motivo: "no_events", query };

  // Hidrata nomes de leads
  const leadIdsSet = Array.from(new Set(filtered.map((e: any) => e.lead_id).filter(Boolean)));
  const leadMap = new Map<string, string>();
  if (leadIdsSet.length) {
    const { data: ld } = await admin.from("leads").select("id, name").in("id", leadIdsSet);
    for (const l of ld ?? []) leadMap.set(l.id, l.name ?? "—");
  }

  return {
    encontrado: true,
    total: filtered.length,
    eventos: filtered.slice(0, 8).map((e: any) => ({
      event_id: e.id,
      titulo: e.title,
      inicio: e.start_time,
      fim: e.end_time,
      local: e.location ?? e.meet_link ?? null,
      lead: e.lead_id ? (leadMap.get(e.lead_id) ?? null) : null,
      lead_id: e.lead_id,
      status: e.status,
    })),
  };
}

async function resolveEventId(admin: any, orgId: string, args: any): Promise<{ id: string | null; ambiguous?: any[]; narration?: string }> {
  if (args?.event_id) return { id: String(args.event_id) };
  if (!args?.event_query) return { id: null };
  const found = await findCalendarEvent(admin, orgId, { query: args.event_query });
  if (!found.encontrado) return { id: null, narration: `Não achei agendamento pra "${args.event_query}".` };
  if (found.eventos.length === 1) return { id: found.eventos[0].event_id };
  return { id: null, ambiguous: found.eventos, narration: `Achei ${found.eventos.length} agendamentos. Qual?` };
}

async function draftRescheduleBooking(admin: any, orgId: string, userId: string, args: any) {
  const newWhen = String(args?.new_when ?? "").trim();
  if (!newWhen) return { ok: false, error: "missing_new_when" };
  const newStart = new Date(newWhen);
  if (isNaN(newStart.getTime())) return { ok: false, error: "invalid_new_when" };

  const resolved = await resolveEventId(admin, orgId, args);
  if (!resolved.id) return { ok: false, ambiguidade: !!resolved.ambiguous, candidatos: resolved.ambiguous ?? [], narration: resolved.narration ?? "Informe event_id ou event_query." };

  const { data: ev } = await admin.from("calendar_events")
    .select("id, title, start_time, end_time, lead_id").eq("id", resolved.id).eq("organization_id", orgId).maybeSingle();
  if (!ev) return { ok: false, error: "event_not_found" };

  const origDuration = ev.end_time && ev.start_time
    ? new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime()
    : 60 * 60 * 1000;
  const duration = args?.duration_minutes ? Number(args.duration_minutes) * 60 * 1000 : origDuration;
  const newEnd = new Date(newStart.getTime() + duration);

  let leadName: string | null = null;
  if (ev.lead_id) {
    const { data: l } = await admin.from("leads").select("name").eq("id", ev.lead_id).maybeSingle();
    leadName = l?.name ?? null;
  }

  const fmt = (d: Date) => d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const preview = `Remarcar "${ev.title}"${leadName ? ` (${leadName})` : ""} de ${fmt(new Date(ev.start_time))} pra ${fmt(newStart)}.`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "reschedule_booking",
    payload: {
      event_id: ev.id,
      new_start: newStart.toISOString(),
      new_end: newEnd.toISOString(),
      reason: args?.reason ?? null,
      recipient_label: leadName ?? ev.title,
    },
    preview, status: "waiting_confirmation", risk_level: "medium",
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: "medium", confirmation_phrase: "Confirmo envio", narration: `${preview} Confirma?` };
}

async function draftCancelBooking(admin: any, orgId: string, userId: string, args: any) {
  const resolved = await resolveEventId(admin, orgId, args);
  if (!resolved.id) return { ok: false, ambiguidade: !!resolved.ambiguous, candidatos: resolved.ambiguous ?? [], narration: resolved.narration ?? "Informe event_id ou event_query." };

  const { data: ev } = await admin.from("calendar_events")
    .select("id, title, start_time, lead_id").eq("id", resolved.id).eq("organization_id", orgId).maybeSingle();
  if (!ev) return { ok: false, error: "event_not_found" };

  let leadName: string | null = null;
  if (ev.lead_id) {
    const { data: l } = await admin.from("leads").select("name").eq("id", ev.lead_id).maybeSingle();
    leadName = l?.name ?? null;
  }
  const fmt = (d: Date) => d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const preview = `Cancelar "${ev.title}"${leadName ? ` (${leadName})` : ""} de ${fmt(new Date(ev.start_time))}${args?.reason ? ` — motivo: ${args.reason}` : ""}.`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "cancel_booking",
    payload: { event_id: ev.id, reason: args?.reason ?? null, recipient_label: leadName ?? ev.title },
    preview, status: "waiting_confirmation", risk_level: "medium",
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: "medium", confirmation_phrase: "Confirmo envio", narration: `${preview} Confirma?` };
}


// ============================================================
// FASE 3 — charge_overdue_task (cobra tarefa atrasada, nível piloto)
// ============================================================

async function chargeOverdueTask(admin: any, orgId: string, userId: string, args: any) {
  const taskId = args?.task_id as string | undefined;
  if (!taskId) return { ok: false, error: "task_id obrigatório" };

  const { data: task } = await admin.from("tasks")
    .select("id, title, user_id, due_date, priority, description")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "Tarefa não encontrada" };

  const { data: responsible } = await admin.from("profiles")
    .select("id, full_name").eq("id", task.user_id).maybeSingle();
  const responsibleName = responsible?.full_name ?? "vendedor";

  const days = task.due_date
    ? Math.round((Date.now() - new Date(task.due_date).getTime()) / 86_400_000)
    : 0;

  const preview = `Cobrar tarefa atrasada ${days}d: "${task.title.slice(0, 50)}" — ${responsibleName}`;
  const autonomy = await lookupEffectiveAutonomy(admin, orgId, "charge_overdue_task");

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId,
    user_id:         userId,
    action_type:     "charge_overdue_task",
    payload:         { task_id: taskId, task_title: task.title, responsible_id: task.user_id, responsible_name: responsibleName, days_overdue: days },
    preview,
    status:          "waiting_confirmation",
    risk_level:      "low",
    autonomy_level:  autonomy.level,
    requires_approval: autonomy.level !== "piloto",
    target_type:     "task",
    target_id:       taskId,
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };

  const narration = autonomy.level === "piloto"
    ? `${preview}. Notificando agora.`
    : `${preview}. Confirma?`;

  return { ok: true, action_id: inserted.id, preview, autonomy_level: autonomy.level, requires_approval: autonomy.level !== "piloto", narration };
}

// ============================================================
// HELPER DE GOVERNANÇA — lookup de autonomia efetiva
// ============================================================

/**
 * Retorna o nível de autonomia efetivo para um action_type numa org.
 * Ordem: org override > catálogo default > 'um_clique' (fallback seguro).
 * Também retorna reversible e is_external do catálogo.
 */
async function lookupEffectiveAutonomy(
  admin: any,
  orgId: string,
  actionType: string,
): Promise<{ level: string; reversible: boolean; is_external: boolean }> {
  const [catRes, overrideRes] = await Promise.all([
    admin.from("mia_action_catalog")
      .select("default_autonomy, reversible, is_external")
      .eq("action_type", actionType)
      .maybeSingle(),
    admin.from("mia_autonomy_settings")
      .select("level")
      .eq("organization_id", orgId)
      .eq("action_type", actionType)
      .eq("active", true)
      .maybeSingle(),
  ]);
  const cat = catRes.data;
  return {
    level:       overrideRes.data?.level ?? cat?.default_autonomy ?? "um_clique",
    reversible:  cat?.reversible  ?? false,
    is_external: cat?.is_external ?? false,
  };
}

// ============================================================
// FASE 8 — CRM Write (create/update com confirmação humana)
// ============================================================

async function draftCreateLead(admin: any, orgId: string, userId: string, args: any) {
  const name = String(args?.name ?? "").trim();
  if (!name) return { ok: false, error: "name obrigatório" };

  // Resolve produto se informado
  let productId: string | null = null;
  if (args?.product_name) {
    const { data: prod } = await admin.from("products").select("id, name")
      .eq("organization_id", orgId).ilike("name", `%${args.product_name}%`).limit(1).maybeSingle();
    productId = prod?.id ?? null;
  }

  // Resolve responsável se informado
  let assignedTo: string | null = null;
  if (args?.assignee_name) {
    const { data: prof } = await admin.from("profiles").select("id, full_name")
      .eq("organization_id", orgId).ilike("full_name", `%${args.assignee_name}%`).limit(1).maybeSingle();
    assignedTo = prof?.id ?? null;
  }

  const preview = `Criar lead "${name}"${args?.email ? ` <${args.email}>` : ""}${args?.phone ? ` | ${args.phone}` : ""}${args?.company ? ` — ${args.company}` : ""}`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "create_lead",
    payload: {
      name, email: args?.email ?? null, phone: args?.phone ?? null,
      company: args?.company ?? null, source: args?.source ?? "mia",
      temperature: args?.temperature ?? "cold",
      product_id: productId, assigned_to: assignedTo,
      notes: args?.notes ?? null,
    },
    preview, status: "waiting_confirmation", risk_level: "low",
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: "low", confirmation_phrase: "Confirmo", narration: `${preview}. Confirma?` };
}

async function draftUpdateLeadStage(admin: any, orgId: string, userId: string, args: any) {
  const leads = await findLead(admin, orgId, args);
  if (!leads.length) return { ok: false, error: "lead_not_found" };
  if (leads.length > 1 && !args?.lead_id) return { ok: false, ambiguidade: true, candidatos: leads.map((l: any) => ({ id: l.id, nome: l.name })) };
  const lead = leads[0];

  // Resolve etapa
  let stageId = args?.stage_id as string | undefined;
  if (!stageId && args?.stage_name) {
    const { data: stages } = await admin.from("pipeline_stages")
      .select("id, name").eq("organization_id", orgId).ilike("name", `%${args.stage_name}%`).limit(2);
    if (!stages?.length) return { ok: false, error: "stage_not_found", narration: `Etapa "${args.stage_name}" não encontrada.` };
    if (stages.length > 1) return { ok: false, ambiguidade: true, candidatos: stages };
    stageId = stages[0].id;
  }
  if (!stageId) return { ok: false, error: "missing_stage" };

  const { data: stage } = await admin.from("pipeline_stages").select("name").eq("id", stageId).maybeSingle();
  const preview = `Mover lead "${lead.name}" para a etapa "${stage?.name ?? stageId}".`;

  // Governança: consulta o nível efetivo de autonomia desta org para este action_type
  const autonomy = await lookupEffectiveAutonomy(admin, orgId, "update_lead_stage");
  const autonomyLevel = autonomy.level;
  // Ação reversível → undo_payload capturado pelo mia-execute-action antes de executar

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId,
    user_id:         userId,
    action_type:     "update_lead_stage",
    payload:         { lead_id: lead.id, lead_name: lead.name, stage_id: stageId, stage_name: stage?.name },
    preview,
    status:          "waiting_confirmation",
    risk_level:      "low",
    autonomy_level:  autonomyLevel,
    requires_approval: autonomyLevel !== "piloto",
    target_type:     "lead",
    target_id:       lead.id,
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };

  // Narração adaptada ao nível: piloto não pede confirmação
  const narration = autonomyLevel === "piloto"
    ? `${preview} Executando agora.`
    : `${preview} Confirma?`;

  return {
    ok:                 true,
    action_id:          inserted.id,
    preview,
    risk_level:         "low",
    autonomy_level:     autonomyLevel,   // lido pelo useMiaSession para auto-confirmar
    requires_approval:  autonomyLevel !== "piloto",
    confirmation_phrase: "Confirmo",
    narration,
  };
}

async function draftUpdateLeadTemperature(admin: any, orgId: string, userId: string, args: any) {
  const leads = await findLead(admin, orgId, args);
  if (!leads.length) return { ok: false, error: "lead_not_found" };
  if (leads.length > 1 && !args?.lead_id) return { ok: false, ambiguidade: true, candidatos: leads.map((l: any) => ({ id: l.id, nome: l.name })) };
  const lead = leads[0];
  const temp = String(args?.temperature ?? "").toLowerCase();
  if (!["cold", "warm", "hot"].includes(temp)) return { ok: false, error: "temperatura inválida — use cold, warm ou hot" };
  const labels: Record<string, string> = { cold: "frio", warm: "morno", hot: "quente" };
  const preview = `Marcar lead "${lead.name}" como ${labels[temp]}.`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "update_lead_temperature",
    payload: { lead_id: lead.id, lead_name: lead.name, temperature: temp },
    preview, status: "waiting_confirmation", risk_level: "low",
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: "low", confirmation_phrase: "Confirmo", narration: `${preview} Confirma?` };
}

async function draftCreateNote(admin: any, orgId: string, userId: string, args: any) {
  const content = String(args?.content ?? "").trim();
  if (!content) return { ok: false, error: "content obrigatório" };
  const leads = await findLead(admin, orgId, args);
  if (!leads.length) return { ok: false, error: "lead_not_found" };
  if (leads.length > 1 && !args?.lead_id) return { ok: false, ambiguidade: true, candidatos: leads.map((l: any) => ({ id: l.id, nome: l.name })) };
  const lead = leads[0];
  const preview = `Adicionar nota em "${lead.name}": "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "create_note",
    payload: { lead_id: lead.id, lead_name: lead.name, content },
    preview, status: "waiting_confirmation", risk_level: "low",
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: "low", confirmation_phrase: "Confirmo", narration: `${preview}. Confirma?` };
}

async function draftCreateCalendarEvent(admin: any, orgId: string, userId: string, args: any) {
  const title    = String(args?.title ?? "").trim();
  const startIso = String(args?.start_time ?? "").trim();
  if (!title || !startIso) return { ok: false, error: "title e start_time são obrigatórios" };
  const startDate = new Date(startIso);
  if (isNaN(startDate.getTime())) return { ok: false, error: "start_time inválido (use ISO 8601)" };
  const durationMs = (args?.duration_minutes ?? 60) * 60_000;
  const endDate    = new Date(startDate.getTime() + durationMs);

  let leadId: string | null = null;
  if (args?.lead_name || args?.lead_id) {
    const leads = await findLead(admin, orgId, args);
    leadId = leads[0]?.id ?? null;
  }
  let assigneeId = userId;
  if (args?.assignee_name) {
    const { data: prof } = await admin.from("profiles").select("id").eq("organization_id", orgId)
      .ilike("full_name", `%${args.assignee_name}%`).limit(1).maybeSingle();
    if (prof?.id) assigneeId = prof.id;
  }

  const fmt = (d: Date) => d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const preview = `Agendar "${title}" em ${fmt(startDate)}${leadId ? ` para o lead ${args?.lead_name ?? ""}` : ""}`;

  const { data: inserted, error } = await admin.from("mia_actions").insert({
    organization_id: orgId, user_id: userId, action_type: "create_calendar_event",
    payload: { title, start_time: startDate.toISOString(), end_time: endDate.toISOString(),
      description: args?.description ?? null, location: args?.location ?? null,
      lead_id: leadId, user_id: assigneeId, event_type: args?.event_type ?? "reuniao" },
    preview, status: "waiting_confirmation", risk_level: "low",
  }).select("id, preview").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: inserted.id, preview, risk_level: "low", confirmation_phrase: "Confirmo", narration: `${preview}. Confirma?` };
}

async function searchBusinessKnowledge(admin: any, orgId: string, args: any) {
  const query = String(args?.query ?? "").trim();
  const category = args?.category as string | undefined;
  if (!query) return { ok: false, error: "query obrigatório" };

  // Busca por similaridade textual simples (sem embedding) — funciona antes do pgvector estar populado
  let q = admin.from("mia_business_knowledge")
    .select("id, category, title, content, confidence, occurrences, last_seen_at")
    .eq("organization_id", orgId).eq("is_active", true);
  if (category) q = q.eq("category", category);

  const { data: all } = await q.order("occurrences", { ascending: false }).limit(50);
  if (!all?.length) return { resultados: [], total: 0, mensagem: "Base de conhecimento ainda vazia." };

  // Filtro por relevância textual simples
  const qLow = query.toLowerCase();
  const scored = (all as any[])
    .map((k) => {
      const text = `${k.title} ${k.content}`.toLowerCase();
      const score = qLow.split(" ").filter((w: string) => w.length > 2 && text.includes(w)).length;
      return { ...k, score };
    })
    .filter((k) => k.score > 0 || all.length <= 5)
    .sort((a, b) => b.score - a.score || b.occurrences - a.occurrences)
    .slice(0, 6);

  return {
    total: scored.length,
    resultados: scored.map((k) => ({
      categoria: k.category, titulo: k.title, conteudo: k.content,
      confianca: k.confidence, ocorrencias: k.occurrences,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isInternal = Boolean(serviceKey && token === serviceKey && body?.internal === true);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey
    );
    let userId = "";
    let orgId = "";

    if (isInternal) {
      userId = String(body?.user_id ?? "");
      orgId = String(body?.organization_id ?? "");
      if (!userId || !orgId) {
        return new Response(JSON.stringify({ error: "invalid_internal_context" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = String(claimsData.claims.sub);
    }

    const [{ data: roles }, { data: profile }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
    ]);
    const hasAccess = (roles ?? []).some((r: any) => ALLOWED_ROLES.includes(r.role));
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isInternal && profile?.organization_id !== orgId) {
      return new Response(JSON.stringify({ error: "invalid_internal_organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    orgId = String(profile?.organization_id ?? orgId);
    if (!orgId) {
      return new Response(JSON.stringify({ error: "no_org" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: miaEnabled, error: miaAccessError } = await admin.rpc("organization_has_mia", { p_org_id: orgId });
    if (miaAccessError || miaEnabled !== true) {
      return new Response(JSON.stringify({ error: "mia_not_in_plan" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tool = String(body?.tool ?? "");
    if (!ALLOWED_TOOLS.has(tool)) {
      return new Response(JSON.stringify({ error: "unknown_tool", tool }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any;
    switch (tool) {
      case "get_operation_summary": result = await getOperationSummary(admin, orgId); break;
      case "get_team_status": result = await getTeamStatus(admin, orgId); break;
      case "get_unanswered_conversations": result = await getUnansweredConversations(admin, orgId); break;
      case "get_hot_leads": result = await getHotLeads(admin, orgId); break;
      case "get_overdue_tasks": result = await getOverdueTasks(admin, orgId); break;
      case "get_today_schedule": result = await getTodaySchedule(admin, orgId); break;
      // Fase 3 — Analyst
      case "get_lead_context": result = await getLeadContext(admin, orgId, body?.args ?? {}); break;
      case "get_conversation_summary": result = await getConversationSummary(admin, orgId, body?.args ?? {}); break;
      case "get_conversation_messages": result = await getConversationMessages(admin, orgId, body?.args ?? {}); break;
      case "get_seller_context": result = await getSellerContext(admin, orgId, body?.args ?? {}); break;
      case "get_pipeline_context": result = await getPipelineContext(admin, orgId, body?.args ?? {}); break;
      case "get_followup_context": result = await getFollowupContext(admin, orgId); break;
      case "get_daily_ai_summary": result = await getDailyAISummary(admin, orgId); break;
      // Fase 4 — Messenger
      case "resolve_recipient": result = await resolveRecipient(admin, orgId, body?.args ?? {}); break;
      case "get_contact_context": result = await getContactContext(admin, orgId, body?.args ?? {}); break;
      case "draft_whatsapp_message": result = await draftWhatsappMessage(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_email": result = await draftEmail(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_internal_notification": result = await draftInternalNotification(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_push": result = await draftPush(admin, orgId, userId, body?.args ?? {}); break;
      // Fase 5 — Memória + conversa ativa
      case "get_memory": result = await getMemory(admin, orgId, userId); break;
      case "remember_fact": result = await rememberFact(admin, orgId, userId, body?.args ?? {}); break;
      case "forget_fact": result = await forgetFact(admin, orgId, userId, body?.args ?? {}); break;
      case "update_preference": result = await updatePreference(admin, orgId, userId, body?.args ?? {}); break;
      case "find_active_conversation": result = await findActiveConversation(admin, orgId, body?.args ?? {}); break;
      case "draft_conversation_message": result = await draftConversationMessage(admin, orgId, userId, body?.args ?? {}); break;
      // Fase 6 — Gestão de atendimentos
      case "list_conversations": result = await listConversations(admin, orgId, body?.args ?? {}); break;
      case "get_conversation_detail": result = await getConversationDetail(admin, orgId, body?.args ?? {}); break;
      case "list_agents": result = await listAgents(admin, orgId); break;
      case "get_agent_workload": result = await getAgentWorkload(admin, orgId, body?.args ?? {}); break;
      case "draft_assign_conversation": result = await draftAssignConversation(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_transfer_sector": result = await draftTransferSector(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_close_conversation": result = await draftCloseConversation(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_takeover_from_agent": result = await draftTakeoverFromAgent(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_handback_to_agent": result = await draftHandbackToAgent(admin, orgId, userId, body?.args ?? {}); break;
      // Fase 7 — Agenda
      case "find_calendar_event": result = await findCalendarEvent(admin, orgId, body?.args ?? {}); break;
      case "draft_reschedule_booking": result = await draftRescheduleBooking(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_cancel_booking": result = await draftCancelBooking(admin, orgId, userId, body?.args ?? {}); break;

      // Fase 3 — Cobrar tarefa
      case "charge_overdue_task": result = await chargeOverdueTask(admin, orgId, userId, body?.args ?? {}); break;
      // Fase 8 — CRM Write
      case "draft_create_lead":            result = await draftCreateLead(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_update_lead_stage":      result = await draftUpdateLeadStage(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_update_lead_temperature":result = await draftUpdateLeadTemperature(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_create_note":            result = await draftCreateNote(admin, orgId, userId, body?.args ?? {}); break;
      case "draft_create_calendar_event":  result = await draftCreateCalendarEvent(admin, orgId, userId, body?.args ?? {}); break;
      case "search_business_knowledge":    result = await searchBusinessKnowledge(admin, orgId, body?.args ?? {}); break;

      case "check_action_status": {
        const aid = body?.args?.action_id;
        if (!aid) { result = { error: "missing_action_id" }; break; }
        const { data } = await admin.from("mia_actions")
          .select("id, status, action_type, error_message, executed_at, result")
          .eq("id", aid).eq("organization_id", orgId).maybeSingle();
        result = data ?? { error: "not_found" };
        break;
      }
    }

    // log best-effort
    admin.from("mia_logs").insert({
      organization_id: orgId,
      user_id: userId,
      pergunta: body?.pergunta ?? null,
      resposta: null,
      tool_utilizada: tool,
      latency_ms: Date.now() - t0,
    }).then(() => {}).catch(() => {});

    return new Response(JSON.stringify({ ok: true, tool, data: result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[mia-tools] error", e);
    return new Response(JSON.stringify({ error: "internal", message: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
