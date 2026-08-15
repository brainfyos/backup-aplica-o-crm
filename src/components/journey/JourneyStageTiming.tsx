import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { JourneyStage } from '@/lib/leadJourney';

interface Props {
  stages?: JourneyStage[];
  isLoading?: boolean;
}

function humanDuration(sec: number | null) {
  if (sec == null) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

export function JourneyStageTiming({ stages, isLoading }: Props) {
  const rows = (stages ?? [])
    .map((s, i) => ({
      from: s.label,
      to: stages?.[i + 1]?.label,
      sec: s.avgSecondsToNext,
    }))
    .filter(r => r.to && r.sec != null && r.sec > 0);
  const max = Math.max(1, ...rows.map(r => r.sec as number));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tempo Médio entre Etapas</CardTitle>
        <p className="text-xs text-muted-foreground">Quanto os leads levam para avançar no funil.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem dados suficientes ainda.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="w-48 text-xs text-muted-foreground truncate">
                  {r.from} <span className="opacity-60">→</span> {r.to}
                </div>
                <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
                  <div
                    className="h-full bg-primary/70"
                    style={{ width: `${((r.sec as number) / max) * 100}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                    {humanDuration(r.sec)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default JourneyStageTiming;
