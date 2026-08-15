// Inscreve leads em uma cadência.
// POST { cadence_id, lead_ids?: string[], source?: string, source_ref?: any, organization_id? }
// - Se lead_ids vier, usa eles direto.
// - Senão, resolve via entry_filters da cadência.
// - Aplica exclusion_filters.
// - Cria enrollment + agenda 1º step_run.

import { createServiceClient, resolveAudience } from "../_shared/campaign-audience.ts";
import { computeScheduledAt, FIXED_TIME_TOLERANCE_MS } from "../_shared/cadence-schedule.ts";
import { closeFollowupsForCadence } from "../_shared/followup-scheduler.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** A cadência salva exclusões/entradas com chaves próprias (`tags`); o resolvedor lê `tag_ids`. */
function normalizeFilters(raw: any): Record<string, any> {
  const f = { ...(raw ?? {}) } as Record<string, any>;
  if (Array.isArray(f.tags) && f.tags.length && !f.tag_ids?.length) f.tag_ids = f.tags;
  delete f.tags;
  return f;
}

/** Existe pelo menos um filtro realmente preenchido? (`{"tags": []}` não conta) */
function hasMeaningfulFilters(f: Record<string, any>): boolean {
  return Object.values(f ?? {}).some((v) => {
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  });
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { cadence_id, lead_ids, source, source_ref } = body;
    if (!cadence_id) {
      return new Response(JSON.stringify({ error: "Missing cadence_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createServiceClient();

    const { data: cadence } = await supabase
      .from("cadences")
      .select("id, organization_id, status, entry_filters, exclusion_filters, execution_window")
      .eq("id", cadence_id)
      .maybeSingle();
    if (!cadence) {
      return new Response(JSON.stringify({ error: "Cadence not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (cadence.status !== "active") {
      return new Response(JSON.stringify({ error: "Cadence not active", status: cadence.status }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve leads
    const entryFilters = normalizeFilters(cadence.entry_filters);
    const exclusionFilters = normalizeFilters(cadence.exclusion_filters);

    let targetLeads: string[] = [];
    if (Array.isArray(lead_ids) && lead_ids.length) {
      targetLeads = lead_ids;
      // Aplica exclusões (somente filtros realmente preenchidos).
      // IMPORTANTE: nunca passar targetLeads como público aqui — o resolvedor
      // devolveria a própria lista e removeria todo mundo.
      if (hasMeaningfulFilters(exclusionFilters)) {
        const { leadIds: toRemove } = await resolveAudience(
          supabase,
          cadence.organization_id,
          exclusionFilters,
          {},
        );
        const rm = new Set(toRemove);
        targetLeads = targetLeads.filter((id) => !rm.has(id));
      }
    } else {
      const { leadIds } = await resolveAudience(
        supabase,
        cadence.organization_id,
        entryFilters,
        exclusionFilters,
      );
      targetLeads = leadIds;
    }

    if (!targetLeads.length) {
      return new Response(JSON.stringify({ enrolled: 0, skipped: 0, reason: "no_targets_after_filters" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    }

    // Opt-out é global: não cria novas inscrições para quem pediu bloqueio.
    const { data: optedOutRows } = await supabase
      .from("leads")
      .select("id")
      .eq("organization_id", cadence.organization_id)
      .eq("whatsapp_opt_in", false)
      .in("id", targetLeads);
    const optedOut = new Set((optedOutRows ?? []).map((row: any) => row.id));
    targetLeads = targetLeads.filter((id) => !optedOut.has(id));
    if (!targetLeads.length) {
      return new Response(JSON.stringify({ enrolled: 0, skipped: optedOut.size, reason: "whatsapp_opt_out" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar etapas (a 1ª válida: etapas de horário fixo já vencidas são puladas)
    const { data: allSteps } = await supabase
      .from("cadence_steps")
      .select("*")
      .eq("cadence_id", cadence_id)
      .order("order_index", { ascending: true });
    const steps = allSteps ?? [];
    if (!steps.length) {
      return new Response(JSON.stringify({ error: "Cadence has no steps" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let firstIndex = -1;
    let scheduledAt: Date | null = null;
    for (let i = 0; i < steps.length; i++) {
      const at = computeScheduledAt(steps[i], now, { window: cadence.execution_window }).at;
      if (steps[i].schedule_mode === "fixed_time" && now.getTime() > at.getTime() + FIXED_TIME_TOLERANCE_MS) {
        continue; // horário já passou hoje — não envia atrasado
      }
      firstIndex = i;
      scheduledAt = at;
      break;
    }
    if (firstIndex < 0 || !scheduledAt) {
      return new Response(JSON.stringify({ enrolled: 0, skipped: 0, reason: "all_fixed_times_passed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const firstStep = steps[firstIndex];

    // Filtra leads já com enrollment ativo
    const { data: existing } = await supabase
      .from("cadence_enrollments")
      .select("lead_id")
      .eq("cadence_id", cadence_id)
      .eq("status", "active")
      .in("lead_id", targetLeads);
    const already = new Set((existing ?? []).map((r: any) => r.lead_id));
    const fresh = targetLeads.filter((id) => !already.has(id));

    let enrolled = 0;


    for (const lead_id of fresh) {
      const { data: enrollment, error: enrErr } = await supabase
        .from("cadence_enrollments")
        .insert({
          cadence_id,
          lead_id,
          organization_id: cadence.organization_id,
          status: "active",
          current_step_id: firstStep.id,
          current_step_index: firstIndex,
          source: source ?? "manual",
          source_ref: source_ref ?? null,
        })
        .select("id")
        .single();
      if (enrErr || !enrollment) continue;

      await supabase.from("cadence_step_runs").insert({
        enrollment_id: enrollment.id,
        step_id: firstStep.id,
        organization_id: cadence.organization_id,
        scheduled_at: scheduledAt.toISOString(),
        status: "scheduled",
      });
      // Cadência ativa bloqueia réguas paralelas de follow-up do agente.
      await closeFollowupsForCadence(supabase, lead_id);
      enrolled++;

    }

    return new Response(
      JSON.stringify({ enrolled, skipped_existing: already.size, skipped_opted_out: optedOut.size, total: targetLeads.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cadence-enroll]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
