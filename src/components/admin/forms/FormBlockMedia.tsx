import { useEffect, useState } from 'react';
import { FormBlock, toEmbedUrl } from '@/types/forms';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

interface FormBlockMediaProps {
  block: FormBlock;
  className?: string;
}

/**
 * Renderer único para blocos de mídia (imagem, vídeo upload/embed, carrossel, divisor).
 * Não captura resposta — apenas apresenta o conteúdo no fluxo.
 */
export function FormBlockMedia({ block, className }: FormBlockMediaProps) {
  const s = (block.block_settings || {}) as Record<string, any>;

  if (block.block_type === 'divider') {
    return (
      <div className={cn('w-full max-w-xl mx-auto px-6 py-6', className)}>
        <div className="h-px w-full bg-border" />
      </div>
    );
  }

  if (block.block_type === 'image') {
    const url = s.url as string;
    const alt = (s.alt as string) || block.label || 'Imagem';
    const link = s.link as string | undefined;
    if (!url) {
      return (
        <div className={cn('w-full max-w-xl mx-auto px-6', className)}>
          <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed bg-muted/30 text-muted-foreground">
            <div className="text-center">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-60" />
              <p className="text-sm">Configure a URL da imagem no editor</p>
            </div>
          </div>
        </div>
      );
    }
    const img = (
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="w-full h-auto rounded-xl object-contain max-h-[60vh]"
      />
    );
    return (
      <div className={cn('w-full max-w-xl mx-auto px-6', className)}>
        {link ? <a href={link} target="_blank" rel="noopener noreferrer">{img}</a> : img}
        {block.label && <p className="text-center text-sm text-muted-foreground mt-3">{block.label}</p>}
      </div>
    );
  }

  if (block.block_type === 'video_upload') {
    const url = s.url as string;
    if (!url) {
      return (
        <div className={cn('w-full max-w-xl mx-auto px-6', className)}>
          <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed bg-muted/30 text-muted-foreground">
            <p className="text-sm">Faça upload de um vídeo no editor</p>
          </div>
        </div>
      );
    }
    return (
      <div className={cn('w-full max-w-2xl mx-auto px-6', className)}>
        <video
          src={url}
          controls={s.controls !== false}
          autoPlay={!!s.autoplay}
          loop={!!s.loop}
          muted={!!s.autoplay}
          playsInline
          className="w-full rounded-xl bg-black"
        />
        {block.label && <p className="text-center text-sm text-muted-foreground mt-3">{block.label}</p>}
      </div>
    );
  }

  if (block.block_type === 'video_embed') {
    const url = s.url as string;
    const embed = url ? toEmbedUrl(url, { autoplay: !!s.autoplay }) : null;
    const orientation = (s.orientation as 'horizontal' | 'vertical') || 'horizontal';
    const isVertical = orientation === 'vertical';
    const ctaEnabled = !!s.cta_enabled;
    const ctaLabel = (s.cta_label as string) || 'Saiba mais';
    const ctaUrl = (s.cta_url as string) || '';
    const ctaTarget = (s.cta_target as '_blank' | '_self') || '_blank';
    const cta = ctaEnabled && ctaUrl ? (
      <div className="w-full flex justify-center mt-4">
        <a
          href={ctaUrl}
          target={ctaTarget}
          rel={ctaTarget === '_blank' ? 'noopener noreferrer' : undefined}
          className="inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-medium shadow-sm transition hover:opacity-90"
          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
        >
          {ctaLabel}
        </a>
      </div>
    ) : null;

    if (!embed) {
      return (
        <div className={cn('w-full max-w-xl mx-auto px-6', className)}>
          <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed bg-muted/30 text-muted-foreground">
            <p className="text-sm text-center">
              Cole a URL do YouTube, Vimeo ou Loom no editor.<br />
              {url && <span className="text-xs text-destructive">URL não reconhecida.</span>}
            </p>
          </div>
        </div>
      );
    }
    if (isVertical) {
      return (
        <div className={cn('w-full flex flex-col items-center justify-center px-2', className)}>
          <div
            className="relative rounded-xl overflow-hidden bg-black shadow-2xl"
            style={{ height: 'min(80vh, 900px)', aspectRatio: '9 / 16' }}
          >
            <iframe
              src={embed}
              title={block.label || 'Vídeo'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
          {cta}
          {block.label && <p className="text-center text-sm text-muted-foreground mt-3">{block.label}</p>}
        </div>
      );
    }
    return (
      <div className={cn('w-full max-w-2xl mx-auto px-6', className)}>
        <div className="relative w-full rounded-xl overflow-hidden bg-black" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={embed}
            title={block.label || 'Vídeo'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
        {cta}
        {block.label && <p className="text-center text-sm text-muted-foreground mt-3">{block.label}</p>}
      </div>
    );
  }

  if (block.block_type === 'carousel') {
    return <Carousel images={(s.images as string[]) || []} label={block.label} className={className} />;
  }

  return null;
}

function Carousel({ images, label, className }: { images: string[]; label?: string; className?: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [images.length]);

  if (!images?.length) {
    return (
      <div className={cn('w-full max-w-xl mx-auto px-6', className)}>
        <div className="flex items-center justify-center h-48 rounded-xl border-2 border-dashed bg-muted/30 text-muted-foreground">
          <p className="text-sm">Adicione imagens ao carrossel no editor</p>
        </div>
      </div>
    );
  }
  const prev = () => setIdx(i => (i - 1 + images.length) % images.length);
  const next = () => setIdx(i => (i + 1) % images.length);
  return (
    <div className={cn('w-full max-w-2xl mx-auto px-6', className)}>
      <div className="relative rounded-xl overflow-hidden bg-muted">
        <img src={images[idx]} alt={`${label || 'Imagem'} ${idx + 1}`} className="w-full h-auto max-h-[60vh] object-contain" />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/80 hover:bg-background flex items-center justify-center shadow"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/80 hover:bg-background flex items-center justify-center shadow"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === idx ? 'w-6 bg-primary' : 'w-1.5 bg-background/70'
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {label && <p className="text-center text-sm text-muted-foreground mt-3">{label}</p>}
    </div>
  );
}
