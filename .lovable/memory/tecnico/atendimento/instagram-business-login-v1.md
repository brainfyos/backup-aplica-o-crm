---
name: Instagram Business Login (novo padrão)
description: Conexão IG BYO agora suporta 2 modos via `ig_auth_style` — `page_token` (legado, graph.facebook.com) e `ig_user_token` (novo, graph.instagram.com com IG User/System User Token)
type: feature
---

`instagram_connections.ig_auth_style` (default `page_token`) decide qual caminho as edge functions usam:

- `ig_user_token`: usa `_shared/ig-graph.ts` (`https://graph.instagram.com/v21.0`) com `ig_user_access_token_encrypted`. Endpoints keyed por `ig_business_account_id` (`/{ig_id}/messages`, `/{ig_id}/subscribed_apps`, `/me/media`). Não exige `fb_page_id`. Escopos: `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`, `instagram_business_content_publish`. System User Token permanente serve.
- `page_token`: caminho antigo (Facebook Login for Business) intocado — usa `_shared/ig-subscribe.ts` + `_shared/meta-graph.ts` com Page Access Token e escopos `pages_manage_metadata`/`pages_messaging`.

Edge functions afetadas (todas ramificam por `conn.ig_auth_style`): `instagram-connect`, `instagram-test`, `instagram-send`, `instagram-list-media`, `instagram-subscribe-fields`, `instagram-webhook` (só a chamada de profile lookup em `handleEvent`).

Wizard (`InstagramWizard.tsx`) mostra RadioGroup no step 1 e formulário condicional no step 4. Default = `ig_user_token`.
