import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MarketingShell } from '../MarketingShell';
import { DiagnosticSubTab } from '../optimizations/DiagnosticSubTab';
import { RecommendationsSubTab } from '../optimizations/RecommendationsSubTab';
import { RulesSubTab } from '../optimizations/RulesSubTab';
import { ExecutionsSubTab } from '../optimizations/ExecutionsSubTab';
import { CopilotSheet } from '../optimizations/CopilotSheet';

const VALID = ['diagnostic', 'recommendations', 'rules', 'executions', 'history'] as const;

export function OptimizationsSection() {
  const [params, setParams] = useSearchParams();
  const view = (VALID.includes(params.get('view') as any) ? params.get('view') : 'diagnostic') as string;
  const setView = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('view', v);
    setParams(next, { replace: true });
  };

  return (
    <MarketingShell scope="meta" title="Marketing · Otimizações com IA">
      {() => (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Diagnóstico, recomendações e execução assistida por IA sobre suas campanhas Meta.
            </p>
            <CopilotSheet />
          </div>
          <Tabs value={view} onValueChange={setView}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="diagnostic">Diagnóstico</TabsTrigger>
              <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
              <TabsTrigger value="rules">Regras automáticas</TabsTrigger>
              <TabsTrigger value="executions">Execuções</TabsTrigger>
              <TabsTrigger value="history">Histórico</TabsTrigger>
            </TabsList>
            <TabsContent value="diagnostic" className="mt-4"><DiagnosticSubTab /></TabsContent>
            <TabsContent value="recommendations" className="mt-4"><RecommendationsSubTab /></TabsContent>
            <TabsContent value="rules" className="mt-4"><RulesSubTab /></TabsContent>
            <TabsContent value="executions" className="mt-4"><ExecutionsSubTab mode="recent" /></TabsContent>
            <TabsContent value="history" className="mt-4"><ExecutionsSubTab mode="history" /></TabsContent>
          </Tabs>
        </div>
      )}
    </MarketingShell>
  );
}
