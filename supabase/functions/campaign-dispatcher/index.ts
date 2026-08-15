// Cron 1/min. Pega targets vencidos via RPC fair-share e invoca manual-outreach por lead.
// Respeita janela horária da recorrência e status da campanha (active).
//
// PERF v3 (Etapa 1 do plano de isolamento):
// - claim_campaign_targets (FOR UPDATE SKIP LOCKED + ROW_NUMBER por org)
//   garante fair-share: nenhuma empresa pega mais que PER_ORG_LIMIT por tick,
//   e o claim é atômico (não há race entre dispatchers).
// - Update final em UM único statement via UNNEST(VALUES) — não mais N UPDATEs.
// - Log estruturado por tick para observabilidade.
//
// Etapa anterior (v2) ainda válida:
// - Validações de lead (opt-out, phone, bot-loop) em batch antes do loop
// - Chamadas ao manual-outreach paralelizadas (CONCURRENCY = 8)

import { createServiceClient } from "../_shared/campaign-audience.ts";
import { normalizePhoneBR } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GLOBAL_LIMIT  = 100; // máx total de targets reservados por tick
const PER_ORG_LIMIT = 10;  // máx por organização por tick (fair-share)
const CONCURRENCY   = 8;   // chamadas paralelas ao manual-outreach

function withinWindow(campaign: any): boolean {
  if (campaign.schedule_type !== "recurring") return true;
  const rec = campaign.recurrence;
  if (!rec) return true;
  const now = new Date();
  const day = now.getDay();
  if (Array.isArray(rec.days) && rec.days.length && !rec.days.includes(day)) return false;
  if (rec.start && rec.end) {
    const [sh, sm] = String(rec.start).split(":").map(Number);
    const [eh, em] = String(rec.end).split(":").map(Number);
    const nowMin   = now.getHours() * 60 + now.getMinutes();
    const startMin = sh * 60 + (sm || 0);
    const endMin   = eh * 60 + (em || 0);
    if (nowMin < startMin || nowMin > endMin) return false;
  }
  return true;
}

/** Executa array de promises com no máximo `limit` em paralelo por vez */
async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = await Promise.all(tasks.slice(i, i + limit).map(fn => fn()));
    results.push(...batch);
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const tickId    = crypto.randomUUID().slice(0, 8);
  const tickStart = Date.now();

  try {
    const supabase    = createServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── 1. Campanhas ativas ────────────────────────────────────────────────
    const { data: activeCampaigns } = await supabase
      .from("campaigns")
      .select("id, status, agent_id, schedule_type, recurrence, name, post_cadence_id, meta_template_config")
      .eq("status", "active");

    const campaignCache = new Map<string, any>();
    for (const c of activeCampaigns ?? []) campaignCache.set(c.id, c);

    if (campaignCache.size === 0) {
      console.log(JSON.stringify({ tick_id: tickId, reason: "no_active_campaigns", duration_ms: Date.now() - tickStart }));
      return new Response(JSON.stringify({ processed: 0, reason: "no_active_campaigns" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Janela horária — adia targets fora de janela em lote ───────────
    const inWindowIds:    string[] = [];
    const outOfWindowIds: string[] = [];
    for (const [id, c] of campaignCache.entries()) {
      if (withinWindow(c)) inWindowIds.push(id);
      else outOfWindowIds.push(id);
    }

    if (outOfWindowIds.length) {
      await supabase
        .from("campaign_targets")
        .update({ scheduled_for: new Date(Date.now() + 30 * 60 * 1000).toISOString() })
        .in("campaign_id", outOfWindowIds)
        .eq("status", "queued")
        .lte("scheduled_for", new Date().toISOString());
    }

    if (!inWindowIds.length) {
      console.log(JSON.stringify({ tick_id: tickId, reason: "all_out_of_window", duration_ms: Date.now() - tickStart }));
      return new Response(JSON.stringify({ processed: 0, reason: "all_out_of_window" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. CLAIM atômico fair-share via RPC ───────────────────────────────
    // A função SQL retorna até GLOBAL_LIMIT targets, no máximo PER_ORG_LIMIT
    // por organização, já marcados como 'sending' e com attempts++.
    const { data: claimedRaw, error: claimErr } = await supabase.rpc("claim_campaign_targets", {
      p_global_limit:         GLOBAL_LIMIT,
      p_per_org_limit:        PER_ORG_LIMIT,
      p_lookahead_multiplier: 10,
    });
    if (claimErr) throw claimErr;

    // Filtra para campanhas que ainda estão "in window" e ativas
    const claimed = (claimedRaw ?? []).filter((t: any) =>
      inWindowIds.includes(t.campaign_id) && campaignCache.has(t.campaign_id)
    );

    // Targets reservados que NÃO pertencem a campanhas válidas → liberar (volta para queued)
    const orphanIds = (claimedRaw ?? [])
      .filter((t: any) => !inWindowIds.includes(t.campaign_id) || !campaignCache.has(t.campaign_id))
      .map((t: any) => t.id);
    if (orphanIds.length) {
      await supabase
        .from("campaign_targets")
        .update({ status: "queued" })
        .in("id", orphanIds);
    }

    if (!claimed.length) {
      console.log(JSON.stringify({
        tick_id: tickId, claimed_count: 0, distinct_org_count: 0,
        duration_ms: Date.now() - tickStart, sent: 0, failed: 0, skipped: 0,
      }));
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const distinctOrgCount = new Set(claimed.map((t: any) => t.organization_id)).size;
    const leadIds = [...new Set(claimed.map((t: any) => t.lead_id))];

    // ── 4. BATCH: validação de leads (1 SELECT em vez de N) ───────────────
    const [leadsResult, botFlagResult] = await Promise.all([
      supabase.from("leads").select("id, whatsapp_opt_in, phone").in("id", leadIds),
      supabase.from("webchat_conversations")
        .select("lead_id")
        .in("lead_id", leadIds)
        .not("bot_loop_detected_at", "is", null),
    ]);

    const leadMap    = new Map((leadsResult.data ?? []).map((l: any) => [l.id, l]));
    const botFlagged = new Set((botFlagResult.data ?? []).map((b: any) => b.lead_id));

    // ── 5. Classificar targets sem tocar no banco ─────────────────────────
    type FinalRow = {
      id: string;
      status: "sent" | "failed" | "cancelled" | "skipped";
      error: string | null;
      sent_at: string | null;
      conversation_id: string | null;
      outreach_queue_id: string | null;
    };
    const finals: FinalRow[] = [];
    const toProcess: any[]   = [];

    for (const t of claimed) {
      const lead = leadMap.get(t.lead_id) as any;
      if (lead?.whatsapp_opt_in === false) {
        finals.push({ id: t.id, status: "cancelled", error: "whatsapp_opt_out", sent_at: null, conversation_id: null, outreach_queue_id: null });
        continue;
      }
      if (!normalizePhoneBR(lead?.phone)) {
        finals.push({ id: t.id, status: "skipped", error: "invalid_phone", sent_at: null, conversation_id: null, outreach_queue_id: null });
        continue;
      }
      if (botFlagged.has(t.lead_id)) {
        finals.push({ id: t.id, status: "cancelled", error: "bot_loop_detected", sent_at: null, conversation_id: null, outreach_queue_id: null });
        continue;
      }
      toProcess.push(t);
    }

    // ── 6. ENVIO EM LOTE (Etapa 5) ───────────────────────────────────────
    // Antes: N fetches HTTP ao manual-outreach (1 por target).
    // Agora: 1 fetch ao manual-outreach-batch que compartilha boot + cache.
    // Rollback: defina USE_BATCH_SENDER=false no env da function.
    const useBatch = (Deno.env.get("USE_BATCH_SENDER") ?? "true") !== "false";

    const buildTemplate = (t: any) => {
      const campaign = campaignCache.get(t.campaign_id)!;
      const cfg = (campaign as any).meta_template_config ?? null;
      if (t.connection_type !== "meta_whatsapp" || !cfg) return null;
      if (Array.isArray(cfg.templates) && cfg.templates.length) {
        return cfg.templates[Math.floor(Math.random() * cfg.templates.length)];
      }
      if (cfg.template_id) {
        return { template_id: cfg.template_id, variable_mapping: cfg.variable_mapping ?? {} };
      }
      return null;
    };

    const buildTargetPayload = (t: any) => {
      const campaign = campaignCache.get(t.campaign_id)!;
      const chosenTemplate = buildTemplate(t);
      return {
        campaign_target_id: t.id,
        lead_id: t.lead_id,
        agent_id: campaign.agent_id,
        organization_id: t.organization_id,
        objective: `Campanha: ${campaign.name}`,
        extra_context: t.context_used,
        // O contexto da Campanha Inteligente é briefing interno. Sem este campo,
        // o núcleo usa o modo legado "literal" e pode copiar Objetivo/Tom/CTA
        // para a mensagem visível do lead.
        context_mode: "guidance" as const,
        mode: "direct" as const,
        instance_id: t.instance_id,
        connection_type: (t.connection_type ?? "evolution") as "evolution" | "meta_whatsapp",
        template_config: chosenTemplate,
        event_context: {
          campaign_id: campaign.id,
          campaign_target_id: t.id,
          template_id: chosenTemplate?.template_id ?? null,
        },
      };
    };

    const recordResult = (t: any, result: any) => {
      if (result?.skipped) {
        finals.push({ id: t.id, status: "skipped", error: result.reason ?? "skipped", sent_at: null, conversation_id: null, outreach_queue_id: null });
        return;
      }
      if (result?.sent !== true || result?.error) {
        finals.push({ id: t.id, status: "failed", error: result?.error ?? "send_failed", sent_at: null, conversation_id: null, outreach_queue_id: null });
        return;
      }
      finals.push({
        id: t.id,
        status: "sent",
        error: null,
        sent_at: new Date().toISOString(),
        conversation_id: result.conversationId ?? null,
        outreach_queue_id: result.outreachQueueId ?? null,
      });
    };

    if (useBatch && toProcess.length) {
      try {
        const payload = { targets: toProcess.map(buildTargetPayload) };
        const resp = await fetch(`${supabaseUrl}/functions/v1/manual-outreach-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify(payload),
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(body?.error ?? `HTTP ${resp.status}`);
        const byTargetId = new Map<string, any>();
        for (const r of (body?.results ?? [])) {
          if (r.campaign_target_id) byTargetId.set(r.campaign_target_id, r);
        }
        for (const t of toProcess) {
          const r = byTargetId.get(t.id);
          if (!r) {
            finals.push({ id: t.id, status: "failed", error: "no_result_from_batch", sent_at: null, conversation_id: null, outreach_queue_id: null });
            continue;
          }
          recordResult(t, r);
        }
      } catch (err) {
        console.error(`[campaign-dispatcher] tick=${tickId} batch send failed, marcando todos como failed:`, err);
        for (const t of toProcess) {
          finals.push({ id: t.id, status: "failed", error: (err as Error).message, sent_at: null, conversation_id: null, outreach_queue_id: null });
        }
      }
    } else if (toProcess.length) {
      // Caminho legado (1 fetch por target). Mantido para rollback via env.
      const processTasks = toProcess.map((t) => async () => {
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/manual-outreach`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              lead_ids: [t.lead_id],
              ...buildTargetPayload(t),
            }),
          });
          const body = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            finals.push({ id: t.id, status: "failed", error: body?.error ?? `HTTP ${resp.status}`, sent_at: null, conversation_id: null, outreach_queue_id: null });
            return;
          }
          recordResult(t, body?.results?.[0] ?? {});
        } catch (err) {
          finals.push({ id: t.id, status: "failed", error: (err as Error).message, sent_at: null, conversation_id: null, outreach_queue_id: null });
        }
      });
      await pLimit(processTasks, CONCURRENCY);
    }


    // ── 7. UPDATE FINAL EM LOTE (UM único statement via UNNEST) ──────────
    // Em vez de N UPDATEs, fazemos 1 round-trip ao banco usando uma CTE
    // construída a partir de arrays paralelos.
    if (finals.length) {
      const ids       = finals.map(f => f.id);
      const statuses  = finals.map(f => f.status);
      const errors    = finals.map(f => f.error);
      const sentAts   = finals.map(f => f.sent_at);
      const convIds   = finals.map(f => f.conversation_id);
      const queueIds  = finals.map(f => f.outreach_queue_id);

      const { error: batchErr } = await supabase.rpc("exec_finalize_campaign_targets", {
        p_ids: ids,
        p_statuses: statuses,
        p_errors: errors,
        p_sent_ats: sentAts,
        p_conv_ids: convIds,
        p_queue_ids: queueIds,
      }).then(r => r).catch(e => ({ error: e }));

      // Fallback: se a RPC ainda não existir, faz updates agrupados por status
      // (este fallback será removido após a próxima migration que adiciona a RPC).
      if (batchErr) {
        console.warn(`[campaign-dispatcher] tick=${tickId} batch RPC unavailable, fallback per-status:`, batchErr.message ?? batchErr);
        const byStatus: Record<string, FinalRow[]> = {};
        for (const f of finals) (byStatus[f.status] ||= []).push(f);

        const fallback: Promise<any>[] = [];
        for (const [status, rows] of Object.entries(byStatus)) {
          if (status === "sent") {
            // conversation_id é único por linha — update individual
            for (const r of rows) {
              fallback.push(
                supabase.from("campaign_targets").update({
                  status: "sent",
                  sent_at: r.sent_at,
                  conversation_id: r.conversation_id,
                  outreach_queue_id: r.outreach_queue_id,
                }).eq("id", r.id)
              );
            }
          } else {
            // failed / cancelled / skipped — agrupa por mensagem
            const byErr: Record<string, string[]> = {};
            for (const r of rows) (byErr[r.error ?? "unknown"] ||= []).push(r.id);
            for (const [error, idList] of Object.entries(byErr)) {
              fallback.push(
                supabase.from("campaign_targets").update({ status, error }).in("id", idList)
              );
            }
          }
        }
        await Promise.all(fallback);
      }
    }

    // ── 8. Post-cadence enroll (fire-and-forget) ──────────────────────────
    for (const f of finals.filter(x => x.status === "sent")) {
      const t        = toProcess.find(x => x.id === f.id);
      if (!t) continue;
      const campaign = campaignCache.get(t.campaign_id)!;
      if (!campaign.post_cadence_id) continue;
      fetch(`${supabaseUrl}/functions/v1/cadence-enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          cadence_id: campaign.post_cadence_id,
          lead_ids:   [t.lead_id],
          source:     "campaign",
          source_ref: { campaign_id: campaign.id, campaign_target_id: f.id },
        }),
      }).catch(e => console.error("[campaign-dispatcher] cadence-enroll non-fatal:", e));
    }

    // ── 9. Completa campanhas sem targets restantes ───────────────────────
    const touchedCampaigns = [...new Set(claimed.map((t: any) => t.campaign_id))];
    const completionChecks = touchedCampaigns.map(async (cid: any) => {
      const { count } = await supabase
        .from("campaign_targets")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", cid)
        .in("status", ["queued", "sending"]);
      if (count === 0) {
        const camp = campaignCache.get(cid);
        if (camp?.schedule_type !== "recurring") {
          await supabase
            .from("campaigns")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", cid)
            .eq("status", "active");
        }
      }
    });
    await Promise.all(completionChecks);

    const sent      = finals.filter(f => f.status === "sent").length;
    const failed    = finals.filter(f => f.status === "failed").length;
    const skipped   = finals.filter(f => f.status === "skipped" || f.status === "cancelled").length;

    console.log(JSON.stringify({
      tick_id:            tickId,
      claimed_count:      claimed.length,
      distinct_org_count: distinctOrgCount,
      duration_ms:        Date.now() - tickStart,
      sent, failed, skipped,
      orphans_released:   orphanIds.length,
    }));

    return new Response(
      JSON.stringify({ processed: sent, skipped, failed, total: claimed.length, distinct_orgs: distinctOrgCount, tick_id: tickId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error(`[campaign-dispatcher] tick=${tickId}`, err);
    return new Response(JSON.stringify({ error: (err as Error).message, tick_id: tickId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
