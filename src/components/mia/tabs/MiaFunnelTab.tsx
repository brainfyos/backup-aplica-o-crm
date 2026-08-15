// MiaFunnelTab — Commercial Intelligence Hub.
// Funil visual com conversão real, tempo médio por etapa, gargalos e valor.

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, Clock, DollarSign, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FunnelStage } from "@/hooks/useMiaCommercialIntel";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  if (v >= 1_000_000) return `R$ ${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$ ${(v/1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
}

function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function stageColor(convRate: number | null, stalled: number, total: number): string {
  if (total === 0) return "#94a3b8";
  const stalledPct = stalled / total;
  if (stalledPct > 0.5) return "#ef4444";
  if (stalledPct > 0.3) return "#f59e0b";
  if (convRate != null && convRate < 0.2) return "#f97316";
  return "#6366f1";
}

// ── Funil SVG (trapézios) ─────────────────────────────────────────────────────

function FunnelShape({ stages }: { stages: FunnelStage[] }) {
  if (!stages.length) return null;
  const maxTotal = Math.max(...stages.map(s => s.total), 1);
  const W = 600, H = 60 * stages.length;
  const PAD = 20;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 360 }}>
      {stages.map((stage, i) => {
        const pct    = stage.total / maxTotal;
        const width  = PAD + (W - PAD * 2) * pct;
        const x      = (W - width) / 2;
        const y      = i * 60;
        const h      = 52;
        const nextPct = i < stages.length - 1 ? stages[i + 1].total / maxTotal : pct * 0.8;
        const nextW   = PAD + (W - PAD * 2) * nextPct;
        const nextX   = (W - nextW) / 2;
        const color   = stageColor(stage.convRate, stage.stalled, stage.total);

        return (
          <g key={stage.id}>
            {/* Trapézio */}
            <polygon
              points={`${x},${y} ${x+width},${y} ${nextX+nextW},${y+h} ${nextX},${y+h}`}
              fill={color}
              opacity={0.85}
              style={{ transition: "all 0.5s ease" }}
            />
            {/* Nome da etapa */}
            <text x={W/2} y={y + h/2 - 6} textAnchor="middle" fill="white"
              fontSize={13} fontWeight={600} fontFamily="system-ui">
              {stage.name}
            </text>
            {/* Contagem */}
            <text x={W/2} y={y + h/2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.85)"
              fontSize={11} fontFamily="system-ui">
              {stage.total} leads{stage.stalled > 0 ? ` · ${stage.stalled} parados` : ""}
            </text>
            {/* Seta de conversão entre etapas */}
            {i < stages.length - 1 && stage.convRate != null && (
              <text x={W - 36} y={y + h - 4} textAnchor="middle" fill={stage.convRate < 0.3 ? "#ef4444" : "#94a3b8"}
                fontSize={10} fontFamily="system-ui">
                ↓ {fmtPct(stage.convRate)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Tooltip customizado ───────────────────────────────────────────────────────

function CT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border rounded-lg shadow-xl p-3 text-xs min-w-[150px]">
      <p className="font-semibold text-sm mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex gap-2 items-center">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold">{typeof p.value === "number" && p.value > 1000 ? fmtBRL(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  stages:  FunnelStage[];
  loading: boolean;
  orgId:   string | null;
}

export function MiaFunnelTab({ stages, loading, orgId }: Props) {
  const totalLeads     = stages.reduce((s, e) => s + e.total, 0);
  const totalValue     = stages.reduce((s, e) => s + e.value, 0);
  const totalStalled   = stages.reduce((s, e) => s + e.stalled, 0);
  const firstStage     = stages[0];
  const lastStage      = stages[stages.length - 1];
  const overallConv    = firstStage?.total > 0 && lastStage
    ? lastStage.total / firstStage.total : null;

  // Gargalo: etapa com maior % de parados
  const bottleneck = useMemo(() =>
    stages.reduce<FunnelStage | null>((worst, s) => {
      if (!worst || (s.total > 0 && s.stalled / s.total > (worst.stalled / (worst.total || 1)))) return s;
      return worst;
    }, null)
  , [stages]);

  // Dados para o bar chart de valor por etapa
  const valueData = stages.filter(s => s.value > 0).map(s => ({
    name:    s.name.slice(0, 12),
    valor:   s.value,
    leads:   s.total,
  }));

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-48 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stages.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>Nenhuma etapa de pipeline encontrada.</p>
        <p className="text-sm mt-1">Configure seu pipeline em Gestão → Negócios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Leads no funil" value={totalLeads} icon={Users}       color="#6366f1" />
        <Kpi label="Conversão geral" value={overallConv != null ? fmtPct(overallConv) : "—"} icon={TrendingDown} color={overallConv != null && overallConv < 0.1 ? "#ef4444" : "#10b981"} />
        <Kpi label="Parados +7 dias" value={totalStalled} icon={Clock}    color={totalStalled > 20 ? "#ef4444" : "#f59e0b"} alert={totalStalled > 20} />
        <Kpi label="Valor em aberto" value={fmtBRL(totalValue)} icon={DollarSign} color="#10b981" />
      </div>

      {/* Layout principal: funil + detalhes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Funil SVG */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Funil de conversão — {totalLeads} leads ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelShape stages={stages} />
          </CardContent>
        </Card>

        {/* Tabela de etapas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detalhes por etapa</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {stages.map(stage => {
                const stalledPct = stage.total > 0 ? stage.stalled / stage.total : 0;
                const color = stageColor(stage.convRate, stage.stalled, stage.total);
                return (
                  <div key={stage.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/50 text-sm">
                    <div className="w-2 h-8 rounded-full" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{stage.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Média {stage.avgDays}d por lead{stage.stalled > 0 ? ` · ${stage.stalled} parados` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold tabular-nums">{stage.total}</p>
                      {stage.convRate != null && (
                        <p className={cn("text-xs", stage.convRate < 0.2 ? "text-red-500" : "text-muted-foreground")}>
                          {fmtPct(stage.convRate)} conv.
                        </p>
                      )}
                    </div>
                    {stalledPct > 0.3 && (
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Valor por etapa */}
      {valueData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              Valor em aberto por etapa — total {fmtBRL(totalValue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={valueData} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtBRL} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} width={90} />
                <Tooltip content={<CT />} />
                <Bar dataKey="valor" name="Valor" radius={[0,4,4,0]} fill="#10b981">
                  <LabelList dataKey="valor" position="right" formatter={fmtBRL}
                    style={{ fontSize: 11, fill: "#94a3b8" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Alerta de gargalo */}
      {bottleneck && bottleneck.stalled > 3 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 flex items-center gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <span className="font-semibold">Gargalo detectado em "{bottleneck.name}":</span>
              {" "}{bottleneck.stalled} leads parados há mais de 7 dias
              ({Math.round(bottleneck.stalled / Math.max(bottleneck.total, 1) * 100)}% da etapa).
              {bottleneck.convRate != null && ` Taxa de avanço: ${fmtPct(bottleneck.convRate)}.`}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, alert }: { label: string; value: any; icon: any; color: string; alert?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", alert && "border-red-500/30 bg-red-500/5")}>
      <div className="flex items-center justify-between text-muted-foreground mb-1">
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <p className="text-2xl font-bold tabular-nums" style={{ color: alert ? "#ef4444" : color }}>
        {value}
      </p>
    </div>
  );
}
