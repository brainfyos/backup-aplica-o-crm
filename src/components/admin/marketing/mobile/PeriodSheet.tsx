import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  computeRange,
  DatePreset,
  PRESET_ORDER,
} from '../filters/DateRangeControl';
import { MarketingFilters } from '../filters/MarketingFiltersBar';
import { ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_LABELS: Record<Exclude<DatePreset, 'custom'>, string> = {
  maximum: 'Máximo',
  today: 'Hoje',
  yesterday: 'Ontem',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  this_week: 'Esta semana',
  this_month: 'Este mês',
};

function formatRangeShort(from: Date, to: Date) {
  const sameDay = from.toDateString() === to.toDateString();
  if (sameDay) return format(from, "d MMM", { locale: ptBR });
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameYearCurrent = sameYear && from.getFullYear() === new Date().getFullYear();
  if (sameYearCurrent) {
    return `${format(from, 'd MMM', { locale: ptBR })} – ${format(to, 'd MMM', { locale: ptBR })}`;
  }
  return `${format(from, 'd MMM yyyy', { locale: ptBR })} – ${format(to, 'd MMM yyyy', { locale: ptBR })}`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: MarketingFilters;
  onChange: (patch: Partial<MarketingFilters>) => void;
}

export function PeriodSheet({ open, onOpenChange, filters, onChange }: Props) {
  const current = filters.range.preset;
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(filters.range.from);
  const [customTo, setCustomTo] = useState<Date | undefined>(filters.range.to);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0 max-h-[85vh] overflow-y-auto">
        {!customOpen ? (
          <>
            <SheetHeader className="px-4 pt-4 pb-3 flex-row items-center justify-between">
              <SheetTitle className="text-base">Filtrar por data</SheetTitle>
              <button
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </SheetHeader>
            <div className="border-t border-border" />
            <div className="pb-4">
              {PRESET_ORDER.map((p) => {
                const selected = current === p;
                const r = computeRange(p);
                return (
                  <button
                    key={p}
                    onClick={() => {
                      onChange({ range: computeRange(p) });
                      onOpenChange(false);
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-5 py-3.5 text-left transition',
                      selected ? 'bg-primary/10' : 'hover:bg-accent active:bg-accent'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-foreground">{PRESET_LABELS[p]}</p>
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        {formatRangeShort(r.from, r.to)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0',
                        selected ? 'border-primary' : 'border-muted-foreground/30'
                      )}
                    >
                      {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                    </span>
                  </button>
                );
              })}
              <div className="border-t border-border mt-2" />
              <button
                onClick={() => {
                  setCustomFrom(filters.range.from);
                  setCustomTo(filters.range.to);
                  setCustomOpen(true);
                }}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-accent active:bg-accent"
              >
                <span className="text-[15px] font-semibold text-foreground">
                  Intervalo de datas personalizado
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="px-4 pt-4 pb-3 flex-row items-center justify-between">
              <button
                onClick={() => setCustomOpen(false)}
                className="text-sm text-primary font-medium"
              >
                Voltar
              </button>
              <SheetTitle className="text-base">Personalizado</SheetTitle>
              <button
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-accent"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </SheetHeader>
            <div className="border-t border-border" />
            <div className="p-3 flex justify-center">
              <Calendar
                mode="range"
                selected={{ from: customFrom, to: customTo }}
                onSelect={(range) => {
                  setCustomFrom(range?.from);
                  setCustomTo(range?.to);
                }}
                numberOfMonths={1}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </div>
            <div className="px-4 pb-6 pt-2 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCustomOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!customFrom || !customTo}
                onClick={() => {
                  if (customFrom && customTo) {
                    onChange({ range: computeRange('custom', { from: customFrom, to: customTo }) });
                    setCustomOpen(false);
                    onOpenChange(false);
                  }
                }}
              >
                Aplicar
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
