import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, ExternalLink, Download, ListChecks, Code } from 'lucide-react';
import { Funnel } from '@/types/funnel';
import { usePublicAppUrl, isEditorHost } from '@/lib/publicUrl';
import { toast } from 'sonner';

interface Props { funnel: Funnel; }

export function QuizShareTab({ funnel }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const { data: baseUrl } = usePublicAppUrl();
  const editor = typeof window !== 'undefined' && isEditorHost();

  const slug = (funnel.channels as any)?.quiz?.slug_override || funnel.slug;
  const quizUrl = `${baseUrl}/q/${slug}`;
  const iframeCode = `<iframe src="${quizUrl}" width="100%" height="700" frameborder="0"></iframe>`;

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 1500);
  };

  const downloadQR = () => {
    const svg = document.getElementById('quiz-qr') as unknown as SVGSVGElement | null;
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quiz-${slug}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          Compartilhar Quiz
        </h2>
        <p className="text-muted-foreground text-sm">
          Use o link, o QR Code ou incorpore em qualquer site.
        </p>
      </div>

      {editor && (
        <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm">
          O link usa o domínio publicado: <strong>{baseUrl}</strong>. Publique o app antes de compartilhar.
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Link público</CardTitle>
          <CardDescription>Envie este link e o lead começa o quiz imediatamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={quizUrl} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={() => copy(quizUrl, 'url')}>
              {copied === 'url' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a href={quizUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">QR Code</CardTitle>
          <CardDescription>Ideal para eventos, panfletos e materiais impressos.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <div className="bg-white p-4 rounded-lg border">
            <QRCodeSVG id="quiz-qr" value={quizUrl} size={160} level="M" includeMargin={false} />
          </div>
          <div className="space-y-2">
            <Button variant="outline" onClick={downloadQR} className="gap-2">
              <Download className="h-4 w-4" />
              Baixar SVG
            </Button>
            <p className="text-xs text-muted-foreground max-w-xs">
              Vetor de alta resolução, escalável sem perda.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Code className="h-4 w-4" />
            Incorporar no seu site
          </CardTitle>
          <CardDescription>Cole este iframe em qualquer página HTML.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs text-muted-foreground">Altura ajustável (700px por padrão)</Label>
          <div className="bg-muted rounded-lg p-3 overflow-x-auto">
            <pre className="text-xs font-mono whitespace-pre text-foreground">{iframeCode}</pre>
          </div>
          <Button variant="outline" size="sm" onClick={() => copy(iframeCode, 'iframe')} className="gap-2">
            {copied === 'iframe' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            Copiar código
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
