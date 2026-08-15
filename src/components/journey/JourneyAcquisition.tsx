import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Info } from 'lucide-react';
import { useJourneyCampaigns, useJourneyCreatives, useJourneyOrigins } from '@/hooks/useLeadJourney';
import type { JourneyFilters } from '@/lib/leadJourney';

interface Props {
  filters: JourneyFilters | null;
  onOriginClick?: (origin: string) => void;
  onCampaignClick?: (campaign: string) => void;
  onCreativeClick?: (creative: string) => void;
}

const CHART_COLORS = [
  'hsl(217 91% 60%)', 'hsl(280 87% 65%)', 'hsl(160 84% 39%)',
  'hsl(45 93% 58%)', 'hsl(0 84% 60%)', 'hsl(190 90% 50%)',
  'hsl(320 80% 60%)', 'hsl(140 70% 45%)',
];

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

function EmptyIntegration({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
        <Info className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">Aguardando integração</p>
      <p className="text-xs text-muted-foreground max-w-xs">{label}</p>
    </div>
  );
}

export function JourneyAcquisition({ filters, onOriginClick, onCampaignClick, onCreativeClick }: Props) {
  const [tab, setTab] = useState('origins');
  const origins = useJourneyOrigins(filters);
  const campaigns = useJourneyCampaigns(filters);
  const creatives = useJourneyCreatives(filters);

  const chartData = useMemo(
    () => (origins.data ?? []).slice(0, 8).map((o, i) => ({ name: o.label, value: o.leads, color: CHART_COLORS[i % CHART_COLORS.length], key: o.key })),
    [origins.data],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Aquisição</CardTitle>
        <p className="text-xs text-muted-foreground">De onde seus leads estão chegando.</p>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="origins">Origens</TabsTrigger>
            <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
            <TabsTrigger value="creatives">Criativos</TabsTrigger>
          </TabsList>

          <TabsContent value="origins" className="mt-4">
            {origins.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !chartData.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum lead no período.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        onClick={(d: any) => onOriginClick?.(d.key)}
                      >
                        {chartData.map((d) => <Cell key={d.key} fill={d.color} style={{ cursor: 'pointer' }} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => `${v} leads`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-2">
                  {(origins.data ?? []).slice(0, 8).map((o, i) => (
                    <li key={o.key}>
                      <button
                        onClick={() => onOriginClick?.(o.key)}
                        className="w-full flex items-center gap-3 py-2 px-2 rounded hover:bg-accent transition-colors text-left"
                      >
                        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="flex-1 text-sm font-medium truncate">{o.label}</span>
                        <span className="text-sm tabular-nums">{o.leads.toLocaleString('pt-BR')}</span>
                        <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">{pct(o.pct)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="campaigns" className="mt-4">
            {campaigns.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !campaigns.data?.length ? (
              <EmptyIntegration label="Conecte Meta Ads ou Google Ads, ou envie leads com UTM (utm_campaign) para visualizar campanhas aqui." />
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left font-normal py-2 px-2">Campanha</th>
                      <th className="text-right font-normal py-2 px-2">Leads</th>
                      <th className="text-right font-normal py-2 px-2">Qualif.</th>
                      <th className="text-right font-normal py-2 px-2">Oport.</th>
                      <th className="text-right font-normal py-2 px-2">Vendas</th>
                      <th className="text-right font-normal py-2 px-2">Receita</th>
                      <th className="text-right font-normal py-2 px-2">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.data.map((c) => (
                      <tr
                        key={c.key}
                        onClick={() => onCampaignClick?.(c.key)}
                        className="border-b border-border/50 hover:bg-accent cursor-pointer"
                      >
                        <td className="py-2 px-2 font-medium truncate max-w-[200px]">{c.name}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{c.leads}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{c.qualified}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{c.opportunities}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{c.sales}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-emerald-500 font-medium">{money(c.revenue)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{pct(c.conversion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="creatives" className="mt-4">
            {creatives.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !creatives.data?.length ? (
              <EmptyIntegration label="Conecte Meta Ads ou Google Ads para ver métricas por criativo (ROAS, receita, conversão)." />
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left font-normal py-2 px-2">Criativo</th>
                      <th className="text-right font-normal py-2 px-2">Leads</th>
                      <th className="text-right font-normal py-2 px-2">Conv.</th>
                      <th className="text-right font-normal py-2 px-2">Investido</th>
                      <th className="text-right font-normal py-2 px-2">Receita</th>
                      <th className="text-right font-normal py-2 px-2">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creatives.data.map((c) => (
                      <tr
                        key={c.key}
                        onClick={() => onCreativeClick?.(c.key)}
                        className="border-b border-border/50 hover:bg-accent cursor-pointer"
                      >
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            {c.thumbnail_url && (
                              <img src={c.thumbnail_url} alt="" className="h-8 w-8 rounded object-cover" />
                            )}
                            <span className="font-medium truncate max-w-[180px]">{c.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">{c.leads}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{pct(c.conversion)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{money(c.spend)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-emerald-500 font-medium">{money(c.revenue)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{c.roas != null ? `${c.roas.toFixed(2)}x` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default JourneyAcquisition;
