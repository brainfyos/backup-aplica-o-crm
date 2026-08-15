/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-mia-worker-secret" };
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);
  try {
    const { data: stored } = await admin.from("mia_runtime_secrets").select("secret").eq("name", "schedule-worker").maybeSingle();
    const supplied = req.headers.get("x-mia-worker-secret") ?? "";
    if (!stored?.secret || supplied !== stored.secret) return json({ error: "Unauthorized" }, 401);
    const { data: schedules, error } = await admin.rpc("claim_due_mia_chat_schedules", { p_limit: 8 });
    if (error) throw error;
    const results: any[] = [];
    for (const schedule of schedules ?? []) {
      const { data: run } = await admin.from("mia_chat_schedule_runs").insert({
        schedule_id: schedule.id, organization_id: schedule.organization_id, thread_id: schedule.thread_id, status: "running",
      }).select("id").single();
      try {
        const response = await fetch(`${url}/functions/v1/mia-chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${service}` },
          body: JSON.stringify({
            internal: true, user_id: schedule.created_by, organization_id: schedule.organization_id,
            thread_id: schedule.thread_id, message: schedule.prompt, input_mode: "scheduled",
          }),
          signal: AbortSignal.timeout(150_000),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? `mia-chat ${response.status}`);
        await Promise.all([
          admin.from("mia_chat_schedule_runs").update({ status: "completed", response_message_id: payload?.message_id ?? null, completed_at: new Date().toISOString() }).eq("id", run?.id),
          admin.from("mia_chat_schedules").update({ last_status: "completed", last_error: null, updated_at: new Date().toISOString() }).eq("id", schedule.id),
          admin.from("notifications").insert({ user_id: schedule.created_by, type: "info", title: `Mia concluiu: ${schedule.name}`, message: "Seu relatório agendado está disponível no chat da Mia.", metadata: { from_mia: true, mia_thread_id: payload?.thread_id, mia_schedule_id: schedule.id } }),
        ]);
        results.push({ id: schedule.id, ok: true });
      } catch (runError: any) {
        const message = String(runError?.message ?? runError).slice(0, 500);
        await Promise.all([
          admin.from("mia_chat_schedule_runs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", run?.id),
          admin.from("mia_chat_schedules").update({ last_status: "failed", last_error: message, updated_at: new Date().toISOString() }).eq("id", schedule.id),
        ]);
        results.push({ id: schedule.id, ok: false, error: message });
      }
    }
    return json({ ok: true, processed: results.length, results });
  } catch (error: any) {
    console.error("[mia-schedule-worker]", error);
    return json({ error: "internal", message: String(error?.message ?? error) }, 500);
  }
});
