import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  data?: { in_5m: number; in_15m: number; in_30m: number; in_1h: number; in_2h: number; after_24h: number };
  onBucketClick?: () => void;
}

export function FollowupUpcomingWidget({ data, onBucketClick }: Props) {
  const rows = [
    { label: 'Em 5 minutos', value: data?.in_5m ?? 0, tone: 'text-emerald-600 dark:text-emerald-400', icon: Clock },
    { label: 'Em 15 minutos', value: data?.in_15m ?? 0, tone: 'text-blue-600 dark:text-blue-400', icon: Clock },
    { label: 'Em 30 minutos', value: data?.in_30m ?? 0, tone: 'text-blue-600 dark:text-blue-400', icon: Clock },
    { label: 'Em 1 hora', value: data?.in_1h ?? 0, tone: 'text-amber-600 dark:text-amber-400', icon: Clock },
    { label: 'Em 2 horas', value: data?.in_2h ?? 0, tone: 'text-violet-600 dark:text-violet-400', icon: Clock },
    { label: 'Após 24 horas', value: data?.after_24h ?? 0, tone: 'text-muted-foreground', icon: AlertTriangle },
  ];
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Próximos disparos</CardTitle>
        <p className="text-xs text-muted-foreground">Acompanhe os próximos envios programados</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.label}
              onClick={onBucketClick}
              className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-muted transition-colors text-left"
            >
              <span className="flex items-center gap-2 text-sm">
                <Icon className={cn('h-4 w-4', r.tone)} />
                {r.label}
              </span>
              <span className="text-sm">
                <span className="font-semibold">{r.value}</span>
                <span className="text-muted-foreground ml-1">leads</span>
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
