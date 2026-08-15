/**
 * Conversão de áudio client-side para um formato que toca em qualquer dispositivo.
 *
 * Problema: o MediaRecorder do Chrome/Firefox/Android grava `audio/webm; codecs=opus`,
 * que o Safari (iPhone/iPad) NÃO consegue decodificar. Resultado: o vendedor abre o
 * Inbox no iPhone e aperta play no próprio áudio → fica mudo.
 *
 * Solução: se o blob não for `audio/mp4` (AAC) nem `audio/mpeg` (MP3), passar pelo
 * ffmpeg.wasm e converter para AAC em container .m4a (`audio/mp4`). Toca em iOS
 * Safari, macOS Safari, Chrome, Firefox, Android e WhatsApp.
 *
 * Reaproveita a mesma instância singleton do ffmpeg que o transcoder de vídeo já
 * carrega — não baixa o core duas vezes.
 */

import { loadFFmpeg } from './videoTranscode';

const MAX_AUDIO_BYTES = 60 * 1024 * 1024; // 60 MB de entrada (>20 min de voz)

export interface AudioTranscodeOptions {
  onProgress?: (percent: number) => void;
}

export class AudioTranscodeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Retorna true se o navegador já gravar áudio num formato que o Safari toca
 * (AAC dentro de .m4a). Nesse caso não precisa transcodificar.
 */
export function pickBestRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  // Ordem de preferência: AAC (universal) → opus (precisa transcodificar depois).
  const candidates = [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function isUniversallyPlayable(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (type.startsWith('audio/mp4') || type === 'audio/aac' || type === 'audio/m4a') return true;
  if (type === 'audio/mpeg' || type === 'audio/mp3') return true;
  if (ext === 'm4a' || ext === 'aac' || ext === 'mp3' || ext === 'mp4') return true;
  return false;
}

/**
 * Converte qualquer áudio para .m4a (AAC) usando ffmpeg.wasm.
 * Se já estiver num formato universal, devolve o arquivo intacto.
 */
export async function ensureUniversalAudio(
  file: File,
  opts: AudioTranscodeOptions = {},
): Promise<File> {
  // Não é áudio? deixa passar.
  if (!file.type.startsWith('audio/') && !/\.(webm|ogg|oga|opus|mp3|m4a|aac|wav|mp4)$/i.test(file.name)) {
    return file;
  }

  if (isUniversallyPlayable(file)) {
    opts.onProgress?.(100);
    return file;
  }

  if (file.size > MAX_AUDIO_BYTES) {
    throw new AudioTranscodeError(
      'TOO_LARGE',
      `Áudio muito grande para conversão (máx ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB).`,
    );
  }

  opts.onProgress?.(2);
  let ff;
  try {
    ff = await loadFFmpeg();
  } catch (err: any) {
    throw new AudioTranscodeError('FFMPEG_LOAD', err?.message || 'Falha ao carregar conversor de áudio.');
  }

  const inExt = (file.name.split('.').pop() || 'webm').toLowerCase().replace(/[^a-z0-9]/g, '') || 'webm';
  const inputName = `in_${Date.now()}.${inExt}`;
  const outputName = `out_${Date.now()}.m4a`;

  const progressHandler = (e: { progress: number }) => {
    // ffmpeg.wasm às vezes reporta valores fora de 0-1; clampa.
    const p = Math.max(0, Math.min(1, e.progress || 0));
    opts.onProgress?.(5 + Math.round(p * 90));
  };

  try {
    const { fetchFile } = await import('@ffmpeg/util');
    await ff.writeFile(inputName, await fetchFile(file));
    try { ff.on('progress', progressHandler as any); } catch { /* ignore */ }

    // Áudio de voz: AAC 64kbps mono 44.1kHz fica ~480KB/min.
    await ff.exec([
      '-i', inputName,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '64k',
      '-ar', '44100',
      '-ac', '1',
      '-movflags', '+faststart',
      outputName,
    ]);

    const data = await ff.readFile(outputName);
    const ab = (data as Uint8Array).buffer.slice(
      (data as Uint8Array).byteOffset,
      (data as Uint8Array).byteOffset + (data as Uint8Array).byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([ab], { type: 'audio/mp4' });

    const baseName = (file.name.replace(/\.[^.]+$/, '') || 'audio') + '.m4a';
    const out = new File([blob], baseName, { type: 'audio/mp4', lastModified: Date.now() });

    opts.onProgress?.(100);
    return out;
  } catch (err: any) {
    throw new AudioTranscodeError('TRANSCODE_FAIL', err?.message || 'Falha ao converter áudio.');
  } finally {
    try { ff.off('progress', progressHandler as any); } catch { /* ignore */ }
    try { await ff.deleteFile(inputName); } catch { /* ignore */ }
    try { await ff.deleteFile(outputName); } catch { /* ignore */ }
  }
}
