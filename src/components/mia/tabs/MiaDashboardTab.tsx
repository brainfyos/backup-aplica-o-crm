import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, AreaChart, Area, PieChart, Pie, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, MessageCircle, Flame, ListTodo, Users, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MiaIntelData } from "@/hooks/useMiaIntelligence";

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  primary:  "#6366f1",
  blue:     "#3b82f6",
  emerald:  "#10b981",
  amber:    "#f59e0b",
  red:      "#ef4444",
  purple:   "#8b5cf6",
  slate:    "#94a3b8",
  muted:    "rgba(255,255,255,0.06)",
};

const TEMP_COLORS: Record<string, string> = { hot: C.red, warm: C.amber, cold: C.slate };

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, icon: Icon, color, sub, alert,
}: { label: string; value: number | string; icon: any; color: string; sub?: string; alert?: boolean }) {
  return (
    <Card className={cn("border transition-all", alert && value && value !== 0 && "border-orange-500/40 bg-orange-500/5")}>
      <CardContent className="p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
          <p className={cn("text-3xl font-bold tabular-nums", alert && value && value !== 0 ? "text-orange-500" : "text-foreground")}>
            {value ?? "—"}
          </p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="p-2 rounded-lg" style={{ background: color + "20" }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Tooltip customizado ───────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border rounded-lg shadow-xl p-3 text-sm min-w-[140px]">
      <p className="text-muted-foreground text-xs mb-2 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
interface Props { data: MiaIntelData; onRefresh: () => void }

export function MiaDashboardTab({ data, onRefresh }: Props) {
  const { summary, team, pipeline, hotLeads, unanswered, loading, lastFetch } = data;

  // Pipeline: stages com total e parados
  const pipelineData = useMemo(() =>
    (pipeline?.etapas ?? [])
      .filter((e: any) => e.total > 0)
      .slice(0, 8)
      .map((e: any) => ({
        name: String(e.etapa).slice(0, 18),
        total: e.total,
        parados: e.parados_7d,
        ativos: Math.max(0, e.total - e.parados_7d),
      }))
  , [pipeline]);

  // Equipe: vendedores com conversas e tarefas
  const teamData = useMemo(() =>
    (team?.equipe ?? []).slice(0, 8).map((s: any) => ({
      name: String(s.nome).split(" ")[0],
      conversas: s.conversas_abertas,
      leads:     s.leads,
      atrasadas: s.tarefas_atrasadas,
    }))
  , [team]);

  // Sem resposta: tempo de espera
  const unansweredData = useMemo(() =>
    (unanswered?.conversas ?? []).slice(0, 6).map((c: any) => ({
      name:    String(c.lead).slice(0, 14),
      minutos: c.tempo_sem_resposta_min ?? 0,
      canal:   c.canal,
    }))
  , [unanswered]);

  // Hot leads distribuição por responsável
  const leadsByOwner = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of (hotLeads?.leads ?? [])) {
      const owner = l.responsavel ?? "Sem dono";
      map[owner] = (map[owner] ?? 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).slice(0, 6);
  }, [hotLeads]);

  const pieColors = [C.primary, C.blue, C.emerald, C.amber, C.purple, C.red];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Dashboard operacional</h2>
          <p className="text-xs text-muted-foreground">
            {lastFetch ? `Atualizado às ${lastFetch.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Carregando…"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Sem resposta"       value={summary?.conversas_sem_resposta ?? "—"} icon={MessageCircle} color={C.red}     alert />
        <KpiCard label="Leads quentes"      value={summary?.leads_quentes          ?? "—"} icon={Flame}         color={C.amber}          />
        <KpiCard label="Tarefas atrasadas"  value={summary?.tarefas_atrasadas      ?? "—"} icon={ListTodo}      color={C.amber}   alert />
        <KpiCard label="Sem responsável"    value={summary?.leads_sem_responsavel  ?? "—"} icon={Users}         color={C.slate}    alert />
      </div>

      {/* Row 2: Pipeline + Equipe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Pipeline funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Pipeline por etapa
              {pipeline?.top_gargalos?.length > 0 && (
                <Badge variant="destructive" className="text-[10px] ml-auto">
                  {pipeline.top_gargalos[0].etapa} em gargalo
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {pipelineData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Sem dados de pipeline</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={pipelineData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="ativos"   name="Ativos"   stackId="a" fill={C.primary} radius={[0,0,0,0]} />
                  <Bar dataKey="parados"  name="Parados"  stackId="a" fill={C.amber}   radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Equipe */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              Status da equipe
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {teamData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Sem dados de equipe</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={teamData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="conversas" name="Conversas" fill={C.blue}    radius={[4,4,0,0]} />
                  <Bar dataKey="atrasadas" name="Atrasadas" fill={C.red}     radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Sem resposta + Leads quentes por dono */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Sem resposta - tempo de espera */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-400" />
              Tempo sem resposta (min)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {unansweredData.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">
                Nenhuma conversa aguardando resposta 🎉
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={unansweredData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} width={70} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="minutos" name="Min aguardando" radius={[0,4,4,0]}>
                    {unansweredData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.minutos > 30 ? C.red : entry.minutos > 10 ? C.amber : C.emerald} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Leads quentes por responsável */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="h-4 w-4 text-amber-400" />
              Leads quentes por vendedor
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex items-center justify-center">
            {leadsByOwner.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Sem leads quentes</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={leadsByOwner}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name} (${value})`}
                    labelLine={false}
                  >
                    {leadsByOwner.map((_: any, i: number) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Alertas críticos */}
      {(pipeline?.top_gargalos?.length > 0 || (summary?.conversas_sem_resposta ?? 0) > 5) && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-4 w-4" />
              Alertas críticos
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {(summary?.conversas_sem_resposta ?? 0) > 5 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span><strong>{summary.conversas_sem_resposta}</strong> conversas aguardando resposta — risco de perda de lead</span>
              </div>
            )}
            {(pipeline?.top_gargalos ?? []).map((g: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Gargalo em <strong>{g.etapa}</strong>: {g.parados_7d} leads parados há mais de 7 dias</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
