// MiaSellersTab — Seller Intelligence & Coaching.
// Radar por vendedor, tempo de resposta, gargalos e alertas de performance.

import { useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, TrendingDown, AlertTriangle, Clock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SellerIntel } from "@/hooks/useMiaCommercialIntel";
import type { MiaIntelData } from "@/hooks/useMiaIntelligence";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

function fmtMin(v: number | null) {
  if (v == null) return "—";
  if (v < 60)  return `${Math.round(v)} min`;
  return `${(v / 60).toFixed(1)}h`;
}

function gargaloColor(g: string) {
  if (g === "alto") return "#ef4444";
  if (g === "medio") return "#f59e0b";
  return "#10b981";
}

function CT({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border rounded-lg shadow-xl p-3 text-xs min-w-[130px]">
      <p className="font-semibold mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill || p.stroke }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Radar de um vendedor ──────────────────────────────────────────────────────

function SellerRadar({ seller, teamAvg }: { seller: any; teamAvg: Record<string, number> }) {
  const data = [
    { axis: "Conversas",  value: Math.min(100, (seller.conversas / Math.max(teamAvg.conversas, 1)) * 50) },
    { axis: "Leads",      value: Math.min(100, (seller.leads / Math.max(teamAvg.leads, 1)) * 50) },
    { axis: "Sem atraso", value: seller.tarefasAtrasadas === 0 ? 100 : Math.max(0, 100 - seller.tarefasAtrasadas * 15) },
    { axis: "Conversão",  value: seller.convRate != null ? Math.round(seller.convRate * 100) : 40 },
    { axis: "Resposta",   value: seller.avgResponseMin != null ? Math.max(0, 100 - seller.avgResponseMin) : 50 },
  ];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data}>
        <PolarGrid stroke="rgba(255,255,255,0.1)" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "#94a3b8" }} />
        <Radar name={seller.name} dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props {
  sellers: SellerIntel[];
  intel:   MiaIntelData; // para pegar conversas/tarefas do team_status
  loading: boolean;
}

export function MiaSellersTab({ sellers, intel, loading }: Props) {
  // Fonte primária: intel.team.equipe (dados reais do mia-tools deployed)
  // Enriquece com métricas de conversão/score do commerce.sellers
  const enriched = useMemo(() => {
    const equipe = intel.team?.equipe ?? [];

    // Se não há dados de team mas há sellers do commerce, usa eles
    if (!equipe.length && sellers.length) {
      return sellers.filter(s => s.leads > 0);
    }

    // Mapa de score/convRate por nome do vendedor
    const scoreMap: Record<string, Partial<SellerIntel>> = {};
    for (const s of sellers) {
      scoreMap[s.name] = { score: s.score, convRate: s.convRate, avgResponseMin: s.avgResponseMin };
    }

    return equipe.map((t: any) => {
      const extra = scoreMap[t.nome] ?? {};
      const gargalo: "baixo" | "medio" | "alto" = t.nivel_gargalo ?? "baixo";
      let score = extra.score ?? 50;
      // Ajusta score baseado nos dados reais
      if (t.tarefas_atrasadas > 3) score -= 15;
      if (t.conversas_abertas > 10) score -= 10;
      score = Math.max(0, Math.min(100, score));
      return {
        id:              t.nome, // usa nome como id (equipe não tem id aqui)
        name:            t.nome,
        conversas:       t.conversas_abertas ?? 0,
        leads:           t.leads ?? 0,
        tarefasAtrasadas: t.tarefas_atrasadas ?? 0,
        convRate:        extra.convRate ?? null,
        avgResponseMin:  extra.avgResponseMin ?? null,
        gargalo,
        score,
      };
    }).filter(s => s.conversas > 0 || s.leads > 0);
  }, [sellers, intel.team]);

  const teamAvg = useMemo(() => ({
    conversas: enriched.reduce((s, x) => s + x.conversas, 0) / Math.max(enriched.length, 1),
    leads:     enriched.reduce((s, x) => s + x.leads, 0) / Math.max(enriched.length, 1),
  }), [enriched]);

  // Top performer e quem precisa de atenção
  const topPerformer = [...enriched].sort((a, b) => b.score - a.score)[0];
  const needsAttention = enriched.filter(s => s.gargalo === "alto" || s.tarefasAtrasadas > 3);

  // Dados para comparativo
  const compData = enriched.map(s => ({
    name:      s.name.split(" ")[0],
    conversas: s.conversas,
    leads:     s.leads,
    atrasadas: s.tarefasAtrasadas,
  }));

  if (loading) {
    return <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />;
  }

  if (!enriched.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>Nenhum vendedor com dados disponíveis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Alertas */}
      {needsAttention.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 space-y-1">
            {needsAttention.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <strong>{s.name}</strong>
                {s.gargalo === "alto" && " — gargalo alto:"}
                {s.conversas > 0 && ` ${s.conversas} conversas abertas`}
                {s.tarefasAtrasadas > 0 && `, ${s.tarefasAtrasadas} tarefas atrasadas`}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Top + Comparativo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {topPerformer && (
          <Card className="border-indigo-500/30 bg-indigo-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-400" />
                Melhor performance
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-lg font-bold text-indigo-400">
                  {topPerformer.name[0]}
                </div>
                <div>
                  <p className="font-semibold">{topPerformer.name}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">Score {topPerformer.score}/100</Badge>
                    {topPerformer.convRate != null && (
                      <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-0">
                        {fmtPct(topPerformer.convRate)} conv.
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <SellerRadar seller={topPerformer} teamAvg={teamAvg} />
            </CardContent>
          </Card>
        )}

        {/* Comparativo de conversas e leads */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Comparativo da equipe</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={compData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip content={<CT />} />
                <Bar dataKey="conversas" name="Conversas" fill="#6366f1" radius={[4,4,0,0]} />
                <Bar dataKey="leads"     name="Leads"     fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="atrasadas" name="Atrasadas" fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Cards individuais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {enriched.map(seller => {
          const gColor = gargaloColor(seller.gargalo);
          return (
            <Card key={seller.id} className="relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full" style={{ background: gColor }} />
              <CardContent className="p-4 pl-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{seller.name}</p>
                    <Badge variant="outline" className="text-[10px] mt-0.5"
                      style={{ borderColor: gColor + "50", color: gColor }}>
                      Gargalo {seller.gargalo}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold tabular-nums text-primary">{seller.score}</p>
                    <p className="text-[10px] text-muted-foreground">score</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <Metric label="Conversas"  value={seller.conversas} alert={seller.conversas > 10} />
                  <Metric label="Leads"       value={seller.leads} />
                  <Metric label="Atrasadas"   value={seller.tarefasAtrasadas} alert={seller.tarefasAtrasadas > 0} />
                  <Metric label="Conversão"   value={fmtPct(seller.convRate)} />
                  {seller.avgResponseMin != null && (
                    <Metric label="T. resposta" value={fmtMin(seller.avgResponseMin)}
                      alert={seller.avgResponseMin > 60} icon={Clock} />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, alert, icon: Icon }: { label: string; value: any; alert?: boolean; icon?: any }) {
  return (
    <div className="flex items-center justify-between p-1.5 rounded bg-white/5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-bold", alert && "text-orange-400")}>{value ?? "—"}</span>
    </div>
  );
}
