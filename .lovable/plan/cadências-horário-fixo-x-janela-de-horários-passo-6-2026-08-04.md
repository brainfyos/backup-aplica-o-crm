# Cadências: horário fixo x janela de horários (passo 6)

## Resposta direta

Não, você não deveria precisar definir horário duas vezes. Hoje o motor (`cadence-tick`) **já ignora a janela do passo 6 em etapas com horário fixo** — a etapa das 19:55 dispara às 19:55 mesmo com janela 09:00–18:00. O problema é que a tela não diz isso, então o passo 6 parece obrigatório e contraditório.

Mas, revisando o fluxo de ponta a ponta, encontrei quatro defeitos reais que impedem isso de funcionar 100%:

1. **A janela é avaliada em UTC, não em Brasília.** `withinWindow` usa a hora do servidor (UTC). Uma janela 09:00–18:00 vira, na prática, 06:00–15:00 no horário de Brasília. Afeta todas as etapas por intervalo.
2. **O botão "Aleatorizar horário dentro da janela" não faz nada.** O valor é salvo em `execution_window.randomize`, mas nenhuma edge function lê esse campo.
3. **Horário fixo já vencido dispara atrasado.** Na inscrição, se são 20:30 e a etapa é "19:55 / +0 dias", o agendamento cai no passado e o cron de 1 minuto envia na hora — o lead recebe o link da live depois dela começar. O mesmo vale para a próxima etapa agendada após uma execução.
4. **"A partir da entrada" usa a hora atual.** Ao agendar a etapa seguinte, o motor usa `new Date()` em vez de `enrolled_at`, então "+2 dias da entrada" na verdade conta a partir da execução da etapa anterior.

## Como vai ficar

### Tela (assistente de cadência)

- Na etapa com **Horário fixo**, aparece um aviso curto: "Esta etapa ignora a janela de horários (passo 6) e dispara exatamente às HH:MM (Brasília)."
- No **passo 6**, o título passa a ser "Horários (etapas por intervalo)" com a explicação de que a janela só limita etapas agendadas por intervalo. Se **todas** as etapas forem de horário fixo, o passo 6 aparece desabilitado com a mensagem "Nenhuma etapa usa intervalo — a janela não se aplica".
- O passo 9 (Revisão) e a linha "Janela" passam a mostrar quais etapas são regidas pela janela e quais têm horário próprio.
- No campo de horário fixo, aviso quando o horário escolhido cai fora da janela — apenas informativo, sem bloquear.

### Motor

- **Fuso**: `withinWindow` e o cálculo de horário fixo passam a usar o fuso da empresa (`America/Sao_Paulo` por padrão, lido das configurações da organização quando existir), com conversão correta de horário — nada mais depende do UTC do servidor.
- **Aleatorizar**: quando ligado, etapas por intervalo ganham um deslocamento aleatório dentro da janela permitida (até 20 min, sem ultrapassar o fim da janela). Etapas de horário fixo nunca são aleatorizadas.
- **Horário fixo vencido**: tolerância de 10 minutos. Dentro dela, envia; passou disso, a etapa é pulada com motivo `fixed_time_passed` e o lead avança para a próxima etapa (nunca envia o link da live atrasado).
- **"A partir da entrada"**: passa a usar `enrolled_at` do enrollment como base real.

## Detalhes técnicos

- `supabase/functions/cadence-tick/index.ts`
  - Helper de fuso (`nowInTz`, `zonedTimeToUtc`) substituindo o `OFFSET_MIN = -180` fixo e o `now.getHours()` de `withinWindow`.
  - `computeScheduledAt(step, fromDate, { window, tz })`: aplica `randomize` só no modo `delay`; retorna também um marcador de "horário já passado".
  - Antes de enviar, para `schedule_mode = 'fixed_time'`: se `now > scheduled_at + 10min`, marca `skipped` com `skip_reason = 'fixed_time_passed'` e agenda a próxima etapa (mesmo caminho já usado nos demais skips).
  - Agendamento da próxima etapa: `delay_from === 'enrollment'` usa `enrollment.enrolled_at`.
- `supabase/functions/cadence-enroll/index.ts`: mesma função de cálculo (extraída para `_shared/cadence-schedule.ts` para não duplicar), incluindo a regra de horário vencido — se a primeira etapa já passou, o enrollment é criado apontando para a etapa seguinte válida.
- `src/components/admin/cadences/CadenceWizard.tsx`: avisos por etapa, rótulo/estado desabilitado do passo 6, resumo do passo 9.
- Sem migração de banco — `schedule_mode`, `fixed_time`, `fixed_day_offset` e `execution_window` já existem. O cron já roda a cada 1 minuto.

## Validação

Cadência de teste com etapa fixa às 19:55 e janela 09:00–18:00: inscrever um lead às 19:40 (deve enviar 19:55), e outro às 20:10 (deve ser pulado com `fixed_time_passed`), conferindo em `cadence_step_runs`.
