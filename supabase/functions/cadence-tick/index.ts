// Cron a cada 5min. Executa cadence_step_runs vencidos.
// Para cada run: valida janela, condições, gera mensagem via manual-outreach
// (que monta prompt com contexto + histórico do lead) e agenda o próximo step.

import { createServiceClient } from "../_shared/campaign-audience.ts";
import { resolveAgentSendConnection, resolveConnectionFromConversation } from "../_shared/agent-connection.ts";
import {
  computeScheduledAt,
  isFixedTimeExpired,
  withinWindow,
} from "../_shared/cadence-schedule.ts";
import { authorizePlatformWorker, loadWorkerControl, workerCanRunFor } from "../_shared/worker-control.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PER_TICK = 50;


async function evaluateStepConditions(
  supabase: any,
  conditions: any,
  lead_id: string,
  ctx?: { enrollment_id?: string; enrolled_at?: string | null; source_ref?: Record<string, any> | null },
): Promise<{ ok: boolean; reason?: string }> {
  // Global bot-loop guard: any conversation flagged as bot-loop for this lead → skip.
  try {
    const { data: flagged } = await supabase
      .from("webchat_conversations")
      .select("id")
      .eq("lead_id", lead_id)
      .not("bot_loop_detected_at", "is", null)
      .limit(1);
    if (flagged && flagged.length) return { ok: false, reason: "bot_loop_detected" };
  } catch { /* non-fatal */ }

  if (!conditions || !Object.keys(conditions).length) return { ok: true };

  // not_purchased — lead não tem deal em estágio won
  if (conditions.not_purchased) {
    const { data } = await supabase
      .from("deals")
      .select("id, stage_id, pipeline_stages!inner(stage_type)")
      .eq("lead_id", lead_id)
      .eq("pipeline_stages.stage_type", "won")
      .limit(1);
    if (data && data.length) return { ok: false, reason: "Lead já comprou" };
  }

  // not_responded — não respondeu em runs anteriores desta cadência (passa, será stop_rules quem trata)
  // without_tag — lead não tem essas tags
  if (Array.isArray(conditions.without_tags) && conditions.without_tags.length) {
    const { data } = await supabase
      .from("lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", lead_id)
      .in("tag_id", conditions.without_tags)
      .limit(1);
    if (data && data.length) return { ok: false, reason: "Lead possui tag de exclusão" };
  }

  // with_tag — exige uma das tags
  if (Array.isArray(conditions.with_tags) && conditions.with_tags.length) {
    const { data } = await supabase
      .from("lead_tag_assignments")
      .select("tag_id")
      .eq("lead_id", lead_id)
      .in("tag_id", conditions.with_tags)
      .limit(1);
    if (!data || !data.length) return { ok: false, reason: "Lead não possui tag exigida" };
  }

  // not_purchased / only_if_no_purchase — lead não tem deal em estágio won
  if (conditions.only_if_no_purchase) {
    const { data } = await supabase
      .from("deals")
      .select("id, stage_id, pipeline_stages!inner(stage_type)")
      .eq("lead_id", lead_id)
      .eq("pipeline_stages.stage_type", "won")
      .limit(1);
    if (data && data.length) return { ok: false, reason: "Lead já comprou" };
  }

  // only_if_not_human — pula se a conversa foi assumida por humano
  if (conditions.only_if_not_human) {
    const { data } = await supabase
      .from("webchat_conversations")
      .select("id")
      .eq("lead_id", lead_id)
      .eq("status", "human_active")
      .limit(1);
    if (data && data.length) return { ok: false, reason: "Conversa assumida por humano" };
  }

  // audience — responded / no_reply
  // "no_reply" passou a significar "sem janela de 24h aberta" e é avaliado
  // depois, junto da resolução de conexão/janela (não aqui).
  const audience: string = conditions.audience ?? "all";
  if (audience === "responded") {
    let since: string | null = ctx?.enrolled_at ?? null;
    if (conditions.reply_since === "previous_step" && ctx?.enrollment_id) {
      const { data: prev } = await supabase
        .from("cadence_step_runs")
        .select("executed_at")
        .eq("enrollment_id", ctx.enrollment_id)
        .eq("status", "sent")
        .not("executed_at", "is", null)
        .order("executed_at", { ascending: false })
        .limit(1);
      if (prev && prev.length && prev[0].executed_at) since = prev[0].executed_at;
    }

    const { data: convs } = await supabase
      .from("webchat_conversations")
      .select("id")
      .eq("lead_id", lead_id);
    const convIds = (convs ?? []).map((c: any) => c.id);

    let replied = false;
    const originInboundId = ctx?.source_ref?.inbound_message_id;
    // O inbound que disparou a inscrição é uma resposta válida, embora tenha sido
    // persistido milissegundos antes de enrolled_at.
    if (conditions.reply_since !== "previous_step" && originInboundId) replied = true;
    if (convIds.length) {
      let q = supabase
        .from("webchat_messages")
        .select("id")
        .in("conversation_id", convIds)
        .eq("direction", "inbound")
        .limit(1);
      if (since) q = q.gt("created_at", since);
      const { data: inbound } = await q;
      replied = replied || !!(inbound && inbound.length);
    }

    if (!replied) return { ok: false, reason: "Lead ainda não respondeu" };
  }


  return { ok: true };
}


async function getStepContext(supabase: any, step: any): Promise<string> {
  if (step.context_inline && step.context_inline.trim()) return step.context_inline.trim();
  if (step.context_id) {
    const { data } = await supabase
      .from("campaign_contexts")
      .select("content, name")
      .eq("id", step.context_id)
      .maybeSingle();
    if (data?.content) return data.content as string;
  }
  return step.objective ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!(await authorizePlatformWorker(supabase, req))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const workerControl = await loadWorkerControl(supabase, "cadence");
    if (!workerControl.enabled) {
      return new Response(JSON.stringify({ processed: 0, reason: "worker_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: runs } = await supabase
      .from("cadence_step_runs")
      .select("id, enrollment_id, step_id, organization_id, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .limit(MAX_PER_TICK * 10);

    const list = (runs ?? [])
      .filter((run) => workerCanRunFor(workerControl, run.organization_id))
      .slice(0, MAX_PER_TICK);
    if (!list.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0, skipped = 0, failed = 0, completed = 0;
    const cadenceCache = new Map<string, any>();
    const stepsCache = new Map<string, any[]>();

    for (const run of list) {
      // Lock otimista
      const { data: locked } = await supabase
        .from("cadence_step_runs")
        .update({ status: "sent" }) // será revertido se falhar / skip
        .eq("id", run.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (!locked) { skipped++; continue; }

      try {
        // Pega enrollment + cadence + step
        const { data: enrollment } = await supabase
          .from("cadence_enrollments")
          .select("id, cadence_id, lead_id, organization_id, status, current_step_index, enrolled_at, source_ref")
          .eq("id", run.enrollment_id)
          .maybeSingle();
        if (!enrollment || enrollment.status !== "active") {
          await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: "enrollment_inactive", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++; continue;
        }

        let cadence = cadenceCache.get(enrollment.cadence_id);
        if (!cadence) {
          const { data } = await supabase
            .from("cadences")
            .select("id, status, agent_id, name, execution_window, stop_rules, send_connection_id, send_connection_type")
            .eq("id", enrollment.cadence_id)
            .maybeSingle();
          if (data) cadenceCache.set(enrollment.cadence_id, data);
          cadence = data;
        }
        if (!cadence || cadence.status !== "active") {
          await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: "cadence_inactive", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++; continue;
        }

        // Etapas com horário fixo ignoram a janela de execução (ex.: link da live às 19:55)
        const { data: stepRow } = await supabase
          .from("cadence_steps")
          .select("schedule_mode")
          .eq("id", run.step_id)
          .maybeSingle();
        const isFixedTimeStep = (stepRow as any)?.schedule_mode === "fixed_time";

        if (!isFixedTimeStep && !withinWindow(cadence.execution_window)) {
          // Reagendar 10min à frente
          await supabase
            .from("cadence_step_runs")
            .update({ status: "scheduled", scheduled_at: new Date(Date.now() + 10 * 60_000).toISOString() })
            .eq("id", run.id);
          skipped++; continue;
        }

        // stop_rules globais — ex: stop_on_purchase
        const stopRules = cadence.stop_rules ?? {};
        if (stopRules.stop_on_purchase) {
          const { data: deals } = await supabase
            .from("deals")
            .select("id, pipeline_stages!inner(stage_type)")
            .eq("lead_id", enrollment.lead_id)
            .eq("pipeline_stages.stage_type", "won")
            .limit(1);
          if (deals && deals.length) {
            await supabase.from("cadence_enrollments").update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: "purchased" }).eq("id", enrollment.id);
            await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: "stopped_on_purchase", executed_at: new Date().toISOString() }).eq("id", run.id);
            skipped++; continue;
          }
        }

        let steps = stepsCache.get(enrollment.cadence_id);
        if (!steps) {
          const { data } = await supabase
            .from("cadence_steps")
            .select("*")
            .eq("cadence_id", enrollment.cadence_id)
            .order("order_index", { ascending: true });
          steps = data ?? [];
          stepsCache.set(enrollment.cadence_id, steps);
        }

        const currentStep = steps.find((s: any) => s.id === run.step_id);
        if (!currentStep) {
          await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: "step_not_found", executed_at: new Date().toISOString() }).eq("id", run.id);
          skipped++; continue;
        }

        // Horário fixo já vencido (além da tolerância) → nunca envia atrasado
        if (isFixedTimeExpired(currentStep, run.scheduled_at)) {
          await supabase.from("cadence_step_runs").update({
            status: "skipped",
            skip_reason: "fixed_time_passed",
            executed_at: new Date().toISOString(),
          }).eq("id", run.id);
          skipped++;
          const nIdx = (enrollment.current_step_index ?? 0) + 1;
          const nStep = steps[nIdx];
          if (nStep) {
            const nAt = computeScheduledAt(nStep, new Date(), { window: cadence.execution_window }).at;
            await supabase.from("cadence_step_runs").insert({
              enrollment_id: enrollment.id,
              step_id: nStep.id,
              organization_id: enrollment.organization_id,
              scheduled_at: nAt.toISOString(),
              status: "scheduled",
            });
            await supabase.from("cadence_enrollments").update({
              current_step_id: nStep.id,
              current_step_index: nIdx,
            }).eq("id", enrollment.id);
          } else {
            await supabase.from("cadence_enrollments").update({
              status: "completed", completed_at: new Date().toISOString(),
            }).eq("id", enrollment.id);
            completed++;
          }
          continue;
        }



        // Avalia condições da etapa
        const evalResult = await evaluateStepConditions(supabase, currentStep.conditions, enrollment.lead_id, {
          enrollment_id: enrollment.id,
          enrolled_at: enrollment.enrolled_at,
          source_ref: enrollment.source_ref,
        });
        if (!evalResult.ok) {
          await supabase.from("cadence_step_runs").update({
            status: "skipped",
            skip_reason: evalResult.reason ?? "conditions",
            executed_at: new Date().toISOString(),
            metadata: { decision: "audience", audience: currentStep.conditions?.audience ?? "all", reply_since: currentStep.conditions?.reply_since ?? "enrollment" },
          }).eq("id", run.id);
          skipped++;
          // Avança mesmo assim para próximo step? Sim — não trava o lead na etapa.
        } else {
          if (!cadence.agent_id) {
            await supabase.from("cadence_step_runs").update({ status: "failed", error: "Cadence has no agent_id", executed_at: new Date().toISOString() }).eq("id", run.id);
            failed++; continue;
          }
          // Conexão de envio:
          //   1) preferência explícita da cadência
          //   2) conexão da conversa que originou a inscrição (source_ref.conversation_id)
          //   3) conexão da conversa ativa mais recente do lead
          //   4) fallback: conexão padrão do agente
          let connSource: 'cadence' | 'origin_conversation' | 'conversation' | 'agent' = 'cadence';
          let conn: { connection_type: "evolution" | "meta_whatsapp"; connection_id: string } | null = null;
          let originConversationId: string | null = (enrollment.source_ref as any)?.conversation_id ?? null;
          let originConv: any = null;
          if (originConversationId) {
            const { data } = await supabase
              .from('webchat_conversations')
              .select('id, meta_connection_id, instance_id')
              .eq('id', originConversationId)
              .maybeSingle();
            originConv = data ?? null;
            if (!originConv) originConversationId = null;
          }

          if (cadence.send_connection_id && cadence.send_connection_type) {
            conn = { connection_type: cadence.send_connection_type, connection_id: cadence.send_connection_id };
          } else if (originConv?.meta_connection_id) {
            conn = { connection_type: 'meta_whatsapp', connection_id: originConv.meta_connection_id };
            connSource = 'origin_conversation';
          } else if (originConv?.instance_id) {
            conn = { connection_type: 'evolution', connection_id: originConv.instance_id };
            connSource = 'origin_conversation';
          } else {
            conn = await resolveConnectionFromConversation(supabase, enrollment.lead_id);
            connSource = 'conversation';
            if (!conn) {
              conn = await resolveAgentSendConnection(supabase, cadence.agent_id);
              connSource = 'agent';
            }
          }
          if (!conn) {
            await supabase.from("cadence_step_runs").update({ status: "failed", error: "Agente não possui conexão WhatsApp configurada", executed_at: new Date().toISOString() }).eq("id", run.id);
            failed++; continue;
          }



          // Contexto da etapa vai como BRIEFING (orientação), nunca como texto a copiar.
          // Cabeçalhos internos (nome da cadência, objetivo, tom) não entram no bloco:
          // o objetivo segue no campo próprio e o tom no prompt do agente.
          const ctx = await getStepContext(supabase, currentStep);
          const extra_context = [
            currentStep.tone ? `Tom desejado: ${currentStep.tone}` : "",
            ctx ?? "",
          ].filter(Boolean).join("\n\n");

          // Janela 24h (Meta). Para Evolution não existe restrição → considera "aberta".
          let templateConfig: any = null;
          let withinWin = true;
          if (conn.connection_type === 'meta_whatsapp') {
            let convId: string | null = originConv?.meta_connection_id === conn.connection_id
              ? originConv.id
              : null;
            if (!convId) {
              const { data: convRow } = await supabase
                .from('webchat_conversations')
                .select('id')
                .eq('lead_id', enrollment.lead_id)
                .eq('meta_connection_id', conn.connection_id)
                .neq('status', 'closed')
                .order('last_message_at', { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle();
              convId = convRow?.id ?? null;
            }
            withinWin = false;
            if (convId) {
              const { data: w } = await supabase.rpc('is_within_24h_window', { _conversation_id: convId });
              withinWin = !!w;
            }
          }

          let skipReason: string | null = null;
          const stepAudience: string = currentStep.conditions?.audience ?? 'all';
          // "Somente quem NÃO respondeu" = somente quem está SEM janela aberta.
          // Se a janela está aberta, a etapa é ignorada por completo.
          if (stepAudience === 'no_reply' && withinWin) {
            skipReason = 'window_open_skipped';
          }
          // A janela Meta decide se o transporte será texto livre ou HSM.
          if (!skipReason && conn.connection_type === 'meta_whatsapp' && !withinWin) {

            // Lista de variações (novo formato) com fallback ao template único (legado)
            const variants: Array<{ template_id: string; variable_mapping?: any }> =
              Array.isArray(currentStep.reengagement_templates) && currentStep.reengagement_templates.length
                ? currentStep.reengagement_templates.filter((v: any) => v?.template_id)
                : (currentStep.reengagement_template_id
                  ? [{ template_id: currentStep.reengagement_template_id, variable_mapping: currentStep.reengagement_variable_mapping ?? {} }]
                  : []);

            if (!variants.length) {
              skipReason = 'out_of_window_no_template';
            } else {
              let idx = 0;
              if (variants.length > 1) {
                if ((currentStep.reengagement_rotation ?? 'random') === 'round_robin') {
                  const { count } = await supabase
                    .from('cadence_step_runs')
                    .select('id', { count: 'exact', head: true })
                    .eq('step_id', currentStep.id)
                    .eq('status', 'sent');
                  idx = (count ?? 0) % variants.length;
                } else {
                  idx = Math.floor(Math.random() * variants.length);
                }
              }
              const chosen = variants[idx];
              templateConfig = {
                template_id: chosen.template_id,
                variable_mapping: chosen.variable_mapping ?? {},
              };
            }
          }

          if (skipReason) {
            await supabase.from("cadence_step_runs").update({
              status: "skipped",
              skip_reason: skipReason,
              executed_at: new Date().toISOString(),
              metadata: {
                decision: "window",
                audience: stepAudience,
                connection_type: conn.connection_type,
                connection_id: conn.connection_id,
                connection_source: connSource,
                origin_conversation_id: originConversationId,
                meta_window_open: withinWin,
              },

            }).eq("id", run.id);

            skipped++;
            // Avança para a próxima etapa mesmo assim
            const nextIndex = (enrollment.current_step_index ?? 0) + 1;
            const nextStep = steps[nextIndex];
            if (nextStep) {
              const scheduledAt = computeScheduledAt(nextStep, new Date(), { window: cadence.execution_window }).at;
              await supabase.from("cadence_step_runs").insert({
                enrollment_id: enrollment.id,
                step_id: nextStep.id,
                organization_id: enrollment.organization_id,
                scheduled_at: scheduledAt.toISOString(),
                status: "scheduled",
              });
              await supabase.from("cadence_enrollments").update({
                current_step_id: nextStep.id,
                current_step_index: nextIndex,
              }).eq("id", enrollment.id);
            } else {
              await supabase.from("cadence_enrollments").update({
                status: "completed", completed_at: new Date().toISOString(),
              }).eq("id", enrollment.id);
              completed++;
            }
            continue;
          }

          const resp = await fetch(`${supabaseUrl}/functions/v1/manual-outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              lead_ids: [enrollment.lead_id],
              agent_id: cadence.agent_id,
              organization_id: enrollment.organization_id,
              objective: currentStep.objective || `Cadência: ${cadence.name} — ${currentStep.name}`,
              extra_context,
              context_mode: "guidance",
              mode: "direct",
              instance_id: conn.connection_id,
              connection_type: conn.connection_type,
              template_config: templateConfig,
              fixed_text: currentStep.message_mode === 'fixed_text' ? (currentStep.fixed_message || null) : null,
              no_agent: currentStep.message_mode === 'fixed_text',
              event_context: { cadence_id: cadence.id, cadence_step_id: currentStep.id, cadence_run_id: run.id },
            }),
          });
          const body = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            await supabase.from("cadence_step_runs").update({ status: "failed", error: body?.error ?? `HTTP ${resp.status}`, executed_at: new Date().toISOString() }).eq("id", run.id);
            failed++; continue;
          }

          const result = body?.results?.[0] ?? {};
          if (result.skipped) {
            await supabase.from("cadence_step_runs").update({ status: "skipped", skip_reason: result.reason ?? "outreach_skipped", executed_at: new Date().toISOString() }).eq("id", run.id);
            skipped++;
            // Trava de fila: se a conversa foi devolvida ao humano, encerra a cadência
            if (result.code === "QUEUE_LOCK") {
              await supabase.from("cadence_enrollments")
                .update({ status: "stopped", stopped_at: new Date().toISOString(), stop_reason: "queue_lock" })
                .eq("id", enrollment.id);
              console.log(`[cadence-tick] 🔒 enrollment ${enrollment.id} stopped — conversation handed to queue`);
              continue;
            }

          } else {
            await supabase.from("cadence_step_runs").update({
              status: "sent",
              executed_at: new Date().toISOString(),
              conversation_id: result.conversationId ?? null,
              agent_message: result.message ?? null,
              metadata: {
                decision: "sent",
                audience: stepAudience,
                meta_window_open: withinWin,
                connection_type: conn.connection_type,
                connection_id: conn.connection_id,
                connection_source: connSource,
                origin_conversation_id: originConversationId,
                transport: templateConfig?.template_id ? "template" : "free_message",
                ...(templateConfig?.template_id ? { template_id: templateConfig.template_id } : {}),
              },


            }).eq("id", run.id);
            processed++;
          }
        }

        // Agenda próximo step
        const nextIndex = (enrollment.current_step_index ?? 0) + 1;
        const nextStep = steps[nextIndex];
        if (nextStep) {
          const from = nextStep.delay_from === "enrollment" && enrollment.enrolled_at
            ? new Date(enrollment.enrolled_at)
            : new Date();
          const scheduledAt = computeScheduledAt(nextStep, from, { window: cadence.execution_window }).at;
          await supabase.from("cadence_step_runs").insert({
            enrollment_id: enrollment.id,
            step_id: nextStep.id,
            organization_id: enrollment.organization_id,
            scheduled_at: scheduledAt.toISOString(),
            status: "scheduled",
          });
          await supabase.from("cadence_enrollments").update({
            current_step_id: nextStep.id,
            current_step_index: nextIndex,
          }).eq("id", enrollment.id);
        } else {
          // Concluído
          await supabase.from("cadence_enrollments").update({
            status: "completed",
            completed_at: new Date().toISOString(),
          }).eq("id", enrollment.id);
          completed++;
        }

        // Atualiza last_executed_at da cadência
        await supabase.from("cadences").update({ last_executed_at: new Date().toISOString() }).eq("id", cadence.id);
      } catch (err) {
        console.error("[cadence-tick] run error", run.id, err);
        await supabase.from("cadence_step_runs").update({ status: "failed", error: (err as Error).message, executed_at: new Date().toISOString() }).eq("id", run.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed, skipped, failed, completed, total: list.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cadence-tick]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
