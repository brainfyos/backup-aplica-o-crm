# Agente IA do Webhook: respeitar formatação e o exemplo do Contexto Extra

## Problema

Dois pontos confirmados no código:

1. **As quebras de linha somem.** A mensagem gerada passa por `splitIntoBubbles` (`supabase/functions/_shared/humanizer.ts`), que quebra o texto por `\n+` e depois **recola as partes com espaço**. Ou seja, "✅Horário: ... \n ✅Link: ..." vira um parágrafo corrido. Além disso, `outreach-core` chama a função com a opção `targetCharsPerChunk`, que **não existe** na configuração aceita — o corte acaba usando o padrão agressivo de ~180 caracteres.
2. **O exemplo do Contexto Extra é tratado como sugestão.** Hoje o texto entra no prompt como "CONTEXTO ADICIONAL" solto, sem nenhuma instrução dizendo que aquele formato deve ser reproduzido literalmente. O modelo reescreve com as próprias palavras e ignora o layout.

## O que será feito

1. **Preservar quebras de linha no envio**
   - `splitIntoBubbles` passa a quebrar apenas em linhas em branco (parágrafos) e a preservar os `\n` simples dentro de cada bolha; a junção de unidades curtas usa `\n` quando elas vieram de linhas diferentes, e espaço quando vieram da mesma frase.
   - `outreach-core` passa configuração válida (`max_bubbles: 2`, agressividade baixa) e, quando a mensagem já vem estruturada (contém quebras de linha), envia em bolha única — mantendo a divisão em bolhas apenas para textos corridos longos, conforme sua escolha.
   - Manter a limpeza de espaços duplos apenas dentro da linha (nunca entre linhas).

2. **Fazer o agente obedecer ao Contexto Extra**
   - O Contexto Extra passa a entrar no prompt como **instrução de formato obrigatória**: "siga o formato/exemplo abaixo literalmente, mantendo cada item em sua própria linha; só troque as variáveis pelos valores reais do lead".
   - Converter `\n` digitado literalmente no campo em quebra de linha real antes de mandar para a IA.
   - Regra explícita: não reescrever, não resumir, não juntar linhas, não adicionar saudações extras além das do exemplo.
   - Reforçar que o texto final deve terminar exatamente com a pergunta de confirmação escrita no exemplo (ex.: "Posso confirmar sua inscrição?").

3. **Ajuda na interface** (`ActionConfigDialog.tsx`)
   - Nota curta no campo Contexto Extra explicando que o texto ali é seguido literalmente (formato e quebras de linha) e que `{campo}` é substituído pelo valor do lead.

## Detalhes técnicos

- `supabase/functions/_shared/humanizer.ts`: reescrever a segmentação de `splitIntoBubbles` para trabalhar em blocos (`\n\n`) e preservar `\n` internos.
- `supabase/functions/_shared/outreach-core.ts`: normalizar `\n` literais, novo bloco `FORMATO OBRIGATÓRIO DA MENSAGEM` no system prompt, chamada corrigida de `splitIntoBubbles`, sanitização que não colapsa linhas.
- `src/components/admin/webhooks/ActionConfigDialog.tsx`: texto de ajuda.
- Deploy: `manual-outreach`, `manual-outreach-batch`, `cadence-tick`, `form-submit`, `webhook-receiver` (todas usam o `outreach-core`).

## Validação

Reenviar o webhook de teste e conferir no WhatsApp que a mensagem chega com "✅Horário: ..." e "✅Link: ..." em linhas separadas e terminando com a pergunta de confirmação.
