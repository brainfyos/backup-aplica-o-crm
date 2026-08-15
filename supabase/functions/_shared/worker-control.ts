type SupabaseAdmin = {
  from: (table: string) => any;
};

export type WorkerControl = {
  enabled: boolean;
  pausedOrganizations: Set<string>;
};

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

/**
 * Após a migration, bloqueia chamadas públicas aos workers. Antes dela,
 * preserva o modo legado para permitir deploy de código antes do banco.
 */
export async function authorizePlatformWorker(admin: SupabaseAdmin, req: Request): Promise<boolean> {
  const { data, error } = await admin
    .from("platform_worker_runtime_config")
    .select("worker_secret")
    .eq("singleton", true)
    .maybeSingle();

  if (error) {
    const legacySchema = ["42P01", "PGRST204", "PGRST205"].includes(error.code ?? "");
    console.warn("[worker-auth] runtime config unavailable", error.message);
    return legacySchema;
  }
  const expected = data?.worker_secret ?? "";
  const supplied = req.headers.get("x-platform-worker-secret") ?? "";
  return !!expected && safeEqual(supplied, expected);
}

/**
 * Defesa em profundidade para workers acionados por cron, dispatcher ou chamada manual.
 * Durante rollout/Remix antigo, a ausência das tabelas mantém o comportamento legado.
 */
export async function loadWorkerControl(
  admin: SupabaseAdmin,
  workerKey: string,
): Promise<WorkerControl> {
  const { data: registry, error: registryError } = await admin
    .from("platform_worker_registry")
    .select("enabled")
    .eq("worker_key", workerKey)
    .maybeSingle();

  if (registryError) {
    console.warn(`[${workerKey}] worker controls unavailable; using legacy mode`, registryError.message);
    return { enabled: true, pausedOrganizations: new Set() };
  }

  const { data: paused, error: pausedError } = await admin
    .from("organization_worker_controls")
    .select("organization_id")
    .eq("worker_key", workerKey)
    .eq("is_paused", true);

  if (pausedError) {
    console.warn(`[${workerKey}] organization controls unavailable`, pausedError.message);
  }

  return {
    enabled: registry?.enabled !== false,
    pausedOrganizations: new Set((paused ?? []).map((row: any) => row.organization_id)),
  };
}

export function workerCanRunFor(control: WorkerControl, organizationId: string | null | undefined) {
  return control.enabled && !!organizationId && !control.pausedOrganizations.has(organizationId);
}
