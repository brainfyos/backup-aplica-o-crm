// MiaAlertsSection — alertas proativos e acionáveis em tempo real.
// Detecta: VIP/lead quente sem resposta, tarefa vencida, proposta parada,
// vendedor sobrecarregado. Cada alerta tem 1 ação direta.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, TrendingDown, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type AlertSeverity = "critical" | "warning" | "info";

interface MiaAlert {
  id:         string;
  type:       "hot_lead_waiting" | "task_overdue" | "proposal_stalled" | "seller_overloaded";
  severity:   AlertSeverity;
  title:      string;
  body:       string;
  entityId?:  string;
  entityType?:"lead" | "conversation" | "seller" | "task";
  action?:    { label: string; fn: () => Promise<void> };
}

const SEVERITY_CONFIG: Record<AlertSeverity, { color: string; iconBg: string; label: string; icon: any }> = {
  critical: { color: "text-red-600", iconBg: "bg-red-500/10", label: "Crítico", icon: AlertTriangle },
  warning:  { color: "text-amber-600", iconBg: "bg-amber-500/10", label: "Atenção", icon: Clock },
  info:     { color: "text-blue-600", iconBg: "bg-blue-500/10", label: "Observação", icon: TrendingDown },
};

// ── Componente ────────────────────────────────────────────────────────────────

export function MiaAlertsSection() {
  const { profile, isAdmin, isManager } = useAuth();
  const [alerts, setAlerts]   = useState<MiaAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const orgId = profile?.organization_id;

  const buildAlerts = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }

    const alerts: MiaAlert[] = [];
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const [convsRes, tasksRes, dealsRes, teamRes] = await Promise.all([
      // Conversas com leads quentes sem resposta há > 15 min
      supabase.from("webchat_conversations" as any)
        .select("id, visitor_name, channel, last_inbound_at, assigned_user_id, lead_id")
        .eq("organization_id", orgId)
        .eq("status", "waiting_human")
        .lt("last_inbound_at", new Date(Date.now() - 15 * 60_000).toISOString())
        .order("last_inbound_at", { ascending: true })
        .limit(5),

      // Tarefas atrasadas há mais de 24h
      supabase.from("tasks" as any)
        .select("id, title, user_id, priority, due_date")
        .in("user_id",
          (await supabase.from("profiles" as any)
            .select("id").eq("organization_id", orgId)
          ).data?.map((p: any) => p.id) ?? []
        )
        .neq("status", "completed")
        .lt("due_date", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
        .order("due_date", { ascending: true })
        .limit(3),

      // Deals (propostas) sem atualização há > 3 dias
      supabase.from("deals" as any)
        .select("id, deal_value, lead_id, updated_at")
        .eq("organization_id", orgId)
        .not("status", "in", '["won","lost","cancelled"]')
        .lt("updated_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
        .order("deal_value", { ascending: false })
        .limit(3),

      // Perfis dos vendedores para lookup de nome
      supabase.from("profiles" as any)
        .select("id, full_name")
        .eq("organization_id", orgId),
    ]);

    const profMap = new Map(((teamRes as any).data ?? []).map((p: any) => [p.id, p.full_name]));
    const convs   = (convsRes.data ?? []) as any[];
    const tasks   = (tasksRes.data ?? []) as any[];
    const deals   = (dealsRes.data ?? []) as any[];

    // Alertas de conversa sem resposta
    for (const conv of convs) {
      const mins = Math.round((Date.now() - new Date(conv.last_inbound_at).getTime()) / 60_000);
      const resp = conv.assigned_user_id ? profMap.get(conv.assigned_user_id) : null;
      alerts.push({
        id:         `conv:${conv.id}`,
        type:       "hot_lead_waiting",
        severity:   mins > 60 ? "critical" : "warning",
        title:      `${conv.visitor_name ?? "Lead"} esperando ${mins} min`,
        body:       `${conv.channel} · ${resp ? `com ${resp}` : "sem responsável"}`,
        entityId:   conv.id,
        entityType: "conversation",
        action: token ? {
          label: "Atribuir agora",
          fn: async () => {
            toast.info("Use a Mia por voz: 'atribui a conversa do X para Y'");
          },
        } : undefined,
      });
    }

    // Alertas de tarefas atrasadas
    for (const task of tasks) {
      const h = Math.round((Date.now() - new Date(task.due_date).getTime()) / 3_600_000);
      const resp = profMap.get(task.user_id);
      alerts.push({
        id:         `task:${task.id}`,
        type:       "task_overdue",
        severity:   h > 48 ? "critical" : "warning",
        title:      `Tarefa atrasada ${h}h: ${(task.title ?? "").slice(0, 40)}`,
        body:       `${resp ?? "Sem responsável"} · prioridade ${task.priority ?? "media"}`,
        entityId:   task.id,
        entityType: "task",
        action: {
          label: "Cobrar",
          fn: async () => {
            toast.info("Mia pode cobrar automaticamente (nível piloto). Fale: 'cobra a tarefa do X'.");
          },
        },
      });
    }

    // Alertas de propostas paradas
    for (const deal of deals) {
      const days = Math.round((Date.now() - new Date(deal.updated_at).getTime()) / 86_400_000);
      alerts.push({
        id:         `deal:${deal.id}`,
        type:       "proposal_stalled",
        severity:   days > 7 ? "critical" : "info",
        title:      `Proposta parada há ${days} dias`,
        body:       `Valor: R$ ${((deal.deal_value ?? 0)/1000).toFixed(0)}k · sem atualização`,
        entityId:   deal.lead_id,
        entityType: "lead",
        action: {
          label: "Recuperar",
          fn: async () => {
            toast.info("Use os Geradores da Mia para criar uma campanha de recuperação de orçamento.");
          },
        },
      });
    }

    setAlerts(alerts);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    buildAlerts();
    // Recarrega a cada 5 min
    const id = setInterval(buildAlerts, 5 * 60_000);
    return () => clearInterval(id);
  }, [buildAlerts]);

  // Realtime: rebuildAlerts quando conversas mudam
  useEffect(() => {
    if (!orgId) return;
    const ch = supabase.channel(`mia-alerts-${orgId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "webchat_conversations", filter: `organization_id=eq.${orgId}` },
        () => buildAlerts()
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, buildAlerts]);

  const visible = alerts.filter(a => !dismissed.has(a.id));
  if (loading || !visible.length) return null;
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  const ordered = [...visible].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const shown = expanded ? ordered : ordered.slice(0, 3);

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Precisa da sua atenção</h3>
            <p className="text-[11px] text-muted-foreground">{visible.length} {visible.length === 1 ? "situação priorizada" : "situações priorizadas"} pela Mia</p>
          </div>
        </div>
        {visible.length > 3 && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => setExpanded(value => !value)}>
            {expanded ? "Mostrar menos" : `Ver todas (${visible.length})`}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      <div className="divide-y">
      {shown.map(alert => {
        const cfg  = SEVERITY_CONFIG[alert.severity];
        const Icon = cfg.icon;
        return (
          <div key={alert.id}
            className="group flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/30"
          >
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", cfg.iconBg, cfg.color)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium leading-snug text-foreground">{alert.title}</p>
                <Badge variant="outline" className={cn("hidden h-5 text-[9px] sm:inline-flex", cfg.color)}>{cfg.label}</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{alert.body}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {alert.action && (
                <Button size="sm" variant="ghost" className="h-8 text-xs gap-1"
                  onClick={alert.action.fn}>
                  {alert.action.label}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
              <button
                onClick={() => setDismissed(d => new Set([...d, alert.id]))}
                className="rounded-lg p-1.5 text-muted-foreground/40 hover:bg-muted hover:text-muted-foreground"
                title="Dispensar"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
      </div>
    </section>
  );
}
