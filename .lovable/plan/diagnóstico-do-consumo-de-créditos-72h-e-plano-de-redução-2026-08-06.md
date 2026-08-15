# Diagnóstico do consumo de créditos (72h) e plano de redução

## Resposta curta

O consumo alto **não vem de uma mudança de cobrança da Lovable**. Ele vem do **aplicativo**: as chamadas de IA que o Vendus faz em produção (agentes de WhatsApp/Inbox, follow-up automático, embeddings) saem da **mesma carteira de créditos** usada pelo agente do editor. Nas últimas 72h o app dobrou o volume de tokens.

Importante separar as duas fontes, porque só uma delas eu consigo medir aqui:

| Fonte | Medível por mim | Situação |
|---|---|---|
| IA do aplicativo (AI Gateway) | Sim | **4.490 requisições / 9,1 milhões de tokens em 72h** |
| Mensagens do agente do editor (build/plan) | Não | Visível em Configurações → Plans & credits |

## O que os dados mostram (medido)

Período: 03/08 17:00 UTC → 06/08 17:00 UTC.

- **9.136.053 tokens** em 3.846 chamadas registradas em `ai_usage_logs`.
- Período anterior de 72h: **4.532.939 tokens** em 1.487 chamadas → **+102% em tokens e +159% em chamadas**.
- 99,7% do consumo é da capacidade `agent_chat`, toda pela chave da plataforma (`source=platform`).

Distribuição por função (tokens de entrada, 72h):

| Função | Chamadas | Tokens entrada | Média por chamada |
|---|---|---|---|
| webchat-bot (gemini-3-flash-preview) | 156 | ~3,19 M | **~20.500** |
| webchat-bot (gemini-2.5-flash) | 141 | ~2,15 M | ~15.000 |
| ai-followup-cron | 3.299 | ~1,92 M | ~580 |
| webchat-bot:tool-followup | 87 | ~1,18 M | ~13.500 |
| manual-outreach | 117 | ~0,20 M | ~1.700 |

### Os três causadores reais

1. **Prompt gigante por mensagem no `webchat-bot`.** Cada resposta do agente envia entre 13.000 e 24.000 tokens de entrada (prompt da Sônia com ~15 mil caracteres + últimas 80 mensagens do histórico + catálogo de tools). Amostra do log do gateway: `log_id 019fd805-356c-7881-9c37-328c96f42a8d`, 24.725 tokens de entrada para **81 tokens de saída** — custo 0,0504 créditos numa única resposta. Ou seja: paga-se ~300x mais pelo contexto do que pela resposta.
2. **Multiplicação de chamadas por mensagem.** Além da resposta principal, cada conversa dispara `webchat-bot:tool-followup` e `webchat-bot:followup` — cada uma reenvia o prompt inteiro de novo. Uma mensagem do lead pode custar 2 a 3 prompts completos.
3. **`ai-followup-cron` em alta frequência.** 3.299 chamadas em 72h (~150/hora nos horários de pico), atendendo apenas 2 a 3 empresas. São chamadas baratas individualmente, mas somam ~1,9 M de tokens.

Também rodam ~280 embeddings (`text-embedding-3-small`), com custo desprezível (0,000001 crédito cada) — não é o problema.

## Plano de redução (sem perder qualidade do atendimento)

### Etapa 1 — Cortar o contexto repetido no `webchat-bot` (maior impacto)
- Reduzir a janela de histórico enviada ao modelo de 80 mensagens para 20, mantendo um resumo curto das mensagens anteriores.
- Enviar o prompt-mestre completo do agente apenas na primeira chamada do turno; nas chamadas de tool-followup, enviar somente as instruções essenciais e o resultado da tool.
- Enviar o catálogo de tools somente das tools habilitadas para o canal/agente da conversa.
- Impacto estimado: **-60% a -70% dos tokens de entrada** do canal de atendimento.

### Etapa 2 — Reduzir chamadas encadeadas
- Consolidar `followup` e `tool-followup` em uma única continuação por turno, quando não houver nova tool a executar.
- Manter o debounce de 4s já existente e ampliar o guard anti-repetição para não reprocessar turnos idênticos.

### Etapa 3 — Ajustar o `ai-followup-cron`
- Processar em lote por organização em vez de uma chamada de IA por item.
- Não chamar modelo quando não houver mudança de estado no lead desde a última avaliação.

### Etapa 4 — Visibilidade de custo
- Painel no Super Admin com tokens/custo por função e por empresa (dados já existem em `ai_usage_logs`), para detectar regressões de custo no dia seguinte, não no fim do mês.

### Etapa 5 — Consumo do agente do editor
- Não consigo ler o histórico de créditos do editor. Verifique em Configurações → Plans & credits o gráfico de uso: se o pico for de mensagens de build (e não de Cloud/AI), a causa é o tamanho das tarefas por mensagem, e a mitigação é dividir pedidos grandes em passos menores. Posso orientar caso queira comparar os números da tela com os daqui.

## Detalhes técnicos

- Fontes de evidência: `ai_gateway_logs` (4.490 requisições no período), tabela `public.ai_usage_logs` (agregações acima), `cron.job` (11 jobs ativos; nenhum deles é o gatilho do follow-up — ele é acionado pelo agendamento criado em `20260617123000_schedule_message_and_followup_crons.sql`).
- Arquivos que serão alterados nas etapas 1-3: `supabase/functions/webchat-bot/index.ts`, `supabase/functions/_shared/outreach-core.ts`, `supabase/functions/ai-followup-cron/index.ts`, `supabase/functions/_shared/followup-scheduler.ts`.
- Nenhuma mudança de modelo é proposta: o `google/gemini-3-flash-preview` continua no `agent_chat` conforme a regra registrada em memória. A economia vem do tamanho do payload, não da troca de modelo.
- Nenhuma alteração no rollout de segurança em andamento.
