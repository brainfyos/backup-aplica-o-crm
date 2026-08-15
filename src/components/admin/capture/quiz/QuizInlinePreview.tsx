import { useRef, useState } from 'react';
import { Smartphone, Monitor, RotateCcw, ExternalLink, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Funnel } from '@/types/funnel';

interface Props {
  funnel: Funnel;
  /** Timestamp do último auto-save: força reload do iframe quando muda. */
  refreshKey?: number;
}

/**
 * Preview inline do Quiz exibido no painel direito da aba Fluxo,
 * em moldura mobile/desktop, refletindo a aparência salva.
 */
export function QuizInlinePreview({ funnel, refreshKey = 0 }: Props) {
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [manualReload, setManualReload] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Usa o origin atual (editor/preview/published) para garantir que o iframe
  // rode no mesmo build em que o usuário está editando — evita 404 quando o
  // quiz ainda não foi publicado no domínio de produção.
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const slug = (funnel.channels as any)?.quiz?.slug_override || funnel.slug;
  const quizUrl = slug ? `${baseUrl}/q/${slug}?preview=1` : '';
  const isActive = funnel.status === 'active';
  const hasSlug = Boolean(slug);

  const handleReload = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(`chat_session_${funnel.id}`) || k.startsWith(`funnel_session_${funnel.id}`))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* noop */ }
    setManualReload((k) => k + 1);
  };

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <Badge variant={isActive ? 'default' : 'secondary'} className="text-[10px]">
          {isActive ? 'Quiz ativo' : 'Rascunho'}
        </Badge>
        <div className="flex items-center gap-1">
          <div className="flex gap-0.5 bg-background border rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setDevice('mobile')}
              className={`p-1.5 rounded transition ${device === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="Mobile"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              className={`p-1.5 rounded transition ${device === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="Desktop"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Reiniciar quiz" onClick={handleReload}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Abrir em nova aba" disabled={!hasSlug}>
            <a href={quizUrl || '#'} target="_blank" rel="noopener noreferrer" aria-disabled={!hasSlug}>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      {!hasSlug ? (
        <div className="flex-1 min-h-0 flex items-center justify-center bg-muted/30 rounded-lg p-6 text-center">
          <div className="max-w-[260px] space-y-2">
            <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Eye className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Preview indisponível</p>
            <p className="text-xs text-muted-foreground">
              Salve o quiz para gerar um link público e visualizar o preview aqui.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex items-start justify-center overflow-auto bg-muted/30 rounded-lg p-3">
        {device === 'mobile' ? (
          <div
            className="relative bg-foreground/90 rounded-[40px] p-2 shadow-2xl mx-auto"
            style={{ width: 'min(320px, 100%)' }}
          >
            <div className="absolute top-2 left-1/2 -translate-x-1/2 h-5 w-24 bg-foreground/90 rounded-b-2xl z-10" />
            <div className="rounded-[32px] overflow-hidden bg-background" style={{ height: 'min(640px, 70vh)' }}>
              <iframe
                key={`${refreshKey}-${manualReload}-mobile`}
                ref={iframeRef}
                src={quizUrl}
                title="Preview do quiz (mobile)"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[820px] mx-auto rounded-xl border bg-background shadow-lg overflow-hidden" style={{ height: 'min(620px, 70vh)' }}>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/60 border-b">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <iframe
              key={`${refreshKey}-${manualReload}-desktop`}
              src={quizUrl}
              title="Preview do quiz (desktop)"
              className="w-full border-0"
              style={{ height: 'calc(100% - 33px)' }}
            />
          </div>
        )}
      </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        O preview reflete a aparência salva. Edições no fluxo aparecem após o auto-save.
      </p>
    </div>
  );
}
