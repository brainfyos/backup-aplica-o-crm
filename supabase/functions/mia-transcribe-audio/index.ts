/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAIConfig } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, service);
    const token = authHeader.slice(7);
    const { data: claims, error: claimsError } = await client.auth.getClaims(token);
    const userId = String(claims?.claims?.sub ?? "");
    if (claimsError || !userId) return json({ error: "Unauthorized" }, 401);

    const [{ data: profile }, { data: roles }] = await Promise.all([
      admin.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const orgId = String(profile?.organization_id ?? "");
    if (!orgId || !(roles ?? []).some((row: any) => ["super_admin", "admin", "manager"].includes(row.role))) return json({ error: "forbidden" }, 403);
    const { data: enabled } = await admin.rpc("organization_has_mia", { p_org_id: orgId });
    if (enabled !== true) return json({ error: "mia_not_in_plan" }, 403);

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return json({ error: "audio_required" }, 400);
    if (audio.size < 200) return json({ error: "empty_audio", message: "O áudio ficou vazio." }, 400);
    if (audio.size > 25 * 1024 * 1024) return json({ error: "audio_too_large", message: "O áudio deve ter no máximo 25 MB." }, 413);

    const config = await resolveAIConfig(admin, orgId, "audio_transcription", "gpt-4o-mini-transcribe", "mia");
    if (config.provider !== "openai") return json({ error: "openai_required" }, 503);
    const upstream = new FormData();
    upstream.append("file", audio, audio.name || "mia.webm");
    upstream.append("model", config.model || "gpt-4o-mini-transcribe");
    upstream.append("language", "pt");
    upstream.append("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${config.apiKey}` }, body: upstream,
      signal: AbortSignal.timeout(90_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("[mia-transcribe-audio]", response.status, payload);
      return json({ error: "transcription_failed", message: "Não consegui transcrever este áudio." }, 502);
    }
    const text = String(payload?.text ?? "").trim();
    if (!text) return json({ error: "empty_transcription", message: "Não identifiquei fala suficiente no áudio." }, 422);
    return json({ text, model: config.model });
  } catch (error: any) {
    console.error("[mia-transcribe-audio]", error);
    return json({ error: "internal", message: String(error?.message ?? error) }, 500);
  }
});
