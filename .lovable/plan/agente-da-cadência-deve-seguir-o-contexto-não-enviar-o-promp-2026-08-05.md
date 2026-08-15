# Agente da cadência deve seguir o contexto, não enviar o prompt

## O que está acontecendo

Na etapa com "Como enviar: Agente IA", o motor da cadência monta um bloco de texto com cabeçalhos internos:

```text
[Cadência: Link Live + Vagas Abertas]

Objetivo da etapa: Enviar link da live para quem respondeu

Contexto:
Esse lead se inscreveu ...
```

Esse bloco é entregue ao agente como **"FORMATO OBRIGATÓRIO DA MENSAGEM — siga LITERALMENTE o texto abaixo"**. O modelo então reproduz tudo, inclusive os cabeçalhos, e o lead recebe o prompt como mensagem — exatamente o que aparece na imagem.

Confirmado no código: `cadence-tick` concatena `[Cadência: …] / Objetivo da etapa / Tom / Contexto:` em `extra_context`, e `outreach-core` trata qualquer `extra_context` preenchido como formato literal (inclusive forçando bolha única e desligando as regras normais de escrita).

## Correção

1. **Cadência para de mandar cabeçalhos**
   - O nome da cadência, o objetivo da etapa e o tom deixam de ir no mesmo bloco de texto; passam como informação separada (objetivo e tom já têm campos próprios).
   - Só o texto que o usuário escreveu em "Contexto inline" (ou o contexto vindo da biblioteca) é enviado ao agente.

2. **Contexto vira instrução, não texto a copiar**
   - Para etapas com "Agente IA", o contexto é entregue como orientação: o agente escreve a mensagem com base nele, respeitando link, dados e intenção, sem copiar o texto, sem títulos, sem "Exemplo:", sem repetir instruções.
   - As regras normais de escrita (mensagem direta, tom humano, quebra em bolhas quando fizer sentido) voltam a valer nessas etapas — igual ao comportamento dos outros pontos do sistema.
   - Links e valores presentes no contexto continuam obrigatórios e são reproduzidos exatamente.

3. **Modo literal continua existindo, mas só onde é pedido**
   - "Mensagem fixa" (texto exato) e templates HSM seguem inalterados: enviados literalmente.
   - O modo "copie exatamente este formato" deixa de ser ativado automaticamente por qualquer contexto extra; passa a ser usado apenas quando o disparo pede formato literal explicitamente.

4. **Validação**
   - Rodar uma etapa de teste com o mesmo contexto da imagem e conferir que a mensagem recebida é uma frase natural com o link, sem `[Cadência: …]`, sem "Objetivo da etapa", sem "Contexto:" e sem "Exemplo:".
   - Conferir que "Mensagem fixa" continua saindo idêntica ao texto configurado e que o template HSM não muda.

## Detalhes técnicos

- `supabase/functions/cadence-tick/index.ts`: parar de embutir `[Cadência]`/`Objetivo`/`Tom` no `extra_context`; enviar apenas o contexto da etapa e sinalizar que ele é orientação (não formato literal).
- `supabase/functions/_shared/outreach-core.ts`: separar "contexto de orientação" de "formato literal" no prompt do sistema; manter `modeRules` e o `splitIntoBubbles` no modo orientação; manter o bloco literal atual apenas para chamadas que o pedirem.
- Nenhuma migração de banco; deploy de `cadence-tick` e `manual-outreach` (que carrega o `outreach-core`).
