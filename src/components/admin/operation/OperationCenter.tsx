import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import {
  useHealthKpis,
  useOperationPriorities,
  useTeamPerformance,
  useRealtimeOps,
  useLeadsAtRisk,
  useAIRadarInsights,
} from '@/hooks/useOperationCenter';
import { HealthKpiRow } from './HealthKpiRow';
import { PrioritiesCard } from './PrioritiesCard';
import { TeamPerformanceTable } from './TeamPerformanceTable';
import { RealtimeOpsCard } from './RealtimeOpsCard';
import { LeadsAtRiskTable } from './LeadsAtRiskTable';
import { AIRadarCard } from './AIRadarCard';
import { LeadDetailPage } from '@/components/lead/LeadDetailPage';

export function OperationCenter() {
  const [, setSearchParams] = useSearchParams();
  const { data: kpis } = useHealthKpis();
  const { data: priorities } = useOperationPriorities();
  const { data: team } = useTeamPerformance();
  const { data: realtime } = useRealtimeOps();
  const { data: atRisk } = useLeadsAtRisk();
  const { data: insights } = useAIRadarInsights();

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const handleNavigate = (section: string) => {
    setSearchParams({ tab: section }, { replace: true });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Central de Operação</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão em tempo real da operação comercial da sua equipe.
        </p>
      </div>

      {/* Linha 1 */}
      <HealthKpiRow kpis={kpis} onNavigate={handleNavigate} />

      {/* Linhas 2 + 3 + 6 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-3">
          <PrioritiesCard data={priorities} onNavigate={handleNavigate} />
        </div>
        <div className="lg:col-span-6">
          <TeamPerformanceTable rows={team} onNavigate={handleNavigate} />
        </div>
        <div className="lg:col-span-3">
          <AIRadarCard items={insights} onNavigate={handleNavigate} />
        </div>
      </div>

      {/* Linha 4 */}
      <RealtimeOpsCard data={realtime} />

      {/* Linha 5 */}
      <LeadsAtRiskTable rows={atRisk} onResolve={setSelectedLeadId} />

      <Dialog open={!!selectedLeadId} onOpenChange={() => setSelectedLeadId(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden p-0">
          <VisuallyHidden>
            <DialogTitle>Detalhes do Lead</DialogTitle>
          </VisuallyHidden>
          {selectedLeadId && (
            <LeadDetailPage
              leadId={selectedLeadId}
              onBack={() => setSelectedLeadId(null)}
              isAdminView={true}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
