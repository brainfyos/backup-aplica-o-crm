/* eslint-disable @typescript-eslint/no-explicit-any, no-empty */
// Mia Chat — central conversacional persistente da operação.
// Responde com dados reais, blocos visuais tipados e ações sempre preparadas
// para confirmação. Também aceita execuções internas vindas do agendador.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat } from "../_shared/ai-call.ts";
import { recordAIUsage } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_LOOPS = 6;
const ALLOWED_ROLES = ["super_admin", "admin", "manager"];

type ToolResult = { name: string; args: Record<string, unknown>; data: any };
type UIBlock = { type: string; [key: string]: unknown };

const SYSTEM_PROMPT = `Você é a Mia, a inteligência operacional do Vendus.

Seu papel é responder perguntas e ajudar gestores a agir sobre dados reais da operação.

COMO RESPONDER
- Português do Brasil natural, elegante e direto. Soe como uma colega sênior.
- Comece pela conclusão. Não repita a pergunta e não use introduções genéricas.
- Use títulos curtos, listas e negrito apenas quando melhorarem a leitura.
- Pergunta simples: resposta curta. Análise: cruze fontes e explique evidências.
- Nunca invente números, pessoas, conversas, receitas ou resultados.
- Quando não houver dados, diga exatamente o que está ausente.
- Termine análises relevantes com uma recomendação prática.

INTERAÇÃO E AÇÕES
- Ao listar atendimentos, prefira list_conversations para retornar IDs clicáveis.
- Se o usuário pedir para atribuir, encerrar, responder, criar lead, nota ou evento,
  use uma ferramenta draft_*. Ela apenas prepara a ação; nunca diga que executou.
- Após preparar uma ação, explique que ela aguarda confirmação no card.
- Para uma rotina recorrente ("todo dia", "toda segunda", "às 9h"), use
  draft_mia_schedule. Preserve no prompt tudo o que deverá ser repetido.
- Não crie agendamento se o usuário estiver apenas fazendo uma pergunta sobre agenda.
- Para pedidos em massa, primeiro mostre escopo, quantidade e risco. Nunca contorne aprovação.

ANÁLISE
- Operação: get_operation_summary.
- Conversas abertas/sem resposta: list_conversations e, se necessário, get_unanswered_conversations.
- Equipe: get_team_status. Funil: get_pipeline_context. Leads quentes: get_hot_leads.
- Padrões aprendidos: search_business_knowledge.
- Detalhe de uma conversa: get_conversation_messages ou get_conversation_summary.`;

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false,
});

const TOOLS = [
  { type: "function", function: { name: "get_operation_summary", description: "Indicadores atuais da operação.", parameters: objectSchema({}) } },
  { type: "function", function: { name: "get_team_status", description: "Carga e status de cada vendedor.", parameters: objectSchema({}) } },
  { type: "function", function: { name: "get_unanswered_conversations", description: "Conversas aguardando resposta humana.", parameters: objectSchema({}) } },
  { type: "function", function: { name: "get_hot_leads", description: "Leads quentes com responsável e próxima ação.", parameters: objectSchema({}) } },
  { type: "function", function: { name: "get_overdue_tasks", description: "Tarefas atrasadas.", parameters: objectSchema({}) } },
  { type: "function", function: { name: "get_today_schedule", description: "Agenda de hoje.", parameters: objectSchema({}) } },
  { type: "function", function: { name: "get_lead_context", description: "Contexto completo de um lead.", parameters: objectSchema({ lead_name: { type: "string" }, lead_id: { type: "string" } }) } },
  { type: "function", function: { name: "get_conversation_summary", description: "Resumo e diagnóstico de uma conversa.", parameters: objectSchema({ conversation_id: { type: "string" }, lead_name: { type: "string" }, lead_id: { type: "string" } }) } },
  { type: "function", function: { name: "get_conversation_messages", description: "Mensagens verificáveis de uma conversa.", parameters: objectSchema({ conversation_id: { type: "string" }, lead_name: { type: "string" }, limit: { type: "number" } }) } },
  { type: "function", function: { name: "get_seller_context", description: "KPIs e gargalos de um vendedor.", parameters: objectSchema({ seller_name: { type: "string" } }, ["seller_name"]) } },
  { type: "function", function: { name: "get_pipeline_context", description: "Etapas e gargalos do funil.", parameters: objectSchema({ product_id: { type: "string" } }) } },
  { type: "function", function: { name: "get_followup_context", description: "Cadências e follow-ups atrasados.", parameters: objectSchema({}) } },
  { type: "function", function: { name: "get_daily_ai_summary", description: "Briefing executivo do dia.", parameters: objectSchema({}) } },
  { type: "function", function: { name: "list_conversations", description: "Lista conversas abertas com IDs e filtros. Use para resultados interativos.", parameters: objectSchema({ status: { type: "string", enum: ["bot_active", "waiting_human", "human_active"] }, channel: { type: "string" }, sector_id: { type: "string" }, assigned_user_id: { type: "string" }, current_agent_id: { type: "string" }, sem_responsavel: { type: "boolean" }, aguardando_humano: { type: "boolean" }, com_agente_ia: { type: "boolean" }, sem_resposta_ha_minutos: { type: "number" }, limit: { type: "number" } }) } },
  { type: "function", function: { name: "list_agents", description: "Agentes de IA e suas cargas.", parameters: objectSchema({}) } },
  { type: "function", function: { name: "get_agent_workload", description: "Carga de um agente de IA.", parameters: objectSchema({ agent_name: { type: "string" }, agent_id: { type: "string" } }) } },
  { type: "function", function: { name: "search_business_knowledge", description: "Padrões aprendidos em atendimentos reais.", parameters: objectSchema({ query: { type: "string" }, category: { type: "string", enum: ["objection", "winning_pattern", "losing_pattern", "seller_behavior", "lead_behavior", "timing", "channel_insight", "general"] } }, ["query"]) } },

  // Ações: todas são apenas rascunhos sujeitos à governança da Mia.
  { type: "function", function: { name: "draft_assign_conversation", description: "Prepara atribuição de conversa a um vendedor.", parameters: objectSchema({ conversation_id: { type: "string" }, to_user_id: { type: "string" }, to_user_name: { type: "string" } }, ["conversation_id"]) } },
  { type: "function", function: { name: "draft_close_conversation", description: "Prepara encerramento de conversa.", parameters: objectSchema({ conversation_id: { type: "string" }, reason: { type: "string" } }, ["conversation_id"]) } },
  { type: "function", function: { name: "draft_conversation_message", description: "Prepara resposta em uma conversa ativa.", parameters: objectSchema({ conversation_id: { type: "string" }, intent: { type: "string" }, tone: { type: "string" }, body: { type: "string" } }, ["conversation_id", "intent"]) } },
  { type: "function", function: { name: "draft_create_note", description: "Prepara nota em um lead.", parameters: objectSchema({ lead_id: { type: "string" }, lead_name: { type: "string" }, content: { type: "string" } }, ["content"]) } },
  { type: "function", function: { name: "draft_create_calendar_event", description: "Prepara evento na agenda.", parameters: objectSchema({ title: { type: "string" }, start_time: { type: "string" }, end_time: { type: "string" }, description: { type: "string" }, location: { type: "string" }, lead_id: { type: "string" }, lead_name: { type: "string" }, user_id: { type: "string" } }, ["title", "start_time"]) } },
  { type: "function", function: { name: "draft_create_lead", description: "Prepara cadastro de contato/lead.", parameters: objectSchema({ name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, company: { type: "string" }, source: { type: "string" }, temperature: { type: "string", enum: ["cold", "warm", "hot"] }, notes: { type: "string" } }, ["name"]) } },
  { type: "function", function: { name: "draft_mia_schedule", description: "Prepara uma rotina recorrente da Mia e pede confirmação.", parameters: objectSchema({ name: { type: "string" }, prompt: { type: "string", description: "Instrução completa que a Mia deverá executar." }, cadence: { type: "string", enum: ["once", "daily", "weekdays", "weekly"] }, local_time: { type: "string", description: "HH:MM no horário local." }, weekdays: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } }, run_at: { type: "string", description: "ISO timestamp para execução única." }, timezone: { type: "string" } }, ["name", "prompt", "cadence"]) } },
];

function firstArray(...values: any[]): any[] {
  return values.find((value) => Array.isArray(value)) ?? [];
}

function buildBlocks(results: ToolResult[]): UIBlock[] {
  const blocks: UIBlock[] = [];
  const seen = new Set<string>();
  const add = (key: string, block: UIBlock) => {
    if (!seen.has(key)) { seen.add(key); blocks.push(block); }
  };

  for (const result of results) {
    const data = result.data ?? {};
    if (result.name === "get_operation_summary") {
      add("metrics", {
        type: "metrics",
        items: [
          { label: "Conversas abertas", value: data.conversas_abertas ?? 0, tone: "neutral" },
          { label: "Sem resposta", value: data.conversas_sem_resposta ?? 0, tone: (data.conversas_sem_resposta ?? 0) > 0 ? "warning" : "positive" },
          { label: "Leads quentes", value: data.leads_quentes ?? 0, tone: "hot" },
          { label: "Tarefas atrasadas", value: data.tarefas_atrasadas ?? 0, tone: (data.tarefas_atrasadas ?? 0) > 0 ? "danger" : "positive" },
        ],
      });
    }

    if (result.name === "get_pipeline_context" && Array.isArray(data.etapas) && data.etapas.length) {
      add("pipeline", {
        type: "chart", title: "Funil atual", chart: "bar",
        data: data.etapas.slice(0, 12).map((item: any) => ({ name: item.etapa, total: Number(item.total ?? 0), parados: Number(item.parados_7d ?? 0) })),
        series: [
          { key: "total", label: "Leads", color: "#10b981" },
          { key: "parados", label: "Parados +7 dias", color: "#f59e0b" },
        ],
      });
    }

    if (result.name === "get_team_status" && Array.isArray(data.equipe) && data.equipe.length) {
      add("team", {
        type: "table", title: "Visão da equipe",
        columns: [
          { key: "nome", label: "Vendedor" }, { key: "conversas_abertas", label: "Conversas" },
          { key: "leads", label: "Leads" }, { key: "tarefas_atrasadas", label: "Atrasadas" },
        ], rows: data.equipe.slice(0, 12),
      });
    }

    const conversations = result.name === "list_conversations"
      ? firstArray(data.conversas)
      : result.name === "get_unanswered_conversations" ? firstArray(data.conversas) : [];
    if (conversations.length) {
      add("conversations", {
        type: "conversations", title: "Conversas encontradas", total: data.total ?? conversations.length,
        items: conversations.slice(0, 20).map((item: any) => ({
          id: item.conversation_id ?? item.id ?? null,
          leadId: item.lead_id ?? null,
          name: item.nome ?? item.lead ?? "Visitante",
          channel: item.canal ?? item.channel ?? "chat",
          owner: item.responsavel ?? "Sem responsável",
          sector: item.setor ?? null,
          waitMinutes: item.sem_resposta_min ?? item.tempo_sem_resposta_min ?? null,
          status: item.status ?? (item.aguardando_humano ? "waiting_human" : null),
          preview: item.ultima_msg_texto ?? null,
        })),
      });
    }

    if (result.name === "get_hot_leads" && Array.isArray(data.leads) && data.leads.length) {
      add("hot-leads", {
        type: "table", title: "Leads quentes",
        columns: [{ key: "lead", label: "Lead" }, { key: "responsavel", label: "Responsável" }, { key: "proxima_acao", label: "Próxima ação" }],
        rows: data.leads.slice(0, 12),
      });
    }

    if (result.name === "get_overdue_tasks" && Array.isArray(data.tarefas) && data.tarefas.length) {
      add("tasks", {
        type: "table", title: "Tarefas atrasadas",
        columns: [{ key: "titulo", label: "Tarefa" }, { key: "responsavel", label: "Responsável" }, { key: "dias_atraso", label: "Dias" }],
        rows: data.tarefas.slice(0, 12),
      });
    }

    if (result.name.startsWith("draft_") && result.name !== "draft_mia_schedule" && data?.action_id) {
      add(`action:${data.action_id}`, {
        type: "action", actionId: data.action_id, title: "Ação preparada",
        description: data.preview ?? data.narration ?? "Confira os detalhes antes de confirmar.",
        risk: data.risk_level ?? "medium", status: "waiting_confirmation",
      });
    }

    if (result.name === "draft_mia_schedule" && data?.schedule?.id) {
      const schedule = data.schedule;
      add(`schedule:${schedule.id}`, {
        type: "schedule", scheduleId: schedule.id, title: schedule.name,
        prompt: schedule.prompt, cadence: schedule.cadence, localTime: schedule.local_time,
        timezone: schedule.timezone, weekdays: schedule.weekdays ?? [], status: schedule.status,
      });
    }
  }
  return blocks.slice(0, 8);
}

async function openaiChat(admin: any, orgId: string, messages: any[]) {
  const { response, config } = await aiChat({
    organizationId: orgId,
    capability: "sales_copilot",
    keyPurpose: "mia",
    model: "gpt-4o-mini",
    supabase: admin,
    label: "mia-chat",
    edgeFunction: "mia-chat",
    body: { messages, tools: TOOLS, tool_choice: "auto", temperature: 0.25, max_tokens: 1800 },
  });
  if (!response.ok) throw new Error(`Mia AI ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  recordAIUsage(admin, orgId, config, "sales_copilot", payload?.usage ?? null, "mia-chat").catch(() => {});
  return payload.choices?.[0]?.message ?? { role: "assistant", content: "" };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function titleFromMessage(message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > 58 ? `${clean.slice(0, 57)}…` : clean || "Nova conversa";
}

async function createOrLoadThread(admin: any, orgId: string, userId: string, threadId: string | null, message: string) {
  if (threadId) {
    const { data } = await admin.from("mia_chat_threads").select("id, title")
      .eq("id", threadId).eq("organization_id", orgId).eq("created_by", userId).maybeSingle();
    if (data) return data;
  }
  const { data, error } = await admin.from("mia_chat_threads").insert({
    organization_id: orgId, created_by: userId, title: titleFromMessage(message),
  }).select("id, title").single();
  if (error) return null; // compatibilidade enquanto a migration ainda não foi aplicada
  return data;
}

async function draftSchedule(admin: any, orgId: string, userId: string, threadId: string | null, args: any) {
  const cadence = ["once", "daily", "weekdays", "weekly"].includes(args?.cadence) ? args.cadence : "daily";
  const timezone = String(args?.timezone ?? "America/Sao_Paulo");
  const localTime = /^\d{2}:\d{2}/.test(String(args?.local_time ?? "")) ? String(args.local_time).slice(0, 5) : "09:00";
  const weekdays = Array.isArray(args?.weekdays)
    ? args.weekdays.map(Number).filter((n: number) => n >= 1 && n <= 7)
    : [];
  const row = {
    organization_id: orgId,
    created_by: userId,
    thread_id: threadId,
    name: String(args?.name ?? "Rotina da Mia").slice(0, 120),
    prompt: String(args?.prompt ?? "").slice(0, 6000),
    cadence,
    local_time: cadence === "once" ? null : localTime,
    weekdays,
    run_at: cadence === "once" && args?.run_at ? new Date(args.run_at).toISOString() : null,
    timezone,
    status: "pending_confirmation",
  };
  if (!row.prompt) return { ok: false, error: "missing_prompt" };
  const { data, error } = await admin.from("mia_chat_schedules").insert(row).select("*").single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, schedule: data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isInternal = Boolean(serviceKey && token === serviceKey && body?.internal === true);
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    let userId = "";
    let orgId = "";

    if (isInternal) {
      userId = String(body?.user_id ?? "");
      orgId = String(body?.organization_id ?? "");
      if (!userId || !orgId) return json({ error: "invalid_internal_context" }, 400);
    } else {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
      userId = String(claimsData.claims.sub);

      const [{ data: roles }, { data: profile }] = await Promise.all([
        admin.from("user_roles").select("role").eq("user_id", userId),
        admin.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
      ]);
      if (!(roles ?? []).some((row: any) => ALLOWED_ROLES.includes(row.role))) return json({ error: "forbidden" }, 403);
      orgId = String(profile?.organization_id ?? "");
    }

    if (!orgId) return json({ error: "no_org" }, 403);
    const { data: miaEnabled } = await admin.rpc("organization_has_mia", { p_org_id: orgId });
    if (miaEnabled !== true) return json({ error: "mia_not_in_plan" }, 403);

    const userMessage = String(body?.message ?? "").trim();
    if (!userMessage) return json({ error: "message obrigatória" }, 400);

    const requestedThreadId = body?.thread_id ? String(body.thread_id) : null;
    const thread = await createOrLoadThread(admin, orgId, userId, requestedThreadId, userMessage);
    const threadId = thread?.id ?? requestedThreadId;

    let history: any[] = [];
    if (threadId) {
      const { data: stored } = await admin.from("mia_chat_messages")
        .select("role, content").eq("thread_id", threadId)
        .in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(20);
      history = (stored ?? []).reverse().map((item: any) => ({
        role: item.role === "assistant" ? "assistant" : "user", content: item.content,
      }));
    } else if (Array.isArray(body?.history)) {
      history = body.history.slice(-12);
    }

    let userMessageId: string | null = null;
    if (threadId) {
      const { data } = await admin.from("mia_chat_messages").insert({
        thread_id: threadId, organization_id: orgId, author_id: userId, role: "user",
        content: userMessage, input_mode: body?.input_mode === "audio" ? "audio" : body?.input_mode === "scheduled" ? "scheduled" : "text",
        metadata: body?.audio_duration_ms ? { audio_duration_ms: body.audio_duration_ms } : {},
      }).select("id").single();
      userMessageId = data?.id ?? null;
    }

    const [{ data: profile }, { data: organization }, { data: memory }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      admin.from("mia_user_memory").select("display_name, facts, preferences")
        .eq("user_id", userId).eq("organization_id", orgId).maybeSingle(),
    ]);
    const displayName = memory?.display_name ?? profile?.full_name ?? "gestor";
    let context = `\n\nContexto: você conversa com ${displayName}, da empresa ${organization?.name ?? "atual"}. Horário local: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`;
    if (Array.isArray(memory?.facts) && memory.facts.length) {
      context += ` Fatos úteis: ${memory.facts.slice(0, 12).map((fact: any) => `${fact.key}=${fact.value}`).join(", ")}.`;
    }

    const messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT + context },
      ...history,
      { role: "user", content: userMessage },
    ];
    const toolsUsed: string[] = [];
    const toolResults: ToolResult[] = [];
    let responseText = "";

    for (let loop = 0; loop < MAX_LOOPS; loop++) {
      const assistantMessage = await openaiChat(admin, orgId, messages);
      messages.push(assistantMessage);
      if (!assistantMessage.tool_calls?.length) {
        responseText = String(assistantMessage.content ?? "").trim();
        break;
      }

      const outputs = await Promise.all(assistantMessage.tool_calls.map(async (call: any) => {
        const name = String(call.function?.name ?? "");
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch {}
        toolsUsed.push(name);
        let data: any;
        if (name === "draft_mia_schedule") {
          data = await draftSchedule(admin, orgId, userId, threadId, args);
        } else {
          try {
            const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/mia-tools`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: authHeader },
              body: JSON.stringify({
                tool: name,
                args,
                ...(isInternal ? { internal: true, user_id: userId, organization_id: orgId } : {}),
              }),
            });
            const payload = await response.json().catch(() => null);
            data = payload?.data ?? payload ?? { error: "tool_failed" };
          } catch (error) {
            data = { error: String(error) };
          }
        }
        toolResults.push({ name, args, data });
        return { role: "tool", tool_call_id: call.id, content: JSON.stringify(data) };
      }));
      messages.push(...outputs);
    }

    if (!responseText) responseText = "Consegui consultar os dados, mas a análise ficou ampla demais. Refine o período ou o setor para eu concluir com precisão.";
    const blocks = buildBlocks(toolResults);
    let assistantMessageId: string | null = null;
    if (threadId) {
      const { data } = await admin.from("mia_chat_messages").insert({
        thread_id: threadId, organization_id: orgId, author_id: userId, role: "assistant",
        content: responseText, blocks, tools_used: [...new Set(toolsUsed)],
        input_mode: body?.input_mode === "scheduled" ? "scheduled" : "system",
      }).select("id").single();
      assistantMessageId = data?.id ?? null;
      if (thread?.title === "Nova conversa") {
        await admin.from("mia_chat_threads").update({ title: titleFromMessage(userMessage) }).eq("id", threadId);
      }
    }

    return json({
      response: responseText,
      blocks,
      tools_used: [...new Set(toolsUsed)],
      thread_id: threadId,
      user_message_id: userMessageId,
      message_id: assistantMessageId,
    });
  } catch (error: any) {
    console.error("[mia-chat]", error);
    return json({ error: "internal", message: String(error?.message ?? error) }, 500);
  }
});
