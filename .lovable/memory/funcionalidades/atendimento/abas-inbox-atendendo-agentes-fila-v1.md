---
name: Abas do Inbox — Atendendo / Agentes / Em Fila
description: Inbox tem 3 abas (humano / IA / fila) com permissão para "Agentes"; "Resolvidos" virou toggle no drawer de filtros
type: feature
---

Inbox (`ConversationList` + `SellerInbox`) usa quatro valores de `activeTab`:
- `attending` → `status='human_active'` (humano atendendo)
- `agents` → `status='bot_active'` OU (`waiting_human` com `current_agent_id`) — visível só se `view_ai_agents_tab=true` (ou admin/super_admin). Configurada em Permissões.
- `waiting` → `status='waiting_human' AND current_agent_id IS NULL` (fila real, sem IA)
- `resolved` → não tem botão de aba; é acionada via `filters.showResolved` (toggle "Ver Resolvidos" no `InboxFiltersDrawer`, seção Status). Quando ligado, `SellerInbox` sobrescreve `tab='resolved'` no `inboxFilters`.

RPCs `inbox_list_conversations` e `inbox_count_conversations` aceitam `p_tab='agents'`; counts retorna `{attending, agents, waiting, resolved}`. Edge `webchat-inbox` repassa.
