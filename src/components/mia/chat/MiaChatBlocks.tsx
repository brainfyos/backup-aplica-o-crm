import { useMemo, useState } from "react";
import {
  ArrowRight, CalendarClock, Check, Clock3, Loader2,
  MessageSquareText, Pause, Play, ShieldCheck, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMiaActions } from "@/hooks/useMiaActions";

export type MiaMetricTone = "neutral" | "positive" | "warning" | "danger" | "hot";

export type MiaChatBlock =
  | { type: "metrics"; items: Array<{ label: string; value: string | number; tone?: MiaMetricTone }> }
  | { type: "chart"; title?: string; chart: "bar"; data: Array<Record<string, unknown>>; series: Array<{ key: string; label: string; color: string }> }
  | { type: "table"; title?: string; columns: Array<{ key: string; label: string }>; rows: Array<Record<string, unknown>> }
  | { type: "conversations"; title?: string; total?: number; items: MiaConversationItem[] }
  | { type: "action"; actionId: string; title?: string; description: string; risk?: string; status?: string }
  | { type: "schedule"; scheduleId: string; title: string; prompt: string; cadence: string; localTime?: string | null; timezone?: string; weekdays?: number[]; status?: string }
  | { type: string; [key: string]: unknown };

interface MiaConversationItem {
  id?: string | null;
  leadId?: string | null;
  name: string;
  channel?: string | null;
  owner?: string | null;
  sector?: string | null;
  waitMinutes?: number | null;
  status?: string | null;
  preview?: string | null;
}

interface Props {
  blocks: MiaChatBlock[];
  onOpenConversation?: (conversationId: string) => void;
  onPrompt?: (prompt: string, sendNow?: boolean) => void;
}

const TONE_CLASS: Record<MiaMetricTone, string> = {
  neutral: "border-border bg-card",
  positive: "border-emerald-500/20 bg-emerald-500/[0.06]",
  warning: "border-amber-500/20 bg-amber-500/[0.06]",
  danger: "border-rose-500/20 bg-rose-500/[0.06]",
  hot: "border-orange-500/20 bg-orange-500/[0.06]",
};

function compact(value: unknown) {
  if (typeof value === "number") return new Intl.NumberFormat("pt-BR", { notation: value >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
  if (value == null || value === "") return "—";
  return String(value);
}

function waitLabel(minutes?: number | null) {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  return `${Math.floor(minutes / 1440)}d`;
}

function MetricsBlock({ block }: { block: Extract<MiaChatBlock, { type: "metrics" }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {block.items.map((item) => (
        <div key={item.label} className={cn("rounded-2xl border px-3 py-3", TONE_CLASS[item.tone ?? "neutral"])}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-xl font-semibold tracking-tight">{compact(item.value)}</p>
        </div>
      ))}
    </div>
  );
}

function ChartBlock({ block }: { block: Extract<MiaChatBlock, { type: "chart" }> }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      {block.title && <h4 className="mb-4 text-sm font-semibold">{block.title}</h4>}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={block.data} margin={{ top: 4, right: 4, left: -24, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.18} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={block.data.length > 6 ? -20 : 0} textAnchor={block.data.length > 6 ? "end" : "middle"} height={block.data.length > 6 ? 58 : 32} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            {block.series.map((series) => <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} radius={[6, 6, 0, 0]} maxBarSize={42} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TableBlock({ block }: { block: Extract<MiaChatBlock, { type: "table" }> }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {block.title && <h4 className="border-b px-4 py-3 text-sm font-semibold">{block.title}</h4>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>{block.columns.map((column) => <th key={column.key} className="px-4 py-2.5 font-medium">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr key={index} className="border-t border-border/70">
                {block.columns.map((column, columnIndex) => (
                  <td key={column.key} className={cn("px-4 py-3", columnIndex === 0 && "font-medium text-foreground")}>{compact(row[column.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConversationsBlock({ block, onOpenConversation, onPrompt }: {
  block: Extract<MiaChatBlock, { type: "conversations" }>;
  onOpenConversation?: Props["onOpenConversation"];
  onPrompt?: Props["onPrompt"];
}) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? block.items : block.items.slice(0, 5);
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h4 className="text-sm font-semibold">{block.title ?? "Conversas"}</h4>
          <p className="text-[11px] text-muted-foreground">{block.total ?? block.items.length} atendimento(s)</p>
        </div>
        <MessageSquareText className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="divide-y divide-border/70">
        {items.map((item, index) => (
          <div key={item.id ?? `${item.name}-${index}`} className="group px-4 py-3 transition-colors hover:bg-muted/25">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {item.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  {item.channel && <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-normal">{item.channel}</Badge>}
                  {item.waitMinutes != null && <Badge variant="outline" className={cn("h-4 gap-1 px-1.5 text-[9px] font-normal", item.waitMinutes > 60 && "border-amber-500/30 text-amber-600")}><Clock3 className="h-2.5 w-2.5" />{waitLabel(item.waitMinutes)}</Badge>}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.owner ?? "Sem responsável"}{item.sector ? ` · ${item.sector}` : ""}</p>
                {item.preview && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/80">{item.preview}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                {item.id && <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onOpenConversation?.(item.id!)}>Abrir <ArrowRight className="ml-1 h-3 w-3" /></Button>}
              </div>
            </div>
            {item.id && (
              <div className="mt-2 flex flex-wrap gap-1 pl-11">
                <button className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onPrompt?.(`Quero atribuir a conversa de ${item.name} (${item.id}) para `)}>Atribuir</button>
                <button className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onPrompt?.(`Prepare uma resposta para a conversa de ${item.name} (${item.id}), considerando todo o histórico`)}>Sugerir resposta</button>
                <button className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onPrompt?.(`Prepare o encerramento da conversa de ${item.name} (${item.id}) porque o atendimento foi concluído`, true)}>Encerrar</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {block.items.length > 5 && (
        <button className="w-full border-t px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Mostrar menos" : `Ver mais ${block.items.length - 5}`}
        </button>
      )}
    </div>
  );
}

function ActionBlock({ block }: { block: Extract<MiaChatBlock, { type: "action" }> }) {
  const { confirm, cancel } = useMiaActions();
  const [status, setStatus] = useState(block.status ?? "waiting_confirmation");
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const finished = ["executed", "executing", "cancelled"].includes(status);

  const act = async (kind: "confirm" | "cancel") => {
    setBusy(kind);
    const ok = kind === "confirm" ? await confirm(block.actionId) : await cancel(block.actionId);
    if (ok) setStatus(kind === "confirm" ? "executed" : "cancelled");
    setBusy(null);
  };

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.045] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><ShieldCheck className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{block.title ?? "Ação preparada"}</h4>
            <Badge variant="outline" className="h-5 text-[9px]">{block.risk === "high" ? "alto impacto" : "aguarda confirmação"}</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{block.description}</p>
          {!finished ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="h-8 rounded-xl text-xs" disabled={!!busy} onClick={() => void act("confirm")}>
                {busy === "confirm" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}Confirmar
              </Button>
              <Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs" disabled={!!busy} onClick={() => void act("cancel")}>
                {busy === "cancel" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1.5 h-3.5 w-3.5" />}Cancelar
              </Button>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600">{status === "cancelled" ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}{status === "cancelled" ? "Ação cancelada" : "Ação executada"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const CADENCE_LABEL: Record<string, string> = { once: "Uma vez", daily: "Todos os dias", weekdays: "Dias úteis", weekly: "Semanal" };

function ScheduleBlock({ block }: { block: Extract<MiaChatBlock, { type: "schedule" }> }) {
  const [status, setStatus] = useState(block.status ?? "pending_confirmation");
  const [busy, setBusy] = useState(false);
  const action = async (operation: "confirm" | "pause" | "resume" | "cancel" | "run_now") => {
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-schedule-control`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session?.access_token}` },
        body: JSON.stringify({ schedule_id: block.scheduleId, operation }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.message ?? payload?.error ?? "Não foi possível atualizar a rotina");
      setStatus(payload.status ?? status);
      toast.success(operation === "confirm" ? "Rotina ativada" : operation === "run_now" ? "Execução solicitada" : "Rotina atualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro inesperado");
    } finally { setBusy(false); }
  };

  const pending = status === "pending_confirmation";
  const active = status === "active";
  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.045] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600"><CalendarClock className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold">{block.title}</h4><Badge variant="outline" className="h-5 text-[9px]">{pending ? "confirmar rotina" : active ? "ativa" : status}</Badge></div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{block.prompt}</p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="h-3 w-3" />{CADENCE_LABEL[block.cadence] ?? block.cadence}{block.localTime ? ` às ${String(block.localTime).slice(0, 5)}` : ""}<span>·</span>{block.timezone ?? "America/Sao_Paulo"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pending && <Button size="sm" className="h-8 rounded-xl text-xs" disabled={busy} onClick={() => void action("confirm")}>{busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}Ativar rotina</Button>}
            {active && <><Button size="sm" variant="outline" className="h-8 rounded-xl text-xs" disabled={busy} onClick={() => void action("run_now")}><Play className="mr-1.5 h-3.5 w-3.5" />Executar agora</Button><Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs" disabled={busy} onClick={() => void action("pause")}><Pause className="mr-1.5 h-3.5 w-3.5" />Pausar</Button></>}
            {status === "paused" && <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs" disabled={busy} onClick={() => void action("resume")}><Play className="mr-1.5 h-3.5 w-3.5" />Retomar</Button>}
            {status !== "cancelled" && <Button size="sm" variant="ghost" className="h-8 rounded-xl text-xs text-muted-foreground" disabled={busy} onClick={() => void action("cancel")}>Cancelar</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MiaChatBlocks({ blocks, onOpenConversation, onPrompt }: Props) {
  const normalized = useMemo(() => Array.isArray(blocks) ? blocks : [], [blocks]);
  if (!normalized.length) return null;
  return (
    <div className="mt-4 space-y-3">
      {normalized.map((block, index) => {
        if (block.type === "metrics") return <MetricsBlock key={index} block={block as Extract<MiaChatBlock, { type: "metrics" }>} />;
        if (block.type === "chart") return <ChartBlock key={index} block={block as Extract<MiaChatBlock, { type: "chart" }>} />;
        if (block.type === "table") return <TableBlock key={index} block={block as Extract<MiaChatBlock, { type: "table" }>} />;
        if (block.type === "conversations") return <ConversationsBlock key={index} block={block as Extract<MiaChatBlock, { type: "conversations" }>} onOpenConversation={onOpenConversation} onPrompt={onPrompt} />;
        if (block.type === "action") {
          const actionBlock = block as Extract<MiaChatBlock, { type: "action" }>;
          return <ActionBlock key={actionBlock.actionId ?? index} block={actionBlock} />;
        }
        if (block.type === "schedule") {
          const scheduleBlock = block as Extract<MiaChatBlock, { type: "schedule" }>;
          return <ScheduleBlock key={scheduleBlock.scheduleId ?? index} block={scheduleBlock} />;
        }
        return null;
      })}
    </div>
  );
}
