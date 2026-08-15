// Agendamento de cadências — fuso, janela de execução e horário fixo.
// Compartilhado por cadence-tick e cadence-enroll.

export const DEFAULT_TZ = "America/Sao_Paulo";

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** Offset (em minutos) do fuso em relação ao UTC para o instante informado. */
export function tzOffsetMin(date: Date, tz: string = DEFAULT_TZ): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p: Record<string, number> = {};
    for (const part of dtf.formatToParts(date)) {
      if (part.type !== "literal") p[part.type] = Number(part.value);
    }
    const asUTC = Date.UTC(p.year, (p.month || 1) - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch {
    return -180;
  }
}

export interface ZonedParts {
  year: number; month: number; day: number;
  hour: number; minute: number; dow: number;
}

/** Componentes de data/hora do instante no fuso informado. */
export function zonedParts(date: Date, tz: string = DEFAULT_TZ): ZonedParts {
  const off = tzOffsetMin(date, tz);
  const shifted = new Date(date.getTime() + off * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    dow: shifted.getUTCDay(),
  };
}

/** Converte uma data/hora local do fuso para o instante UTC correspondente. */
export function zonedTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number,
  tz: string = DEFAULT_TZ,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = new Date(naive - -180 * 60000);
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMin(guess, tz);
    guess = new Date(naive - off * 60000);
  }
  return guess;
}

/** A janela de execução (dias + horário) permite envio agora? Avaliada no fuso. */
export function withinWindow(window: any, tz: string = DEFAULT_TZ, now: Date = new Date()): boolean {
  if (!window) return true;
  const parts = zonedParts(now, tz);
  const days: any[] = Array.isArray(window.days) ? window.days : [];
  if (days.length) {
    const allowed = days.map((d) => (typeof d === "number" ? d : DAY_MAP[String(d).toLowerCase()]));
    if (!allowed.includes(parts.dow)) return false;
  }
  if (window.start && window.end) {
    const [sh, sm] = String(window.start).split(":").map(Number);
    const [eh, em] = String(window.end).split(":").map(Number);
    const nowMin = parts.hour * 60 + parts.minute;
    if (nowMin < sh * 60 + (sm || 0) || nowMin > eh * 60 + (em || 0)) return false;
  }
  return true;
}

export interface ScheduleResult {
  at: Date;
  /** true quando a etapa é de horário fixo */
  fixed: boolean;
}

const RANDOM_MAX_MIN = 20;

/**
 * Calcula quando a etapa deve ser executada.
 * - fixed_time: horário absoluto no fuso da empresa (ignora a janela de execução).
 * - delay: intervalo relativo, com aleatorização opcional dentro da janela.
 */
export function computeScheduledAt(
  step: any,
  fromDate: Date,
  opts?: { tz?: string; window?: any },
): ScheduleResult {
  const tz = opts?.tz ?? DEFAULT_TZ;

  if (step?.schedule_mode === "fixed_time" && step?.fixed_time) {
    const [hh, mm] = String(step.fixed_time).split(":").map(Number);
    const base = zonedParts(fromDate, tz);
    const dayShift = Number(step.fixed_day_offset ?? 0);
    const at = zonedTimeToUtc(base.year, base.month, base.day + dayShift, hh || 0, mm || 0, tz);
    return { at, fixed: true };
  }

  let at: Date;
  if (step?.execute_immediately) {
    at = new Date();
  } else {
    const v = Number(step?.delay_value ?? 0);
    const unit = step?.delay_unit ?? "days";
    const mult = unit === "minutes" ? 60_000 : unit === "hours" ? 3_600_000 : 86_400_000;
    at = new Date(fromDate.getTime() + v * mult);
  }

  // Aleatorização (somente etapas por intervalo, sem ultrapassar o fim da janela)
  const win = opts?.window;
  if (win?.randomize) {
    const extra = Math.floor(Math.random() * (RANDOM_MAX_MIN + 1));
    const candidate = new Date(at.getTime() + extra * 60_000);
    if (win.end) {
      const [eh, em] = String(win.end).split(":").map(Number);
      const p = zonedParts(candidate, tz);
      const endMin = (eh || 23) * 60 + (em || 0);
      if (p.hour * 60 + p.minute <= endMin) at = candidate;
    } else {
      at = candidate;
    }
  }

  return { at, fixed: false };
}

/** Tolerância para etapas de horário fixo já vencidas (não enviar a live atrasada). */
export const FIXED_TIME_TOLERANCE_MS = 10 * 60_000;

export function isFixedTimeExpired(step: any, scheduledAt: string | Date, now: Date = new Date()): boolean {
  if (step?.schedule_mode !== "fixed_time") return false;
  const at = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  return now.getTime() > at.getTime() + FIXED_TIME_TOLERANCE_MS;
}
