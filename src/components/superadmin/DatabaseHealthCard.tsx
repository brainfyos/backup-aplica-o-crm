import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Database, Loader2 } from 'lucide-react';

interface HealthSnapshot {
  id: string;
  captured_at: string;
  connections_used: number;
  connections_max: number;
  connections_pct: number;
  db_size_bytes: number;
  long_running_queries: number;
  idle_in_transaction: number;
  deadlocks: number;
  rolled_back: number;
  status: string;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

const STATUS_LABEL: Record<string, string> = {
  ok: 'Saudável',
  warning: 'Atenção',
  critical: 'Crítico',
};

export function DatabaseHealthCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-health-snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_health_snapshots' as never)
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as unknown as HealthSnapshot[];
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });

  const latest = data?.[0];
  const alerts = (data ?? []).filter((s) => s.status !== 'ok').slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Saúde do Banco de Dados
        </CardTitle>
        <CardDescription>
          Coleta automática a cada 5 minutos (conexões, tamanho, consultas longas e travamentos)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando métricas…
          </div>
        )}

        {!isLoading && !latest && (
          <p className="text-sm text-muted-foreground">
            Nenhuma coleta registrada ainda. A primeira leitura aparece em até 5 minutos.
          </p>
        )}

        {latest && (
          <>
            <div className="flex items-center justify-between">
              <Badge
                variant={latest.status === 'ok' ? 'secondary' : 'destructive'}
                className="text-xs"
              >
                {STATUS_LABEL[latest.status] ?? latest.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Atualizado em {new Date(latest.captured_at).toLocaleString('pt-BR')}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Conexões</p>
                <p className="text-lg font-semibold">
                  {latest.connections_used} / {latest.connections_max}
                </p>
                <Progress value={Number(latest.connections_pct)} className="h-2" />
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Tamanho do banco</p>
                <p className="text-lg font-semibold">{formatBytes(Number(latest.db_size_bytes))}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Consultas longas (&gt;60s)</p>
                <p className="text-lg font-semibold">{latest.long_running_queries}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Transações paradas</p>
                <p className="text-lg font-semibold">{latest.idle_in_transaction}</p>
              </div>
            </div>

            {alerts.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Alertas recentes</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 space-y-1 text-xs">
                    {alerts.map((a) => (
                      <li key={a.id}>
                        {new Date(a.captured_at).toLocaleString('pt-BR')} —{' '}
                        {STATUS_LABEL[a.status] ?? a.status}: {a.connections_pct}% de conexões,{' '}
                        {a.long_running_queries} consulta(s) longa(s)
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
