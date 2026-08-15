import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRoundCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type {
  MiaOpenConversationAssessment,
  MiaOpenConversationsReport as MiaReport,
  MiaOpportunityCategory,
} from '@/hooks/useMiaOpenConversationsReport';

interface Props {
  report: MiaReport;
  loading: boolean;
  analyzing: boolean;
  error: string | null;
  progress: number;
  onAnalyze: (maxConversations?: number) => void;
  onRefresh: () => void;
  onOpenConversation: (conversationId: string) => void;
}

const CATEGORY: Record<MiaOpportunityCategory, { label: string; className: string; color: string }> = {
  ready_to_close: { label: 'Pronta para fechar', className: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300', color: '#34d399' },
  high_potential: { label: 'Alto potencial', className: 'border-violet-400/35 bg-violet-500/10 text-violet-600 dark:text-violet-300', color: '#a78bfa' },
  needs_human: { label: 'Precisa de humano', className: 'border-amber-400/35 bg-amber-500/10 text-amber-700 dark:text-amber-300', color: '#fbbf24' },
  at_risk: { label: 'Em risco', className: 'border-red-400/35 bg-red-500/10 text-red-600 dark:text-red-300', color: '#f87171' },
  nurture: { label: 'Nutrir', className: 'border-sky-400/35 bg-sky-500/10 text-sky-600 dark:text-sky-300', color: '#38bdf8' },
  unqualified: { label: 'Não qualificada', className: 'border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300', color: '#94a3b8' },
};

const FILTERS: Array<{ value: 'priority' | 'all' | MiaOpportunityCategory; label: string }> = [
  { value: 'priority', label: 'Prioridades' },
  { value: 'ready_to_close', label: 'Fechamento' },
  { value: 'high_potential', label: 'Potenciais' },
  { value: 'needs_human', label: 'Atendimento' },
  { value: 'at_risk', label: 'Em risco' },
  { value: 'all', label: 'Todas analisadas' },
];

function currency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(value || 0);
}

function dateTime(value: string | null): string {
  if (!value) return 'Ainda não gerado';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function Score({ label, value, color }: { label: string; value: number; color: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="min-w-[92px] rounded-xl border border-border/60 bg-background/45 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span><strong style={{ color }}>{safeValue}%</strong>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all" style={{ width: `${safeValue}%`, background: color }} />
      </div>
    </div>
  );
}

function AssessmentCard({ item, onOpen }: { item: MiaOpenConversationAssessment; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const meta = CATEGORY[item.category];

  const copyReply = async () => {
    if (!item.suggested_reply) return;
    await navigator.clipboard.writeText(item.suggested_reply);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-border/70 bg-card/65 shadow-sm transition-colors hover:border-primary/25">
      <div className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn('gap-1.5', meta.className)}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} />
                {meta.label}
              </Badge>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.channel || 'canal desconhecido'}</span>
              {item.product_name && <span className="text-[11px] text-muted-foreground">• {item.product_name}</span>}
              {item.deal_value != null && item.deal_value > 0 && <Badge variant="secondary" className="text-[10px]">{currency(Number(item.deal_value))}</Badge>}
            </div>
            <h4 className="truncate text-sm font-extrabold text-foreground">{item.visitor_name || 'Contato sem nome'}</h4>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.summary || 'Sem diagnóstico textual.'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Score label="Intenção" value={item.intent_score} color="#a78bfa" />
              <Score label="Fechamento" value={item.close_probability} color="#34d399" />
              <Score label="Urgência" value={item.urgency_score} color="#fb923c" />
            </div>
          </div>

          <div className="w-full shrink-0 rounded-xl border border-primary/15 bg-primary/5 p-3 xl:w-[300px]">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary"><Target className="h-3.5 w-3.5" /> Próxima melhor ação</p>
            <p className="text-xs font-medium leading-relaxed text-foreground">{item.next_best_action || 'Revisar a conversa manualmente.'}</p>
            <Button size="sm" className="mt-3 h-8 w-full gap-1.5 text-xs" onClick={onOpen}>Abrir conversa <ArrowRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        <button
          type="button"
          className="mt-3 flex w-full items-center justify-between border-t border-border/60 pt-3 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <span>{item.evidence.length} evidência(s) validada(s) • confiança {Math.round(item.confidence * 100)}% • {item.messages_analyzed}/{item.source_message_count} mensagens</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {expanded && (
        <div className="grid gap-4 border-t border-border/60 bg-muted/20 p-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Evidências literais da conversa</p>
              {item.evidence.length ? item.evidence.map((evidence, index) => (
                <blockquote key={`${evidence.quote}-${index}`} className="mb-2 rounded-xl border-l-2 border-violet-400 bg-violet-500/5 px-3 py-2">
                  <p className="text-xs italic text-foreground">“{evidence.quote}”</p>
                  <footer className="mt-1 text-[10px] text-muted-foreground">{evidence.speaker ? `${evidence.speaker} • ` : ''}{evidence.meaning}</footer>
                </blockquote>
              )) : <p className="text-xs text-muted-foreground">A IA não encontrou uma citação literal verificável; por isso a confiança foi limitada.</p>}
            </div>
            {!!item.purchase_signals.length && (
              <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500">Sinais de compra</p><ul className="space-y-1 text-xs text-muted-foreground">{item.purchase_signals.map((signal) => <li key={signal}>• {signal}</li>)}</ul></div>
            )}
          </div>
          <div className="space-y-3">
            {!!item.objections.length && <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">Objeções</p><ul className="space-y-1 text-xs text-muted-foreground">{item.objections.map((objection) => <li key={objection}>• {objection}</li>)}</ul></div>}
            {!!item.risks.length && <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-red-500">Riscos</p><ul className="space-y-1 text-xs text-muted-foreground">{item.risks.map((risk) => <li key={risk}>• {risk}</li>)}</ul></div>}
            {item.suggested_reply && (
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wider text-sky-500">Resposta sugerida</p><button type="button" onClick={copyReply} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" /> {copied ? 'Copiada' : 'Copiar'}</button></div>
                <p className="text-xs leading-relaxed text-foreground">{item.suggested_reply}</p>
              </div>
            )}
            {item.transcript_truncated && <p className="flex items-center gap-1.5 text-[10px] text-amber-500"><AlertCircle className="h-3.5 w-3.5" /> Conversa longa: a confiança considera a amostragem do histórico.</p>}
          </div>
        </div>
      )}
    </article>
  );
}

export function MiaOpenConversationsReport({ report, loading, analyzing, error, progress, onAnalyze, onRefresh, onOpenConversation }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('priority');
  const visible = useMemo(() => report.conversations.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'priority') return ['ready_to_close', 'high_potential', 'needs_human', 'at_risk'].includes(item.category);
    return item.category === filter;
  }), [filter, report.conversations]);
  const run = report.run;
  const processed = run ? run.processed_total + run.failed_total : report.coverage.analyzed_fresh;
  const total = run?.queued_total || report.coverage.open_total;

  const metrics = [
    { label: 'Prontas para fechar', value: report.summary.ready_to_close, icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Alto potencial', value: report.summary.high_potential, icon: TrendingUp, color: 'text-violet-500' },
    { label: 'Precisam de humano', value: report.summary.needs_human, icon: UserRoundCheck, color: 'text-amber-500' },
    { label: 'Em risco', value: report.summary.at_risk, icon: AlertCircle, color: 'text-red-500' },
    { label: 'Pipeline potencial', value: currency(report.summary.potential_pipeline_value), icon: Target, color: 'text-sky-500' },
    { label: 'Cobertura auditada', value: `${report.coverage.percent}%`, icon: ShieldCheck, color: 'text-cyan-500' },
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-card via-card to-violet-950/10 shadow-[0_20px_80px_rgba(76,29,149,.08)]">
      <div className="border-b border-border/60 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500"><Sparkles className="h-5 w-5" /></div>
            <div><h3 className="text-base font-black tracking-tight">Relatório real de oportunidades</h3><p className="text-xs text-muted-foreground">Leitura semântica das conversas abertas, com sinais e citações verificadas.</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onRefresh} disabled={loading || analyzing}><RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Atualizar</Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => onAnalyze(10)} disabled={analyzing}>
              <Sparkles className="h-3.5 w-3.5" /> Analisar amostra (10)
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600"
              onClick={() => {
                if (window.confirm(`Analisar todas as ${report.coverage.open_total} conversas abertas? A operação pode consumir uma quantidade relevante de tokens.`)) onAnalyze();
              }}
              disabled={analyzing}
            >
              {analyzing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {analyzing ? 'Analisando…' : 'Analisar todas as abertas'}
            </Button>
          </div>
        </div>
        {analyzing && (
          <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="mb-2 flex items-center justify-between text-[11px]"><span className="font-semibold text-violet-600 dark:text-violet-200">Análise minuciosa em andamento</span><span className="tabular-nums text-muted-foreground">{processed}/{total} • {progress}%</span></div>
            <Progress value={progress} className="h-1.5" /><p className="mt-2 text-[10px] text-muted-foreground">Cada conversa é lida, validada e salva. O progresso fica preservado e é retomado quando você voltar.</p>
          </div>
        )}
        {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      </div>

      <div className="grid grid-cols-2 gap-px bg-border/50 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => <div key={metric.label} className="bg-card/90 p-4"><metric.icon className={cn('mb-2 h-4 w-4', metric.color)} /><p className="text-xl font-black tabular-nums">{metric.value}</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{metric.label}</p></div>)}
      </div>

      <div className="p-5">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted/35 p-1">{FILTERS.map((option) => <button type="button" key={option.value} onClick={() => setFilter(option.value)} className={cn('rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all', filter === option.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{option.label}</button>)}</div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><MessageSquareText className="h-3.5 w-3.5" /> {report.coverage.analyzed_fresh}/{report.coverage.open_total} abertas auditadas</span><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Gerado em {dateTime(report.generated_at)}</span></div>
        </div>
        {loading && !report.conversations.length ? (
          <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Carregando relatório…</div>
        ) : visible.length ? (
          <div className="space-y-3">{visible.map((item) => <AssessmentCard key={item.conversation_id} item={item} onOpen={() => onOpenConversation(item.conversation_id)} />)}</div>
        ) : (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center"><MessageSquareText className="mb-2 h-7 w-7 text-muted-foreground/40" /><p className="text-sm font-semibold">Nenhuma conversa nesta categoria</p><p className="mt-1 max-w-md text-xs text-muted-foreground">{report.coverage.pending_or_stale > 0 ? `${report.coverage.pending_or_stale} conversa(s) ainda não têm análise atual.` : 'A Mia não encontrou oportunidades com estes critérios no relatório atual.'}</p></div>
        )}
      </div>
    </section>
  );
}
