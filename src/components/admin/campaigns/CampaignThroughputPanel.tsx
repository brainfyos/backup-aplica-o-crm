import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Snowflake, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ThroughputRow = {
  organization_id: string;
  bucket_hour: string;
  status: string;
  total: number;
};

type ProviderHealthRow = {
  provider: 'evolution' | 'meta_whatsapp';
  connection_id: string;
  organization_id: string;
  connection_name: string;
  cooldown_until: string;
  last_failure_reason: string | null;
  last_failure_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  sent: 'Enviadas',
  failed: 'Falhas',
  skipped: 'Puladas',
  queued: 'Na fila',
  sending: 'Enviando',
  cancelled: 'Canceladas',
};

const STATUS_COLOR: Record<string, string> = {
  sent: 'bg-emerald-500',
  failed: 'bg-red-500',
  skipped: 'bg-amber-500',
  queued: 'bg-slate-400',
  sending: 'bg-sky-500',
  cancelled: 'bg-zinc-400',
};

export function CampaignThroughputPanel() {
  const [rows, setRows] = useState<ThroughputRow[]>([]);
  const [health, setHealth] = useState<ProviderHealthRow[]>([]);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [tp, hp] = await Promise.all([
      supabase.from('v_campaign_throughput' as any).select('*'),
      supabase.from('v_provider_health' as any).select('*'),
    ]);
    if (tp.error) toast.error('Falha ao carregar throughput: ' + tp.error.message);
    if (hp.error) toast.error('Falha ao carregar provedores: ' + hp.error.message);
    const tpRows = ((tp.data ?? []) as unknown) as ThroughputRow[];
    const hpRows = ((hp.data ?? []) as unknown) as ProviderHealthRow[];
    setRows(tpRows);
    setHealth(hpRows);

    const orgIds = Array.from(new Set([
      ...tpRows.map((r) => r.organization_id),
      ...hpRows.map((r) => r.organization_id),
    ])).filter(Boolean);
    if (orgIds.length) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      const map: Record<string, string> = {};
      (orgs ?? []).forEach((o: any) => { map[o.id] = o.name; });
      setOrgNames(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Aggregations for last 24h
  const since24h = Date.now() - 24 * 3600 * 1000;
  const recent = useMemo(() => rows.filter((r) => new Date(r.bucket_hour).getTime() >= since24h), [rows, since24h]);

  // Per-hour stacked totals
  const hours = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const r of recent) {
      const key = new Date(r.bucket_hour).toISOString();
      map[key] ??= {};
      map[key][r.status] = (map[key][r.status] ?? 0) + Number(r.total);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, statuses]) => ({ hour, statuses, total: Object.values(statuses).reduce((s, n) => s + n, 0) }));
  }, [recent]);

  const maxHourTotal = Math.max(1, ...hours.map((h) => h.total));

  // Top 10 orgs in last 24h
  const topOrgs = useMemo(() => {
    const map: Record<string, { sent: number; failed: number; skipped: number; total: number }> = {};
    for (const r of recent) {
      map[r.organization_id] ??= { sent: 0, failed: 0, skipped: 0, total: 0 };
      const n = Number(r.total);
      map[r.organization_id].total += n;
      if (r.status === 'sent') map[r.organization_id].sent += n;
      else if (r.status === 'failed') map[r.organization_id].failed += n;
      else if (r.status === 'skipped') map[r.organization_id].skipped += n;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 10);
  }, [recent]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Throughput de campanhas</h2>
          <p className="text-sm text-muted-foreground">Volume agregado das últimas 24h. Dados atualizam a cada refresh.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mensagens por hora (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          {hours.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sem atividade nas últimas 24h.</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {hours.map(({ hour, statuses, total }) => {
                const heightPct = (total / maxHourTotal) * 100;
                const label = new Date(hour).toLocaleTimeString('pt-BR', { hour: '2-digit' });
                return (
                  <div key={hour} className="flex-1 flex flex-col items-center gap-1" title={`${label}h — ${total} mensagens`}>
                    <div className="w-full flex flex-col-reverse" style={{ height: `${heightPct}%`, minHeight: total ? 4 : 0 }}>
                      {Object.entries(statuses).map(([st, n]) => {
                        const pct = (n / total) * 100;
                        return <div key={st} className={STATUS_COLOR[st] || 'bg-zinc-400'} style={{ height: `${pct}%` }} />;
                      })}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-4 text-xs">
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded ${STATUS_COLOR[k]}`} />
                <span className="text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top 10 empresas (24h)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left p-3">Empresa</th>
                <th className="text-right p-3">Enviadas</th>
                <th className="text-right p-3">Falhas</th>
                <th className="text-right p-3">Puladas</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {topOrgs.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Sem dados.</td></tr>
              ) : topOrgs.map(([orgId, m]) => (
                <tr key={orgId} className="border-b last:border-0">
                  <td className="p-3 truncate max-w-[300px]">{orgNames[orgId] || orgId.slice(0, 8)}</td>
                  <td className="p-3 text-right">{m.sent}</td>
                  <td className="p-3 text-right">{m.failed > 0 ? <span className="text-red-600">{m.failed}</span> : m.failed}</td>
                  <td className="p-3 text-right">{m.skipped}</td>
                  <td className="p-3 text-right font-medium">{m.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Snowflake className="h-4 w-4" />
            Provedores em cooldown agora
          </CardTitle>
        </CardHeader>
        <CardContent>
          {health.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhuma conexão em cooldown.</p>
          ) : (
            <div className="space-y-2">
              {health.map((h) => {
                const until = new Date(h.cooldown_until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={`${h.provider}-${h.connection_id}`} className="flex items-center justify-between gap-2 p-3 rounded-md border">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{h.provider === 'evolution' ? 'Evolution' : 'API Oficial'}</Badge>
                        <span className="font-medium truncate">{h.connection_name}</span>
                        <span className="text-xs text-muted-foreground">{orgNames[h.organization_id] || h.organization_id.slice(0, 8)}</span>
                      </div>
                      {h.last_failure_reason && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{h.last_failure_reason}</p>
                      )}
                    </div>
                    <Badge variant="destructive">até {until}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
