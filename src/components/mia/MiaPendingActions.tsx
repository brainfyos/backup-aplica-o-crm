// Central de Decisões — evolução da MiaPendingActions.
// Mostra: fila de aprovação, nível de autonomia, motivo, impacto, batch, Desfazer.
// Aprovação amarrada à role: vendedor não aprova ações de nível org.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Check, X, Clock, CheckCircle2, XCircle, Undo2,
  Sparkles, AlertTriangle, ShieldCheck, Zap, Settings,
} from "lucide-react";
import { useMiaActions, type MiaAction } from "@/hooks/useMiaActions";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Labels ────────────────────────────────────────────────────────────────────

const AUTONOMY_LABEL: Record<string, { label: string; color: string; icon: any }> = {
  piloto:    { label: "Piloto",    color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: Zap },
  um_clique: { label: "1 Clique", color: "bg-blue-500/15 text-blue-600 border-blue-500/30",         icon: ShieldCheck },
  sugerir:   { label: "Sugestão", color: "bg-amber-500/15 text-amber-600 border-amber-500/30",       icon: Sparkles },
};

const STATUS_LABEL: Record<string, { label: string; icon: any; color: string }> = {
  waiting_confirmation: { label: "Aguardando",  icon: Clock,        color: "text-amber-500" },
  approved:             { label: "Aprovada",     icon: ShieldCheck,  color: "text-blue-500"  },
  executed:             { label: "Executada",    icon: CheckCircle2, color: "text-green-600" },
  failed:               { label: "Falhou",       icon: XCircle,      color: "text-red-500"   },
  cancelled:            { label: "Cancelada",    icon: X,            color: "text-muted-foreground" },
  revertida:            { label: "Desfeita",     icon: Undo2,        color: "text-purple-500" },
};

// ── Ações externas que exigem admin/manager para aprovar ─────────────────────

const EXTERNAL_TYPES = new Set([
  "send_whatsapp","send_email","send_conversation_message","send_proposal","send_reactivation",
]);

// ── Componente de card de ação ────────────────────────────────────────────────

function ActionCard({
  action,
  onConfirm,
  onCancel,
  onUndo,
  canApproveExternal,
}: {
  action:             MiaAction;
  onConfirm:          (id: string) => void;
  onCancel:           (id: string) => void;
  onUndo:             (id: string) => void;
  canApproveExternal: boolean;
}) {
  const isPending   = action.status === "waiting_confirmation";
  const isExecuted  = action.status === "executed";
  const isExternal  = EXTERNAL_TYPES.has(action.action_type);
  const canApprove  = !isExternal || canApproveExternal;
  const hasUndo     = isExecuted && !!(action as any).undo_payload;
  const autonomy    = AUTONOMY_LABEL[(action as any).autonomy_level ?? "um_clique"] ?? AUTONOMY_LABEL.um_clique;
  const statusMeta  = STATUS_LABEL[action.status] ?? STATUS_LABEL.waiting_confirmation;
  const StatusIcon  = statusMeta.icon;
  const AutIcon     = autonomy.icon;

  return (
    <div className={cn(
      "flex gap-3 p-3 rounded-xl border transition-all",
      isPending ? "bg-card border-primary/20" : "bg-muted/20 border-border/50",
    )}>
      {/* Status icon */}
      <div className="shrink-0 pt-0.5">
        <StatusIcon className={cn("h-4 w-4", statusMeta.color)} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Preview + badges */}
        <div className="flex items-start gap-2 flex-wrap">
          <p className="text-sm font-medium flex-1">{action.preview}</p>
          <div className="flex gap-1.5 shrink-0">
            {/* Nível de autonomia */}
            {(action as any).autonomy_level && (
              <Badge variant="outline" className={cn("text-[10px] gap-1 h-5", autonomy.color)}>
                <AutIcon className="h-2.5 w-2.5" />
                {autonomy.label}
              </Badge>
            )}
            {/* Risco externo */}
            {isExternal && (
              <Badge variant="outline" className="text-[10px] h-5 bg-orange-500/10 text-orange-600 border-orange-500/30">
                Externo
              </Badge>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{new Date(action.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="capitalize">{action.action_type.replace(/_/g, " ")}</span>
          {isExternal && !canApproveExternal && (
            <span className="text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Requer gestor
            </span>
          )}
        </div>

        {/* Ações */}
        {(isPending || hasUndo) && (
          <div className="flex gap-2 pt-1">
            {isPending && canApprove && (
              <Button size="sm" className="h-7 text-xs" onClick={() => onConfirm(action.id)}>
                <Check className="h-3.5 w-3.5 mr-1" /> Confirmar
              </Button>
            )}
            {isPending && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                onClick={() => onCancel(action.id)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancelar
              </Button>
            )}
            {hasUndo && (
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => onUndo(action.id)}>
                <Undo2 className="h-3.5 w-3.5 mr-1" /> Desfazer
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MiaPendingActions() {
  const { pending, history, refresh, confirm, cancel } = useMiaActions();
  const { isAdmin, isManager } = useAuth();
  const canApproveExternal = isAdmin() || isManager();

  const [undoing, setUndoing] = useState<string | null>(null);

  const handleUndo = useCallback(async (actionId: string) => {
    setUndoing(actionId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { toast.error("Sessão expirada"); return; }

      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-undo-action`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action_id: actionId }),
        }
      );
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(j?.message ?? j?.error ?? "Erro ao desfazer");
      } else {
        toast.success("Ação desfeita com sucesso.");
        refresh();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro inesperado");
    } finally {
      setUndoing(null);
    }
  }, [refresh]);

  // Batch: aprovar todas as ações pendentes que o usuário pode aprovar
  const handleApproveAll = useCallback(async () => {
    const approvable = pending.filter(a => !EXTERNAL_TYPES.has(a.action_type) || canApproveExternal);
    await Promise.allSettled(approvable.map(a => confirm(a.id)));
    toast.success(`${approvable.length} ações confirmadas.`);
  }, [pending, canApproveExternal, confirm]);

  const pendingCount     = pending.length;
  const approvableCount  = pending.filter(a => !EXTERNAL_TYPES.has(a.action_type) || canApproveExternal).length;
  const undoableHistory  = (history ?? []).filter(a => a.status === "executed" && !!(a as any).undo_payload);

  return (
    <div className="space-y-5">
      {/* Fila de aprovação */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Aguardando confirmação
            {pendingCount > 0 && (
              <Badge className="h-5 px-1.5 text-[10px]">{pendingCount}</Badge>
            )}
          </h3>
          {approvableCount > 1 && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleApproveAll}>
              <Check className="h-3.5 w-3.5 mr-1" /> Aprovar todas ({approvableCount})
            </Button>
          )}
        </div>

        {pendingCount === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma ação aguardando confirmação.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map(a => (
              <ActionCard
                key={a.id}
                action={a}
                onConfirm={confirm}
                onCancel={cancel}
                onUndo={handleUndo}
                canApproveExternal={canApproveExternal}
              />
            ))}
          </div>
        )}
      </div>

      {/* Histórico recente com Desfazer */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          Histórico recente
        </h3>
        {(history ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma ação registrada ainda.
          </p>
        ) : (
          <div className="space-y-1.5">
            {(history ?? []).slice(0, 15).map(a => (
              <ActionCard
                key={a.id}
                action={a}
                onConfirm={confirm}
                onCancel={cancel}
                onUndo={undoing === a.id ? () => {} : handleUndo}
                canApproveExternal={canApproveExternal}
              />
            ))}
          </div>
        )}
      </div>

      {/* Configuração de autonomia (apenas admins) */}
      {isAdmin() && (
        <div className="border-t pt-4">
          <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-2 mb-3">
            <Settings className="h-3.5 w-3.5" />
            Nível de autonomia da Mia
          </h3>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {Object.entries(AUTONOMY_LABEL).map(([level, meta]) => {
              const Icon = meta.icon;
              return (
                <div key={level}
                  className={cn("rounded-lg border p-2.5 flex flex-col gap-1", meta.color)}>
                  <div className="flex items-center gap-1.5 font-medium">
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </div>
                  <p className="text-[10px] opacity-70 leading-tight">
                    {{
                      piloto:    "Executa sozinha dentro dos limites.",
                      um_clique: "Prepara tudo, você aprova.",
                      sugerir:   "Só recomenda, admin decide.",
                    }[level]}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Configuração detalhada por tipo de ação disponível em breve.
          </p>
        </div>
      )}
    </div>
  );
}
