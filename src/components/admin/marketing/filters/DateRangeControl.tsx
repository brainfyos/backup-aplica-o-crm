import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type DatePreset =
  | 'maximum'
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_week'
  | 'this_month'
  | 'custom';

export interface DateRange {
  preset: DatePreset;
  from: Date;
  to: Date;
}

const PRESET_LABELS: Record<DatePreset, string> = {
  maximum: 'Máximo',
  today: 'Hoje',
  yesterday: 'Ontem',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  this_week: 'Esta semana',
  this_month: 'Este mês',
  custom: 'Personalizado',
};

export const PRESET_ORDER: DatePreset[] = [
  'maximum',
  'today',
  'yesterday',
  '7d',
  '30d',
  'this_week',
  'this_month',
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function computeRange(preset: DatePreset, custom?: { from: Date; to: Date }): DateRange {
  const now = new Date();
  let from = startOfDay(now);
  let to = endOfDay(now);
  switch (preset) {
    case 'maximum':
      from = startOfDay(new Date(now.getTime() - 400 * 24 * 3600 * 1000));
      break;
    case 'today':
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = startOfDay(y);
      to = endOfDay(y);
      break;
    }
    case '7d': {
      // Últimos 7 dias completos (ontem-6 até ontem), padrão Meta
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      to = endOfDay(y);
      const s = new Date(y);
      s.setDate(s.getDate() - 6);
      from = startOfDay(s);
      break;
    }
    case '30d': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      to = endOfDay(y);
      const s = new Date(y);
      s.setDate(s.getDate() - 29);
      from = startOfDay(s);
      break;
    }
    case 'this_week': {
      // Semana começando na segunda-feira
      const d = new Date(now);
      const day = d.getDay(); // 0=dom
      const diff = (day === 0 ? 6 : day - 1);
      d.setDate(d.getDate() - diff);
      from = startOfDay(d);
      break;
    }
    case 'this_month':
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      break;
    case 'custom':
      if (custom) return { preset, from: startOfDay(custom.from), to: endOfDay(custom.to) };
      break;
  }
  return { preset, from, to };
}

interface DateRangeControlProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

export function DateRangeControl({ value, onChange }: DateRangeControlProps) {
  const [open, setOpen] = useState(false);

  if (value.preset !== 'custom') {
    return (
      <Select
        value={value.preset}
        onValueChange={(v) => {
          if (v === 'custom') {
            onChange(computeRange('custom', { from: value.from, to: value.to }));
            setOpen(true);
          } else {
            onChange(computeRange(v as DatePreset));
          }
        }}
      >
        <SelectTrigger>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {PRESET_ORDER.map((p) => (
            <SelectItem key={p} value={p}>{PRESET_LABELS[p]}</SelectItem>
          ))}
          <SelectItem value="custom">{PRESET_LABELS.custom}</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex gap-1">
      <Select
        value="custom"
        onValueChange={(v) => onChange(computeRange(v as DatePreset))}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_ORDER.map((p) => (
            <SelectItem key={p} value={p}>{PRESET_LABELS[p]}</SelectItem>
          ))}
          <SelectItem value="custom">{PRESET_LABELS.custom}</SelectItem>
        </SelectContent>
      </Select>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('flex-1 justify-start font-normal text-xs')}>
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
            {format(value.from, 'dd/MM', { locale: ptBR })} – {format(value.to, 'dd/MM', { locale: ptBR })}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-0 w-auto">
          <Calendar
            mode="range"
            selected={{ from: value.from, to: value.to }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                onChange({ preset: 'custom', from: startOfDay(range.from), to: endOfDay(range.to) });
              }
            }}
            numberOfMonths={2}
            locale={ptBR}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
