import { MarketingShell } from '../MarketingShell';
import { TechnicalTab } from '../tabs/TechnicalTab';
import { TrackingScriptTab } from '../tracking/TrackingScriptTab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function TrackingSection() {
  return (
    <MarketingShell
      scope="tracking"
      title="Marketing · Rastreamento"
      subtitle="Pixel, CAPI, script de rastreamento e diagnóstico técnico."
    >
      <Tabs defaultValue="script" className="w-full">
        <TabsList>
          <TabsTrigger value="script">Script de rastreamento</TabsTrigger>
          <TabsTrigger value="pixel">Pixel & CAPI</TabsTrigger>
        </TabsList>
        <TabsContent value="script" className="mt-4">
          <TrackingScriptTab />
        </TabsContent>
        <TabsContent value="pixel" className="mt-4">
          <TechnicalTab />
        </TabsContent>
      </Tabs>
    </MarketingShell>
  );
}
