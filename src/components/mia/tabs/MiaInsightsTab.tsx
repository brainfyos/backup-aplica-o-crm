import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, TrendingUp, AlertTriangle, Users, Clock, BarChart3, Lightbulb, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MiaIntelData } from "@/hooks/useMiaIntelligence";

const CATEGORY_META: Record<string, { label: string; icon: any; color: string }> = {
  objection:       { label: "Objeção",         icon: AlertTriangle, color: "#ef4444" },
  winning_pattern: { label: "Padrão vencedor", icon: TrendingUp,    color: "#10b981" },
  losing_pattern:  { label: "Padrão de perda", icon: AlertTriangle, color: "#f59e0b" },
  seller_behavior: { label: "Comportamento",   icon: Users,         color: "#3b82f6" },
  lead_behavior:   { label: "Comportamento lead", icon: Users,      color: "#6366f1" },
  timing:          { label: "Timing",          icon: Clock,         color: "#8b5cf6" },
  channel_insight: { label: "Canal",           icon: BarChart3,     color: "#06b6d4" },
  general:         { label: "Geral",           icon: Lightbulb,     color: "#94a3b8" },
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? "#10b981" : pct >= 65 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function InsightCard({ insight }: { insight: any }) {
  const meta = CATEGORY_META[insight.category] ?? CATEGORY_META.general;
  const Icon = meta.icon;
  const evidence: string[] = Array.isArray(insight.evidence) ? insight.evidence.slice(0, 2) : [];

  return (
    <Card className="group hover:border-white/20 transition-all hover:shadow-lg">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-md shrink-0" style={{ background: meta.color + "20" }}>
            <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 border-0"
                style={{ background: meta.color + "15", color: meta.color }}
              >
                {meta.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {insight.occurrences}× observado
              </span>
            </div>
            <p className="text-sm font-medium leading-snug">{insight.title}</p>
          </div>
        </div>

        {/* Conteúdo */}
        <p className="text-xs text-muted-foreground leading-relaxed">{insight.content}</p>

        {/* Confiança */}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Confiança</p>
          <ConfidenceBar value={insight.confidence ?? 0.8} />
        </div>

        {/* Evidências */}
        {evidence.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Evidência</p>
            {evidence.map((ev: string, i: number) => (
              <p key={i} className="text-[11px] italic text-muted-foreground border-l-2 pl-2 leading-relaxed"
                 style={{ borderColor: meta.color + "60" }}>
                "{String(ev).slice(0, 120)}"
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Estado vazio ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="p-4 rounded-full bg-primary/10">
        <Brain className="h-8 w-8 text-primary" />
      </div>
      <div>
        <p className="font-semibold">A Mia ainda está aprendendo</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Assim que conversas forem encerradas e processadas pela <code className="text-xs bg-muted px-1 rounded">mia-learn</code>,
          os padrões aparecerão aqui automaticamente.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground max-w-sm">
        {[
          "Objeções mais frequentes por canal",
          "O que funciona em fechamentos",
          "Padrões de comportamento de leads",
          "Coaching individual por vendedor",
        ].map((t, i) => (
          <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
            <Zap className="h-3 w-3 text-primary shrink-0" />
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MiaInsightsTab({ data }: { data: MiaIntelData }) {
  const { knowledge, loading } = data;

  // Agrupa por categoria
  const grouped = knowledge.reduce((acc: Record<string, any[]>, k: any) => {
    const cat = k.category ?? "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(k);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!knowledge.length) return <EmptyState />;

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Padrões detectados" value={knowledge.length} color="#6366f1" />
        <StatCard label="Confiança média"
          value={`${Math.round((knowledge.reduce((s: number, k: any) => s + (k.confidence ?? 0), 0) / knowledge.length) * 100)}%`}
          color="#10b981" />
        <StatCard label="Mais frequente"
          value={(knowledge[0]?.occurrences ?? 0) + "×"}
          color="#f59e0b" />
        <StatCard label="Categorias"
          value={categories.length}
          color="#8b5cf6" />
      </div>

      {/* Insights agrupados por categoria */}
      {categories.map(cat => {
        const meta = CATEGORY_META[cat] ?? CATEGORY_META.general;
        const Icon = meta.icon;
        return (
          <div key={cat} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" style={{ color: meta.color }} />
              <h3 className="text-sm font-semibold">{meta.label}</h3>
              <span className="text-xs text-muted-foreground">({grouped[cat].length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped[cat].map((k: any) => (
                <InsightCard key={k.id} insight={k} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: color + "30", background: color + "08" }}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  );
}
