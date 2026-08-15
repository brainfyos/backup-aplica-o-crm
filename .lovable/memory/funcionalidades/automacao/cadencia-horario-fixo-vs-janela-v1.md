---
name: Cadência — horário fixo x janela global
description: Etapas com schedule_mode=fixed_time ignoram a janela global; fuso America/Sao_Paulo; nunca envia horário vencido
type: feature
---

- Etapas `schedule_mode='fixed_time'` disparam no horário exato (fuso `America/Sao_Paulo`) e **ignoram** a janela global (`execution_window`) do passo "Horários".
- A janela global só limita etapas por **intervalo** (`relative`). Se todas as etapas forem fixas, o passo 6 fica desativado.
- Tolerância de 10 min (`FIXED_TIME_TOLERANCE_MS`): horário já vencido → etapa é **pulada** (`skip_reason='fixed_time_passed'`), nunca envia atrasado. Vale tanto no `cadence-enroll` (escolhe a 1ª etapa válida) quanto no `cadence-tick`.
- `randomize` da janela adiciona 0–20 min aleatórios apenas em etapas relativas.
- `delay_from='enrollment'` usa `enrollment.enrolled_at` como base (não "agora").
- Lógica compartilhada em `supabase/functions/_shared/cadence-schedule.ts` (`computeScheduledAt`, `withinWindow`, `isFixedTimeExpired`).
