import { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Monitor, RotateCcw, ExternalLink, AlertCircle } from 'lucide-react';
import { Funnel } from '@/types/funnel';
import { usePublicAppUrl } from '@/lib/publicUrl';

interface Props { funnel: Funnel; }

export function WidgetPreviewTab({ funnel }: Props) {
  const [device, setDevice] = useState<'mobile' | 'desktop'>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { data: baseUrl } = usePublicAppUrl();
  const isActive = funnel.status === 'active';

  // Página fake hospedando o widget para simular como ficaria em um site externo.
  const hostDoc = useMemo(() => `<!doctype html>
<html lang="pt-br"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Preview do Widget</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7fb;color:#1f2937}
    header{padding:18px 24px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px}
    .logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6)}
    main{max-width:880px;margin:32px auto;padding:0 24px}
    h1{font-size:28px;margin:0 0 12px}
    p{color:#475569;line-height:1.6;margin:0 0 16px}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:18px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
    .placeholder{height:120px;border-radius:8px;background:linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9);background-size:200% 100%;animation:s 2s infinite}
    @keyframes s{0%{background-position:200% 0}100%{background-position:-200% 0}}
  </style>
</head><body>
  <header><div class="logo"></div><strong>Site de demonstração</strong></header>
  <main>
    <h1>Esta é uma página fictícia</h1>
    <p>O widget abaixo será carregado exatamente como apareceria em um site real onde você colar o snippet de instalação.</p>
    <div class="card"><div class="placeholder"></div></div>
    <div class="card"><div class="placeholder"></div></div>
    <div class="card"><div class="placeholder"></div></div>
  </main>
  <script src="${baseUrl}/funnel-widget.js" data-funnel-id="${funnel.id}" async></script>
</body></html>`, [baseUrl, funnel.id, reloadKey]);

  const deviceClass = device === 'mobile'
    ? 'w-[390px] h-[780px]'
    : 'w-full max-w-[1100px] h-[780px]';

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? 'Widget ativo' : 'Rascunho — apenas você vê'}
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
            <button type="button" onClick={() => setDevice('mobile')}
              className={`p-1.5 rounded ${device === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              title="Mobile">
              <Smartphone className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setDevice('desktop')}
              className={`p-1.5 rounded ${device === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              title="Desktop">
              <Monitor className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={() => setReloadKey(k => k + 1)} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Recarregar
          </Button>

          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <a href={`${baseUrl}/c/${funnel.slug}?preview=1`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir como página
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-muted/30 flex items-start justify-center pt-6 pb-6">
        <div className={`${deviceClass} bg-background rounded-xl border shadow-lg overflow-hidden transition-all`}>
          <iframe
            key={reloadKey}
            ref={iframeRef}
            srcDoc={hostDoc}
            className="w-full h-full border-0"
            title="Widget Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
      </div>
    </div>
  );
}
