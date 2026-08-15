---
name: Instagram Automations ManyChat-style v1
description: Builder visual de fluxos para IG (comentários, DM, story, menção) com engine dedicada e integração ao webhook e envio do IG
type: feature
---

# Automações do Instagram (ManyChat-style) — v1

## Tabelas
- `instagram_flows` — fluxo visual: `trigger_type` (comment_keyword|dm_keyword|story_reply|mention|manual|new_follower), `trigger_config` jsonb, `flow_blocks` jsonb, `start_block_id`, `throttle_per_sender_hours`.
- `instagram_flow_runs` — auditoria (`trigger_source`, `source_id`, `sender_ig_id`, `conversation_id`, `status`, `error`, `payload`).
- `instagram_comment_replies` — dedup `(connection_id, comment_id)` para nunca responder o mesmo comentário 2×.
- `instagram_connections.subscribed_fields` — text[] com campos inscritos na Meta.

## Backend
- `instagram-connect`: agora inscreve `messages,messaging_postbacks,message_reactions,comments,mentions,feed`.
- `instagram-webhook`:
  - `handleChange` processa `changes[*].field = 'comments'|'mentions'`, resolve fluxos ativos e dispara `ig-flow-executor`.
  - Em DMs inbound, tenta casar fluxos `dm_keyword`/`story_reply` antes do `webchat-bot`. Se algum fluxo casa, pula o bot padrão.
- `ig-flow-executor` (novo): percorre blocos linearmente, aplica throttle por sender, grava run.
- `instagram-send` ampliado com `type: comment_reply | private_reply | like_comment | dm`, `quick_replies`, `buttons`.

## Blocos suportados (MVP)
`ig_reply_comment`, `ig_private_reply`, `ig_like_comment`, `ig_send_dm`, `ai_takeover`, `wait`, `apply_tag`, `condition_text`.

## Frontend
- Menu: Automação & IA → "Fluxos do Instagram" (`instagram-automations`).
- `InstagramAutomationsSection` — lista com status/gatilho/conta; banner "Conecte primeiro" se não há `instagram_connections` ativa.
- `NewInstagramFlowDialog` — wizard rápido (nome + gatilho + keywords + conta).
- `InstagramFlowBuilder` — tabs Fluxo/Gatilho/Execuções/Config. Editor de blocos como lista ordenada (up/down/remove/inline edit) — rewire automático de `next_block_id` em cadeia linear.

## Regras
- Dedup por `(connection_id, comment_id)`; skip se `from.id == ig_business_account_id`.
- Throttle default 24h por `sender_ig_id`.
- Private reply requer `comment_id` (Meta: janela 7d).
- Rota do webhook (path connection_id) e HMAC via `app_secret` inalterados.
