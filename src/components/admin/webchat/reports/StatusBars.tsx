import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AttendanceReportsData } from '@/hooks/useAttendanceReports';

const toneBar: Record<string, string> = {
  primary: 'bg-primary',
  amber: 'bg-amber-500',
  success: 'bg-emerald-500',
  muted: 'bg-muted-foreground/40',
};

interface Props {
  data: AttendanceReportsData['statusBreakdown'];
}

export function StatusBars({ data }: Props) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <Card className="rounded-2xl border bg-card shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Conversas por Status</CardTitle>
        <p className="text-sm text-muted-foreground">Onde estão suas conversas agora</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.map(row => (
          <div key={row.key} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{row.value}</span>
                <span className="ml-2 text-xs">{row.pct}%</span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn('h-full rounded-full transition-all', toneBar[row.tone] ?? 'bg-primary')}
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
