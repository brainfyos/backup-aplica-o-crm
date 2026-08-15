/**
 * Conversão de vídeo client-side para WhatsApp/Evolution (precisa `video/mp4` H.264+AAC).
 *
 * Estratégia:
 *  - Já é mp4? devolve intacto.
 *  - Tenta `remux` (-c copy) — rápido, sem reencode (cobre .mov H.264+AAC).
 *  - Fallback: transcode H.264+AAC com parâmetros adaptativos para caber em <25MB.
 *
 * ffmpeg.wasm carrega sob demanda com fallback de CDN (jsdelivr → unpkg → esm.sh)
 * e retry com backoff para tolerar falhas intermitentes (especialmente no Safari iOS).
 */

import type { FFmpeg } from '@ffmpeg/ffmpeg';

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB de entrada
const MAX_VIDEO_DURATION_SEC = 240; // 4 min

const FFMPEG_CORE_VERSION = '0.12.10';
const CDN_BASES = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`,
  `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`,
  `https://esm.sh/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`,
];

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function fetchWithRetry(url: string, mimeType: string, attempts = 2): Promise<string> {
  const { toBlobURL } = await import('@ffmpeg/util');
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await toBlobURL(url, mimeType);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ff = new FFmpeg();

    const errors: string[] = [];
    for (const base of CDN_BASES) {
      try {
        const [coreURL, wasmURL] = await Promise.all([
          fetchWithRetry(`${base}/ffmpeg-core.js`, 'text/javascript'),
          fetchWithRetry(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        ]);
        await ff.load({ coreURL, wasmURL });
        ffmpegInstance = ff;
        return ff;
      } catch (err: any) {
        errors.push(`${base}: ${err?.message || err}`);
      }
    }
    throw new Error(`Falha ao carregar ffmpeg de todos os CDNs. ${errors.join(' | ')}`);
  })();

  try {
    return await ffmpegLoadPromise;
  } catch (err) {
    ffmpegLoadPromise = null;
    throw err;
  }
}

/** Pré-aquece o conversor (sem bloquear). Útil quando o usuário anexa um vídeo. */
export function prefetchVideoTranscoder(): Promise<void> {
  return loadFFmpeg().then(() => undefined);
}

export interface TranscodeOptions {
  onProgress?: (percent: number) => void;
  onPhase?: (phase: 'loading' | 'remuxing' | 'transcoding' | 'done') => void;
  signal?: AbortSignal;
}

export class VideoTranscodeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(el.duration) ? el.duration : null);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    el.src = url;
  });
}

function isAlreadyMp4(file: File): boolean {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return file.type === 'video/mp4' && ext === 'mp4';
}

export async function ensureWhatsAppCompatibleVideo(
  file: File,
  opts: TranscodeOptions = {},
): Promise<File> {
  if (!file.type.startsWith('video/') && !/\.(mov|mp4|m4v|3gp|mkv|webm|avi)$/i.test(file.name)) {
    return file;
  }

  if (isAlreadyMp4(file)) {
    opts.onPhase?.('done');
    opts.onProgress?.(100);
    return file;
  }

  if (file.size > MAX_VIDEO_BYTES) {
    throw new VideoTranscodeError(
      'TOO_LARGE',
      `Vídeo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`,
    );
  }

  const duration = await probeDuration(file);
  if (duration && duration > MAX_VIDEO_DURATION_SEC) {
    throw new VideoTranscodeError(
      'TOO_LONG',
      `Vídeo muito longo (${Math.round(duration)}s). Limite: ${MAX_VIDEO_DURATION_SEC}s.`,
    );
  }

  opts.onPhase?.('loading');
  opts.onProgress?.(1);

  let ff: FFmpeg;
  try {
    ff = await loadFFmpeg();
  } catch (err: any) {
    const detail = err?.message ? ` (${String(err.message).slice(0, 140)})` : '';
    throw new VideoTranscodeError(
      'FFMPEG_LOAD_FAILED',
      `Não foi possível carregar o conversor de vídeo${detail}. Verifique sua conexão (Wi-Fi/4G) e tente novamente.`,
    );
  }

  if (opts.signal?.aborted) throw new VideoTranscodeError('ABORTED', 'Conversão cancelada.');

  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.min(99, Math.max(1, Math.round(progress * 100)));
    opts.onProgress?.(pct);
  };
  ff.on('progress', progressHandler);

  const inputName =
    'input.' + (file.name.split('.').pop() || 'mov').toLowerCase().replace(/[^a-z0-9]/g, '');
  const outputName = 'output.mp4';

  try {
    const { fetchFile } = await import('@ffmpeg/util');
    await ff.writeFile(inputName, await fetchFile(file));

    if (opts.signal?.aborted) throw new VideoTranscodeError('ABORTED', 'Conversão cancelada.');

    // 1) Fast path: remux
    opts.onPhase?.('remuxing');
    let remuxOk = false;
    try {
      const code = await ff.exec([
        '-i', inputName,
        '-c', 'copy',
        '-movflags', '+faststart',
        '-y',
        outputName,
      ]);
      remuxOk = code === 0;
    } catch {
      remuxOk = false;
    }

    // Se remux gerou arquivo grande demais, reencoda para reduzir.
    if (remuxOk) {
      try {
        const out = await ff.readFile(outputName);
        const size = out instanceof Uint8Array ? out.byteLength : 0;
        if (size > 24 * 1024 * 1024) remuxOk = false;
      } catch { /* segue */ }
    }

    if (!remuxOk) {
      if (opts.signal?.aborted) throw new VideoTranscodeError('ABORTED', 'Conversão cancelada.');
      try { await ff.deleteFile(outputName); } catch {}
      opts.onPhase?.('transcoding');

      // Parâmetros adaptativos: arquivos grandes ou longos ganham downscale + CRF maior.
      const heavy = file.size > 20 * 1024 * 1024 || (duration ?? 0) > 60;
      const crf = heavy ? '30' : '28';
      const vf = heavy
        ? "scale='min(1280,iw)':'-2'"
        : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

      const code = await ff.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', crf,
        '-pix_fmt', 'yuv420p',
        '-vf', vf,
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        '-y',
        outputName,
      ]);
      if (code !== 0) {
        throw new VideoTranscodeError(
          'TRANSCODE_FAILED',
          'Não foi possível converter este vídeo. Tente gravar mais curto ou em qualidade menor.',
        );
      }
    }

    if (opts.signal?.aborted) throw new VideoTranscodeError('ABORTED', 'Conversão cancelada.');

    const data = await ff.readFile(outputName);
    const bytes: Uint8Array =
      data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([ab], { type: 'video/mp4' });

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    const newFile = new File([blob], `${baseName}.mp4`, {
      type: 'video/mp4',
      lastModified: Date.now(),
    });

    opts.onPhase?.('done');
    opts.onProgress?.(100);
    return newFile;
  } finally {
    ff.off('progress', progressHandler);
    try { await ff.deleteFile(inputName); } catch {}
    try { await ff.deleteFile(outputName); } catch {}
  }
}
