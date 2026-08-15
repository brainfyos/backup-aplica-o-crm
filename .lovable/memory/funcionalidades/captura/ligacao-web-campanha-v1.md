---
name: Ligação Web Campanha End-to-End
description: Rota /call/:slug resolve voice_calls (campanha) via voice-call-public-info; voice-call-start monta tools dinâmicas (CTAs+captura); voice-call-end grava transcript/dados/CTAs em voice_call_sessions e dispara webhook
type: feature
---
Fluxo público:
- `/call/:slug` em `PublicCall.tsx` tenta `voice-call-public-info` primeiro; fallback para `voice-agent-public-info`.
- Se `kind='voice_call'`, `useGrokVoiceCall` recebe `voiceCallSlug` + `utms` e chama `voice-call-start`.
- `voice-call-start` cria lead visitante + `voice_call_sessions` + `call_logs`, monta tools dinâmicas a partir de `capture_fields` (salvar_<key> + salvar_dado_lead) e `ctas` (abrir_link, agendar_reuniao, enviar_whatsapp, aplicar_tag_interesse) + `registrar_desfecho`, retorna token efêmero xAI.
- Hangup dispara `voice-call-end` com transcript/captured_data/ctas_clicked/duration/outcome. Edge function atualiza sessão, incrementa `voice_calls.stats.calls/conversions` e dispara `tracking.webhook_url` se configurado.

Regra do prompt: campos configurados são pedidos "no meio natural da conversa, nunca no início/fim".

Aba "Respostas" (`VoiceCallResponsesTab`): lista `voice_call_sessions` por campanha, drawer com dados capturados, CTAs, UTMs e transcrição.

Edge functions com `verify_jwt=false` no `supabase/config.toml`: voice-call-public-info, voice-call-start, voice-call-end.
