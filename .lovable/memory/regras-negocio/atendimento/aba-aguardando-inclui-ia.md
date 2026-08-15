---
name: Aba "Em Fila" inclui IA atendendo
description: RPC inbox_list_conversations + counts tratam bot_active como "Em Fila"; IA atendendo permanece visível para todo o setor
type: feature
---
Regra: enquanto a IA atende, a conversa precisa permanecer **EM FILA** para que qualquer humano do setor possa assumir.

- `inbox_list_conversations` (RPC):
  - `attending` → `status = 'human_active'`
  - `waiting` → `status IN ('waiting_human','bot_active')`
  - `resolved` → `status = 'closed'`
- `inbox_count_conversations`: mesmos filtros (counts batem com a lista).
- `ConversationList.tsx` (counts client-side): idem.

Aceite manual em qualquer estado de fila:
- `SellerInbox.needsAccept` libera o botão **Aceitar Atendimento** quando `status IN ('waiting','waiting_human','bot_active')` e não há `assigned_user_id`.
- Humano pode assumir mesmo enquanto a IA atende; backend `webchat-inbox` (action `accept`) seta `status='human_active'`, `assigned_user_id`, `sector_id` e zera `current_agent_id` (trigger `enforce_single_attendant` reforça).

Handoff IA → humano (`webchat-bot`):
- Tool `transfer_to_human` e blocos `handoff` setam: `status='waiting_human'`, `current_agent_id=null`, `assigned_user_id=null`, `needs_human=true`.
- Guarda no início do `webchat-bot` bloqueia IA quando `status IN ('waiting_human','human_active')` → se lead chamar de novo, IA não retoma.
