import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Activity, Coins, Building2, TrendingUp, Zap } from 'lucide-react';
import {
  useAIUsageSummary, useAIUsageTimeseries, useAIUsageByOrg, useAIUsageByModel, useAIUsageByKey,
} from '@/hooks/usePlatformAIUsage';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  estimateCostUSD, fmtUSD, fmtBRL, DEFAULT_USD_BRL, PROVIDER_COLORS, PROVIDER_LABELS,
} from '@/config/aiPricing';

type RangeKey = '7d' | '30d' | '90d';
const RANGES: { value: RangeKey; label: string; days: number }[] = [
  { value: '7d', label: 'Últimos 7 dias', days: 7 },
  { value: '30d', label: 'Últimos 30 dias', days: 30 },
  { value: '90d', label: 'Últimos 90 dias', days: 90 },
];

const PROVIDERS = ['lovable', 'openai', 'anthropic', 'gemini'] as const;

function useOrgs() {
  return useQuery({
    queryKey: ['orgs-list-min'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organizations').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function PlatformAIUsageDashboard() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [provider, setProvider] = useState<string>('all');
  const [orgId, setOrgId] = useState<string>('all');

  const filters = useMemo(() => {
    const days = RANGES.find((r) => r.value === range)?.days ?? 30;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      provider: provider === 'all' ? null : provider,
      organizationId: orgId === 'all' ? null : orgId,
    };
  }, [range, provider, orgId]);

  const { data: orgs = [] } = useOrgs();
  const { data: summary } = useAIUsageSummary(filters);
  const { data: timeseries = [] } = useAIUsageTimeseries(filters);
  const { data: byOrg = [] } = useAIUsageByOrg(filters, 10);
  const { data: byModel = [] } = useAIUsageByModel(filters, 20);
  const { data: byKey = [] } = useAIUsageByKey(filters, 20);

  // Custo total estimado (modelo a modelo)
  const totalCostUSD = useMemo(() => {
    return byModel.reduce((acc, m) => acc + estimateCostUSD(m.provider, m.model, m.prompt_tokens, m.completion_tokens), 0);
  }, [byModel]);

  const avgCostPerCall = (summary?.total_calls ?? 0) > 0 ? totalCostUSD / (summary!.total_calls) : 0;

  // Pivot timeseries para área stack
  const tsData = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of timeseries) {
      const day = String(p.day);
      if (!map.has(day)) map.set(day, { day });
      map.get(day)[p.provider] = (map.get(day)[p.provider] ?? 0) + p.total_tokens;
    }
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  }, [timeseries]);

  const providersInData = useMemo(() => {
    const s = new Set<string>();
    for (const p of timeseries) s.add(p.provider);
    return Array.from(s);
  }, [timeseries]);

  const donutData = useMemo(() => {
    if (!summary?.by_provider) return [];
    return Object.entries(summary.by_provider).map(([provider, v]: any) => ({
      name: PROVIDER_LABELS[provider] ?? provider,
      provider,
      value: v.total_tokens,
    }));
  }, [summary]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Consumo de IA</h2>
        <p className="text-sm text-muted-foreground">
          Acompanhe tokens, chamadas e custo estimado de todas as integrações de IA da plataforma.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Provedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os provedores</SelectItem>
            {PROVIDERS.map((p) => <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Empresa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {orgs.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs coloridos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Chamadas"
          value={(summary?.total_calls ?? 0).toLocaleString('pt-BR')}
          icon={<Activity className="h-5 w-5" />}
          gradient="from-violet-500 to-fuchsia-500"
        />
        <KpiCard
          title="Tokens"
          value={(summary?.total_tokens ?? 0).toLocaleString('pt-BR')}
          icon={<Zap className="h-5 w-5" />}
          gradient="from-sky-500 to-cyan-500"
        />
        <KpiCard
          title="Custo estimado"
          value={fmtUSD(totalCostUSD)}
          sub={fmtBRL(totalCostUSD * DEFAULT_USD_BRL)}
          icon={<Coins className="h-5 w-5" />}
          gradient="from-emerald-500 to-teal-500"
        />
        <KpiCard
          title="Custo médio / chamada"
          value={fmtUSD(avgCostPerCall)}
          icon={<TrendingUp className="h-5 w-5" />}
          gradient="from-amber-500 to-orange-500"
        />
        <KpiCard
          title="Empresas ativas"
          value={(summary?.unique_orgs ?? 0).toLocaleString('pt-BR')}
          icon={<Building2 className="h-5 w-5" />}
          gradient="from-pink-500 to-rose-500"
        />
      </div>

      {/* Timeseries + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Tokens por dia</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={tsData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                {providersInData.map((p) => (
                  <Area
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stackId="1"
                    name={PROVIDER_LABELS[p] ?? p}
                    stroke={PROVIDER_COLORS[p] ?? '#888'}
                    fill={PROVIDER_COLORS[p] ?? '#888'}
                    fillOpacity={0.5}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por provedor</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                  {donutData.map((d: any) => (
                    <Cell key={d.provider} fill={PROVIDER_COLORS[d.provider] ?? '#888'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => Number(v).toLocaleString('pt-BR') + ' tokens'} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top empresas */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top empresas por consumo</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(220, byOrg.length * 32)}>
            <BarChart data={byOrg} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" fontSize={11} />
              <YAxis dataKey="org_name" type="category" fontSize={11} width={140} />
              <Tooltip formatter={(v: any) => Number(v).toLocaleString('pt-BR') + ' tokens'} />
              <Bar dataKey="total_tokens" fill="hsl(262 83% 58%)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Ranking modelos + chaves */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Ranking por modelo</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2">Modelo</th>
                    <th className="text-right py-2">Chamadas</th>
                    <th className="text-right py-2">Tokens</th>
                    <th className="text-right py-2">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((m, i) => {
                    const cost = estimateCostUSD(m.provider, m.model, m.prompt_tokens, m.completion_tokens);
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: PROVIDER_COLORS[m.provider] ?? '#888' }} />
                            <span className="font-mono text-xs">{m.model}</span>
                          </div>
                          <Badge variant="outline" className="mt-1 text-[10px]">{PROVIDER_LABELS[m.provider] ?? m.provider}</Badge>
                        </td>
                        <td className="text-right">{m.calls.toLocaleString('pt-BR')}</td>
                        <td className="text-right">{m.total_tokens.toLocaleString('pt-BR')}</td>
                        <td className="text-right font-medium">{fmtUSD(cost)}</td>
                      </tr>
                    );
                  })}
                  {byModel.length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sem dados no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Consumo por chave do pool</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2">Chave</th>
                    <th className="text-right py-2">Chamadas</th>
                    <th className="text-right py-2">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {byKey.map((k, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: PROVIDER_COLORS[k.provider] ?? '#888' }} />
                          <span className="text-xs">{k.key_label}</span>
                        </div>
                        <Badge variant="outline" className="mt-1 text-[10px]">{PROVIDER_LABELS[k.provider] ?? k.provider}</Badge>
                      </td>
                      <td className="text-right">{k.calls.toLocaleString('pt-BR')}</td>
                      <td className="text-right">{k.total_tokens.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                  {byKey.length === 0 && (
                    <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Sem dados no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  title, value, sub, icon, gradient,
}: { title: string; value: string; sub?: string; icon: React.ReactNode; gradient: string }) {
  return (
    <Card className={`bg-gradient-to-br ${gradient} text-white border-0 shadow-md`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2 opacity-90">
          <span className="text-xs font-medium uppercase tracking-wider">{title}</span>
          {icon}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs opacity-80 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
