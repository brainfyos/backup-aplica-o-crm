import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { TeamRankingRow } from '@/hooks/useAttendanceReports';
import { formatDuration } from '@/hooks/useAttendanceReports';

interface Props {
  rows: TeamRankingRow[];
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
}

export function TeamRanking({ rows }: Props) {
  return (
    <Card className="rounded-2xl border bg-card shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Desempenho dos Atendentes</CardTitle>
        <p className="text-sm text-muted-foreground">Ranking por conversões no período</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem atendimentos humanos no período.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Atendente</th>
                  <th className="px-2 py-2 text-right font-medium">Conversas</th>
                  <th className="px-2 py-2 text-right font-medium">Tempo Resp.</th>
                  <th className="px-2 py-2 text-right font-medium">Conversões</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.userId} className="border-t border-border/60">
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={r.avatarUrl ?? undefined} alt={r.name} />
                          <AvatarFallback className="text-xs">{initials(r.name)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate font-medium text-foreground">{r.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">{r.conversations}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-muted-foreground">
                      {r.avgResponseMs ? formatDuration(r.avgResponseMs) : '--'}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums font-semibold text-primary">{r.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
