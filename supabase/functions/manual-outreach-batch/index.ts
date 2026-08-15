// Batch sender — Etapa 5.
// Recebe { targets: [...] } onde cada target já vem com agent_id, instance_id,
// connection_type, extra_context, template_config e event_context resolvidos
// pelo campaign-dispatcher. Boota UMA vez, compartilha cliente Supabase e
// caches (agent + knowledge + widget) entre todos os targets.
//
// Vantagem: dispatcher passa de N fetches HTTP (1 por target) para 1 fetch
// por tick, e cada agent/knowledge é lido do banco uma única vez por execução.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createOutreachCache,
  processOutreachTarget,
  type OutreachTarget,
  type OutreachResult,
} from "../_shared/outreach-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONCURRENCY = 8;

type BatchTargetInput = OutreachTarget & {
  campaign_target_id?: string;
};

type BatchResult = OutreachResult & { campaign_target_id?: string };

async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = await Promise.all(tasks.slice(i, i + limit).map((fn) => fn()));
    results.push(...batch);
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const tickId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json() as { targets: BatchTargetInput[] };
    const targets = Array.isArray(body?.targets) ? body.targets : [];

    if (!targets.length) {
      return new Response(JSON.stringify({ results: [], tick_id: tickId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validação mínima
    const invalid = targets.find((t) => !t?.lead_id || !t?.agent_id || !t?.organization_id);
    if (invalid) {
      return new Response(JSON.stringify({ error: "Each target requires lead_id, agent_id, organization_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Guard de org ativa — agrupa por organization_id para evitar N consultas
    const { assertOrgActive } = await import("../_shared/org-status.ts");
    const orgIds = [...new Set(targets.map((t) => t.organization_id))];
    const blockedOrgs = new Set<string>();
    for (const orgId of orgIds) {
      const guard = await assertOrgActive(supabase, orgId);
      if (!guard.ok) blockedOrgs.add(orgId);
    }

    const cache = createOutreachCache();
    const results: BatchResult[] = new Array(targets.length);

    const tasks = targets.map((t, idx) => async () => {
      if (blockedOrgs.has(t.organization_id)) {
        results[idx] = {
          campaign_target_id: t.campaign_target_id,
          leadId: t.lead_id,
          error: "Organization inactive",
          code: "ORG_INACTIVE",
        };
        return;
      }
      const r = await processOutreachTarget(supabase, lovableApiKey, cache, t);
      results[idx] = { campaign_target_id: t.campaign_target_id, ...r };
    });

    await pLimit(tasks, CONCURRENCY);

    const sent = results.filter((r) => r.sent).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.sent && !r.skipped && r.error).length;

    console.log(JSON.stringify({
      tick_id: tickId,
      targets: targets.length,
      sent, skipped, failed,
      distinct_agents: new Set(targets.map((t) => t.agent_id)).size,
      distinct_orgs: orgIds.length,
      duration_ms: Date.now() - startedAt,
    }));

    return new Response(JSON.stringify({ results, tick_id: tickId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[manual-outreach-batch] fatal", err);
    return new Response(JSON.stringify({ error: String(err), tick_id: tickId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
