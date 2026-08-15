// mia-measure-outcomes — cron que detecta resultado de ações executadas.
// Foca em update_lead_stage (caso validado na Fase 0).
// Idempotente: UNIQUE(action_id, outcome_type) impede duplicatas.
// Cron sugerido: a cada 30 minutos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_DAYS     = 7;    // dias sem mudança → sem_efeito
const LOOK_BACK_DAYS = 30;   // só olha ações dos últimos 30 dias

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const lookback = new Date(Date.now() - LOOK_BACK_DAYS * 86_400_000).toISOString();
    const staleTs  = new Date(Date.now() - STALE_DAYS   * 86_400_000).toISOString();

    // Busca ações executadas sem outcome ainda
    const { data: actions, error } = await admin
      .from("mia_actions")
      .select("id, organization_id, action_type, payload, status, executed_at, undo_payload")
      .in("action_type", ["update_lead_stage"])
      .eq("status", "executed")
      .gte("executed_at", lookback)
      .not("id", "in",
        admin.from("mia_action_outcomes").select("action_id").neq("outcome_type","nao_detectavel")
      );

    if (error) throw new Error(`Query error: ${error.message}`);
    if (!actions?.length) {
      return new Response(JSON.stringify({ ok: true, measured: 0, reason: "nothing_to_measure" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const outcomes: any[] = [];
    let measured = 0;

    for (const action of actions) {
      const payload = action.payload ?? {};
      const orgId   = action.organization_id;

      // ── update_lead_stage ─────────────────────────────────────────────
      if (action.action_type === "update_lead_stage") {
        const leadId      = payload.lead_id;
        const targetStage = payload.stage_id;
        if (!leadId || !targetStage) continue;

        // Verifica estágio atual do lead
        const { data: lead } = await admin.from("leads")
          .select("current_stage_id")
          .eq("id", leadId)
          .maybeSingle();

        if (!lead) continue;

        const executedAt = new Date(action.executed_at ?? Date.now());
        const isStale    = executedAt < new Date(staleTs);
        const currentStage = lead.current_stage_id;

        let outcomeType: string;

        // Se a ação foi revertida (status mudou para 'revertida')
        if (action.status === "revertida") {
          outcomeType = "revertida";
        }
        // Lead avançou além da etapa onde foi movido → ação teve efeito positivo
        else if (currentStage && currentStage !== targetStage) {
          // Verifica se o stage atual é "posterior" ao target via order_index
          const { data: stages } = await admin.from("pipeline_stages")
            .select("id, order_index")
            .eq("organization_id", orgId)
            .in("id", [currentStage, targetStage]);
          const stageMap = new Map((stages ?? []).map((s: any) => [s.id, s.order_index ?? 0]));
          const currentOrder = stageMap.get(currentStage) ?? 0;
          const targetOrder  = stageMap.get(targetStage)  ?? 0;
          outcomeType = currentOrder > targetOrder ? "lead_stage_advanced" : "sem_efeito";
        }
        // Lead ainda está na etapa destino + passou mais de STALE_DAYS → sem efeito visível
        else if (currentStage === targetStage && isStale) {
          outcomeType = "lead_stage_stalled";
        }
        // Muito cedo para medir
        else {
          continue;
        }

        outcomes.push({
          organization_id: orgId,
          action_id:       action.id,
          outcome_type:    outcomeType,
          measured_by:     "auto",
          notes:           `Lead ${leadId} — estágio atual: ${currentStage ?? "nenhum"}`,
        });
        measured++;
      }
    }

    // Insere outcomes (ignorando conflitos — idempotente)
    if (outcomes.length) {
      const { error: insErr } = await admin
        .from("mia_action_outcomes")
        .upsert(outcomes, { onConflict: "action_id,outcome_type", ignoreDuplicates: true });
      if (insErr) console.error("[mia-measure-outcomes] insert error", insErr);
    }

    // Alimenta mia_business_metrics com eficácia das ações (pré-agregação)
    // Por org, conta outcomes por tipo de ação neste mês
    if (outcomes.length) {
      const orgIds = [...new Set(outcomes.map((o: any) => o.organization_id))];
      for (const orgId of orgIds) {
        const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
        const { data: efficacy } = await admin
          .from("mia_action_outcomes")
          .select("outcome_type")
          .eq("organization_id", orgId)
          .gte("measured_at", thisMonth.toISOString());

        const counts: Record<string, number> = {};
        for (const e of efficacy ?? []) counts[e.outcome_type] = (counts[e.outcome_type] ?? 0) + 1;

        // Upserta linha "overall" de eficácia das ações da Mia
        await admin.from("mia_business_metrics").upsert({
          organization_id:    orgId,
          dimension:          "overall",
          dimension_key:      "mia_actions_efficacy",
          period:             "month",
          period_start:       thisMonth.toISOString().slice(0, 10),
          metrics:            counts,  // usa campo jsonb para eficácia
          computed_at:        new Date().toISOString(),
        }, { onConflict: "organization_id,dimension,dimension_key,period,period_start" })
          .then(() => {}).catch(() => {});
      }
    }

    console.log(`[mia-measure-outcomes] ${measured} outcomes registrados de ${actions.length} ações verificadas`);

    return new Response(JSON.stringify({ ok: true, measured, checked: actions.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[mia-measure-outcomes]", e);
    return new Response(JSON.stringify({ error: "internal", message: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
