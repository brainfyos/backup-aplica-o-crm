---
name: Roteamento de IA — provedores externos
description: Como resolver provedor/modelo/chave via org_ai_routing+org_ai_credentials, criptografia AES-GCM da chave, comportamento do fallback_to_lovable, ajustes para reasoning models OpenAI (gpt-5*) e status de Anthropic/Gemini
type: feature
---

`_shared/ai-router.ts.resolveAIConfig(supabase, orgId, capability, preferredModel?)` decide qual endpoint/chave/modelo usar:

1. Lê `org_ai_routing` para (orgId, capability). Se `provider != lovable` E existir credencial em `org_ai_credentials`, chama o provedor direto.
2. Senão, consulta `platform_plans.allow_platform_ai`. Se `false`, joga `AI_PLAN_NO_PLATFORM`.
3. Senão, sorteia chave do pool `platform_ai_keys` via RPC `pick_platform_ai_key(provider, strategy)`.
4. Senão, cai no `LOVABLE_API_KEY` do env.

**Chave criptografada.** `org_ai_credentials.api_key_encrypted` e `platform_ai_keys.api_key_encrypted` guardam a chave AES-GCM (prefixo `v1:`) usando `_shared/meta-crypto.ts`. Chaves antigas (plaintext, sem prefixo `v1:`) continuam funcionando por compat.

**Fallback.** `org_ai_routing.fallback_to_lovable` propaga em `ResolvedAIConfig.allowFallback`. `_shared/ai-call.ts.aiChat` só chama Lovable quando `cfg.allowFallback` é true (e resposta não é 429).

**Provedores suportados hoje.** OpenAI (direto) + Lovable (gateway). Anthropic/Gemini cadastram chave mas lançam `AI_PROVIDER_NOT_IMPLEMENTED` sem fallback. xAI é usado apenas para voice_call.

**Reasoning models OpenAI (gpt-5*, o1*, o3*, o4*).** `prepareAIRequestBody` detecta via `isOpenAIReasoningModel` e:
- Converte `max_tokens → max_completion_tokens`.
- Força piso `max_completion_tokens ≥ 4000` (`REASONING_MIN_COMPLETION_TOKENS`) porque reasoning tokens consomem o mesmo budget da saída.
- Injeta `reasoning_effort: "minimal"` quando o caller não passou nada (chat conversacional; use `low/medium/high` só quando qualidade justificar).
- Remove `temperature` e `top_p` diferentes de 1 (o modelo rejeita).

Sem esses ajustes o modelo terminava com `finish_reason: "length"` e `content` vazio, fazendo o `webchat-bot` mandar a frase de handoff humano por engano.

**Resposta vazia nunca vira handoff.** `webchat-bot` agora:
- Loga `finish_reason` e `reasoning_tokens` de toda chamada.
- Se `content` vier vazio com `finish_reason === "length"`, faz 1 retry com `max_tokens: 8000` + `reasoning_effort: "minimal"`.
- Se ainda vier vazio (ou a chamada HTTP falhar), devolve mensagem neutra ("Tive um problema técnico agora, pode repetir sua última mensagem?") — **nunca** mais o `agent_config.fallback_message` que era a frase de handoff. Handoff real só via tags `[HANDOFF:*]` ou bloco `ai_takeover` do fluxo.
- Follow-ups pós-tool-call usam `max_tokens: 2000` (antes 400/500), suficiente para reasoning models.

**Diagnóstico.** Edge `test-ai-routing` (auth obrigatório) recebe `{ capability }`, roda `resolveAIConfig` + faz ping real de chat com `max_tokens: 512` (elevado pelo piso reasoning). Retorna `{ ok, provider, model, source, endpoint, allow_fallback, status, latency_ms, sample, finish_reason, reasoning_tokens, error }`. **200 com content vazio conta como `ok: false`** e explica no `error` se o motivo foi `finish_reason=length`. Botão **Testar** em `AIRoutingPanel` chama via `useTestAIRouting`.

**Model map.** `MODEL_MAP_TO_OPENAI` traduz IDs Lovable (`google/gemini-*`, `openai/*`) para nomes OpenAI puros.

**Call-sites.** webchat-bot, sales-copilot, followup-ai-draft, booking-reply-ai, generate-insights, quiz-ai-result, funnel-api, process-media-message, `_shared/ai-call.ts`, `_shared/ai-credentials.ts`.
