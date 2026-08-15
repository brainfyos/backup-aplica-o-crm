import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { MediaKind, MediaPayload } from '@/components/seller/inbox/MediaAttachment';

const BUCKET = 'chat-media';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — alinhado ao limite prático do WhatsApp
const IMAGE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024; // 1.5 MB
const IMAGE_MAX_DIMENSION = 1920;
const IMAGE_JPEG_QUALITY = 0.82;

export interface UploadResult {
  media: MediaPayload;
  path: string;
}

export interface UseMediaUploadReturn {
  upload: (file: File, opts?: { kind?: MediaKind; durationMs?: number }) => Promise<UploadResult>;
  uploadOne: (
    file: File,
    opts?: { kind?: MediaKind; durationMs?: number; onProgress?: (pct: number) => void },
  ) => Promise<UploadResult>;
  isUploading: boolean;
  progress: number;
  error: string | null;
  reset: () => void;
}

function inferKind(file: File, hint?: MediaKind): MediaKind {
  if (hint) return hint;
  const m = file.type;
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

function safeFilename(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

async function probeImage(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function probeMediaDuration(file: File, isVideo: boolean): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const ms = isFinite(el.duration) ? Math.round(el.duration * 1000) : null;
      resolve(ms);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    el.src = url;
  });
}

/**
 * Comprime imagens grandes via canvas. PNG/GIF/WebP transparentes mantêm
 * o tipo original (best effort); JPEG sempre re-encoda em JPEG.
 * Retorna o arquivo original se a compressão falhar ou aumentar o tamanho.
 */
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file; // preserva animação
  if (file.size <= IMAGE_COMPRESS_THRESHOLD) return file;

  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;

    const { width, height } = bitmap;
    const maxSide = Math.max(width, height);
    const scale = maxSide > IMAGE_MAX_DIMENSION ? IMAGE_MAX_DIMENSION / maxSide : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

/**
 * Upload via XHR direto no endpoint REST do Storage para termos progresso real.
 * Equivalente a `supabase.storage.from(BUCKET).upload(path, file)`.
 */
async function uploadViaXHR(
  path: string,
  file: File | Blob,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token =
    data.session?.access_token ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    '';
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${baseUrl}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (apikey) xhr.setRequestHeader('apikey', apikey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', '3600');
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = `Upload falhou (${xhr.status})`;
        try {
          const j = JSON.parse(xhr.responseText);
          if (j?.message) msg = j.message;
        } catch {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Falha de rede durante upload'));
    xhr.ontimeout = () => reject(new Error('Tempo esgotado no upload'));
    xhr.send(file);
  });
}

export function useMediaUpload(): UseMediaUploadReturn {
  const { user, profile } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  const uploadOne = useCallback<UseMediaUploadReturn['uploadOne']>(
    async (file, opts) => {
      if (!file) throw new Error('Arquivo inválido');
      const userId = user?.id;
      if (!userId) throw new Error('Sessão inválida para upload. Faça login novamente.');
      const orgId = profile?.organization_id || '_';

      const kind = inferKind(file, opts?.kind);

      // Compressão client-side para imagens grandes
      let finalFile: File = file;
      if (kind === 'image') {
        finalFile = await compressImageIfNeeded(file);
      } else if (kind === 'video') {
        // Garante mp4/H.264 para WhatsApp/Evolution (.mov iPhone → .mp4)
        const { ensureWhatsAppCompatibleVideo } = await import('@/lib/videoTranscode');
        finalFile = await ensureWhatsAppCompatibleVideo(file, {
          onProgress: (pct) => opts?.onProgress?.(Math.round(pct * 0.5)), // 0..50%
        });
      } else if (kind === 'audio') {
        // Converte webm/opus → m4a/AAC para tocar em iPhone/Safari também.
        try {
          const { ensureUniversalAudio } = await import('@/lib/audioTranscode');
          finalFile = await ensureUniversalAudio(file, {
            onProgress: (pct) => opts?.onProgress?.(Math.round(pct * 0.4)), // 0..40%
          });
        } catch (err) {
          // Conversão é "best-effort": se falhar (CDN bloqueado etc.), envia o
          // áudio original para não bloquear o vendedor. Pode não tocar no Safari,
          // mas o cliente recebe e o admin/desktop conseguem ouvir.
          console.warn('[useMediaUpload] audio transcode falhou, enviando original:', err);
        }
      }

      if (finalFile.size > MAX_BYTES) {
        const msg = `Arquivo muito grande após preparo (máx ${Math.round(MAX_BYTES / 1024 / 1024)}MB).`;
        throw new Error(msg);
      }

      const ext = finalFile.name.includes('.')
        ? finalFile.name.split('.').pop()
        : kind === 'audio'
          ? 'webm'
          : 'bin';
      const baseName = safeFilename(finalFile.name.replace(/\.[^.]+$/, '')) || kind;
      const path = `${orgId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}.${ext}`;

      opts?.onProgress?.(kind === 'video' ? 50 : 1);
      await uploadViaXHR(
        path,
        finalFile,
        finalFile.type || 'application/octet-stream',
        kind === 'video'
          ? (p) => opts?.onProgress?.(50 + Math.round(p * 0.5)) // 50..100%
          : opts?.onProgress,
      );


      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;

      let width: number | null = null;
      let height: number | null = null;
      let durationMs: number | null = opts?.durationMs ?? null;

      if (kind === 'image') {
        const dim = await probeImage(finalFile);
        if (dim) {
          width = dim.width;
          height = dim.height;
        }
      } else if (kind === 'audio' && durationMs == null) {
        durationMs = await probeMediaDuration(finalFile, false);
      } else if (kind === 'video') {
        durationMs = durationMs ?? (await probeMediaDuration(finalFile, true));
      }

      const media: MediaPayload = {
        kind,
        url,
        mime: finalFile.type || null,
        filename: finalFile.name || null,
        size_bytes: finalFile.size,
        duration_ms: durationMs,
        width,
        height,
        caption: null,
        thumbnail_url: null,
      };

      opts?.onProgress?.(100);
      return { media, path };
    },
    [profile?.organization_id, user?.id],
  );

  /** API legada — mantida para callers existentes (Catalog/Schedule/audio). */
  const upload = useCallback<UseMediaUploadReturn['upload']>(
    async (file, opts) => {
      setError(null);
      setIsUploading(true);
      setProgress(5);
      try {
        const r = await uploadOne(file, {
          ...opts,
          onProgress: (p) => setProgress(p),
        });
        setProgress(100);
        return r;
      } catch (e: any) {
        const msg = e?.message || 'Falha no upload.';
        setError(msg);
        throw e;
      } finally {
        setIsUploading(false);
      }
    },
    [uploadOne],
  );

  return { upload, uploadOne, isUploading, progress, error, reset };
}
