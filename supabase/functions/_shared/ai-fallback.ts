// Cadeia de fallback automático para chamadas de chat completions.
//
// Uso:
//   const result = await aiChatWithFallback(supabase, orgId, 'agent_chat', requestBody, {
//     edgeFunction: 'webchat-bot',
//     detectDegenerate: (text) => detectDegenerateRepetition(text),
//   });
//   const choice = result.data?.choices?.[0];
//
// Se o modelo primário falhar por um dos gatilhos configurados
// (429 rate limit, 402 sem créditos, 5xx, resposta vazia, loop de repetição),
// o helper tenta o próximo modelo da `fallback_chain` configurada pelo Admin
// em `org_ai_routing`. Cada tentativa é registrada em `ai_usage_logs` com
// `attempt_index`, `fallback_reason` e `primary_model` para observabilidade.

import {
  resolveAIConfig,
  prepareAIRequestBody,
  recordAIUsage,
  DEFAULT_FALLBACK_TRIGGERS,
  type ResolvedAIConfig,
  type FallbackStep,
  type FallbackTriggers,
} from './ai-router.ts';

export type FallbackReason =
  | 'rate_limit'
  | 'credits'
  | 'server_error'
  | 'empty_output'
  | 'degenerate'
  | 'timeout'
  | 'unknown';

export interface AIChatFallbackResult {
  ok: boolean;
  data: any | null;
  status: number;
  aiConfig: ResolvedAIConfig;
  attempt_index: number;
  reason?: FallbackReason;
  attempts: Array<{ model: string; provider: string; status: number; reason?: FallbackReason }>;
  errorBody?: string;
}

interface Options {
  edgeFunction?: string;
  detectDegenerate?: (text: string) => boolean;
  /** Timeout por tentativa (ms). 0 desabilita. */
  timeoutMs?: number;
  /** Modelo escolhido no agente; não troca o provedor nem a credencial da org. */
  preferredModel?: string;
}

function classifyHttpStatus(status: number): FallbackReason | null {
  if (status === 429) return 'rate_limit';
  if (status === 402) return 'credits';
  if (status >= 500) return 'server_error';
  return null;
}

function extractContent(data: any): string {
  return String(data?.choices?.[0]?.message?.content ?? '');
}

function shouldFallback(reason: FallbackReason, triggers: FallbackTriggers): boolean {
  const merged = { ...DEFAULT_FALLBACK_TRIGGERS, ...triggers };
  return !!merged[reason as keyof FallbackTriggers];
}

async function buildStepConfig(
  supabase: any,
  organizationId: string | null | undefined,
  capability: string,
  step: FallbackStep,
): Promise<ResolvedAIConfig> {
  // Reaproveita resolveAIConfig passando o model do step como preferredModel;
  // se o step aponta provider diferente do configurado, o roteador ajusta.
  const cfg = await resolveAIConfig(supabase, organizationId, capability, step.model);
  // Se o step exige provider diferente, força o modelo (o endpoint/chave são do provider atual).
  return { ...cfg, model: step.model };
}

export async function aiChatWithFallback(
  supabase: any,
  organizationId: string | null | undefined,
  capability: string,
  requestBody: Record<string, any>,
  options: Options = {},
): Promise<AIChatFallbackResult> {
  const primary = await resolveAIConfig(supabase, organizationId, capability, options.preferredModel);
  const triggers = primary.fallback_triggers ?? DEFAULT_FALLBACK_TRIGGERS;
  const chain = primary.fallback_chain ?? [];
  const primaryModel = primary.model;

  const attempts: AIChatFallbackResult['attempts'] = [];

  const tryOne = async (cfg: ResolvedAIConfig, attemptIndex: number): Promise<AIChatFallbackResult> => {
    const ctrl = options.timeoutMs && options.timeoutMs > 0 ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), options.timeoutMs) : null;
    let response: Response;
    try {
      response = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: cfg.headers,
        body: JSON.stringify(prepareAIRequestBody({ ...requestBody, model: cfg.model }, cfg)),
        signal: ctrl?.signal,
      });
    } catch (err: any) {
      const reason: FallbackReason = err?.name === 'AbortError' ? 'timeout' : 'server_error';
      attempts.push({ model: cfg.model, provider: cfg.provider, status: 0, reason });
      return {
        ok: false, data: null, status: 0, aiConfig: cfg, attempt_index: attemptIndex, reason, attempts,
        errorBody: String(err?.message || err),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }

    const status = response.status;
    const httpReason = classifyHttpStatus(status);
    if (httpReason) {
      const errorBody = await response.text().catch(() => '');
      attempts.push({ model: cfg.model, provider: cfg.provider, status, reason: httpReason });
      return { ok: false, data: null, status, aiConfig: cfg, attempt_index: attemptIndex, reason: httpReason, attempts, errorBody };
    }
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      attempts.push({ model: cfg.model, provider: cfg.provider, status, reason: 'unknown' });
      return { ok: false, data: null, status, aiConfig: cfg, attempt_index: attemptIndex, reason: 'unknown', attempts, errorBody };
    }

    const data = await response.json().catch(() => null);
    const text = extractContent(data);
    let reason: FallbackReason | undefined;
    if (!text || text.trim().length === 0) {
      const hasToolCalls = Array.isArray(data?.choices?.[0]?.message?.tool_calls) && data.choices[0].message.tool_calls.length > 0;
      if (!hasToolCalls) reason = 'empty_output';
    } else if (options.detectDegenerate && options.detectDegenerate(text)) {
      reason = 'degenerate';
    }

    attempts.push({ model: cfg.model, provider: cfg.provider, status, reason });

    // Log usage sempre (mesmo em degenerate — o token foi cobrado).
    await recordAIUsage(supabase, organizationId, cfg, capability, data?.usage, options.edgeFunction, {
      attempt_index: attemptIndex,
      fallback_reason: reason ?? null,
      primary_model: attemptIndex === 0 ? null : primaryModel,
    });

    return { ok: !reason, data, status, aiConfig: cfg, attempt_index: attemptIndex, reason, attempts };
  };

  // Tentativa 0 → modelo primário
  let result = await tryOne(primary, 0);
  if (result.ok) return result;

  // Percorre a cadeia se o gatilho está ligado
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    if (!step?.model) continue;
    const lastReason = result.reason ?? 'unknown';
    if (lastReason !== 'unknown' && !shouldFallback(lastReason, triggers)) {
      console.log(`[ai-fallback] gatilho "${lastReason}" desligado — não escalar`);
      break;
    }
    console.log(`[ai-fallback] escalando #${i + 1} → ${step.provider}/${step.model} (motivo: ${lastReason})`);
    try {
      const nextCfg = await buildStepConfig(supabase, organizationId, capability, step);
      result = await tryOne(nextCfg, i + 1);
      if (result.ok) return result;
    } catch (err: any) {
      console.warn(`[ai-fallback] falha resolvendo step ${step.provider}/${step.model}:`, err?.message);
      attempts.push({ model: step.model, provider: step.provider, status: 0, reason: 'unknown' });
    }
  }

  return result;
}
