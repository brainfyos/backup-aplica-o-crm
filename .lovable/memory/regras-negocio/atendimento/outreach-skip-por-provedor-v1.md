---
name: Outreach skip humano escopado por provedor
description: manual-outreach só pula envio por human_active/waiting_human se a conversa for do mesmo provedor/conexão do envio (Meta vs Evolution são caixas separadas)
type: feature
---

`manual-outreach` busca `existingConv` filtrando por provedor/conexão do envio:
- `connection_type='meta_whatsapp'` + `instance_id` (meta_connection_id) → filtra `meta_connection_id = instance_id`.
- `connection_type='evolution'` + `instance_id` → filtra `evolution_instance_id = instance_id AND meta_connection_id IS NULL`.

Consequência: lead com conversa Evolution em `human_active` NÃO bloqueia mais campanha pela API Oficial Meta (e vice-versa). Skip "Conversation in human_active/waiting_human", dedupe outreach e `is_within_24h_window` passam a usar a conversa do provedor correto.

Guards globais por lead permanecem: `whatsapp_opt_in=false`, `bot_loop_detected_at`, telefone inválido.
