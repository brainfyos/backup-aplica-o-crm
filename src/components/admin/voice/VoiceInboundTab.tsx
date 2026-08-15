import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PhoneIncoming, Info } from 'lucide-react';
import { VoiceHistoryTab } from './VoiceHistoryTab';

export function VoiceInboundTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2"><PhoneIncoming className="h-5 w-5" /> Chamadas Recebidas</h2>
        <p className="text-sm text-muted-foreground">Ligações que chegaram no número nativo da xAI.</p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Para receber ligações, configure em <strong>Integrações → xAI (Grok Voice)</strong> a chave da API e defina um <strong>Agente de Voz</strong> como "padrão inbound".
          Quando um lead ligar para o número nativo da xAI, ele será atendido automaticamente e o registro aparecerá aqui.
        </AlertDescription>
      </Alert>

      <Card className="p-4">
        <VoiceHistoryTab />
      </Card>
    </div>
  );
}
