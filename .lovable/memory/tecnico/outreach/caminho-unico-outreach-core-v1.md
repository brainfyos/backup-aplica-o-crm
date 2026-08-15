---
name: Caminho único de outreach via outreach-core
description: Todo envio automático de primeira mensagem por IA (webhook, cadência, formulário, manual, Bizon) DEVE passar por `_shared/outreach-core.ts` → `processOutreachTarget`. Proibido criar caminhos paralelos que chamem `evolution-send`/Meta direto e escrevam em `webchat_conversations`/`webchat_messages` sem `evolution_instance_id`/`meta_connection_id`/`delivery_status`/`external_id`/`last_message_at`.
type: preference
---

Fonte de verdade única para outreach IA: `supabase/functions/_shared/outreach-core.ts` (`processOutreachTarget` + `createOutreachCache`).

**Regra:** Qualquer fluxo que precise disparar a 1ª mensagem de um agente (ou reenviar) chama `processOutreachTarget` — nunca chama `evolution-send`/Meta direto nem insere manualmente em `webchat_conversations` / `webchat_messages`.

**Por quê:** o caminho canônico entrega automaticamente:
- Respeita conexão vinculada ao agente (`product_agent_connections`) — Evolution Go OU Meta WhatsApp Cloud.
- Cria conversa com `evolution_instance_id` OU `meta_connection_id` preenchido.
- Grava mensagem com `delivery_status='sent'`, `external_id`/`wamid`, `metadata.provider`.
- Atualiza `last_message_at` (necessário para a conversa aparecer no topo do Inbox).
- Dedupe de 24h por lead+agente, bot-loop guard, opt-out do WhatsApp.
- Template HSM automático fora da janela 24h.
- Notificação ao vendedor em caso de falha definitiva.

**Como aplicar:** consumidores atuais — `manual-outreach`, `manual-outreach-batch`, `cadence-tick`, `form-submit` (action `start_ai_outreach`), `webhook-receiver` (`ai_agent_outreach`). Novas integrações devem seguir o mesmo padrão. Configurações específicas do consumidor (ex.: `followup_steps` do webhook) são aplicadas via UPDATE em `ai_outreach_queue` DEPOIS do `processOutreachTarget`, nunca reimplementando o envio.
