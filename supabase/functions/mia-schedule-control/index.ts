/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims, error } = await client.auth.getClaims(auth.slice(7));
    const userId = String(claims?.claims?.sub ?? "");
    if (error || !userId) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const scheduleId = String(body?.schedule_id ?? "");
    const operation = String(body?.operation ?? "");
    if (!scheduleId || !["confirm", "pause", "resume", "cancel", "run_now"].includes(operation)) return json({ error: "invalid_request" }, 400);

    const [{ data: schedule }, { data: roles }] = await Promise.all([
      admin.from("mia_chat_schedules").select("*").eq("id", scheduleId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (!schedule) return json({ error: "schedule_not_found" }, 404);
    const privileged = (roles ?? []).some((row: any) => ["super_admin", "admin", "manager"].includes(row.role));
    if (schedule.created_by !== userId && !privileged) return json({ error: "forbidden" }, 403);
    const { data: enabled } = await admin.rpc("organization_has_mia", { p_org_id: schedule.organization_id });
    if (enabled !== true) return json({ error: "mia_not_in_plan" }, 403);

    let status = schedule.status;
    let nextRun = schedule.next_run_at;
    if (["confirm", "resume"].includes(operation)) {
      const { data, error: nextError } = await admin.rpc("next_mia_chat_schedule_run", {
        p_cadence: schedule.cadence, p_local_time: schedule.local_time, p_timezone: schedule.timezone,
        p_weekdays: schedule.weekdays, p_run_at: schedule.run_at, p_from: new Date().toISOString(),
      });
      if (nextError || !data) return json({ error: "invalid_schedule", message: "O horário escolhido já passou ou não é válido." }, 400);
      status = "active"; nextRun = data;
    } else if (operation === "pause") {
      status = "paused"; nextRun = null;
    } else if (operation === "cancel") {
      status = "cancelled"; nextRun = null;
    } else if (operation === "run_now") {
      status = "active"; nextRun = new Date().toISOString();
    }
    const { error: updateError } = await admin.from("mia_chat_schedules").update({ status, next_run_at: nextRun, updated_at: new Date().toISOString() }).eq("id", scheduleId);
    if (updateError) return json({ error: "update_failed", message: updateError.message }, 500);

    // Descoberta dinâmica do endpoint: funciona no projeto oficial e em cada Remix.
    await admin.from("mia_runtime_endpoints").upsert({ name: "mia-schedule-worker", url: `${url}/functions/v1/mia-schedule-worker`, updated_at: new Date().toISOString() });
    return json({ ok: true, status, next_run_at: nextRun });
  } catch (error: any) {
    console.error("[mia-schedule-control]", error);
    return json({ error: "internal", message: String(error?.message ?? error) }, 500);
  }
});
