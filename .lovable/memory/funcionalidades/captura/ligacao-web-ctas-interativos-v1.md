---
name: Ligação Web CTAs Interativos
description: Fase 5 — CTAs da IA em Ligação Web executam server-side via voice-call-tool; SlotPicker finaliza agendamento real com booking-submit; novos renderers salvar_dado_lead, enviar_whatsapp, aplicar_tag_interesse
type: feature
---
Tools dinâmicas geradas por `voice-call-start` são executadas em tempo real na chamada:

- `salvar_dado_lead` / `salvar_<key>` → `SaveDataFeedback` chama `voice-call-tool` que atualiza `voice_call_sessions.captured_data` e reflete campos padrão (nome/whatsapp/email) no `leads`.
- `enviar_whatsapp` → `WhatsAppSender` chama `voice-call-tool` que insere em `scheduled_messages` (dispatcher existente entrega). Resolve destino em cascata: captured_data.whatsapp → lead.phone → cta.whatsapp_target.
- `aplicar_tag_interesse` → `InterestApplier` chama `voice-call-tool` que executa RPC `apply_tag_automations(lead, tag)` e soma score do CTA no lead (cap 100).
- `agendar_reuniao` → `SlotPicker` lista slots via `booking-availability` e ao clicar chama `booking-submit` de verdade; mostra confirmação com link Meet/Zoom.

`PublicCall.tsx` injeta `__session_id` e `__visitor` no `toolsMeta` do `DynamicSurface`, permitindo que os renderers chamem `voice-call-tool` com contexto correto.

Edge function `voice-call-tool` com `verify_jwt=false` opera com service role, validando sempre a `session_id`.
