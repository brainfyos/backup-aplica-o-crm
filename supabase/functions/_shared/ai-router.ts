// Shared AI router: resolves which provider/endpoint/key to use based on org_ai_routing
// + org_ai_credentials. Falls back to Lovable AI Gateway when external key missing
// (only if fallback_to_lovable=true).

import { decryptSecret } from './meta-crypto.ts';

const LOVABLE_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const OPENAI_TRANSCRIPTIONS_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

export type AICapability =
  | 'agent_chat'
  | 'sales_copilot'
  | 'audio_transcription'
  | 'image_vision'
  | 'content_generation'
  | 'analysis_insights'
  | 'embeddings';

export type AIKeyPurpose = 'platform' | 'mia';

export interface FallbackStep {
  provider: 'lovable' | 'openai' | string;
  model: string;
}

export interface FallbackTriggers {
  rate_limit?: boolean;
  credits?: boolean;
  server_error?: boolean;
  empty_output?: boolean;
  degenerate?: boolean;
  timeout?: boolean;
}

export const DEFAULT_FALLBACK_TRIGGERS: Required<FallbackTriggers> = {
  rate_limit: true,
  credits: true,
  server_error: true,
  empty_output: true,
  degenerate: true,
  timeout: false,
};

export interface ResolvedAIConfig {
  endpoint: string;
  headers: Record<string, string>;
  model: string;
  provider: 'lovable' | 'openai' | string;
  source: 'external_key' | 'gateway' | 'fallback_gateway';
  // Whether retry on Lovable is allowed if external call fails (other than 429)
  allowFallback: boolean;
  apiKey: string;
  /** When the key came from the platform pool. */
  platform_key_id?: string;
  key_label?: string;
  /** Cadeia de fallback configurada pelo admin (ordem de tentativa). */
  fallback_chain?: FallbackStep[];
  /** Gatilhos que ativam o fallback automático. */
  fallback_triggers?: FallbackTriggers;
}


/**
 * Maps a Lovable-prefixed model to the equivalent for an external provider.
 * Used when org configured external provider but call site passes a Lovable model.
 */
const MODEL_MAP_TO_OPENAI: Record<string, string> = {
  'google/gemini-3-flash-preview': 'gpt-5-mini',
  'google/gemini-3.1-flash-lite': 'gpt-5-nano',
  'google/gemini-3.5-flash': 'gpt-5-mini',
  'google/gemini-3.1-pro-preview': 'gpt-5',
  'google/gemini-2.5-flash': 'gpt-5-mini',
  'google/gemini-2.5-flash-lite': 'gpt-5-nano',
  'google/gemini-2.5-pro': 'gpt-5',
  'openai/gpt-5': 'gpt-5',
  'openai/gpt-5-mini': 'gpt-5-mini',
  'openai/gpt-5-nano': 'gpt-5-nano',
  'openai/gpt-5.2': 'gpt-5.2',
  'openai/gpt-5.4': 'gpt-5.4',
  'openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'openai/gpt-5.4-nano': 'gpt-5.4-nano',
  'openai/gpt-5.4-pro': 'gpt-5.4-pro',
  'openai/gpt-5.5': 'gpt-5.5',
  'openai/gpt-5.5-pro': 'gpt-5.5-pro',
  'openai/gpt-5.6-luna': 'gpt-5.6-luna',
  'openai/gpt-5.6-terra': 'gpt-5.6-terra',
  'openai/gpt-5.6-sol': 'gpt-5.6-sol',
};

function adaptModelForProvider(model: string, provider: string): string {
  if (!model) return model;
  if (provider === 'openai') {
    if (MODEL_MAP_TO_OPENAI[model]) return MODEL_MAP_TO_OPENAI[model];
    if (model.startsWith('openai/')) return model.slice('openai/'.length);
    // Unknown prefix → strip provider prefix if present
    if (model.includes('/')) return model.split('/').pop()!;
    return model;
  }
  return model;
}

/**
 * Detecta modelos OpenAI de "reasoning" (gpt-5*, o1*, o3*, o4*, gpt-4.1-reasoning).
 * Esses modelos gastam tokens internos com raciocínio e consomem esse orçamento
 * do `max_completion_tokens`. Com teto baixo (ex.: 800) e `reasoning_effort`
 * default `medium`, a resposta chega VAZIA (finish_reason = "length"), o que
 * antes fazia o bot cair no `fallback_message` e mandar "vou pedir para um
 * atendente humano continuar…" para o cliente sem motivo.
 */
export function isOpenAIReasoningModel(model: string): boolean {
  if (!model) return false;
  const m = model.toLowerCase();
  return (
    m.startsWith('gpt-5') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.includes('reasoning')
  );
}

/** Piso mínimo de tokens para reasoning models (raciocínio + saída). */
export const REASONING_MIN_COMPLETION_TOKENS = 4000;

export function prepareAIRequestBody(body: Record<string, unknown>, cfg: ResolvedAIConfig): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...body, model: cfg.model };

  if (cfg.provider === 'openai' && isOpenAIReasoningModel(String(cfg.model || ''))) {
    // 1) max_tokens → max_completion_tokens
    if (payload.max_tokens !== undefined && payload.max_completion_tokens === undefined) {
      payload.max_completion_tokens = payload.max_tokens;
    }
    delete payload.max_tokens;

    // 2) Piso mínimo — reasoning tokens contam junto com a saída.
    if (
      payload.max_completion_tokens === undefined ||
      Number(payload.max_completion_tokens) < REASONING_MIN_COMPLETION_TOKENS
    ) {
      payload.max_completion_tokens = REASONING_MIN_COMPLETION_TOKENS;
    }

    // 3) `temperature` só pode ser 1 — remova qualquer outro valor.
    if (payload.temperature !== undefined && payload.temperature !== 1) {
      delete payload.temperature;
    }
    // 4) top_p também só aceita default (=1). Remova se diferente.
    if (payload.top_p !== undefined && payload.top_p !== 1) {
      delete payload.top_p;
    }

    // 5) `reasoning_effort` default "minimal" para chat conversacional — evita
    //    consumir todo o budget em raciocínio e voltar sem texto.
    //    Valores válidos: minimal | low | medium | high.
    if (payload.reasoning_effort === undefined) {
      payload.reasoning_effort = 'minimal';
    }
  }

  return payload;
}

/**
 * Descriptografa a chave se estiver no formato v1: (AES-GCM), ou retorna
 * plaintext legado inalterado (compatibilidade com chaves salvas antes da criptografia).
 */
async function readStoredApiKey(stored: string | null | undefined): Promise<string> {
  if (!stored) return '';
  if (stored.startsWith('v1:')) {
    try {
      return await decryptSecret(stored);
    } catch (e) {
      console.error('[ai-router] failed to decrypt api_key_encrypted:', e);
      return '';
    }
  }
  return stored; // legacy plaintext
}

/**
 * Resolves AI configuration for an organization.
 * - Reads org_ai_routing for the given capability (default 'agent_chat').
 * - If provider is external (openai) AND a credential exists, returns config to call that provider directly.
 * - Otherwise returns Lovable AI Gateway config.
 */
export async function resolveAIConfig(
  supabase: any,
  organizationId: string | null | undefined,
  capability: AICapability | string = 'agent_chat',
  /** Optional model hint from caller. Will be adapted if provider differs. */
  preferredModel?: string,
  /** Mia always uses the server-side key dedicated by the Super Admin. */
  keyPurpose: AIKeyPurpose = 'platform',
): Promise<ResolvedAIConfig> {
  const envLovableKey = Deno.env.get('LOVABLE_API_KEY') || '';

  /** Lê um plano efetivo da organização (provider/strategy/allow). */
  async function readPlan(): Promise<{ allow: boolean; mia: boolean; provider: string; strategy: string }> {
    if (!organizationId) return { allow: true, mia: false, provider: 'lovable', strategy: 'random' };
    try {
      const { data } = await supabase
        .from('organizations')
        .select('plan_id, platform_plans!inner(allow_platform_ai, feature_mia, platform_ai_provider, platform_ai_strategy)')
        .eq('id', organizationId)
        .maybeSingle();
      const plan = (data as any)?.platform_plans;
      return {
        allow: plan?.allow_platform_ai !== false,
        mia: plan?.feature_mia === true,
        provider: (plan?.platform_ai_provider as string) || 'lovable',
        strategy: (plan?.platform_ai_strategy as string) || 'random',
      };
    } catch (e) {
      console.warn('[ai-router] readPlan failed, defaulting:', e);
      return { allow: true, mia: false, provider: 'lovable', strategy: 'random' };
    }
  }

  /** Tenta escolher uma chave do pool da plataforma. Retorna null se vazio. */
  async function pickPoolKey(provider: string, strategy: string): Promise<{ id: string; api_key: string; model_default?: string; label: string } | null> {
    try {
      const { data, error } = await supabase.rpc('pick_platform_ai_key', { p_provider: provider, p_strategy: strategy });
      if (error) {
        console.warn('[ai-router] pick_platform_ai_key error:', error);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      const decrypted = await readStoredApiKey(row.api_key_encrypted);
      return { id: row.id, api_key: decrypted, model_default: row.model_default ?? undefined, label: row.label };
    } catch (e) {
      console.warn('[ai-router] pickPoolKey threw:', e);
      return null;
    }
  }

  async function pickMiaKey(strategy: string): Promise<{ id: string; api_key: string; model_default?: string; label: string; purpose: string } | null> {
    try {
      const { data, error } = await supabase.rpc('pick_mia_ai_key', { p_strategy: strategy });
      if (error) {
        console.warn('[ai-router] pick_mia_ai_key error:', error);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      const decrypted = await readStoredApiKey(row.api_key_encrypted);
      if (!decrypted) return null;
      return {
        id: row.id,
        api_key: decrypted,
        model_default: row.model_default ?? undefined,
        label: row.label,
        purpose: row.purpose ?? 'platform',
      };
    } catch (e) {
      console.warn('[ai-router] pickMiaKey threw:', e);
      return null;
    }
  }

  function buildLovableConfig(apiKey: string, model: string, source: ResolvedAIConfig['source'], extra?: Partial<ResolvedAIConfig>): ResolvedAIConfig {
    return {
      endpoint: LOVABLE_GATEWAY,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      model,
      provider: 'lovable',
      source,
      allowFallback: false,
      apiKey,
      ...(extra || {}),
    };
  }

  function buildOpenAIConfig(apiKey: string, model: string, source: ResolvedAIConfig['source'], allowFallback: boolean, extra?: Partial<ResolvedAIConfig>): ResolvedAIConfig {
    return {
      endpoint: OPENAI_CHAT_ENDPOINT,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      model: adaptModelForProvider(model, 'openai'),
      provider: 'openai',
      source,
      allowFallback,
      apiKey,
      ...(extra || {}),
    };
  }

  // Fallback final: env LOVABLE_API_KEY (compat se pool lovable estiver vazio)
  const envLovableConfig: ResolvedAIConfig = buildLovableConfig(envLovableKey, preferredModel || DEFAULT_MODEL, 'gateway');

  if (!organizationId) return envLovableConfig;

  try {
    if (keyPurpose === 'mia') {
      const plan = await readPlan();
      if (!plan.mia) {
        const err: any = new Error('A Mia não está incluída no plano desta empresa.');
        err.code = 'MIA_PLAN_DISABLED';
        throw err;
      }
      const miaKey = await pickMiaKey(plan.strategy);
      if (!miaKey) {
        const err: any = new Error('Nenhuma chave OpenAI ativa para a Mia. Configure em Super Admin → IA da Plataforma.');
        err.code = 'MIA_KEY_MISSING';
        throw err;
      }
      const usedModel = preferredModel || miaKey.model_default || 'gpt-5-mini';
      return buildOpenAIConfig(miaKey.api_key, usedModel, 'gateway', false, {
        platform_key_id: miaKey.id,
        key_label: `${miaKey.label}${miaKey.purpose === 'mia' ? ' · Mia' : ' · fallback geral'}`,
      });
    }

    // 1) Roteamento configurado pela empresa (chave própria) tem prioridade
    const { data: routing } = await supabase
      .from('org_ai_routing')
      .select('provider, model, fallback_to_lovable, fallback_chain, fallback_triggers')
      .eq('organization_id', organizationId)
      .eq('capability', capability)
      .maybeSingle();

    const orgProvider = (routing?.provider || '').toLowerCase();
    // A escolha explícita do agente substitui somente o modelo. Provedor,
    // credencial, fallback e limites continuam sendo os configurados pela org.
    const routedModel = (preferredModel || routing?.model || DEFAULT_MODEL) as string;
    const wantsFallback = !!routing?.fallback_to_lovable;
    const fallbackChain: FallbackStep[] = Array.isArray(routing?.fallback_chain)
      ? (routing!.fallback_chain as FallbackStep[]).filter((s) => s && s.model)
      : [];
    const fallbackTriggers: FallbackTriggers = {
      ...DEFAULT_FALLBACK_TRIGGERS,
      ...(routing?.fallback_triggers && typeof routing.fallback_triggers === 'object' ? routing.fallback_triggers : {}),
    };
    const chainExtras = { fallback_chain: fallbackChain, fallback_triggers: fallbackTriggers } as Partial<ResolvedAIConfig>;

    if (orgProvider && orgProvider !== 'lovable') {
      const { data: cred } = await supabase
        .from('org_ai_credentials')
        .select('api_key_encrypted')
        .eq('organization_id', organizationId)
        .eq('provider', orgProvider)
        .maybeSingle();
      const rawKey = await readStoredApiKey(cred?.api_key_encrypted as string | undefined);
      if (rawKey && orgProvider === 'openai') {
        return buildOpenAIConfig(rawKey, routedModel, 'external_key', wantsFallback, chainExtras);
      }
      // Anthropic/Gemini com chave própria: ainda não implementado no roteador.
      if (rawKey && (orgProvider === 'anthropic' || orgProvider === 'gemini')) {
        if (wantsFallback) {
          console.warn(`[ai-router] provider=${orgProvider} não implementado — usando Lovable (fallback ligado)`);
          return { ...envLovableConfig, model: preferredModel || DEFAULT_MODEL, ...chainExtras };
        }
        const err: any = new Error(
          `Provedor "${orgProvider}" ainda não é suportado diretamente. Use OpenAI, Lovable, ou habilite o fallback.`,
        );
        err.code = 'AI_PROVIDER_NOT_IMPLEMENTED';
        throw err;
      }
      // sem chave própria → cai pro pool / plano abaixo
    }

    // 2) Plano da empresa decide se usa pool da plataforma
    const plan = await readPlan();
    if (!plan.allow) {
      const err: any = new Error(
        'Seu plano não inclui IA da plataforma. Cadastre uma chave própria (OpenAI/Anthropic/Gemini) em Integrações.',
      );
      err.code = 'AI_PLAN_NO_PLATFORM';
      throw err;
    }

    // 3) Tenta pool por estratégia
    const pool = await pickPoolKey(plan.provider, plan.strategy);
    if (pool) {
      const usedModel = preferredModel || pool.model_default || routedModel || DEFAULT_MODEL;
      const extra = { platform_key_id: pool.id, key_label: pool.label, ...chainExtras } as any;
      if (plan.provider === 'openai') return buildOpenAIConfig(pool.api_key, usedModel, 'gateway', false, extra);
      if (plan.provider === 'lovable') return buildLovableConfig(pool.api_key, usedModel, 'gateway', extra);
      return buildLovableConfig(envLovableKey || pool.api_key, usedModel, 'gateway', extra);
    }

    // 4) Pool vazio
    if (plan.provider === 'lovable' && envLovableKey) {
      return { ...envLovableConfig, model: preferredModel || routedModel || DEFAULT_MODEL, ...chainExtras };
    }
    const err: any = new Error(
      `Pool da plataforma sem chaves ativas para "${plan.provider}". Peça ao Super Admin para cadastrar uma chave em Super Admin → IA da Plataforma.`,
    );
    err.code = 'AI_POOL_EMPTY';
    throw err;
  } catch (err: any) {
    if (['AI_NO_CREDENTIAL', 'AI_PLAN_NO_PLATFORM', 'AI_POOL_EMPTY', 'AI_PROVIDER_NOT_IMPLEMENTED', 'MIA_PLAN_DISABLED', 'MIA_KEY_MISSING'].includes(err?.code)) throw err;
    console.warn('[ai-router] Lookup failed, using env Lovable default:', err);
    return envLovableConfig;
  }
}


/**
 * Registra consumo de tokens da plataforma após chamada Lovable AI.
 * Para chave própria do cliente, apenas grava log informativo (não consome cota).
 */
export async function recordAIUsage(
  supabase: any,
  organizationId: string | null | undefined,
  cfg: ResolvedAIConfig,
  capability: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null,
  edgeFunction?: string,
  meta?: { attempt_index?: number; fallback_reason?: string | null; primary_model?: string | null },
): Promise<void> {
  if (!organizationId || !usage) return;
  const total = usage.total_tokens ?? ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
  try {
    const isPlatform = cfg.source === 'gateway' || cfg.source === 'fallback_gateway';
    if (isPlatform && total > 0) {
      await supabase.rpc('check_and_consume_ai_tokens', { p_org_id: organizationId, p_tokens: total });
    }
    await supabase.from('ai_usage_logs').insert({
      organization_id: organizationId,
      capability,
      provider: cfg.provider,
      model: cfg.model,
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: total,
      source: isPlatform ? 'platform' : 'own_key',
      edge_function: edgeFunction || null,
      platform_key_id: cfg.platform_key_id ?? null,
      key_label: cfg.key_label ?? null,
      attempt_index: meta?.attempt_index ?? 0,
      fallback_reason: meta?.fallback_reason ?? null,
      primary_model: meta?.primary_model ?? null,
    });

  } catch (e) {
    console.warn('[ai-router] recordAIUsage failed (non-fatal):', e);
  }
}

/**
 * Atalho para chamadas diretas ao Lovable Gateway (raw fetch).
 * Equivale a recordAIUsage com cfg sintético source='gateway'.
 */
export async function recordLovableUsage(
  supabase: any,
  organizationId: string | null | undefined,
  capability: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null,
  edgeFunction?: string,
): Promise<void> {
  if (!organizationId || !usage) return;
  const cfg: ResolvedAIConfig = {
    endpoint: '', headers: {}, apiKey: '', allowFallback: false,
    provider: 'lovable', source: 'gateway', model: model || 'unknown',
  };
  return recordAIUsage(supabase, organizationId, cfg, capability, usage, edgeFunction);
}

/**
 * Returns the embeddings endpoint config (OpenAI direct or Lovable fallback).
 * Lovable AI Gateway does not currently expose embeddings; if Lovable is selected
 * we still call OpenAI but require a key.
 */
export async function resolveEmbeddingsConfig(
  supabase: any,
  organizationId: string | null | undefined,
): Promise<ResolvedAIConfig> {
  const cfg = await resolveAIConfig(supabase, organizationId, 'embeddings', 'text-embedding-3-small');
  // Always call OpenAI embeddings endpoint regardless of provider routing,
  // unless we have an explicit OpenAI key.
  if (cfg.provider === 'openai') {
    return { ...cfg, endpoint: OPENAI_EMBEDDINGS_ENDPOINT, model: cfg.model || 'text-embedding-3-small' };
  }
  // Sem OpenAI configurado — não cai em env global. Multi-tenant exige chave da org.
  throw new Error('AI_NO_CREDENTIAL: embeddings requerem chave OpenAI da organização (Admin → Integrações → OpenAI).');
}

/**
 * Returns transcription endpoint config (OpenAI Whisper / gpt-4o-transcribe).
 */
export async function resolveTranscriptionConfig(
  supabase: any,
  organizationId: string | null | undefined,
): Promise<ResolvedAIConfig> {
  const cfg = await resolveAIConfig(supabase, organizationId, 'audio_transcription', 'gpt-4o-transcribe');
  if (cfg.provider === 'openai') {
    return { ...cfg, endpoint: OPENAI_TRANSCRIPTIONS_ENDPOINT, model: cfg.model || 'gpt-4o-transcribe' };
  }
  // Sem OpenAI configurado — não cai em env global.
  throw new Error('AI_NO_CREDENTIAL: transcrição requer chave OpenAI da organização (Admin → Integrações → OpenAI).');
}

/**
 * Convenience logger so logs across all call sites look identical.
 */
export function logAIConfig(label: string, cfg: ResolvedAIConfig) {
  console.log(
    `[${label}] AI Provider: ${cfg.provider} | Model: ${cfg.model} | Source: ${cfg.source} | Fallback: ${cfg.allowFallback}`,
  );
}
