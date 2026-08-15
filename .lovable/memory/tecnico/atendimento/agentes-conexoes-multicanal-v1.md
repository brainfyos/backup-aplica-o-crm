---
name: Agentes IA — Conexões dedicadas multi-canal
description: Tabela product_agent_connections vincula agente a N conexões de 3 tipos (evolution/meta_whatsapp/instagram); webchat-bot resolve agente por essas conexões, com fallback legado em product_agents.evolution_instance_id
type: feature
---

Agentes podem ser fixados em uma ou mais conexões (multi-canal):
- Tabela: `public.product_agent_connections (agent_id, connection_type ∈ {evolution|meta_whatsapp|instagram}, connection_id, organization_id)`, UNIQUE(agent_id,type,id).
- UI: aba *Canais* do `AgentEditor.tsx` mostra 3 grupos com checkboxes (Evolution / Meta WA / Instagram). Vazio = "qualquer conexão (padrão)".
- Persistência: `useCreateAgent`/`useUpdateAgent` chamam `syncAgentConnections(agentId, orgId, dedicated_connections)` (delete-all + insert). Campo `dedicated_connections` é transiente em `ProductAgent` e ignorado pelo whitelist `PRODUCT_AGENTS_COLUMNS`.
- Backfill: migração inicial copiou `product_agents.evolution_instance_id` para a tabela nova; coluna legado preservada.
- Lookup no `webchat-bot/index.ts` (linhas ~1532+): após guard do orchestrator, monta pares dos 3 `*_connection_id` da conversa e procura na junção; fallback legado por `eq('evolution_instance_id', ...)` em `product_agents`.
- AgentCard mostra label da única conexão ou "N conexões dedicadas".
- Para manter código legado funcionando, ao salvar via UI, a 1ª Evolution selecionada também grava em `evolution_instance_id`.
