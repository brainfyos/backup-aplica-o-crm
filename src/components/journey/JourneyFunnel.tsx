import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ChevronRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { JourneyStage, JourneyCategory } from '@/lib/leadJourney';

interface Props {
  stages?: JourneyStage[];
  isLoading?: boolean;
  onStageClick?: (cat: JourneyCategory) => void;
}

function humanDuration(sec: number | null) {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

const money = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const ACCENT: Record<JourneyCategory, string> = {
  origin:        'bg-blue-500',
  contact:       'bg-cyan-500',
  attendance:    'bg-teal-500',
  qualification: 'bg-violet-500',
  opportunity:   'bg-amber-500',
  meeting:       'bg-orange-500',
  proposal:      'bg-pink-500',
  negotiation:   'bg-rose-500',
  sale:          'bg-emerald-500',
  post_sale:     'bg-green-600',
  system:        'bg-muted',
};

export function JourneyFunnel({ stages, isLoading, onStageClick }: Props) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Funil da Jornada</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Onde estão seus leads agora.</p>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <TooltipProvider delayDuration={100}>
            <div className="flex items-stretch gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {stages?.map((s, i) => (
                <div key={s.key} className="flex items-stretch">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onStageClick?.(s.key)}
                        className="group relative min-w-[150px] rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/60 hover:border-border hover:shadow-md transition-all p-4 text-left"
                      >
                        <div className={`h-1 w-10 rounded-full ${ACCENT[s.key]} mb-3`} />
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">{s.label}</div>
                        <div className="text-2xl font-bold tracking-tight mt-1">
                          {s.count.toLocaleString('pt-BR')}
                        </div>
                        <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                          <div>Conv: <span className="font-semibold text-foreground/80">
                            {s.conversion == null ? '—' : `${Math.round(s.conversion * 100)}%`}
                          </span></div>
                          <div>Δ próx: <span className="font-semibold text-foreground/80">
                            {humanDuration(s.avgSecondsToNext)}
                          </span></div>
                          {s.value > 0 && (
                            <div className="text-emerald-500 font-semibold pt-0.5">{money(s.value)}</div>
                          )}
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px]">
                      <div className="space-y-1 text-xs">
                        <div className="font-semibold text-sm">{s.label}</div>
                        <div>Leads: <span className="font-medium">{s.count.toLocaleString('pt-BR')}</span></div>
                        <div>Conversão vs anterior: <span className="font-medium">{s.conversion == null ? '—' : `${Math.round(s.conversion * 100)}%`}</span></div>
                        <div>Tempo médio → próxima: <span className="font-medium">{humanDuration(s.avgSecondsToNext)}</span></div>
                        {s.cumulativeRevenue > 0 && (
                          <div>Receita acumulada: <span className="font-medium text-emerald-500">{money(s.cumulativeRevenue)}</span></div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                  {i < (stages?.length ?? 0) - 1 && (
                    <div className="self-center px-1 text-muted-foreground/50">
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
