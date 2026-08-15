import { forwardRef, useEffect, useRef, useState } from 'react';
import { Play, Pause, Download, FileText, Film, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { appendDownloadParam } from '@/lib/messageMedia';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type MediaKind = 'audio' | 'image' | 'video' | 'document' | 'sticker';

export interface MediaPayload {
  kind: MediaKind;
  url: string | null;
  mime?: string | null;
  filename?: string | null;
  size_bytes?: number | null;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  thumbnail_url?: string | null;
  /** Quando true, a URL não está disponível ainda — o card mostra um botão
   * "Baixar arquivo" que aciona `whatsapp-media-fetch` para refazer o
   * download a partir do WhatsApp e persistir a URL definitiva. */
  needs_fetch?: boolean;
}

interface MediaAttachmentProps {
  media: MediaPayload;
  /** true = vendedor (lado direito, primary). false = visitante (muted). */
  isOwn: boolean;
  /** ID da mensagem — necessário para refetch on-demand quando url é null. */
  messageId?: string;
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function formatDuration(ms?: number | null) {
  if (!ms || ms <= 0) return '0:00';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const MediaAttachment = forwardRef<HTMLDivElement, MediaAttachmentProps>(
  function MediaAttachment({ media, isOwn, messageId }, ref) {
    let content: JSX.Element;
    switch (media.kind) {
      case 'audio':
        content = <AudioPlayer media={media} isOwn={isOwn} />;
        break;
      case 'image':
      case 'sticker':
        content = <ImageViewer media={media} />;
        break;
      case 'video':
        content = <VideoPlayer media={media} />;
        break;
      case 'document':
      default:
        content = <DocumentCard media={media} isOwn={isOwn} messageId={messageId} />;
        break;
    }
    return <div ref={ref}>{content}</div>;
  }
);

/* ───────── Audio (WhatsApp-like) ───────── */

function AudioPlayer({ media, isOwn }: { media: MediaPayload; isOwn: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState((media.duration_ms || 0) / 1000);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setProgress(a.currentTime);
    const onLoaded = () => { if (a.duration && isFinite(a.duration)) setDuration(a.duration); };
    const onEnd = () => { setPlaying(false); setProgress(0); };
    const onErr = () => { setErrored(true); setPlaying(false); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onErr);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else {
      a.play().then(() => setPlaying(true)).catch(() => setErrored(true));
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = Math.max(0, Math.min(duration, pct * duration));
    setProgress(a.currentTime);
  };

  const pct = duration > 0 ? (progress / duration) * 100 : 0;

  // Fallback para áudios .webm/opus em iPhone/Safari (não decodifica nativamente):
  // mostra botão para baixar/abrir em app externo.
  if (errored) {
    return (
      <div className="flex items-center gap-2 w-full max-w-full sm:min-w-[200px] sm:max-w-[280px] py-1">
        {media.url ? (
          <a
            href={appendDownloadParam(media.url, media.filename)}
            rel="noreferrer"
            download={media.filename || 'audio'}

            className={cn(
              'text-xs underline underline-offset-2 hover:opacity-80',
              isOwn ? 'text-primary' : 'text-foreground',
            )}
          >
            Áudio incompatível — baixar para ouvir
          </a>
        ) : (
          <span className="text-xs opacity-70">Áudio indisponível</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 w-full max-w-full sm:min-w-[200px] sm:max-w-[280px] py-1">
      <audio ref={audioRef} preload="metadata">
        <source src={media.url || undefined} type={media.mime || undefined} />
        <source src={media.url || undefined} />
      </audio>
      <button
        onClick={toggle}
        className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors',
          isOwn
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-foreground/10 hover:bg-foreground/15 text-foreground',
        )}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div
          className="h-1 rounded-full cursor-pointer bg-foreground/15"
          onClick={seek}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-75',
              isOwn ? 'bg-primary' : 'bg-foreground/70',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatDuration(progress * 1000)} / {formatDuration(duration * 1000)}
        </span>
      </div>
    </div>
  );
}

/* ───────── Image + Lightbox ───────── */

function ImageViewer({ media }: { media: MediaPayload }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);

  if (!media.url || error) {
    return (
      <div className="flex items-center gap-2 py-1 opacity-70 text-xs">
        <ImageIcon className="h-4 w-4" />
        Imagem indisponível
      </div>
    );
  }

  const downloadHref = appendDownloadParam(media.url, media.filename);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full max-w-full sm:max-w-[280px] rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary -mx-1.5 -mt-0.5"
      >
        <img
          src={media.thumbnail_url || media.url}
          alt={media.caption || 'Imagem enviada'}
          className="w-full h-auto max-h-[280px] object-cover bg-black/5"
          loading="lazy"
          onError={() => setError(true)}
        />
      </button>
      {media.caption && (
        <p className="text-sm mt-1.5 whitespace-pre-wrap break-words">{media.caption}</p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[92vw] max-h-[92vh] p-0 bg-background/95 border-0 [&>button]:hidden">
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-2 right-2 z-10 bg-background/70 hover:bg-background"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-2 right-12 z-10 bg-background/70 hover:bg-background"
              asChild
              aria-label="Baixar"
            >
              <a href={downloadHref} download={media.filename || undefined} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
              </a>
            </Button>
            <img
              src={media.url}
              alt={media.caption || 'Imagem'}
              className="w-full h-auto max-h-[92vh] object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────── Video ───────── */

function VideoPlayer({ media }: { media: MediaPayload }) {
  if (!media.url) {
    return (
      <div className="flex items-center gap-2 py-1 opacity-70 text-xs">
        <Film className="h-4 w-4" />
        Vídeo indisponível
      </div>
    );
  }
  return (
    <div className="w-full max-w-full sm:max-w-[320px]">
      <video
        src={media.url}
        poster={media.thumbnail_url || undefined}
        controls
        preload="metadata"
        className="w-full h-auto max-h-[320px] rounded-lg bg-black"
      >
        <Film className="h-4 w-4" />
      </video>
      {media.caption && (
        <p className="text-sm mt-1.5 whitespace-pre-wrap break-words">{media.caption}</p>
      )}
    </div>
  );
}

/* ───────── Document ───────── */

function DocumentCard({ media, isOwn, messageId }: { media: MediaPayload; isOwn: boolean; messageId?: string }) {
  const [fetching, setFetching] = useState(false);
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  const effectiveUrl = fetchedUrl ?? media.url;
  const name = media.filename || 'documento';
  const meta = [
    media.mime?.split('/')?.[1]?.toUpperCase(),
    formatBytes(media.size_bytes),
  ].filter(Boolean).join(' · ');

  const wrapperClass = cn(
    'flex items-center gap-3 px-3 py-2.5 rounded-lg min-w-[220px] max-w-[300px] transition-colors',
    isOwn ? 'bg-primary-foreground/15 hover:bg-primary-foreground/20' : 'bg-foreground/5 hover:bg-foreground/10',
  );
  const iconWrap = cn(
    'h-10 w-10 rounded-md flex items-center justify-center shrink-0',
    isOwn ? 'bg-primary-foreground/20' : 'bg-foreground/10',
  );

  // Caso 1: já temos URL → link direto com Content-Disposition: attachment
  if (effectiveUrl) {
    const href = appendDownloadParam(effectiveUrl, media.filename);
    return (
      <a
        href={href}
        rel="noreferrer"
        download={media.filename || name}
        className={wrapperClass}
      >
        <div className={iconWrap}>
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          {meta && <p className="text-[11px] opacity-70 truncate">{meta}</p>}
        </div>
        <Download className="h-4 w-4 opacity-60 shrink-0" />
      </a>
    );
  }

  // Caso 2: URL indisponível → botão "Buscar arquivo" que refaz o download.
  // Após buscar, apenas atualizamos o estado e o card vira um <a download> real —
  // não chamamos .click() programático (o navegador bloqueia como pop-up após await).
  const handleFetch = async () => {
    if (!messageId) {
      toast.error('Não foi possível identificar a mensagem para baixar o arquivo.');
      return;
    }
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-media-fetch', {
        body: { message_id: messageId },
      });
      if (error) throw error;
      const url: string | undefined = (data as any)?.url;
      if (!url) throw new Error((data as any)?.error || 'Arquivo indisponível');
      setFetchedUrl(url);
      toast.success('Arquivo pronto — toque em Baixar');
    } catch (e: any) {
      console.error('[MediaAttachment] fetch failed', e);
      toast.error(e?.message || 'Falha ao baixar o arquivo.');
    } finally {
      setFetching(false);
    }
  };

  return (
    <button type="button" onClick={handleFetch} disabled={fetching} className={cn(wrapperClass, 'text-left')}>
      <div className={iconWrap}>
        <FileText className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-[11px] opacity-70 truncate">
          {fetching ? 'Buscando arquivo…' : (meta ? `${meta} · toque para buscar` : 'Toque para buscar')}
        </p>
      </div>
      {fetching ? (
        <Loader2 className="h-4 w-4 opacity-70 shrink-0 animate-spin" />
      ) : (
        <Download className="h-4 w-4 opacity-60 shrink-0" />
      )}
    </button>
  );
}
