import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, RotateCcw, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TARGET_SAMPLE_RATE = 16000;
const MAX_SECONDS = 120;
const MIN_SECONDS = 30;

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}

function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate === inRate) return input;
  const ratio = inRate / outRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  let o = 0;
  let i = 0;
  while (o < out.length) {
    const next = Math.floor((o + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (; i < next && i < input.length; i++) {
      sum += input[i];
      count++;
    }
    out[o++] = count ? sum / count : 0;
  }
  return out;
}

export function VoiceCloneRecorder({ onReady }: { onReady: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [starting, setStarting] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { cleanup(); if (preview) URL.revokeObjectURL(preview.url); }, []);

  const cleanup = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { nodeRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { ctxRef.current?.close(); } catch {}
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
  };

  const start = async () => {
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      node.onaudioprocess = (e) => {
        chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(node);
      node.connect(ctx.destination);
      sourceRef.current = source;
      nodeRef.current = node;
      startTimeRef.current = Date.now();
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 200);
    } catch (e) {
      toast.error(`Microfone: ${(e as Error).message}`);
    } finally {
      setStarting(false);
    }
  };

  const stop = () => {
    if (!ctxRef.current) return;
    const inRate = ctxRef.current.sampleRate;
    const total = chunksRef.current.reduce((a, c) => a + c.length, 0);
    const merged = new Float32Array(total);
    let o = 0;
    for (const c of chunksRef.current) { merged.set(c, o); o += c.length; }
    const down = downsample(merged, inRate, TARGET_SAMPLE_RATE);
    const blob = encodeWav(down, TARGET_SAMPLE_RATE);
    cleanup();
    setRecording(false);
    if (blob.size < 2048) {
      toast.error('Gravação muito curta ou vazia. Tente novamente.');
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreview({ url, blob });
  };

  const accept = () => {
    if (!preview) return;
    const file = new File([preview.blob], `gravacao-${Date.now()}.wav`, { type: 'audio/wav' });
    onReady(file);
    URL.revokeObjectURL(preview.url);
    setPreview(null);
    setSeconds(0);
  };

  const redo = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setSeconds(0);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const pct = Math.min(100, (seconds / MAX_SECONDS) * 100);
  const barColor = seconds < MIN_SECONDS ? 'bg-muted-foreground/50' : seconds >= MAX_SECONDS ? 'bg-destructive' : 'bg-green-500';
  const hint = seconds < MIN_SECONDS
    ? `Grave pelo menos ${MIN_SECONDS}s (ideal 90–120s)`
    : seconds >= MAX_SECONDS
      ? 'Limite de 120s atingido'
      : 'Duração ideal — continue até 90–120s se possível';

  if (preview) {
    return (
      <div className="rounded-md border p-3 space-y-2 bg-muted/30">
        <div className="text-xs font-medium">Prévia da gravação</div>
        <audio src={preview.url} controls className="w-full h-9" />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={redo}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Regravar
          </Button>
          <Button size="sm" onClick={accept}>
            <Check className="mr-1.5 h-3.5 w-3.5" /> Usar essa gravação
          </Button>
        </div>
      </div>
    );
  }

  if (recording) {
    return (
      <div className="rounded-md border p-3 space-y-2 bg-destructive/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            Gravando… {mm}:{ss}
          </div>
          <Button size="sm" variant="destructive" onClick={stop}>
            <Square className="mr-1.5 h-3.5 w-3.5" /> Parar
          </Button>
        </div>
        <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={start} disabled={starting}>
      {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
      Gravar agora
    </Button>
  );
}
