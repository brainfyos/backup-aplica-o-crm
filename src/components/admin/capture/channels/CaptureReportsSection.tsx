import { BarChart3, Construction } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function CaptureReportsSection() {
  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <BarChart3 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            Relatórios de Captura
            <Badge variant="secondary" className="gap-1">
              <Construction className="h-3 w-3" />
              em construção
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Métricas consolidadas de todos os canais (ChatBot, WhatsApp, Formulário, Widget e Quiz).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que virá aqui</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Funis ativos por canal e taxa de conversão de cada um.</p>
          <p>• Sessões iniciadas, finalizadas e abandonadas (com tabela <code className="px-1 rounded bg-muted">funnel_sessions</code>).</p>
          <p>• Top blocos com maior taxa de drop-off para você otimizar.</p>
          <p>• Filtro por canal, período e produto.</p>
        </CardContent>
      </Card>
    </div>
  );
}
