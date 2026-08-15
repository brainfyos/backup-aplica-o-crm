import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseEvolutionConnectionState } from "../_shared/evolution-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EvolutionConfig {
  url: string;
  globalApiKey: string;
}

/**
 * Reads the GLOBAL Evolution Go config from `platform_settings`.
 * This is the single source of truth — no longer per-organization.
 */
async function getPlatformConfig(supabase: any): Promise<EvolutionConfig | null> {
  const { data } = await supabase
    .from("platform_settings")
    .select("evolution_go_url, evolution_go_global_api_key")
    .limit(1)
    .maybeSingle();

  if (!data?.evolution_go_url || !data?.evolution_go_global_api_key) return null;

  return {
    url: String(data.evolution_go_url).replace(/\/$/, ""),
    globalApiKey: String(data.evolution_go_global_api_key),
  };
}

async function evoFetch(
  config: EvolutionConfig,
  path: string,
  init: RequestInit = {},
  instanceToken?: string
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: instanceToken || config.globalApiKey,
    ...(init.headers as Record<string, string> ?? {}),
  };
  let res: Response;
  try {
    res = await fetch(`${config.url}${path}`, { ...init, headers });
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      body: null,
      message: `Falha ao conectar em ${config.url}: ${err.message}`,
    };
  }
  const text = await res.text();
  let body: any;
  let isJson = false;
  try {
    body = text ? JSON.parse(text) : null;
    isJson = true;
  } catch {
    body = text;
    isJson = false;
  }
  let message: string | undefined;
  if (!res.ok) {
    if (!isJson && typeof body === "string") {
      message = `Servidor respondeu ${res.status}: ${body.slice(0, 200)}`;
    } else if (isJson && body?.message) {
      message = String(body.message);
    } else if (isJson && body?.error) {
      message = String(body.error);
    }
  }
  return { ok: res.ok, status: res.status, body, message, isJson };
}

function maskKey(k?: string | null): string {
  if (!k) return "(empty)";
  return k.length <= 8 ? "***" : `${k.slice(0, 5)}***${k.slice(-3)}`;
}

const ADVANCED_SETTING_KEYS = ["alwaysOnline", "rejectCall", "msgRejectCall", "readMessages"] as const;
const BEHAVIOR_SETTING_KEYS = ["ai_grouping_enabled", "ai_grouping_window_ms", "ai_grouping_max_ms", "presence_enabled"] as const;
const PROXY_SETTING_KEYS = ["protocol", "host", "port", "username", "password"] as const;
type ProxyProtocol = "http" | "https" | "socks4" | "socks5";

function hasOnlyKeys(value: unknown, allowed: readonly string[]): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).every((key) => allowed.includes(key));
}

function parseAdvancedSettings(value: unknown): Record<(typeof ADVANCED_SETTING_KEYS)[number], boolean | string> | null {
  if (!hasOnlyKeys(value, ADVANCED_SETTING_KEYS)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.alwaysOnline !== "boolean" ||
    typeof raw.rejectCall !== "boolean" ||
    typeof raw.msgRejectCall !== "string" || raw.msgRejectCall.length > 500 ||
    typeof raw.readMessages !== "boolean"
  ) return null;
  return {
    alwaysOnline: raw.alwaysOnline,
    rejectCall: raw.rejectCall,
    msgRejectCall: raw.msgRejectCall,
    readMessages: raw.readMessages,
  };
}

function parseBehaviorSettings(value: unknown): Record<(typeof BEHAVIOR_SETTING_KEYS)[number], boolean | number> | null {
  if (!hasOnlyKeys(value, BEHAVIOR_SETTING_KEYS)) return null;
  const raw = value as Record<string, unknown>;
  const windowMs = Number(raw.ai_grouping_window_ms);
  const maxMs = Number(raw.ai_grouping_max_ms);
  if (
    typeof raw.ai_grouping_enabled !== "boolean" ||
    !Number.isInteger(windowMs) || windowMs < 0 || windowMs > 8000 ||
    !Number.isInteger(maxMs) || maxMs < windowMs || maxMs > 8000 ||
    typeof raw.presence_enabled !== "boolean"
  ) return null;
  return {
    ai_grouping_enabled: raw.ai_grouping_enabled,
    ai_grouping_window_ms: windowMs,
    ai_grouping_max_ms: maxMs,
    presence_enabled: raw.presence_enabled,
  };
}

function parseProxySettings(value: unknown): {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username: string;
  password: string;
} | null {
  if (!hasOnlyKeys(value, PROXY_SETTING_KEYS)) return null;
  const raw = value as Record<string, unknown>;
  const protocol = String(raw.protocol || "").toLowerCase() as ProxyProtocol;
  const host = String(raw.host || "").trim();
  const port = Number(raw.port);
  const username = String(raw.username || "").trim();
  const password = String(raw.password || "");
  if (
    !(["http", "https", "socks4", "socks5"] as string[]).includes(protocol) ||
    !host || host.length > 253 || /[\s/@]/.test(host) ||
    !Number.isInteger(port) || port < 1 || port > 65535 ||
    username.length > 255 || password.length > 512 || Boolean(username) !== Boolean(password)
  ) return null;
  return { protocol, host, port, username, password };
}

type RemoteAdvancedSettings = {
  alwaysOnline: boolean;
  rejectCall: boolean;
  msgRejectCall: string;
  readMessages: boolean;
  ignoreGroups: boolean;
  ignoreStatus: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function parseRemoteAdvancedSettings(value: unknown): RemoteAdvancedSettings | null {
  const root = asRecord(value);
  const data = asRecord(root?.data);
  const source = asRecord(data?.advancedSettings) ?? asRecord(data?.settings) ?? data ??
    asRecord(root?.advancedSettings) ?? asRecord(root?.settings) ?? root;
  if (
    !source || typeof source !== "object" ||
    typeof source.alwaysOnline !== "boolean" ||
    typeof source.rejectCall !== "boolean" ||
    typeof source.msgRejectCall !== "string" ||
    typeof source.readMessages !== "boolean" ||
    typeof source.ignoreGroups !== "boolean" ||
    typeof source.ignoreStatus !== "boolean"
  ) return null;
  return {
    alwaysOnline: source.alwaysOnline,
    rejectCall: source.rejectCall,
    msgRejectCall: source.msgRejectCall,
    readMessages: source.readMessages,
    ignoreGroups: source.ignoreGroups,
    ignoreStatus: source.ignoreStatus,
  };
}

interface ManagedInstance {
  id: string;
  organization_id: string | null;
  instance_id: string | null;
  instance_token: string | null;
  ai_grouping_enabled: boolean | null;
  ai_grouping_window_ms: number | null;
  ai_grouping_max_ms: number | null;
  presence_enabled: boolean | null;
  proxy_configured: boolean | null;
  proxy_protocol: string | null;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_username: string | null;
  webhook_subscribed: boolean;
  metadata: unknown;
}

function pickAdvancedSettings(source: RemoteAdvancedSettings) {
  return {
    alwaysOnline: source.alwaysOnline,
    rejectCall: source.rejectCall,
    msgRejectCall: source.msgRejectCall,
    readMessages: source.readMessages,
  };
}

async function authorizeManagedInstance(
  supabase: SupabaseClient,
  userId: string,
  profileOrganizationId: string | null | undefined,
  isSuperAdmin: boolean,
  instanceId: string,
): Promise<{ instance: ManagedInstance | null; denied: Response | null }> {
  if (!instanceId) {
    return {
      instance: null,
      denied: new Response(JSON.stringify({ error: "Instância obrigatória." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const { data: instance, error } = await supabase
    .from("evolution_instances")
    .select("id, organization_id, instance_id, instance_token, ai_grouping_enabled, ai_grouping_window_ms, ai_grouping_max_ms, presence_enabled, proxy_configured, proxy_protocol, proxy_host, proxy_port, proxy_username, webhook_subscribed, metadata")
    .eq("id", instanceId)
    .maybeSingle();
  if (error || !instance) {
    return {
      instance: null,
      denied: new Response(JSON.stringify({ error: "Instância não encontrada." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  if (isSuperAdmin) return { instance, denied: null };
  if (!profileOrganizationId || instance.organization_id !== profileOrganizationId) {
    return {
      instance: null,
      denied: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const [{ data: hasAdmin }, { data: hasManager }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "manager" }),
  ]);
  if (!hasAdmin && !hasManager) {
    return {
      instance: null,
      denied: new Response(JSON.stringify({ error: "Apenas administradores ou gerentes podem gerenciar esta conexão." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  return { instance, denied: null };
}

function normalizeQrString(value: any): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length <= 20) return null;

  // Evolution Go may return "data:image/png;base64,...|2@raw-pairing".
  // The QR must encode only the raw pairing string; storing the combined value
  // creates a QR that looks valid visually but WhatsApp rejects it.
  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    const afterPipe = raw.slice(pipeIndex + 1).trim();
    if (afterPipe.length > 20) return afterPipe;
    const beforePipe = raw.slice(0, pipeIndex).trim();
    if (beforePipe.length > 20) return beforePipe;
  }

  return raw;
}

function extractQr(obj: any): string | null {
  if (!obj) return null;
  const normalized = normalizeQrString(obj);
  if (normalized) return normalized;

  const candidates = [
    obj.qrcode, obj.qr, obj.base64, obj.code, obj.QRCode, obj.qr_code,
    obj?.qrcode?.base64, obj?.qrcode?.code,
    obj?.data?.qrcode, obj?.data?.qr, obj?.data?.base64, obj?.data?.QRCode, obj?.data?.code,
    obj?.data?.qrcode?.base64, obj?.data?.qrcode?.code,
    obj?.instance?.qrcode, obj?.instance?.qr,
  ];
  for (const c of candidates) {
    const found = extractQr(c);
    if (found) return found;
  }
  return null;
}

async function configureWebhook(
  config: EvolutionConfig,
  instanceUuid: string,
  instanceToken: string | null | undefined,
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string; status?: number; response?: any }> {
  if (!instanceToken) {
    return {
      ok: false,
      error:
        "Token da instância ausente. Clique em 'Sincronizar do servidor' para reimportar o token desta instância.",
    };
  }

  console.log(
    `[configureWebhook] uuid=${instanceUuid} apikey=${maskKey(instanceToken)} (instance token)`,
  );

  const primary = await evoFetch(
    config,
    `/instance/connect`,
    {
      method: "POST",
      headers: { instanceId: instanceUuid },
      body: JSON.stringify({
        webhookUrl,
        subscribe: ["ALL"],
        immediate: false,
      }),
    },
    instanceToken,
  );

  console.log(
    `[configureWebhook] uuid=${instanceUuid} status=${primary.status} ok=${primary.ok}`,
    typeof primary.body === "string" ? primary.body.slice(0, 200) : primary.body,
  );

  if (primary.ok) {
    return { ok: true, status: primary.status, response: primary.body };
  }

  const fallback = await evoFetch(
    config,
    `/instance/connect`,
    {
      method: "POST",
      body: JSON.stringify({
        instanceId: instanceUuid,
        webhookUrl,
        subscribe: ["ALL"],
        immediate: false,
      }),
    },
    instanceToken,
  );

  if (fallback.ok) {
    return { ok: true, status: fallback.status, response: fallback.body };
  }

  return {
    ok: false,
    status: primary.status,
    error:
      primary.message ||
      fallback.message ||
      `Falha ao configurar webhook (status ${primary.status}).`,
    response: primary.body ?? fallback.body,
  };
}

function parseInstanceFromList(item: any) {
  const name: string = item?.name || item?.instanceName || item?.instance?.instanceName;
  const uuid: string | null = item?.id ?? item?.instanceId ?? item?.instance?.id ?? null;
  const token = item?.token ?? item?.apikey ?? item?.hash?.apikey ?? null;
  const jid: string | null = item?.jid ?? item?.owner ?? null;
  const phoneRaw = jid
    ? String(jid).split("@")[0].split(":")[0]
    : (item?.number ?? item?.phoneNumber ?? null);
  const phone = phoneRaw ? String(phoneRaw).replace(/\D/g, "") : null;
  const qrcode = extractQr(item?.qrcode ?? item?.qr ?? item);
  const connected =
    item?.connected === true ||
    item?.connectionStatus === "open" ||
    item?.state === "open" ||
    item?.status === "open" ||
    item?.instance?.state === "open";
  const status = connected
    ? "connected"
    : (qrcode && String(qrcode).length > 10 ? "qr_pending" : "disconnected");
  return { name, uuid, token, phone, qrcode, connected, status };
}

type RemoteInstanceStatus = {
  connected: boolean | null;
  phone: string | null;
  qrcode: string | null;
};

function parseRemoteInstanceStatus(value: unknown): RemoteInstanceStatus {
  const root = asRecord(value);
  const data = asRecord(root?.data);
  const instance = asRecord(data?.instance) ?? asRecord(root?.instance);
  const sources = [data, instance, root].filter((item): item is Record<string, unknown> => !!item);

  const jid = sources
    .map((source) => source.JID ?? source.jid ?? source.owner ?? source.phoneNumber ?? source.number)
    .find((candidate) => typeof candidate === "string" || typeof candidate === "number");
  const phone = jid == null ? null : String(jid).split("@")[0].split(":")[0].replace(/\D/g, "") || null;

  return { connected: parseEvolutionConnectionState(value), phone, qrcode: extractQr(value) };
}

async function fetchRemoteInstanceStatus(
  config: EvolutionConfig,
  remoteId: string,
  instanceToken: string,
): Promise<{ ok: boolean; status: RemoteInstanceStatus; httpStatus: number }> {
  const official = await evoFetch(config, "/instance/status", { method: "GET" }, instanceToken);
  let officialStatus: RemoteInstanceStatus | null = null;
  if (official.ok) {
    officialStatus = parseRemoteInstanceStatus(official.body);
    if (officialStatus.connected !== null || officialStatus.qrcode) {
      return { ok: true, status: officialStatus, httpStatus: official.status };
    }
  }

  // Compatibility with older Evolution Go installations that exposed instance
  // state through the instance-specific route.
  const legacy = await evoFetch(
    config,
    `/instance/${encodeURIComponent(remoteId)}`,
    { method: "GET" },
    instanceToken,
  );
  const legacyStatus = parseRemoteInstanceStatus(legacy.body);
  if (legacy.ok && (legacyStatus.connected !== null || legacyStatus.qrcode)) {
    return {
      ok: true,
      status: {
        connected: legacyStatus.connected ?? officialStatus?.connected ?? null,
        phone: legacyStatus.phone ?? officialStatus?.phone ?? null,
        qrcode: legacyStatus.qrcode ?? officialStatus?.qrcode ?? null,
      },
      httpStatus: legacy.status,
    };
  }
  return {
    ok: false,
    status: legacyStatus,
    httpStatus: legacy.status,
  };
}

type InstanceConnectionSnapshot = {
  id: string;
  status: string;
  qr_code: string | null;
  updated_at: string;
};

async function updateInstanceConnectionState(
  supabase: SupabaseClient,
  instanceId: string,
  expectedUpdatedAt: string,
  changes: Record<string, unknown>,
): Promise<{ applied: boolean; state: InstanceConnectionSnapshot | null; error: string | null }> {
  const { data: updated, error: updateError } = await supabase
    .from("evolution_instances")
    .update(changes)
    .eq("id", instanceId)
    .eq("updated_at", expectedUpdatedAt)
    .select("id, status, qr_code, updated_at")
    .maybeSingle();
  if (updateError) return { applied: false, state: null, error: updateError.message };
  if (updated) return { applied: true, state: updated, error: null };

  const { data: current, error: readError } = await supabase
    .from("evolution_instances")
    .select("id, status, qr_code, updated_at")
    .eq("id", instanceId)
    .maybeSingle();
  return { applied: false, state: current, error: readError?.message ?? null };
}

function currentInstanceStateResponse(state: InstanceConnectionSnapshot | null): Response {
  const connected = state?.status === "connected" || state?.status === "paired";
  return new Response(JSON.stringify({
    ok: true,
    qr_code: state?.qr_code ?? null,
    already_connected: connected,
    concurrent_update: true,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function connectionWriteErrorResponse(): Response {
  return new Response(JSON.stringify({ ok: false, error: "Falha ao atualizar o estado local da conexao." }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    // Check super admin role
    const { data: superAdminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuperAdmin = !!superAdminRow;

    const body = req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
      ? await req.json().catch(() => ({}))
      : {};
    const action = body.action || new URL(req.url).searchParams.get("action");

    const requireSuperAdmin = () => {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Apenas o Super Admin da plataforma pode executar essa ação." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return null;
    };

    // ---- TEST_CONNECTION (super admin) ----
    if (action === "test_connection") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const url = String(body.url || "").replace(/\/$/, "");
      const globalApiKey = String(body.globalApiKey || "");
      if (!url || !globalApiKey) {
        return new Response(JSON.stringify({ error: "Missing url or globalApiKey" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cfg = { url, globalApiKey };
      const res = await evoFetch(cfg, "/instance/all", { method: "GET" });

      if (res.ok) {
        return new Response(
          JSON.stringify({ ok: true, status: res.status, message: "Conexão estabelecida com sucesso!", data: res.body }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (res.status === 401 || res.status === 403) {
        return new Response(
          JSON.stringify({ ok: false, status: res.status, message: "Servidor acessível, mas a Global API Key foi rejeitada." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: false, status: res.status, message: res.message || `Erro ${res.status} ao conectar.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For all other actions, load global platform config
    const config = await getPlatformConfig(supabase);
    if (!config) {
      return new Response(
        JSON.stringify({ error: "Servidor Evolution Go ainda não foi configurado pelo administrador da plataforma." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const managedInstanceActions = [
      "get_instance_settings",
      "update_instance_settings",
      "set_instance_proxy",
      "remove_instance_proxy",
      "subscribe_webhook",
    ];
    let managedInstance: ManagedInstance | null = null;
    if (managedInstanceActions.includes(action)) {
      const authorization = await authorizeManagedInstance(
        supabase,
        user.id,
        profile?.organization_id,
        isSuperAdmin,
        String(body.id || "").trim(),
      );
      if (authorization.denied) return authorization.denied;
      managedInstance = authorization.instance;
    }

    // ---- ORG-SCOPED INSTANCE SETTINGS ----
    if (["get_instance_settings", "update_instance_settings", "set_instance_proxy", "remove_instance_proxy"].includes(action)) {
      const inst = managedInstance;
      if (!inst) {
        return new Response(JSON.stringify({ error: "InstÃ¢ncia nÃ£o encontrada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const metadata = asRecord(inst.metadata) ?? {};
      const remoteId = String(inst.instance_id || metadata.instance_uuid || "").trim();
      const instanceToken = inst.instance_token || (typeof metadata.instance_token === "string" ? metadata.instance_token : null);
      if (!remoteId || !instanceToken) {
        return new Response(JSON.stringify({ error: "Instância sem identificador/token no servidor. Solicite uma sincronização." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "get_instance_settings") {
        const advancedRes = await evoFetch(config, `/instance/${encodeURIComponent(remoteId)}/advanced-settings`, { method: "GET" }, instanceToken);
        const remoteAdvanced = advancedRes.ok ? parseRemoteAdvancedSettings(advancedRes.body) : null;
        if (!remoteAdvanced) {
          return new Response(JSON.stringify({ error: "Não foi possível carregar as configurações Evolution desta instância." }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({
          ok: true,
          behavior: {
            ai_grouping_enabled: inst.ai_grouping_enabled ?? true,
            ai_grouping_window_ms: inst.ai_grouping_window_ms ?? 3000,
            ai_grouping_max_ms: inst.ai_grouping_max_ms ?? 8000,
            presence_enabled: inst.presence_enabled ?? true,
          },
          advanced: pickAdvancedSettings(remoteAdvanced),
          proxy: {
            configured: inst.proxy_configured === true,
            protocol: inst.proxy_protocol,
            host: inst.proxy_host,
            port: inst.proxy_port,
            username: inst.proxy_username,
          },
          webhook: { configured: inst.webhook_subscribed === true },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "update_instance_settings") {
        const behavior = parseBehaviorSettings(body.behavior);
        const advanced = parseAdvancedSettings(body.advanced);
        if (!behavior || !advanced) {
          return new Response(JSON.stringify({ error: "Configurações inválidas." }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const currentRes = await evoFetch(
          config,
          `/instance/${encodeURIComponent(remoteId)}/advanced-settings`,
          { method: "GET" },
          instanceToken,
        );
        const currentAdvanced = currentRes.ok ? parseRemoteAdvancedSettings(currentRes.body) : null;
        if (!currentAdvanced) {
          return new Response(JSON.stringify({ error: "Não foi possível validar as configurações atuais do Evolution." }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const remoteAdvanced: RemoteAdvancedSettings = {
          ...currentAdvanced,
          ...advanced,
        };
        const remoteRes = await evoFetch(
          config,
          `/instance/${encodeURIComponent(remoteId)}/advanced-settings`,
          { method: "PUT", body: JSON.stringify(remoteAdvanced) },
          instanceToken,
        );
        if (!remoteRes.ok) {
          return new Response(JSON.stringify({ error: "O servidor Evolution rejeitou as configurações permitidas." }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error: updateErr } = await supabase.from("evolution_instances").update(behavior).eq("id", inst.id);
        if (updateErr) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Evolution atualizado, mas o resumo local não pôde ser salvo. Recarregue antes de tentar novamente.",
            code: "LOCAL_SUMMARY_UPDATE_FAILED",
            partial: true,
          }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "set_instance_proxy") {
        const rawProxy = body.proxy && typeof body.proxy === "object" ? body.proxy as Record<string, unknown> : {};
        const hasUsername = String(rawProxy.username || "").trim().length > 0;
        const hasPassword = String(rawProxy.password || "").length > 0;
        if (hasUsername !== hasPassword) {
          return new Response(JSON.stringify({ error: "Informe usuário e senha juntos, ou deixe ambos vazios para usar um proxy sem autenticação." }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const proxy = parseProxySettings(body.proxy);
        if (!proxy) {
          return new Response(JSON.stringify({ error: "Proxy inválido." }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const remoteProxy = {
          protocol: proxy.protocol,
          host: proxy.host,
          port: String(proxy.port),
          username: proxy.username,
          password: proxy.password,
        };
        const remoteRes = await evoFetch(
          config,
          `/instance/proxy/${encodeURIComponent(remoteId)}`,
          { method: "POST", body: JSON.stringify(remoteProxy) },
        );
        if (!remoteRes.ok) {
          return new Response(JSON.stringify({ error: "O servidor Evolution rejeitou a configuração de proxy." }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error: updateErr } = await supabase.from("evolution_instances").update({
          proxy_configured: true,
          proxy_protocol: proxy.protocol,
          proxy_host: proxy.host,
          proxy_port: proxy.port,
          proxy_username: proxy.username || null,
        }).eq("id", inst.id);
        if (updateErr) {
          return new Response(JSON.stringify({
            ok: false,
            error: "Proxy atualizado, mas o resumo local não pôde ser salvo. Recarregue antes de tentar novamente.",
            code: "LOCAL_PROXY_SUMMARY_UPDATE_FAILED",
            partial: true,
          }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, proxy: {
          configured: true,
          protocol: proxy.protocol,
          host: proxy.host,
          port: proxy.port,
          username: proxy.username || null,
        } }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const remoteRes = await evoFetch(
        config,
        `/instance/proxy/${encodeURIComponent(remoteId)}`,
        { method: "DELETE" },
      );
      const alreadyAbsent = remoteRes.status === 404;
      if (!remoteRes.ok && !alreadyAbsent) {
        return new Response(JSON.stringify({ error: "O servidor Evolution não removeu o proxy." }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: updateErr } = await supabase.from("evolution_instances").update({
        proxy_configured: false,
        proxy_protocol: null,
        proxy_host: null,
        proxy_port: null,
        proxy_username: null,
      }).eq("id", inst.id);
      if (updateErr) {
        return new Response(JSON.stringify({
          ok: false,
          error: "Proxy removido, mas o resumo local não pôde ser limpo. Recarregue antes de tentar novamente.",
          code: "LOCAL_PROXY_CLEAR_FAILED",
          partial: true,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, already_absent: alreadyAbsent, proxy: { configured: false } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- CREATE INSTANCE (super admin only) ----
    if (action === "create_instance") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const name = String(body.name || "").trim();
      const targetOrgId = String(body.organization_id || "").trim();
      if (!name || !targetOrgId) {
        return new Response(JSON.stringify({ error: "Missing name or organization_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Evolution Go requires both `name` and `token` (instance API key) in the body.
      // We generate a UUID v4 and use it as the instance token so we always have it
      // even if the server response doesn't echo it back.
      const generatedToken = crypto.randomUUID();
      console.log(`[create_instance] -> POST /instance/create name="${name}" org=${targetOrgId} token=${maskKey(generatedToken)}`);
      const createRes = await evoFetch(config, "/instance/create", {
        method: "POST",
        body: JSON.stringify({ name, token: generatedToken }),
      });
      console.log(
        `[create_instance] <- status=${createRes.status} ok=${createRes.ok}`,
        typeof createRes.body === "string" ? createRes.body.slice(0, 300) : createRes.body,
      );
      if (!createRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: createRes.message || `Falha ao criar instância (status ${createRes.status})`, response: createRes.body }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Evolution Go responde: { data: { id, name, token, ... }, message: "success" }
      const created = createRes.body?.data ?? createRes.body?.instance ?? createRes.body ?? {};
      const uuid = created?.id ?? created?.instanceId ?? created?.uuid ?? null;
      const instanceToken = created?.token ?? created?.hash?.apikey ?? created?.apikey ?? generatedToken;
      console.log(`[create_instance] parsed uuid=${uuid} token=${maskKey(instanceToken)}`);

      if (!uuid) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Servidor criou a instância mas não retornou UUID. Verifique a versão do Evolution Go.",
            response: createRes.body,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Persist in DB linked to the chosen organization
      const { data: inserted, error: insErr } = await supabase
        .from("evolution_instances")
        .insert({
          organization_id: targetOrgId,
          name,
          instance_id: uuid || name,
          instance_token: instanceToken,
          status: "disconnected",
          is_default: false,
          created_by_super_admin: true,
          metadata: {
            instance_uuid: uuid,
            instance_name: name,
            created_via: "super_admin",
            remote: createRes.body,
          },
        })
        .select()
        .single();

      if (insErr) {
        return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Best-effort: configure webhook now
      if (uuid && instanceToken) {
        const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
        const wh = await configureWebhook(config, uuid, instanceToken, webhookUrl);
        await supabase
          .from("evolution_instances")
          .update({
            webhook_subscribed: wh.ok,
            metadata: {
              ...((inserted.metadata as any) || {}),
              webhook_error: wh.ok ? null : wh.error,
              webhook_last_attempt_at: new Date().toISOString(),
            },
          })
          .eq("id", inserted.id);
      }

      return new Response(JSON.stringify({ ok: true, instance: inserted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- CREATE INSTANCE SELF-SERVICE (admin/manager da org) ----
    // Cliente cria instância para a própria empresa, respeitando o limite do plano.
    if (action === "create_instance_self") {
      // Authorization: precisa ser admin ou manager da organização
      if (!profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Usuário sem empresa vinculada." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: hasAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id, _role: "admin",
      });
      const { data: hasManager } = await supabase.rpc("has_role", {
        _user_id: user.id, _role: "manager",
      });
      if (!isSuperAdmin && !hasAdmin && !hasManager) {
        return new Response(JSON.stringify({ error: "Apenas administradores ou gerentes podem criar conexões." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const orgId = profile.organization_id;
      const rawName = String(body.name || "").trim().toLowerCase();

      // Sanitiza: somente letras minúsculas, números e hífens; 3-40 chars
      if (!/^[a-z0-9-]{3,40}$/.test(rawName)) {
        return new Response(JSON.stringify({
          error: "Nome inválido. Use apenas letras minúsculas, números e hífens (3 a 40 caracteres).",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verifica limites efetivos
      const { data: limitsData, error: limitsErr } = await supabase.rpc("get_organization_effective_limits", {
        p_org_id: orgId,
      });
      if (limitsErr) {
        return new Response(JSON.stringify({ error: "Falha ao carregar limites do plano: " + limitsErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const maxConnections: number = (limitsData as any)?.limits?.max_connections ?? 1;

      const { count: currentCount } = await supabase
        .from("evolution_instances")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId);

      if ((currentCount ?? 0) >= maxConnections) {
        return new Response(JSON.stringify({
          ok: false,
          error: `Limite de ${maxConnections} conexão(ões) do seu plano atingido. Faça upgrade para criar mais.`,
          limit_reached: true,
          current: currentCount,
          limit: maxConnections,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Busca slug da org para prefixar nome (evita colisão global no Evolution Go)
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("slug, name")
        .eq("id", orgId)
        .maybeSingle();
      const orgSlug = (orgRow?.slug || (orgRow?.name || "org")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20)) || "org";
      const finalName = `${orgSlug}-${rawName}`.slice(0, 50);

      // Verifica se já existe localmente uma instância com esse nome
      const { data: dup } = await supabase
        .from("evolution_instances")
        .select("id")
        .eq("name", finalName)
        .maybeSingle();
      if (dup) {
        return new Response(JSON.stringify({
          error: "Já existe uma conexão com esse nome. Escolha outro.",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const generatedToken = crypto.randomUUID();
      console.log(`[create_instance_self] -> POST /instance/create name="${finalName}" org=${orgId} token=${maskKey(generatedToken)}`);
      const createRes = await evoFetch(config, "/instance/create", {
        method: "POST",
        body: JSON.stringify({ name: finalName, token: generatedToken }),
      });
      console.log(
        `[create_instance_self] <- status=${createRes.status} ok=${createRes.ok}`,
        typeof createRes.body === "string" ? createRes.body.slice(0, 300) : createRes.body,
      );

      if (!createRes.ok) {
        return new Response(JSON.stringify({
          ok: false,
          error: createRes.message || `Falha ao criar instância (status ${createRes.status})`,
          response: createRes.body,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const created = createRes.body?.data ?? createRes.body?.instance ?? createRes.body ?? {};
      const uuid = created?.id ?? created?.instanceId ?? created?.uuid ?? null;
      const instanceToken = created?.token ?? created?.hash?.apikey ?? created?.apikey ?? generatedToken;

      if (!uuid) {
        return new Response(JSON.stringify({
          ok: false,
          error: "Servidor criou a instância mas não retornou UUID.",
          response: createRes.body,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: inserted, error: insErr } = await supabase
        .from("evolution_instances")
        .insert({
          organization_id: orgId,
          name: finalName,
          instance_id: uuid || finalName,
          instance_token: instanceToken,
          status: "disconnected",
          is_default: (currentCount ?? 0) === 0, // primeira da empresa = padrão
          created_by_super_admin: false,
          metadata: {
            instance_uuid: uuid,
            instance_name: finalName,
            display_name: rawName,
            created_via: "self_service",
            remote: createRes.body,
          },
        })
        .select()
        .single();

      if (insErr) {
        return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Configura webhook (best-effort)
      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
      const wh = await configureWebhook(config, uuid, instanceToken, webhookUrl);
      await supabase
        .from("evolution_instances")
        .update({
          webhook_subscribed: wh.ok,
          metadata: {
            ...((inserted.metadata as any) || {}),
            webhook_error: wh.ok ? null : wh.error,
            webhook_last_attempt_at: new Date().toISOString(),
          },
        })
        .eq("id", inserted.id);

      return new Response(JSON.stringify({ ok: true, instance: inserted }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- RENAME INSTANCE (org admin/manager OR super admin) ----
    // Apenas atualiza o display_name local (Evolution Go não suporta rename).
    if (action === "rename_instance_self") {
      const id = String(body.id || "");
      const rawName = String(body.name || "").trim();
      if (!id || !rawName) {
        return new Response(JSON.stringify({ error: "Parâmetros inválidos." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (rawName.length < 2 || rawName.length > 60) {
        return new Response(JSON.stringify({ error: "Nome deve ter entre 2 e 60 caracteres." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: inst } = await supabase
        .from("evolution_instances")
        .select("organization_id, metadata")
        .eq("id", id)
        .maybeSingle();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instância não encontrada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Sem permissão." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newMeta = { ...((inst.metadata as any) || {}), display_name: rawName };
      const { error } = await supabase
        .from("evolution_instances")
        .update({ metadata: newMeta })
        .eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DELETE INSTANCE SELF (org admin/manager) ----
    // Mesma lógica de delete_instance, mas escopada à organização do usuário.
    if (action === "delete_instance_self") {
      if (!profile?.organization_id && !isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Usuário sem empresa vinculada." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: hasAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      const { data: hasManager } = await supabase.rpc("has_role", { _user_id: user.id, _role: "manager" });
      if (!isSuperAdmin && !hasAdmin && !hasManager) {
        return new Response(JSON.stringify({ error: "Apenas administradores ou gerentes podem excluir conexões." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const id = String(body.id || "");
      const { data: inst } = await supabase
        .from("evolution_instances")
        .select("organization_id, name, metadata")
        .eq("id", id)
        .maybeSingle();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instância não encontrada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Sem permissão." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const uuid = (inst.metadata as any)?.instance_uuid;
      if (uuid) {
        await evoFetch(config, `/instance/delete/${uuid}`, { method: "DELETE" }).catch(() => null);
      } else if (inst.name) {
        await evoFetch(config, `/instance/delete/${inst.name}`, { method: "DELETE" }).catch(() => null);
      }

      const { error } = await supabase.from("evolution_instances").delete().eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- REFRESH INSTANCE STATUSES (current organization only) ----
    if (action === "refresh_instance_statuses") {
      const organizationId = profile?.organization_id;
      if (!organizationId) {
        return new Response(JSON.stringify({ error: "Usuario sem empresa vinculada." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [{ data: hasAdmin }, { data: hasManager }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: user.id, _role: "manager" }),
      ]);
      if (!isSuperAdmin && !hasAdmin && !hasManager) {
        return new Response(JSON.stringify({ error: "Apenas administradores ou gerentes podem atualizar conexoes." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: orgInstances, error: listError } = await supabase
        .from("evolution_instances")
        .select("id, instance_id, instance_token, phone_number, status, qr_code, qr_code_updated_at, updated_at, metadata")
        .eq("organization_id", organizationId);
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let updated = 0;
      let unchanged = 0;
      let failed = 0;
      for (const instance of orgInstances ?? []) {
        const metadata = asRecord(instance.metadata);
        const remoteId = String(metadata?.instance_uuid ?? instance.instance_id ?? "").trim();
        const instanceToken = String(instance.instance_token ?? metadata?.instance_token ?? "").trim();
        if (!remoteId || !instanceToken) {
          failed += 1;
          continue;
        }

        const remote = await fetchRemoteInstanceStatus(config, remoteId, instanceToken);
        if (!remote.ok || remote.status.connected === null) {
          // Provider/network failures preserve the last known local state.
          failed += 1;
          continue;
        }

        const now = new Date().toISOString();
        const qrUpdatedAt = instance.qr_code_updated_at ? Date.parse(instance.qr_code_updated_at) : 0;
        const hasFreshLocalQr = Boolean(instance.qr_code) && Date.now() - qrUpdatedAt < 120_000;
        const nextStatus = remote.status.connected
          ? "connected"
          : (hasFreshLocalQr ? "qr_pending" : "disconnected");
        const changes: Record<string, unknown> = { status: nextStatus };
        if (remote.status.phone && remote.status.phone !== instance.phone_number) {
          changes.phone_number = remote.status.phone;
        }
        if (remote.status.connected) {
          changes.qr_code = null;
          changes.qr_code_updated_at = null;
          if (instance.status !== "connected") changes.last_connected_at = now;
        } else if (!hasFreshLocalQr) {
          changes.qr_code = null;
          changes.qr_code_updated_at = null;
        }

        const needsUpdate = nextStatus !== instance.status ||
          (remote.status.connected && Boolean(instance.qr_code)) ||
          (remote.status.phone !== null && remote.status.phone !== instance.phone_number);
        if (!needsUpdate) {
          unchanged += 1;
          continue;
        }
        const { data: updatedInstance, error: updateError } = await supabase
          .from("evolution_instances")
          .update(changes)
          .eq("id", instance.id)
          .eq("organization_id", organizationId)
          .eq("updated_at", instance.updated_at)
          .select("id")
          .maybeSingle();
        if (updateError) failed += 1;
        else if (!updatedInstance) unchanged += 1;
        else updated += 1;
      }

      return new Response(JSON.stringify({ ok: true, updated, unchanged, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- CONNECT INSTANCE (returns QR code) ----
    if (action === "connect_instance") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("evolution_instances")
        .select("id, name, instance_id, instance_token, organization_id, status, qr_code, updated_at, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Authorization: must belong to org OR be super_admin
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const meta: any = inst.metadata || {};
      const uuid: string | null = meta.instance_uuid || inst.instance_id || null;
      const instanceToken = inst.instance_token || meta.instance_token || null;

      if (!uuid || !instanceToken) {
        return new Response(JSON.stringify({ error: "Instância sem UUID ou token. Solicite ao Super Admin para sincronizar do servidor." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Strategy:
      // 1) Check current connection state on the server.
      //    - connected/open => already connected, just sync DB and return.
      //    - qr present     => store the SERVER QR exactly as returned now.
      //    - otherwise      => POST /instance/connect to trigger a fresh QR.
      // Never force logout here: it invalidates the active QR/session cycle on
      // Evolution Go and makes the panel show a QR that WhatsApp no longer accepts.

      // (1) Check current state
      try {
        const info = await fetchRemoteInstanceStatus(config, uuid, instanceToken);
        if (info.ok && info.status.connected === true) {
          const write = await updateInstanceConnectionState(
            supabase,
            inst.id,
            inst.updated_at,
            {
              status: "connected",
              qr_code: null,
              qr_code_updated_at: null,
              last_connected_at: new Date().toISOString(),
              ...(info.status.phone ? { phone_number: info.status.phone } : {}),
            },
          );
          if (write.error) return connectionWriteErrorResponse();
          if (!write.applied) return currentInstanceStateResponse(write.state);
          return new Response(
            JSON.stringify({ ok: true, qr_code: null, already_connected: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const existingQr = info.status.qrcode;
        if (info.ok && existingQr) {
          const write = await updateInstanceConnectionState(
            supabase,
            inst.id,
            inst.updated_at,
            {
              status: "qr_pending",
              qr_code: existingQr,
              qr_code_updated_at: new Date().toISOString(),
              webhook_subscribed: true,
            },
          );
          if (write.error) return connectionWriteErrorResponse();
          if (!write.applied) return currentInstanceStateResponse(write.state);
          return new Response(
            JSON.stringify({ ok: true, qr_code: existingQr, reused_server_qr: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (e) {
        console.warn(`[connect_instance] info check failed (continuing): ${e}`);
      }

      // Clear stale QR locally before asking Evolution Go for a new one.
      const pendingWrite = await updateInstanceConnectionState(
        supabase,
        inst.id,
        inst.updated_at,
        {
          status: "qr_pending",
          qr_code: null,
          qr_code_updated_at: null,
        },
      );
      if (pendingWrite.error) return connectionWriteErrorResponse();
      if (!pendingWrite.applied) return currentInstanceStateResponse(pendingWrite.state);
      const expectedUpdatedAt = pendingWrite.state!.updated_at;

      // Connect — this triggers QRCode/QRCODE_UPDATED webhook and may also return QR inline.
      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
      const res = await evoFetch(
        config,
        `/instance/connect`,
        {
          method: "POST",
          headers: { instanceId: uuid },
          body: JSON.stringify({ webhookUrl, subscribe: ["ALL"], immediate: true }),
        },
        instanceToken,
      );

      if (!res.ok) {
        return new Response(JSON.stringify({ ok: false, error: res.message || `Erro ${res.status}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let qrString = extractQr(res.body);

      // (5) If QR not inline, poll the instance state up to ~6s — Evolution Go often
      //     returns the QR inside GET /instance/{uuid} a second after connect.
      if (!qrString) {
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const info = await fetchRemoteInstanceStatus(config, uuid, instanceToken);
            if (info.ok && info.status.connected === true) {
              const write = await updateInstanceConnectionState(
                supabase,
                inst.id,
                expectedUpdatedAt,
                {
                  status: "connected",
                  qr_code: null,
                  qr_code_updated_at: null,
                  last_connected_at: new Date().toISOString(),
                  ...(info.status.phone ? { phone_number: info.status.phone } : {}),
                },
              );
              if (write.error) return connectionWriteErrorResponse();
              if (!write.applied) return currentInstanceStateResponse(write.state);
              return new Response(
                JSON.stringify({ ok: true, qr_code: null, already_connected: true }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }
            const found = info.status.qrcode;
            if (found) {
              qrString = found;
              break;
            }
          } catch (e) {
            console.warn(`[connect_instance] poll info error: ${e}`);
          }
        }
      }

      if (qrString) {
        const write = await updateInstanceConnectionState(
          supabase,
          inst.id,
          expectedUpdatedAt,
          {
            status: "qr_pending",
            qr_code: qrString,
            qr_code_updated_at: new Date().toISOString(),
            webhook_subscribed: true,
          },
        );
        if (write.error) return connectionWriteErrorResponse();
        if (!write.applied) return currentInstanceStateResponse(write.state);
      } else {
        await supabase
          .from("evolution_instances")
          .update({ webhook_subscribed: true })
          .eq("id", inst.id);
      }

      return new Response(JSON.stringify({ ok: true, qr_code: qrString, response: res.body }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- SYNC INSTANCES (super admin only) ----
    // Optionally pass organization_id to restrict assignment of new ones
    if (action === "sync_instances") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const targetOrgId = String(body.organization_id || "").trim() || null;

      const res = await evoFetch(config, "/instance/all", { method: "GET" });
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: res.message || `Erro ${res.status} ao listar instâncias` }),
          { status: res.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const list: any[] = Array.isArray(res.body)
        ? res.body
        : (res.body?.data ?? res.body?.instances ?? []);

      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
      let imported = 0;
      let updated = 0;
      let webhooksOk = 0;
      let webhooksFailed = 0;
      const results: any[] = [];

      for (const item of list) {
        const parsed = parseInstanceFromList(item);
        if (!parsed.name) continue;

        let webhookRes: { ok: boolean; error?: string; status?: number; response?: any };
        if (!parsed.uuid) {
          webhookRes = { ok: false, error: "Servidor não retornou UUID." };
        } else if (!parsed.token) {
          webhookRes = { ok: false, error: "Servidor não retornou token da instância." };
        } else {
          webhookRes = await configureWebhook(config, parsed.uuid, parsed.token, webhookUrl);
        }
        if (webhookRes.ok) webhooksOk++; else webhooksFailed++;

        // Match by name across ALL orgs (super admin scope)
        const { data: existing } = await supabase
          .from("evolution_instances")
          .select("id, organization_id")
          .eq("name", parsed.name)
          .maybeSingle();

        const baseRow: any = {
          instance_id: parsed.uuid || parsed.name,
          instance_token: parsed.token,
          phone_number: parsed.phone,
          status: parsed.status,
          qr_code: parsed.connected ? null : parsed.qrcode,
          qr_code_updated_at: !parsed.connected && parsed.qrcode ? new Date().toISOString() : null,
          last_connected_at: parsed.connected ? new Date().toISOString() : null,
          webhook_subscribed: webhookRes.ok,
          metadata: {
            synced_from: "evolution_go",
            instance_uuid: parsed.uuid,
            instance_name: parsed.name,
            remote: item,
            webhook_error: webhookRes.ok ? null : webhookRes.error,
            webhook_last_attempt_at: new Date().toISOString(),
          },
        };

        if (existing) {
          const { error: updErr } = await supabase
            .from("evolution_instances")
            .update(baseRow)
            .eq("id", existing.id);
          if (!updErr) updated++;
          results.push({ name: parsed.name, action: "updated", webhook: webhookRes.ok, error: updErr?.message });
        } else {
          // Insert as orphan (no organization) — super admin can attach later via assign_instance
          const { error: insErr } = await supabase
            .from("evolution_instances")
            .insert({
              organization_id: targetOrgId, // may be null
              name: parsed.name,
              ...baseRow,
              is_default: false,
              created_by_super_admin: true,
            });
          if (!insErr) imported++;
          results.push({
            name: parsed.name,
            action: targetOrgId ? "imported" : "imported_orphan",
            webhook: webhookRes.ok,
            error: insErr?.message,
          });
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          imported,
          updated,
          total: list.length,
          webhooks: { ok: webhooksOk, failed: webhooksFailed },
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- ASSIGN INSTANCE TO ORGANIZATION (super admin only) ----
    if (action === "assign_instance") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const id = String(body.id || "");
      const orgId = body.organization_id ? String(body.organization_id) : null;
      if (!id) {
        return new Response(JSON.stringify({ error: "id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (orgId) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id")
          .eq("id", orgId)
          .maybeSingle();
        if (!org) {
          return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      const { error: updErr } = await supabase
        .from("evolution_instances")
        .update({ organization_id: orgId, is_default: false })
        .eq("id", id);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- SUBSCRIBE WEBHOOK (single instance) — super admin OR org admin ----
    if (action === "subscribe_webhook") {
      const inst = managedInstance;
      if (!inst) {
        return new Response(JSON.stringify({ error: "InstÃ¢ncia nÃ£o encontrada." }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
      const meta = asRecord(inst.metadata) ?? {};
      const uuid = typeof meta.instance_uuid === "string" ? meta.instance_uuid : inst.instance_id;
      const metadataToken = typeof meta.instance_token === "string" ? meta.instance_token : null;
      const instanceToken = inst.instance_token || metadataToken;

      if (!uuid || !instanceToken) {
        return new Response(JSON.stringify({ ok: false, error: "Instância sem UUID/token. Solicite sincronização." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const webhookRes = await configureWebhook(config, uuid, instanceToken, webhookUrl);
      await supabase
        .from("evolution_instances")
        .update({
          webhook_subscribed: webhookRes.ok,
          metadata: {
            ...meta,
            webhook_error: webhookRes.ok ? null : webhookRes.error,
            webhook_last_attempt_at: new Date().toISOString(),
          },
        })
        .eq("id", inst.id);

      if (!webhookRes.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: webhookRes.error, status: webhookRes.status }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true, message: "Webhook configurado com sucesso" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DELETE INSTANCE (super admin only) ----
    if (action === "delete_instance") {
      const denied = requireSuperAdmin();
      if (denied) return denied;
      const id = String(body.id || "");

      // Try to delete on Evolution Go too (best-effort)
      const { data: inst } = await supabase
        .from("evolution_instances")
        .select("name, metadata")
        .eq("id", id)
        .maybeSingle();
      const uuid = (inst?.metadata as any)?.instance_uuid;
      if (uuid) {
        await evoFetch(config, `/instance/delete/${uuid}`, { method: "DELETE" }).catch(() => null);
      } else if (inst?.name) {
        await evoFetch(config, `/instance/delete/${inst.name}`, { method: "DELETE" }).catch(() => null);
      }

      const { error } = await supabase.from("evolution_instances").delete().eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- SET DEFAULT (admin/manager of the org OR super admin) ----
    if (action === "set_default") {
      const id = String(body.id || "");
      const { data: inst } = await supabase
        .from("evolution_instances")
        .select("organization_id")
        .eq("id", id)
        .maybeSingle();
      if (!inst) {
        return new Response(JSON.stringify({ error: "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("evolution_instances")
        .update({ is_default: false })
        .eq("organization_id", inst.organization_id)
        .eq("is_default", true);
      const { error } = await supabase
        .from("evolution_instances")
        .update({ is_default: true })
        .eq("id", id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- DISCONNECT INSTANCE (pause session, KEEP pairing) — admin/manager OR super admin ----
    // Calls POST /instance/disconnect — closes the WebSocket session but keeps the device paired.
    // Reconnect later returns to the same number WITHOUT a new QR.
    if (action === "disconnect_instance") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("evolution_instances")
        .select("id, name, instance_id, instance_token, organization_id, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const meta: any = inst.metadata || {};
      const uuid: string | null = meta.instance_uuid || inst.instance_id || null;
      const instanceToken = inst.instance_token || meta.instance_token || null;
      if (!uuid || !instanceToken) {
        return new Response(JSON.stringify({ ok: false, error: "Instância sem UUID/token. Solicite sincronização." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await evoFetch(
        config,
        `/instance/disconnect`,
        { method: "POST", headers: { instanceId: uuid } },
        instanceToken,
      );
      console.log(`[disconnect_instance] uuid=${uuid} status=${res.status} ok=${res.ok}`);

      // Even if Evolution returns non-2xx (e.g. already disconnected), reflect locally
      await supabase
        .from("evolution_instances")
        .update({
          status: "disconnected",
          qr_code: null,
          qr_code_updated_at: null,
        })
        .eq("id", inst.id);

      if (!res.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: res.message || `Erro ${res.status} ao pausar sessão` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- LOGOUT INSTANCE (remove pairing, requires new QR) — admin/manager OR super admin ----
    // Calls DELETE /instance/logout — fully unlinks the WhatsApp account from the instance.
    // The number disappears from "Aparelhos conectados" and a NEW QR is required to pair again
    // (same or different number).
    if (action === "logout_instance") {
      const id = String(body.id || "");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing instance id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: inst, error: instErr } = await supabase
        .from("evolution_instances")
        .select("id, name, instance_id, instance_token, organization_id, metadata")
        .eq("id", id)
        .maybeSingle();
      if (instErr || !inst) {
        return new Response(JSON.stringify({ error: instErr?.message || "Instance not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!isSuperAdmin && inst.organization_id !== profile?.organization_id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const meta: any = inst.metadata || {};
      const uuid: string | null = meta.instance_uuid || inst.instance_id || null;
      const instanceToken = inst.instance_token || meta.instance_token || null;
      if (!uuid || !instanceToken) {
        return new Response(JSON.stringify({ ok: false, error: "Instância sem UUID/token. Solicite sincronização." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await evoFetch(
        config,
        `/instance/logout`,
        { method: "DELETE", headers: { instanceId: uuid } },
        instanceToken,
      );
      console.log(`[logout_instance] uuid=${uuid} status=${res.status} ok=${res.ok}`);

      // Always clear local pairing data — even if Evolution complained, the user wants it unlinked
      await supabase
        .from("evolution_instances")
        .update({
          status: "disconnected",
          phone_number: null,
          qr_code: null,
          qr_code_updated_at: null,
          last_connected_at: null,
        })
        .eq("id", inst.id);

      if (!res.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: res.message || `Erro ${res.status} ao desvincular` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("evolution-proxy error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
