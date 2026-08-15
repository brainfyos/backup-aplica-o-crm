// mia-learn — processa uma conversa encerrada e extrai insights para a base de conhecimento.
// Chamada via webhook ou manualmente após conversation.status = 'closed'.
// Gera embeddings vetoriais e upserta em mia_business_knowledge.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChatContent } from "../_shared/ai-call.ts";
import { resolveAIConfig } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openaiChat(admin: any, orgId: string, messages: any[], model = "gpt-4o-mini", jsonMode = false): Promise<string> {
  const body: any = { messages, temperature: 0.2, max_tokens: 2000 };
  if (jsonMode) body.response_format = { type: "json_object" };
  return await aiChatContent({
    organizationId: orgId,
    capability: "conversation_analysis",
    keyPurpose: "mia",
    model,
    supabase: admin,
    label: "mia-learn",
    edgeFunction: "mia-learn",
    body,
  });
}

async function openaiEmbed(admin: any, orgId: string, text: string): Promise<number[]> {
  const config = await resolveAIConfig(admin, orgId, "conversation_analysis", "gpt-4o-mini", "mia");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`OpenAI embed error ${res.status}`);
  const j = await res.json();
  return j.data[0].embedding as number[];
}

// ── Análise de conversa ───────────────────────────────────────────────────────

async function analyzeConversation(admin: any, orgId: string, transcript: string, convMeta: any): Promise<any> {
  const system = `Você é uma analista de vendas sênior especializada em CRM. Analise o histórico de atendimento e extraia insights acionáveis e métricas comerciais.
Retorne APENAS JSON válido com esta estrutura exata:
{
  "sentiment": "positivo|neutro|negativo",
  "outcome": "converted|lost|in_progress|unknown",
  "objections": ["string — objeções exatas levantadas pelo lead"],
  "interests": ["string — interesses e desejos demonstrados"],
  "turning_points": ["string — momentos decisivos que mudaram o rumo da conversa"],
  "seller_approach": "consultivo|pressão|informativo|ausente|misto",
  "lead_engagement": "alto|medio|baixo",
  "what_worked": ["string — o que o vendedor fez que funcionou"],
  "what_failed": ["string — o que atrapalhou ou poderia ter sido melhor"],
  "ideal_next_action": "string — próxima ação ideal para este lead (se ainda aberto)",
  "key_moments": [{"moment": "string", "type": "objection|opportunity|turn|close|rapport"}],
  "patterns": [
    {
      "category": "objection|winning_pattern|losing_pattern|seller_behavior|lead_behavior|product_insight|timing|channel_insight|general",
      "title": "string (1 linha, máx 80 chars)",
      "content": "string (descrição completa, 2-4 frases com dados específicos desta conversa)",
      "evidence": ["trecho literal da conversa que sustenta o insight"],
      "confidence": 0.0-1.0
    }
  ],
  "response_time_avg_min": number|null,
  "summary": "string (resumo em 3 frases)"
}`;

  const user = `Canal: ${convMeta.channel ?? "desconhecido"}
Lead: ${convMeta.visitor_name ?? "Anônimo"}
Duração: ${convMeta.duration_days?.toFixed(1) ?? "?"} dias
Mensagens: ${convMeta.messages_count ?? "?"}

Histórico:
${transcript}`;

  const raw = await openaiChat(admin, orgId,
    [{ role: "system", content: system }, { role: "user", content: user }],
    "gpt-4o-mini",
    true,
  );
  return JSON.parse(raw);
}

// ── Upsert de padrão no knowledge base ───────────────────────────────────────

async function upsertKnowledge(
  admin: any,
  orgId: string,
  sourceId: string,
  pattern: any,
): Promise<void> {
  // Verifica se já existe padrão semelhante (por título normalizado)
  const titleKey = pattern.title.toLowerCase().replace(/\s+/g, " ").trim();
  const { data: existing } = await admin
    .from("mia_business_knowledge")
    .select("id, occurrences, evidence")
    .eq("organization_id", orgId)
    .eq("category", pattern.category)
    .ilike("title", `%${titleKey.slice(0, 40)}%`)
    .limit(1)
    .maybeSingle();

  const embeddingText = `${pattern.title}\n${pattern.content}`;
  const embedding = await openaiEmbed(admin, orgId, embeddingText);

  if (existing) {
    // Incrementa ocorrências e adiciona nova evidência
    const evidence = [...(existing.evidence ?? []), ...(pattern.evidence ?? [])].slice(-10); // mantém últimas 10
    await admin.from("mia_business_knowledge").update({
      occurrences:  existing.occurrences + 1,
      evidence,
      last_seen_at: new Date().toISOString(),
      confidence:   Math.min(1, (pattern.confidence ?? 0.8) * 0.3 + 0.7), // aumenta com reforço
      embedding:    `[${embedding.join(",")}]`,
      updated_at:   new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await admin.from("mia_business_knowledge").insert({
      organization_id: orgId,
      source_type:     "conversation",
      source_id:       sourceId,
      category:        pattern.category ?? "general",
      title:           pattern.title,
      content:         pattern.content,
      evidence:        pattern.evidence ?? [],
      confidence:      pattern.confidence ?? 0.8,
      occurrences:     1,
      embedding:       `[${embedding.join(",")}]`,
    });
  }
}

type LearningType = "objection" | "successful_approach" | "correction" | "guardrail" | "fact_candidate";

function learningTypeForPattern(category: string): LearningType {
  if (category === "objection") return "objection";
  if (category === "winning_pattern") return "successful_approach";
  if (category === "losing_pattern") return "correction";
  if (category === "product_insight") return "fact_candidate";
  return "guardrail";
}

function normalizedFingerprint(type: LearningType, title: string): string {
  return `${type}:${title.toLowerCase().replace(/\s+/g, " ").trim()}`.slice(0, 500);
}

function candidateRisk(type: LearningType): "low" | "medium" | "high" {
  if (type === "fact_candidate") return "high";
  if (type === "correction" || type === "guardrail") return "medium";
  return "low";
}

function trainingTextForPattern(pattern: any): string {
  const title = String(pattern?.title ?? "Aprendizado observado").trim();
  const recommendation = String(pattern?.content ?? title).trim();
  return [
    "Aprendizado complementar da Mia:",
    `Situação observada: ${title}`,
    `Orientação para o agente: ${recommendation}`,
    "Use esta orientação somente quando ela for compatível com os fatos e materiais oficiais do produto.",
  ].join("\n");
}

function learningPatternsFromAnalysis(analysis: any): any[] {
  const candidates = [...(Array.isArray(analysis?.patterns) ? analysis.patterns : [])];
  const add = (items: unknown, category: string, prefix: string, confidence: number) => {
    if (!Array.isArray(items)) return;
    for (const item of items.slice(0, 4)) {
      const value = String(item ?? "").trim();
      if (!value) continue;
      candidates.push({
        category,
        title: `${prefix}: ${value}`.slice(0, 120),
        content: value,
        evidence: [],
        confidence,
      });
    }
  };

  // Garante que os campos resumidos da auditoria também virem sugestões
  // revisáveis, mesmo quando o modelo não os repetiu em `patterns`.
  add(analysis?.what_worked, "winning_pattern", "Manter", 0.68);
  add(analysis?.what_failed, "losing_pattern", "Corrigir", 0.72);
  add(analysis?.objections, "objection", "Objeção", 0.68);

  const unique = new Map<string, any>();
  for (const pattern of candidates) {
    const title = String(pattern?.title ?? "").trim();
    if (!title) continue;
    const type = learningTypeForPattern(String(pattern?.category ?? "general"));
    const fingerprint = normalizedFingerprint(type, title);
    const previous = unique.get(fingerprint);
    if (!previous || Number(pattern?.confidence ?? 0) > Number(previous?.confidence ?? 0)) {
      unique.set(fingerprint, pattern);
    }
  }
  return [...unique.values()];
}

async function upsertAgentLearningCandidate(
  admin: any,
  orgId: string,
  agentId: string,
  insightId: string,
  conversationId: string,
  pattern: any,
): Promise<void> {
  const title = String(pattern?.title ?? "").trim();
  if (!title) return;

  const type = learningTypeForPattern(String(pattern?.category ?? "general"));
  const fingerprint = normalizedFingerprint(type, title);
  const confidence = Math.max(0, Math.min(1, Number(pattern?.confidence ?? 0.7)));
  const evidenceEntry = {
    conversation_id: conversationId,
    quotes: Array.isArray(pattern?.evidence) ? pattern.evidence.slice(0, 5) : [],
    detected_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from("mia_agent_learning_candidates")
    .select("id, occurrences, confidence, evidence, source_conversation_ids")
    .eq("organization_id", orgId)
    .eq("agent_id", agentId)
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (existing) {
    const sourceIds = [...new Set([...(existing.source_conversation_ids ?? []), conversationId])].slice(-100);
    const evidence = [...(existing.evidence ?? []), evidenceEntry].slice(-20);
    const occurrences = Math.max(Number(existing.occurrences ?? 1), sourceIds.length);
    const previousConfidence = Number(existing.confidence ?? 0.7);
    const reinforcedConfidence = Math.min(1, Math.max(previousConfidence, confidence) + Math.min(0.12, occurrences * 0.01));
    const { error } = await admin.from("mia_agent_learning_candidates").update({
      source_conversation_ids: sourceIds,
      evidence,
      occurrences,
      confidence: reinforcedConfidence,
      recommendation: String(pattern?.content ?? title).trim(),
      suggested_training_text: trainingTextForPattern(pattern),
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await admin.from("mia_agent_learning_candidates").insert({
    organization_id: orgId,
    agent_id: agentId,
    source_insight_id: insightId,
    source_conversation_ids: [conversationId],
    fingerprint,
    learning_type: type,
    title,
    recommendation: String(pattern?.content ?? title).trim(),
    suggested_training_text: trainingTextForPattern(pattern),
    evidence: [evidenceEntry],
    confidence,
    occurrences: 1,
    risk_level: candidateRisk(type),
    status: "pending",
  });
  if (error) throw error;
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body?.conversation_id ?? "").trim();
    const orgId          = String(body?.organization_id ?? "").trim();

    if (!conversationId || !orgId) {
      return new Response(JSON.stringify({ error: "conversation_id e organization_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: miaEnabled, error: miaAccessError } = await admin.rpc("organization_has_mia", { p_org_id: orgId });
    if (miaAccessError || miaEnabled !== true) {
      return new Response(JSON.stringify({ error: "mia_not_in_plan" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Evita reprocessar
    const { data: alreadyProcessed } = await admin
      .from("mia_conversation_insights")
      .select("id")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (alreadyProcessed) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega conversa + mensagens
    const { data: conv } = await admin
      .from("webchat_conversations")
      .select("id, channel, visitor_name, lead_id, assigned_user_id, current_agent_id, created_at, closed_at, last_message_at")
      .eq("id", conversationId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!conv) {
      return new Response(JSON.stringify({ error: "conversa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: msgs } = await admin
      .from("webchat_messages")
      .select("direction, sender_type, content, created_at")
      .eq("conversation_id", conversationId)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .order("created_at", { ascending: true })
      .limit(120);

    if (!msgs?.length) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no_messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Monta transcript
    const transcript = msgs.map((m: any) => {
      const who = m.direction === "outbound" ? "Atendente" : (conv.visitor_name ?? "Lead");
      return `${who}: ${String(m.content ?? "").slice(0, 500)}`;
    }).join("\n");

    // Calcula métricas básicas
    const createdAt  = new Date(conv.created_at).getTime();
    const closedAt   = new Date(conv.closed_at ?? conv.last_message_at ?? Date.now()).getTime();
    const durationDays = (closedAt - createdAt) / 86400000;

    // Calcula tempo médio de resposta do atendente
    let totalResponseMs = 0; let responseCount = 0;
    for (let i = 1; i < msgs.length; i++) {
      if (msgs[i].direction === "outbound" && msgs[i - 1].direction === "inbound") {
        const diff = new Date(msgs[i].created_at).getTime() - new Date(msgs[i - 1].created_at).getTime();
        if (diff > 0 && diff < 86400000) { totalResponseMs += diff; responseCount++; }
      }
    }
    const responseTimeAvgMin = responseCount > 0 ? totalResponseMs / responseCount / 60000 : null;

    const convMeta = {
      channel:              conv.channel,
      visitor_name:         conv.visitor_name,
      messages_count:       msgs.length,
      duration_days:        durationDays,
      response_time_avg_min: responseTimeAvgMin,
    };

    // Analisa com IA
    const analysis = await analyzeConversation(admin, orgId, transcript, convMeta);

    // Salva insights da conversa (expandido)
    const { data: insightRow, error: insightError } = await admin.from("mia_conversation_insights").insert({
      organization_id:      orgId,
      conversation_id:      conversationId,
      agent_id:             conv.current_agent_id ?? null,
      sentiment:            analysis.sentiment,
      objections:           analysis.objections ?? [],
      interests:            analysis.interests ?? [],
      outcome:              analysis.outcome,
      response_time_avg_min: responseTimeAvgMin,
      messages_count:       msgs.length,
      duration_days:        durationDays,
      patterns:             analysis.patterns ?? [],
      key_moments:          analysis.key_moments ?? [],
      // Campos expandidos
      turning_points:       analysis.turning_points ?? [],
      seller_approach:      analysis.seller_approach ?? null,
      lead_engagement:      analysis.lead_engagement ?? null,
      what_worked:          analysis.what_worked ?? [],
      what_failed:          analysis.what_failed ?? [],
      ideal_next_action:    analysis.ideal_next_action ?? null,
      model_used:           "gpt-4o-mini",
    }).select("id").single();
    if (insightError) throw insightError;

    // Upserta cada padrão no knowledge base (paralelamente)
    const patterns = (analysis.patterns ?? []).filter((p: any) => p.confidence >= 0.6);
    await Promise.allSettled(
      patterns.map((p: any) => upsertKnowledge(admin, orgId, conversationId, p)),
    );

    // Aprendizados de comportamento nunca alteram o prompt automaticamente.
    // Eles ficam pendentes por agente, com evidência, até um gestor publicar.
    const learningPatterns = conv.current_agent_id
      ? learningPatternsFromAnalysis(analysis).filter((pattern: any) => Number(pattern?.confidence ?? 0.7) >= 0.6)
      : [];
    const learningResults = await Promise.allSettled(
      learningPatterns.map((pattern: any) => upsertAgentLearningCandidate(
        admin,
        orgId,
        conv.current_agent_id,
        insightRow.id,
        conversationId,
        pattern,
      )),
    );
    const candidatesCreated = learningResults.filter((result) => result.status === "fulfilled").length;

    console.log(`[mia-learn] conversação ${conversationId} processada: ${patterns.length} padrões extraídos`);

    return new Response(JSON.stringify({
      ok: true,
      conversation_id: conversationId,
      patterns_extracted: patterns.length,
      learning_candidates: candidatesCreated,
      outcome: analysis.outcome,
      sentiment: analysis.sentiment,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[mia-learn] erro:", e);
    return new Response(JSON.stringify({ error: "internal", message: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
