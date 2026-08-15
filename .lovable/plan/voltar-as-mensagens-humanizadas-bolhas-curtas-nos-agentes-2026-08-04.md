# Voltar as mensagens humanizadas (bolhas curtas) nos agentes

## O que aconteceu

A alteração feita hoje à tarde para o Agente IA do Webhook respeitar o formato do exemplo foi aplicada dentro do motor de humanização compartilhado (`_shared/humanizer.ts`), usado por **todos** os agentes (WhatsApp, Instagram, webchat).

Na função `splitIntoBubbles` foi adicionada a regra: se o texto contém qualquer quebra de linha e não tem parágrafos separados por linha em branco, a mensagem inteira volta em **uma bolha só**. Como a IA quase sempre usa quebras de linha simples, o resultado é o bloco único e robótico que você viu.

## O que será feito

1. **Restaurar a divisão natural em `splitIntoBubbles`**
   - Voltar a segmentar por parágrafos e por frases também quando o texto tem quebras de linha simples, respeitando `aggressiveness`, `min_bubbles` e `max_bubbles` do agente.
   - Manter a melhoria útil da mudança: quebras de linha dentro de uma mesma bolha continuam preservadas (não viram espaço, como era antes do ajuste).
   - Só devolver bolha única quando o agente estiver configurado assim (`aggressiveness: 1` ou `splitting.enabled: false`).

2. **Isolar o comportamento "formato literal" no caminho do webhook**
   - Em `_shared/outreach-core.ts`, manter a bolha única apenas quando o disparo realmente exige formato fixo: texto exato (`fixed_text`), template HSM, ou quando o Contexto Extra foi preenchido com um exemplo de formato.
   - Sem Contexto Extra de formato, o outreach volta a usar a divisão normal do humanizador.

3. **Não mexer no prompt do agente geral**
   - O bloco "FORMATO OBRIGATÓRIO" continua sendo montado somente no outreach do webhook, quando há Contexto Extra. O `webchat-bot` não recebe nenhuma instrução nova.

## Detalhes técnicos

- `supabase/functions/_shared/humanizer.ts`: remover o `return [t]` do ramo `isStructured`; usar as linhas/parágrafos como unidades e, quando uma unidade única ultrapassar o tamanho-alvo, continuar quebrando por frase; juntar unidades com `\n` quando vieram de linhas diferentes.
- `supabase/functions/_shared/outreach-core.ts`: trocar a condição `/\n/.test(generatedMessage)` por uma flag explícita de formato literal (`hasFormatContext || fixed_text || template`).
- Deploy: `webchat-bot`, `evolution-webhook`, `manual-outreach`, `manual-outreach-batch`, `cadence-tick`, `form-submit`, `webhook-receiver`.

## Validação

- Conversa normal no WhatsApp: resposta chega em 2–3 bolhas curtas, como antes.
- Webhook com Contexto Extra de formato: mensagem continua chegando em bolha única, com "Horário" e "Link" em linhas separadas.
