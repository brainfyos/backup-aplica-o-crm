import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, MessageSquare, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface AgentAudit {
  id: string;
  name: string;
  type: string;
  activeConversations: number;
  auditedConversations: number;
  converted: number;
  lost: number;
  conversionRate: number | null;
  avgResponseMin: number | null;
  score: number | null;
  strengths: string[];
  weaknesses: string[];
  objections: string[];
  pendingLearnings: number;
}

interface LearningCandidate {
  id: string;
  agent_id: string;
  learning_type: string;
  title: string;
  recommendation: string;
  suggested_training_text: string;
  confidence: number;
  occurrences: number;
  risk_level: string;
  status: string;
  created_at: string;
}

function isMissingInsightsTable(message: string): boolean {
  return message.includes("mia_conversation_insights") && (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("não existe")
  );
}

function isMissingLearningTable(message: string): boolean {
  return message.includes("mia_agent_learning_candidates") && (
    message.includes("schema cache") || message.includes("does not exist") || message.includes("não existe")
  );
}

function topStrings(values: unknown[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const value of values.flatMap((item) => Array.isArray(item) ? item : [])) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value);
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 75) return "text-emerald-500";
  if (score >= 55) return "text-amber-500";
  return "text-red-500";
}

export function MiaAgentsAuditTab() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [agents, setAgents] = useState<AgentAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [learningPending, setLearningPending] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [learningCandidates, setLearningCandidates] = useState<LearningCandidate[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    setLearningPending(false);
    try {
      const [agentsRes, insightsRes, openRes, learningRes] = await Promise.all([
        supabase.from("product_agents" as any)
          .select("id, name, agent_type, is_active")
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .order("name"),
        supabase.from("mia_conversation_insights" as any)
          .select("conversation_id, agent_id, outcome, response_time_avg_min, what_worked, what_failed, objections, processed_at")
          .eq("organization_id", orgId)
          .order("processed_at", { ascending: false })
          .limit(500),
        supabase.from("webchat_conversations" as any)
          .select("id, current_agent_id")
          .eq("organization_id", orgId)
          .neq("status", "closed")
          .not("current_agent_id", "is", null),
        supabase.from("mia_agent_learning_candidates" as any)
          .select("id, agent_id, learning_type, title, recommendation, suggested_training_text, confidence, occurrences, risk_level, status, created_at")
          .eq("organization_id", orgId)
          .order("confidence", { ascending: false })
          .order("occurrences", { ascending: false }),
      ]);
      if (agentsRes.error) throw agentsRes.error;
      if (insightsRes.error && !isMissingInsightsTable(insightsRes.error.message)) throw insightsRes.error;
      if (learningRes.error && !isMissingLearningTable(learningRes.error.message)) throw learningRes.error;

      const insightsUnavailable = Boolean(insightsRes.error);
      const candidatesUnavailable = Boolean(learningRes.error);
      setLearningPending(insightsUnavailable || candidatesUnavailable);
      setLearningCandidates(candidatesUnavailable ? [] : (learningRes.data ?? []) as unknown as LearningCandidate[]);

      const insights = insightsUnavailable ? [] : (insightsRes.data ?? []) as any[];
      const conversationIds = [...new Set(insights.map((item) => item.conversation_id).filter(Boolean))];
      const agentByConversation = new Map<string, string>();
      for (let offset = 0; offset < conversationIds.length; offset += 80) {
        const chunk = conversationIds.slice(offset, offset + 80);
        const { data, error: conversationError } = await supabase.from("webchat_conversations" as any)
          .select("id, current_agent_id")
          .eq("organization_id", orgId)
          .in("id", chunk);
        if (conversationError) throw conversationError;
        for (const conversation of data ?? []) {
          if ((conversation as any).current_agent_id) {
            agentByConversation.set((conversation as any).id, (conversation as any).current_agent_id);
          }
        }
      }

      const activeCounts = new Map<string, number>();
      for (const conversation of openRes.data ?? []) {
        const agentId = (conversation as any).current_agent_id;
        if (agentId) activeCounts.set(agentId, (activeCounts.get(agentId) ?? 0) + 1);
      }

      const pendingByAgent = new Map<string, number>();
      if (!candidatesUnavailable) {
        for (const candidate of learningRes.data ?? []) {
          const agentId = (candidate as any).agent_id;
          if (agentId && (candidate as any).status === "pending") {
            pendingByAgent.set(agentId, (pendingByAgent.get(agentId) ?? 0) + 1);
          }
        }
      }

      const next = ((agentsRes.data ?? []) as any[]).map((agent): AgentAudit => {
        const audited = insights.filter((item) => (item.agent_id ?? agentByConversation.get(item.conversation_id)) === agent.id);
        const converted = audited.filter((item) => item.outcome === "converted").length;
        const lost = audited.filter((item) => item.outcome === "lost").length;
        const decided = converted + lost;
        const conversionRate = decided ? converted / decided : null;
        const responseTimes = audited.map((item) => Number(item.response_time_avg_min)).filter(Number.isFinite);
        const avgResponseMin = responseTimes.length
          ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
          : null;
        const score = audited.length
          ? Math.max(0, Math.min(100, Math.round(
              55 + (conversionRate == null ? 0 : conversionRate * 35)
              - (decided ? (lost / decided) * 20 : 0)
              - (avgResponseMin == null ? 0 : Math.min(15, avgResponseMin / 10)),
            )))
          : null;
        return {
          id: agent.id,
          name: agent.name,
          type: agent.agent_type ?? "custom",
          activeConversations: activeCounts.get(agent.id) ?? 0,
          auditedConversations: audited.length,
          converted,
          lost,
          conversionRate,
          avgResponseMin,
          score,
          strengths: topStrings(audited.map((item) => item.what_worked)),
          weaknesses: topStrings(audited.map((item) => item.what_failed)),
          objections: topStrings(audited.map((item) => item.objections)),
          pendingLearnings: pendingByAgent.get(agent.id) ?? 0,
        };
      });

      setAgents(next.sort((a, b) => (b.auditedConversations - a.auditedConversations) || a.name.localeCompare(b.name)));
      setLastFetch(new Date());
    } catch (loadError: any) {
      setError(loadError?.message ?? "Não foi possível carregar a auditoria dos agentes.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const reviewCandidate = useCallback(async (candidate: LearningCandidate, action: "publish" | "reject") => {
    setReviewingId(candidate.id);
    try {
      const { error: reviewError } = action === "publish"
        ? await supabase.rpc("publish_mia_agent_learning_candidate" as any, { p_candidate_id: candidate.id })
        : await supabase.from("mia_agent_learning_candidates" as any)
            .update({ status: "rejected", reviewed_by: profile?.id, reviewed_at: new Date().toISOString() })
            .eq("id", candidate.id)
            .eq("organization_id", orgId);
      if (reviewError) throw reviewError;
      toast.success(action === "publish" ? "Aprendizado publicado no treinamento do agente." : "Sugestão descartada.");
      await load();
    } catch (reviewError: any) {
      toast.error(reviewError?.message ?? "Não foi possível revisar este aprendizado.");
    } finally {
      setReviewingId(null);
    }
  }, [load, orgId, profile?.id]);

  const totals = useMemo(() => ({
    audited: agents.reduce((sum, agent) => sum + agent.auditedConversations, 0),
    active: agents.reduce((sum, agent) => sum + agent.activeConversations, 0),
    needingAttention: agents.filter((agent) => agent.score != null && agent.score < 55).length,
    pendingLearnings: agents.reduce((sum, agent) => sum + agent.pendingLearnings, 0),
  }), [agents]);

  if (loading) return <div className="h-72 animate-pulse rounded-2xl bg-muted/30" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="h-5 w-5 text-violet-500" /> Auditoria dos agentes de IA</h2>
          <p className="text-sm text-muted-foreground">Compara resultados de atendimentos reais encerrados e transforma falhas recorrentes em melhorias de abordagem.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-2xl font-black">{totals.audited}</p><p className="text-xs text-muted-foreground">Conversas auditadas</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-black">{totals.active}</p><p className="text-xs text-muted-foreground">Atendimentos ativos com IA</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-black text-amber-500">{totals.needingAttention}</p><p className="text-xs text-muted-foreground">Agentes que precisam de revisão</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-black text-violet-500">{totals.pendingLearnings}</p><p className="text-xs text-muted-foreground">Aprendizados aguardando aprovação</p></CardContent></Card>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">{error}</div>}
      {learningPending && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
          O histórico de aprendizado ainda está sendo preparado neste ambiente. Os agentes e atendimentos ativos continuam disponíveis; os scores aparecerão automaticamente depois da migração e do primeiro ciclo de auditoria.
        </div>
      )}
      {!error && agents.length === 0 && (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground"><Bot className="mx-auto mb-3 h-8 w-8 opacity-40" /><p>Nenhum agente de IA ativo encontrado.</p></div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {agents.map((agent) => (
          <Card key={agent.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div><CardTitle className="flex flex-wrap items-center gap-2 text-base"><Bot className="h-4 w-4 text-violet-500" /> {agent.name}{agent.pendingLearnings > 0 && <button type="button" onClick={() => setSelectedAgentId(agent.id)} aria-label={`Ver ${agent.pendingLearnings} aprendizados de ${agent.name}`}><Badge className="cursor-pointer bg-violet-600 text-[10px] hover:bg-violet-700"><Sparkles className="mr-1 h-3 w-3" />{agent.pendingLearnings} para aprender</Badge></button>}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{agent.type} · {agent.activeConversations} conversas ativas</p></div>
                <div className="text-right"><p className={`text-2xl font-black ${scoreColor(agent.score)}`}>{agent.score ?? "—"}</p><p className="text-[10px] uppercase text-muted-foreground">score real</p></div>
              </div>
              <Progress value={agent.score ?? 0} className="mt-2 h-1.5" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-muted/40 p-2"><p className="font-bold">{agent.auditedConversations}</p><p className="text-[10px] text-muted-foreground">Auditadas</p></div>
                <div className="rounded-lg bg-muted/40 p-2"><p className="font-bold text-emerald-500">{agent.converted}</p><p className="text-[10px] text-muted-foreground">Convertidas</p></div>
                <div className="rounded-lg bg-muted/40 p-2"><p className="font-bold text-red-500">{agent.lost}</p><p className="text-[10px] text-muted-foreground">Perdidas</p></div>
                <div className="rounded-lg bg-muted/40 p-2"><p className="font-bold">{agent.conversionRate == null ? "—" : `${Math.round(agent.conversionRate * 100)}%`}</p><p className="text-[10px] text-muted-foreground">Conversão</p></div>
              </div>

              {agent.auditedConversations === 0 ? (
                <p className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">Ainda sem conversas encerradas e processadas para este agente. O aprendizado aparecerá automaticamente após o worker analisar os atendimentos.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> O que funciona</p><div className="space-y-1">{agent.strengths.length ? agent.strengths.map((item) => <p key={item} className="text-xs text-muted-foreground">• {item}</p>) : <p className="text-xs text-muted-foreground">Sem padrão positivo suficiente.</p>}</div></div>
                  <div><p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Melhorias sugeridas</p><div className="space-y-1">{agent.weaknesses.length ? agent.weaknesses.map((item) => <p key={item} className="text-xs text-muted-foreground">• {item}</p>) : <p className="text-xs text-muted-foreground">Nenhuma falha recorrente detectada.</p>}</div></div>
                </div>
              )}

              {agent.objections.length > 0 && <div className="flex flex-wrap gap-1.5"><MessageSquare className="mr-1 h-4 w-4 text-muted-foreground" />{agent.objections.map((item) => <Badge key={item} variant="outline" className="max-w-full truncate text-[10px]">{item}</Badge>)}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog open={Boolean(selectedAgentId)} onOpenChange={(open) => !open && setSelectedAgentId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Aprendizados sugeridos pela Mia</DialogTitle>
            <DialogDescription>
              Revise a evidência antes de publicar. A Mia nunca altera o prompt base automaticamente.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-4">
            <div className="space-y-3">
              {learningCandidates.filter((item) => item.agent_id === selectedAgentId && item.status === "pending").map((candidate) => (
                <div key={candidate.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{candidate.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{candidate.learning_type} · {candidate.occurrences} ocorrência(s) · {Math.round(Number(candidate.confidence) * 100)}% de confiança · risco {candidate.risk_level}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm">{candidate.recommendation}</p>
                  <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs"><span className="font-semibold">Texto que entrará no treinamento:</span><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{candidate.suggested_training_text}</p></div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" disabled={reviewingId === candidate.id} onClick={() => void reviewCandidate(candidate, "reject")}>Descartar</Button>
                    <Button size="sm" disabled={reviewingId === candidate.id} onClick={() => void reviewCandidate(candidate, "publish")}><Sparkles className="mr-2 h-4 w-4" />Aprovar treinamento</Button>
                  </div>
                </div>
              ))}
              {learningCandidates.filter((item) => item.agent_id === selectedAgentId && item.status === "pending").length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhum aprendizado pendente para este agente.</p>}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {lastFetch && <p className="text-right text-[10px] text-muted-foreground">Atualizado em {lastFetch.toLocaleString("pt-BR")}</p>}
    </div>
  );
}
