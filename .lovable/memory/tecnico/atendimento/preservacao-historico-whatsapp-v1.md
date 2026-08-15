---
name: Isolamento de caixas e regra de encerramento (WhatsApp/Meta/IG)
description: Cada conexão (instância Evolution, Meta Cloud, Instagram) é caixa independente; conversa encerrada NUNCA reabre automaticamente; nova mensagem após "Resolvido" cria conversa nova; reabertura é manual via aba Resolvidos
type: feature
---

## Regra

Cada **caixa** = (organização, canal, conexão). Conexão é:
- `evolution_instance_id` para WhatsApp QR
- `meta_connection_id` para WhatsApp Oficial (Meta Cloud)
- `instagram_connection_id` para Instagram Direct

Nunca se reaproveita conversa entre caixas diferentes — mesmo número entrando por 2 caixas gera 2 conversas separadas, ambas linkadas ao mesmo `lead_id`. Histórico do lead segue acessível via aba Histórico do lead.

**Encerrada = arquivada.** Nova mensagem do lead após encerramento sempre cria conversa nova. Atendente continua podendo reabrir manualmente pela aba "Resolvidos" da inbox.

## Implementação (webhooks de entrada)

Todos os 3 webhooks filtram lookup por:
1. Identidade da caixa (`evolution_instance_id` OU `meta_connection_id` OU `instagram_connection_id`).
2. Os outros 2 IDs são `IS NULL` (não invade caixa alheia).
3. `.neq('status', 'closed')` (não reabre encerrada).
4. `closed_at: null` foi removido de todos os updates.

Arquivos:
- `supabase/functions/meta-whatsapp-webhook/index.ts` (handleInboundMessage)
- `supabase/functions/evolution-webhook/index.ts` (4 sites: inbound msg, outbound externo, race 23505 x2, safety-net de close)
- `supabase/functions/instagram-webhook/index.ts` (handleEvent)

Safety-net de auto-close em `evolution-webhook` agora restrito à MESMA instância — nunca toca caixas Meta/IG ou outras instâncias.

## Banco

Índice único antigo `webchat_conv_open_phone_unique(org, channel, phone) WHERE status<>closed` foi **substituído** por `webchat_conv_open_phone_per_box_unique(org, channel, phone, COALESCE(evolution_instance_id, '0..0'::uuid), COALESCE(meta_connection_id, '0..0'::uuid)) WHERE status<>closed AND phone NOT NULL` — permite múltiplas conversas abertas mesmo número desde que em caixas diferentes.

## O que NÃO foi alterado

- Reabertura manual via Inbox (aba Resolvidos) continua funcionando.
- IA segue com acesso ao histórico completo do lead via `lead_id` (não depende de mesma `conversation_id`).
- Conversas antigas pré-correção permanecem como estão — sem migração destrutiva.
- Outbound (`start-whatsapp-conversation` + seletor de conexão) já corrigido em rodada anterior.
