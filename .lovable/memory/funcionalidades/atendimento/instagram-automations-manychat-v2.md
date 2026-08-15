---
name: Instagram ManyChat-style Automations v3
description: Fluxos IG com IA generativa, dry-run, blocos enroll_cadence + assign_lead e disparo manual "Testar agora"
type: feature
---

Blocos suportados no `ig-flow-executor` (execute + simulate):
- ig_reply_comment, ig_private_reply, ig_like_comment, ig_send_dm, ai_takeover, wait
- apply_tag (tag_id) — usa `webchat_conversations.lead_id` → `lead_tag_assignments`
- enroll_cadence (cadence_id) — invoca `cadence-enroll` para o lead da conversa
- assign_lead (sector_id/user_id) — atualiza `leads` + `webchat_conversations`
- condition_text (keywords/match) — ramificação

Gerador IA (`instagram-flow-generate-ai`): resolve por nome → id para tags, cadências e setores/vendedores; sugestões não resolvidas ficam em `*_pending` para o usuário corrigir. Prompt injeta listas ativas de tags/cadências/setores da org.

Trigger `manual`: aba Gatilho mostra botão "Testar agora" que chama `ig-flow-executor` com `trigger_source=manual_test` (sem dry_run — dispara realmente para debug).

Builder: `useCadences()` retorna `{ cadences }`, `useSectors()` retorna `useQuery` com `data`. `BlockEditor` recebe `cadences` e `sectors` como props.

name: Instagram Automations ManyChat-style v2
description: Builder + gerador com IA + preview dry-run + post picker + reassinar campos webhook; permite criar fluxos sem conexão IG (rascunho)
type: feature
---

# Automações do Instagram (ManyChat-style) — v2

Estende v1 com:

## Novas edge functions
- `instagram-subscribe-fields` — re-assina campos (`messages,messaging_postbacks,message_reactions,comments,mentions,feed`) numa conexão IG já ativa sem refazer OAuth. Botão "Reassinar" na página de automações quando `subscribed_fields` não contém `comments`.
- `instagram-list-media` — lista últimos 25 posts/reels via Graph `/{ig_id}/media` para o post picker.
- `instagram-flow-generate-ai` — gera um `instagram_flow` completo a partir de descrição em linguagem natural. Usa `ai-router` (respeita plano/pool/chave própria). Aceita `existing_flow_id` para modo "Refinar com IA". Retorna `warnings[]` que a UI exibe como toasts amarelos. Resolve `apply_tag { tag_name }` → `tag_id` procurando em `lead_tags` da org.

## `ig-flow-executor` ampliado
- **Dedup**: antes de executar, `INSERT` em `instagram_comment_replies (connection_id, comment_id)`; se conflito `23505`, retorna `skipped=duplicate_comment`.
- **Dry-run** (`dry_run: true`): não invoca `instagram-send`; retorna `plan[]` descrevendo cada bloco (`{block_id, type, action, preview}`). Alimenta a aba Preview no builder.

## Frontend
- `AIFlowGeneratorDialog` — textarea + 3 exemplos clicáveis + warnings. Usado no botão "Gerar com IA" da listagem E no "Refinar com IA" dentro do builder.
- `InstagramPostPicker` — grid de thumbs (aspect-square) com seleção múltipla; usa `useInstagramMedia(connectionId)`.
- Nova aba **Preview** no builder: input de texto + botão "Executar" que roda `dry_run` e mostra plano numerado.
- Novos blocos no catálogo: `apply_tag` (com Select de `useLeadTags`), `condition_text` (keywords + match). Se IA sugerir tag inexistente, mostra `tag_id_pending` como alerta.
- Página lista permite criar fluxo mesmo SEM conexão IG (banner amber informativo com link para Integrações, mas botões liberados).
- Banner laranja "Reassinar campos" para cada conexão ativa sem `comments` em `subscribed_fields`.

## Regras / gotchas
- Toda tag gerada por `apply_tag` grava `lead_tag_assignments.source = 'automation'`.
- `condition_text` ramifica: se bater vai pro próximo, senão pra `false_next_block_id` (ainda linear no builder atual — false path termina o fluxo).
- Executor faz dedup ANTES do throttle para evitar contar rerun de webhook como uso.

