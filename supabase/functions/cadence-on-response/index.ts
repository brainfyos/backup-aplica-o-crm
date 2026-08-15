// Chamado pelo evolution-webhook quando lead responde uma mensagem.
// Marca o último step_run como respondido e, se stop_rules.stop_on_response, encerra a enrollment.
// POST { lead_id, organization_id?, conversation_id? }

import { createServiceClient } from "../_shared/campaign-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function applyStopActions(supabase: any, cadence: any, lead_id: string, organization_id: string) {
  const actions = cadence.stop_actions ?? {};
  // Tags
  if (Array.isArray(actions.tags_add) && actions.tags_add.length) {
    const rows = actions.tags_add.map((tag_id: string) => ({ lead_id, tag_id, source: "cadence_response" }));
    await supabase.from("lead_tag_assignments").upsert(rows, { onConflict: "lead_id,tag_id", ignoreDuplicates: true });
  }
  if (Array.isArray(actions.tags_remove) && actions.tags_remove.length) {
    await supabase.from("lead_tag_assignments").delete().eq("lead_id", lead_id).in("tag_id", actions.tags_remove);
  }
  // Etapa do pipeline
  const leadUpdate: Record<string, any> = {};
  if (actions.stage_id) leadUpdate.stage_id = actions.stage_id;
  if (actions.temperature) leadUpdate.temperature = actions.temperature;
  if (Object.keys(leadUpdate).length) {
    await supabase.from("leads").update(leadUpdate).eq("id", lead_id);
  }
  // Nota
  if (actions.note && typeof actions.note === "string" && actions.note.trim()) {
    await supabase.from("lead_notes").insert({
      lead_id,
      content: `[Cadência: ${cadence.name ?? "—"}] ${actions.note.trim()}`,
      organization_id,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { lead_id: leadIdIn, organization_id, conversation_id } = await req.json();
    const supabase = createServiceClient();
    let lead_id = leadIdIn as string | undefined;
    if (!lead_id && conversation_id) {
      const { data: conv } = await supabase
        .from("webchat_conversations")
        .select("lead_id")
        .eq("id", conversation_id)
        .maybeSingle();
      lead_id = (conv as any)?.lead_id ?? undefined;
    }
    if (!lead_id) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_lead" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pega enrollments ativos do lead
    const { data: enrollments } = await supabase
      .from("cadence_enrollments")
      .select("id, cadence_id, lead_id, organization_id")
      .eq("lead_id", lead_id)
      .eq("status", "active");

    if (!enrollments?.length) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_active_enrollment" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cadenceIds = Array.from(new Set(enrollments.map((e: any) => e.cadence_id)));
    const { data: cadences } = await supabase
      .from("cadences")
      .select("id, name, stop_rules, stop_actions")
      .in("id", cadenceIds);
    const cMap = new Map((cadences ?? []).map((c: any) => [c.id, c]));

    let stoppedCount = 0;
    for (const enr of enrollments) {
      // Marca o último run "sent" como "responded"
      const { data: lastRun } = await supabase
        .from("cadence_step_runs")
        .select("id")
        .eq("enrollment_id", enr.id)
        .eq("status", "sent")
        .order("executed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastRun) {
        await supabase.from("cadence_step_runs").update({ status: "responded" }).eq("id", lastRun.id);
      }

      const cadence = cMap.get(enr.cadence_id);
      const rules = cadence?.stop_rules ?? {};
      if (rules.stop_on_response !== false) {
        // Cancela runs futuros agendados
        await supabase
          .from("cadence_step_runs")
          .update({ status: "skipped", skip_reason: "lead_responded", executed_at: new Date().toISOString() })
          .eq("enrollment_id", enr.id)
          .eq("status", "scheduled");
        await supabase
          .from("cadence_enrollments")
          .update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: "responded" })
          .eq("id", enr.id);
        if (cadence) await applyStopActions(supabase, cadence, lead_id, enr.organization_id);
        stoppedCount++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, stopped: stoppedCount, total: enrollments.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cadence-on-response]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
