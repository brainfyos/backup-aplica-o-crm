import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Clock, Send, MessageCircle, Percent, Flag } from 'lucide-react';
import type { PanelStats } from '@/hooks/useFollowupPanel';

interface Props {
  stats?: PanelStats;
  loading?: boolean;
}

export function FollowupKpiCards({ stats, loading }: Props) {
  const k = stats?.kpis;
  const recoveryRate = k && k.sent_in_period > 0
    ? ((k.recovered / k.sent_in_period) * 100).toFixed(1) + '%'
    : '0%';

  const items = [
    { icon: Users, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', title: 'Leads em Follow-up', value: k?.leads_in_followup ?? 0, sub: 'Em réguas ativas' },
    { icon: Clock, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', title: 'Aguardando Próxima Tentativa', value: k?.waiting_next ?? 0, sub: 'Leads' },
    { icon: Send, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', title: 'Follow-ups Enviados Hoje', value: k?.sent_today ?? 0, sub: 'Total de envios' },
    { icon: MessageCircle, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', title: 'Respostas Recuperadas', value: k?.recovered ?? 0, sub: 'Após follow-up' },
    { icon: Percent, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', title: 'Taxa de Recuperação', value: recoveryRate, sub: 'Respostas / Enviados' },
    { icon: Flag, color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', title: 'Réguas Encerradas', value: k?.rulers_closed ?? 0, sub: 'Esgotaram tentativas' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Card key={it.title}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${it.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-xs font-medium text-muted-foreground leading-snug">{it.title}</div>
              </div>
              <div className="text-3xl font-semibold tracking-tight">
                {loading ? <Skeleton className="h-8 w-16" /> : it.value}
              </div>
              <div className="text-xs text-muted-foreground">{it.sub}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
