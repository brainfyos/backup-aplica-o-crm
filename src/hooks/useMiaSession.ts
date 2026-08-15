import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type MiaStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

export interface MiaTurn {
  role: "user" | "assistant";
  text: string;
  at: number;
}

interface SessionResp {
  client_secret: { value: string; expires_at: number };
  model: string;
  session_id: string;
}

const FN_URL = (name: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;

const READ_TOOLS = new Set([
  "get_operation_summary",
  "get_team_status",
  "get_unanswered_conversations",
  "get_hot_leads",
  "get_overdue_tasks",
  "get_today_schedule",
  // Fase 3 — Analyst
  "get_lead_context",
  "get_conversation_summary",
  "get_conversation_messages",
  "get_seller_context",
  "get_pipeline_context",
  "get_followup_context",
  "get_daily_ai_summary",
  // Fase 4 — Messenger (resolução + drafts ficam em mia-tools, retornam action_id)
  "resolve_recipient",
  "get_contact_context",
  "draft_whatsapp_message",
  "draft_email",
  "draft_internal_notification",
  "draft_push",
  // Fase 5 — Memória + conversa ativa
  "get_memory",
  "remember_fact",
  "forget_fact",
  "update_preference",
  "find_active_conversation",
  "draft_conversation_message",
  // Fase 6 — Gestão de atendimentos
  "list_conversations",
  "get_conversation_detail",
  "list_agents",
  "get_agent_workload",
  "draft_assign_conversation",
  "draft_transfer_sector",
  "draft_close_conversation",
  "draft_takeover_from_agent",
  "draft_handback_to_agent",
  // Fase 7 — Agenda
  "find_calendar_event",
  "draft_reschedule_booking",
  "draft_cancel_booking",
  // Contexto de tela + encerramento
  "get_screen_context",
  "close_session",
  // Fase 3
  "charge_overdue_task",
  // Fase 8 — CRM Write
  "draft_create_lead",
  "draft_update_lead_stage",
  "draft_update_lead_temperature",
  "draft_create_note",
  "draft_create_calendar_event",
  "search_business_knowledge",
  // Status async
  "check_action_status",
]);

const CONTEXT_TOOLS = new Set([
  "get_lead_context",
  "get_conversation_summary",
  "get_conversation_messages",
  "get_seller_context",
  "get_pipeline_context",
  "get_followup_context",
  "get_daily_ai_summary",
]);

const PREPARE_TOOLS = new Set([
  "prepare_create_task",
  "prepare_schedule_followup",
  "prepare_notify_seller",
]);

const NAV_TOOLS = new Set([
  "open_conversation",
  "open_lead",
  "open_calendar",
  "open_tasks",
  "open_report",
]);

const PREPARE_TYPE: Record<string, string> = {
  prepare_create_task: "create_task",
  prepare_schedule_followup: "schedule_followup",
  prepare_notify_seller: "notify_seller",
};

export interface MiaContextSnapshot {
  tool: string;
  args: any;
  result: any;
  at: number;
}

export interface UseMiaSessionOptions {
  onNavigate?: (action: string, payload: any) => void;
  /** Disparado quando uma tool de contexto da Fase 3 retorna dados. */
  onContext?: (snapshot: MiaContextSnapshot) => void;
  /** Auto-encerra a sessão após N ms sem fala. 0 desativa. */
  autoCloseAfterMs?: number;
  /** Retorna o contexto da tela atual (chamado por get_screen_context tool). */
  onGetScreenContext?: () => any;
  /** Coloca a Mia para dormir quando uma frase de encerramento é reconhecida. */
  onVoiceStop?: () => void;
}

const VOICE_STOP_PHRASES = [
  "encerrar",
  "encerra",
  "desligar",
  "desliga",
  "pare de ouvir",
  "parar de ouvir",
  "pode desligar",
  "pode encerrar",
  "boa noite",
  "boa noite mia",
  "tchau",
  "tchau mia",
  "ate mais",
];

function normalizeVoiceCommand(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMiaVoiceStopCommand(text: string) {
  const normalized = normalizeVoiceCommand(text)
    .replace(/^mia\s+/, "")
    .replace(/\s+(?:mia|por favor|agora)$/, "")
    .trim();
  return VOICE_STOP_PHRASES.includes(normalized);
}

export function useMiaSession(opts: UseMiaSessionOptions = {}) {
  const { onNavigate, onContext, autoCloseAfterMs = 30_000, onGetScreenContext, onVoiceStop } = opts;
  const onGetScreenContextRef = useRef(onGetScreenContext);
  useEffect(() => { onGetScreenContextRef.current = onGetScreenContext; }, [onGetScreenContext]);
  const onVoiceStopRef = useRef(onVoiceStop);
  useEffect(() => { onVoiceStopRef.current = onVoiceStop; }, [onVoiceStop]);

  const [status, setStatus] = useState<MiaStatus>("idle");
  const [connected, setConnected] = useState(false);
  const [turns, setTurns] = useState<MiaTurn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const assistantBufferRef = useRef<string>("");
  const startingRef = useRef<boolean>(false);
  const lastTurnRef = useRef<{ role: MiaTurn["role"]; text: string; at: number } | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNavigateRef = useRef(onNavigate);
  const onContextRef = useRef(onContext);
  // Buffer de tool-calls por response_id, executados em Promise.all quando response.done chega
  const toolQueueRef = useRef<Map<string, Array<{ callId: string; name: string; args: any }>>>(new Map());
  // Flag: existe uma response ativa do modelo? (set em response.created, clear em response.done)
  const responseActiveRef = useRef<boolean>(false);
  // Promessas pendentes aguardando o próximo response.done para liberar response.create
  const responseDoneWaitersRef = useRef<Array<() => void>>([]);
  // Ações disparadas pela sessão atual (action_id → { type, label }) para narrar callbacks
  const dispatchedActionsRef = useRef<Map<string, { type: string; label: string }>>(new Map());
  // Canal realtime para mia_actions
  const actionsChannelRef = useRef<any>(null);
  // Canal realtime para alertas proativos do inbox
  const alertsChannelRef = useRef<any>(null);
  // Conversas já alertadas nesta sessão (evita spam)
  const alertedConvsRef = useRef<Set<string>>(new Set());
  // userId e orgId capturados no start
  const userIdRef = useRef<string | null>(null);
  const orgIdRef  = useRef<string | null>(null);
  // Quantas tool-calls estão em execução agora (evita auto-close durante processamento)
  const toolsInFlightRef = useRef<number>(0);
  // Contador de turnos para checkpoint de contexto
  const assistantTurnCountRef = useRef<number>(0);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);
  useEffect(() => { onContextRef.current = onContext; }, [onContext]);

  const appendTurn = (role: MiaTurn["role"], text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const last = lastTurnRef.current;
    if (last && last.role === role && last.text === trimmed && Date.now() - last.at < 2000) return;
    const entry = { role, text: trimmed, at: Date.now() };
    lastTurnRef.current = entry;
    setTurns((prev) => [...prev, entry]);
  };

  const setMicEnabled = (enabled: boolean) => {
    micStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = enabled; });
  };

  const stop = useCallback(() => {
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try {
      if (audioElRef.current) {
        audioElRef.current.srcObject = null;
        audioElRef.current.remove();
      }
    } catch {}
    try { if (actionsChannelRef.current) supabase.removeChannel(actionsChannelRef.current); } catch {}
    try { if (alertsChannelRef.current)  supabase.removeChannel(alertsChannelRef.current);  } catch {}
    actionsChannelRef.current = null;
    alertsChannelRef.current  = null;
    alertedConvsRef.current.clear();
    orgIdRef.current = null;
    pcRef.current = null;
    dcRef.current = null;
    micStreamRef.current = null;
    audioElRef.current = null;
    lastTurnRef.current = null;
    toolQueueRef.current.clear();
    dispatchedActionsRef.current.clear();
    responseDoneWaitersRef.current = [];
    responseActiveRef.current = false;
    toolsInFlightRef.current = 0;
    assistantTurnCountRef.current = 0;
    userIdRef.current = null;
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    setStatus("idle");
    setConnected(false);
  }, []);

  // Aguarda response.done corrente (se houver) antes de permitir novo response.create
  const waitForResponseSlot = useCallback(async (): Promise<void> => {
    if (!responseActiveRef.current) return;
    await new Promise<void>((resolve) => {
      responseDoneWaitersRef.current.push(resolve);
    });
  }, []);

  const safeResponseCreate = useCallback(async (instructions?: string) => {
    await waitForResponseSlot();
    if (dcRef.current?.readyState !== "open") return;
    const payload: any = { type: "response.create" };
    if (instructions) payload.response = { instructions };
    dcRef.current.send(JSON.stringify(payload));
  }, [waitForResponseSlot]);

  const bumpActivity = useCallback(() => {
    if (!autoCloseAfterMs) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    // Se há tools em execução, nunca fecha — reagenda e verifica novamente
    if (toolsInFlightRef.current > 0) {
      inactivityTimerRef.current = setTimeout(() => bumpActivity(), 5_000);
      return;
    }
    inactivityTimerRef.current = setTimeout(() => {
      // Dupla checagem: não fecha se ainda houver tools rodando
      if (toolsInFlightRef.current > 0) { bumpActivity(); return; }
      console.info("[Mia] auto-close por inatividade");
      stop();
    }, autoCloseAfterMs);
  }, [autoCloseAfterMs, stop]);

  const callFn = useCallback(async (fn: string, body: any): Promise<any> => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) throw new Error("not_authenticated");
    const resp = await fetch(FN_URL(fn), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await resp.json();
  }, []);

  const runTool = useCallback(async (toolName: string, args: any): Promise<any> => {
    // Leitura (inclui draft_* que vão ao mia-tools e retornam action_id)
    if (READ_TOOLS.has(toolName)) {
      const r = await callFn("mia-tools", { tool: toolName, args: args ?? {} });
      const data = r?.data ?? r ?? {};

      if (CONTEXT_TOOLS.has(toolName)) {
        try { onContextRef.current?.({ tool: toolName, args: args ?? {}, result: data, at: Date.now() }); } catch {}
      }

      // Auto-confirmar ações piloto — não precisa de interação humana
      if (data?.autonomy_level === "piloto" && data?.action_id && data?.ok) {
        try {
          const confirmResult = await callFn("mia-execute-action", { action_id: data.action_id });
          if (confirmResult?.status === "executing" && confirmResult?.action_id) {
            dispatchedActionsRef.current.set(confirmResult.action_id, {
              type:  "executing",
              label: data.preview ?? "ação",
            });
          }
          // Retorna dados enriquecidos — narração já vem ajustada do mia-tools ("Executando agora.")
          return { ...data, auto_executed: true, status: "executing" };
        } catch (e) {
          console.warn("[Mia] auto-confirm piloto falhou:", e);
          // Degrada graciosamente: ação fica em fila para confirmação manual
          return { ...data, auto_executed: false };
        }
      }

      // Ações nível "sugerir" — não pede confirmação por voz, vai direto para a Central
      if (data?.autonomy_level === "sugerir" && data?.action_id && data?.ok) {
        return {
          ...data,
          narration: `${data.preview ?? "Ação"} foi para a Central de Decisões para aprovação de um administrador.`,
          requires_admin_approval: true,
        };
      }

      return data;
    }
    // Preparar ação (gera card de aprovação)
    if (PREPARE_TOOLS.has(toolName)) {
      const actionType = PREPARE_TYPE[toolName];
      const r = await callFn("mia-prepare-action", { action_type: actionType, payload: args ?? {} });
      return r;
    }
    // Confirmar / Cancelar
    if (toolName === "confirm_pending_action") {
      return await callFn("mia-execute-action", { action_id: args?.action_id });
    }
    if (toolName === "cancel_pending_action") {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/mia_actions?id=eq.${args?.action_id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
        body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString() }),
      });
      const j = await r.json().catch(() => null);
      return { ok: r.ok, data: j };
    }
    // Contexto da tela atual
    if (toolName === "get_screen_context") {
      return onGetScreenContextRef.current?.() ?? { tab: "unknown", label: "Tela desconhecida", description: "Contexto não disponível" };
    }
    // Encerramento de sessão por voz — salva resumo antes de fechar
    if (toolName === "close_session") {
      if (dcRef.current?.readyState === "open") {
        const today = new Date().toISOString().slice(0, 10);
        await waitForResponseSlot();
        // Injeta instrução para salvar resumo da sessão
        dcRef.current.send(JSON.stringify({
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text",
            text: `[Sistema: chame remember_fact com key="resumo_sessao_${today}" e value=resumo de 2 linhas da sessão (tópicos discutidos, ações feitas, próximos passos). Depois diga tchau de forma carismática e breve.`
          }] },
        }));
        dcRef.current.send(JSON.stringify({ type: "response.create" }));
        setTimeout(() => stop(), 4_000);
      } else {
        setTimeout(() => stop(), 400);
      }
      return { ok: true };
    }
    // Navegação — registra ação e dispara callback no frontend
    if (NAV_TOOLS.has(toolName)) {
      const r = await callFn("mia-prepare-action", { action_type: toolName, payload: args ?? {} });
      try { onNavigateRef.current?.(toolName, args ?? {}); } catch (e) { console.error("[Mia] onNavigate error", e); }
      return r;
    }
    return { error: "unknown_tool", tool: toolName };
  }, [callFn]);

  // Processa um lote de tool-calls em paralelo e devolve um único response.create
  const flushToolQueue = useCallback(async (responseId: string) => {
    const queue = toolQueueRef.current.get(responseId) ?? [];
    toolQueueRef.current.delete(responseId);
    if (queue.length === 0) return;

    // Registra tools em voo — impede auto-close enquanto processa
    toolsInFlightRef.current += queue.length;
    bumpActivity();

    // Para múltiplas tools: injeta mensagem de progresso se demorar > 5s
    let toolsDone = false;
    const progressTimer = queue.length >= 2 ? setTimeout(async () => {
      if (toolsDone || dcRef.current?.readyState !== "open") return;
      bumpActivity();
      if (responseActiveRef.current) return; // Mia já está falando, não interrompe
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: { type: "message", role: "user", content: [{ type: "input_text",
          text: "[Sistema: ainda processando dados. Diga UMA frase curta, bem-humorada e encorajadora. Varie SEMPRE — nunca repita. Exemplos: 'Tô quase lá, não me abandona! 😄', 'O banco de dados tá me dando um trabalhão... já já!', 'Prometo que vale a pena esperar.', 'Só mais um segundo, o cérebro tá a todo vapor 🧠']"
        }] },
      }));
      dcRef.current.send(JSON.stringify({ type: "response.create" }));
    }, 5_000) : null;

    const outputs = await Promise.all(queue.map(async ({ callId, name, args }) => {
      try {
        const result = await runTool(name, args);
        toolsInFlightRef.current = Math.max(0, toolsInFlightRef.current - 1);
        bumpActivity();
        if (name === "confirm_pending_action" && result?.status === "executing" && result?.action_id) {
          const label = result?.preview ?? "ação";
          dispatchedActionsRef.current.set(result.action_id, { type: "executing", label });
        }
        return { callId, output: JSON.stringify(result ?? {}) };
      } catch (err: any) {
        toolsInFlightRef.current = Math.max(0, toolsInFlightRef.current - 1);
        return { callId, output: JSON.stringify({ error: String(err?.message ?? err) }) };
      }
    }));

    toolsDone = true;
    if (progressTimer) clearTimeout(progressTimer);

    if (dcRef.current?.readyState !== "open") return;

    // Espera eventual mensagem de progresso terminar antes de enviar resultados
    await waitForResponseSlot();

    for (const { callId, output } of outputs) {
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output },
      }));
    }
    await safeResponseCreate(
      "Anuncie em UMA linha curta o que aconteceu (Enviado./Pronto./Feito./Tarefa criada./Falhou: motivo). Se status='executing', diga 'Tô mandando, te aviso quando entregar.' Sem repetir contexto."
    );
  }, [runTool, safeResponseCreate, bumpActivity, waitForResponseSlot]);

  const handleServerEvent = useCallback(async (evt: any) => {
    switch (evt.type) {
      case "input_audio_buffer.speech_started":
        setStatus("listening");
        bumpActivity();
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const t = evt.transcript?.trim();
        if (t) {
          appendTurn("user", t);
          if (isMiaVoiceStopCommand(t)) {
            // Não depende do modelo chamar close_session: corta o microfone localmente
            // assim que a transcrição final confirma uma frase curta de encerramento.
            setMicEnabled(false);
            onVoiceStopRef.current?.();
            stop();
            toast.success("Mia desligada", { description: "O microfone parou de ouvir." });
            return;
          }
        }
        bumpActivity();
        break;
      }
      case "response.created":
        responseActiveRef.current = true;
        setStatus("thinking");
        assistantBufferRef.current = "";
        bumpActivity();
        break;
      case "response.audio_transcript.delta":
        assistantBufferRef.current += evt.delta ?? "";
        break;
      case "response.audio.delta":
        setStatus("speaking");
        setMicEnabled(false);
        break;
      case "response.audio_transcript.done": {
        const txt = assistantBufferRef.current.trim();
        if (txt) {
          appendTurn("assistant", txt);
          assistantTurnCountRef.current += 1;

          // Checkpoint de contexto a cada 15 turnos da Mia — evita perda em sessões longas
          if (assistantTurnCountRef.current > 0 && assistantTurnCountRef.current % 15 === 0) {
            // Injeta resumo silencioso sem disparar resposta de voz — só atualiza contexto interno
            if (dcRef.current?.readyState === "open" && !responseActiveRef.current) {
              dcRef.current.send(JSON.stringify({
                type: "conversation.item.create",
                item: { type: "message", role: "user", content: [{ type: "input_text",
                  text: "[Checkpoint interno — não responda em voz alta]: Liste mentalmente os leads, vendedores e tópicos importantes desta sessão para não perder o fio. Se precisar confirmar algo, apenas diga 'Ok, contexto atualizado.' em 3 palavras."
                }] },
              }));
              dcRef.current.send(JSON.stringify({ type: "response.create" }));
            }
          }
        }
        assistantBufferRef.current = "";
        break;
      }
      case "response.done": {
        responseActiveRef.current = false;
        const waiters = responseDoneWaitersRef.current;
        responseDoneWaitersRef.current = [];
        waiters.forEach((fn) => { try { fn(); } catch {} });
        setStatus("idle");
        setMicEnabled(true);
        bumpActivity();
        const respId = evt.response?.id;
        if (respId && toolQueueRef.current.has(respId)) {
          // Executa tools coletadas durante esta response em paralelo
          flushToolQueue(respId).catch((e) => console.error("[Mia] flushToolQueue", e));
        }
        break;
      }
      case "response.function_call_arguments.done": {
        const respId = evt.response_id;
        const callId = evt.call_id;
        const toolName = evt.name;
        let args: any = {};
        try { args = evt.arguments ? JSON.parse(evt.arguments) : {}; } catch {}
        // Enfileira para execução em lote após response.done
        if (respId) {
          const arr = toolQueueRef.current.get(respId) ?? [];
          arr.push({ callId, name: toolName, args });
          toolQueueRef.current.set(respId, arr);
        } else {
          // sem response_id, processa imediatamente como fallback
          try {
            const result = await runTool(toolName, args);
            dcRef.current?.send(JSON.stringify({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result ?? {}) },
            }));
            await safeResponseCreate();
          } catch (err: any) {
            dcRef.current?.send(JSON.stringify({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ error: String(err?.message ?? err) }) },
            }));
            await safeResponseCreate();
          }
        }
        break;
      }
      case "error":
        console.error("[Mia] server error", evt);
        setError(evt.error?.message ?? "Erro na sessão");
        break;
    }
  }, [runTool, bumpActivity, flushToolQueue, safeResponseCreate, stop]);

  const start = useCallback(async () => {
    if (startingRef.current || pcRef.current) return;
    if (status !== "idle" && status !== "error") return;
    startingRef.current = true;
    setError(null);
    setStatus("connecting");
    try {
      const { data: session } = await supabase.auth.getSession();
      const userToken = session.session?.access_token;
      if (!userToken) throw new Error("Faça login novamente.");
      const uid = session.session?.user?.id ?? null;
      userIdRef.current = uid;

      // Busca orgId para usar nas subscriptions
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles").select("organization_id").eq("id", uid).maybeSingle();
        orgIdRef.current = (prof as any)?.organization_id ?? null;
      }
      const orgId = orgIdRef.current;

      // Realtime: ouvir conclusão de mia_actions disparadas pela sessão para narrar automaticamente
      if (uid) {
        const ch = supabase
          .channel(`mia-actions-${uid}-${Date.now()}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "mia_actions", filter: `user_id=eq.${uid}` },
            async (payload: any) => {
              const row = payload.new;
              if (!row?.id) return;
              const status = row.status;
              if (status !== "executed" && status !== "failed") return;
              const tracked = dispatchedActionsRef.current.get(row.id);
              if (!tracked) return; // só narra ações que esta sessão disparou
              dispatchedActionsRef.current.delete(row.id);
              if (dcRef.current?.readyState !== "open") return;
              const msg = status === "executed"
                ? `[Sistema] Ação concluída com sucesso (${row.action_type}). Anuncie ao usuário em UMA linha: "Pronto." ou "Enviado.".`
                : `[Sistema] Ação falhou (${row.action_type}): ${row.error_message ?? "erro desconhecido"}. Avise ao usuário em UMA linha e ofereça alternativa.`;
              dcRef.current.send(JSON.stringify({
                type: "conversation.item.create",
                item: { type: "message", role: "user", content: [{ type: "input_text", text: msg }] },
              }));
              await safeResponseCreate();
            },
          )
          .subscribe();
        actionsChannelRef.current = ch;
      }

      // Realtime: alertas proativos — inbox com leads esperando sem resposta
      if (orgId) {
        const alertCh = supabase
          .channel(`mia-inbox-alerts-${uid}-${Date.now()}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "webchat_conversations",
              filter: `organization_id=eq.${orgId}` },
            async (payload: any) => {
              const row = payload.new;
              if (!row?.id || row.status !== "waiting_human") return;
              if (alertedConvsRef.current.has(row.id)) return; // já alertou

              const lastInbound = row.last_inbound_at ? new Date(row.last_inbound_at) : null;
              const minsWaiting = lastInbound
                ? Math.round((Date.now() - lastInbound.getTime()) / 60_000) : 0;
              if (minsWaiting < 3) return; // só alerta se esperando há mais de 3 min

              alertedConvsRef.current.add(row.id);
              if (dcRef.current?.readyState !== "open") return;

              const canal = row.channel ?? "chat";
              const nome  = row.visitor_name ?? "Um lead";
              dcRef.current.send(JSON.stringify({
                type: "conversation.item.create",
                item: { type: "message", role: "user", content: [{ type: "input_text",
                  text: `[Alerta automático] "${nome}" (${canal}) está esperando resposta há ${minsWaiting} min sem atendente. Avise o admin em UMA linha e sugira ação imediata.`
                }] },
              }));
              await safeResponseCreate();
            },
          )
          .subscribe();
        alertsChannelRef.current = alertCh;
      }

      const resp = await fetch(FN_URL("mia-realtime-session"), {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.message ?? err?.error ?? "Falha ao iniciar sessão");
      }
      const sessionData = (await resp.json()) as SessionResp;
      const ephemeralKey = sessionData.client_secret.value;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setConnected(false);
          setError("Conexão de voz perdida");
          setStatus("error");
        } else if (pc.connectionState === "connected") {
          setConnected(true);
          setStatus("idle");
          bumpActivity();
        }
      };

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      (audioEl as any).playsInline = true;
      audioEl.setAttribute("playsinline", "");
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };

      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            // AGC pode amplificar ruído ambiente e disparar o VAD sem fala real.
            autoGainControl: false,
            channelCount: 1,
          },
        });
      } catch (mediaErr: any) {
        if (mediaErr?.name === "NotAllowedError") throw new Error("Permissão de microfone negada.");
        if (mediaErr?.name === "NotFoundError") throw new Error("Nenhum microfone encontrado.");
        throw new Error(`Erro ao acessar microfone: ${mediaErr?.message ?? mediaErr}`);
      }
      micStreamRef.current = mic;
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (ev) => {
        try { handleServerEvent(JSON.parse(ev.data)); } catch {}
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResp = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(sessionData.model)}`, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp" },
      });
      if (!sdpResp.ok) {
        const errorBody = await sdpResp.text();
        throw new Error(`SDP exchange falhou (${sdpResp.status}): ${errorBody.slice(0, 200)}`);
      }
      const answer = { type: "answer" as RTCSdpType, sdp: await sdpResp.text() };
      await pc.setRemoteDescription(answer);
      setConnected(true);

      setStatus("idle");
      bumpActivity();
    } catch (e: any) {
      console.error("[Mia] start error", e);
      setConnected(false);
      setError(e?.message ?? "Erro ao iniciar");
      setStatus("error");
      toast.error(e?.message ?? "Erro ao iniciar Mia");
    } finally {
      startingRef.current = false;
    }
  }, [status, handleServerEvent, bumpActivity, safeResponseCreate]);

  const sendText = useCallback((text: string) => {
    if (!dcRef.current || dcRef.current.readyState !== "open") {
      toast.error("Conecte a Mia primeiro.");
      return;
    }
    appendTurn("user", text);
    dcRef.current.send(JSON.stringify({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    }));
    dcRef.current.send(JSON.stringify({ type: "response.create" }));
    setStatus("thinking");
    bumpActivity();
  }, [bumpActivity]);

  useEffect(() => () => { stop(); }, [stop]);

  return {
    status,
    connected,
    turns,
    error,
    start,
    stop,
    sendText,
    isConnected: connected,
    micStreamRef, // exposto para o visualizador de áudio (MiaOrb)
  };
}
