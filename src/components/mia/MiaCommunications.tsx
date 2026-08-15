import { useMiaCommunications } from "@/hooks/useMiaCommunications";
import { useMiaActions } from "@/hooks/useMiaActions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Mail, Bell, Send, AlertTriangle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CHANNEL_ICON: Record<string, any> = {
  whatsapp: MessageCircle, email: Mail, notification: Bell, push: Send,
};

const RISK_LABEL: Record<string, { label: string; phrase: string; tone: string }> = {
  low: { label: "Baixo risco", phrase: "Confirmo", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  medium: { label: "Médio risco", phrase: "Confirmo envio", tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  high: { label: "Alto risco", phrase: "Confirmo envio externo", tone: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const MESSENGER_TYPES = new Set(["send_whatsapp", "send_email", "send_notification", "send_push"]);

export function MiaCommunications() {
  const { pending, recent, confirm, cancel, loading: actionsLoading } = useMiaActions();
  const { items: sent, loading: sentLoading } = useMiaCommunications();
  const [phraseInput, setPhraseInput] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const pendingComms = pending.filter((a) => MESSENGER_TYPES.has(a.action_type));
  const cancelledComms = recent.filter((a) => MESSENGER_TYPES.has(a.action_type) && a.status === "cancelled");

  const handleConfirm = async (action: any) => {
    const risk = action.risk_level ?? "medium";
    const expected = RISK_LABEL[risk]?.phrase ?? "Confirmo";
    const typed = (phraseInput[action.id] ?? "").trim().toLowerCase();
    if (risk === "high" && typed !== expected.toLowerCase()) {
      toast.error(`Digite exatamente: "${expected}"`);
      return;
    }
    setBusy(action.id);
    try {
      await confirm(action.id);
      toast.success("Mensagem enviada");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Tabs defaultValue="pendentes">
      <TabsList>
        <TabsTrigger value="pendentes">
          Pendentes {pendingComms.length > 0 && <Badge className="ml-2 h-5 px-1.5 text-[10px]">{pendingComms.length}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="enviadas">Enviadas</TabsTrigger>
        <TabsTrigger value="canceladas">Canceladas</TabsTrigger>
      </TabsList>

      <TabsContent value="pendentes" className="mt-4 space-y-3">
        {actionsLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!actionsLoading && pendingComms.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem aguardando confirmação.</p>
        )}
        {pendingComms.map((a) => {
          const Icon = CHANNEL_ICON[channelFromType(a.action_type)] ?? Send;
          const risk = RISK_LABEL[a.risk_level ?? "medium"] ?? RISK_LABEL.medium;
          const body =
            a.payload?.body ?? a.payload?.body_html ?? a.payload?.message ?? "";
          return (
            <Card key={a.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{a.preview}</p>
                      {a.payload?.subject && (
                        <p className="text-xs text-muted-foreground">Assunto: {a.payload.subject}</p>
                      )}
                      {body && (
                        <p className="text-xs mt-1 text-muted-foreground whitespace-pre-wrap line-clamp-4">
                          {stripHtml(String(body))}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className={risk.tone}>{risk.label}</Badge>
                </div>

                {a.risk_level === "high" && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                    <Input
                      placeholder={`Digite "${risk.phrase}" para liberar`}
                      value={phraseInput[a.id] ?? ""}
                      onChange={(e) => setPhraseInput((p) => ({ ...p, [a.id]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => cancel(a.id)} disabled={busy === a.id}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={() => handleConfirm(a)} disabled={busy === a.id}>
                    {busy === a.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                    {risk.phrase}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </TabsContent>

      <TabsContent value="enviadas" className="mt-4 space-y-2">
        {sentLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!sentLoading && sent.length === 0 && (
          <p className="text-sm text-muted-foreground">Ainda não há envios registrados.</p>
        )}
        {sent.map((c) => {
          const Icon = CHANNEL_ICON[c.channel] ?? Send;
          return (
            <Card key={c.id}>
              <CardContent className="pt-3 pb-3 flex items-start gap-3">
                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{c.recipient_label ?? "—"}</p>
                    <span className="text-[11px] text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                    {stripHtml(String(c.final_message?.body ?? c.final_message?.body_html ?? c.final_message?.message ?? ""))}
                  </p>
                  {c.error && <p className="text-xs text-red-600 mt-1">Erro: {c.error}</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </TabsContent>

      <TabsContent value="canceladas" className="mt-4 space-y-2">
        {cancelledComms.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma cancelada.</p>
        )}
        {cancelledComms.map((a) => (
          <Card key={a.id}>
            <CardContent className="pt-3 pb-3 text-sm text-muted-foreground line-through">
              {a.preview}
            </CardContent>
          </Card>
        ))}
      </TabsContent>
    </Tabs>
  );
}

function channelFromType(t: string): string {
  if (t === "send_whatsapp") return "whatsapp";
  if (t === "send_email") return "email";
  if (t === "send_notification") return "notification";
  if (t === "send_push") return "push";
  return "other";
}

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
