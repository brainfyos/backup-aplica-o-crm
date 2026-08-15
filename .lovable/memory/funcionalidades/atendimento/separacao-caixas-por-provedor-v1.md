---
name: Inbox — separação de caixas por provedor
description: Inbox distingue WhatsApp QR (Evolution), WhatsApp Oficial (Meta Cloud) e Instagram via helper resolveProvider; ícones, rótulos e seleção de conexão de origem em Nova Conversa.
type: feature
---

Helper canônico: `src/lib/conversationProvider.ts` → `resolveProvider({channel, meta_connection_id, instagram_connection_id, evolution_instance_id})` retorna `webchat | whatsapp_evolution | whatsapp_meta | instagram | email | sms | unknown`. Prioridade: instagram_connection_id > meta_connection_id > channel.

`ChannelBadge` aceita `provider` ou `conversation` (channel legado mantido). Variante `whatsapp_meta` mostra ícone verde-escuro com `BadgeCheck` sobreposto. Cards da Inbox (`ConversationList`) usam `providerIcon`/`providerAvatarBadgeClass` baseados em `resolveProvider(conv)`.

RPC `public.inbox_list_conversations` retorna `meta_connection_id` e `instagram_connection_id`; `webchat-inbox` repassa; `SellerInbox` injeta nos Conversation e no fallback fetch direto. `buildConnectionLabel` resolve label real por provedor (Meta → display_name+phone, IG → @username, Evolution → metadata.display_name+phone) e NUNCA cai em fallback "primeira instância" — antes mostrava Evolution em conversa Meta.

`start-whatsapp-conversation` aceita `{provider: 'meta'|'evolution', connection_id}`. Filtra busca de conversa existente por provedor (eq meta_connection_id ou is null) para nunca reusar conversa Evolution quando o usuário pediu Meta. Cria conversa nova com a coluna correta. Envio inicial roteia para `meta-whatsapp-send` ou `evolution-send`. Compat: sem provider → comportamento legado.

`StartConversationDialog` lista conexões ativas (Evolution + Meta) em Select "Enviar por" e manda `provider`+`connection_id` no payload.
