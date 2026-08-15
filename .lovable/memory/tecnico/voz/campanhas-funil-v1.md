---
name: Campanhas de Voz Funil v1
description: Wizard multi-step + webhook público + tools na ligação + jornada rastreável do lead
type: feature
---

## Arquitetura

### Wizard `VoiceCampaignWizard` (5 passos)
1. Básico (nome, descrição, produto)
2. Agente & Voz (perfil de voz = product_agent + Grok voice + contexto extra)
3. Público (etiquetas exigidas / etiquetas para excluir, RPC `count_voice_campaign_audience`)
4. Discagem (números origem, estratégia round_robin|random, simultâneas, tentativas, retry, business_hours_only, timezone, scheduled_at)
5. Pós-call (regras por outcome: adicionar etiquetas, criar tarefa — armazenadas em `voice_campaigns.post_call_actions.rules`)

### Novas tabelas
- `voice_campaign_journeys` — timeline de cada lead na campanha (`stage`: enrolled|dialing|talked|chose_meeting|chose_whatsapp|chose_sms|chose_email|chose_checkout|lost|no_answer)
- `voice_inbound_webhooks` — endpoint público com token; `mode`: enroll_campaign|call_immediate|call_scheduled; `field_mapping` JSON

### Colunas novas em `voice_campaigns`
`product_id`, `audience_filters`, `exclusion_filters`, `context_id`, `dial_numbers`, `dial_strategy`, `business_hours_only`, `timezone`, `scheduled_at`, `post_call_actions`, `source_webhook_id`, `totals`.
`voice_campaign_targets.journey_id` opcional.

### Edge Functions
- `voice-inbound-lead` (verify_jwt=false, token no query) — upsert lead por telefone, aplica UTMs + tags padrão, cria journey `enrolled`, insere `voice_campaign_targets` conforme `mode`. Log em `webhook_logs`.
- `voice-tool-dispatch` — chamado pelo `xai-voice-webhook` quando o agente Grok aciona uma tool durante a ligação. Grava journey (`chose_*`), dispara ação (calendar_events, manual-outreach para WhatsApp).
- Patches: `xai-voice-call-start` injeta `tools` quando body traz `campaign_id`; `voice-campaign-tick` respeita `business_hours_only` (09-18 seg-sex no `timezone`), `scheduled_at`, `dial_numbers`+`dial_strategy`, e envia tools no payload xAI; `xai-voice-webhook` roteia `tool.call`/`tool_call` para `voice-tool-dispatch`.

### Tools Grok durante a ligação
`agendar_reuniao(slot_iso)`, `enviar_link_whatsapp(link,message?)`, `enviar_link_sms(link)`, `enviar_link_email(link)`, `finalizar_compra(offer_id,channel?)`, `marcar_desinteresse(motivo?)`.

### RPC
`count_voice_campaign_audience(p_org, p_filters, p_exclusions)` retorna audience/excluded/will_receive respeitando RLS (SECURITY DEFINER checa membership).

### UI Admin › Voz
Nova aba **Webhooks** (entre Campanhas e Recebidas). `VoiceCampaignDetail` (KPIs + abas Leads/Timeline/Ligações/Config) substitui o antigo Dialog de leads.

### Retrocompatibilidade
Todos os campos novos são nullable/têm default. Campanhas antigas seguem funcionando; wizard preenche defaults.
