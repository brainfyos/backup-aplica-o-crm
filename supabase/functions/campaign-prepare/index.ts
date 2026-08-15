// Worker assíncrono. Cron 1/min. Pega até 3 jobs pending/running com
// SKIP LOCKED e insere campaign_targets em lotes de 500.
// Quando termina, marca campaign como 'active' e job como 'completed'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { authorizePlatformWorker, loadWorkerControl, workerCanRunFor } from "../_shared/worker-control.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_JOBS_PER_TICK = 3;
const MAX_INSERTS_PER_TICK = 5000; // teto de proteção por execução
const MAX_ATTEMPTS = 3;

type SpeedPreset = "safe" | "recommended" | "fast" | "aggressive" | "custom";

function speedSecondsRange(preset: SpeedPreset, custom?: any): [number, number] {
  switch (preset) {
    case "safe": return [120, 300];
    case "recommended": return [60, 180];
    case "fast": return [30, 120];
    case "aggressive": return [10, 45];
    case "custom":
      return [Number(custom?.min_seconds ?? 60), Number(custom?.max_seconds ?? 180)];
    default: return [60, 180];
  }
}

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick<T extends { weight?: number }>(items: T[]): T | null {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + (i.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight ?? 1;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function createServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function processJob(supabase: any, job: any) {
  const snap = job.campaign_snapshot ?? {};
  const instances: any[] = snap.instances ?? [];
  const contexts: any[] = snap.contexts ?? [];
  const distribution: string = snap.context_distribution ?? "random";
  const strategy: string = snap.instance_strategy ?? "rotation";
  const [minSec, maxSec] = speedSecondsRange(snap.speed_preset as SpeedPreset, snap.speed_config);

  const leadIds: string[] = job.lead_ids ?? [];
  const batchSize: number = job.batch_size ?? 500;
  let cursor: number = job.cursor ?? 0;
  const total = leadIds.length;

  // base time recalculado pelo cursor: cada lead consome um intervalo
  // determinístico médio para manter scheduled_for consistente entre ticks.
  // Estratégia simples: pegar maior scheduled_for já existente p/ continuar a curva.
  let baseTimeMs: number;
  if (cursor === 0) {
    baseTimeMs = snap.base_time_ms ?? Date.now();
  } else {
    const { data: lastTarget } = await supabase
      .from("campaign_targets")
      .select("scheduled_for")
      .eq("campaign_id", job.campaign_id)
      .order("scheduled_for", { ascending: false })
      .limit(1)
      .maybeSingle();
    baseTimeMs = lastTarget?.scheduled_for
      ? new Date(lastTarget.scheduled_for).getTime()
      : (snap.base_time_ms ?? Date.now());
  }

  let inserted = 0;
  let timeCursor = baseTimeMs;
  let seqIdx = cursor; // continua sequência onde parou
  let instIdx = cursor;

  while (cursor < total && inserted < MAX_INSERTS_PER_TICK) {
    const end = Math.min(cursor + batchSize, total);
    const slice = leadIds.slice(cursor, end);
    const targets: any[] = [];

    for (const leadId of slice) {
      let ctx;
      if (distribution === "sequential") {
        ctx = contexts[seqIdx % contexts.length];
        seqIdx++;
      } else if (distribution === "weighted") {
        ctx = weightedPick(contexts)!;
      } else {
        ctx = contexts[Math.floor(Math.random() * contexts.length)];
      }

      let inst;
      if (strategy === "rotation") {
        inst = instances[instIdx % instances.length];
        instIdx++;
      } else if (strategy === "manual") {
        inst = weightedPick(instances)!;
      } else {
        inst = instances[Math.floor(Math.random() * instances.length)];
      }

      timeCursor += randomBetween(minSec, maxSec) * 1000;

      targets.push({
        campaign_id: job.campaign_id,
        lead_id: leadId,
        organization_id: job.organization_id,
        status: "queued",
        context_used: ctx.text,
        context_id: ctx.id ?? null,
        instance_id: inst.id,
        connection_type: inst.connection_type,
        scheduled_for: new Date(timeCursor).toISOString(),
      });
    }

    const { error: insErr } = await supabase
      .from("campaign_targets")
      .upsert(targets, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
    if (insErr) throw insErr;

    cursor = end;
    inserted += targets.length;

    // checkpoint após cada lote
    await supabase
      .from("campaign_preparation_jobs")
      .update({ cursor, processed_contacts: cursor })
      .eq("id", job.id);
  }

  if (cursor >= total) {
    // concluído
    await supabase
      .from("campaign_preparation_jobs")
      .update({
        status: "completed",
        processed_contacts: cursor,
        cursor,
        completed_at: new Date().toISOString(),
        lead_ids: [], // libera memória do snapshot
      })
      .eq("id", job.id);

    await supabase
      .from("campaigns")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", job.campaign_id);
  } else {
    // ainda há mais — volta para pending para próximo tick
    await supabase
      .from("campaign_preparation_jobs")
      .update({ status: "pending", cursor, processed_contacts: cursor })
      .eq("id", job.id);
  }

  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const tickId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    const supabase = createServiceClient();
    if (!(await authorizePlatformWorker(supabase, req))) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const workerControl = await loadWorkerControl(supabase, "campaign_prepare");
    if (!workerControl.enabled) {
      return new Response(JSON.stringify({ jobs_processed: 0, reason: "worker_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // claim atômico de jobs (skip locked) via RPC simulado por UPDATE...RETURNING
    const { data: claimed, error: claimErr } = await supabase.rpc(
      "claim_campaign_preparation_jobs_controlled",
      { p_limit: MAX_JOBS_PER_TICK },
    );

    if (claimErr) {
      // Fallback: claim via SELECT + UPDATE (sem skip locked). RPC abaixo é opcional.
      console.warn("[campaign-prepare] RPC indisponível, usando fallback:", claimErr.message);
      const { data: pending } = await supabase
        .from("campaign_preparation_jobs")
        .select("*")
        .in("status", ["pending"])
        .order("created_at", { ascending: true })
        .limit(MAX_JOBS_PER_TICK * 10);
      const list = ((pending ?? []) as any[])
        .filter((job) => workerCanRunFor(workerControl, job.organization_id))
        .slice(0, MAX_JOBS_PER_TICK);
      if (list.length) {
        await supabase
          .from("campaign_preparation_jobs")
          .update({ status: "running", started_at: new Date().toISOString() })
          .in("id", list.map((j) => j.id));
      }
      return await runJobs(supabase, list, tickId, startedAt);
    }

    return await runJobs(supabase, (claimed ?? []) as any[], tickId, startedAt);
  } catch (err) {
    console.error("[campaign-prepare] fatal", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runJobs(supabase: any, jobs: any[], tickId: string, startedAt: number) {
  let totalInserted = 0;
  const results: any[] = [];

  for (const job of jobs) {
    try {
      const inserted = await processJob(supabase, job);
      totalInserted += inserted;
      results.push({ job_id: job.id, inserted, ok: true });
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[campaign-prepare] job ${job.id} failed:`, message);
      const attempts = (job.attempts ?? 0) + 1;
      await supabase
        .from("campaign_preparation_jobs")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          error: message,
        })
        .eq("id", job.id);

      if (attempts >= MAX_ATTEMPTS) {
        await supabase
          .from("campaigns")
          .update({ status: "draft" })
          .eq("id", job.campaign_id);
      }

      results.push({ job_id: job.id, inserted: 0, ok: false, error: message });
    }
  }

  const payload = {
    tick_id: tickId,
    jobs_processed: jobs.length,
    total_inserted: totalInserted,
    duration_ms: Date.now() - startedAt,
    results,
  };
  console.log(JSON.stringify(payload));
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
