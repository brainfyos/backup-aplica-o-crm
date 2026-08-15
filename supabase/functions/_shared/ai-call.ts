// High-level AI call helper that automatically uses the org's routing config
// (OpenAI direct or Lovable Gateway) and applies fallback when allowed.
// Drop-in replacement for raw fetch() to ai.gateway.lovable.dev/v1/chat/completions.

import { resolveAIConfig, logAIConfig, prepareAIRequestBody, recordAIUsage, ResolvedAIConfig, AICapability, AIKeyPurpose } from './ai-router.ts';

const LOVABLE_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';

export interface AICallOptions {
  organizationId?: string | null;
  capability?: AICapability | string;
  /** Pool de credenciais a usar. A Mia nunca recebe chaves do cliente. */
  keyPurpose?: AIKeyPurpose;
  /** Original Lovable-style model the caller wants. Will be adapted if provider is OpenAI. */
  model?: string;
  /** Body fields beyond model+messages (tools, response_format, temperature, stream, etc.) */
  body: Record<string, unknown>;
  /** Optional label for logs */
  label?: string;
  /** If true, returns the Response without throwing on !ok (caller handles streaming etc) */
  returnRaw?: boolean;
  /** Supabase client to read routing/credentials. If omitted, uses Lovable directly. */
  supabase?: unknown;
  /** Hard timeout for provider calls. Defaults to 120 seconds. */
  timeoutMs?: number;
  /** Edge Function name written to usage logs. */
  edgeFunction?: string;
}

async function lovableFallbackResponse(model: string, body: Record<string, unknown>, signal: AbortSignal) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') ?? '';
  return await fetch(LOVABLE_GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lovableKey}`,
    },
    body: JSON.stringify({ ...body, model }),
    signal,
  });
}

/**
 * Performs an AI chat completion respecting the org routing config.
 * Returns the Response. Caller is responsible for parsing JSON / handling stream.
 *
 * Behavior:
 *  - If routing → openai with valid key: calls OpenAI directly with adapted model.
 *  - If openai call fails (not 429/401) and fallback_to_lovable=true: retries on Lovable.
 *  - If routing → lovable: calls Lovable Gateway.
 */
export async function aiChat(opts: AICallOptions): Promise<{
  response: Response;
  config: ResolvedAIConfig;
  usedFallback: boolean;
}> {
  const { organizationId, capability = 'agent_chat', keyPurpose = 'platform', model, body, label, supabase } = opts;
  const signal = AbortSignal.timeout(Math.max(1_000, opts.timeoutMs ?? 120_000));

  let cfg: ResolvedAIConfig;
  if (supabase && organizationId) {
    cfg = await resolveAIConfig(supabase, organizationId, capability, model, keyPurpose);
  } else {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY') ?? '';
    cfg = {
      endpoint: LOVABLE_GATEWAY,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lovableKey}` },
      model: model || 'google/gemini-3-flash-preview',
      provider: 'lovable',
      source: 'gateway',
      allowFallback: false,
      apiKey: lovableKey,
    };
  }

  if (label) logAIConfig(label, cfg);

  let response = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: cfg.headers,
    body: JSON.stringify(prepareAIRequestBody(body, cfg)),
    signal,
  });

  let usedFallback = false;
  if (!response.ok && cfg.provider !== 'lovable' && cfg.allowFallback && response.status !== 429) {
    console.warn(`[${label ?? 'ai-call'}] ${cfg.provider} returned ${response.status}, falling back to Lovable AI`);
    response = await lovableFallbackResponse(model || 'google/gemini-3-flash-preview', body, signal);
    usedFallback = true;
    cfg = {
      ...cfg,
      headers: {},
      apiKey: Deno.env.get('LOVABLE_API_KEY') ?? '',
      provider: 'lovable',
      source: 'fallback_gateway',
      model: model || 'google/gemini-3-flash-preview',
      platform_key_id: undefined,
      key_label: undefined,
    };
  }

  return { response, config: cfg, usedFallback };
}

/**
 * Non-streaming completion helper used by background intelligence workers.
 * It centralizes provider routing, errors, timeouts and usage accounting.
 */
export async function aiChatContent(opts: AICallOptions): Promise<string> {
  const { response, config, usedFallback } = await aiChat(opts);
  if (!response.ok) throw new Error(await describeAIError(response, config.provider));
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  if (opts.supabase && opts.organizationId) {
    await recordAIUsage(
      opts.supabase,
      opts.organizationId,
      config,
      String(opts.capability ?? 'agent_chat'),
      payload.usage ?? null,
      opts.edgeFunction,
      { fallback_reason: usedFallback ? 'provider_error' : null },
    );
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error('O provedor de IA retornou uma resposta vazia.');
  return content;
}

/** Friendly error message helper for non-ok responses. */
export async function describeAIError(response: Response, providerLabel: string): Promise<string> {
  const text = await response.text().catch(() => '');
  if (response.status === 429) return 'Limite de requisições excedido. Tente novamente em alguns segundos.';
  if (response.status === 402) {
    return providerLabel === 'openai'
      ? 'Sua conta OpenAI está sem créditos ou bloqueada. Verifique em platform.openai.com/billing.'
      : 'Créditos de IA esgotados. Adicione créditos na sua conta Lovable.';
  }
  if (response.status === 401 || response.status === 403) {
    return `Chave do provedor "${providerLabel}" inválida ou sem permissão. Verifique em Integrações → IA.`;
  }
  return `Erro do provedor ${providerLabel} (${response.status}): ${text.slice(0, 200) || response.statusText}`;
}
