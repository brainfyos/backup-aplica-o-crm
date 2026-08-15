---
name: WhatsApp Meta Cloud API (BYO App) — wizard 5 passos
description: Provedor oficial Meta WhatsApp Cloud API multi-tenant BYO. Cada empresa cria o próprio Meta App e cola credenciais no painel. Wizard de 5 passos com rascunho criado cedo para exibir URL+verify_token antes das credenciais.
type: feature
---

## Arquitetura
- Tabelas: `whatsapp_meta_connections` (1 por número, status pode ser `draft|pending|active|error|revoked`), `whatsapp_meta_templates`, `whatsapp_meta_webhook_logs`.
- Coluna `webhook_subscribed_at` registra quando a Meta validou o webhook (handshake GET aceito).
- Em rascunho, `phone_number_id/waba_id/app_id/app_secret_encrypted/access_token_encrypted` ficam nulos — só `webhook_verify_token` e `display_name`.
- Bucket privado `whatsapp-meta-media`.

## Cofre de credenciais
- App ID/Secret, Access Token, Verify Token criptografados AES-256-GCM via `_shared/meta-crypto.ts`.
- Chave-mestre em `platform_settings.meta_wa_master_key`, gerada por RPC `get_or_create_meta_master_key`.

## Edge Functions
- `meta-whatsapp-draft` (verify_jwt=true): cria/retoma conexão `status='draft'`, gera `verify_token` único e devolve `{ connection_id, verify_token, webhook_url }` com URL no formato `/functions/v1/meta-whatsapp-webhook/{connection_id}`.
- `meta-whatsapp-webhook` (verify_jwt=false): aceita `connection_id` no path. GET valida `verify_token` da conexão pinada e marca `webhook_subscribed_at`. POST valida HMAC SHA-256 com o `app_secret` daquela conexão (mais seguro que resolver por `phone_number_id` do payload). Fallback retrocompat para URL antiga sem path id.
- `meta-whatsapp-connect`: promove rascunho a `active`. Valida `/{phone_number_id}` e `/{waba_id}` no Graph v21.0. Não regenera `verify_token`.
- `meta-whatsapp-send` / `-templates-sync` / `-template-submit` / `-test`: inalterados.

## UI — Wizard 5 passos
1. Antes de começar (pré-requisitos + aviso de número).
2. Crie seu App Meta (instruções + nome da conexão). Ao avançar, chama `meta-whatsapp-draft`.
3. Configure o Webhook (mostra URL+token copiáveis + onde colar; polling de `webhook_subscribed_at` a cada 4s).
4. Pegue suas credenciais (tutorial App ID/Secret/Phone/WABA/System User token).
5. Valide e salve (form + resumo do webhook; chama `meta-whatsapp-connect` com `connection_id` do rascunho).

Checklist lateral + Popover "Ver guia rápido". Editar conexão `draft` reabre no passo 3; editar `active` abre no passo 5.

`NewConnectionDialog`: card "WhatsApp Oficial (Meta Cloud API)" com badge `Avançado`.

## Constraints
- Linguagem BYO: "seu próprio Meta App", "credenciais criptografadas", nunca "App central do Vendus".
- mTLS desativado por padrão.
- Telefones via `_shared/phone.ts` (DDI 55).
