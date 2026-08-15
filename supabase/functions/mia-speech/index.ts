/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAIConfig } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const VOICES = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, service);
    const { data: claims, error } = await client.auth.getClaims(authHeader.slice(7));
    const userId = String(claims?.claims?.sub ?? "");
    if (error || !userId) return json({ error: "Unauthorized" }, 401);
    const [{ data: profile }, { data: roles }] = await Promise.all([
      admin.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const orgId = String(profile?.organization_id ?? "");
    if (!orgId || !(roles ?? []).some((row: any) => ["super_admin", "admin", "manager"].includes(row.role))) return json({ error: "forbidden" }, 403);
    const { data: enabled } = await admin.rpc("organization_has_mia", { p_org_id: orgId });
    if (enabled !== true) return json({ error: "mia_not_in_plan" }, 403);
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? "").trim().slice(0, 6000);
    if (!text) return json({ error: "text_required" }, 400);

    const { data: memory } = await admin.from("mia_user_memory").select("preferences")
      .eq("user_id", userId).eq("organization_id", orgId).maybeSingle();
    const preferences = (memory?.preferences ?? {}) as any;
    const requestedVoice = String(preferences.mia_voice ?? "shimmer");
    const voice = VOICES.has(requestedVoice) ? requestedVoice : "shimmer";
    const personality = String(preferences.mia_personality ?? "natural");
    const instructions: Record<string, string> = {
      natural: "Fale em português do Brasil de forma humana, calorosa e natural, com ritmo conversacional.",
      executive: "Fale em português do Brasil com clareza executiva, segurança e objetividade.",
      energetic: "Fale em português do Brasil com energia, dinamismo e entusiasmo equilibrado.",
      calm: "Fale em português do Brasil com calma, acolhimento e pausas naturais.",
    };
    const config = await resolveAIConfig(admin, orgId, "sales_copilot", "gpt-4o-mini-tts", "mia");
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", input: text, voice, instructions: instructions[personality] ?? instructions.natural, response_format: "mp3" }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      console.error("[mia-speech]", response.status, await response.text());
      return json({ error: "speech_failed", message: "Não consegui gerar a voz agora." }, 502);
    }
    return new Response(await response.arrayBuffer(), { headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (error: any) {
    console.error("[mia-speech]", error);
    return json({ error: "internal", message: String(error?.message ?? error) }, 500);
  }
});
