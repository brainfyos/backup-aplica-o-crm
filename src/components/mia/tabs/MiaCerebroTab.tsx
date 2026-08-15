import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  CalendarClock,
  Flame,
  ListChecks,
  RefreshCw,
  Rotate3d,
  ScanSearch,
  ShieldCheck,
  Snowflake,
  Sparkles,
  SunMedium,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { MiaIntelData } from "@/hooks/useMiaIntelligence";
import { useMiaBrainData } from "@/hooks/useMiaBrainData";
import type {
  MiaOpenConversationAssessment,
  MiaOpenConversationsReport,
} from "@/hooks/useMiaOpenConversationsReport";
import { MiaBrainGraph360 } from "@/components/mia/MiaBrainGraph360";
import { MiaConversationCommandCenter } from "@/components/mia/MiaConversationCommandCenter";
import { RadarPanel } from "@/components/admin/radar/RadarPanel";

type Temperature = "hot" | "warm" | "cold" | "unknown";
type BrainFilter = "all" | Temperature;

interface Props {
  data: MiaIntelData;
  organizationId?: string | null;
  report: MiaOpenConversationsReport;
  assessments: Map<string, MiaOpenConversationAssessment>;
  reportLoading: boolean;
  analyzing: boolean;
  error: string | null;
  progress: number;
  onAnalyze: (maxConversations?: number, conversationIds?: string[]) => void;
  onRefreshReport: () => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenAgentAudit: () => void;
}

interface LearningPulse {
  audited: number;
  patterns: string[];
  loading: boolean;
  unavailable: boolean;
}

const TEMPERATURE_META: Record<Temperature, { label: string; color: string; icon: typeof Flame }> = {
  hot: { label: "Quentes", color: "#fb6b57", icon: Flame },
  warm: { label: "Mornos", color: "#f6c453", icon: SunMedium },
  cold: { label: "Frios", color: "#54c8e8", icon: Snowflake },
  unknown: { label: "Sem análise", color: "#718096", icon: ScanSearch },
};

function temperatureOf(assessment?: MiaOpenConversationAssessment): Temperature {
  if (!assessment) return "unknown";
  if (assessment.close_probability >= 70) return "hot";
  if (assessment.close_probability >= 40) return "warm";
  return "cold";
}

function topStrings(values: unknown[], limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const value of values.flatMap((item) => Array.isArray(item) ? item : [])) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

function useLearningPulse(organizationId?: string | null): LearningPulse {
  const [state, setState] = useState<LearningPulse>({
    audited: 0,
    patterns: [],
    loading: Boolean(organizationId),
    unavailable: false,
  });

  useEffect(() => {
    let alive = true;
    if (!organizationId) {
      setState({ audited: 0, patterns: [], loading: false, unavailable: false });
      return () => { alive = false; };
    }

    void (async () => {
      const { data, count, error } = await supabase
        .from("mia_conversation_insights")
        .select("conversation_id, what_failed, objections, processed_at", { count: "exact" })
        .eq("organization_id", organizationId)
        .order("processed_at", { ascending: false })
        .limit(300);
      if (!alive) return;
      if (error) {
        setState({ audited: 0, patterns: [], loading: false, unavailable: true });
        return;
      }
      const rows = data ?? [];
      setState({
        audited: count ?? new Set(rows.map((row) => row.conversation_id)).size,
        patterns: topStrings([
          ...rows.map((row) => row.what_failed),
          ...rows.map((row) => row.objections),
        ]),
        loading: false,
        unavailable: false,
      });
    })();

    return () => { alive = false; };
  }, [organizationId]);

  return state;
}

function MetricCard({
  temperature,
  value,
  active,
  onClick,
}: {
  temperature: Temperature;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  const meta = TEMPERATURE_META[temperature];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-2xl border px-4 py-3 text-left transition-all",
        active ? "border-white/25 bg-white/[.08] shadow-lg" : "border-white/10 bg-white/[.035] hover:bg-white/[.06]",
      )}
      style={active ? { boxShadow: `0 12px 34px ${meta.color}18` } : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-slate-400">{meta.label}</span>
        <Icon className="h-4 w-4" style={{ color: meta.color }} />
      </div>
      <p className="mt-2 text-2xl font-black tabular-nums text-white">{value}</p>
    </button>
  );
}

export function MiaCerebroTab({
  data,
  organizationId,
  report,
  assessments,
  reportLoading,
  analyzing,
  error,
  progress,
  onAnalyze,
  onRefreshReport,
  onOpenConversation,
  onOpenAgentAudit,
}: Props) {
  const effectiveOrganizationId = organizationId ?? data.orgId;
  const brain = useMiaBrainData(effectiveOrganizationId, Boolean(effectiveOrganizationId));
  const learning = useLearningPulse(data.orgId);
  const [filter, setFilter] = useState<BrainFilter>("all");
  const [view, setView] = useState<"map" | "queue" | "automation">("map");

  const counts = useMemo(() => {
    const next: Record<Temperature, number> = { hot: 0, warm: 0, cold: 0, unknown: 0 };
    brain.conversations.forEach((conversation) => {
      next[temperatureOf(assessments.get(conversation.id))] += 1;
    });
    return next;
  }, [assessments, brain.conversations]);

  const visibleConversations = useMemo(() => {
    if (filter === "all") return brain.conversations;
    return brain.conversations.filter((conversation) => temperatureOf(assessments.get(conversation.id)) === filter);
  }, [assessments, brain.conversations, filter]);

  const auditedVisibleConversations = useMemo(
    () => visibleConversations.filter((conversation) => assessments.has(conversation.id)),
    [assessments, visibleConversations],
  );

  const conversationIds = useMemo(
    () => new Set(brain.conversations.map((conversation) => conversation.id)),
    [brain.conversations],
  );
  const hottest = useMemo(() => report.conversations
    .filter((assessment) => conversationIds.has(assessment.conversation_id))
    .sort((a, b) => b.close_probability - a.close_probability)
    .slice(0, 4), [conversationIds, report.conversations]);

  const staleOrPending = report.coverage.pending_or_stale;
  const realCoverage = report.coverage.open_total ? report.coverage.percent : 0;
  const combinedError = error || brain.error;

  const analyzeAll = () => {
    if (!report.coverage.open_total) return;
    if (window.confirm(`Analisar minuciosamente as ${report.coverage.open_total} conversas abertas?`)) onAnalyze();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border bg-card p-1.5 shadow-sm">
        {([
          { value: "map", label: "Mapa vivo", icon: Rotate3d },
          { value: "queue", label: "Fila resolutiva", icon: ListChecks },
          { value: "automation", label: "Filtros e automações", icon: CalendarClock },
        ] as const).map((item) => {
          const Icon = item.icon;
          return <button key={item.value} type="button" onClick={() => setView(item.value)} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all", view === item.value ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-4 w-4" />{item.label}</button>;
        })}
      </div>

      {view === "queue" && (
        <MiaConversationCommandCenter
          conversations={brain.conversations}
          assessments={assessments}
          loading={brain.loading}
          analyzing={analyzing}
          onOpenConversation={onOpenConversation}
          onAnalyzeSelected={(conversationIds) => onAnalyze(undefined, conversationIds)}
          onChanged={() => { void brain.refresh(); onRefreshReport(); }}
        />
      )}

      {view === "automation" && (
        <div className="rounded-[28px] border bg-background p-1 sm:p-3">
          <RadarPanel onOpenConversation={onOpenConversation} />
        </div>
      )}

      {view === "map" && <section className="overflow-hidden rounded-[28px] border border-amber-300/20 bg-[#090b0d] text-slate-100 shadow-[0_30px_120px_rgba(0,0,0,.30)]">
      <div className="relative overflow-hidden border-b border-white/10 px-5 py-5 lg:px-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(246,196,83,.15),transparent_38%),radial-gradient(circle_at_90%_10%,rgba(84,200,232,.07),transparent_30%)]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-amber-300 shadow-[0_0_28px_rgba(246,196,83,.16)]">
              <BrainCircuit className="h-6 w-6" />
              <span className={cn("absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#090b0d]", brain.live ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-slate-500")} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-white">Córtex comercial da Mia</h2>
                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.18em] text-amber-200">mapa vivo 360°</span>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
                Cada ponto é uma conversa real. A temperatura vem da probabilidade de fechamento analisada pela Mia — sem classificação visual inventada.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={() => { void brain.refresh(); onRefreshReport(); }}
              disabled={brain.loading || reportLoading || analyzing}
            >
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", (brain.loading || reportLoading) && "animate-spin")} /> Atualizar
            </Button>
            <Button
              size="sm"
              className="h-9 bg-amber-300 font-bold text-[#15120a] hover:bg-amber-200"
              onClick={analyzeAll}
              disabled={analyzing || report.coverage.open_total === 0}
            >
              {analyzing ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="mr-2 h-3.5 w-3.5" />}
              {analyzing ? "Auditando…" : "Auditar todas"}
            </Button>
          </div>
        </div>

        {analyzing && (
          <div className="relative mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[.06] px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-amber-200">Lendo mensagens, validando evidências e recalculando temperatura</span>
              <span className="tabular-nums text-slate-400">{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5 bg-white/10" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-white/10 p-4 sm:grid-cols-4 lg:p-5">
        {(["hot", "warm", "cold", "unknown"] as Temperature[]).map((temperature) => (
          <MetricCard
            key={temperature}
            temperature={temperature}
            value={counts[temperature]}
            active={filter === temperature}
            onClick={() => setFilter((current) => current === temperature ? "all" : temperature)}
          />
        ))}
      </div>

      {combinedError && (
        <div className="m-4 flex items-start gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200 lg:m-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {combinedError}
        </div>
      )}

      <div className="grid min-h-[620px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 border-white/10 xl:border-r">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_#f6c453]" />
              {auditedVisibleConversations.length} auditadas de {visibleConversations.length} conversas visíveis
            </div>
            {filter !== "all" && (
              <button type="button" className="text-xs font-semibold text-amber-200 hover:text-amber-100" onClick={() => setFilter("all")}>Mostrar todas</button>
            )}
          </div>
          <MiaBrainGraph360
            conversations={auditedVisibleConversations}
            assessments={assessments}
            loading={brain.loading}
            live={brain.live}
            error={null}
            onOpenConversation={onOpenConversation}
          />
        </div>

        <aside className="flex flex-col bg-white/[.018]">
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-black text-white"><Sparkles className="h-4 w-4 text-amber-300" /> Aprendizado contínuo</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Atendimentos encerrados alimentam padrões; conversas abertas alimentam decisões.</p>
              </div>
              <span className="text-2xl font-black tabular-nums text-amber-200">{learning.loading ? "…" : learning.audited}</span>
            </div>
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
                <span>Cobertura das abertas</span><strong className="text-slate-300">{realCoverage}%</strong>
              </div>
              <Progress value={realCoverage} className="h-1.5 bg-white/10" />
              <p className="mt-2 text-[10px] text-slate-500">{staleOrPending} conversa(s) aguardando análise nova ou atualização.</p>
            </div>
          </div>

          <div className="border-b border-white/10 p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Mais próximas de fechar</p>
              <Flame className="h-4 w-4 text-[#fb6b57]" />
            </div>
            <div className="space-y-2">
              {hottest.length ? hottest.map((assessment) => (
                <button
                  key={assessment.conversation_id}
                  type="button"
                  onClick={() => onOpenConversation(assessment.conversation_id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-left transition-colors hover:bg-white/[.06]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#fb6b57]/25 bg-[#fb6b57]/10 text-xs font-black text-[#ff8979]">{assessment.close_probability}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-200">{assessment.visitor_name || "Contato sem nome"}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">{assessment.next_best_action || assessment.summary}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                </button>
              )) : (
                <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[11px] text-slate-500">Audite as conversas para revelar os leads mais quentes.</p>
              )}
            </div>
          </div>

          <div className="flex-1 p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Padrões para corrigir</p>
              <ShieldCheck className="h-4 w-4 text-amber-300" />
            </div>
            {learning.unavailable ? (
              <p className="text-[11px] leading-relaxed text-slate-500">O histórico de aprendizado ainda não está disponível neste ambiente.</p>
            ) : learning.patterns.length ? (
              <div className="space-y-2">
                {learning.patterns.map((pattern, index) => (
                  <div key={`${pattern}-${index}`} className="flex gap-2 rounded-xl bg-white/[.025] px-3 py-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                    <p className="text-[11px] leading-relaxed text-slate-400">{pattern}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-slate-500">Ainda não há recorrência suficiente para sugerir correções com segurança.</p>
            )}

            <Button
              variant="outline"
              className="mt-4 w-full border-white/10 bg-white/[.035] text-slate-200 hover:bg-white/[.07] hover:text-white"
              onClick={onOpenAgentAudit}
            >
              <Bot className="mr-2 h-4 w-4 text-amber-300" /> Auditar agentes de IA
            </Button>
          </div>
        </aside>
      </div>

      <footer className="flex flex-col gap-2 border-t border-white/10 px-5 py-3 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>Quente ≥ 70% · Morno 40–69% · Frio &lt; 40% · Sem análise permanece neutro.</span>
        <span>Correções de agentes são sugeridas com evidência e exigem revisão humana antes de alterar uma abordagem.</span>
      </footer>
      </section>}
    </div>
  );
}
