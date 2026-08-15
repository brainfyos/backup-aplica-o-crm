import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Phone, Clock, User, Tag, ExternalLink, Sparkles, Loader2, TrendingUp, AlertTriangle, Target, Quote } from 'lucide-react';
import { toast } from 'sonner';

interface Props { voiceCallId: string }

interface AIAnalysis {
  summary?: string;
  sentiment?: 'positivo' | 'neutro' | 'negativo' | string;
  intent?: 'alta' | 'media' | 'baixa' | string;
  lead_score?: number;
  objections?: string[];
  interests?: string[];
  next_steps?: string[];
  highlights?: string[];
  raw?: boolean;
}

interface SessionRow {
  id: string;
  lead_id: string | null;
  utms: Record<string, string>;
  captured_data: Record<string, any>;
  transcript: Array<{ role: 'user' | 'assistant'; text: string; at: number }>;
  summary: Record<string, any>;
  ctas_clicked: Array<{ tool: string; args: any; at: string }>;
  duration_sec: number;
  outcome: string | null;
  started_at: string;
  ended_at: string | null;
  ai_analysis: AIAnalysis | null;
  ai_analysis_at: string | null;
}

const OUTCOME_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  agendou_reuniao: { label: 'Agendou', variant: 'default' },
  lead_qualificado: { label: 'Qualificado', variant: 'default' },
  callback: { label: 'Retornar', variant: 'secondary' },
  sem_interesse: { label: 'Sem interesse', variant: 'outline' },
  sem_desfecho: { label: 'Sem desfecho', variant: 'outline' },
};

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function VoiceCallResponsesTab({ voiceCallId }: Props) {
  const [selected, setSelected] = useState<SessionRow | null>(null);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['voice-call-sessions', voiceCallId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_call_sessions')
        .select('*')
        .eq('voice_call_id', voiceCallId)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SessionRow[];
    },
  });

  if (isLoading) return <div className="text-muted-foreground p-6">Carregando ligações...</div>;

  if (!sessions?.length) {
    return (
      <Card><CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">
          Nenhuma ligação registrada ainda. Assim que alguém entrar em <code>/call/&lt;slug&gt;</code> e conversar,
          o resumo aparece aqui com transcrição, dados capturados e CTAs clicados.
        </p>
      </CardContent></Card>
    );
  }

  return (
    <>
      <Card><CardContent className="pt-6 space-y-2">
        {sessions.map((s) => {
          const outcome = OUTCOME_LABELS[s.outcome || 'sem_desfecho'] || { label: s.outcome || '—', variant: 'outline' as const };
          const name = s.captured_data?.nome || s.captured_data?.name || 'Visitante';
          const contact = s.captured_data?.whatsapp || s.captured_data?.email || '—';
          return (
            <button key={s.id}
              onClick={() => setSelected(s)}
              className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Phone className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{name}</span>
                  <span className="text-xs text-muted-foreground">· {contact}</span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                  <span>{formatDistanceToNow(new Date(s.started_at), { addSuffix: true, locale: ptBR })}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {fmtDuration(s.duration_sec || 0)}</span>
                  {s.ctas_clicked?.length ? <span>· {s.ctas_clicked.length} CTA(s)</span> : null}
                </div>
              </div>
              <Badge variant={outcome.variant}>{outcome.label}</Badge>
            </button>
          );
        })}
      </CardContent></Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selected && <SessionDetail session={selected} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function SessionDetail({ session }: { session: SessionRow }) {
  const outcome = OUTCOME_LABELS[session.outcome || 'sem_desfecho'] || { label: session.outcome || '—', variant: 'outline' as const };
  const qc = useQueryClient();

  const analyze = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('voice-call-analyze', {
        body: { session_id: session.id },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Análise IA gerada');
      qc.invalidateQueries({ queryKey: ['voice-call-sessions'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Falha ao gerar análise'),
  });

  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {session.captured_data?.nome || session.captured_data?.name || 'Visitante'}
          <Badge variant={outcome.variant}>{outcome.label}</Badge>
        </SheetTitle>
        <p className="text-xs text-muted-foreground">
          {format(new Date(session.started_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })} · {fmtDuration(session.duration_sec || 0)}
        </p>
      </SheetHeader>

      {/* Análise IA */}
      <AIAnalysisSection
        analysis={session.ai_analysis}
        analyzedAt={session.ai_analysis_at}
        loading={analyze.isPending}
        hasTranscript={(session.transcript?.length || 0) > 0}
        onRun={() => analyze.mutate()}
      />


      {/* Dados capturados */}
      <section>
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><User className="h-4 w-4" /> Dados capturados</h4>
        {Object.keys(session.captured_data || {}).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum dado capturado pela IA.</p>
        ) : (
          <div className="space-y-1">
            {Object.entries(session.captured_data).map(([k, v]) => (
              <div key={k} className="text-sm flex justify-between border-b py-1">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CTAs clicados */}
      {session.ctas_clicked?.length ? (
        <section>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><ExternalLink className="h-4 w-4" /> CTAs disparados</h4>
          <ul className="space-y-1">
            {session.ctas_clicked.map((c, i) => (
              <li key={i} className="text-sm border rounded p-2">
                <div className="font-medium">{c.tool}</div>
                <div className="text-xs text-muted-foreground">{JSON.stringify(c.args)}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* UTMs */}
      {Object.keys(session.utms || {}).length > 0 && (
        <section>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><Tag className="h-4 w-4" /> UTMs</h4>
          <div className="text-xs space-y-0.5">
            {Object.entries(session.utms).map(([k, v]) => (
              <div key={k}><span className="text-muted-foreground">{k}:</span> {v}</div>
            ))}
          </div>
        </section>
      )}

      <Separator />

      {/* Transcrição */}
      <section>
        <h4 className="text-sm font-medium mb-2">Transcrição</h4>
        {!session.transcript?.length ? (
          <p className="text-xs text-muted-foreground">Sem transcrição.</p>
        ) : (
          <ScrollArea className="h-[360px] pr-3">
            <div className="space-y-2">
              {session.transcript.map((t, i) => (
                <div key={i} className={`flex ${t.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    t.role === 'assistant' ? 'bg-muted' : 'bg-primary/10'
                  }`}>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                      {t.role === 'assistant' ? 'IA' : 'Lead'}
                    </div>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </section>

      {session.lead_id && (
        <Button variant="outline" className="w-full" onClick={() => window.open(`/admin/leads/${session.lead_id}`, '_blank')}>
          Abrir lead no CRM
        </Button>
      )}
    </div>
  );
}

const SENTIMENT_COLOR: Record<string, string> = {
  positivo: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  neutro: 'bg-muted text-muted-foreground border-border',
  negativo: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
};

const INTENT_COLOR: Record<string, string> = {
  alta: 'bg-primary/15 text-primary border-primary/30',
  media: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  baixa: 'bg-muted text-muted-foreground border-border',
};

function AIAnalysisSection({
  analysis,
  analyzedAt,
  loading,
  hasTranscript,
  onRun,
}: {
  analysis: AIAnalysis | null;
  analyzedAt: string | null;
  loading: boolean;
  hasTranscript: boolean;
  onRun: () => void;
}) {
  return (
    <section className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Análise IA
        </h4>
        <Button size="sm" variant="ghost" onClick={onRun} disabled={loading || !hasTranscript}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : analysis ? 'Regerar' : 'Gerar resumo'}
        </Button>
      </div>

      {!analysis && !loading && (
        <p className="text-xs text-muted-foreground">
          {hasTranscript
            ? 'Ainda não há resumo. Clique em "Gerar resumo" para a IA analisar a chamada.'
            : 'Sem transcrição para analisar.'}
        </p>
      )}

      {analysis && (
        <div className="space-y-3">
          {/* Badges topo */}
          <div className="flex flex-wrap gap-1.5">
            {analysis.sentiment && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${SENTIMENT_COLOR[analysis.sentiment] || SENTIMENT_COLOR.neutro}`}>
                Sentimento: {analysis.sentiment}
              </span>
            )}
            {analysis.intent && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${INTENT_COLOR[analysis.intent] || INTENT_COLOR.baixa}`}>
                Intenção: {analysis.intent}
              </span>
            )}
            {typeof analysis.lead_score === 'number' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-background flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Score {analysis.lead_score}/100
              </span>
            )}
          </div>

          {analysis.summary && (
            <p className="text-sm leading-relaxed">{analysis.summary}</p>
          )}

          {analysis.highlights?.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <Quote className="h-3 w-3" /> Falas marcantes
              </div>
              <ul className="space-y-1">
                {analysis.highlights.map((h, i) => (
                  <li key={i} className="text-xs italic border-l-2 border-primary/40 pl-2">
                    "{h}"
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {analysis.interests?.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Interesses</div>
              <div className="flex flex-wrap gap-1">
                {analysis.interests.map((it, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">{it}</Badge>
                ))}
              </div>
            </div>
          ) : null}

          {analysis.objections?.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Objeções
              </div>
              <ul className="text-xs space-y-0.5 list-disc list-inside">
                {analysis.objections.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </div>
          ) : null}

          {analysis.next_steps?.length ? (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" /> Próximos passos
              </div>
              <ul className="text-xs space-y-0.5 list-disc list-inside">
                {analysis.next_steps.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          ) : null}

          {analyzedAt && (
            <p className="text-[10px] text-muted-foreground">
              Gerado {formatDistanceToNow(new Date(analyzedAt), { addSuffix: true, locale: ptBR })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

