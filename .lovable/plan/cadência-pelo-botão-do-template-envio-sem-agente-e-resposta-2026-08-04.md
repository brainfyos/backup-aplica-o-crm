# Cadência pelo botão do template, envio sem agente e resposta ao "Quero entrar"

## Respondendo direto: a culpa não foi dos filtros

Não. Deixar entrada/exclusões em branco **não** foi a causa, e preencher os filtros **não** resolveria — pelo contrário, com o código atual continuaria dando zero.

O que confirmei lendo o código e o banco:

- O clique em "Já entrei" chegou certo: existe o log `template_button_action` com `cadence_id 33241bbe...`, e a etiqueta foi aplicada.
- Nenhum registro foi criado em `cadence_enrollments`.
- No `cadence-enroll`, quando a inscrição chega com um lead específico (caso do clique no botão), o código monta a lista de "quem excluir" usando **a própria lista de leads recebida**. O resolvedor, ao receber uma lista explícita de leads, devolve exatamente esses leads sem aplicar filtro nenhum. Resultado: o lead entra na lista de exclusão e é removido — `enrolled: 0`, sem erro, sem log.
- Esse caminho só é acionado quando `exclusion_filters` não é um objeto vazio. A sua cadência tem `{"tags": []}`, ou seja, cai nele sempre.
- Bônus: as exclusões da cadência são salvas com a chave `tags`, mas o resolvedor lê `tag_ids` — então exclusão por etiqueta hoje não filtra nada de verdade.

Ou seja: é bug de código, não configuração. Depois da correção você pode usar entrada/exclusões normalmente (e a exclusão por etiqueta passa a funcionar de fato).

## O que vou corrigir

### 1. Inscrição na cadência pelo clique (o bug)
- `cadence-enroll` deixa de usar a lista de leads recebida como base de exclusão; as exclusões passam a ser resolvidas em separado e só removem quem realmente casa com um filtro preenchido.
- Filtros vazios (`{"tags": []}`, arrays sem itens) são ignorados.
- Normalização `tags → tag_ids`, fazendo a exclusão por etiqueta funcionar.
- Ao clicar no botão, o resultado da inscrição (`enrolled`, motivo do skip) fica gravado no log `template_button_action` — nunca mais falha em silêncio.
- Depois do ajuste eu inscrevo seu lead de teste e confirmo o registro ativo no banco antes de te devolver.

Observação importante para o teste: as 3 etapas da sua cadência são de **horário fixo** (16:00, 16:10, 21:43). Etapas cujo horário já passou no dia são puladas — se você testar às 20h, só a de 21:43 será agendada.

### 2. Enviar template sem agente de IA
Na tela **Configurar: Enviar Template (WhatsApp Oficial)**:

- Novo seletor **"Quem conduz a conversa depois do envio"**: `Agente de IA` (atual) ou **`Ninguém — apenas mensagens programadas`**.
- Em "Ninguém", a conversa é marcada como sem agente e o webhook da Meta não chama o bot em respostas nem em cliques de botão. Etiqueta, cadência, opt-out e resposta de botão continuam funcionando, e a conversa segue visível na caixa de entrada para atendimento humano.

### 3. Resposta ao clicar no botão — IA **ou** mensagem fixa
Por botão, um seletor de **Resposta imediata**:

- **Nenhuma** — só executa etiqueta/cadência (padrão de hoje).
- **Mensagem fixa** — campo de texto com variáveis do lead (`{nome}`, etc.). Vai exatamente como escrito, sem IA. É o caminho para o "Quero entrar" responder na hora com o link.
- **Agente de IA** — o agente escolhido responde ao clique, mesmo que a conversa esteja no modo "sem agente" (permite ter IA só nos botões onde faz sentido). Se quiser, dá para adicionar um contexto/objetivo curto para essa resposta.

Isso é independente da cadência: você pode ter resposta imediata **e** inscrição em cadência no mesmo botão.

## Detalhes técnicos

- `supabase/functions/cadence-enroll/index.ts`: helper `hasMeaningfulFilters()`; exclusões via `resolveAudience(org, exclusionFilters, {})` aplicadas como diferença de conjuntos; normalização `tags → tag_ids`; retorno detalhado (`enrolled`, `skipped`, `reason`).
- `supabase/functions/meta-whatsapp-webhook/index.ts`: grava o retorno de `cadence-enroll` no log do clique; executa a resposta imediata do botão (`reply_mode: 'none' | 'text' | 'ai'`) — texto via `meta-whatsapp-send` com interpolação de variáveis, IA via `webchat-bot` com o agente indicado; pula o `webchat-bot` padrão quando a conversa está marcada como sem agente.
- `supabase/functions/_shared/outreach-core.ts`: `button_actions` aceita `reply_mode`, `reply_text`, `reply_agent_id`; novo campo `no_agent` no target, gravando `current_agent_id = null` e `metadata.no_ai_agent = true` (inclusive ao reaproveitar conversa existente).
- `supabase/functions/webhook-receiver/index.ts`: repassa `no_agent` do config da ação `send_whatsapp_template`.
- `src/types/webhook.ts` e `src/components/admin/webhooks/SendTemplateActionConfig.tsx`: seletor de condução pós-envio e bloco de resposta imediata por botão (nenhuma / texto fixo / IA + agente).
- Deploy de `cadence-enroll`, `meta-whatsapp-webhook` e `webhook-receiver`, com verificação no banco do enrollment criado.
