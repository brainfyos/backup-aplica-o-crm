import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BrainCircuit, Check, Clock3, Loader2, Pause, Play, RefreshCw, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

interface AgentMiaLearningSectionProps {
  agentId: string;
}

type CandidateStatus = 'pending' | 'published' | 'rejected';

interface LearningCandidate {
  id: string;
  title: string;
  recommendation: string;
  suggested_training_text: string;
  learning_type: string;
  confidence: number;
  occurrences: number;
  risk_level: 'low' | 'medium' | 'high';
  status: CandidateStatus;
  evidence: unknown;
  published_material_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  materialActive?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  objection: 'Objeção recorrente',
  successful_approach: 'Abordagem que funciona',
  correction: 'Correção de abordagem',
  guardrail: 'Regra de segurança',
  fact_candidate: 'Informação a validar',
};

function evidencePreview(evidence: unknown): string | null {
  if (!Array.isArray(evidence)) return null;
  for (const entry of evidence) {
    if (!entry || typeof entry !== 'object') continue;
    const quotes = (entry as { quotes?: unknown }).quotes;
    if (Array.isArray(quotes)) {
      const quote = quotes.find((item) => typeof item === 'string' && item.trim());
      if (typeof quote === 'string') return quote;
    }
  }
  return null;
}

function isMissingLearningTable(message: string): boolean {
  return message.includes('mia_agent_learning_candidates') && (
    message.includes('schema cache') || message.includes('does not exist') || message.includes('não existe')
  );
}

export function AgentMiaLearningSection({ agentId }: AgentMiaLearningSectionProps) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | CandidateStatus>('pending');

  const { data: candidates = [], isLoading, error } = useQuery({
    queryKey: ['mia-agent-learning-candidates', agentId],
    queryFn: async () => {
      const { data, error: candidatesError } = await supabase
        .from('mia_agent_learning_candidates' as any)
        .select('id, title, recommendation, suggested_training_text, learning_type, confidence, occurrences, risk_level, status, evidence, published_material_id, reviewed_at, created_at')
        .eq('agent_id', agentId)
        .order('status', { ascending: true })
        .order('occurrences', { ascending: false })
        .order('confidence', { ascending: false })
        .limit(100);
      if (candidatesError) throw candidatesError;

      const rows = (data ?? []) as unknown as LearningCandidate[];
      const materialIds = rows.map((row) => row.published_material_id).filter(Boolean) as string[];
      const materialState = new Map<string, boolean>();
      if (materialIds.length) {
        const { data: materials, error: materialsError } = await supabase
          .from('agent_training_materials')
          .select('id, is_active')
          .in('id', materialIds);
        if (materialsError) throw materialsError;
        for (const material of materials ?? []) materialState.set(material.id, material.is_active !== false);
      }

      return rows.map((row) => ({
        ...row,
        materialActive: row.published_material_id ? (materialState.get(row.published_material_id) ?? false) : undefined,
      }));
    },
    enabled: Boolean(agentId),
    refetchInterval: 30_000,
    retry: (failureCount, queryError: any) => !isMissingLearningTable(String(queryError?.message ?? '')) && failureCount < 2,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['mia-agent-learning-candidates', agentId] });

  const publish = useMutation({
    mutationFn: async (candidateId: string) => {
      const { data, error: publishError } = await supabase.rpc('publish_mia_agent_learning_candidate' as any, {
        p_candidate_id: candidateId,
      } as any);
      if (publishError) throw publishError;
      return data;
    },
    onSuccess: () => {
      void refresh();
      queryClient.invalidateQueries({ queryKey: ['agent-training-materials', agentId] });
      toast.success('Aprendizado aprovado e ativado neste agente.');
    },
    onError: (mutationError: any) => toast.error(mutationError?.message ?? 'Não foi possível aplicar o aprendizado.'),
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'rejected' }) => {
      const { error: reviewError } = await supabase
        .from('mia_agent_learning_candidates' as any)
        .update({ status, reviewed_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (reviewError) throw reviewError;
    },
    onSuccess: (_, variables) => {
      void refresh();
      toast.success(variables.status === 'rejected' ? 'Sugestão rejeitada.' : 'Sugestão devolvida para revisão.');
    },
    onError: (mutationError: any) => toast.error(mutationError?.message ?? 'Não foi possível revisar a sugestão.'),
  });

  const toggleMaterial = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error: materialError } = await supabase
        .from('agent_training_materials')
        .update({ is_active: active })
        .eq('id', id);
      if (materialError) throw materialError;
    },
    onSuccess: (_, variables) => {
      void refresh();
      queryClient.invalidateQueries({ queryKey: ['agent-training-materials', agentId] });
      toast.success(variables.active ? 'Aprendizado reativado.' : 'Aprendizado pausado no agente.');
    },
    onError: (mutationError: any) => toast.error(mutationError?.message ?? 'Não foi possível alterar o treinamento.'),
  });

  const enqueue = useMutation({
    mutationFn: async () => {
      const { data, error: enqueueError } = await supabase.rpc('enqueue_mia_agent_learning' as any, {
        p_agent_id: agentId,
      } as any);
      if (enqueueError) throw enqueueError;
      return Number(data ?? 0);
    },
    onSuccess: (count) => {
      toast.success(count > 0
        ? `${count} atendimento(s) enviado(s) para auditoria em segundo plano.`
        : 'Todos os atendimentos encerrados deste agente já foram auditados.');
      window.setTimeout(() => void refresh(), 2500);
    },
    onError: (mutationError: any) => toast.error(mutationError?.message ?? 'Não foi possível iniciar a auditoria.'),
  });

  const totals = useMemo(() => ({
    pending: candidates.filter((item) => item.status === 'pending').length,
    published: candidates.filter((item) => item.status === 'published').length,
    rejected: candidates.filter((item) => item.status === 'rejected').length,
  }), [candidates]);
  const visible = statusFilter === 'all' ? candidates : candidates.filter((item) => item.status === statusFilter);

  if (error && isMissingLearningTable(String((error as any)?.message ?? ''))) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex gap-3 p-4 text-sm text-amber-700 dark:text-amber-300">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          A central de aprendizado da Mia está aguardando a migração deste ambiente. Os treinamentos manuais continuam funcionando normalmente.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-violet-500/25">
      <CardHeader className="bg-gradient-to-r from-violet-500/10 via-background to-emerald-500/5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-violet-500" />
              Treinamento complementar da Mia
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              A Mia transforma atendimentos reais em sugestões com evidências. Nada altera o agente sem sua aprovação.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => enqueue.mutate()} disabled={enqueue.isPending}>
            {enqueue.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Auditar atendimentos
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setStatusFilter('pending')} className="rounded-lg border p-3 text-left hover:bg-muted/40">
            <p className="text-xl font-black text-amber-500">{totals.pending}</p><p className="text-[11px] text-muted-foreground">Para revisar</p>
          </button>
          <button type="button" onClick={() => setStatusFilter('published')} className="rounded-lg border p-3 text-left hover:bg-muted/40">
            <p className="text-xl font-black text-emerald-500">{totals.published}</p><p className="text-[11px] text-muted-foreground">Aprendidos</p>
          </button>
          <button type="button" onClick={() => setStatusFilter('rejected')} className="rounded-lg border p-3 text-left hover:bg-muted/40">
            <p className="text-xl font-black text-muted-foreground">{totals.rejected}</p><p className="text-[11px] text-muted-foreground">Descartados</p>
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Para revisar</SelectItem>
              <SelectItem value="published">Aprendidos</SelectItem>
              <SelectItem value="rejected">Descartados</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{candidates.length} padrões identificados</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed p-7 text-center">
            <BrainCircuit className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhum aprendizado nesta etapa</p>
            <p className="mt-1 text-xs text-muted-foreground">Encerre atendimentos ou clique em “Auditar atendimentos” para processar o histórico.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((candidate) => {
              const preview = evidencePreview(candidate.evidence);
              const confidence = Math.round(Number(candidate.confidence) * 100);
              return (
                <div key={candidate.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{TYPE_LABELS[candidate.learning_type] ?? candidate.learning_type}</Badge>
                        <Badge variant="outline">{candidate.occurrences} ocorrência(s)</Badge>
                        {candidate.risk_level === 'high' && <Badge variant="destructive">Validar informação</Badge>}
                        {candidate.status === 'published' && <Badge className="bg-emerald-600">No treinamento</Badge>}
                      </div>
                      <p className="mt-2 text-sm font-semibold">{candidate.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{candidate.recommendation}</p>
                    </div>
                    <div className="w-20 shrink-0 text-right">
                      <p className="text-lg font-black">{confidence}%</p>
                      <p className="text-[10px] uppercase text-muted-foreground">confiança</p>
                      <Progress value={confidence} className="mt-1 h-1.5" />
                    </div>
                  </div>

                  {preview && <p className="mt-3 rounded-lg bg-muted/40 p-2 text-xs italic text-muted-foreground">“{preview}”</p>}
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-medium text-violet-600 dark:text-violet-300">Ver orientação que entrará no agente</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-sans leading-relaxed">{candidate.suggested_training_text}</pre>
                  </details>

                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {candidate.status === 'pending' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: candidate.id, status: 'rejected' })} disabled={review.isPending}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> Descartar
                        </Button>
                        <Button size="sm" onClick={() => publish.mutate(candidate.id)} disabled={publish.isPending}>
                          {publish.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                          Aplicar ao treinamento
                        </Button>
                      </>
                    )}
                    {candidate.status === 'rejected' && (
                      <Button size="sm" variant="outline" onClick={() => review.mutate({ id: candidate.id, status: 'pending' })}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reavaliar
                      </Button>
                    )}
                    {candidate.status === 'published' && candidate.published_material_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleMaterial.mutate({ id: candidate.published_material_id!, active: !candidate.materialActive })}
                        disabled={toggleMaterial.isPending}
                      >
                        {candidate.materialActive ? <Pause className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                        {candidate.materialActive ? 'Pausar no agente' : 'Reativar no agente'}
                      </Button>
                    )}
                  </div>
                  {candidate.risk_level === 'high' && candidate.status === 'pending' && (
                    <p className="mt-3 flex gap-2 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Confirme esta informação em uma fonte oficial antes de aprovar.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
