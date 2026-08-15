import { useEffect, useRef } from 'react';

export function CallWaveform({ getAnalyser, active, color = 'hsl(var(--primary))' }: {
  getAnalyser: () => AnalyserNode | null;
  active: boolean;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const analyser = getAnalyser();
      if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (analyser) {
        const bins = analyser.frequencyBinCount;
        const data = new Uint8Array(bins);
        analyser.getByteFrequencyData(data);
        const barCount = 32;
        const step = Math.floor(bins / barCount);
        const bw = w / barCount;
        for (let i = 0; i < barCount; i++) {
          const v = data[i * step] / 255;
          const bh = Math.max(3, v * h * 0.9);
          ctx.fillStyle = color;
          ctx.globalAlpha = active ? 0.55 + v * 0.45 : 0.2;
          ctx.fillRect(i * bw + bw * 0.2, (h - bh) / 2, bw * 0.6, bh);
        }
      } else {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        for (let i = 0; i < 32; i++) {
          const bh = 4 + Math.sin(Date.now() / 300 + i) * 3;
          ctx.fillRect(i * (w / 32) + 2, (h - bh) / 2, (w / 32) - 4, bh);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [getAnalyser, active, color]);

  return <canvas ref={canvasRef} width={480} height={64} className="w-full h-16" />;
}
