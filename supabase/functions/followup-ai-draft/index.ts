// followup-ai-draft: gera um rascunho estratégico de mensagem de follow-up
// baseado no histórico real da conversa. NÃO envia nada — só devolve o draft
// para o vendedor revisar e enviar pelo próprio composer (webchat-inbox/send).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAIConfig, prepareAIRequestBody, recordAIUsage, logAIConfig } from "../_shared/ai-router.ts";
import { buildTemporalPromptBlock } from "../_shared/temporalContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type StrategyKey =
  | "reengage_silence"
  | "break_objection"
  | "force_next_step"
  | "revive_interest"
  | "answer_pending_question"
  | "propose_meeting";

const STRATEGY_LABEL: Record<StrategyKey, string> = {
  reengage_silence: "Retomar após silêncio",
  break_objection: "Quebrar objeção",
  force_next_step: "Forçar próximo passo",
  revive_interest: "Reaquecer interesse",
  answer_pending_question: "Responder dúvida pendente",
  propose_meeting: "Propor reunião",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes } = await supabase.auth.getUser(token);
    const user = userRes?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, full_name")
      .eq("id", user.id)
      .single();
    const orgId = profile?.organization_id;
    if (!orgId) return json({ error: "No organization" }, 400);

    const body = await req.json().catch(() => ({}));
    const conversationId = body.conversation_id as string | undefined;
    const seed = body.force_regenerate ? Math.random().toString(36).slice(2, 8) : null;
    if (!conversationId) return json({ error: "conversation_id required" }, 400);

    // Conversa + lead
    const { data: conv } = await supabase
      .from("webchat_conversations")
      .select(
        "id, organization_id, lead_id, assigned_user_id, channel, visitor_name, visitor_phone, status",
      )
      .eq("id", conversationId)
      .eq("organization_id", orgId)
      .single();
    if (!conv) return json({ error: "Conversation not found" }, 404);

    // Histórico (últimas 30 mensagens não deletadas)
    const { data: msgsRaw } = await supabase
      .from("webchat_messages")
      .select("content, sender_type, content_type, created_at, metadata")
      .eq("conversation_id", conversationId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(30);
    const messages = (msgsRaw || []).reverse();

    // Lead (best-effort)
    let lead: any = null;
    if (conv.lead_id) {
      const { data } = await supabase
        .from("leads")
        .select("id, name, email, phone, deal_value, current_stage_id, product_id, score")
        .eq("id", conv.lead_id)
        .maybeSingle();
      lead = data;
    }

    // Estágio + notas
    let stageName: string | null = null;
    if (lead?.current_stage_id) {
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("name")
        .eq("id", lead.current_stage_id)
        .maybeSingle();
      stageName = stage?.name ?? null;
    }
    let notes: string[] = [];
    if (lead?.id) {
      const { data: n } = await supabase
        .from("lead_notes")
        .select("content")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(3);
      notes = (n || []).map((r: any) => String(r.content || "").slice(0, 200));
    }

    // Produto (pitch + diferenciais), best-effort
    let productCtx = "";
    if (lead?.product_id) {
      const { data: prod } = await supabase
        .from("products")
        .select("name, pitch_15s, differentials")
        .eq("id", lead.product_id)
        .maybeSingle();
      if (prod) {
        productCtx = `Produto: ${prod.name}. Pitch: ${prod.pitch_15s || "-"}. Diferenciais: ${
          Array.isArray(prod.differentials) ? prod.differentials.slice(0, 5).join("; ") : "-"
        }.`;
      }
    }

    const sellerName = profile?.full_name || "o vendedor";
    const transcript = messages
      .map((m: any) => {
        const who = m.sender_type === "visitor"
          ? `[LEAD] ${conv.visitor_name || lead?.name || "Cliente"}`
          : m.sender_type === "agent"
          ? "[VENDEDOR]"
          : "[BOT]";
        const ct = m.content_type && m.content_type !== "text" ? `(${m.content_type}) ` : "";
        return `${who}: ${ct}${(m.content || "").slice(0, 400)}`;
      })
      .join("\n");

    const lastSellerSamples = messages
      .filter((m: any) => m.sender_type === "agent")
      .slice(-4)
      .map((m: any) => m.content)
      .filter(Boolean);

    const systemPrompt = `Você é um copywriter de vendas consultivas (SPIN). Vai escrever UMA mensagem de WhatsApp, FINGINDO ser o próprio vendedor ${sellerName}, para reengajar um lead. JAMAIS revele que é IA. JAMAIS use clichês ("tudo bem?", "passando para saber", "como posso ajudar"). JAMAIS assine no final (sistema cuida disso). Máx 500 caracteres. Tom direto, humano, profissional, espelha o vocabulário do vendedor. Permitido no máx 1 emoji (opcional). Em português BR.${buildTemporalPromptBlock()}

ESTRATÉGIAS POSSÍVEIS (escolha a melhor pro contexto):
- reengage_silence: lead sumiu há tempo, retomar sem cobrar.
- break_objection: lead levantou objeção (preço/tempo/dúvida) e ficou parado — endereçar.
- force_next_step: lead engajou, falta CTA pra avançar (proposta, reunião, link).
- revive_interest: lead esfriou — trazer prova/benefício novo.
- answer_pending_question: o lead fez pergunta sem resposta — responda e devolva CTA.
- propose_meeting: contexto pede agendamento → sugerir reunião curta (sem oferecer horários específicos no texto).

RESPONDA APENAS JSON VÁLIDO no formato:
{"summary":"resumo em 2-3 frases do estado real da conversa", "strategy":"<key>", "draft_message":"texto pronto pra enviar", "warnings":["..."]}`;

    const userPrompt = `CONTEXTO DO LEAD
Nome: ${conv.visitor_name || lead?.name || "Cliente"}
Telefone: ${conv.visitor_phone || lead?.phone || "-"}
Estágio: ${stageName || "-"}
Valor da oportunidade: ${lead?.deal_value ?? "-"}
Score: ${lead?.score ?? "-"}
${productCtx}
${notes.length ? `Notas recentes: ${notes.join(" | ")}` : ""}

ÚLTIMAS MENSAGENS DO VENDEDOR (para espelhar tom):
${lastSellerSamples.join("\n---\n") || "(sem amostras)"}

HISTÓRICO DA CONVERSA (mais antiga → mais recente):
${transcript || "(sem mensagens)"}

${seed ? `Gere uma variação diferente (seed: ${seed}).` : ""}
Devolva o JSON pedido. Nada além do JSON.`;

    const cfg = await resolveAIConfig(supabase, orgId, "agent_chat", "google/gemini-3-flash-preview");
    logAIConfig("followup-ai-draft", cfg);

    const payload = {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: seed ? 0.9 : 0.7,
      response_format: { type: "json_object" },
    };

    const resp = await fetch(cfg.endpoint, {
      method: "POST",
      headers: cfg.headers,
      body: JSON.stringify(prepareAIRequestBody(payload, cfg)),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[followup-ai-draft] AI error", resp.status, errText);
      if (resp.status === 429) return json({ error: "Limite de requisições. Tente em alguns segundos." }, 429);
      if (resp.status === 402) return json({ error: "Créditos de IA esgotados." }, 402);
      return json({ error: "AI gateway error" }, 502);
    }

    const aiJson = await resp.json();
    const raw = aiJson?.choices?.[0]?.message?.content || "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* ignore */ }
      }
    }

    const strategyKey = (parsed.strategy as StrategyKey) in STRATEGY_LABEL
      ? (parsed.strategy as StrategyKey)
      : "reengage_silence";

    const draft = String(parsed.draft_message || "").trim().slice(0, 800);
    const summary = String(parsed.summary || "").trim().slice(0, 400);

    // Telemetria de tokens
    recordAIUsage(supabase, orgId, cfg, "agent_chat", aiJson?.usage || null, "followup-ai-draft")
      .catch(() => {});

    return json({
      success: true,
      summary,
      strategy: strategyKey,
      strategy_label: STRATEGY_LABEL[strategyKey],
      draft_message: draft,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      model: cfg.model,
    });
  } catch (e) {
    console.error("[followup-ai-draft] error", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
