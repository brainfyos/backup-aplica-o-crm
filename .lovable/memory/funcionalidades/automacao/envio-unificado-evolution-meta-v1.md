---
name: Unified WhatsApp Senders Campaigns & Cadences
description: Campanhas e Cadências enviam por Evolution ou Meta WhatsApp via connection_type unificado
type: feature
---
CampaignWizard lista Evolution + Meta em "5. Números de envio" (carrega de `evolution_instances` e `whatsapp_meta_connections`); `instance_distribution` salva `{ instance_id, connection_type, weight }`. `campaign_targets.connection_type` (default 'evolution') é persistido em campaign-start e repassado pelo dispatcher.
CadenceWizard busca agentes de `product_agents` (não webchat_agent_configs). Cadência NÃO seleciona número: o cadence-tick usa `_shared/agent-connection.ts → resolveAgentSendConnection` (Evolution conectada > Meta conectada > primeira ativa > legacy `product_agents.evolution_instance_id` > primeira Evolution conectada da org).
manual-outreach aceita `connection_type` (default 'evolution') e roteia: evolution → `evolution-send`; meta_whatsapp → `meta-whatsapp-send` (body `{ organization_id, connection_id, to, type:'text', text }`).
