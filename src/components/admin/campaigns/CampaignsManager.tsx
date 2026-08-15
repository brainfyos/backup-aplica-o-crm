import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampaignsList } from './CampaignsList';
import { ContextLibrary } from './contexts/ContextLibrary';
import { CampaignReports } from './reports/CampaignReports';
import { CampaignWizard } from './CampaignWizard';
import { CampaignDetail } from './CampaignDetail';
import { CampaignThroughputPanel } from './CampaignThroughputPanel';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useAuth } from '@/hooks/useAuth';

type View =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; id: string }
  | { kind: 'detail'; id: string };

export function CampaignsManager() {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [tab, setTab] = useState('campaigns');
  const { campaigns, stats, preparations, orgId, refresh } = useCampaigns();
  const { isSuperAdmin } = useAuth();
  const showThroughput = isSuperAdmin();

  if (view.kind === 'new' || view.kind === 'edit') {
    return (
      <CampaignWizard
        orgId={orgId}
        campaignId={view.kind === 'edit' ? view.id : null}
        onClose={() => { setView({ kind: 'list' }); refresh(); }}
      />
    );
  }

  if (view.kind === 'detail') {
    return (
      <CampaignDetail
        campaignId={view.id}
        onBack={() => setView({ kind: 'list' })}
        onEdit={() => setView({ kind: 'edit', id: view.id })}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Campanhas Inteligentes</h1>
        <p className="text-sm text-muted-foreground">
          Transforme listas em conversas reais. O agente IA recebe contexto e cria uma abordagem única para cada lead.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          <TabsTrigger value="library">Biblioteca de Contextos</TabsTrigger>
          <TabsTrigger value="reports">Relatórios</TabsTrigger>
          {showThroughput && <TabsTrigger value="throughput">Throughput</TabsTrigger>}
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          <CampaignsList
            campaigns={campaigns}
            stats={stats}
            preparations={preparations}
            onNew={() => setView({ kind: 'new' })}
            onOpen={(id) => setView({ kind: 'detail', id })}
            onRefresh={refresh}
          />
        </TabsContent>

        <TabsContent value="library" className="mt-4">
          <ContextLibrary orgId={orgId} />
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <CampaignReports campaigns={campaigns} />
        </TabsContent>

        {showThroughput && (
          <TabsContent value="throughput" className="mt-4">
            <CampaignThroughputPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
