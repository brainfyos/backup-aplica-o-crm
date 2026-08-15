---
name: WhatsApp Booking Confirmations, Reminders & AI Reply
description: Confirmação + lembretes WhatsApp por event type, com IA tratando respostas livres (confirma/remarca/cancela/follow-up)
type: feature
---

Fluxo completo de comunicação WhatsApp do agendamento, por tipo de evento (Agendamentos → Tipos de Evento → Notificações):

- **Confirmação imediata**: enviada via `booking-dispatcher` ao criar booking. Template padrão usa `{{nome_lead}} {{nome_evento}} {{empresa}} {{data}} {{hora}} {{modalidade}}` com botões 1️⃣/2️⃣/3️⃣.
- **Lembretes customizáveis**: `booking_reminders` aceita N lembretes por evento (offset_value + unit minutes|hours|days). Trigger `seed_default_booking_reminders` cria 3 padrão ao criar event type: 1 dia antes (segunda confirmação), 30 min antes (lembrete), 5 min antes (link da reunião).
- **Link da reunião** (`{{link_reuniao}}`): resolvido em cascata pelo `booking-dispatcher` — Google Meet (`calendar_events.meet_link`) → `booking_event_types.location_details` se URL → vazio. `modalidade` mapeada do `location_type` (google_meet/zoom/teams/phone/in_person/custom). `empresa` lida de `organizations.name`.
- **Respostas 1/2/3**: tratadas direto no `evolution-webhook` → atualiza `booking_requests.status` (confirmado/reagendamento_solicitado/cancelado).
- **Respostas em texto livre**: o webhook delega para `booking-reply-ai` (Lovable Gateway via `ai-router`, persona SPIN, 2 linhas máx). Tools nativas:
  - `confirm_booking`
  - `reschedule_booking(new_start_iso)` — atualiza `booking_requests` + `calendar_events`
  - `cancel_booking(reason)`
  - `propose_followup(when_iso, reason)` — cria task tipo `callback` para o host com `due_date=when_iso` e cancela booking atual
- A IA também envia resposta curta de volta ao lead pela mesma instância Evolution.
