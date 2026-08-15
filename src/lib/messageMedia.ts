import type { MediaPayload, MediaKind } from '@/components/seller/inbox/MediaAttachment';

/**
 * Lê `metadata.media` de uma mensagem e devolve um payload normalizado para
 * o componente <MediaAttachment/>. Retorna null se a mensagem não tem mídia.
 *
 * Aceita formatos legados (campos espalhados em metadata.* — audio_url,
 * image_url, etc.) e o formato canônico novo (metadata.media = {...}).
 *
 * Para documentos e outros arquivos, ainda retorna payload mesmo sem `url`
 * (o `DocumentCard` mostra um botão "Baixar arquivo" que refaz o download
 * on-demand via a edge function `whatsapp-media-fetch`).
 */
export function extractMedia(metadata: any): MediaPayload | null {
  if (!metadata || typeof metadata !== 'object') return null;

  // Formato canônico
  if (metadata.media && typeof metadata.media === 'object') {
    const m = metadata.media;
    const kind = m.kind ? normalizeKind(m.kind, m.mime) : (m.mime ? normalizeKind(null, m.mime) : null);
    if (!kind) return null;
    const url = m.url ? String(m.url) : null;
    // Sem URL só faz sentido mostrar card se soubermos ao menos o nome/tipo
    if (!url && !m.filename && !m.mime) return null;
    return {
      kind,
      url,
      mime: m.mime ?? null,
      filename: m.filename ?? null,
      size_bytes: typeof m.size_bytes === 'number' ? m.size_bytes : null,
      duration_ms: typeof m.duration_ms === 'number' ? m.duration_ms : null,
      width: typeof m.width === 'number' ? m.width : null,
      height: typeof m.height === 'number' ? m.height : null,
      caption: m.caption ?? null,
      thumbnail_url: m.thumbnail_url ?? null,
      needs_fetch: !url || m.needs_fetch === true,
    };
  }

  // Formatos legados — tenta achar uma URL conhecida
  const legacy: Array<{ key: string; kind: MediaKind }> = [
    { key: 'audio_url', kind: 'audio' },
    { key: 'image_url', kind: 'image' },
    { key: 'video_url', kind: 'video' },
    { key: 'document_url', kind: 'document' },
    { key: 'file_url', kind: 'document' },
  ];
  for (const { key, kind } of legacy) {
    const url = metadata[key];
    if (typeof url === 'string' && url.startsWith('http')) {
      return {
        kind,
        url,
        mime: metadata.mime || metadata.mimetype || null,
        filename: metadata.filename || metadata.file_name || null,
        size_bytes: metadata.size_bytes ?? metadata.file_size ?? null,
        duration_ms: metadata.duration_ms ?? null,
        caption: metadata.caption ?? null,
        thumbnail_url: metadata.thumbnail_url ?? null,
        needs_fetch: false,
      };
    }
  }

  return null;
}

function normalizeKind(raw: any, mime?: string | null): MediaKind | null {
  const k = String(raw || '').toLowerCase();
  if (k === 'audio' || k === 'image' || k === 'video' || k === 'document' || k === 'sticker') {
    return k;
  }
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime) return 'document';
  return null;
}

/**
 * Adiciona `?download=<filename>` a uma URL pública do Supabase Storage
 * para forçar o CDN a servir com `Content-Disposition: attachment`. Em URLs
 * de outros hosts, retorna a URL original inalterada (o atributo `download`
 * do `<a>` é ignorado em cross-origin sem esse header).
 */
export function appendDownloadParam(url: string | null | undefined, filename?: string | null): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    // Supabase Storage aceita `?download` (com ou sem valor). Aplicamos para
    // qualquer host `supabase.co` ou hosts customizados que sirvam via Storage.
    const isStorage = /supabase\.(co|in|net)$/i.test(u.hostname) || u.pathname.includes('/storage/v1/object/');
    if (!isStorage) return url;
    if (filename) u.searchParams.set('download', filename);
    else if (!u.searchParams.has('download')) u.searchParams.set('download', '');
    return u.toString();
  } catch {
    return url;
  }
}
