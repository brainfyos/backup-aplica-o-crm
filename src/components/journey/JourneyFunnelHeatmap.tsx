import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { JourneyStage } from '@/lib/leadJourney';

interface Props {
  stages?: JourneyStage[];
  isLoading?: boolean;
}

/** Interpola verde→amarelo→vermelho baseado na taxa de perda (0..1). */
function heatColor(loss: number): string {
  const l = Math.max(0, Math.min(1, loss));
  // 0 = verde (140), 0.5 = amarelo (45), 1 = vermelho (0)
  const hue = 140 - l * 140;
  return `hsl(${hue} 75% 50%)`;
}

export function JourneyFunnelHeatmap({ stages, isLoading }: Props) {
  const rows = (stages ?? []).map((s, i) => {
    // taxa de perda = 1 - conversion desta etapa (relativa à etapa anterior)
    const conv = s.conversion;
    const loss = conv == null ? 0 : Math.max(0, 1 - conv);
    return { key: s.key, label: s.label, count: s.count, loss, isFirst: i === 0 };
  });
  const max = Math.max(1, ...rows.map(r => r.count));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Heatmap de Conversão</CardTitle>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-muted-foreground">Verde = boa conversão · Vermelho = maior perda entre etapas.</p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="h-2 w-6 rounded" style={{ background: heatColor(0) }} />
            <span>boa</span>
            <span className="h-2 w-6 rounded" style={{ background: heatColor(0.5) }} />
            <span>média</span>
            <span className="h-2 w-6 rounded" style={{ background: heatColor(1) }} />
            <span>perda</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3">
                <div className="w-32 text-xs truncate">{r.label}</div>
                <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(r.count / max) * 100}%`,
                      background: r.isFirst ? heatColor(0) : heatColor(r.loss),
                    }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                    {r.count.toLocaleString('pt-BR')}
                    {!r.isFirst && r.loss > 0 && (
                      <span className="ml-2 opacity-70">· −{Math.round(r.loss * 100)}%</span>
                    )}
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

export default JourneyFunnelHeatmap;
