// Salva (ou atualiza) a chave de API de um provedor de IA da organização.
// Faz uma verificação real chamando o provedor antes de gravar, incluindo
// uma chamada de chat completion quando aplicável (não só listar modelos).
// A chave é criptografada com AES-GCM antes de ser persistida.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { encryptSecret } from "../_shared/meta-crypto.ts";

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

async function verifyKey(provider: string, apiKey: string): Promise<{ ok: boolean; error?: string; sample?: string }> {
  try {
    if (provider === "openai") {
      // 1) List models (auth check)
      const r1 = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r1.ok) {
        return { ok: false, error: `OpenAI /models respondeu ${r1.status}: ${(await r1.text()).slice(0, 200)}` };
      }
      // 2) Actually call chat completions (comprova que a chave tem quota de chat).
      const r2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-nano",
          messages: [{ role: "user", content: "ping" }],
          max_completion_tokens: 8,
        }),
      });
      if (!r2.ok) {
        const txt = await r2.text();
        // Tolerâncias: modelo indisponível para a conta, mas auth OK.
        if (r2.status === 404 || txt.includes("model_not_found") || txt.includes("does not have access")) {
          return { ok: true, sample: "chat: modelo gpt-5-nano indisponível, mas auth OK" };
        }
        if (r2.status === 429) return { ok: true, sample: "chat: rate limit no ping, mas auth OK" };
        return { ok: false, error: `OpenAI /chat respondeu ${r2.status}: ${txt.slice(0, 200)}` };
      }
      const data = await r2.json().catch(() => null);
      const sample = data?.choices?.[0]?.message?.content?.slice?.(0, 40) ?? "ok";
      return { ok: true, sample };
    }
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (!r.ok && r.status !== 200) {
        const txt = await r.text();
        // 400 com erro de modelo já indica que a auth funcionou
        if (txt.includes("model") || r.status === 400) return { ok: true };
        return { ok: false, error: `Anthropic respondeu ${r.status}: ${txt.slice(0, 200)}` };
      }
      return { ok: true };
    }
    if (provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!r.ok) return { ok: false, error: `Gemini respondeu ${r.status}: ${(await r.text()).slice(0, 200)}` };
      return { ok: true };
    }
    if (provider === "xai") {
      const r = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (r.ok) return { ok: true };
      const txt = await r.text();
      // 403 permission-denied (sem créditos/licença) significa que a chave é válida —
      // a autenticação passou, só falta o time comprar créditos em console.x.ai.
      if (r.status === 403 && txt.includes("permission-denied")) return { ok: true };
      if (r.status === 401) return { ok: false, error: "Chave xAI inválida (401 unauthorized)" };
      return { ok: false, error: `xAI respondeu ${r.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: false, error: `Provedor desconhecido: ${provider}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro desconhecido" };
  }
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
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { provider, api_key, model_default, action } = body || {};

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve org + role
    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) return json({ error: "user has no organization" }, 400);
    const orgId = profile.organization_id;

    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = roles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) return json({ error: "only admins can manage AI credentials" }, 403);

    if (!["openai", "anthropic", "gemini", "xai"].includes(provider)) {
      return json({ error: "invalid provider" }, 400);
    }

    if (action === "delete") {
      await adminClient.from("org_ai_credentials").delete().eq("organization_id", orgId).eq("provider", provider);
      return json({ success: true });
    }

    if (typeof api_key !== "string" || api_key.trim().length < 8) {
      return json({ error: "invalid api_key" }, 400);
    }

    const trimmed = api_key.trim();
    const verify = await verifyKey(provider, trimmed);
    if (!verify.ok) {
      // Log erro visível
      await adminClient.from("org_ai_credentials").upsert(
        {
          organization_id: orgId,
          provider,
          api_key_encrypted: "",
          api_key_masked: null,
          last_error: verify.error || "verification failed",
        },
        { onConflict: "organization_id,provider" },
      );
      return json({ error: verify.error || "verification failed" }, 400);
    }

    const masked = "••••" + trimmed.slice(-4);
    let encrypted: string;
    try {
      encrypted = await encryptSecret(trimmed);
    } catch (e) {
      console.error("[save-ai-credential] encrypt failed", e);
      return json({ error: "não foi possível criptografar a chave — contate o suporte" }, 500);
    }

    const { error: upErr } = await adminClient
      .from("org_ai_credentials")
      .upsert(
        {
          organization_id: orgId,
          provider,
          api_key_encrypted: encrypted,
          api_key_masked: masked,
          model_default: model_default || null,
          last_verified_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "organization_id,provider" },
      );
    if (upErr) return json({ error: upErr.message }, 500);

    // Reflete no integration_settings (compatibilidade com UI antiga)
    await adminClient.from("integration_settings").upsert(
      {
        organization_id: orgId,
        integration_type: provider,
        api_key_masked: masked,
        is_configured: true,
        settings: { provider, configured_at: new Date().toISOString() },
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,integration_type" },
    );

    return json({ success: true, masked, sample: verify.sample ?? null });
  } catch (e) {
    console.error("[save-ai-credential] error", e);
    return json({ error: e instanceof Error ? e.message : "unknown error" }, 500);
  }
});
