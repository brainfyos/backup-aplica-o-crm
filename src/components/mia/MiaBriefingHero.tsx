// MiaBriefingHero — card herói no topo da página da Mia.
// Mostra o briefing do dia adaptado ao papel: dono vê dinheiro/risco,
// gestor vê equipe, vendedor vê "quem chamar agora".
// Dados de mia_daily_summaries (já existente) + deals para foco financeiro.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, TrendingUp, AlertTriangle, Flame, Users, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  if (v >= 1_000_000) return `R$ ${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$ ${(v/1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  onAskMia?: () => void;
}

export function MiaBriefingHero({ onAskMia }: Props) {
  const { profile, isAdmin, isManager } = useAuth();
  const [briefing, setBriefing]   = useState<any>(null);
  const [pipeline, setPipeline]   = useState<{ total: number; atRisk: number }>({ total: 0, atRisk: 0 });
  const [loading,  setLoading]    = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const role = isAdmin() ? "dono" : isManager() ? "gestor" : "vendedor";
  const name  = profile?.full_name?.split(" ")[0] ?? "por aqui";

  const load = useCallback(async () => {
    setLoading(true);
    const orgId = profile?.organization_id;
    if (!orgId) { setLoading(false); return; }

    const today = new Date().toISOString().slice(0, 10);

    // Briefing diário (já existe em mia_daily_summaries)
    const [briefRes, dealsRes] = await Promise.all([
      supabase.from("mia_daily_summaries" as any)
        .select("payload, updated_at")
        .eq("organization_id", orgId)
        .eq("summary_date", today)
        .maybeSingle(),

      // Pipeline financeiro para papel "dono"
      role === "dono"
        ? supabase.from("deals" as any)
            .select("deal_value, status, updated_at")
            .eq("organization_id", orgId)
            .neq("status", "won")
            .neq("status", "lost")
            .neq("status", "cancelled")
        : Promise.resolve({ data: null }),
    ]);

    const payload = (briefRes.data as any)?.payload ?? null;
    setBriefing(payload);
    setUpdatedAt((briefRes.data as any)?.updated_at ?? null);

    // Calcula totais de pipeline
    const deals = (dealsRes as any).data ?? [];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const total  = deals.reduce((s: number, d: any) => s + (d.deal_value ?? 0), 0);
    const atRisk = deals
      .filter((d: any) => new Date(d.updated_at) < sevenDaysAgo)
      .reduce((s: number, d: any) => s + (d.deal_value ?? 0), 0);
    setPipeline({ total, atRisk });
    setLoading(false);
  }, [profile?.organization_id, role]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border bg-gradient-to-br from-primary/8 via-purple-500/4 to-transparent p-5 animate-pulse h-40" />
    );
  }

  // ── Hero metric por papel ─────────────────────────────────────────────────

  const op  = briefing?.operacao ?? {};
  const sem = op.conversas_sem_resposta ?? 0;
  const hot = op.leads_quentes ?? 0;
  const sem_dono = op.leads_sem_responsavel ?? 0;

  const heroMetric = (() => {
    if (role === "dono") {
      if (pipeline.atRisk > 0) return {
        value: fmtBRL(pipeline.atRisk),
        label: "em risco de esfriar",
        color: "text-orange-500",
        icon:  AlertTriangle,
        sub:   `${fmtBRL(pipeline.total)} no pipeline total`,
      };
      return {
        value: fmtBRL(pipeline.total),
        label: "no pipeline",
        color: "text-emerald-500",
        icon:  TrendingUp,
        sub:   sem > 0 ? `${sem} conversas aguardando resposta` : "Operação saudável",
      };
    }
    if (role === "gestor") {
      return {
        value: String(sem_dono),
        label: "leads sem responsável",
        color: sem_dono > 10 ? "text-red-500" : "text-amber-500",
        icon:  Users,
        sub:   `${sem} conversas sem resposta · ${hot} leads quentes`,
      };
    }
    // vendedor
    return {
      value: String(hot),
      label: "leads quentes pra chamar hoje",
      color: hot > 0 ? "text-red-500" : "text-emerald-500",
      icon:  Flame,
      sub:   sem > 0 ? `${sem} conversas aguardando sua resposta` : "Nenhuma conversa pendente",
    };
  })();

  const HeroIcon = heroMetric.icon;
  const recs: string[] = briefing?.recomendacoes ?? [];
  const quickKpis = [
    { label: "Sem resposta", value: op.conversas_sem_resposta, alert: (op.conversas_sem_resposta ?? 0) > 0 },
    { label: "Leads quentes", value: op.leads_quentes, alert: false },
    { label: "Sem responsável", value: op.leads_sem_responsavel, alert: (op.leads_sem_responsavel ?? 0) > 10 },
    { label: "Tarefas atrasadas", value: op.tarefas_atrasadas, alert: (op.tarefas_atrasadas ?? 0) > 0 },
  ].filter(item => item.value !== undefined && item.value !== null);

  return (
    <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/10 via-purple-500/5 to-card p-5 shadow-sm md:p-6">
      {/* Glows */}
      <div className="absolute -top-8 -left-8 w-36 h-36 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -right-8 w-36 h-36 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
        {/* Saudação + hero metric */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              {greeting()}, <strong>{name}</strong>
              {updatedAt && (
                <span className="ml-2 text-[11px] opacity-50">
                  · atualizado às {new Date(updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </span>
          </div>

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Foco de hoje</p>
          <div className="mt-1 flex items-end gap-3">
            <div>
              <p className={cn("text-4xl font-bold tabular-nums leading-none", heroMetric.color)}>
                {heroMetric.value}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{heroMetric.label}</p>
              {heroMetric.sub && (
                <p className="text-xs text-muted-foreground/70 mt-0.5">{heroMetric.sub}</p>
              )}
            </div>
            <HeroIcon className={cn("h-8 w-8 mb-1 opacity-60", heroMetric.color)} />
          </div>
        </div>

        {/* Recomendações */}
        {recs.length > 0 && (
          <div className="rounded-2xl border bg-background/55 p-4 md:max-w-sm md:flex-1">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              Prioridades de hoje
            </p>
            <div className="mt-2 space-y-2">
            {recs.slice(0, 3).map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                <span className="text-primary mt-0.5 shrink-0">
                  {i === 0 ? "①" : i === 1 ? "②" : "③"}
                </span>
                <span>{r}</span>
              </div>
            ))}
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex flex-row md:flex-col gap-2 shrink-0">
          {onAskMia && (
            <Button size="sm" onClick={onAskMia} className="gap-1.5 rounded-xl">
              <MessageSquare className="h-3.5 w-3.5" />
              Conversar com a Mia
            </Button>
          )}
          <Button size="icon" variant="outline" onClick={load} disabled={loading} className="h-9 w-9 rounded-xl" title="Atualizar resumo">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Mostra somente sinais com dados reais; evita uma fileira de traços. */}
      {quickKpis.length > 0 && (
      <div className="relative mt-5 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 sm:grid-cols-4">
        {quickKpis.map(({ label, value, alert }) => (
          <div key={label} className="rounded-xl bg-background/45 px-3 py-2.5 text-left">
            <p className={cn("text-lg font-bold tabular-nums", alert ? "text-orange-500" : "text-foreground")}>
              {value}
            </p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
