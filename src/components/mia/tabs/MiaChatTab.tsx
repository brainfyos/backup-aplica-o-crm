import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, BarChart3, BrainCircuit, Check, ChevronDown, Clock3, Copy,
  Loader2, Menu, MessageSquareText, Mic, MoreHorizontal, Plus,
  Search, Send, Sparkles, Square, Trash2, Volume2, X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MiaChatBlocks, type MiaChatBlock } from "@/components/mia/chat/MiaChatBlocks";

interface Thread {
  id: string;
  title: string;
  last_message_at: string;
  is_pinned?: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: MiaChatBlock[];
  toolsUsed: string[];
  inputMode: "text" | "audio" | "scheduled" | "system";
  createdAt: string;
  pending?: boolean;
  error?: boolean;
}

interface StoredMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string | null;
  blocks: unknown;
  tools_used: unknown;
  input_mode: Message["inputMode"] | null;
  created_at: string;
}

interface MiaChatTabProps {
  variant?: "page" | "drawer";
  onOpenConversation?: (conversationId: string) => void;
  onStartVoice?: () => void;
}

const QUICK_STARTS = [
  {
    icon: MessageSquareText,
    title: "Auditar conversas",
    description: "Veja riscos e oportunidades abertas",
    prompt: "Analise as conversas abertas que mais precisam de atenção agora e mostre cada uma com as ações recomendadas",
  },
  {
    icon: BarChart3,
    title: "Resumo da operação",
    description: "Funil, equipe, tarefas e gargalos",
    prompt: "Faça um resumo executivo da operação agora, com os principais números, gargalos e ações prioritárias",
  },
  {
    icon: BrainCircuit,
    title: "O que aprendemos",
    description: "Padrões reais dos atendimentos",
    prompt: "Quais padrões de conversão, objeções e abordagens a Mia aprendeu nos atendimentos recentes?",
  },
  {
    icon: Clock3,
    title: "Criar rotina",
    description: "Agende uma análise recorrente",
    prompt: "Quero criar uma rotina diária às 9h para analisar todas as conversas do dia anterior e me entregar um relatório executivo",
  },
];

const TOOL_LABEL: Record<string, string> = {
  get_operation_summary: "Operação",
  get_team_status: "Equipe",
  get_unanswered_conversations: "Sem resposta",
  get_hot_leads: "Leads quentes",
  get_overdue_tasks: "Tarefas",
  get_today_schedule: "Agenda",
  get_pipeline_context: "Funil",
  get_followup_context: "Cadências",
  get_daily_ai_summary: "Briefing",
  list_conversations: "Conversas",
  list_agents: "Agentes IA",
  search_business_knowledge: "Memória",
  draft_assign_conversation: "Atribuição",
  draft_close_conversation: "Encerramento",
  draft_conversation_message: "Resposta",
  draft_mia_schedule: "Automação",
};

function nowIso() { return new Date().toISOString(); }
function temporaryId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function MiaMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("relative flex shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm", compact ? "h-7 w-7" : "h-9 w-9")}>
      <Sparkles className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
    </div>
  );
}

function ThreadList({ threads, activeId, search, onSearch, onSelect, onNew, onArchive }: {
  threads: Thread[];
  activeId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (thread: Thread) => void;
  onNew: () => void;
  onArchive: (thread: Thread) => void;
}) {
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? threads.filter((thread) => thread.title.toLowerCase().includes(query)) : threads;
  }, [threads, search]);

  return (
    <div className="flex h-full flex-col bg-muted/20">
      <div className="p-3">
        <Button variant="outline" className="h-10 w-full justify-start rounded-xl bg-background text-sm shadow-none" onClick={onNew}>
          <Plus className="mr-2 h-4 w-4" /> Nova conversa
        </Button>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar conversas" className="h-9 rounded-xl border-transparent bg-muted/60 pl-9 text-xs shadow-none focus-visible:border-border" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recentes</p>
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">Suas conversas aparecerão aqui.</div>
        ) : filtered.map((thread) => (
          <div key={thread.id} className={cn("group mb-0.5 flex items-center rounded-xl transition-colors", activeId === thread.id ? "bg-background shadow-sm" : "hover:bg-muted/60")}>
            <button className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-xs" onClick={() => onSelect(thread)}>{thread.title}</button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="mr-1 rounded-md p-1 opacity-0 hover:bg-muted group-hover:opacity-100" aria-label="Mais opções"><MoreHorizontal className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuItem className="text-xs text-destructive" onClick={() => onArchive(thread)}><Trash2 className="mr-2 h-3.5 w-3.5" />Arquivar</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageContent({ message, onOpenConversation, onPrompt, onListen }: {
  message: Message;
  onOpenConversation?: (conversationId: string) => void;
  onPrompt: (prompt: string, sendNow?: boolean) => void;
  onListen: (message: Message) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isUser) {
    return (
      <div className="flex justify-end py-3">
        <div className="max-w-[88%] rounded-3xl rounded-br-lg bg-muted px-4 py-2.5 text-sm leading-relaxed sm:max-w-[75%]">
          {message.inputMode === "audio" && <p className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><AudioLines className="h-3 w-3" />Áudio transcrito</p>}
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex gap-3 py-5", message.error && "text-destructive")}>
      <MiaMark compact />
      <div className="min-w-0 flex-1">
        {message.inputMode === "scheduled" && <Badge variant="outline" className="mb-2 h-5 gap-1 text-[9px]"><Clock3 className="h-3 w-3" />Relatório agendado</Badge>}
        <div className="mia-markdown max-w-none text-sm leading-7 text-foreground">
          <ReactMarkdown components={{
            h1: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h2>,
            h2: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h3>,
            h3: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold">{children}</h4>,
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            ul: ({ children }) => <ul className="mb-2 ml-5 list-disc space-y-1 marker:text-muted-foreground">{children}</ul>,
            ol: ({ children }) => <ol className="mb-2 ml-5 list-decimal space-y-1 marker:text-muted-foreground">{children}</ol>,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{children}</code>,
          }}>{message.content}</ReactMarkdown>
        </div>
        <MiaChatBlocks blocks={message.blocks} onOpenConversation={onOpenConversation} onPrompt={onPrompt} />
        {!!message.toolsUsed.length && (
          <div className="mt-3 flex flex-wrap gap-1">
            {[...new Set(message.toolsUsed)].map((tool) => <Badge key={tool} variant="secondary" className="h-5 rounded-md px-1.5 text-[9px] font-normal text-muted-foreground">{TOOL_LABEL[tool] ?? tool}</Badge>)}
          </div>
        )}
        {!message.pending && !message.error && (
          <div className="mt-2 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
            <button onClick={() => void copy()} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copiar resposta">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
            <button onClick={() => onListen(message)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Ouvir resposta"><Volume2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export function MiaChatTab({ variant = "page", onOpenConversation, onStartVoice }: MiaChatTabProps) {
  const { profile } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlsRef = useRef<string[]>([]);

  const drawer = variant === "drawer";
  const heightClass = drawer ? "h-[100dvh]" : "h-[calc(100dvh-190px)] min-h-[620px] max-h-[920px]";

  const refreshThreads = useCallback(async (selectFirst = false) => {
    if (!profile?.id || !profile.organization_id) return;
    // Tabelas novas chegam pela migration do mesmo release; o cast pode ser removido
    // depois que os tipos gerados do projeto oficial forem atualizados.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.from("mia_chat_threads" as any)
      .select("id, title, last_message_at, is_pinned")
      .eq("created_by", profile.id).eq("organization_id", profile.organization_id).eq("status", "active")
      .order("is_pinned", { ascending: false }).order("last_message_at", { ascending: false }).limit(60);
    if (error) return; // migration pode ainda estar chegando no primeiro deploy
    const next = (data ?? []) as unknown as Thread[];
    setThreads(next);
    if (selectFirst && !activeThread && next[0]) setActiveThread(next[0]);
  }, [activeThread, profile?.id, profile?.organization_id]);

  useEffect(() => { void refreshThreads(false); }, [profile?.id, profile?.organization_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadThread = useCallback(async (thread: Thread) => {
    setActiveThread(thread);
    setMobileHistoryOpen(false);
    setLoadingThread(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.from("mia_chat_messages" as any)
      .select("id, role, content, blocks, tools_used, input_mode, created_at")
      .eq("thread_id", thread.id).in("role", ["user", "assistant"])
      .order("created_at", { ascending: true }).limit(300);
    if (error) {
      toast.error("Não foi possível carregar esta conversa");
    } else {
      const rows = (data ?? []) as unknown as StoredMessageRow[];
      setMessages(rows.map((row) => ({
        id: row.id, role: row.role, content: row.content ?? "", blocks: Array.isArray(row.blocks) ? row.blocks : [],
        toolsUsed: Array.isArray(row.tools_used) ? row.tools_used : [], inputMode: row.input_mode ?? "text", createdAt: row.created_at,
      })));
    }
    setLoadingThread(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 20);
  }, []);

  const newThread = useCallback(() => {
    setActiveThread(null);
    setMessages([]);
    setInput("");
    setMobileHistoryOpen(false);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const archiveThread = useCallback(async (thread: Thread) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("mia_chat_threads" as any).update({ status: "archived" }).eq("id", thread.id);
    if (error) return toast.error("Não foi possível arquivar");
    if (activeThread?.id === thread.id) newThread();
    setThreads((current) => current.filter((item) => item.id !== thread.id));
  }, [activeThread?.id, newThread]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: messages.length > 2 ? "smooth" : "auto" }); }, [messages, loading]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds(Math.max(0, Math.floor((Date.now() - recordingStartedRef.current) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    audioRef.current?.pause();
    audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const openConversation = useCallback((conversationId: string) => {
    if (onOpenConversation) return onOpenConversation(conversationId);
    try { sessionStorage.setItem("inbox:pendingConversationId", conversationId); } catch { /* armazenamento opcional */ }
    window.location.assign("/admin?tab=inbox-chat");
  }, [onOpenConversation]);

  const send = useCallback(async (raw: string, inputMode: "text" | "audio" = "text", audioDurationMs?: number) => {
    const text = raw.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    const optimisticUser: Message = { id: temporaryId("user"), role: "user", content: text, blocks: [], toolsUsed: [], inputMode, createdAt: nowIso() };
    const pendingId = temporaryId("mia");
    setMessages((current) => [...current, optimisticUser, { id: pendingId, role: "assistant", content: "", blocks: [], toolsUsed: [], inputMode: "system", createdAt: nowIso(), pending: true }]);
    try {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session?.access_token) throw new Error("Sua sessão expirou. Entre novamente.");
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session.access_token}` },
        body: JSON.stringify({ message: text, thread_id: activeThread?.id ?? null, input_mode: inputMode, audio_duration_ms: audioDurationMs }),
        signal: AbortSignal.timeout(120_000),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? "A Mia não conseguiu responder agora.");
      const reply: Message = {
        id: payload?.message_id ?? temporaryId("mia"), role: "assistant", content: payload?.response ?? "",
        blocks: Array.isArray(payload?.blocks) ? payload.blocks : [], toolsUsed: Array.isArray(payload?.tools_used) ? payload.tools_used : [],
        inputMode: "system", createdAt: nowIso(),
      };
      setMessages((current) => current.map((message) => message.id === pendingId ? reply : message));
      if (payload?.thread_id && activeThread?.id !== payload.thread_id) {
        const created = { id: payload.thread_id, title: text.length > 58 ? `${text.slice(0, 57)}…` : text, last_message_at: nowIso() };
        setActiveThread(created);
      }
      await refreshThreads(false);
    } catch (error) {
      const description = error instanceof Error ? error.message : "Erro inesperado";
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, content: description, pending: false, error: true } : message));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [activeThread?.id, loading, refreshThreads]);

  const prompt = useCallback((value: string, sendNow = false) => {
    if (sendNow) void send(value);
    else { setInput(value); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [send]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((value) => MediaRecorder.isTypeSupported(value));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) mediaChunksRef.current.push(event.data); };
      recorder.start(200);
      mediaRecorderRef.current = recorder;
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0);
      setRecording(true);
    } catch { toast.error("Não foi possível acessar o microfone"); }
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorder?.stream.getTracks().forEach((track) => track.stop());
    mediaChunksRef.current = [];
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordingSeconds(0);
  }, []);

  const stopAndSendRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    const duration = Date.now() - recordingStartedRef.current;
    setRecording(false);
    setTranscribing(true);
    try {
      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(mediaChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        recorder.stop();
      });
      recorder.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session?.access_token) throw new Error("Sessão expirada");
      const form = new FormData();
      form.append("audio", blob, blob.type.includes("mp4") ? "mia.m4a" : "mia.webm");
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-transcribe-audio`, { method: "POST", headers: { Authorization: `Bearer ${auth.session.access_token}` }, body: form });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.text) throw new Error(payload?.message ?? "Não entendi o áudio");
      await send(payload.text, "audio", duration);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao transcrever áudio");
    } finally {
      setTranscribing(false);
      setRecordingSeconds(0);
      mediaChunksRef.current = [];
    }
  }, [send]);

  const listen = useCallback(async (message: Message) => {
    if (playingId === message.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    try {
      audioRef.current?.pause();
      const { data: auth } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-speech`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.session?.access_token}` },
        body: JSON.stringify({ text: message.content.slice(0, 6000) }),
      });
      if (!response.ok) throw new Error("Não foi possível gerar o áudio");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingId(message.id);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      await audio.play();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro de áudio"); setPlayingId(null); }
  }, [playingId]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); }
  };

  const sidebar = <ThreadList threads={threads} activeId={activeThread?.id ?? null} search={search} onSearch={setSearch} onSelect={(thread) => void loadThread(thread)} onNew={newThread} onArchive={(thread) => void archiveThread(thread)} />;
  const isEmpty = messages.length === 0;

  return (
    <div className={cn("relative flex overflow-hidden bg-background", heightClass, !drawer && "rounded-2xl border shadow-sm")}>
      {!drawer && <aside className="hidden w-[250px] shrink-0 border-r md:block">{sidebar}</aside>}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className={cn("flex h-14 shrink-0 items-center justify-between border-b px-3 sm:px-4", drawer && "pr-12")}>
          <div className="flex min-w-0 items-center gap-2.5">
            {!drawer && (
              <Sheet open={mobileHistoryOpen} onOpenChange={setMobileHistoryOpen}>
                <SheetTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 md:hidden"><Menu className="h-4 w-4" /></Button></SheetTrigger>
                <SheetContent side="left" className="w-[86vw] max-w-[320px] p-0"><SheetHeader className="sr-only"><SheetTitle>Conversas da Mia</SheetTitle></SheetHeader>{sidebar}</SheetContent>
              </Sheet>
            )}
            <MiaMark compact />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{activeThread?.title ?? "Mia"}</p>
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Conectada à sua operação</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onStartVoice && <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-xl px-2.5 text-xs" onClick={onStartVoice}><Mic className="h-3.5 w-3.5" /><span className="hidden sm:inline">Ao vivo</span></Button>}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={newThread} title="Nova conversa"><Plus className="h-4 w-4" /></Button>
          </div>
        </header>

        <div className="relative flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 pb-36 pt-3 sm:px-6">
            {loadingThread ? (
              <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando conversa…</div>
            ) : isEmpty ? (
              <div className="flex min-h-[62vh] flex-col items-center justify-center py-10">
                <MiaMark />
                <h2 className="mt-5 text-center text-2xl font-semibold tracking-tight sm:text-3xl">O que vamos resolver hoje?</h2>
                <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-muted-foreground">Pergunte sobre qualquer parte da operação. A Mia cruza os dados, mostra evidências e prepara as próximas ações.</p>
                <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                  {QUICK_STARTS.map((item) => {
                    const Icon = item.icon;
                    return <button key={item.title} onClick={() => void send(item.prompt)} className="group rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm"><Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" /><p className="mt-3 text-sm font-medium">{item.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p></button>;
                  })}
                </div>
              </div>
            ) : (
              <>{messages.map((message) => message.pending ? (
                <div key={message.id} className="flex gap-3 py-5"><MiaMark compact /><div className="flex items-center gap-2 pt-1 text-sm text-muted-foreground"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-.3s]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-.15s]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" /></span>Analisando a operação…</div></div>
              ) : <MessageContent key={message.id} message={message} onOpenConversation={openConversation} onPrompt={prompt} onListen={(item) => void listen(item)} />)}<div ref={bottomRef} /></>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-3 pt-10 sm:px-5">
          <div className="pointer-events-auto mx-auto w-full max-w-3xl">
            {recording ? (
              <div className="flex min-h-14 items-center gap-3 rounded-3xl border bg-card px-3 shadow-lg shadow-black/5">
                <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/10 text-rose-500"><span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-rose-500/50" /><Mic className="relative h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">Gravando áudio</p><p className="text-[11px] text-muted-foreground">{String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}</p></div>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={cancelRecording}><X className="h-4 w-4" /></Button>
                <Button size="icon" className="h-9 w-9 rounded-full" onClick={() => void stopAndSendRecording()}><Square className="h-3.5 w-3.5 fill-current" /></Button>
              </div>
            ) : (
              <div className="rounded-[26px] border bg-card p-2 shadow-lg shadow-black/5 focus-within:border-foreground/20">
                <Textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} disabled={loading || transcribing} rows={1} placeholder={transcribing ? "Transcrevendo seu áudio…" : "Mensagem para a Mia"} className="max-h-36 min-h-[42px] resize-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0" />
                <div className="flex items-center justify-between px-1 pb-0.5">
                  <div className="flex items-center gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-8 gap-1 rounded-xl px-2 text-[11px] text-muted-foreground"><Plus className="h-3.5 w-3.5" />Criar <ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-52"><DropdownMenuItem onClick={() => prompt("Crie um relatório detalhado sobre ")}><BarChart3 className="mr-2 h-4 w-4" />Relatório</DropdownMenuItem><DropdownMenuItem onClick={() => prompt("Agende uma rotina para ")}><Clock3 className="mr-2 h-4 w-4" />Rotina agendada</DropdownMenuItem><DropdownMenuItem onClick={() => prompt("Prepare uma ação para ")}><Sparkles className="mr-2 h-4 w-4" />Ação na plataforma</DropdownMenuItem></DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-1">
                    {transcribing ? <span className="flex h-8 items-center gap-1.5 px-2 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Transcrevendo</span> : !input.trim() && <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => void startRecording()} title="Enviar áudio"><Mic className="h-4 w-4" /></Button>}
                    <Button size="icon" className="h-8 w-8 rounded-full" disabled={!input.trim() || loading || transcribing} onClick={() => void send(input)}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}</Button>
                  </div>
                </div>
              </div>
            )}
            <p className="mt-1.5 text-center text-[9px] text-muted-foreground">A Mia pode cometer erros. Ações sensíveis sempre exigem confirmação.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
