---
name: WhatsApp envio - fallback JID confirmado
description: evolution-send tenta variantes de telefone, JIDs confirmados do inbound (incluindo sem DDI), e wa_lid antes de WHATSAPP_VALIDATION_UNRELIABLE
type: feature
---

Quando Evolution Go recusa `send/text|media` com "not registered on WhatsApp" (comum em números BR válidos, especialmente DDD 51), `evolution-send` tenta em ordem:

1. Telefone original 13 dígitos (`5551968763758`).
2. Variante 12 dígitos sem 9 (`555168763758`).
3. **JIDs confirmados**: `metadata.wa_confirmed_jids`/`wa_confirmed_jid` da conversa. Guardar o JID cru do provider e variações BR com/sem DDI 55 e com/sem 9 (ex.: `51968763758@s.whatsapp.net` e `5551968763758@s.whatsapp.net`). Passar o JID no campo `number` tenta pular o pré-check `onWhatsApp`. Fallback também lê `processed_messages.remote_jid` ligado aos últimos inbound `webchat_messages.metadata.evolution_message_id` para conversas legadas sem metadata.
4. `wa_lid` (`@lid`) quando o inbound veio como LID.

Só depois de tudo isso retorna `WHATSAPP_VALIDATION_UNRELIABLE` com `has_recent_inbound` para o front mostrar o banner amigável.

`evolution-webhook` grava `wa_confirmed_jid` e `wa_confirmed_jids` em `webchat_conversations.metadata` em toda mensagem inbound não-LID e não-grupo (existing conv update + new conv insert), e passa sempre `conversation_id` ao chamar `evolution-send` nos envios do bot/funil.
