// Ping real de IA em escopo plataforma (super_admin), sem depender de organização.
// Tenta as chaves ativas do pool `platform_ai_keys` e, por fim, o LOVABLE_API_KEY do runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptSecret } from "../_shared/meta-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function humanize(provider: string, status: number, raw: string): string {
  if (status === 401 || status === 403) {
    return provider === "lovable"
      ? "Chave do gateway Lovable inválida ou sem permissão. Ative a IA na sua workspace Lovable."
      : "Chave inválida ou sem permissão neste provedor.";
  }
  if (status === 402) {
    return provider === "lovable"
      ? "Créditos esgotados na sua workspace Lovable. Adicione créditos em Configurações → Plans & credits."
      : "Créditos/saldo esgotados na conta deste provedor.";
  }
  if (status === 429) return "Limite de requisições atingido. Tente novamente em alguns instantes.";
  if (status >= 500) return "O provedor de IA está instável no momento. Tente novamente.";
  return raw.slice(0, 240) || `Falha com status ${status}.`;
}

async function pingProvider(
  provider: string,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; status: number; latency_ms: number; sample: string | null; error: string | null }> {
  const started = Date.now();
  try {
    let url = "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: unknown;

    if (provider === "lovable") {
      url = "https://ai.gateway.lovable.dev/v1/chat/completions";
      headers["Lovable-API-Key"] = apiKey;
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = { model, messages: [{ role: "user", content: "ping" }] };
    } else if (provider === "openai") {
      url = "https://api.openai.com/v1/chat/completions";
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = { model, messages: [{ role: "user", content: "ping" }] };
    } else if (provider === "anthropic") {
      url = "https://api.anthropic.com/v1/messages";
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      body = { model, max_tokens: 8, messages: [{ role: "user", content: "ping" }] };
    } else if (provider === "gemini") {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      body = { contents: [{ parts: [{ text: "ping" }] }] };
    } else {
      return { ok: false, status: 0, latency_ms: 0, sample: null, error: `Provedor não suportado: ${provider}` };
    }

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    const latency = Date.now() - started;

    if (!res.ok) {
      return { ok: false, status: res.status, latency_ms: latency, sample: null, error: humanize(provider, res.status, text) };
    }

    let sample: string | null = null;
    try {
      const data = JSON.parse(text);
      sample =
        data?.choices?.[0]?.message?.content ??
        data?.content?.[0]?.text ??
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        null;
    } catch { /* resposta não-JSON */ }

    return { ok: true, status: res.status, latency_ms: latency, sample, error: null };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      latency_ms: Date.now() - started,
      sample: null,
      error: (e as Error).message,
    };
  }
}

const DEFAULT_MODEL: Record<string, string> = {
  lovable: "google/gemini-3-flash-preview",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-20241022",
  gemini: "gemini-2.0-flash",
};

async function readStoredKey(stored: string | null | undefined): Promise<string> {
  if (!stored) return "";
  return stored.startsWith("v1:") ? await decryptSecret(stored) : stored;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: "not authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roles) return json({ ok: false, error: "apenas super admin" }, 403);

    const body = await req.json().catch(() => ({}));
    const requested = (body?.provider || "").toString().trim();

    // 1) Chaves do pool da plataforma
    let query = admin
      .from("platform_ai_keys")
      .select("id, provider, label, model_default, api_key_encrypted")
      .eq("is_active", true)
      .eq("purpose", "platform")
      .order("priority", { ascending: true });
    if (requested && requested !== "lovable") query = query.eq("provider", requested);

    const { data: keys } = await query;

    for (const row of keys ?? []) {
      if (requested && row.provider !== requested) continue;
      let apiKey = "";
      try {
        apiKey = await readStoredKey(row.api_key_encrypted as string);
      } catch {
        continue;
      }
      if (!apiKey) continue;
      const model = row.model_default || DEFAULT_MODEL[row.provider] || "";
      const result = await pingProvider(row.provider, apiKey, model);
      if (result.ok) {
        await markValidated(admin, row.provider);
        return json({ ...result, provider: row.provider, model, source: "platform_pool", label: row.label });
      }
      // guarda o erro do primeiro provider pedido explicitamente
      if (requested) {
        return json({ ...result, provider: row.provider, model, source: "platform_pool", label: row.label });
      }
    }

    // 2) Gateway Lovable com a chave do runtime
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    if (!lovableKey) {
      return json({
        ok: false,
        provider: "lovable",
        source: "runtime",
        status: 0,
        latency_ms: 0,
        sample: null,
        error: "Nenhuma chave de IA disponível. Cadastre uma chave própria ou ative a IA da Lovable na sua workspace.",
      });
    }

    const model = DEFAULT_MODEL.lovable;
    const result = await pingProvider("lovable", lovableKey, model);
    if (result.ok) await markValidated(admin, "lovable");
    return json({ ...result, provider: "lovable", model, source: "runtime" });
  } catch (err) {
    console.error("[platform-ai-test] error:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});

async function markValidated(admin: ReturnType<typeof createClient>, provider: string) {
  const { data: settings } = await admin.from("platform_settings").select("id").maybeSingle();
  const payload = { ai_validated_at: new Date().toISOString(), ai_validated_provider: provider };
  if (settings?.id) {
    await admin.from("platform_settings").update(payload).eq("id", settings.id);
  } else {
    await admin.from("platform_settings").insert(payload);
  }
}
