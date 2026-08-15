// Shared helper: reads business_hours + business_holidays for an organization,
// computes if the company is OPEN right now and the next opening moment in a
// human-friendly Portuguese string. Injected into the webchat-bot system prompt
// so the agent can warn the visitor when transferring outside working hours.

const DAY_KEYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;
type DayKey = typeof DAY_KEYS[number];

const DAY_LABEL_PT: Record<DayKey, string> = {
  sunday: 'domingo',
  monday: 'segunda-feira',
  tuesday: 'terça-feira',
  wednesday: 'quarta-feira',
  thursday: 'quinta-feira',
  friday: 'sexta-feira',
  saturday: 'sábado',
};

interface DaySchedule {
  enabled?: boolean;
  start?: string; // "08:00"
  end?: string;   // "18:00"
}

export interface BusinessHoursContext {
  configured: boolean;
  is_open_now: boolean;
  today_window: string;       // "08h às 18h" ou "fechado"
  next_open_human: string;    // "amanhã às 8h", "segunda-feira às 8h"
  timezone: string;
  out_of_hours_message?: string;
}

/** Returns hour+minute parts for a Date in a given IANA timezone. */
function partsInTZ(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {} as Record<string, string>);
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    weekday: weekdayMap[parts.weekday] ?? 0,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function parseHM(hm?: string): { h: number; m: number } | null {
  if (!hm || typeof hm !== 'string') return null;
  const [h, m] = hm.split(':').map((n) => Number(n));
  if (Number.isNaN(h)) return null;
  return { h, m: Number.isNaN(m) ? 0 : m };
}

function formatHM(hm: string): string {
  const p = parseHM(hm);
  if (!p) return hm || '';
  if (p.m === 0) return `${p.h}h`;
  return `${p.h}h${String(p.m).padStart(2, '0')}`;
}

function describeWindow(day: DaySchedule | undefined): string {
  if (!day || !day.enabled || !day.start || !day.end) return 'fechado';
  return `${formatHM(day.start)} às ${formatHM(day.end)}`;
}

/**
 * Computes the next opening Date by walking up to 14 days forward,
 * respecting holidays and per-day schedule.
 */
function computeNextOpen(
  now: Date,
  schedule: Record<DayKey, DaySchedule | undefined>,
  holidays: Set<string>,
  timeZone: string,
): { date: Date; weekday: number; isoDate: string; hour: number; minute: number } | null {
  for (let offset = 0; offset < 14; offset++) {
    const probe = new Date(now.getTime() + offset * 86400_000);
    const parts = partsInTZ(probe, timeZone);
    if (holidays.has(parts.isoDate)) continue;
    const dayKey = DAY_KEYS[parts.weekday];
    const day = schedule[dayKey];
    if (!day?.enabled || !day.start) continue;
    const start = parseHM(day.start);
    if (!start) continue;

    if (offset === 0) {
      // Today: only count if start is still ahead of current time.
      if (parts.hour < start.h || (parts.hour === start.h && parts.minute < start.m)) {
        return { date: probe, weekday: parts.weekday, isoDate: parts.isoDate, hour: start.h, minute: start.m };
      }
      continue;
    }
    return { date: probe, weekday: parts.weekday, isoDate: parts.isoDate, hour: start.h, minute: start.m };
  }
  return null;
}

function humanizeNextOpen(
  now: Date,
  next: { weekday: number; isoDate: string; hour: number; minute: number },
  timeZone: string,
): string {
  const today = partsInTZ(now, timeZone);
  const tomorrow = partsInTZ(new Date(now.getTime() + 86400_000), timeZone);
  const timeLabel = next.minute === 0
    ? `${next.hour}h`
    : `${next.hour}h${String(next.minute).padStart(2, '0')}`;
  if (next.isoDate === today.isoDate) return `hoje às ${timeLabel}`;
  if (next.isoDate === tomorrow.isoDate) return `amanhã às ${timeLabel}`;
  return `${DAY_LABEL_PT[DAY_KEYS[next.weekday]]} às ${timeLabel}`;
}

export async function getBusinessHoursContext(
  supabase: any,
  organizationId: string,
): Promise<BusinessHoursContext | null> {
  if (!organizationId) return null;

  try {
    const [{ data: bh }, { data: holidays }] = await Promise.all([
      supabase
        .from('business_hours')
        .select('schedule, timezone, out_of_hours_message, out_of_hours_enabled')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('business_holidays')
        .select('date')
        .eq('organization_id', organizationId),
    ]);

    if (!bh || !bh.schedule) {
      return {
        configured: false,
        is_open_now: true, // default: behave as always-open when not configured
        today_window: 'horário não configurado',
        next_open_human: 'horário não configurado',
        timezone: 'America/Sao_Paulo',
      };
    }

    const timezone = bh.timezone || 'America/Sao_Paulo';
    const schedule = bh.schedule as Record<DayKey, DaySchedule | undefined>;
    const holidaySet = new Set<string>((holidays || []).map((h: any) => String(h.date)));

    const now = new Date();
    const nowParts = partsInTZ(now, timezone);
    const todayKey = DAY_KEYS[nowParts.weekday];
    const todayDay = schedule[todayKey];
    const isHolidayToday = holidaySet.has(nowParts.isoDate);

    let isOpen = false;
    if (!isHolidayToday && todayDay?.enabled && todayDay.start && todayDay.end) {
      const start = parseHM(todayDay.start)!;
      const end = parseHM(todayDay.end)!;
      const nowMin = nowParts.hour * 60 + nowParts.minute;
      const startMin = start.h * 60 + start.m;
      const endMin = end.h * 60 + end.m;
      isOpen = nowMin >= startMin && nowMin < endMin;
    }

    let nextHuman = isOpen ? 'agora (atendimento aberto)' : '—';
    if (!isOpen) {
      const next = computeNextOpen(now, schedule, holidaySet, timezone);
      nextHuman = next
        ? humanizeNextOpen(now, next, timezone)
        : 'sem janela próxima de atendimento';
    }

    const todayWindow = isHolidayToday
      ? 'feriado (fechado)'
      : describeWindow(todayDay);

    return {
      configured: true,
      is_open_now: isOpen,
      today_window: todayWindow,
      next_open_human: nextHuman,
      timezone,
      out_of_hours_message:
        bh.out_of_hours_enabled && bh.out_of_hours_message
          ? String(bh.out_of_hours_message)
          : undefined,
    };
  } catch (err) {
    console.error('[businessHoursContext] error:', err);
    return null;
  }
}

/** Builds the system-prompt block to inject. Returns '' if not configured. */
export function renderBusinessHoursPromptBlock(ctx: BusinessHoursContext | null): string {
  if (!ctx) return '';
  if (!ctx.configured) return '';
  const status = ctx.is_open_now ? 'ABERTO' : 'FECHADO';
  const customMsg = ctx.out_of_hours_message
    ? `\n- Mensagem oficial da empresa para fora do horário: "${ctx.out_of_hours_message}"`
    : '';
  return `\n\n🕒 HORÁRIO DE ATENDIMENTO DA EMPRESA (timezone: ${ctx.timezone}):
- Status agora: ${status}
- Janela de hoje: ${ctx.today_window}
- Próximo horário em que um humano retorna: ${ctx.next_open_human}${customMsg}

REGRA DE TRANSFERÊNCIA FORA DO HORÁRIO:
- Se for transferir para um humano e o status estiver FECHADO, AVISE o cliente ANTES de chamar a tool, em UMA frase natural, por exemplo:
  "Nesse momento estamos fora do horário de atendimento. Nossos consultores retornam ${ctx.next_open_human}. Já vou deixar seu atendimento na fila, assim que abrirmos eles te chamam aqui mesmo, beleza?"
- DEPOIS chame normalmente \`transfer_to_sector\` (a conversa fica enfileirada no setor e será atendida na próxima janela).
- NUNCA prometa retorno em horário diferente do informado acima. NUNCA invente "em alguns minutos" quando o status estiver FECHADO.`;
}
