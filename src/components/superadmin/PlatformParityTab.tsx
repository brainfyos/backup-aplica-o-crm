import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Wrench,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Metric {
  expected: number;
  found: number;
  missing?: string[];
}

interface HealthReport {
  contract_version: string;
  schema_fingerprints: Metric;
  security_fingerprints: Metric;
  function_acls: Metric;
  relation_acls: Metric;
  realtime_tables: Metric;
  auth_triggers: Metric;
  cron_jobs: Metric;
  unexpected_cron_jobs: Metric;
  runtime_config: Metric;
  storage_buckets: Metric;
  vault_secrets: Metric;
  edge_secrets: Metric;
  orphan_profiles: Metric;
  structural_healthy: boolean;
  healthy: boolean;
  operational_ready: boolean;
  certified: boolean;
  checked_at: string;
}

interface RepairResult {
  ok: boolean;
  actions: string[];
  errors: string[];
  health: HealthReport;
}

const ROWS: {
  key: keyof HealthReport;
  label: string;
  help: string;
}[] = [
  {
    key: 'schema_fingerprints',
    label: 'Estrutura lógica do banco',
    help: 'Compara relações, colunas, constraints, índices, rotinas, triggers, views, enums, buckets e extensões por fingerprint.',
  },
  {
    key: 'security_fingerprints',
    label: 'RLS e policies',
    help: 'Compara todas as 253 flags de RLS, 581 policies públicas e 59 policies de Storage.',
  },
  {
    key: 'function_acls',
    label: 'Permissões de funções (ACL)',
    help: 'Confere exatamente quais papéis podem executar as funções críticas.',
  },
  {
    key: 'relation_acls',
    label: 'Permissões de tabelas e filas (ACL)',
    help: 'Confere os privilégios diretos além das políticas de RLS.',
  },
  {
    key: 'realtime_tables',
    label: 'Tabelas publicadas no Realtime',
    help: 'Sem esta publicação, telas deixam de receber atualizações em tempo real.',
  },
  {
    key: 'auth_triggers',
    label: 'Gatilhos de autenticação',
    help: 'Valida nome e definição exata dos dois gatilhos em auth.users.',
  },
  {
    key: 'cron_jobs',
    label: 'Automações agendadas',
    help: 'Exige os oito jobs canônicos, com agenda e destino deste ambiente.',
  },
  {
    key: 'unexpected_cron_jobs',
    label: 'Automações antigas ou inesperadas',
    help: 'O valor correto é zero; jobs legados causam processamento duplicado.',
  },
  {
    key: 'runtime_config',
    label: 'Configuração dos workers',
    help: 'A URL e a chave pública devem pertencer ao próprio Remix.',
  },
  {
    key: 'storage_buckets',
    label: 'Pastas de arquivos',
    help: 'Confere a quantidade de buckets estruturais; os arquivos não são copiados.',
  },
  {
    key: 'edge_secrets',
    label: 'Secrets obrigatórios das Edge Functions',
    help: 'Só os nomes e a presença são verificados; valores nunca são exibidos.',
  },
  {
    key: 'vault_secrets',
    label: 'Credenciais protegidas no Vault',
    help: 'Devem ser cadastradas no ambiente; valores não são copiados por segurança.',
  },
  {
    key: 'orphan_profiles',
    label: 'Usuários sem perfil',
    help: 'É uma pendência operacional separada e nunca é reparada automaticamente.',
  },
];

function rowOk(metric: Metric) {
  return metric.found >= 0 && metric.found === metric.expected;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function MissingBadges({ metric }: { metric: Metric }) {
  if (!metric.missing?.length) return null;
  const visible = metric.missing.slice(0, 8);
  const remaining = metric.missing.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {visible.map((item) => (
        <Badge key={item} variant="outline" className="text-xs font-mono">
          {item}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="outline" className="text-xs">
          +{remaining} itens
        </Badge>
      )}
    </div>
  );
}

export function PlatformParityTab() {
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [lastRepair, setLastRepair] = useState<RepairResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('platform-bootstrap', {
        body: { action: 'report' },
      });
      if (error) throw error;
      setHealth(data?.health ?? null);
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Falha ao verificar a paridade da plataforma'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const repair = async () => {
    setRepairing(true);
    try {
      const { data, error } = await supabase.functions.invoke('platform-bootstrap', {
        body: { action: 'repair' },
      });
      if (error) throw error;
      const result = data?.result as RepairResult;
      setLastRepair(result);
      setHealth(result?.health ?? null);
      if (result?.health?.certified) toast.success('Remix certificado com sucesso');
      else if (result?.ok) toast.warning('Estrutura reparada; ainda há configurações pendentes');
      else toast.warning('O reparo terminou com divergências estruturais');
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Falha ao reparar a estrutura'));
    } finally {
      setRepairing(false);
    }
  };

  const title = health?.certified
    ? 'Remix 100% certificado'
    : health?.structural_healthy
      ? 'Estrutura íntegra; configuração pendente'
      : 'Divergências estruturais detectadas';
  const description = health?.certified
    ? 'Estrutura, segurança, Realtime, automações e configurações obrigatórias foram validadas.'
    : health?.structural_healthy
      ? 'O banco está estruturalmente íntegro. Complete os secrets e as pendências operacionais exibidas abaixo.'
      : 'Use “Reparar estrutura” e execute uma nova verificação antes de utilizar este Remix.';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Paridade da Plataforma
          </h2>
          <p className="text-sm text-muted-foreground">
            Certifica o contrato de banco e as configurações obrigatórias logo após um Remix.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading || repairing}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Verificar</span>
          </Button>
          <Button onClick={repair} disabled={repairing || loading}>
            {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            <span className="ml-2">Reparar estrutura</span>
          </Button>
        </div>
      </div>

      {health && (
        <Alert variant={health.structural_healthy ? 'default' : 'destructive'}>
          {health.certified
            ? <ShieldCheck className="h-4 w-4" />
            : <AlertTriangle className="h-4 w-4" />}
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>
            {description}
            {health.contract_version && (
              <span className="block mt-1 font-mono text-xs">
                Contrato {health.contract_version}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Certificação</CardTitle>
          <CardDescription>
            {health
              ? `Última verificação: ${new Date(health.checked_at).toLocaleString('pt-BR')}`
              : 'Carregando…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && !health && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
            </div>
          )}

          {health && ROWS.map((row) => {
            const metric = health[row.key] as Metric;
            if (!metric) return null;
            const ok = rowOk(metric);
            return (
              <div key={row.key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {ok
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                    <span>{row.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{row.help}</p>
                  <MissingBadges metric={metric} />
                </div>
                <Badge variant={ok ? 'secondary' : 'destructive'} className="shrink-0">
                  {metric.found < 0 ? 'sem acesso' : `${metric.found} / ${metric.expected}`}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {lastRepair && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado do último reparo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lastRepair.actions?.length ? lastRepair.actions.map((action) => (
              <div key={action} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="font-mono text-xs">{action}</span>
              </div>
            )) : <p className="text-muted-foreground">Nada precisou ser corrigido.</p>}
            {lastRepair.errors?.map((error) => (
              <div key={error} className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-mono text-xs">{error}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
