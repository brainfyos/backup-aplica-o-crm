import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PhoneCall, BarChart3, Activity, History, DollarSign } from 'lucide-react';
import { VoiceCallsManager } from './VoiceCallsManager';
import { VoiceDashboardTab } from '@/components/admin/voice/VoiceDashboardTab';
import { VoiceLiveTab } from '@/components/admin/voice/VoiceLiveTab';
import { VoiceHistoryTab } from '@/components/admin/voice/VoiceHistoryTab';
import { VoiceUsageTab } from '@/components/admin/voice/VoiceUsageTab';

/**
 * Fase 7 — Página "Ligação Web" com abas:
 * - Campanhas: lista/editor de ligações (VoiceCallsManager)
 * - Visão geral: KPIs agregados
 * - Ao vivo: chamadas em andamento
 * - Histórico: histórico global cross-campanha
 * - Consumo: minutos + custo
 */
export function VoiceCallsPage() {
  const [tab, setTab] = useState('campaigns');

  return (
    <div className="flex flex-col h-full">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="campaigns" className="gap-2">
            <PhoneCall className="h-4 w-4" />
            <span className="hidden sm:inline">Campanhas</span>
          </TabsTrigger>
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
          <TabsTrigger value="usage" className="gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Consumo</span>
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-4 overflow-auto">
          <TabsContent value="campaigns" className="m-0"><VoiceCallsManager /></TabsContent>
          <TabsContent value="overview" className="m-0"><VoiceDashboardTab /></TabsContent>
          <TabsContent value="live" className="m-0"><VoiceLiveTab /></TabsContent>
          <TabsContent value="history" className="m-0"><VoiceHistoryTab /></TabsContent>
          <TabsContent value="usage" className="m-0"><VoiceUsageTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
