// MiaRevenueTab — Revenue Intelligence & Forecast.
// Pipeline por valor, forecast mensal, ROI por canal e top deals.

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, AreaChart, Area, PieChart, Pie, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, TrendingDown, Target, BarChart3, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RevenueIntel } from "@/hooks/useMiaCommercialIntel";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number, compact = true) {
  if (compact) {
    if (v >= 1_000_000) return `R$${(v/1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `R$${(v/1_000).toFixed(0)}k`;
  }
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function CT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border rounded-lg shadow-xl p-3 text-xs min-w-[140px]">
      <p className="font-semibold mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill || p.stroke }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold">{typeof p.value === "number" ? fmtBRL(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

const CHANNEL_COLORS = ["#6366f1","#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6"];

// ── Componente principal ──────────────────────────────────────────────────────

interface Props { revenue: RevenueIntel | null; loading: boolean }

export function MiaRevenueTab({ revenue, loading }: Props) {
  if (loading) {
    return <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />;
  }

  if (!revenue) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>Sem dados de receita disponíveis.</p>
        <p className="text-xs mt-1">Configure deals nos leads para ver as métricas financeiras.</p>
      </div>
    );
  }

  const forecastVsWon = revenue.wonThisMonth > 0
    ? ((revenue.forecastMonth / revenue.wonThisMonth - 1) * 100).toFixed(0)
    : null;

  // Dados do forecast por etapa
  const forecastData = revenue.pipelineByStage.map(s => ({
    name:     s.stage.slice(0, 12),
    pipeline: s.value,
    forecast: Math.round(s.value * s.prob),
    prob:     Math.round(s.prob * 100),
  }));

  // Dados por canal
  const channelData = revenue.byChannel.map(c => ({
    name:   c.channel,
    leads:  c.count,
    valor:  c.value,
  }));

  return (
    <div className="space-y-5">
      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Pipeline total"
          value={fmtBRL(revenue.pipelineTotal)}
          icon={BarChart3}
          color="#6366f1"
          sub={`${revenue.pipelineByStage.reduce((s,p) => s+p.count, 0)} deals`}
        />
        <KpiCard
          label="Forecast do mês"
          value={fmtBRL(revenue.forecastMonth)}
          icon={Target}
          color="#10b981"
          sub={forecastVsWon ? `${forecastVsWon}% vs mês ant.` : undefined}
        />
        <KpiCard
          label="Fechado este mês"
          value={fmtBRL(revenue.wonThisMonth)}
          icon={TrendingUp}
          color="#10b981"
        />
        <KpiCard
          label="Ticket médio"
          value={revenue.avgTicket > 0 ? fmtBRL(revenue.avgTicket) : "—"}
          icon={DollarSign}
          color="#f59e0b"
          sub={revenue.lostThisMonth > 0 ? `R$${(revenue.lostThisMonth/1000).toFixed(0)}k perdido` : undefined}
        />
      </div>

      {/* Pipeline por etapa + Forecast */}
      {forecastData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              Pipeline vs Forecast ponderado por conversão histórica
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={forecastData} margin={{ left: 0, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tickFormatter={v => fmtBRL(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip content={<CT />} />
                <Bar dataKey="pipeline" name="Pipeline" fill="#6366f1" opacity={0.5} radius={[4,4,0,0]} />
                <Bar dataKey="forecast"  name="Forecast" fill="#10b981" radius={[4,4,0,0]}>
                  <LabelList dataKey="prob" position="top" formatter={(v: number) => `${v}%`}
                    style={{ fontSize: 10, fill: "#94a3b8" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Por canal + Top deals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Canal */}
        {channelData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pipeline por canal de origem</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2.5">
                {channelData.map((c, i) => {
                  const maxVal = channelData[0].valor;
                  const pct = maxVal > 0 ? c.valor / maxVal : 0;
                  const color = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
                  return (
                    <div key={c.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium capitalize">{c.name}</span>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{c.leads} leads</span>
                          <span className="font-bold" style={{ color }}>{fmtBRL(c.valor)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top deals */}
        {revenue.topDeals.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top deals em aberto</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {revenue.topDeals.map((deal, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/5 border border-white/5 text-sm">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{deal.lead}</p>
                    <p className="text-xs text-muted-foreground">{deal.stage}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-emerald-400">{fmtBRL(deal.value)}</p>
                    <p className={cn("text-[10px]", deal.days > 7 ? "text-amber-500" : "text-muted-foreground")}>
                      {deal.days}d parado
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Insight de forecast */}
      {revenue.forecastMonth > 0 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-3 flex items-center gap-3 text-sm">
            <Target className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              Com <strong>{revenue.pipelineByStage.reduce((s,p) => s+p.count, 0)} deals</strong> em aberto
              e conversão histórica aplicada, o forecast ponderado é{" "}
              <strong className="text-emerald-400">{fmtBRL(revenue.forecastMonth, false)}</strong> este mês.
              {revenue.wonThisMonth > 0 && ` Já fechados: ${fmtBRL(revenue.wonThisMonth, false)}.`}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: any; color: string; sub?: string;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: color + "25", background: color + "08" }}>
      <div className="flex items-center justify-between text-muted-foreground mb-1">
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
