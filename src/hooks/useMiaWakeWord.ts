// Wake word "Mia" / "Olá Mia" — detecção via Web Speech API (nativa, sem API key).
// Fallback para Porcupine/Picovoice se VITE_PICOVOICE_ACCESS_KEY estiver configurada.
// Funciona em Chrome, Edge e Safari (iOS/Android inclusos) com suporte a pt-BR.

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "mia.wakeWordEnabled";

// Frases que ativam a Mia (case-insensitive, parcial)
const WAKE_TRIGGERS = ["mia", "ola mia", "olá mia", "ei mia", "hey mia", "oi mia"];

export type WakeWordState = "off" | "listening" | "detected" | "unsupported" | "error";

interface UseMiaWakeWordOpts {
  onWake: () => void;
  accessKey?: string;
  available?: boolean;
}

export function useMiaWakeWord({ onWake, accessKey, available = true }: UseMiaWakeWordOpts) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(STORAGE_KEY);
    // Ativado por padrão na primeira visita
    return stored === null ? true : stored === "1";
  });
  const [state, setState] = useState<WakeWordState>("off");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const porcupineRef = useRef<any>(null);
  const onWakeRef = useRef(onWake);
  const enabledRef = useRef(enabled);
  const cooldownRef = useRef(false); // evita ativar duas vezes seguidas

  useEffect(() => { onWakeRef.current = onWake; }, [onWake]);
  useEffect(() => { enabledRef.current = enabled && available; }, [enabled, available]);

  const key = accessKey ?? (import.meta.env.VITE_PICOVOICE_ACCESS_KEY as string | undefined);

  // ── Disparo do wake ──────────────────────────────────────────────────────────
  const triggerWake = useCallback(() => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setState("detected");
    try { onWakeRef.current?.(); } catch {}
    setTimeout(() => {
      cooldownRef.current = false;
      if (enabledRef.current) setState("listening");
    }, 2000);
  }, []);

  // ── Web Speech API ───────────────────────────────────────────────────────────
  const startWebSpeech = useCallback(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setState("unsupported");
      setError("Web Speech API não suportada. Use Chrome ou Edge para wake word automática.");
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "pt-BR";
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = (event.results[i][0].transcript ?? "").toLowerCase().trim();
        if (WAKE_TRIGGERS.some((t) => transcript.includes(t))) {
          triggerWake();
          return;
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      if (event.error === "not-allowed") {
        setState("error");
        setError("Permissão de microfone negada. Habilite o microfone para ativar a Mia por voz.");
        return;
      }
      // Reinicia automaticamente em erros recuperáveis
      setTimeout(() => {
        if (enabledRef.current && recognitionRef.current) {
          try { recognitionRef.current.start(); } catch {}
        }
      }, 1000);
    };

    recognition.onend = () => {
      // Mantém escutando (chrome para após silêncio prolongado)
      if (enabledRef.current) {
        setTimeout(() => {
          if (enabledRef.current && recognitionRef.current) {
            try { recognitionRef.current.start(); } catch {}
          }
        }, 300);
      }
    };

    try {
      recognition.start();
      setState("listening");
      setError(null);
    } catch (e: any) {
      setState("error");
      setError(e?.message ?? "Erro ao iniciar detecção de voz");
    }
  }, [triggerWake]);

  // ── Picovoice (opcional, local, sem envio de áudio) ─────────────────────────
  const startPicovoice = useCallback(async () => {
    if (!key) { startWebSpeech(); return; }
    try {
      const [porcupineMod, wvpMod]: [any, any] = await Promise.all([
        import("@picovoice/porcupine-web").catch(() => null),
        import("@picovoice/web-voice-processor").catch(() => null),
      ]);
      const PorcupineWorkerFactory =
        porcupineMod?.PorcupineWorkerFactory ?? porcupineMod?.PorcupineWorker ?? null;
      const WebVoiceProcessor = wvpMod?.WebVoiceProcessor ?? null;
      const BuiltInKeyword = porcupineMod?.BuiltInKeyword ?? null;
      if (!PorcupineWorkerFactory || !WebVoiceProcessor) { startWebSpeech(); return; }
      const keyword = BuiltInKeyword?.Computer ?? "Computer";
      const handle = await PorcupineWorkerFactory.create(
        key,
        [{ builtin: keyword, sensitivity: 0.65 }],
        () => triggerWake(),
      );
      porcupineRef.current = handle;
      await WebVoiceProcessor.subscribe(handle);
      setState("listening");
      setError(null);
    } catch (e: any) {
      console.warn("[wake-word] picovoice indisponível, usando Web Speech API", e);
      startWebSpeech();
    }
  }, [key, startWebSpeech, triggerWake]);

  // ── Stop ─────────────────────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    try { recognitionRef.current?.stop(); recognitionRef.current?.abort(); } catch {}
    recognitionRef.current = null;
    try {
      const p = porcupineRef.current;
      if (p) {
        if (typeof p.stop === "function") await p.stop();
        if (typeof p.release === "function") await p.release();
        if (typeof p.terminate === "function") await p.terminate();
      }
    } catch {}
    porcupineRef.current = null;
    setState("off");
  }, []);

  // ── Toggle ───────────────────────────────────────────────────────────────────
  const toggle = useCallback((next?: boolean) => {
    if (!available) return;
    const value = typeof next === "boolean" ? next : !enabled;
    setEnabled(value);
    try { localStorage.setItem(STORAGE_KEY, value ? "1" : "0"); } catch {}
  }, [available, enabled]);

  useEffect(() => {
    if (enabled && available) {
      startPicovoice();
      return () => { stop(); };
    } else {
      stop();
    }
  }, [available, enabled, startPicovoice, stop]);

  return {
    enabled: available && enabled,
    state,
    error,
    toggle,
    supported: true, // Web Speech API como fallback universal
  };
}
