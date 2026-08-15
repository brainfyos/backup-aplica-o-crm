// mia-learn-worker — processa a fila de conversas encerradas.
// Deve rodar como cron a cada 5 minutos.
// Lê mia_learn_queue, chama mia-learn para cada, remove da fila.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadWorkerControl, workerCanRunFor } from "../_shared/worker-control.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE  = 10; // processa 10 conversas por tick
const MAX_ATTEMPTS = 3; // desiste após 3 tentativas

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // O cron usa um segredo gerado e armazenado apenas no banco. A função fica
    // fora do JWT padrão porque pg_cron não deve receber a service-role key.
    const suppliedSecret = req.headers.get("x-mia-worker-secret") ?? "";
    const { data: runtimeSecret, error: secretError } = await admin
      .from("mia_runtime_secrets")
      .select("secret")
      .eq("name", "learn-worker")
      .maybeSingle();
    if (secretError || !runtimeSecret?.secret || !safeEqual(suppliedSecret, runtimeSecret.secret)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const workerControl = await loadWorkerControl(admin, "mia_learning");
    if (!workerControl.enabled) {
      return new Response(JSON.stringify({ processed: 0, reason: "worker_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca itens da fila com menos de MAX_ATTEMPTS tentativas
    const { data: queue, error } = await admin
      .from("mia_learn_queue")
      .select("id, conversation_id, organization_id, attempts")
      .lt("attempts", MAX_ATTEMPTS)
      .order("queued_at", { ascending: true })
      .limit(BATCH_SIZE * 10);

    if (error) throw new Error(`Queue read error: ${error.message}`);
    const runnableQueue = (queue ?? [])
      .filter((item) => workerCanRunFor(workerControl, item.organization_id))
      .slice(0, BATCH_SIZE);
    if (!runnableQueue.length) {
      return new Response(JSON.stringify({ processed: 0, reason: "queue_empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.allSettled(
      runnableQueue.map(async (item) => {
        const { data: miaEnabled } = await admin.rpc("organization_has_mia", {
          p_org_id: item.organization_id,
        });
        if (miaEnabled !== true) {
          await admin.from("mia_learn_queue").delete().eq("id", item.id);
          return { id: item.conversation_id, status: "skipped_plan" };
        }

        // Atualiza tentativa
        await admin.from("mia_learn_queue").update({
          attempts: item.attempts + 1,
          last_attempt_at: new Date().toISOString(),
        }).eq("id", item.id);

        // Chama mia-learn
        const res = await fetch(`${supabaseUrl}/functions/v1/mia-learn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            conversation_id: item.conversation_id,
            organization_id: item.organization_id,
          }),
        });

        const body = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);

        // Remove da fila (sucesso ou já processado)
        await admin.from("mia_learn_queue").delete().eq("id", item.id);

        return { id: item.conversation_id, status: body?.skipped ? "skipped" : "learned" };
      })
    );

    const learned  = results.filter(r => r.status === "fulfilled").length;
    const failures = results.filter(r => r.status === "rejected").length;

    console.log(`[mia-learn-worker] ${learned} processadas, ${failures} falhas`);

    return new Response(JSON.stringify({ processed: learned, failed: failures, total: runnableQueue.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[mia-learn-worker]", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
