// mia-generate — engine de geração de artefatos (Fase 2).
// Tipos: proposal | recovery_campaign | scheduling_campaign | team_training
// Sempre retorna rascunho editável + action_id para aprovação via governança.
// Fonte do conhecimento: mia_business_knowledge + lead context + produto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChatContent } from "../_shared/ai-call.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = ["super_admin", "admin", "manager"];
async function gpt(admin: any, orgId: string, system: string, user: string, json = false): Promise<string> {
  const body: any = {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: 0.4,
    max_tokens: 2000,
  };
  if (json) body.response_format = { type: "json_object" };
  return await aiChatContent({
    organizationId: orgId,
    capability: "content_generation",
    keyPurpose: "mia",
    model: "gpt-4o-mini",
    supabase: admin,
    label: "mia-generate",
    edgeFunction: "mia-generate",
    body,
  });
}

// ── Geradores ─────────────────────────────────────────────────────────────────

async function generateProposal(admin: any, orgId: string, userId: string, args: any) {
  const leadId = args?.lead_id;
  if (!leadId) return { ok: false, error: "lead_id obrigatório" };

  // Busca dados do lead
  const [leadRes, knowledgeRes, orgRes] = await Promise.all([
    admin.from("leads").select("id, name, email, phone, company, temperature, current_stage_id, next_action, source")
      .eq("id", leadId).eq("organization_id", orgId).maybeSingle(),
    admin.from("mia_business_knowledge")
      .select("category, title, content")
      .eq("organization_id", orgId)
      .in("category", ["winning_pattern", "objection", "product_insight"])
      .eq("is_active", true)
      .order("occurrences", { ascending: false }).limit(6),
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
  ]);

  const lead    = leadRes.data;
  const org     = orgRes.data;
  const knowledge = (knowledgeRes.data ?? [])
    .map((k: any) => `[${k.category}] ${k.title}: ${k.content.slice(0, 120)}`).join("\n");

  if (!lead) return { ok: false, error: "lead não encontrado" };

  // Busca produto de interesse (via deals ou stage)
  const { data: deals } = await admin.from("deals")
    .select("deal_value, plan_name").eq("lead_id", leadId).limit(3);

  const { data: notes } = await admin.from("lead_notes")
    .select("content").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(3);

  const context = [
    `Lead: ${lead.name} (${lead.company ?? "autônomo"})`,
    `Temperatura: ${lead.temperature}. Etapa: pipeline. Origem: ${lead.source ?? "—"}.`,
    notes?.length ? `Notas recentes: ${notes.map((n: any) => n.content.slice(0, 100)).join(" | ")}` : "",
    deals?.length ? `Histórico: ${deals.map((d: any) => d.plan_name ?? `R$${d.deal_value}`).join(", ")}` : "",
    knowledge ? `\nConhecimento da empresa:\n${knowledge}` : "",
  ].filter(Boolean).join("\n");

  const draft = await gpt(admin, orgId,
    `Você é um especialista em vendas da empresa "${org?.name ?? "Empresa"}".
Gere uma proposta personalizada CURTA (máx 8 parágrafos) em pt-BR natural e persuasivo.
Estrutura: Saudação pessoal → identificação do problema/necessidade → solução proposta → benefícios concretos → próximo passo claro.
Use o conhecimento sobre o que funciona na empresa. Nunca invente números.`,
    context,
  );

  const preview = `Proposta personalizada para ${lead.name}`;
  const { data: action, error } = await admin.from("mia_actions").insert({
    organization_id: orgId,
    user_id:         userId,
    action_type:     "send_proposal",
    payload:         { lead_id: leadId, lead_name: lead.name, draft, recipient_email: lead.email, recipient_phone: lead.phone },
    preview,
    status:          "waiting_confirmation",
    risk_level:      "high",
    autonomy_level:  "sugerir", // proposta sempre precisa de revisão humana
    requires_approval: true,
    target_type:     "lead",
    target_id:       leadId,
  }).select("id").single();

  if (error) return { ok: false, error: error.message };

  return { ok: true, action_id: action.id, preview, draft, type: "proposal", lead_name: lead.name };
}

async function generateRecoveryCampaign(admin: any, orgId: string, userId: string, args: any) {
  // Busca propostas/deals parados há > N dias
  const minDays = args?.min_days ?? 5;
  const cutoff  = new Date(Date.now() - minDays * 86_400_000).toISOString();

  const { data: stalled } = await admin.from("deals")
    .select("id, lead_id, deal_value, updated_at")
    .eq("organization_id", orgId)
    .not("status", "in", '["won","lost","cancelled"]')
    .lt("updated_at", cutoff)
    .order("deal_value", { ascending: false })
    .limit(20);

  if (!stalled?.length) return { ok: false, error: "Nenhuma proposta parada encontrada" };

  // Busca nomes dos leads
  const leadIds = stalled.map((d: any) => d.lead_id);
  const { data: leads } = await admin.from("leads")
    .select("id, name, phone, email").in("id", leadIds);
  const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));

  const total = stalled.reduce((s: number, d: any) => s + (d.deal_value ?? 0), 0);
  const list  = stalled.slice(0, 10).map((d: any) => {
    const l = leadMap.get(d.lead_id);
    const days = Math.round((Date.now() - new Date(d.updated_at).getTime()) / 86_400_000);
    return `- ${l?.name ?? "Lead"}: R$${d.deal_value?.toFixed(0)} parado há ${days}d`;
  }).join("\n");

  const sequences = await gpt(admin, orgId,
    `Você é especialista em recuperação de vendas. Gere sequência de follow-up para CADA lead listado.
Para cada lead: mensagem WhatsApp curta (1-3 linhas), natural e não invasiva.
Formato JSON: {"sequences": [{"lead_name": "...", "message": "..."}]}`,
    `Leads com proposta parada:\n${list}\n\nValor total em risco: R$${total.toFixed(0)}`,
    true,
  );

  let parsed: any = {};
  try { parsed = JSON.parse(sequences); } catch {}

  const preview = `Campanha de recuperação: ${stalled.length} propostas · R$${(total/1000).toFixed(0)}k em risco`;
  const { data: action, error } = await admin.from("mia_actions").insert({
    organization_id: orgId,
    user_id:         userId,
    action_type:     "send_reactivation",
    payload:         { type: "recovery_campaign", sequences: parsed.sequences ?? [], total_value: total, deal_count: stalled.length },
    preview,
    status:          "waiting_confirmation",
    risk_level:      "high",
    autonomy_level:  "sugerir",
    requires_approval: true,
    target_type:     "campaign",
  }).select("id").single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: action.id, preview, sequences: parsed.sequences ?? [], total_value: total, type: "recovery_campaign" };
}

async function generateTeamTraining(admin: any, orgId: string, userId: string, _args: any) {
  // Busca métricas por vendedor
  const { data: metrics } = await admin.from("mia_business_metrics")
    .select("dimension_key, conversion_rate, avg_response_time_min, total_conversations, top_objections")
    .eq("organization_id", orgId)
    .eq("dimension", "seller")
    .eq("period", "month")
    .order("conversion_rate", { ascending: true })
    .limit(10);

  if (!metrics?.length) return { ok: false, error: "Sem métricas de vendedores ainda. Aguarde mais conversas serem processadas." };

  const ctx = metrics.map((m: any) =>
    `${m.dimension_key}: conversão ${m.conversion_rate ? `${Math.round(m.conversion_rate*100)}%` : "N/A"}, ` +
    `resposta média ${m.avg_response_time_min ? `${m.avg_response_time_min.toFixed(0)}min` : "N/A"}, ` +
    `${m.total_conversations ?? 0} conversas`
  ).join("\n");

  const plan = await gpt(admin, orgId,
    `Você é coach de vendas. Com base nos dados reais de desempenho da equipe, gere um plano de treinamento OBJETIVO e PRÁTICO em pt-BR.
Para cada vendedor com baixa performance, identifique 1-2 problemas específicos e sugira 1-2 ações concretas.
Foque em comportamento mensurável, não em teoria. Máx 500 palavras.`,
    `Métricas da equipe (último mês):\n${ctx}`,
  );

  const preview = `Plano de treinamento para equipe (${metrics.length} vendedores)`;
  const { data: action, error } = await admin.from("mia_actions").insert({
    organization_id: orgId,
    user_id:         userId,
    action_type:     "send_proposal", // reutiliza tipo existente para fins de log
    payload:         { type: "team_training", plan, seller_count: metrics.length },
    preview,
    status:          "waiting_confirmation",
    risk_level:      "low",
    autonomy_level:  "sugerir",
    requires_approval: true,
    target_type:     "seller",
  }).select("id").single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, action_id: action.id, preview, plan, type: "team_training" };
}

// ── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const admin    = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub as string;

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => ALLOWED_ROLES.includes(r.role))) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: prof } = await admin.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = (prof as any)?.organization_id;
    if (!orgId) return new Response(JSON.stringify({ error: "no_org" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: miaEnabled, error: miaAccessError } = await admin.rpc("organization_has_mia", { p_org_id: orgId });
    if (miaAccessError || miaEnabled !== true) {
      return new Response(JSON.stringify({ error: "mia_not_in_plan" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const type = String(body?.type ?? "").trim();
    const args = body?.args ?? {};

    let result: any;
    switch (type) {
      case "proposal":          result = await generateProposal(admin, orgId, userId, args); break;
      case "recovery_campaign": result = await generateRecoveryCampaign(admin, orgId, userId, args); break;
      case "team_training":     result = await generateTeamTraining(admin, orgId, userId, args); break;
      default:
        return new Response(JSON.stringify({ error: `Tipo desconhecido: ${type}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("[mia-generate]", e);
    return new Response(JSON.stringify({ error: "internal", message: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
