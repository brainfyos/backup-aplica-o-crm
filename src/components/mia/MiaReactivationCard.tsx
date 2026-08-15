// MiaReactivationCard — motor de recompra/reativação.
// "R$ X dormindo em N clientes prontos pra voltar."
// Cada candidate tem: nome, produto, dias sem comprar, valor, ação em 1 clique.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, MessageCircle, ListTodo, Zap, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMiaReactivation, type ReactivationCandidate } from "@/hooks/useMiaReactivation";
import { useAuth } from "@/hooks/useAuth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  if (v >= 1_000_000) return `R$ ${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$ ${(v/1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
}

function urgencyColor(score: number): string {
  if (score >= 80) return "text-red-500 border-red-500/30 bg-red-500/8";
  if (score >= 60) return "text-orange-500 border-orange-500/30 bg-orange-500/8";
  return "text-amber-500 border-amber-500/30 bg-amber-500/8";
}

// ── Ação rápida ───────────────────────────────────────────────────────────────

async function quickAction(type: "whatsapp" | "task", candidate: ReactivationCandidate, orgId: string, userId: string) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) { toast.error("Sessão expirada"); return; }

  if (type === "whatsapp") {
    // Usa draft_whatsapp_message existente
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-tools`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "draft_whatsapp_message",
        args: {
          recipient_type: "lead",
          recipient_id:   candidate.leadId,
          intent:         `Reativação: ${candidate.leadName} comprou ${candidate.productName ?? "um produto"} há ${candidate.daysSince} dias. Retomar contato de forma natural e pessoal.`,
          tone:           "amigável e pessoal",
        },
      }),
    });
    const j = await r.json();
    if (j?.data?.ok) {
      toast.success(`WhatsApp preparado para ${candidate.leadName}. Confirme na aba Pendências.`);
    } else {
      toast.error(j?.data?.error ?? "Erro ao preparar WhatsApp");
    }
  } else {
    // Cria tarefa de follow-up
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-tools`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "prepare_create_task",
        args: {
          title:         `Reativar: ${candidate.leadName}${candidate.productName ? ` — ${candidate.productName}` : ""}`,
          assignee_name: candidate.assignedName ?? undefined,
          priority:      "high",
          description:   `Cliente comprou há ${candidate.daysSince} dias (ciclo médio: ${candidate.avgCycleDays}d). Valor: ${fmtBRL(candidate.dealValue)}.`,
        },
      }),
    });
    const j = await r.json();
    if (j?.data?.ok) {
      toast.success("Tarefa criada com sucesso!");
    } else {
      toast.error("Erro ao criar tarefa");
    }
  }
}

// ── Linha de candidato ────────────────────────────────────────────────────────

function CandidateRow({ c, orgId, userId }: { c: ReactivationCandidate; orgId: string; userId: string }) {
  const [acting, setActing] = useState(false);

  const act = async (type: "whatsapp" | "task") => {
    setActing(true);
    await quickAction(type, c, orgId, userId);
    setActing(false);
  };

  const overdueDays = c.daysSince - c.avgCycleDays;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
      {/* Urgência */}
      <div className={cn("w-1.5 h-10 rounded-full shrink-0", c.urgencyScore >= 80 ? "bg-red-500" : c.urgencyScore >= 60 ? "bg-orange-500" : "bg-amber-500")} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{c.leadName}</span>
          {c.productName && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">{c.productName}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {c.daysSince}d sem comprar
          {overdueDays > 0 && (
            <span className="text-orange-500 ml-1">· {overdueDays}d além do ciclo</span>
          )}
          {c.assignedName && <span className="ml-1">· {c.assignedName}</span>}
        </p>
      </div>

      {/* Valor */}
      <div className="text-right shrink-0 mr-2">
        <p className="text-sm font-bold text-emerald-500">{fmtBRL(c.dealValue)}</p>
        <p className="text-[10px] text-muted-foreground">última compra</p>
      </div>

      {/* Ações */}
      <div className="flex gap-1 shrink-0">
        {c.leadPhone && (
          <Button size="icon" variant="outline" className="h-8 w-8" disabled={acting} onClick={() => act("whatsapp")} title="WhatsApp">
            <MessageCircle className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button size="icon" variant="outline" className="h-8 w-8" disabled={acting} onClick={() => act("task")} title="Criar tarefa">
          <ListTodo className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MiaReactivationCard() {
  const { profile } = useAuth();
  const { candidates, totalValue, loading, lastFetch, refresh } = useMiaReactivation();
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return <div className="h-24 rounded-xl bg-muted/30 animate-pulse" />;
  }

  if (!candidates.length) return null; // não mostra se não há oportunidades

  const visible = expanded ? candidates : candidates.slice(0, 5);
  const orgId   = profile?.organization_id ?? "";
  const userId  = profile?.id ?? "";

  return (
    <Card className="border-emerald-500/20 bg-emerald-500/4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            <span>
              <span className="text-emerald-500 font-bold text-base">{fmtBRL(totalValue)}</span>
              {" dormindo em "}
              <span className="font-bold">{candidates.length} cliente{candidates.length !== 1 ? "s" : ""}</span>
              {` pronto${candidates.length !== 1 ? "s" : ""} pra voltar`}
            </span>
          </CardTitle>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={refresh} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        {lastFetch && (
          <p className="text-[10px] text-muted-foreground">
            Calculado às {lastFetch.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {" · "}
            <Zap className="inline h-2.5 w-2.5 text-amber-500" /> Clientes além do ciclo médio de recompra
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {visible.map(c => (
          <CandidateRow key={`${c.leadId}:${c.productId}`} c={c} orgId={orgId} userId={userId} />
        ))}

        {candidates.length > 5 && (
          <Button
            variant="ghost" size="sm"
            className="w-full mt-2 text-xs text-muted-foreground"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Mostrar menos</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Ver mais {candidates.length - 5} clientes</>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
