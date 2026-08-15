---
name: Dedupe do eco outbound WhatsApp (Evolution)
description: Índice único por (conversation_id, metadata.external_id) impede gravar 2x a mesma mensagem enviada; histórico do bot usa as ÚLTIMAS 80 mensagens
type: feature
---

Problema (30/07/2026): toda resposta da IA era gravada 2x em `webchat_messages` — a nossa linha (`metadata.provider=evolution`) e o eco da Evolution (`metadata.source=external_device`, mesmo `external_id`). Os dedupes por consulta perdiam a corrida (diferença de 1ms a 800ms). O histórico duplicado fazia o modelo repetir perguntas.

Correções:
- Índice único parcial `webchat_messages_outbound_external_id_uniq` em `(conversation_id, metadata->>'external_id')` where `direction='outbound'`.
- `evolution-webhook` (bloco `external_outbound`): espera 1,5s e recheca `external_id` + conteúdo (90s) antes de inserir; erro `23505` é tratado como eco (200 ok), nunca 500.
- `webchat-bot`: histórico busca `ascending:false` + `limit(80)` e reverte em memória (antes pegava as PRIMEIRAS 80). Dedupe defensivo em memória por `external_id`/conteúdo consecutivo.
- `humanizer.ts`: gíria no máximo 1 a cada 3 mensagens, proibida em respostas objetivas/objeção/preço; bloco "MEMÓRIA DA CONVERSA" proíbe repetir pergunta já respondida.
- `org_ai_routing.agent_chat` voltou para `google/gemini-3-flash-preview` (o 2.5-flash de 27/07 era regressão).
