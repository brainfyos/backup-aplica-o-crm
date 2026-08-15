import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mic, MicOff, Loader2, Sparkles, MessageCircle, Flame, ListTodo,
  CalendarDays, Users, BarChart3, Ear, Moon, Radio, Inbox,
  MessageSquare, TrendingUp, Brain, BookOpen, Bell, X, LockKeyhole, Bot,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MiaContextSnapshot } from "@/hooks/useMiaSession";
import { useMiaActions } from "@/hooks/useMiaActions";
import { useMiaIntelligence } from "@/hooks/useMiaIntelligence";
import { useAuth } from "@/hooks/useAuth";
import { useMia } from "@/contexts/MiaContext";
import { supabase } from "@/integrations/supabase/client";
import { MiaPendingActions } from "./MiaPendingActions";
import { MiaCommunications } from "./MiaCommunications";
import { MiaMemory } from "./MiaMemory";
import { MiaDashboardTab }   from "./tabs/MiaDashboardTab";
import { MiaCerebroTab }     from "./tabs/MiaCerebroTab";
import { MiaInsightsTab }    from "./tabs/MiaInsightsTab";
import { MiaChatTab }        from "./tabs/MiaChatTab";
import { MiaFunnelTab }      from "./tabs/MiaFunnelTab";
import { MiaLeadScoreTab }   from "./tabs/MiaLeadScoreTab";
import { MiaSellersTab }     from "./tabs/MiaSellersTab";
import { MiaRevenueTab }     from "./tabs/MiaRevenueTab";
import { MiaGeneratorsTab }  from "./tabs/MiaGeneratorsTab";
import { MiaAgentsAuditTab } from "./tabs/MiaAgentsAuditTab";
import { MiaBriefingHero }   from "./MiaBriefingHero";
import { MiaReactivationCard } from "./MiaReactivationCard";
import { MiaAlertsSection }  from "./MiaAlertsSection";
import { useMiaCommercialIntel } from "@/hooks/useMiaCommercialIntel";
import { useOrganizationEffectivePlan } from "@/hooks/useOrganizationPlan";
import { useMiaOpenConversationsReport } from "@/hooks/useMiaOpenConversationsReport";
import { MiaOpenConversationsReport } from "./MiaOpenConversationsReport";
import { MiaVoiceSettings } from "./MiaVoiceSettings";
import { cn } from "@/lib/utils";

// ── Sino de notificações (Etapa 5) ───────────────────────────────────────────
// Carrega eventos reais: conversas urgentes, ações pendentes, leads quentes parados.
// Zero dado inventado — se não há eventos, o sino fica vazio.

function NotificationBell({ orgId, pendingCount }: { orgId?: string; pendingCount: number }) {
  const [open,  setOpen]  = useState(false);
  const [notifs, setNotifs] = useState<Array<{id:string;type:string;text:string;color:string;convId?:string}>>([]);
  // navegação via sessionStorage (padrão do projeto)

  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    async function load() {
      const urgentCutoff = new Date(Date.now() - 15 * 60_000).toISOString();

      // Carrega profiles primeiro para evitar await aninhado em Promise.all
      const { data: profRows } = await supabase
        .from("profiles" as any)
        .select("id")
        .eq("organization_id", orgId);
      const profIds = (profRows ?? []).map((p: any) => p.id);

      const urgRes = await supabase.from("webchat_conversations" as any)
        .select("id, visitor_name, channel, last_message_at, last_inbound_at")
        .eq("organization_id", orgId)
        .eq("status", "waiting_human")
        .lt("last_message_at", urgentCutoff)
        .order("last_message_at", { ascending: true })
        .limit(5);

      const taskRes = profIds.length
        ? await supabase.from("tasks" as any)
            .select("id, title, due_date")
            .in("user_id", profIds)
            .neq("status", "completed")
            .lt("due_date", new Date().toISOString())
            .order("due_date", { ascending: true })
            .limit(3)
        : { data: [] };
      if (!alive) return;
      const items: typeof notifs = [];
      for (const c of ((urgRes.data ?? []) as any[])) {
        const lastMsg = (c as any).last_inbound_at ?? (c as any).last_message_at;
        const mins = lastMsg ? Math.round((Date.now() - new Date(lastMsg).getTime()) / 60_000) : 0;
        items.push({
          id: c.id,
          type: "urgent",
          text: `${(c as any).visitor_name ?? "Visitante"} · ${(c as any).channel} · ${mins}min sem resposta`,
          color: "#ef4444",
          convId: c.id,
        });
      }
      for (const t of ((taskRes.data ?? []) as any[])) {
        const h = Math.round((Date.now() - new Date((t as any).due_date).getTime()) / 3_600_000);
        items.push({ id: t.id, type:"task", text:`Tarefa atrasada ${h}h: ${String((t as any).title).slice(0,40)}`, color:"#f97316" });
      }
      setNotifs(items);
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [orgId]);

  const total = notifs.length + pendingCount;

  return (
    <div className="relative">
      <Button
        variant="ghost" size="icon" className="h-8 w-8 relative"
        onClick={() => setOpen(o => !o)}
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold px-0.5">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-card border rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-bold">Notificações</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y">
            {pendingCount > 0 && (
              <div className="px-4 py-3 flex items-center gap-2.5 text-sm hover:bg-muted/30 cursor-pointer"
                onClick={() => { setOpen(false); }}>
                <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                <span>{pendingCount} ação{pendingCount>1?"ões":""} aguardando confirmação</span>
              </div>
            )}
            {notifs.map(n => (
              <div key={n.id} className="px-4 py-3 flex items-start gap-2.5 text-xs hover:bg-muted/30 cursor-pointer"
                onClick={() => {
                  if (n.convId) {
                    sessionStorage.setItem("inbox:pendingConversationId", n.convId);
                    window.location.href = "/admin?tab=inbox-chat";
                  }
                  setOpen(false);
                }}>
                <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: n.color }} />
                <span className="text-foreground/80 leading-relaxed">{n.text}</span>
              </div>
            ))}
            {total === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nenhuma notificação no momento.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quick questions ────────────────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  { label: "Conversas sem resposta", icon: MessageCircle, prompt: "Quantas conversas estão sem resposta agora e com quem estão?" },
  { label: "Leads quentes",          icon: Flame,         prompt: "Quais são os leads quentes e quem é o responsável?" },
  { label: "Tarefas atrasadas",      icon: ListTodo,      prompt: "Quais tarefas estão atrasadas e com quem?" },
  { label: "Agenda de hoje",         icon: CalendarDays,  prompt: "O que tem na agenda de hoje?" },
  { label: "Status da equipe",       icon: Users,         prompt: "Como está cada vendedor agora?" },
  { label: "Resumo da operação",     icon: BarChart3,     prompt: "Me dê um resumo da operação agora." },
];

const STATUS_LABEL: Record<string, string> = {
  idle:       "Pronta",
  connecting: "Conectando…",
  listening:  "Ouvindo…",
  thinking:   "Pensando…",
  speaking:   "Respondendo…",
  error:      "Desconectada",
};

type MiaTab = "oportunidades" | "funil" | "score" | "vendedores" | "agentes" | "receita" | "dashboard" | "cerebro" | "insights" | "chat" | "voz" | "pendentes" | "comunicacoes" | "memoria" | "geradores";

const PRIMARY_TABS: Array<{ value: MiaTab; label: string; icon: LucideIcon }> = [
  { value: "chat", label: "Chat", icon: Sparkles },
  { value: "oportunidades", label: "Oportunidades", icon: TrendingUp },
  { value: "dashboard", label: "Operação", icon: BarChart3 },
  { value: "funil", label: "Funil", icon: MessageSquare },
  { value: "vendedores", label: "Equipe", icon: Users },
  { value: "agentes", label: "Agentes IA", icon: Bot },
  { value: "receita", label: "Receita", icon: Flame },
];

const MORE_TABS: Array<{ value: MiaTab; label: string; icon: LucideIcon }> = [
  { value: "score", label: "Lead Score", icon: Flame },
  { value: "cerebro", label: "Cérebro", icon: Brain },
  { value: "insights", label: "Insights", icon: Sparkles },
  { value: "geradores", label: "Geradores", icon: BookOpen },
  { value: "voz", label: "Voz e personalidade", icon: Mic },
  { value: "comunicacoes", label: "Comunicações", icon: MessageCircle },
  { value: "memoria", label: "Memória", icon: Brain },
];

// ── Componente ────────────────────────────────────────────────────────────────

function MiaDisabledState() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-2xl items-center justify-center">
      <div className="w-full rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
          <LockKeyhole className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-black">Mia não incluída no plano</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          O Super Admin pode liberar a Mia editando o plano desta empresa. A permissão é aplicada à interface e ao processamento no servidor.
        </p>
      </div>
    </div>
  );
}

export function AdminMia() {
  const { profile, isAdmin, isManager } = useAuth();
  const { data: effectivePlan, isLoading } = useOrganizationEffectivePlan(profile?.organization_id);
  const previewEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get("miaPreview") === "1";
  const miaEnabled = effectivePlan?.features?.mia === true || previewEnabled;

  if (!isAdmin() && !isManager()) {
    return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores e gestores.</div>;
  }
  if (isLoading && !previewEnabled) {
    return <div className="flex min-h-[55vh] items-center justify-center text-sm text-muted-foreground">Validando acesso à Mia…</div>;
  }
  if (!miaEnabled) return <MiaDisabledState />;

  return <AdminMiaEnabled />;
}

function AdminMiaEnabled() {
  const { profile, isAdmin, isManager } = useAuth();
  const { pending } = useMiaActions();
  const intel    = useMiaIntelligence();
  const commerce = useMiaCommercialIntel();
  const opportunities = useMiaOpenConversationsReport(true);

  // Consome sessão global — a Mia já está viva em qualquer tela
  const {
    status, turns, active: isActive, start, stop, sendText,
    wakeState, wakeEnabled, wakeError, wakeToggle,
    registerContextHandler,
  } = useMia();

  const isConnecting = status === "connecting";
  const isConnected  = isActive || turns.length > 0;
  const live         = status === "listening" || status === "thinking" || status === "speaking";

  // Registra handler de contexto de entidade ativa nesta página
  const [miaContext, setMiaContext] = useState<{
    lead?: any; conversation?: any; seller?: any; pipeline?: any; daily?: any; lastTool?: string; lastAt?: number;
  }>({});

  const handleContext = useCallback((snap: MiaContextSnapshot) => {
    setMiaContext(prev => {
      const next = { ...prev, lastTool: snap.tool, lastAt: snap.at };
      switch (snap.tool) {
        case "get_lead_context":           if (snap.result?.encontrado) next.lead         = snap.result; break;
        case "get_conversation_summary":
        case "get_conversation_messages":  if (snap.result?.encontrado) next.conversation = snap.result; break;
        case "get_seller_context":         if (snap.result?.encontrado) next.seller       = snap.result; break;
        case "get_pipeline_context":       next.pipeline = snap.result; break;
        case "get_daily_ai_summary":       next.daily    = snap.result; break;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    registerContextHandler(handleContext);
  }, [registerContextHandler, handleContext]);

  // Alias para compatibilidade com o restante do componente
  const wake = { state: wakeState, enabled: wakeEnabled, error: wakeError, toggle: wakeToggle };

  // Prompt enfileirado para quick questions (auto-start)
  const pendingPromptRef = useRef<string | null>(null);
  useEffect(() => {
    if (status === "idle" && isConnected && pendingPromptRef.current) {
      const prompt = pendingPromptRef.current;
      pendingPromptRef.current = null;
      sendText(prompt);
    }
  }, [status, isConnected, sendText]);

  // Tab principal
  const [tab, setTab] = useState<MiaTab>("chat");

  const openConversation = useCallback((conversationId: string) => {
    try { sessionStorage.setItem("inbox:pendingConversationId", conversationId); } catch {}
    window.location.assign("/admin?tab=inbox-chat");
  }, []);

  // Métricas de uso da Mia
  const [metrics, setMetrics] = useState<{ today: number; lastAt: string | null }>({ today: 0, lastAt: null });
  useEffect(() => {
    async function load() {
      if (!profile?.organization_id) return;
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { count } = await supabase.from("mia_logs" as any)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", profile.organization_id)
        .gte("created_at", start.toISOString());
      const { data: last } = await supabase.from("mia_logs" as any)
        .select("created_at").eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      setMetrics({ today: count ?? 0, lastAt: (last as any)?.created_at ?? null });
    }
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [profile?.organization_id]);

  if (!isAdmin() && !isManager()) {
    return <div className="p-8 text-center text-muted-foreground">Acesso restrito a administradores e gestores.</div>;
  }

  // Badge de estado
  const stateBadge = (() => {
    if (live || isConnected) return { label: STATUS_LABEL[status], icon: Radio, cls: "bg-primary text-primary-foreground animate-pulse" };
    if (wake.enabled && wake.state === "listening") return { label: "Ouvindo wake word", icon: Ear, cls: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" };
    return { label: "Dormindo", icon: Moon, cls: "bg-muted text-muted-foreground" };
  })();

  return (
    <div className="space-y-5">

      {/* VendusOrb agora é global — renderizado pelo MiaProvider em qualquer tela */}

      {/* ── Barra de comando: identidade, estado e uma ação principal ─────── */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card/85 px-4 py-3 shadow-sm backdrop-blur flex-wrap">
        {/* Identidade */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className={cn(
              "w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center",
              live && "animate-pulse",
            )}>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            {isActive && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-background" />
            )}
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight leading-none">Mia</h1>
            <p className="text-[11px] text-muted-foreground">
              Inteligência da sua operação
            </p>
          </div>
          <Badge className={cn("text-[10px] gap-1 px-2 py-0.5 h-5 ml-1", stateBadge.cls)}>
            <stateBadge.icon className="h-2.5 w-2.5" />
            {stateBadge.label}
          </Badge>
        </div>

        {/* Controles compactos */}
        <div className="flex items-center gap-2">
          {/* Sino de notificações — populado com eventos reais */}
          <NotificationBell orgId={profile?.organization_id} pendingCount={pending.length} />

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border bg-muted/25 text-xs">
            <Ear className={cn("h-3 w-3", wake.state === "listening" ? "text-emerald-500" : "text-muted-foreground")} />
            <span className="hidden sm:inline text-muted-foreground">Diga</span>
            <strong className="text-[11px]">"Olá Mia"</strong>
            {wake.state === "detected" && <span className="text-primary text-[10px] animate-pulse font-bold">ativando!</span>}
            <Switch checked={wake.enabled} onCheckedChange={v => wake.toggle(v)} className="scale-75" />
          </div>
          {!isConnected ? (
            <Button onClick={start} disabled={isConnecting} size="icon" variant="outline" className="h-9 w-9 rounded-xl" title="Conversar por voz">
              {isConnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
            </Button>
          ) : (
            <Button variant="outline" size="icon" onClick={stop} className="h-9 w-9 rounded-xl" title="Encerrar conversa por voz">
              <MicOff className="h-3 w-3" />
            </Button>
          )}
          <Button onClick={() => setTab("chat")} size="sm" className="h-9 gap-2 rounded-xl px-4">
            <MessageSquare className="h-3.5 w-3.5" /> Conversar
          </Button>
        </div>
      </div>

      {/* ── O que pede decisão agora ─────────────────────────────────────── */}
      {tab !== "chat" && (
        <>
          <MiaBriefingHero onAskMia={() => setTab("chat")} />
          <MiaAlertsSection />
          <MiaReactivationCard />
        </>
      )}

      {/* ── Tabs principais ───────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={v => setTab(v as MiaTab)}>
        <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border bg-card p-1.5 shadow-sm">
          {PRIMARY_TABS.map(item => {
            const Icon = item.icon;
            const active = tab === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setTab(item.value)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors",
                  active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {item.label}
              </button>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors",
                  MORE_TABS.some(item => item.value === tab)
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Mais <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {MORE_TABS.map(item => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.value} onClick={() => setTab(item.value)} className="gap-2">
                    <Icon className="h-4 w-4" /> {item.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto h-6 w-px shrink-0 bg-border" />
          <button
            type="button"
            onClick={() => setTab("pendentes")}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors",
              tab === "pendentes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Inbox className="h-3.5 w-3.5" /> Decisões
            {pending.length > 0 && <Badge className="h-5 min-w-5 justify-center px-1 text-[10px]">{pending.length}</Badge>}
          </button>
        </div>

        {/* ── Inteligência Comercial ── */}
        <TabsContent value="oportunidades" className="mt-5">
          <MiaOpenConversationsReport
            report={opportunities.report}
            loading={opportunities.loading}
            analyzing={opportunities.analyzing}
            error={opportunities.error}
            progress={opportunities.progress}
            onAnalyze={(maxConversations) => void opportunities.runAnalysis(maxConversations)}
            onRefresh={() => void opportunities.refresh()}
            onOpenConversation={openConversation}
          />
        </TabsContent>

        <TabsContent value="funil" className="mt-5">
          <MiaFunnelTab
            stages={commerce.funnel}
            loading={commerce.loading}
            orgId={commerce.orgId}
          />
        </TabsContent>

        <TabsContent value="score" className="mt-5">
          <MiaLeadScoreTab
            leads={commerce.leads}
            loading={commerce.loading}
          />
        </TabsContent>

        <TabsContent value="vendedores" className="mt-5">
          <MiaSellersTab
            sellers={commerce.sellers}
            intel={intel}
            loading={commerce.loading}
          />
        </TabsContent>

        <TabsContent value="agentes" className="mt-5">
          <MiaAgentsAuditTab />
        </TabsContent>

        <TabsContent value="receita" className="mt-5">
          <MiaRevenueTab
            revenue={commerce.revenue}
            loading={commerce.loading}
          />
        </TabsContent>

        {/* Operação (dashboard anterior) */}
        <TabsContent value="dashboard" className="mt-5">
          <MiaDashboardTab data={intel} onRefresh={intel.refresh} />
        </TabsContent>

        {/* Cérebro */}
        <TabsContent value="cerebro" className="mt-5">
          <MiaCerebroTab
            data={intel}
            organizationId={profile?.organization_id}
            report={opportunities.report}
            assessments={opportunities.assessmentMap}
            reportLoading={opportunities.loading}
            analyzing={opportunities.analyzing}
            error={opportunities.error}
            progress={opportunities.progress}
            onAnalyze={(maxConversations, conversationIds) => void opportunities.runAnalysis(maxConversations, conversationIds)}
            onRefreshReport={() => void opportunities.refresh()}
            onOpenConversation={openConversation}
            onOpenAgentAudit={() => setTab("agentes")}
          />
        </TabsContent>

        {/* Insights */}
        <TabsContent value="insights" className="mt-5">
          <MiaInsightsTab data={intel} />
        </TabsContent>

        {/* Geradores de Artefatos */}
        <TabsContent value="geradores" className="mt-5">
          <Card><CardContent className="p-5">
            <MiaGeneratorsTab intel={intel} />
          </CardContent></Card>
        </TabsContent>

        {/* Chat textual */}
        <TabsContent value="chat" className="mt-5">
          <MiaChatTab
            onOpenConversation={openConversation}
            onStartVoice={isActive ? stop : start}
          />
        </TabsContent>

        {/* Voz */}
        <TabsContent value="voz" className="mt-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Conversa */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Mic className="h-4 w-4" /> Conversar com a Mia por voz
                  </span>
                  {!isConnected ? (
                    <Button onClick={start} disabled={isConnecting} size="sm">
                      {isConnecting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mic className="h-4 w-4 mr-1.5" />}
                      Iniciar
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={stop}>
                      <MicOff className="h-4 w-4 mr-1.5" /> Encerrar
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[380px] overflow-y-auto rounded-xl border bg-muted/20 p-4 space-y-3">
                  {turns.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center pt-16">
                      {wake.enabled && wake.state === "listening"
                        ? <>Diga <strong>"Olá Mia"</strong> para começar.</>
                        : <>Clique em <strong>Iniciar</strong> ou use uma pergunta rápida ao lado.</>}
                    </div>
                  )}
                  {turns.map((t, i) => (
                    <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                        t.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border",
                      )}>
                        {t.role === "assistant" && (
                          <div className="text-[10px] uppercase tracking-wider opacity-50 mb-1">Mia</div>
                        )}
                        {t.text}
                      </div>
                    </div>
                  ))}
                  {status === "thinking" && (
                    <div className="flex justify-start">
                      <div className="bg-card border rounded-2xl px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando…
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick questions */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Voz e comportamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <MiaVoiceSettings active={isActive} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Perguntas rápidas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {QUICK_QUESTIONS.map(q => (
                    <Button key={q.label} variant="outline" size="sm" className="w-full justify-start text-xs"
                      disabled={isConnecting}
                      onClick={() => {
                        if (isConnected) { sendText(q.prompt); }
                        else { pendingPromptRef.current = q.prompt; start(); }
                      }}>
                      <q.icon className="h-3.5 w-3.5 mr-2" />
                      {q.label}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              {/* Contexto ativo */}
              {miaContext.lastTool && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BookOpen className="h-4 w-4" /> Contexto ativo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Última tool</span>
                      <span className="font-mono">{miaContext.lastTool}</span>
                    </div>
                    {miaContext.lead && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Lead</span>
                        <span className="font-medium">{miaContext.lead.lead?.nome}</span>
                      </div>
                    )}
                    {miaContext.seller && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vendedor</span>
                        <span className="font-medium">{miaContext.seller.vendedor?.nome}</span>
                      </div>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] mt-1 w-full"
                      onClick={() => setMiaContext({})}>
                      Limpar contexto
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Pendências */}
        <TabsContent value="pendentes" className="mt-5">
          <Card><CardContent className="pt-6"><MiaPendingActions /></CardContent></Card>
        </TabsContent>

        {/* Comunicações */}
        <TabsContent value="comunicacoes" className="mt-5">
          <Card><CardContent className="pt-6"><MiaCommunications /></CardContent></Card>
        </TabsContent>

        {/* Memória */}
        <TabsContent value="memoria" className="mt-5">
          <Card><CardContent className="pt-6"><MiaMemory /></CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <Card>
        <CardContent className="py-3 flex items-center gap-5 text-xs text-muted-foreground flex-wrap">
          <span>Consultas hoje: <strong className="text-foreground">{metrics.today}</strong></span>
          <span>Última utilização: <strong className="text-foreground">
            {metrics.lastAt ? new Date(metrics.lastAt).toLocaleString("pt-BR") : "—"}
          </strong></span>
          <span className="ml-auto opacity-60">Mia Intelligence · auto-encerra sessão de voz em 30s sem interação</span>
        </CardContent>
      </Card>
    </div>
  );
}
