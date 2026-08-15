// MiaGeneratorsTab — Fase 2: geradores de artefatos com rascunho editável.
// Proposta · Recuperação de orçamento · Treinamento da equipe.
// Todo rascunho vai para a Central de Decisões com nível "sugerir".

import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  FileText, RefreshCw, Loader2, ChevronRight, Users,
  DollarSign, Sparkles, Check, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MiaIntelData } from "@/hooks/useMiaIntelligence";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type GenType = "proposal" | "recovery_campaign" | "team_training";

interface GenConfig {
  id:          GenType;
  label:       string;
  description: string;
  icon:        any;
  color:       string;
  requiresLeadId?: boolean;
}

const GENERATORS: GenConfig[] = [
  {
    id:          "proposal",
    label:       "Proposta Personalizada",
    description: "Gera proposta com contexto real do lead, histórico e padrões que convertem.",
    icon:        FileText,
    color:       "text-blue-500",
    requiresLeadId: true,
  },
  {
    id:          "recovery_campaign",
    label:       "Recuperação de Orçamento",
    description: "Proposta ou mensagem para reativar orçamentos/deals parados há dias.",
    icon:        DollarSign,
    color:       "text-amber-500",
  },
  {
    id:          "team_training",
    label:       "Treinamento da Equipe",
    description: "Plano de treino baseado nas métricas reais de cada vendedor.",
    icon:        Users,
    color:       "text-purple-500",
  },
];

// ── Gerador individual ────────────────────────────────────────────────────────

function GeneratorCard({ config, intel }: { config: GenConfig; intel: MiaIntelData }) {
  const [open,     setOpen]     = useState(false);
  const [leadId,   setLeadId]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [draft,    setDraft]    = useState("");
  const [approved, setApproved] = useState(false);

  const Icon = config.icon;

  const generate = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setApproved(false);

    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) { toast.error("Sessão expirada"); setLoading(false); return; }

    const args: Record<string, any> = {};
    if (config.requiresLeadId) {
      if (!leadId.trim()) { toast.error("Informe o ID ou nome do lead"); setLoading(false); return; }
      args.lead_id = leadId.trim();
    }

    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: config.id, args }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        toast.error(j?.message ?? j?.error ?? "Erro ao gerar");
        setLoading(false); return;
      }
      setResult(j);
      setDraft(j.draft ?? j.plan ?? JSON.stringify(j.sequences ?? [], null, 2));
      toast.success("Rascunho gerado! Revise e aprove na Central de Decisões.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }, [config.id, config.requiresLeadId, leadId]);

  const handleApprove = useCallback(async () => {
    if (!result?.action_id) return;
    // Atualiza o draft editado no payload da ação
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;

    await supabase.from("mia_actions" as any)
      .update({ payload: { ...result, draft } })
      .eq("id", result.action_id);

    toast.success("Rascunho salvo! Aprove na aba Pendências para enviar.");
    setApproved(true);
  }, [result, draft]);

  return (
    <Card className={cn("transition-all", open && "ring-1 ring-primary/30")}>
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className={cn("h-4 w-4", config.color)} />
            {config.label}
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">Sugestão</Badge>
          </CardTitle>
          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        </div>
        <p className="text-xs text-muted-foreground font-normal">{config.description}</p>
      </CardHeader>

      {open && (
        <CardContent className="pt-0 space-y-3">
          {/* Parâmetros */}
          {config.requiresLeadId && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ID ou nome do lead</label>
              <input
                value={leadId}
                onChange={e => setLeadId(e.target.value)}
                placeholder="ex: uuid do lead ou nome parcial"
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Você pode buscar o ID na aba Lead Score ou na URL do lead.
              </p>
            </div>
          )}

          {/* Botão gerar */}
          {!result && (
            <Button onClick={generate} disabled={loading} className="w-full gap-2">
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando com IA…</>
                : <><Sparkles className="h-4 w-4" /> Gerar {config.label}</>
              }
            </Button>
          )}

          {/* Rascunho editável */}
          {result && !approved && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium mb-1.5">
                  Rascunho gerado — edite antes de aprovar:
                </p>
                <Textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={10}
                  className="text-sm font-mono resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleApprove} className="flex-1 gap-2" variant="default">
                  <Check className="h-4 w-4" /> Aprovar rascunho
                </Button>
                <Button onClick={() => { setResult(null); setDraft(""); }} variant="outline" size="icon">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Após aprovar, o rascunho vai para Pendências onde você confirma o envio.
              </p>
            </div>
          )}

          {/* Aprovado */}
          {approved && (
            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-500/10 rounded-lg p-3">
              <Check className="h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-medium">Rascunho salvo na Central de Decisões.</p>
                <p className="text-xs opacity-70">Vá em Pendências para revisar e confirmar o envio.</p>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function MiaGeneratorsTab({ intel }: { intel: MiaIntelData }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Geradores de Artefatos</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          A Mia gera rascunhos com os dados reais da empresa. Você revisa, edita e aprova.
          Todo rascunho entra como "Sugestão" — nunca é enviado sem aprovação humana.
        </p>
      </div>

      <div className="space-y-3">
        {GENERATORS.map(g => (
          <GeneratorCard key={g.id} config={g} intel={intel} />
        ))}
      </div>
    </div>
  );
}
