---
name: Voz = Agente de IA (fim dos Perfis de Voz)
description: Ligação Web, chamada de lead e campanhas de voz escolhem product_agents diretamente + voz Grok; product_agent carrega toda inteligência (persona, tom, sotaque, humanização) via voice-prompt-builder
type: feature
---
`voice_calls`, `voice_campaigns` e `call_logs` ganharam `product_agent_id` + `grok_voice_id` + `voice_settings` + `language`. `product_agents` ganhou `voice_enabled` + `default_grok_voice_id` + `voice_settings`. `voice_agent_id` fica como legado (backfill copia dados para as novas colunas).

Novo helper `supabase/functions/_shared/voice-prompt-builder.ts` monta `session.instructions` da Grok Realtime a partir do product_agent inteiro: template do tipo (SDR/Closer/etc), primary_objective, additional_prompt, can/cannot_do, handoff/end triggers, tone_style, message_style, required/prohibited_phrases, e **humanização adaptada a voz** — persona (idade/cidade/backstory/hobbies), tics.region traduzido em sotaque (nordestino/carioca/paulista/mineiro/sulista/neutro), gírias/openers/fillers, laughter_style, loved/forbidden_words. Timing/splitting/emoji são ignorados (irrelevantes em voz).

Edge functions refatoradas: `grok-voice-ephemeral-token`, `voice-call-start`, `xai-voice-call-start` aceitam `product_agent_id` + `grok_voice_id` + `context_override`. Fallback legado: se vier `voice_agent_id`, resolvem os campos a partir dele. `voice-call-public-info` prioriza product_agent para nome/foto.

Frontend: `VoiceCallEditor` (Construir) tem 3 controles — Agente de IA (useAllAgents), Voz (nativas + clones com ▶ preview via `previewGrokVoice`), Slug. `CallVoiceAIDialog` (ligar pra lead) idem + campo contexto. `VoiceCallsManager` (novo) escolhe agente na criação. Item **Perfis de Voz** removido do menu Automação & IA — a aba **Vozes** (clones) fica; `VoiceAgentsTab` continua em `/admin?tab=voice-agents` só como acesso legado.
