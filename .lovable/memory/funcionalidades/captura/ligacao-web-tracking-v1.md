---
name: Ligação Web — Tracking & Integrações (Fase 4)
description: Meta Pixel + Conversions API, GA4 (gtag + Measurement Protocol), UTMs e webhook pós-ligação por campanha de /call/:slug
type: feature
---
Cada `voice_calls` tem `tracking` (jsonb) com `meta_pixel_id`, `meta_access_token`, `ga4_id`, `ga4_api_secret`, `webhook_url`.

Client (`src/lib/publicCallTracking.ts`):
- `ensureTrackers({ meta_pixel_id, ga4_id })` injeta scripts Pixel + gtag sob demanda.
- `trackCallEvent({ event, session_id, params, user_data })` dispara fbq/gtag com `eventID` e ecoa para a edge `voice-call-track` (deduplica CAPI x Pixel via `event_id`).

Server (`supabase/functions/voice-call-track`): carrega `voice_call_sessions.captured_data`, hash SHA-256 (em/ph/fn/external_id), envia Meta CAPI v18.0 e GA4 Measurement Protocol (só se `ga4_api_secret` presente). IP tirado de `x-forwarded-for`.

Eventos emitidos em `PublicCall.tsx`:
- `PageView` ao carregar; `InitiateCheckout` quando `sessionId` aparece (após start).
- `Schedule` quando tool `agendar_reuniao` volta com `start`.
- `Lead` para qualquer tool `salvar_*`, `salvar_dado_lead` ou `aplicar_tag_interesse`.
- `CTA_Clicked` (custom) para `abrir_link` e `enviar_whatsapp`.
- `Call_Outcome` (custom) em `handleOutcome`.

UTMs (`utm_source/medium/campaign/term/content`) são capturados da URL e persistidos em `voice_call_sessions.utms` via `voice-call-start`, além de acompanharem todos os eventos.

`voice-call-public-info` só expõe `meta_pixel_id` e `ga4_id` (segredos ficam no server). Webhook pós-ligação continua disparado por `voice-call-end`.
