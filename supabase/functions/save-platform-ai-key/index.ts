// Salva/valida uma chave de IA do pool da plataforma (apenas super_admin).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptSecret, encryptSecret } from "../_shared/meta-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

async function verifyKey(provider: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === "lovable") {
      // Lovable Gateway: tenta listar models (header Lovable-API-Key).
      const r = await fetch("https://ai.gateway.lovable.dev/v1/models", {
        headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "platform-pool" },
      });
      if (!r.ok && r.status !== 200) {
        // se 404 nesse endpoint, tenta um POST mínimo
        const r2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
        });
        if (!r2.ok && ![200, 400].includes(r2.status)) {
          return { ok: false, error: `Lovable Gateway respondeu ${r2.status}: ${(await r2.text()).slice(0,200)}` };
        }
      }
      return { ok: true };
    }
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) return { ok: false, error: `OpenAI respondeu ${r.status}: ${(await r.text()).slice(0,200)}` };
      return { ok: true };
    }
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-3-5-haiku-20241022", max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      });
      const txt = await r.text();
      if (!r.ok && r.status !== 200) {
        if (txt.includes("model") || r.status === 400) return { ok: true };
        return { ok: false, error: `Anthropic respondeu ${r.status}: ${txt.slice(0,200)}` };
      }
      return { ok: true };
    }
    if (provider === "gemini") {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!r.ok) return { ok: false, error: `Gemini respondeu ${r.status}: ${(await r.text()).slice(0,200)}` };
      return { ok: true };
    }
    return { ok: false, error: `Provedor desconhecido: ${provider}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro desconhecido" };
  }
}

async function readStoredKey(stored: string | null | undefined): Promise<string> {
  if (!stored) return "";
  if (!stored.startsWith("v1:")) return stored;
  return await decryptSecret(stored);
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isSuper = roles?.some((r: any) => r.role === "super_admin");
    if (!isSuper) return json({ error: "only super_admin" }, 403);

    const body = await req.json().catch(() => ({}));
    const { id, action, provider, purpose, label, api_key, model_default, priority, weight, is_active } = body || {};

    if (action === "delete") {
      if (!id) return json({ error: "id required" }, 400);
      await admin.from("platform_ai_keys").delete().eq("id", id);
      return json({ success: true });
    }

    if (action === "toggle") {
      if (!id) return json({ error: "id required" }, 400);
      await admin.from("platform_ai_keys").update({ is_active: !!is_active }).eq("id", id);
      return json({ success: true });
    }

    if (action === "test") {
      if (!id) return json({ error: "id required" }, 400);
      const { data: row } = await admin.from("platform_ai_keys").select("provider, api_key_encrypted").eq("id", id).maybeSingle();
      if (!row) return json({ error: "not found" }, 404);
      const rawKey = await readStoredKey(row.api_key_encrypted);
      const v = await verifyKey(row.provider, rawKey);
      await admin.from("platform_ai_keys").update({
        last_verified_at: new Date().toISOString(),
        last_error: v.ok ? null : v.error ?? "verification failed",
        ...(v.ok && !String(row.api_key_encrypted).startsWith("v1:")
          ? { api_key_encrypted: await encryptSecret(rawKey) }
          : {}),
      }).eq("id", id);
      return json(v);
    }

    // create or update
    if (!["openai", "anthropic", "gemini", "lovable"].includes(provider)) {
      return json({ error: "invalid provider" }, 400);
    }
    const normalizedPurpose = purpose === "mia" ? "mia" : "platform";
    if (normalizedPurpose === "mia" && provider !== "openai") {
      return json({ error: "mia_requires_openai" }, 400);
    }

    // Edição sem nova chave
    if (id && (!api_key || api_key.trim().length < 8)) {
      const patch: any = {};
      if (label !== undefined) patch.label = label;
      if (model_default !== undefined) patch.model_default = model_default || null;
      if (priority !== undefined) patch.priority = priority;
      if (weight !== undefined) patch.weight = weight;
      if (is_active !== undefined) patch.is_active = !!is_active;
      if (purpose !== undefined) patch.purpose = normalizedPurpose;
      const { error } = await admin.from("platform_ai_keys").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    if (typeof api_key !== "string" || api_key.trim().length < 8) {
      return json({ error: "invalid api_key" }, 400);
    }
    const trimmed = api_key.trim();
    const v = await verifyKey(provider, trimmed);
    if (!v.ok) return json({ error: v.error || "verification failed" }, 400);
    const encrypted = await encryptSecret(trimmed);

    const masked = "••••" + trimmed.slice(-4);
    const payload: any = {
      provider,
      purpose: normalizedPurpose,
      label: label || `${provider} key`,
      api_key_encrypted: encrypted,
      api_key_masked: masked,
      model_default: model_default || null,
      priority: priority ?? 100,
      weight: weight ?? 1,
      is_active: is_active ?? true,
      last_verified_at: new Date().toISOString(),
      last_error: null,
      created_by: userId,
    };

    if (id) {
      const { error } = await admin.from("platform_ai_keys").update(payload).eq("id", id);
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await admin.from("platform_ai_keys").insert(payload);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ success: true, masked });
  } catch (e) {
    console.error("[save-platform-ai-key]", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
