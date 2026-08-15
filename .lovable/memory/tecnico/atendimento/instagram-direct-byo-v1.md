---
name: Instagram Direct BYO v2
description: Instagram Direct (Meta) BYO multi-tenant com webhook path-based (/instagram-webhook/{connection_id}), wizard de 5 passos com modo draft + polling, App Secret e Page Access Token criptografados AES-GCM
type: feature
---

Provedor Instagram Direct oficial (Meta Messaging) totalmente separado do WhatsApp Oficial. Cada parceiro usa seu próprio Meta App, sua Página do Facebook e sua conta Instagram Business/Creator.

## Tabelas
- `instagram_connections` — status: `draft | active | error | revoked`. Campos: `app_id`, `app_secret_encrypted`, `fb_page_id`, `fb_page_name`, `ig_business_account_id`, `ig_username`, `page_access_token_encrypted`, `webhook_verify_token` (texto claro), `webhook_subscribed_at`, `last_inbound_at`, `last_error`. Unique parcial em `ig_business_account_id` quando `status='active'`.
- `instagram_webhook_logs` — auditoria de payloads recebidos (`signature_valid`, `event_type`, `payload`).
- `webchat_conversations.instagram_connection_id` + `ig_sender_id` para vincular conversa → conexão IG.
- `webchat_messages.ig_message_id` (unique parcial) para deduplicar.
- Bucket privado `instagram-media` para mídias.

## Edge Functions
- `instagram-draft` (JWT) — cria/retoma conexão em `status='draft'`, devolve `connection_id`, `verify_token`, `webhook_url` único.
- `instagram-webhook` (público, `verify_jwt=false`) — path `/instagram-webhook/{connection_id}`. GET valida `hub.verify_token` contra `webhook_verify_token` da conexão e marca `webhook_subscribed_at`. POST valida `X-Hub-Signature-256` via HMAC-SHA256 com `app_secret` descriptografado da conexão, depois roteia eventos para `webchat_conversations` (canal `instagram`) e dispara `webchat-bot` + `instagram-send`.
- `instagram-connect` (JWT) — promove draft→active, valida Page Access Token via Graph API, criptografa segredos, inscreve a página em `subscribed_apps` (campos `messages,messaging_postbacks,message_reactions`).
- `instagram-test` (JWT) — health-check chamando `/me?fields=username` na Graph.
- `instagram-send` (JWT) — envia DM via `POST /{page_id}/messages`, respeita janela 24h via RPC `is_within_24h_window`.

## Wizard 5 passos (`InstagramWizard.tsx`)
1. Pré-requisitos + aviso explícito de separação do WhatsApp.
2. Criar Meta App + nome da conexão.
3. Webhook: mostra URL e Verify Token únicos, polling de 3s em `webhook_subscribed_at`.
4. Credenciais: App ID, App Secret, FB Page ID, IG Business Account ID, Page Access Token.
5. Resumo + "Validar e ativar".

## Separação total do WhatsApp Oficial
- Função separada (`instagram-webhook` vs `meta-whatsapp-webhook`).
- Tabela separada (`instagram_connections` vs `whatsapp_meta_connections`).
- URL separada por path.
- Token de verificação separado por conexão.
- Identificadores diferentes (`ig_business_account_id` vs `phone_number_id`).
- Evento Meta diferente: assina `messages` no produto Instagram, não no WABA.

## Compartilhado
- Chave-mestre AES-GCM em `platform_settings.meta_wa_master_key` (RPC `get_or_create_meta_master_key`).
- Helpers `_shared/meta-crypto.ts` (encrypt/decrypt, `generateVerifyToken`) e `_shared/meta-graph.ts` (`graphFetch`, `hmacSha256Hex`, `timingSafeEqual`).
