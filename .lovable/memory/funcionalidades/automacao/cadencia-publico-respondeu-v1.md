---
name: Cadência — público por resposta
description: Etapa de cadência escolhe público (todos / respondeu / não respondeu) e o canal é consequência automática
type: feature
---
Cada etapa de cadência tem `conditions.audience` = `all` | `responded` | `no_reply` e `conditions.reply_since` = `enrollment` | `previous_step`.

- `responded` → só quem tem inbound após o marco. O inbound de botão que originou a inscrição também conta.
- `no_reply` → só quem não respondeu após o marco.
- `all` → todos os inscritos ativos.

Público e janela Meta são independentes. Depois de validar o público, o motor envia mensagem livre com janela aberta ou template HSM com janela fechada. `window_requirement` legado não bloqueia a execução. Filtros extras: `only_if_no_purchase`, `only_if_not_human`.
`cadence-tick` executa de verdade esses filtros: detecta resposta em `webchat_messages.direction='inbound'` nas conversas do lead após `enrolled_at` ou após o último step run enviado.
