// MiaOrb — overlay visual estilo Siri.
// Aparece quando a Mia é ativada (wake word ou botão), some quando encerrada.
// Canvas com blob orgânico + waveform reativo ao microfone (Web Audio API).

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Mic, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MiaStatus } from "@/hooks/useMiaSession";
import type { WakeWordState } from "@/hooks/useMiaWakeWord";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface MiaOrbProps {
  status: MiaStatus;
  wakeState: WakeWordState;
  active: boolean;
  micStreamRef: React.RefObject<MediaStream | null>;
  onStop: () => void;
}

// ── Paleta de cores por estado ─────────────────────────────────────────────────

const PALETTE: Record<MiaStatus, { a: string; b: string; c: string; shadow: string }> = {
  idle:       { a: "#6366f1", b: "#8b5cf6", c: "#4f46e5", shadow: "rgba(99,102,241,0.6)"  },
  connecting: { a: "#f59e0b", b: "#fbbf24", c: "#d97706", shadow: "rgba(251,191,36,0.5)"  },
  listening:  { a: "#3b82f6", b: "#60a5fa", c: "#2563eb", shadow: "rgba(59,130,246,0.7)"  },
  thinking:   { a: "#f97316", b: "#fb923c", c: "#ea580c", shadow: "rgba(249,115,22,0.6)"  },
  speaking:   { a: "#10b981", b: "#34d399", c: "#059669", shadow: "rgba(16,185,129,0.7)"  },
  error:      { a: "#ef4444", b: "#f87171", c: "#dc2626", shadow: "rgba(239,68,68,0.5)"   },
};

const STATUS_LABEL: Record<MiaStatus, string> = {
  idle:       "Pronta",
  connecting: "Conectando…",
  listening:  "Ouvindo você…",
  thinking:   "Pensando…",
  speaking:   "Respondendo…",
  error:      "Desconectada",
};

// ── Helpers de canvas ──────────────────────────────────────────────────────────

/** Converte hex "#rrggbb" + alpha 0-1 → "rgba(r,g,b,a)" */
function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Desenha o blob orgânico central */
function drawBlob(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  baseR: number,
  phase: number,
  amplitude: number,
  freqData: Uint8Array | null,
  status: MiaStatus,
  pal: typeof PALETTE[MiaStatus],
  dpr: number,
) {
  const pts = 140;
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const ang = (i / pts) * Math.PI * 2;
    let r = baseR;

    if (freqData && status === "listening") {
      // Waveform real do microfone
      const bin = Math.floor((i / pts) * freqData.length * 0.6);
      r += (freqData[bin] / 255) * baseR * 1.1;
    } else {
      // Blob procedural para outros estados
      r += Math.sin(ang * 3 + phase * 2.2) * baseR * amplitude * 0.50;
      r += Math.sin(ang * 5 - phase * 1.7) * baseR * amplitude * 0.30;
      r += Math.sin(ang * 7 + phase * 3.4) * baseR * amplitude * 0.16;
      r += Math.sin(ang * 11 - phase * 4.2) * baseR * amplitude * 0.08;
    }

    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const grad = ctx.createRadialGradient(
    cx - baseR * 0.28, cy - baseR * 0.28, 0,
    cx, cy, baseR * (1.6 + amplitude * 0.5),
  );
  grad.addColorStop(0,   hexAlpha(pal.b, 1.0));
  grad.addColorStop(0.4, hexAlpha(pal.a, 0.9));
  grad.addColorStop(1,   hexAlpha(pal.c, 0.3));

  ctx.shadowColor = pal.shadow;
  ctx.shadowBlur  = (40 + amplitude * 80) * dpr;
  ctx.fillStyle   = grad;
  ctx.fill();
  ctx.shadowBlur  = 0;

  // Realce especular (highlight de luz)
  const spec = ctx.createRadialGradient(
    cx - baseR * 0.32, cy - baseR * 0.35, 0,
    cx - baseR * 0.1,  cy - baseR * 0.1,  baseR * 0.9,
  );
  spec.addColorStop(0, "rgba(255,255,255,0.30)");
  spec.addColorStop(1, "transparent");
  ctx.beginPath();
  ctx.arc(cx, cy, baseR * (1.1 + amplitude * 0.2), 0, Math.PI * 2);
  ctx.fillStyle = spec;
  ctx.fill();
}

/** Desenha os anéis de waveform ao redor do blob */
function drawRings(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  baseR: number,
  phase: number,
  amplitude: number,
  freqData: Uint8Array | null,
  status: MiaStatus,
  pal: typeof PALETTE[MiaStatus],
  dpr: number,
) {
  const ringCount = 3;
  for (let ring = 0; ring < ringCount; ring++) {
    const ringR = baseR * (1.55 + ring * 0.35 + amplitude * 0.7);
    const alpha = 0.45 - ring * 0.13;

    ctx.beginPath();
    const pts = 90;
    for (let i = 0; i <= pts; i++) {
      const ang = (i / pts) * Math.PI * 2;
      let r = ringR;

      if (freqData && status === "listening") {
        const bin = Math.floor((i / pts) * freqData.length * 0.5);
        r += (freqData[bin] / 255) * baseR * (0.7 - ring * 0.18);
      } else {
        r += Math.sin(ang * (3 + ring) + phase * (1.6 + ring * 0.4)) * baseR * amplitude * (0.45 - ring * 0.1);
        r += Math.sin(ang * (6 + ring * 2) - phase * (2.1 + ring * 0.3)) * baseR * amplitude * 0.22;
      }

      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = hexAlpha(pal.a, alpha);
    ctx.lineWidth   = Math.max(1, (2.2 - ring * 0.55) * dpr);
    ctx.stroke();
  }
}

/** Glow difuso de fundo */
function drawGlow(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  cx: number, cy: number,
  baseR: number,
  amplitude: number,
  pal: typeof PALETTE[MiaStatus],
) {
  const glowR = baseR * (3.5 + amplitude * 2.5);
  const g = ctx.createRadialGradient(cx, cy, baseR * 0.3, cx, cy, glowR);
  g.addColorStop(0,   hexAlpha(pal.a, 0.35));
  g.addColorStop(0.4, hexAlpha(pal.a, 0.12));
  g.addColorStop(1,   "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function MiaOrb({ status, wakeState, active, micStreamRef, onStop }: MiaOrbProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const animRef      = useRef<number>(0);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const sourceRef    = useRef<MediaStreamAudioSourceNode | null>(null);
  const phaseRef     = useRef(0);
  const connectedRef = useRef<MediaStream | null>(null);

  // ── Conecta mic ao Web Audio analyser ───────────────────────────────────────
  useEffect(() => {
    const stream = micStreamRef.current;

    if (!active || !stream) {
      sourceRef.current?.disconnect();
      sourceRef.current    = null;
      analyserRef.current  = null;
      connectedRef.current = null;
      return;
    }

    // Evita reconectar o mesmo stream
    if (connectedRef.current === stream) return;

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;

      sourceRef.current?.disconnect();
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      // NÃO conecta ao destination — microfone permanece silencioso localmente

      analyserRef.current  = analyser;
      sourceRef.current    = source;
      connectedRef.current = stream;
    } catch (e) {
      // AudioContext pode falhar sem gesto do usuário — animação procedural continua funcionando
      console.warn("[MiaOrb] audio analyser não disponível:", e);
    }

    return () => {
      sourceRef.current?.disconnect();
      sourceRef.current    = null;
      analyserRef.current  = null;
      connectedRef.current = null;
    };
  }, [active, micStreamRef]);

  // ── Loop de animação ─────────────────────────────────────────────────────────
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { animRef.current = requestAnimationFrame(animate); return; }

    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W    = rect.width  * dpr;
    const H    = rect.height * dpr;

    if (canvas.width !== W || canvas.height !== H) {
      canvas.width  = W;
      canvas.height = H;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) { animRef.current = requestAnimationFrame(animate); return; }

    ctx.clearRect(0, 0, W, H);
    phaseRef.current += 0.038;
    const phase = phaseRef.current;

    const cx    = W / 2;
    const cy    = H / 2;
    const baseR = Math.min(W, H) * 0.20;
    const pal   = PALETTE[status] ?? PALETTE.idle;

    // Dados do mic
    let freqData: Uint8Array | null = null;
    let avgAmp = 0;
    if (analyserRef.current) {
      freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);
      avgAmp = freqData.reduce((a, b) => a + b, 0) / freqData.length / 255;
    }

    // Amplitude por estado
    let amplitude = avgAmp;
    switch (status) {
      case "speaking":
        amplitude = Math.max(avgAmp, 0.28 + Math.sin(phase * 2.4) * 0.14 + Math.sin(phase * 4.3) * 0.08 + Math.sin(phase * 7.1) * 0.04);
        break;
      case "thinking":
        amplitude = 0.10 + Math.sin(phase * 1.9) * 0.05 + Math.sin(phase * 3.1) * 0.02;
        break;
      case "connecting":
        amplitude = 0.08 + Math.abs(Math.sin(phase * 3.2)) * 0.08;
        break;
      case "idle":
        amplitude = 0.04 + Math.abs(Math.sin(phase * 0.9)) * 0.02;
        break;
      case "listening":
        amplitude = Math.max(avgAmp, 0.06);
        break;
    }

    // Renderização em camadas
    drawGlow(ctx, W, H, cx, cy, baseR, amplitude, pal);

    if (status === "listening" || status === "speaking") {
      drawRings(ctx, cx, cy, baseR, phase, amplitude, freqData, status, pal, dpr);
    }

    drawBlob(ctx, cx, cy, baseR, phase, amplitude, freqData, status, pal, dpr);

    animRef.current = requestAnimationFrame(animate);
  }, [status]);

  useEffect(() => {
    if (!active && wakeState !== "detected") {
      cancelAnimationFrame(animRef.current);
      return;
    }
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [active, wakeState, animate]);

  // ── Visibilidade ─────────────────────────────────────────────────────────────
  const visible = active || wakeState === "detected";
  if (!visible) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex flex-col",
        "transition-opacity duration-700 ease-in-out",
        visible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
      style={{ background: "rgba(4,4,12,0.82)", backdropFilter: "blur(10px)" }}
    >
      {/* Canvas cobre toda a tela com blend screen (fundo escuro + glow colorido) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ mixBlendMode: "screen" }}
      />

      {/* Borda brilhante sutil (efeito iPhone/Siri) */}
      <div
        className={cn(
          "absolute inset-0 pointer-events-none rounded-none",
          "transition-opacity duration-500",
        )}
        style={{
          boxShadow: `inset 0 0 0 1.5px ${PALETTE[status]?.a ?? "#6366f1"}44`,
        }}
      />

      {/* Botão fechar */}
      <button
        onClick={onStop}
        className="absolute top-5 right-5 z-10 p-2.5 rounded-full
                   text-white/40 hover:text-white/90
                   bg-white/5 hover:bg-white/10
                   transition-all duration-200"
        title="Encerrar Mia"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Logo / nome no topo */}
      <div className="absolute top-6 left-6 z-10 flex items-center gap-2">
        <Zap className="h-4 w-4 text-white/30" />
        <span className="text-white/30 text-sm font-medium tracking-widest uppercase">Mia</span>
      </div>

      {/* Status no rodapé */}
      <div className="absolute bottom-0 inset-x-0 z-10 flex flex-col items-center pb-12 gap-3">
        <div className="flex items-center gap-2 text-white/60 text-sm font-medium tracking-widest uppercase">
          {status === "connecting" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {status === "listening"  && <Mic      className="h-3.5 w-3.5 animate-pulse" />}
          <span>{STATUS_LABEL[status]}</span>
        </div>

        {(status === "idle" || status === "listening") && (
          <p className="text-white/25 text-xs tracking-wide">
            Fale com a Mia · Diga <strong className="text-white/40">"encerrar"</strong> para fechar
          </p>
        )}

        {/* Indicador de atividade — barrinhas animadas (ativo apenas em listening/speaking) */}
        {(status === "listening" || status === "speaking") && (
          <div className="flex items-end gap-1 h-6">
            {[0.4, 0.7, 1.0, 0.7, 0.5, 0.8, 0.6, 1.0, 0.4, 0.9, 0.7, 0.5].map((h, i) => (
              <div
                key={i}
                className="w-0.5 rounded-full"
                style={{
                  height:      `${h * 100}%`,
                  background:  PALETTE[status].a,
                  opacity:     0.7,
                  animation:   `mia-bar ${0.5 + (i % 4) * 0.15}s ease-in-out ${i * 0.07}s infinite alternate`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Keyframes inline — evita dependência de CSS global */}
      <style>{`
        @keyframes mia-bar {
          from { transform: scaleY(0.2); opacity: 0.4; }
          to   { transform: scaleY(1.0); opacity: 0.85; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
