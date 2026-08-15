// MiaLeadScoreTab — Lead Intelligence Score.
// Score 0-100 por lead com motivos, ações recomendadas e distribuição.

import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Thermometer, Snowflake, AlertCircle, Clock, User, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ScoredLead } from "@/hooks/useMiaCommercialIntel";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LABEL_CONFIG = {
  Crítico: { color: "#6366f1", bg: "bg-indigo-500/15 text-indigo-400", icon: AlertCircle,  desc: "Ação imediata" },
  Quente:  { color: "#ef4444", bg: "bg-red-500/15 text-red-400",       icon: Flame,         desc: "Alta prioridade" },
  Morno:   { color: "#f59e0b", bg: "bg-amber-500/15 text-amber-400",   icon: Thermometer,   desc: "Acompanhar" },
  Frio:    { color: "#94a3b8", bg: "bg-slate-500/15 text-slate-400",   icon: Snowflake,     desc: "Nutrir" },
} as const;

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "#6366f1" : score >= 50 ? "#ef4444" : score >= 30 ? "#f59e0b" : "#94a3b8";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums w-7 text-right" style={{ color }}>{score}</span>
    </div>
  );
}

function fmtDays(iso: string | null): string {
  if (!iso) return "nunca";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "hoje";
  if (d === 1) return "ontem";
  return `${d}d atrás`;
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props { leads: ScoredLead[]; loading: boolean }

export function MiaLeadScoreTab({ leads, loading }: Props) {
  const [filter, setFilter] = useState<ScoredLead["scoreLabel"] | "todos">("todos");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Distribuição de scores
  const dist = useMemo(() => {
    const m: Record<string, number> = { Crítico: 0, Quente: 0, Morno: 0, Frio: 0 };
    for (const l of leads) m[l.scoreLabel]++;
    return Object.entries(m).map(([name, value]) => ({ name, value, color: LABEL_CONFIG[name as keyof typeof LABEL_CONFIG]?.color ?? "#94a3b8" }));
  }, [leads]);

  const filtered = filter === "todos" ? leads : leads.filter(l => l.scoreLabel === filter);
  const topLeads = filtered.slice(0, 50);

  if (loading) {
    return <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />;
  }

  if (!leads.length) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Flame className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>Nenhum lead disponível para scoring.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Distribuição */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribuição de score — {leads.length} leads</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex items-center gap-6">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={dist} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                  paddingAngle={3} dataKey="value">
                  {dist.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} leads`, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {dist.map(d => {
                const cfg = LABEL_CONFIG[d.name as keyof typeof LABEL_CONFIG];
                if (!cfg) return null;
                const Icon = cfg.icon;
                return (
                  <button key={d.name}
                    onClick={() => setFilter(f => f === d.name ? "todos" : d.name as any)}
                    className={cn("flex items-center gap-2 text-sm px-2 py-1 rounded-lg transition w-full text-left",
                      filter === d.name ? "bg-white/10" : "hover:bg-white/5"
                    )}>
                    <Icon className="h-3.5 w-3.5" style={{ color: d.color }} />
                    <span>{d.name}</span>
                    <span className="ml-auto font-bold tabular-nums" style={{ color: d.color }}>{d.value}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Top 3 críticos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-indigo-400" />
              Prioridade máxima agora
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {leads.filter(l => l.score >= 70).slice(0, 4).map(l => (
              <div key={l.id} className="flex items-center gap-3 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-400">
                  {l.score}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{l.name}</p>
                  <p className="text-xs text-muted-foreground">{l.stage ?? "Sem etapa"} · {fmtDays(l.lastContact)}</p>
                </div>
                <div className="text-xs text-right">
                  <p className="text-muted-foreground">{l.responsavel ?? "Sem dono"}</p>
                </div>
              </div>
            ))}
            {leads.filter(l => l.score >= 70).length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center">Nenhum lead crítico no momento.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <Button variant={filter === "todos" ? "default" : "outline"} size="sm" onClick={() => setFilter("todos")}>
          Todos ({leads.length})
        </Button>
        {(["Crítico","Quente","Morno","Frio"] as const).map(label => {
          const cfg = LABEL_CONFIG[label];
          const count = leads.filter(l => l.scoreLabel === label).length;
          return (
            <Button key={label} variant={filter === label ? "default" : "outline"} size="sm"
              onClick={() => setFilter(f => f === label ? "todos" : label)}>
              <cfg.icon className="h-3.5 w-3.5 mr-1.5" style={{ color: cfg.color }} />
              {label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Lista de leads com score */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-1.5">
            {topLeads.map(lead => {
              const cfg = LABEL_CONFIG[lead.scoreLabel];
              const Icon = cfg?.icon ?? Flame;
              const isOpen = expanded === lead.id;
              return (
                <div key={lead.id}
                  className="border rounded-xl overflow-hidden transition-all"
                  style={{ borderColor: isOpen ? cfg?.color + "40" : "transparent" }}>
                  <button
                    onClick={() => setExpanded(e => e === lead.id ? null : lead.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition text-left"
                  >
                    {/* Score badge */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: cfg?.color + "20", color: cfg?.color }}>
                      {lead.score}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium truncate">{lead.name}</p>
                        <Badge className={cn("text-[10px] px-1.5 py-0 h-4", cfg?.bg)}>
                          {lead.scoreLabel}
                        </Badge>
                      </div>
                      <ScoreBar score={lead.score} />
                    </div>

                    {/* Meta */}
                    <div className="text-xs text-right text-muted-foreground shrink-0 hidden sm:block">
                      <p className="flex items-center gap-1 justify-end">
                        <User className="h-3 w-3" /> {lead.responsavel ?? "Sem dono"}
                      </p>
                      <p className="flex items-center gap-1 justify-end mt-0.5">
                        <Clock className="h-3 w-3" /> {fmtDays(lead.lastContact)}
                      </p>
                    </div>

                    <ChevronRight className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", isOpen && "rotate-90")} />
                  </button>

                  {/* Expandido: motivos + ação */}
                  {isOpen && (
                    <div className="px-4 pb-3 space-y-2 border-t border-white/10">
                      <div className="pt-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Motivos do score</p>
                        <div className="flex flex-wrap gap-1.5">
                          {lead.reasons.map((r, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Etapa: </span>
                          <span className="font-medium">{lead.stage ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Na etapa há: </span>
                          <span className={cn("font-medium", (lead.daysInStage ?? 0) > 10 && "text-amber-500")}>
                            {lead.daysInStage != null ? `${lead.daysInStage} dias` : "—"}
                          </span>
                        </div>
                        {lead.nextAction && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Próxima ação: </span>
                            <span className="font-medium">{lead.nextAction}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
