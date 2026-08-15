import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, AlertCircle, Info, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useJourneyBottlenecks } from '@/hooks/useLeadJourney';
import type { BottleneckItem, JourneyFilters } from '@/lib/leadJourney';

interface Props {
  filters: JourneyFilters | null;
  onBottleneckClick?: (b: BottleneckItem) => void;
}

const SEV: Record<BottleneckItem['severity'], { icon: any; chip: string; text: string; ring: string; bg: string }> = {
  critical: { icon: AlertTriangle, chip: 'bg-destructive/10',  text: 'text-destructive',   ring: 'ring-destructive/20', bg: 'from-destructive/5' },
  warning:  { icon: AlertCircle,   chip: 'bg-amber-500/10',    text: 'text-amber-500',     ring: 'ring-amber-500/20',   bg: 'from-amber-500/5' },
  info:     { icon: Info,          chip: 'bg-primary/10',      text: 'text-primary',       ring: 'ring-primary/20',     bg: 'from-primary/5' },
};

export function JourneyBottlenecks({ filters, onBottleneckClick }: Props) {
  const { data, isLoading } = useJourneyBottlenecks(filters);
  const visible = (data ?? []).filter(b => b.count > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Gargalos Detectados</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">Onde a operação está travando agora.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : !visible.length ? (
          <div className="flex items-center gap-3 py-8 justify-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Nenhum gargalo detectado. Operação fluindo bem.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map((b) => {
              const s = SEV[b.severity];
              const Icon = s.icon;
              return (
                <button
                  key={b.key}
                  onClick={() => onBottleneckClick?.(b)}
                  className={`group relative overflow-hidden text-left rounded-2xl border p-4 ring-1 ${s.ring} hover:shadow-md transition-all bg-gradient-to-br ${s.bg} to-transparent`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-11 w-11 rounded-xl grid place-items-center flex-shrink-0 ${s.chip}`}>
                      <Icon className={`h-5 w-5 ${s.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-bold leading-none ${s.text}`}>{b.count.toLocaleString('pt-BR')}</span>
                        <span className="text-xs font-semibold text-foreground/80 truncate">{b.label}</span>
                      </div>
                      {b.hint && <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{b.hint}</p>}
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default JourneyBottlenecks;
