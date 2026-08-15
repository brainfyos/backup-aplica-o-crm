// Cancela um enrollment manualmente.
// POST { enrollment_id, reason? } OU { cadence_id, lead_id, reason? }

import { createServiceClient } from "../_shared/campaign-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { enrollment_id, cadence_id, lead_id, reason } = await req.json();
    const supabase = createServiceClient();

    let q = supabase.from("cadence_enrollments").select("id").eq("status", "active");
    if (enrollment_id) q = q.eq("id", enrollment_id);
    else if (cadence_id && lead_id) q = q.eq("cadence_id", cadence_id).eq("lead_id", lead_id);
    else {
      return new Response(JSON.stringify({ error: "Missing enrollment_id or (cadence_id+lead_id)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: enrs } = await q;
    const ids = (enrs ?? []).map((e: any) => e.id);
    if (!ids.length) {
      return new Response(JSON.stringify({ ok: true, stopped: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("cadence_step_runs")
      .update({ status: "skipped", skip_reason: "manual_stop", executed_at: new Date().toISOString() })
      .in("enrollment_id", ids)
      .eq("status", "scheduled");

    await supabase
      .from("cadence_enrollments")
      .update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: reason ?? "manual" })
      .in("id", ids);

    return new Response(JSON.stringify({ ok: true, stopped: ids.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cadence-stop]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
