// mia-undo-action — reverte uma ação executada que tenha undo_payload.
// Chamado pelo botão "Desfazer" na Central de Decisões.
// Só funciona para ações com reversible=true no catálogo.
// Registra o resultado em mia_action_outcomes (tipo: 'revertida').

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const actionId = String(body?.action_id ?? "").trim();
    if (!actionId) {
      return new Response(JSON.stringify({ error: "action_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega a ação
    const { data: action, error: loadErr } = await admin
      .from("mia_actions")
      .select("*")
      .eq("id", actionId)
      .maybeSingle();

    if (loadErr || !action) {
      return new Response(JSON.stringify({ error: "action_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: miaEnabled, error: miaAccessError } = await admin.rpc("organization_has_mia", { p_org_id: action.organization_id });
    if (miaAccessError || miaEnabled !== true) {
      return new Response(JSON.stringify({ error: "mia_not_in_plan" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só pode desfazer quem é dono OU admin/manager
    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin   = (callerRoles ?? []).some((r: any) => ["admin","super_admin"].includes(r.role));
    const isManager = (callerRoles ?? []).some((r: any) => r.role === "manager");
    const isOwner   = action.user_id === userId;
    if (!isOwner && !isAdmin && !isManager) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só desfaz ações que foram executadas e têm undo_payload
    if (action.status !== "executed") {
      return new Response(JSON.stringify({ error: "only_executed_actions_can_be_undone", status: action.status }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!action.undo_payload) {
      return new Response(JSON.stringify({ error: "action_not_reversible" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const undo = action.undo_payload as Record<string, any>;
    let undoResult: any = null;
    let errMsg: string | null = null;

    // ── Executa o desfazer baseado no action_type ────────────────────────

    switch (action.action_type) {

      case "update_lead_stage": {
        const leadId    = undo.lead_id;
        const prevStage = undo.previous_stage_id;
        if (!leadId) { errMsg = "undo_payload sem lead_id"; break; }

        const { error } = await admin.from("leads")
          .update({ current_stage_id: prevStage ?? null, updated_at: new Date().toISOString() })
          .eq("id", leadId)
          .eq("organization_id", action.organization_id);

        if (error) { errMsg = error.message; break; }

        // Registra na história do lead
        if (prevStage) {
          await admin.from("lead_stage_history").insert({
            lead_id:    leadId,
            stage_id:   prevStage,
            changed_by: userId,
          }).then(() => {}).catch(() => {});
        }

        undoResult = {
          lead_id:            leadId,
          lead_name:          undo.lead_name,
          reverted_to_stage:  prevStage ?? "sem etapa",
          previous_stage_name: undo.previous_stage_name,
        };
        break;
      }

      // Adicione outros action_types reversíveis aqui conforme surgem
      // case "assign_conversation": { ... break; }
      // case "update_lead_temperature": { ... break; }

      default:
        errMsg = `Undo não implementado para "${action.action_type}"`;
    }

    if (errMsg) {
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Marca a ação como revertida
    await admin.from("mia_actions")
      .update({ status: "revertida", updated_at: new Date().toISOString() })
      .eq("id", actionId);

    // Registra o outcome (idempotente por UNIQUE constraint)
    await admin.from("mia_action_outcomes").insert({
      organization_id: action.organization_id,
      action_id:       actionId,
      outcome_type:    "revertida",
      measured_by:     userId,
      notes:           `Desfeita por ${userId}`,
    }).onConflict("action_id, outcome_type").ignoreDuplicates();

    return new Response(JSON.stringify({
      ok:     true,
      action_id: actionId,
      action_type: action.action_type,
      result: undoResult,
      message: "Ação desfeita com sucesso.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("[mia-undo-action]", e);
    return new Response(JSON.stringify({ error: "internal", message: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
