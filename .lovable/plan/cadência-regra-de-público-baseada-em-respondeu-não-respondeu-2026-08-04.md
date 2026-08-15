# Cadência: regra de público baseada em "respondeu / não respondeu"

## O que está errado hoje

Duas coisas, uma de tela e uma de motor:

1. **Falta o caso "respondeu".** O bloco 1 só oferece negativas (Não respondeu / Não comprou / Não foi assumido por humano). Não existe "somente quem respondeu", que é exatamente a Etapa 3 do seu cenário.
2. **Os filtros do bloco 1 não fazem nada.** Verificado no motor (`cadence-tick`): a avaliação de condições só entende `not_purchased`, `with_tags` e `without_tags`. A tela grava `only_if_no_response`, `only_if_no_purchase` e `only_if_not_human` — nomes que o motor ignora. Ou seja: hoje marcar "Não respondeu" não filtra ninguém, e "Não comprou" também não (nome divergente).

E o bloco 2 (janela de 24h) acaba fazendo, sem querer, o papel de filtro de público — por isso a confusão: "quem respondeu" e "janela aberta" são quase a mesma coisa, mas aparecem em lugares diferentes.

## Como vai ficar

Uma decisão só por etapa: **quem recebe**. O caminho de envio (texto livre x template) passa a ser consequência automática, não uma segunda pergunta.

```text
1. Quem recebe esta etapa
   ( ) Todos os inscritos
       -> quem tem janela aberta recebe mensagem livre;
          quem esta fora da janela recebe o template selecionado
   ( ) Somente quem RESPONDEU
       -> mensagem livre (janela aberta). Quem nao respondeu e pulado
   ( ) Somente quem NAO RESPONDEU
       -> sai como template HSM. Quem ja respondeu e pulado

   Considerar resposta: [ desde que entrou na cadencia | desde a etapa anterior ]

   Filtros extras (opcionais)
   [ ] Nao comprou   [ ] Nao foi assumido por humano

2. Templates HSM (aparece so quando a opcao acima puder exigir template)
   com a frase do motivo: "Esta etapa sai como template porque ..."
```

Aplicado ao seu cenário:

- Etapa 1 (link da live, quem respondeu): "Somente quem respondeu" -> mensagem livre.
- Etapa 2 (quem não respondeu): "Somente quem não respondeu" -> template com o link.
- Etapa 3 (só quem tem janela aberta): "Somente quem respondeu", considerando resposta "desde a etapa anterior".

Regras de coerência na tela: "Somente quem respondeu" não pede template; "Somente quem não respondeu" e "Todos" exigem pelo menos um template quando a conexão for API Oficial da Meta. Se a conexão da cadência for Evolution, a etapa avisa que não há janela de 24h e tudo sai como mensagem livre.

## Motor (o que passa a valer de verdade)

Em `cadence-tick`, antes de enviar:

- **respondeu / não respondeu**: procura mensagem de entrada do lead (WhatsApp/Instagram/webchat) depois do marco escolhido — data de entrada na cadência ou horário de execução da etapa anterior. Sem mensagem de entrada = "não respondeu".
- **não comprou** e **não assumido por humano**: passam a ser realmente avaliados (hoje o primeiro só funciona com outro nome e o segundo nem existe).
- Etapa pulada continua registrando o motivo (`skip_reason`) e avançando o lead para a próxima etapa, como já acontece.

## Detalhes técnicos

- `cadence_steps.conditions` ganha `audience: 'all' | 'responded' | 'no_reply'` e `reply_since: 'enrollment' | 'previous_step'`; `only_if_no_purchase`/`only_if_not_human` são normalizados para chaves que o motor entende. Sem migração de schema (campo já é `jsonb`); etapas antigas com `only_if_no_response: true` são lidas como `audience: 'no_reply'`.
- `window_requirement` deixa de ser um controle na tela e passa a ser derivado do público (`responded` -> `open`, `no_reply` -> `closed`, `all` -> `any`), mantendo a coluna e o comportamento atual do motor intactos.
- `CadenceWizard.tsx`: bloco 1 vira `RadioGroup` + select "considerar resposta" + checkboxes de filtros extras; `TemplateMultiPicker` passa para dentro do bloco 2 com a frase do motivo; validação do passo de salvamento e o resumo do passo 9 (Revisão) usam a nova linguagem.
- `cadence-tick/index.ts`: `evaluateStepConditions` recebe o enrollment e o run anterior para resolver `audience`/`reply_since`, consultando mensagens `direction = 'inbound'` das conversas do lead; novos `skip_reason`: `audience_responded_not_met` e `audience_no_reply_not_met`.
