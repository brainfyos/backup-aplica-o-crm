import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Building2, Clock3, Pause, Play, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

type Worker = {
  worker_key: string;
  label: string;
  priority: number;
  enabled: boolean;
  pending_count: number;
  backlog_count: number;
  paused_organizations: number;
  last_dispatched_at: string | null;
};

type OrganizationControl = {
  organization_id: string;
  organization_name: string;
  worker_key: string;
  label: string;
  is_paused: boolean;
  reason: string | null;
  paused_at: string | null;
  pending_count: number;
  backlog_count: number;
};

type Dispatch = {
  worker_key: string | null;
  pending_count: number;
  connection_count: number;
  status: 'dispatched' | 'skipped_pressure' | 'failed';
  error_message: string | null;
  dispatched_at: string;
};

type Overview = {
  workers: Worker[];
  organizations: OrganizationControl[];
  recent_dispatches: Dispatch[];
  connections: number;
  max_connections: number;
  generated_at: string;
};

type RpcError = { message: string };
type RpcCall = <T>(name: string, args?: Record<string, unknown>) => PromiseLike<{
  data: T | null;
  error: RpcError | null;
}>;
const callRpc = supabase.rpc as unknown as RpcCall;

function relativeTime(value: string | null) {
  if (!value) return 'Ainda não executado';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `há ${seconds}s`;
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)}h`;
  return new Date(value).toLocaleString('pt-BR');
}

export function OperationsControlCenter() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const overviewQuery = useQuery({
    queryKey: ['platform-worker-control-overview'],
    queryFn: async () => {
      const { data, error } = await callRpc<Overview>('platform_worker_control_overview');
      if (error) throw new Error(error.message);
      if (!data) throw new Error('A central não retornou dados.');
      return data;
    },
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['platform-worker-control-overview'] });

  const workerMutation = useMutation({
    mutationFn: async ({ workerKey, enabled }: { workerKey: string; enabled: boolean }) => {
      const { error } = await callRpc<null>('set_platform_worker_enabled', {
        p_worker_key: workerKey,
        p_enabled: enabled,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, variables) => {
      toast({ title: variables.enabled ? 'Execução liberada' : 'Execução global pausada' });
      refresh();
    },
    onError: (error: Error) => toast({ title: 'Não foi possível alterar', description: error.message, variant: 'destructive' }),
  });

  const organizationMutation = useMutation({
    mutationFn: async ({ organizationId, workerKey, paused, reason }: {
      organizationId: string;
      workerKey: string;
      paused: boolean;
      reason?: string;
    }) => {
      const { error } = await callRpc<null>('set_organization_worker_paused', {
        p_org_id: organizationId,
        p_worker_key: workerKey,
        p_paused: paused,
        p_reason: reason || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.paused ? 'Empresa pausada com segurança' : 'Execuções retomadas',
        description: variables.paused
          ? 'A fila foi preservada e não será consumida enquanto estiver pausada.'
          : 'Os itens pendentes voltarão a ser processados gradualmente.',
      });
      refresh();
    },
    onError: (error: Error) => toast({ title: 'Não foi possível alterar', description: error.message, variant: 'destructive' }),
  });

  const data = overviewQuery.data;
  const pendingTotal = (data?.workers ?? []).reduce((sum, worker) => sum + worker.backlog_count, 0);
  const connectionPercent = data?.max_connections
    ? Math.min(100, Math.round((data.connections / data.max_connections) * 100))
    : 0;

  const organizations = useMemo(() => {
    const rows = data?.organizations ?? [];
    const grouped = new Map<string, { id: string; name: string; controls: OrganizationControl[] }>();
    for (const row of rows) {
      const current = grouped.get(row.organization_id) ?? {
        id: row.organization_id,
        name: row.organization_name,
        controls: [],
      };
      current.controls.push(row);
      grouped.set(row.organization_id, current);
    }
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return Array.from(grouped.values()).filter((org) => !term || org.name.toLocaleLowerCase('pt-BR').includes(term));
  }, [data?.organizations, search]);

  const pauseOrganization = (organizationId: string, paused: boolean) => {
    let reason: string | undefined;
    if (paused) {
      const typed = window.prompt('Motivo da pausa (opcional). Nenhum item da fila será apagado:');
      if (typed === null) return;
      reason = typed.trim() || undefined;
    }
    organizationMutation.mutate({ organizationId, workerKey: '*', paused, reason });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Central de execuções</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            A Mia e os workers ficam adormecidos sem demanda. Aqui você acompanha filas reais e interrompe uma empresa sem apagar dados.
          </p>
        </div>
        <Button variant="outline" onClick={() => overviewQuery.refetch()} disabled={overviewQuery.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${overviewQuery.isFetching ? 'animate-spin' : ''}`} />
          Atualizar agora
        </Button>
      </div>

      {overviewQuery.isError ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            A central ainda não está disponível neste banco. Execute a migration de orquestração e tente novamente.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Fila pronta</CardDescription><CardTitle className="text-3xl">{pendingTotal}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Inclui itens preservados em empresas pausadas</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Conexões do banco</CardDescription><CardTitle className="text-3xl">{data?.connections ?? '—'} / {data?.max_connections ?? '—'}</CardTitle></CardHeader>
          <CardContent><Progress value={connectionPercent} className="h-2" /><p className="mt-2 text-xs text-muted-foreground">Proteção automática pausa novos disparos acima de 90%</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Categorias ativas</CardDescription><CardTitle className="text-3xl">{(data?.workers ?? []).filter((w) => w.enabled).length} / {data?.workers?.length ?? 0}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Cada categoria também pode ser pausada globalmente</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Modo operacional</CardDescription><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-emerald-500" /> Sob demanda</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">No máximo 2 categorias acordam por ciclo</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Categorias de execução</CardTitle>
          <CardDescription>Desligar aqui bloqueia a categoria em todas as empresas, preservando as filas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.workers ?? []).map((worker) => (
            <div key={worker.worker_key} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-medium">{worker.label}</p><p className="mt-1 text-xs text-muted-foreground">Último disparo {relativeTime(worker.last_dispatched_at)}</p></div>
                <Switch
                  checked={worker.enabled}
                  disabled={workerMutation.isPending}
                  aria-label={`${worker.enabled ? 'Pausar' : 'Ativar'} ${worker.label}`}
                  onCheckedChange={(enabled) => workerMutation.mutate({ workerKey: worker.worker_key, enabled })}
                />
              </div>
              <div className="mt-4 flex gap-2">
                <Badge variant={worker.backlog_count ? 'default' : 'secondary'}>{worker.backlog_count} no backlog</Badge>
                {worker.paused_organizations > 0 ? <Badge variant="outline">{worker.paused_organizations} empresas pausadas</Badge> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-lg">Empresas com fila ou pausa</CardTitle><CardDescription>Pause tudo ou apenas uma categoria. Retomar libera o backlog gradualmente.</CardDescription></div>
          <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa" className="pl-9" /></div>
        </CardHeader>
        <CardContent className="space-y-3">
          {organizations.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma empresa com fila pronta ou execução pausada.</div> : organizations.map((org) => {
            const allPaused = data?.workers?.length ? org.controls.filter((c) => c.is_paused).length === data.workers.length : false;
            return (
              <div key={org.id} className="rounded-xl border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3"><div className="rounded-lg bg-muted p-2"><Building2 className="h-4 w-4" /></div><div><p className="font-medium">{org.name}</p><p className="text-xs text-muted-foreground">{org.controls.reduce((sum, c) => sum + c.backlog_count, 0)} itens no backlog</p></div></div>
                  <Button size="sm" variant={allPaused ? 'outline' : 'destructive'} disabled={organizationMutation.isPending} onClick={() => pauseOrganization(org.id, !allPaused)}>
                    {allPaused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}{allPaused ? 'Retomar tudo' : 'Pausar tudo'}
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {org.controls.map((control) => (
                    <button key={control.worker_key} type="button" disabled={organizationMutation.isPending} onClick={() => organizationMutation.mutate({ organizationId: org.id, workerKey: control.worker_key, paused: !control.is_paused })} className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${control.is_paused ? 'border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'hover:bg-muted'}`} title={control.reason || undefined}>
                      {control.is_paused ? `Pausado · ${control.backlog_count} retidos` : `${control.backlog_count} na fila`} · {control.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Atividade recente</CardTitle><CardDescription>Disparos enviados pelo orquestrador e proteções por pressão.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {(data?.recent_dispatches ?? []).slice(0, 12).map((dispatch, index) => (
            <div key={`${dispatch.worker_key}-${dispatch.dispatched_at}-${index}`} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              {dispatch.status === 'dispatched' ? <Activity className="h-4 w-4 text-emerald-500" /> : dispatch.status === 'skipped_pressure' ? <Clock3 className="h-4 w-4 text-amber-500" /> : <Pause className="h-4 w-4 text-destructive" />}
              <span className="font-medium">{data?.workers.find((w) => w.worker_key === dispatch.worker_key)?.label ?? 'Orquestrador'}</span>
              <span className="text-muted-foreground">{dispatch.pending_count} itens · {dispatch.connection_count} conexões</span>
              <span className="ml-auto text-xs text-muted-foreground">{relativeTime(dispatch.dispatched_at)}</span>
            </div>
          ))}
          {!data?.recent_dispatches?.length ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum disparo registrado ainda.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
