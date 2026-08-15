import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart3, Activity, History, PhoneIncoming, DollarSign } from 'lucide-react';
import { VoiceDashboardTab } from './VoiceDashboardTab';
import { VoiceLiveTab } from './VoiceLiveTab';
import { VoiceHistoryTab } from './VoiceHistoryTab';
import { VoiceInboundTab } from './VoiceInboundTab';
import { VoiceUsageTab } from './VoiceUsageTab';

/**
 * Hub único de "Ligações → Dashboard".
 * Consolida em sub-abas: Visão geral, Ao vivo, Histórico, Recebidas, Consumo.
 * Substitui múltiplos itens do menu lateral para reduzir ruído.
 */
export function VoiceHub() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Ligações (Voz IA)</h1>
        <p className="text-sm text-muted-foreground">
          Métricas, ligações ao vivo, histórico, chamadas recebidas pelo link público e consumo.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Visão geral</span>
          </TabsTrigger>
          <TabsTrigger value="live" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Ao vivo</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Histórico</span>
          </TabsTrigger>
          <TabsTrigger value="inbound" className="gap-2">
            <PhoneIncoming className="h-4 w-4" />
            <span className="hidden sm:inline">Recebidas</span>
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Consumo</span>
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-4 overflow-auto">
          <TabsContent value="overview" className="m-0"><VoiceDashboardTab /></TabsContent>
          <TabsContent value="live" className="m-0"><VoiceLiveTab /></TabsContent>
          <TabsContent value="history" className="m-0"><VoiceHistoryTab /></TabsContent>
          <TabsContent value="inbound" className="m-0"><VoiceInboundTab /></TabsContent>
          <TabsContent value="usage" className="m-0"><VoiceUsageTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
