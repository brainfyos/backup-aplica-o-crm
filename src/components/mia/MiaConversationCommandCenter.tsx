import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckSquare2,
  Flame,
  Loader2,
  Search,
  Snowflake,
  Sparkles,
  SunMedium,
  UserRoundPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { MiaBrainConversation } from "@/hooks/useMiaBrainData";
import type { MiaOpenConversationAssessment } from "@/hooks/useMiaOpenConversationsReport";
import { cn } from "@/lib/utils";

type Temperature = "hot" | "warm" | "cold" | "unknown";
type ActionType = "assign" | "agent" | "task" | "close";

interface Target {
  id: string;
  name: string;
}

interface Props {
  conversations: MiaBrainConversation[];
  assessments: Map<string, MiaOpenConversationAssessment>;
  loading: boolean;
  analyzing: boolean;
  onOpenConversation: (conversationId: string) => void;
  onAnalyzeSelected: (conversationIds: string[]) => void;
  onChanged: () => void;
}

const TEMPERATURE: Record<Temperature, { label: string; color: string; icon: typeof Flame }> = {
  hot: { label: "Quente", color: "#fb6b57", icon: Flame },
  warm: { label: "Morno", color: "#f6c453", icon: SunMedium },
  cold: { label: "Frio", color: "#54c8e8", icon: Snowflake },
  unknown: { label: "Sem análise", color: "#718096", icon: Sparkles },
};

const STATUS_LABEL: Record<string, string> = {
  waiting_human: "Aguardando humano",
  human_active: "Com atendente",
  bot_active: "Com IA",
};

function temperatureOf(assessment?: MiaOpenConversationAssessment): Temperature {
  if (!assessment) return "unknown";
  if (assessment.close_probability >= 70) return "hot";
  if (assessment.close_probability >= 40) return "warm";
  return "cold";
}

async function inBatches<T>(items: T[], worker: (item: T) => Promise<void>, size = 5) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(worker));
  }
}

function uniqueOptions(conversations: MiaBrainConversation[], key: "owner" | "sector" | "product") {
  const values = new Map<string, string>();
  conversations.forEach((conversation) => {
    if (key === "owner" && conversation.ownerId) values.set(conversation.ownerId, conversation.ownerName ?? conversation.ownerId);
    if (key === "sector" && conversation.sectorId) values.set(conversation.sectorId, conversation.sectorName ?? conversation.sectorId);
    if (key === "product" && conversation.productId) values.set(conversation.productId, conversation.productName ?? conversation.productId);
  });
  return [...values.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export function MiaConversationCommandCenter({
  conversations,
  assessments,
  loading,
  analyzing,
  onOpenConversation,
  onAnalyzeSelected,
  onChanged,
}: Props) {
  const { profile, user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [temperature, setTemperature] = useState("all");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [sector, setSector] = useState("all");
  const [product, setProduct] = useState("all");
  const [channel, setChannel] = useState("all");
  const [category, setCategory] = useState("all");
  const [members, setMembers] = useState<Target[]>([]);
  const [agents, setAgents] = useState<Target[]>([]);
  const [dialog, setDialog] = useState<{ type: ActionType; ids: string[] } | null>(null);
  const [targetId, setTargetId] = useState("");
  const [taskTitle, setTaskTitle] = useState("Realizar próximo passo sugerido pela Mia");
  const [dueHours, setDueHours] = useState("4");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!profile?.organization_id) return;
    let alive = true;
    void Promise.all([
      supabase.from("profiles").select("id,full_name").eq("organization_id", profile.organization_id).order("full_name"),
      supabase.from("product_agents").select("id,name").eq("organization_id", profile.organization_id).eq("is_active", true).order("name"),
    ]).then(([membersResult, agentsResult]) => {
      if (!alive) return;
      setMembers((membersResult.data ?? []).map((member) => ({ id: member.id, name: member.full_name || "Usuário sem nome" })));
      setAgents((agentsResult.data ?? []).map((agent) => ({ id: agent.id, name: agent.name })));
    });
    return () => { alive = false; };
  }, [profile?.organization_id]);

  useEffect(() => {
    const available = new Set(conversations.map((conversation) => conversation.id));
    setSelected((current) => new Set([...current].filter((id) => available.has(id))));
  }, [conversations]);

  const ownerOptions = useMemo(() => uniqueOptions(conversations, "owner"), [conversations]);
  const sectorOptions = useMemo(() => uniqueOptions(conversations, "sector"), [conversations]);
  const productOptions = useMemo(() => uniqueOptions(conversations, "product"), [conversations]);
  const channels = useMemo(() => [...new Set(conversations.map((conversation) => conversation.channel))].sort(), [conversations]);

  const visible = useMemo(() => conversations.filter((conversation) => {
    const assessment = assessments.get(conversation.id);
    const normalizedSearch = search.trim().toLowerCase();
    if (normalizedSearch && ![
      conversation.visitorName,
      conversation.ownerName,
      conversation.sectorName,
      conversation.productName,
      assessment?.summary,
      assessment?.next_best_action,
    ].some((value) => value?.toLowerCase().includes(normalizedSearch))) return false;
    if (temperature !== "all" && temperatureOf(assessment) !== temperature) return false;
    if (status !== "all" && conversation.status !== status) return false;
    if (owner === "unassigned" && conversation.ownerId) return false;
    if (owner !== "all" && owner !== "unassigned" && conversation.ownerId !== owner) return false;
    if (sector === "none" && conversation.sectorId) return false;
    if (sector !== "all" && sector !== "none" && conversation.sectorId !== sector) return false;
    if (product !== "all" && conversation.productId !== product) return false;
    if (channel !== "all" && conversation.channel !== channel) return false;
    if (category === "unanalyzed" && assessment) return false;
    if (category !== "all" && category !== "unanalyzed" && assessment?.category !== category) return false;
    return true;
  }).sort((a, b) => {
    const assessmentA = assessments.get(a.id);
    const assessmentB = assessments.get(b.id);
    return (assessmentB?.urgency_score ?? 0) - (assessmentA?.urgency_score ?? 0)
      || (assessmentB?.close_probability ?? 0) - (assessmentA?.close_probability ?? 0)
      || new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime();
  }), [assessments, category, channel, conversations, owner, product, search, sector, status, temperature]);

  const selectedIds = [...selected];
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const openAction = (type: ActionType, ids: string[]) => {
    if (!ids.length) return;
    setTargetId(type === "task" ? "__owner__" : "");
    setDialog({ type, ids });
  };

  const closeConversation = async (conversationId: string, token: string) => {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=close`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, closing_reason: "Encerrada pelo centro operacional da Mia" }),
    });
    if (!response.ok) throw new Error(`Não foi possível encerrar ${conversationId}.`);
  };

  const execute = async () => {
    if (!dialog || !profile?.organization_id || !user?.id) return;
    if (["assign", "agent"].includes(dialog.type) && !targetId) {
      toast.error("Selecione o destino da ação.");
      return;
    }
    if (dialog.type === "task" && !targetId) {
      toast.error("Selecione quem receberá as tarefas.");
      return;
    }
    setWorking(true);
    try {
      let affectedCount = dialog.ids.length;
      const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
      if (dialog.type === "assign") {
        await inBatches(dialog.ids, async (conversationId) => {
          const { error } = await supabase.rpc("transfer_conversation_to_user", {
            p_conversation_id: conversationId,
            p_to_user_id: targetId,
            p_internal_note: "Atribuída pelo centro operacional da Mia",
          });
          if (error) throw error;
        });
      }
      if (dialog.type === "agent") {
        await inBatches(dialog.ids, async (conversationId) => {
          const { error } = await supabase.from("webchat_conversations").update({
            assigned_user_id: null,
            current_agent_id: targetId,
            status: "bot_active",
            orchestrator_state: "em_atendimento",
            updated_at: new Date().toISOString(),
          }).eq("id", conversationId).eq("organization_id", profile.organization_id);
          if (error) throw error;
        });
      }
      if (dialog.type === "task") {
        const dueAt = new Date(Date.now() + Math.max(1, Number(dueHours) || 4) * 3_600_000).toISOString();
        const rows = dialog.ids.flatMap((conversationId) => {
          const conversation = byId.get(conversationId);
          const assigneeId = targetId === "__owner__" && conversation?.ownerType === "user" ? conversation.ownerId : targetId;
          if (!conversation || !assigneeId || assigneeId === "__owner__") return [];
          const assessment = assessments.get(conversationId);
          return [{
            user_id: assigneeId,
            created_by: user.id,
            lead_id: conversation.leadId,
            title: `${taskTitle}: ${conversation.visitorName}`,
            description: assessment?.next_best_action || assessment?.summary || "Revisar a conversa e definir o próximo passo.",
            due_date: dueAt,
            priority: temperatureOf(assessment) === "hot" ? "high" as const : "medium" as const,
            status: "pending" as const,
            type: "follow_up" as const,
          }];
        });
        if (!rows.length) throw new Error("Nenhuma conversa selecionada possui um responsável humano. Escolha um usuário específico.");
        affectedCount = rows.length;
        const { error } = await supabase.from("tasks").insert(rows);
        if (error) throw error;
      }
      if (dialog.type === "close") {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Sessão expirada. Entre novamente.");
        await inBatches(dialog.ids, (conversationId) => closeConversation(conversationId, token), 4);
      }

      const actionLabel = { assign: "atribuídas", agent: "delegadas à IA", task: "convertidas em tarefas", close: "encerradas" }[dialog.type];
      toast.success(`${affectedCount} conversa(s) ${actionLabel}.`);
      setSelected(new Set());
      setDialog(null);
      onChanged();
    } catch (actionError) {
      toast.error(actionError instanceof Error ? actionError.message : "Não foi possível concluir a ação.");
    } finally {
      setWorking(false);
    }
  };

  const activeFilters = [temperature, status, owner, sector, product, channel, category].filter((value) => value !== "all").length + (search ? 1 : 0);
  const clearFilters = () => {
    setSearch(""); setTemperature("all"); setStatus("all"); setOwner("all"); setSector("all"); setProduct("all"); setChannel("all"); setCategory("all");
  };

  return (
    <section className="overflow-hidden rounded-[28px] border border-amber-300/20 bg-[#090b0d] text-slate-100">
      <div className="border-b border-white/10 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-lg font-black text-white">Fila resolutiva da Mia</h3>
            <p className="mt-1 text-xs text-slate-400">Todas as conversas abertas, com recomendação individual e ações seguras para reduzir o volume.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" disabled={!selectedIds.length || analyzing} onClick={() => onAnalyzeSelected(selectedIds)}>
              {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-amber-300" />} Analisar selecionadas ({selectedIds.length})
            </Button>
            <Button variant="outline" size="sm" className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => openAction("assign", selectedIds)} disabled={!selectedIds.length}><UserRoundPlus className="mr-2 h-4 w-4" /> Atribuir</Button>
            <Button variant="outline" size="sm" className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => openAction("agent", selectedIds)} disabled={!selectedIds.length}><Bot className="mr-2 h-4 w-4" /> Delegar IA</Button>
            <Button variant="outline" size="sm" className="border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => openAction("task", selectedIds)} disabled={!selectedIds.length}><CheckSquare2 className="mr-2 h-4 w-4" /> Criar tarefas</Button>
            <Button variant="outline" size="sm" className="border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100" onClick={() => openAction("close", selectedIds)} disabled={!selectedIds.length}><XCircle className="mr-2 h-4 w-4" /> Encerrar</Button>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Lead, vendedor, setor, sugestão…" className="border-white/10 bg-white/[.045] pl-9 text-slate-100 placeholder:text-slate-600" />
          </div>
          <Select value={temperature} onValueChange={setTemperature}><SelectTrigger className="border-white/10 bg-white/[.045]"><SelectValue placeholder="Temperatura" /></SelectTrigger><SelectContent><SelectItem value="all">Todas temperaturas</SelectItem><SelectItem value="hot">Quentes</SelectItem><SelectItem value="warm">Mornos</SelectItem><SelectItem value="cold">Frios</SelectItem><SelectItem value="unknown">Sem análise</SelectItem></SelectContent></Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="border-white/10 bg-white/[.045]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="waiting_human">Aguardando</SelectItem><SelectItem value="human_active">Com atendente</SelectItem><SelectItem value="bot_active">Com IA</SelectItem></SelectContent></Select>
          <Select value={owner} onValueChange={setOwner}><SelectTrigger className="border-white/10 bg-white/[.045]"><SelectValue placeholder="Responsável" /></SelectTrigger><SelectContent><SelectItem value="all">Todos responsáveis</SelectItem><SelectItem value="unassigned">Sem responsável</SelectItem>{ownerOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
          <Select value={sector} onValueChange={setSector}><SelectTrigger className="border-white/10 bg-white/[.045]"><SelectValue placeholder="Setor" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os setores</SelectItem><SelectItem value="none">Sem setor</SelectItem>{sectorOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
          <Select value={product} onValueChange={setProduct}><SelectTrigger className="border-white/10 bg-white/[.045]"><SelectValue placeholder="Produto" /></SelectTrigger><SelectContent><SelectItem value="all">Todos produtos</SelectItem>{productOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
          <Select value={channel} onValueChange={setChannel}><SelectTrigger className="border-white/10 bg-white/[.045]"><SelectValue placeholder="Canal" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os canais</SelectItem>{channels.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="border-white/10 bg-white/[.045]"><SelectValue placeholder="Diagnóstico" /></SelectTrigger><SelectContent><SelectItem value="all">Todos diagnósticos</SelectItem><SelectItem value="ready_to_close">Pronta para fechar</SelectItem><SelectItem value="high_potential">Alto potencial</SelectItem><SelectItem value="needs_human">Precisa humano</SelectItem><SelectItem value="at_risk">Em risco</SelectItem><SelectItem value="nurture">Nutrir</SelectItem><SelectItem value="unqualified">Não qualificada</SelectItem><SelectItem value="unanalyzed">Sem análise</SelectItem></SelectContent></Select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <button type="button" className="font-semibold text-amber-200 hover:text-amber-100" onClick={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((conversation) => conversation.id)))}>{selected.size === visible.length && visible.length ? "Limpar seleção" : "Selecionar todas visíveis"}</button>
          <span>{selected.size} selecionada(s) · {visible.length} de {conversations.length} visíveis</span>
          {activeFilters > 0 && <button type="button" className="text-slate-400 underline hover:text-white" onClick={clearFilters}>Limpar {activeFilters} filtro(s)</button>}
        </div>
      </div>

      <div className="max-h-[780px] divide-y divide-white/[.07] overflow-y-auto">
        {loading && <div className="p-12 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />Carregando todas as conversas abertas…</div>}
        {!loading && !visible.length && <div className="p-12 text-center text-sm text-slate-500">Nenhuma conversa corresponde aos filtros.</div>}
        {visible.map((conversation) => {
          const assessment = assessments.get(conversation.id);
          const meta = TEMPERATURE[temperatureOf(assessment)];
          const TempIcon = meta.icon;
          return (
            <article key={conversation.id} className={cn("grid gap-4 p-4 transition-colors lg:grid-cols-[32px_minmax(190px,.7fr)_minmax(300px,1.5fr)_auto] lg:items-center", selected.has(conversation.id) ? "bg-amber-300/[.055]" : "hover:bg-white/[.025]") }>
              <Checkbox checked={selected.has(conversation.id)} onCheckedChange={() => toggle(conversation.id)} aria-label={`Selecionar ${conversation.visitorName}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} /><h4 className="truncate text-sm font-bold text-white">{conversation.visitorName}</h4></div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-500"><span>{conversation.channel}</span><span>{STATUS_LABEL[conversation.status] ?? conversation.status}</span><span>{conversation.ownerName ?? "Sem responsável"}</span>{conversation.sectorName && <span>{conversation.sectorName}</span>}</div>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.color }}><TempIcon className="h-3 w-3" />{meta.label}</span>{assessment && <><span className="text-[10px] text-slate-500">Fechamento {assessment.close_probability}%</span><span className="text-[10px] text-slate-500">Urgência {assessment.urgency_score}%</span></>}</div>
                <p className="mt-1 line-clamp-1 text-xs text-slate-400">{assessment?.summary ?? "Ainda não analisada pela Mia."}</p>
                <p className="mt-1 line-clamp-1 text-[11px] font-medium text-amber-100/80">{assessment?.next_best_action ? `Próxima ação: ${assessment.next_best_action}` : "Selecione e use Analisar selecionadas para gerar a recomendação."}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => onOpenConversation(conversation.id)}>Abrir <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => openAction("assign", [conversation.id])}>Atribuir</Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => openAction("agent", [conversation.id])}>IA</Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => openAction("task", [conversation.id])}>Tarefa</Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200" onClick={() => openAction("close", [conversation.id])}>Encerrar</Button>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => { if (!open && !working) setDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.type === "assign" ? "Atribuir conversas" : dialog?.type === "agent" ? "Delegar para agente de IA" : dialog?.type === "task" ? "Criar tarefas em lote" : "Encerrar conversas"}</DialogTitle></DialogHeader>
          {dialog && <div className="space-y-4">
            <p className="text-sm text-muted-foreground">A ação será aplicada em {dialog.ids.length} conversa(s). Nenhuma conversa fora da seleção será alterada.</p>
            {dialog.type === "assign" && <div className="space-y-2"><Label>Usuário responsável</Label><Select value={targetId} onValueChange={setTargetId}><SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger><SelectContent>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></div>}
            {dialog.type === "agent" && <div className="space-y-2"><Label>Agente de IA</Label><Select value={targetId} onValueChange={setTargetId}><SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger><SelectContent>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent></Select></div>}
            {dialog.type === "task" && <><div className="space-y-2"><Label>Responsável pelas tarefas</Label><Select value={targetId} onValueChange={setTargetId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__owner__">Dono atual de cada conversa</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Título base</Label><Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /></div><div className="space-y-2"><Label>Prazo em horas</Label><Input type="number" min="1" value={dueHours} onChange={(event) => setDueHours(event.target.value)} /></div></>}
            {dialog.type === "close" && <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">O encerramento é uma ação real e remove as conversas da fila aberta. Elas continuam preservadas no histórico e alimentam o aprendizado da Mia.</div>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)} disabled={working}>Cancelar</Button><Button variant={dialog?.type === "close" ? "destructive" : "default"} onClick={() => void execute()} disabled={working}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dialog?.type === "close" ? "Confirmar encerramento" : "Executar ação"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
