import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const requiredEdgeSecrets = [
  "AGENT_IMPORT_TOKEN",
  "LAUNCH_META_INSIGHTS_SECRET",
] as const;

type HealthPayload = Record<string, unknown> & {
  structural_healthy?: boolean;
  orphan_profiles?: { found?: number };
  runtime_config?: { found?: number };
  vault_secrets?: { expected?: number; found?: number };
};
type AdminClient = ReturnType<typeof createClient>;

function readStringField(value: unknown, field: string) {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === "string" ? candidate : null;
}

function withRuntimeReadiness(
  health: HealthPayload | null,
  runtimeBelongsToProject: boolean,
) {
  if (!health) return null;
  const missing = requiredEdgeSecrets.filter((name) => !Deno.env.get(name)?.trim());
  const edgeSecrets = {
    expected: requiredEdgeSecrets.length,
    found: requiredEdgeSecrets.length - missing.length,
    missing,
  };
  const runtimeConfig = {
    expected: 1,
    found: runtimeBelongsToProject && health.runtime_config?.found === 1 ? 1 : 0,
    missing: runtimeBelongsToProject ? [] : ["project_url"],
  };
  const operationalReady = Boolean(health.structural_healthy)
    && runtimeConfig.found === 1
    && Number(health.orphan_profiles?.found ?? -1) === 0
    && Number(health.vault_secrets?.found ?? -1)
      === Number(health.vault_secrets?.expected ?? 1)
    && missing.length === 0;
  return {
    ...health,
    runtime_config: runtimeConfig,
    edge_secrets: edgeSecrets,
    operational_ready: operationalReady,
    certified: operationalReady,
  };
}

async function runtimeBelongsToProject(admin: AdminClient, projectUrl: string) {
  const { data, error } = await admin
    .from("platform_worker_runtime_config")
    .select("project_url")
    .eq("singleton", true)
    .maybeSingle();
  if (error || !data?.project_url) return false;
  return String(data.project_url).replace(/\/$/, "") === projectUrl.replace(/\/$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Only super admins may inspect or repair the platform
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const isSuper = (roles || []).some((role: { role?: string }) => role.role === "super_admin");
    if (!isSuper) return json({ error: "Permissão negada" }, 403);

    let action = "report";
    try {
      const body = await req.json();
      if (body?.action === "repair") action = "repair";
    } catch {
      // no body -> report
    }

    if (action === "report") {
      const { data, error } = await admin.rpc("platform_health_report");
      if (error) return json({ error: error.message }, 500);
      const localRuntime = await runtimeBelongsToProject(admin, SUPABASE_URL);
      return json({
        ok: true,
        health: withRuntimeReadiness(data as HealthPayload, localRuntime),
      });
    }

    // Primeiro fecha o contrato estrutural perdido pelo snapshot do Remix.
    // A RPC não aceita SQL nem nomes de objetos como parâmetros.
    const { data: reconciliation, error: reconciliationError } = await admin.rpc(
      "reconcile_remix_database_contract",
    );
    if (reconciliationError) return json({ error: reconciliationError.message }, 500);

    // Em seguida recria somente os triggers e oito crons canônicos usando os
    // valores do próprio ambiente. Nenhuma URL/chave da matriz é copiada.
    const { data: bootstrap, error: bootstrapError } = await admin.rpc("ensure_platform_bootstrap", {
      p_project_url: SUPABASE_URL,
      p_anon_key: ANON_KEY,
    });
    if (bootstrapError) return json({ error: bootstrapError.message }, 500);

    // Nunca reutiliza o relatório anterior ao dispatcher: certifica o estado
    // final efetivamente materializado no banco.
    const { data: report, error: reportError } = await admin.rpc("platform_health_report");
    if (reportError) return json({ error: reportError.message }, 500);
    const localRuntime = await runtimeBelongsToProject(admin, SUPABASE_URL);
    const health = withRuntimeReadiness(report as HealthPayload, localRuntime);
    return json({
      ok: Boolean(health?.structural_healthy),
      result: {
        ok: Boolean(health?.structural_healthy),
        actions: [
          `database_contract:${readStringField(reconciliation, "contract_version") ?? "unknown"}`,
          "auth_triggers:2",
          "cron_jobs:8",
        ],
        errors: [],
        health,
      },
      reconciliation,
      bootstrap,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
