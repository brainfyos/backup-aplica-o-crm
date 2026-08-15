---
name: Journey Engine — motor universal de eventos
description: Event bus central do Vendus. Tudo publica em journey_events; nada escreve direto na Timeline
type: feature
---
**Regra de ouro:** nenhum módulo escreve direto na Timeline / Jornada. Tudo publica um evento no bus, e a UI consome o bus.

**Schema (Fase 0 concluída):**
- `journey_events` — fonte única. Colunas-chave: `subject_type` (lead|customer|user|deal|conversation|order|organization) + `subject_id`, `event_type` (enum extensível), `event_category`, `source_module`, `actor_type` (human|ai|system|external) + `actor_id`, `channel`, `payload` jsonb, `occurred_at`, `ingested_at`, `session_id`, `correlation_id`, `dedupe_key`. Unique parcial `(organization_id, source_module, dedupe_key) WHERE dedupe_key IS NOT NULL` — `emit_journey_event` usa `ON CONFLICT ... WHERE dedupe_key IS NOT NULL DO NOTHING` para bater com o índice.
- `journey_touchpoints` — cada interação por canal, gerado por trigger.
- `lead_sources` — snapshot atribuição (first/last touch, campaign, channels_used[]).
- `lead_sessions` — agrupamento cronológico.
- View compat `lead_journey_events` (security_invoker) = `journey_events WHERE subject_type='lead'`.
- Click ids em `leads`: `ctwa_clid`, `fbclid`, `gclid`, `ttclid`, `li_fat_id`.

**Bus:**
- SQL: `public.emit_journey_event(...)` — SECURITY DEFINER, retorna id; conflito por dedupe = no-op.
- Wrapper legado: `public.log_journey_event(p_org, p_lead, p_type text, p_category text, ...)` faz cast text→enum e chama `emit_journey_event`.
- Edge: `_shared/journey-bus.ts` — `publishJourneyEvent` (nunca lança) e `fireAndForgetJourneyEvent` (via `EdgeRuntime.waitUntil`).

**Trigger de derivação `journey_derive_touchpoint`:** cria touchpoint + upsert em `lead_sources` (first/last touch, touch_count, channels_used único) sempre que evento tem `lead_id` + `channel` + categoria ∈ {origin,contact,attendance,meeting,sale}.

**Triggers publicando no bus (Fase 2 + 4):**
- `lead_transfer_history`, `lead_notes`, `lead_tag_assignments`, `lead_stage_history`, `leads` (update), `deals`, `tasks`, `calendar_events`, `webchat_conversations`, `webchat_messages`, `form_submissions`, `cadence_enrollments`, `cadence_step_runs` (Fase 2).
- `agent_handoff_history` → `ai_handoff` / `human_handoff` (Fase 4).
- `agent_action_logs` → `agent_tool_executed` (Fase 4, só quando lead_id não nulo).
- `hotmart_orders` → `sale_completed` / `sale_cancelled` / `sale_refunded` (Fase 4, resolve lead por buyer_email).
- `cakto_orders` → idem (Fase 4).
- `commissions` → `commission_created` (Fase 4, resolve lead via `deals.lead_id`).

**Leitura:** `src/lib/leadJourney.ts` usa a view `lead_journey_events`. Futuras jornadas (customer, user, organization) consultam `journey_events` filtrando por `subject_type`.

**Fases pendentes:** Fase 5 (UI Marketing Meta + cron), Fase 6 (views materializadas de atribuição/canal/funil), Fase 7 (UI Replay/Atribuição/Marketing Performance), Fase 8 (jornadas de customer/user/organization), Fase 9 (retenção/particionamento/BI export).
