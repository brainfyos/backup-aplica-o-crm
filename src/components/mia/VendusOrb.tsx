// VendusOrb — bolinha flutuante da Mia. Discreta, viva, não-intrusiva.
// Fica no canto inferior direito (desktop) ou inferior central (mobile).
// Reage ao áudio do microfone em tempo real via Web Audio API.
// Visual: esfera branca perolada · aura verde neon · raios · "V" central.
// Estados: dormindo → ouvindo wake word → ativando → ouvindo → pensando → respondendo.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MiaStatus } from "@/hooks/useMiaSession";
import type { WakeWordState } from "@/hooks/useMiaWakeWord";

// ── Props ─────────────────────────────────────────────────────────────────────

interface VendusOrbProps {
  status:       MiaStatus;
  wakeState:    WakeWordState;
  active:       boolean;
  micStreamRef: React.RefObject<MediaStream | null>;
  onOpenChat:   () => void; // clique → abre o chat principal da Mia
}

// ── CSS keyframes (inline, prefixados, sem conflito) ──────────────────────────

const STYLES = `
@keyframes vorb-pulse {
  0%,100% { transform:scale(1); filter:brightness(1); }
  50%      { transform:scale(1.055); filter:brightness(1.2); }
}
@keyframes vorb-spin {
  from { transform:rotate(0deg); }
  to   { transform:rotate(360deg); }
}
@keyframes vorb-inner-glow {
  0%,100% { opacity:0.65; transform:scale(1); }
  50%     { opacity:1;    transform:scale(1.06); }
}
@keyframes vorb-ray {
  0%,100% { opacity:0.18; height:44px; }
  50%     { opacity:0.9;  height:78px; }
}
@keyframes vorb-particle {
  0%,100% { transform:translateY(0) scale(1);    opacity:0.5; }
  50%     { transform:translateY(-11px) scale(1.3); opacity:1; }
}
@keyframes vorb-flash {
  0%   { box-shadow:0 0 20px rgba(67,255,93,.6); }
  40%  { box-shadow:0 0 90px rgba(67,255,93,1), 0 0 180px rgba(67,255,93,.5); }
  100% { box-shadow:0 0 30px rgba(67,255,93,.7); }
}
@keyframes vorb-appear {
  from { opacity:0; transform:scale(0.85) translateY(6px); }
  to   { opacity:1; transform:scale(1) translateY(0); }
}
@keyframes vorb-wake-ring {
  0%   { transform:scale(1);   opacity:0.9; }
  100% { transform:scale(2.2); opacity:0;   }
}
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function g(r: number, gr: number, gb: number, a: number) {
  return `rgba(${r},${gr},${gb},${a})`;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function VendusOrb({ status, wakeState, active, micStreamRef, onOpenChat }: VendusOrbProps) {
  const orbEl       = useRef<HTMLDivElement>(null);
  const rafRef      = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef   = useRef<MediaStreamAudioSourceNode | null>(null);
  const ampRef      = useRef(0);
  const [tip, setTip] = useState(false);

  // ── Tamanho por estado ─────────────────────────────────────────────────────

  const SIZE = (() => {
    if (wakeState === "detected")                          return 80;
    if (active)                                            return 68;
    if (wakeState === "listening")                         return 52;
    return 44; // dormindo
  })();

  const OPACITY = wakeState === "off" && !active ? 0.5 : 1;

  // ── Duração do pulso ───────────────────────────────────────────────────────

  const PULSE = (() => {
    if (status === "listening")                return "0.65s";
    if (status === "speaking")                 return "0.5s";
    if (status === "thinking")                 return "1.3s";
    if (wakeState === "detected")              return "0.5s";
    if (wakeState === "listening" && !active)  return "3s";
    return "2.6s"; // dormindo
  })();

  // ── Cor (verde normal / vermelho erro) ────────────────────────────────────

  const isError = status === "error";
  const CR = isError ? 255 : 67;
  const CG = isError ? 60  : 255;
  const CB = isError ? 60  : 93;

  // ── Tooltip ────────────────────────────────────────────────────────────────

  const LABEL = (() => {
    if (!active && wakeState === "off")        return 'Abrir chat da Mia';
    if (!active && wakeState === "listening")  return 'Abrir chat · ou diga "Olá Mia"';
    if (wakeState === "detected")              return 'Ativando Mia…';
    if (status === "connecting")               return 'Conectando…';
    if (status === "listening")                return 'Ouvindo você…';
    if (status === "thinking")                 return 'Pensando…';
    if (status === "speaking")                 return 'Respondendo…';
    if (status === "error")                    return 'Mia desconectada · abrir chat';
    return 'Mia ativa · abrir chat';
  })();

  // ── Conecta microfone ao analyser ─────────────────────────────────────────

  useEffect(() => {
    const stream = micStreamRef.current;
    if (!active || !stream) {
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current = null;
      return;
    }
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume().catch(() => {});
      const an = audioCtxRef.current.createAnalyser();
      an.fftSize = 32;
      an.smoothingTimeConstant = 0.75;
      sourceRef.current?.disconnect();
      const src = audioCtxRef.current.createMediaStreamSource(stream);
      src.connect(an);
      analyserRef.current = an;
      sourceRef.current = src;
    } catch { /* animação continua sem o analisador de áudio */ }
    return () => {
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current = null;
    };
  }, [active, micStreamRef]);

  // ── Loop de animação (audio-reactive glow) ─────────────────────────────────

  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;

      if (analyserRef.current && (status === "listening" || status === "speaking")) {
        const d = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(d);
        ampRef.current = d.reduce((a, b) => a + b, 0) / d.length / 255;
      } else {
        ampRef.current = Math.max(0, ampRef.current - 0.04);
      }

      const amp = ampRef.current;
      const el  = orbEl.current;
      if (el && amp > 0.01) {
        const base = SIZE * 0.13;
        const glow = base + amp * SIZE * 0.8;
        el.style.boxShadow = [
          `0 0 ${glow}px      ${g(CR,CG,CB,0.75)}`,
          `0 0 ${glow*1.8}px  ${g(CR,CG,CB,0.45)}`,
          `0 0 ${glow*3}px    ${g(CR,CG,CB,0.28)}`,
          `inset 0 0 18px rgba(255,255,255,0.95)`,
          `inset 0 -${SIZE*.13}px ${SIZE*.23}px ${g(CR,CG,CB,0.25)}`,
        ].join(", ");
      } else if (el) {
        el.style.boxShadow = "";
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [status, SIZE, CR, CG, CB]);

  // ── Medidas derivadas ──────────────────────────────────────────────────────

  const CORE      = SIZE * 0.41;
  const RAY_W     = Math.max(2, SIZE * 0.033);
  const RAY_H     = SIZE * 0.5;
  const RAY_DIST  = SIZE * 0.65;
  const RING_INSET = SIZE * 0.1;
  const RING_SPEED = status === "thinking" ? "1.1s" : "2.8s";
  const AURA_INSET = -(SIZE * 0.18);

  const gc = (a: number) => g(CR, CG, CB, a);

  const ORB_SHADOW = [
    `0 0 ${SIZE*.13}px  ${gc(0.55)}`,
    `0 0 ${SIZE*.33}px  ${gc(0.45)}`,
    `0 0 ${SIZE*.63}px  ${gc(0.35)}`,
    `inset 0 0 18px rgba(255,255,255,0.95)`,
    `inset 0 -${SIZE*.13}px ${SIZE*.23}px ${gc(0.22)}`,
  ].join(", ");

  const CORE_BG = isError
    ? "radial-gradient(circle, #ff6060 0%, #8e1414 42%, #1a0303 100%)"
    : "radial-gradient(circle, #60ff76 0%, #0e7e25 42%, #031a08 100%)";

  const PARTICLES: { top?:number; left?:number; right?:number; bottom?:number; r:number; delay:number }[] = [
    { top: SIZE*.05,  left:  SIZE*.28,  r: SIZE*.047, delay: 0    },
    { top: SIZE*.25,  right: -(SIZE*.01),r: SIZE*.047, delay: 0.4  },
    { bottom: SIZE*.09, right: SIZE*.23, r: SIZE*.047, delay: 0.8  },
    { bottom: SIZE*.23, left: -(SIZE*.03),r: SIZE*.047, delay: 1.2 },
    { top: -(SIZE*.05), right: SIZE*.32, r: SIZE*.033, delay: 1.6  },
  ];

  return createPortal(
    <>
      {/* Keyframes — uma única tag, sem duplicar */}
      <style id="vendus-orb-styles">{STYLES}</style>

      {/* Container fixo */}
      <div
        style={{
          position:   "fixed",
          bottom:     "max(24px, env(safe-area-inset-bottom, 24px))",
          right:      24,
          zIndex:     9990,
          display:    "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap:        8,
          pointerEvents: "none", // wrapper não bloqueia cliques abaixo
        }}
      >
        {/* Tooltip */}
        {tip && (
          <div style={{
            pointerEvents: "none",
            background:    "rgba(5,10,5,0.92)",
            color:         "rgba(255,255,255,0.92)",
            padding:       "6px 12px",
            borderRadius:  8,
            fontSize:      12,
            fontFamily:    "system-ui, sans-serif",
            whiteSpace:    "nowrap",
            backdropFilter:"blur(8px)",
            border:        `1px solid ${gc(0.4)}`,
            boxShadow:     "0 4px 20px rgba(0,0,0,0.5)",
            animation:     "vorb-appear 0.15s ease",
          }}>
            {LABEL}
          </div>
        )}

        {/* Orb wrapper */}
        <div
          onClick={onOpenChat}
          onMouseEnter={() => setTip(true)}
          onMouseLeave={() => setTip(false)}
          style={{
            pointerEvents: "auto",
            width:    SIZE + 40,
            height:   SIZE + 40,
            position: "relative",
            display:  "flex",
            alignItems:      "center",
            justifyContent:  "center",
            cursor:          "pointer",
            opacity:         OPACITY,
            transition:      "width 0.45s ease, height 0.45s ease, opacity 0.45s ease",
            userSelect:      "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {/* Anel de expansão ao acordar */}
          {wakeState === "detected" && (
            <div style={{
              position:     "absolute",
              width:        SIZE,
              height:       SIZE,
              borderRadius: "50%",
              border:       `2px solid ${gc(0.9)}`,
              animation:    "vorb-wake-ring 0.8s ease-out forwards",
              pointerEvents:"none",
            }} />
          )}

          {/* Orb principal */}
          <div
            ref={orbEl}
            style={{
              width:        SIZE,
              height:       SIZE,
              position:     "relative",
              borderRadius: "50%",
              background:   "radial-gradient(circle at 35% 25%, #ffffff 0%, #f7fff8 28%, #dfffe5 52%, #8dff9f 100%)",
              boxShadow:    ORB_SHADOW,
              animation:    `vorb-pulse ${PULSE} ease-in-out infinite${wakeState === "detected" ? ", vorb-flash 0.8s ease-out" : ""}`,
              transition:   "width 0.45s ease, height 0.45s ease",
              flexShrink:   0,
              zIndex:       1,
            }}
          >
            {/* Aura conic girando */}
            <div style={{
              position:     "absolute",
              inset:        AURA_INSET,
              borderRadius: "50%",
              background:   `conic-gradient(from 0deg, transparent, ${gc(0.22)}, transparent, ${gc(0.42)}, transparent)`,
              filter:       "blur(10px)",
              animation:    "vorb-spin 5s linear infinite",
              zIndex:       -1,
            }} />

            {/* Anel interno */}
            <div style={{
              position:     "absolute",
              inset:        RING_INSET,
              borderRadius: "50%",
              border:       `1px solid ${gc(0.45)}`,
              boxShadow:    `inset 0 0 20px ${gc(0.25)}, 0 0 18px ${gc(0.35)}`,
              animation:    "vorb-inner-glow 2s ease-in-out infinite",
            }} />

            {/* Raios */}
            {[35, 125, 215, 305].map((angle, i) => (
              <span key={i} style={{
                position:      "absolute",
                width:         RAY_W,
                height:        RAY_H,
                left:          "50%",
                top:           "50%",
                transformOrigin: "center -10px",
                borderRadius:  999,
                background:    `linear-gradient(to top, ${gc(0)}, ${gc(0.85)}, rgba(255,255,255,0))`,
                filter:        "blur(1px)",
                opacity:       0.65,
                animation:     `vorb-ray 1.8s ease-in-out ${i * 0.25}s infinite`,
                zIndex:        -2,
                transform:     `translate(-50%, -50%) rotate(${angle}deg) translateY(-${RAY_DIST}px)`,
              }} />
            ))}

            {/* Partículas */}
            {PARTICLES.map((p, i) => (
              <span key={i} style={{
                position:     "absolute",
                width:        p.r,
                height:       p.r,
                borderRadius: "50%",
                background:   "#ffffff",
                boxShadow:    `0 0 8px rgba(255,255,255,0.9), 0 0 18px ${gc(0.9)}`,
                opacity:      0.85,
                animation:    `vorb-particle 3s ease-in-out ${p.delay}s infinite`,
                top:          p.top,
                left:         p.left,
                right:        p.right,
                bottom:       p.bottom,
              }} />
            ))}

            {/* Core central */}
            <div style={{
              width:        CORE,
              height:       CORE,
              position:     "absolute",
              inset:        0,
              margin:       "auto",
              borderRadius: "50%",
              background:   CORE_BG,
              boxShadow:    `0 0 18px ${gc(0.95)}, 0 0 42px ${gc(0.55)}, inset 0 0 14px rgba(255,255,255,0.4)`,
              display:      "flex",
              alignItems:   "center",
              justifyContent:"center",
              zIndex:       3,
            }}>
              {/* Anel girando ao redor do core */}
              <div style={{
                position:     "absolute",
                inset:        -(SIZE * 0.053),
                borderRadius: "50%",
                border:       `2px solid ${gc(0.55)}`,
                borderTopColor:"rgba(255,255,255,0.9)",
                animation:    `vorb-spin ${RING_SPEED} linear infinite`,
              }} />

              {/* "V" */}
              <span style={{
                fontFamily:  "Arial, Helvetica, sans-serif",
                fontSize:    CORE * 0.55,
                fontWeight:  800,
                lineHeight:  1,
                color:       "#ffffff",
                textShadow:  `0 0 8px rgba(255,255,255,0.9), 0 0 18px ${gc(1)}`,
                transform:   "scaleX(1.08)",
                display:     "block",
                userSelect:  "none",
              }}>
                V
              </span>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
