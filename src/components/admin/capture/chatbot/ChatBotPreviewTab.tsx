import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Monitor, RotateCcw, ExternalLink, AlertCircle } from 'lucide-react';
import { Funnel } from '@/types/funnel';
import { usePublicAppUrl } from '@/lib/publicUrl';

interface Props { funnel: Funnel; }

export function ChatBotPreviewTab({ funnel }: Props) {
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { data: baseUrl } = usePublicAppUrl();

  const slug = funnel.channels.chat?.slug_override || funnel.slug;
  const chatUrl = `${baseUrl}/c/${slug}?preview=1`;
  const isActive = funnel.status === 'active';

  const handleReload = () => {
    // Limpa session local antes de recarregar
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(`chat_session_${funnel.id}`) || k.startsWith(`funnel_session_${funnel.id}`))
        .forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
    setReloadKey(k => k + 1);
  };

  const deviceClass = device === 'mobile'
    ? 'w-[390px] h-[780px]'
    : 'w-full max-w-[1100px] h-[780px]';

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? 'ChatBot ativo' : 'Rascunho — apenas você vê'}
          </Badge>
          {!isActive && (
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Publique para liberar ao público
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-background border rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setDevice('mobile')}
              className={`p-1.5 rounded ${device === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              title="Mobile"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              className={`p-1.5 rounded ${device === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              title="Desktop"
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={handleReload} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Reiniciar conversa
          </Button>

          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <a href={chatUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Nova aba
            </a>
          </Button>
        </div>
      </div>

      {/* Iframe centralizado */}
      <div className="flex-1 min-h-0 overflow-auto bg-muted/30 flex items-start justify-center pt-6 pb-6">
        <div className={`${deviceClass} bg-background rounded-xl border shadow-lg overflow-hidden transition-all`}>
          <iframe
            key={reloadKey}
            ref={iframeRef}
            src={chatUrl}
            className="w-full h-full border-0"
            title="ChatBot Preview"
            allow="microphone; camera"
          />
        </div>
      </div>
    </div>
  );
}
