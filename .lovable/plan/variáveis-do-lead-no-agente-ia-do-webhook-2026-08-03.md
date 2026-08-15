# Variáveis do lead no Agente IA do Webhook

## Problema

Na ação "Acionar Agente IA (WhatsApp)" do webhook, o texto do Contexto Extra é enviado ao agente **literalmente**. Nada substitui `{horario_call}`, e o agente também não recebe nenhum dado dos campos personalizados do lead — só nome, e-mail, telefone e temperatura. Por isso a Sônia repetiu `{horario_call}` na mensagem.

## O que será feito

1. **Interpolar variáveis** no Objetivo e no Contexto Extra antes de gerar a mensagem. `{horario_call}`, `{nome}`, `{email}`, `{telefone}` e qualquer `{chave}` de campo personalizado serão trocados pelo valor real salvo no lead. Se a variável não existir, ela é removida (não vai `{...}` cru para o WhatsApp).
2. **Enviar os dados do lead ao agente**: incluir no prompt um bloco "DADOS DO LEAD" com todos os campos personalizados preenchidos (ex.: `horario_call: 15h`, `nome_lead: ...`, `interesse: ...`), para o agente usar no contexto mesmo sem variável escrita.
3. **Regra anti-placeholder**: instrução explícita no prompt para nunca escrever chaves entre chaves na mensagem final; e sanitização de segurança removendo `{...}` residual antes do envio.
4. **Ajuda na interface**: no diálogo de configuração da ação de IA, listar as variáveis disponíveis (campos personalizados da empresa + campos do lead) com clique para inserir no texto.

## Detalhes técnicos

- `supabase/functions/_shared/outreach-core.ts`: carregar `leads.metadata.custom_fields` (já vem no `select`), criar helper `interpolateVars(text, vars)` aplicado a `objective` e `extra_context`, e injetar o bloco de dados no `userPrompt`. Aplicar filtro final de `{placeholder}` na mensagem gerada.
- `supabase/functions/webhook-receiver/index.ts`: nenhuma mudança de ordem necessária — a ação de IA já roda depois das ações de campo; apenas garantir que o lead seja relido com os campos atualizados (o outreach-core relê o lead).
- `src/components/admin/webhooks/ActionConfigDialog.tsx`: bloco de chips com as variáveis disponíveis abaixo do Contexto Extra.
- Deploy das funções `webhook-receiver` e das que usam outreach-core (`manual-outreach`, `cadence-tick`).

## Validação

Reenviar o webhook de teste e conferir que a mensagem sai com o horário real (ex.: "às 15h") e o link do Meet.
