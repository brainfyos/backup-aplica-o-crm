---
name: Contexto do agente — briefing vs literal
description: OutreachTarget.context_mode define se extra_context é formato literal a copiar ou apenas briefing; cadências usam guidance
type: feature
---
`extra_context` em `_shared/outreach-core.ts` tem dois modos via `context_mode`:

- `literal` (padrão legado): o texto vira "FORMATO OBRIGATÓRIO" e o agente reproduz igual; sai em bolha única.
- `guidance`: o texto vira "BRIEGING" interno — o agente escreve com as próprias palavras, sem copiar títulos/instruções, mas reproduzindo links/valores/horários. Mantém `modeRules` e `splitIntoBubbles`.

`cadence-tick` envia `context_mode: 'guidance'` e NÃO embute cabeçalhos (`[Cadência: …]`, `Objetivo da etapa:`, `Contexto:`) no `extra_context` — o objetivo vai no campo `objective`. Sem isso o lead recebia o prompt inteiro como mensagem.
