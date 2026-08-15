import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Insight } from '@/lib/attendanceInsights';

const sevStyle: Record<Insight['severity'], string> = {
  danger: 'bg-destructive/5 border-destructive/30 text-destructive',
  warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-200',
};

interface Props {
  insights: Insight[];
}

export function SmartAlerts({ insights }: Props) {
  return (
    <Card className="rounded-2xl border bg-card shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">O que precisa da sua atenção</CardTitle>
        <p className="text-sm text-muted-foreground">Alertas inteligentes gerados a partir do período</p>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
            Tudo certo por aqui — nenhum sinal de alerta no momento.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {insights.map(i => (
              <li
                key={i.id}
                className={cn(
                  'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium',
                  sevStyle[i.severity],
                )}
              >
                <span className="text-base leading-none mt-0.5">{i.emoji}</span>
                <span className="leading-snug">{i.text}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
