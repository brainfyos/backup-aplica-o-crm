// MiaContext — sessão global da Mia.
// Renderizado uma única vez na raiz da app autenticada.
// Qualquer tela acessa via useMia(). VendusOrb flutua em todas as páginas.
// Suporta: navegação real, contexto de tela atual, wake word global.

import {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
  type ReactNode,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMiaSession, type MiaStatus, type MiaTurn, type MiaContextSnapshot } from "@/hooks/useMiaSession";
import { useMiaWakeWord, type WakeWordState } from "@/hooks/useMiaWakeWord";
import { useMiaActions } from "@/hooks/useMiaActions";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizationEffectivePlan } from "@/hooks/useOrganizationPlan";
import { VendusOrb } from "@/components/mia/VendusOrb";
import { MiaChatDrawer } from "@/components/mia/MiaChatDrawer";
import { getCurrentScreenContext, updateScreenContextFromRoute } from "@/hooks/useMiaScreenContext";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MiaContextValue {
  status:       MiaStatus;
  turns:        MiaTurn[];
  active:       boolean;
  micStreamRef: React.RefObject<MediaStream | null>;
  start:        () => void;
  stop:         () => void;
  sendText:     (text: string) => void;
  wakeState:    WakeWordState;
  wakeEnabled:  boolean;
  wakeError:    string | null;
  wakeToggle:   (v?: boolean) => void;
  registerContextHandler: (fn: (snap: MiaContextSnapshot) => void) => void;
  pendingCount: number;
  chatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
}

interface MiaNavigationPayload {
  conversation_id?: string;
  lead_id?: string;
  lead_name?: string;
  report?: string;
}

// ── Mapa de ação → tab de destino ─────────────────────────────────────────────

const ACTION_TO_TAB: Record<string, string> = {
  open_conversation: "inbox-chat",
  open_lead:         "leads",
  open_pipeline:     "pipeline",
  open_calendar:     "calendar",
  open_tasks:        "inbox-followup",
  open_report:       "inbox-reports",
  open_dashboard:    "dashboard",
};

// ── Context ───────────────────────────────────────────────────────────────────

const MiaCtx = createContext<MiaContextValue | null>(null);

export function useMia(): MiaContextValue {
  const ctx = useContext(MiaCtx);
  if (!ctx) throw new Error("useMia deve ser usado dentro de MiaProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function MiaProvider({ children }: { children: ReactNode }) {
  const { profile, isAdmin, isManager } = useAuth();
  const { data: effectivePlan } = useOrganizationEffectivePlan(profile?.organization_id);
  const navigate  = useNavigate();
  const location  = useLocation();
  const isAdminSurface = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const wakeToggleRef = useRef<((v?: boolean) => void) | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const eligible = isAdminSurface
    && !!profile
    && (isAdmin() || isManager())
    && effectivePlan?.features?.mia === true;
  const miaWorkspaceOpen = chatOpen
    || (location.pathname === "/admin" && new URLSearchParams(location.search).get("tab") === "mia");
  const { pending } = useMiaActions(eligible && miaWorkspaceOpen);

  // Atualiza contexto de tela conforme a rota muda
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab    = params.get("tab") ?? "dashboard";
    updateScreenContextFromRoute(tab, location.pathname + location.search);
  }, [location]);

  // Callback de contexto de entidade ativa (AdminMia registra)
  const onContextHandlerRef = useRef<((snap: MiaContextSnapshot) => void) | undefined>();
  const registerContextHandler = useCallback((fn: (snap: MiaContextSnapshot) => void) => {
    onContextHandlerRef.current = fn;
  }, []);

  // Navegação real: abre a tela correta quando Mia pede
  const onNavigate = useCallback((action: string, payload: MiaNavigationPayload) => {
    const tab = ACTION_TO_TAB[action];
    if (!tab) return;

    // Monta query params com entidade específica (se houver)
    const params = new URLSearchParams({ tab });
    if (action === "open_conversation" && payload?.conversation_id) {
      params.set("conversation", payload.conversation_id);
    }
    if (action === "open_lead" && payload?.lead_id) {
      params.set("lead", payload.lead_id);
    }
    if (action === "open_report" && payload?.report) {
      params.set("report", payload.report);
    }

    const targetUrl = `/admin?${params.toString()}`;

    // Navega de verdade
    navigate(targetUrl);

    // Feedback visual rápido
    const labels: Record<string, string> = {
      open_conversation: payload?.lead_name ? `Abrindo conversa de ${payload.lead_name}` : "Abrindo chat",
      open_lead:         payload?.lead_name ? `Abrindo lead ${payload.lead_name}`         : "Abrindo leads",
      open_pipeline:     "Abrindo pipeline",
      open_calendar:     "Abrindo agenda",
      open_tasks:        "Abrindo follow-ups",
      open_report:       "Abrindo relatórios",
    };
    if (labels[action]) toast.info(labels[action], { duration: 2000 });
  }, [navigate]);

  const openConversationFromChat = useCallback((conversationId: string) => {
    try { sessionStorage.setItem("inbox:pendingConversationId", conversationId); } catch { /* armazenamento opcional */ }
    setChatOpen(false);
    navigate("/admin?tab=inbox-chat");
  }, [navigate]);

  const onContext = useCallback((snap: MiaContextSnapshot) => {
    onContextHandlerRef.current?.(snap);
  }, []);

  // Callback para get_screen_context tool
  const onGetScreenContext = useCallback(() => {
    return getCurrentScreenContext();
  }, []);

  // Sessão de voz global
  const { status, connected, turns, start, stop, sendText, micStreamRef } = useMiaSession({
    onNavigate,
    onContext,
    autoCloseAfterMs: 30_000,
    onGetScreenContext,
    // "desligar", "encerrar" e "boa noite" encerram a sessão e também
    // desativam a escuta passiva da wake word.
    onVoiceStop: () => wakeToggleRef.current?.(false),
  });

  const isActive = connected;

  // Ao sair do painel administrativo, encerra também qualquer captura de áudio ativa.
  useEffect(() => {
    if (!isAdminSurface && connected) stop();
  }, [connected, isAdminSurface, stop]);

  // Wake word global
  const wake = useMiaWakeWord({
    onWake: useCallback(() => {
      if (status !== "connecting" && !isActive) start();
    }, [status, isActive, start]),
    // O microfone passivo só existe enquanto o usuário está no espaço da Mia.
    // Agendamentos e trabalhos em segundo plano não dependem do navegador.
    available: eligible && miaWorkspaceOpen && !isActive,
  });
  wakeToggleRef.current = wake.toggle;

  const [pendingCount, setPendingCount] = useState(pending.length);
  useEffect(() => { setPendingCount(pending.length); }, [pending.length]);

  const value: MiaContextValue = {
    status, turns, active: isActive, micStreamRef,
    start, stop, sendText,
    wakeState:   wake.state,
    wakeEnabled: wake.enabled,
    wakeError:   wake.error,
    wakeToggle:  wake.toggle,
    registerContextHandler,
    pendingCount,
    chatOpen,
    openChat: () => setChatOpen(true),
    closeChat: () => setChatOpen(false),
  };

  return (
    <MiaCtx.Provider value={value}>
      {children}
      {eligible && (
        <VendusOrb
          status={status}
          wakeState={wake.state}
          active={isActive}
          micStreamRef={micStreamRef}
          onOpenChat={() => setChatOpen(true)}
        />
      )}
      {eligible && (
        <MiaChatDrawer
          open={chatOpen}
          onOpenChange={setChatOpen}
          onStartVoice={isActive ? stop : start}
          onOpenConversation={openConversationFromChat}
        />
      )}
    </MiaCtx.Provider>
  );
}
