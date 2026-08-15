// Diagnóstico do roteamento de IA da organização.
// POST { capability } → resolve o provider/modelo/endpoint atuais e faz uma chamada
// real "ping" para comprovar que a integração está funcionando ponta-a-ponta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveAIConfig, prepareAIRequestBody } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile?.organization_id) return json({ error: "user has no organization" }, 400);

    const body = await req.json().catch(() => ({}));
    const capability = (body?.capability || "agent_chat") as string;

    // 1) Resolve config
    let cfg;
    try {
      cfg = await resolveAIConfig(admin, profile.organization_id, capability);
    } catch (e: any) {
      return json({
        ok: false,
        stage: "resolve",
        error: e?.message || "resolve failed",
        code: e?.code || null,
      }, 200);
    }

    // Capacidades que não são chat completions: só reporta a resolução, sem ping real
    // (o endpoint HTTP do OpenAI para embeddings/transcrição não aceita esse payload).
    const isChatCap = !["embeddings", "audio_transcription", "voice_call"].includes(capability);
    if (!isChatCap) {
      return json({
        ok: true,
        capability,
        provider: cfg.provider,
        model: cfg.model,
        source: cfg.source,
        endpoint: cfg.endpoint,
        allow_fallback: cfg.allowFallback,
        status: 0,
        latency_ms: 0,
        sample: "(capacidade não-chat — sem ping)",
        error: null,
      });
    }

    // 2) Faz um ping real com uma pergunta minúscula.
    // `max_tokens` alto porque em reasoning models (gpt-5*) o budget inclui
    // tokens de raciocínio; `prepareAIRequestBody` aplica o piso mínimo.
    const ping = prepareAIRequestBody(
      {
        messages: [
          { role: "system", content: "Responda apenas com a palavra: pong" },
          { role: "user", content: "ping" },
        ],
        max_tokens: 512,
        temperature: 0.2,
      },
      cfg,
    );

    const start = Date.now();
    let status = 0;
    let sample = "";
    let errText = "";
    let finishReason: string | null = null;
    let reasoningTokens: number | null = null;
    try {
      const resp = await fetch(cfg.endpoint, {
        method: "POST",
        headers: cfg.headers,
        body: JSON.stringify(ping),
      });
      status = resp.status;
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        const choice = data?.choices?.[0];
        finishReason = choice?.finish_reason ?? null;
        reasoningTokens = data?.usage?.completion_tokens_details?.reasoning_tokens ?? null;
        sample = choice?.message?.content?.slice?.(0, 80) ?? "";
      } else {
        errText = (await resp.text()).slice(0, 300);
      }
    } catch (e) {
      errText = e instanceof Error ? e.message : String(e);
    }
    const ms = Date.now() - start;

    // 200 com content vazio conta como falha — normalmente reasoning consumiu
    // todo o max_completion_tokens (finish_reason=length).
    const httpOk = status >= 200 && status < 300;
    const contentEmpty = httpOk && (!sample || !sample.trim());
    const ok = httpOk && !contentEmpty;
    if (contentEmpty && !errText) {
      errText =
        finishReason === "length"
          ? `Modelo respondeu 200 mas sem texto (finish_reason=length, reasoning_tokens=${reasoningTokens ?? "?"}). Aumente max_completion_tokens ou use reasoning_effort="minimal".`
          : `Modelo respondeu 200 mas sem texto (finish_reason=${finishReason ?? "?"}).`;
    }

    return json({
      ok,
      capability,
      provider: cfg.provider,
      model: cfg.model,
      source: cfg.source,
      endpoint: cfg.endpoint,
      allow_fallback: cfg.allowFallback,
      status,
      latency_ms: ms,
      sample: sample || null,
      finish_reason: finishReason,
      reasoning_tokens: reasoningTokens,
      error: errText || null,
    });
  } catch (e) {
    console.error("[test-ai-routing] error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown error" }, 500);
  }
});
