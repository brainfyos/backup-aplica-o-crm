import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrowLeft, Loader2, Workflow, Share2, Settings, ListChecks,
  Palette, Rocket, AlertTriangle, Sparkles, ChartNoAxesCombined,
} from 'lucide-react';
import { useFunnel, useUpdateFunnelStatus } from '@/hooks/useFunnels';
import { FunnelStatus, FunnelBlock } from '@/types/funnel';
import { QuizFlowTab } from './QuizFlowTab';
import { QuizSettingsTab } from './QuizSettingsTab';
import { QuizAppearanceTab } from './QuizAppearanceTab';
import { QuizIntegrationsTab } from './QuizIntegrationsTab';
import { QuizShareTab } from './QuizShareTab';
import { QuizAnalyticsTab } from './QuizAnalyticsTab';
import { toast } from 'sonner';

interface Props {
  funnelId: string;
  onBack: () => void;
}

const statusConfig: Record<FunnelStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

function validateQuiz(blocks: FunnelBlock[]): string[] {
  const warnings: string[] = [];
  if (!blocks || blocks.length === 0) {
    warnings.push('Quiz vazio — adicione pelo menos uma pergunta.');
    return warnings;
  }
  const ids = new Set(blocks.map(b => b.id));
  const hasCapture = blocks.some(b => b.type === 'input' || b.type === 'quick_form' || b.type === 'create_lead');
  if (!hasCapture) {
    warnings.push('Nenhum bloco de captura de lead — o resultado não será salvo.');
  }
  const variables = new Map<string, number>();
  blocks.forEach(b => {
    const targets = [
      b.next_block_id,
      b.data.true_next_block_id,
      b.data.false_next_block_id,
      ...(b.data.options?.map(option => option.next_block_id) || []),
    ].filter(Boolean) as string[];
    targets.forEach((target) => {
      if (!ids.has(target)) {
        warnings.push(`Bloco "${b.data.content || b.type}" aponta para uma etapa inexistente.`);
      }
    });
    const variable = b.data.variable_name?.trim();
    if (variable) variables.set(variable, (variables.get(variable) || 0) + 1);
    if (b.type === 'buttons') {
      const opts = (b.data as any)?.options || [];
      if (opts.length === 0) {
        warnings.push(`Pergunta "${(b.data as any)?.label || b.id.slice(0, 6)}" sem opções.`);
      }
      if ((b.data as any)?.quiz_subtype === 'multiple') {
        const optionTargets = new Set(opts.map((option: any) => option.next_block_id).filter(Boolean));
        if (optionTargets.size > 1) {
          warnings.push(`Múltipla escolha "${b.data.content || b.id.slice(0, 6)}" possui destinos diferentes. Use uma saída única após a confirmação.`);
        }
      }
    }
  });
  variables.forEach((count, variable) => {
    if (count > 1) warnings.push(`A variável "${variable}" está repetida em ${count} etapas.`);
  });
  return warnings;
}

export function QuizBuilder({ funnelId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState('flow');
  const { data: funnel, isLoading } = useFunnel(funnelId);
  const updateStatus = useUpdateFunnelStatus();

  const warnings = useMemo(
    () => (funnel ? validateQuiz(funnel.flow_blocks || []) : []),
    [funnel]
  );

  const handlePublish = async () => {
    if (!funnel) return;
    if (warnings.length > 0) {
      toast.error('Resolva os avisos do quiz antes de publicar');
      setActiveTab('flow');
      return;
    }
    await updateStatus.mutateAsync({ id: funnelId, status: 'active' });
    toast.success('Quiz publicado!');
  };

  const handlePause = async () => {
    await updateStatus.mutateAsync({ id: funnelId, status: 'paused' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!funnel) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Quiz não encontrado</p>
        <Button variant="outline" onClick={onBack} className="mt-4">Voltar</Button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-full flex flex-col">
        {/* Topbar slim unificada com tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 h-11 px-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  {funnel.name}
                </span>
              </TooltipContent>
            </Tooltip>

            <TabsList className="h-9 grid grid-cols-6 max-w-3xl">
              <TabsTrigger value="flow" className="gap-1.5 h-7 px-2"><Workflow className="h-3.5 w-3.5" /><span className="hidden md:inline text-xs">Fluxo</span></TabsTrigger>
              <TabsTrigger value="appearance" className="gap-1.5 h-7 px-2"><Palette className="h-3.5 w-3.5" /><span className="hidden md:inline text-xs">Aparência</span></TabsTrigger>
              <TabsTrigger value="integrations" className="gap-1.5 h-7 px-2"><Sparkles className="h-3.5 w-3.5" /><span className="hidden md:inline text-xs">CRM/IA</span></TabsTrigger>
              <TabsTrigger value="results" className="gap-1.5 h-7 px-2"><ChartNoAxesCombined className="h-3.5 w-3.5" /><span className="hidden md:inline text-xs">Resultados</span></TabsTrigger>
              <TabsTrigger value="share" className="gap-1.5 h-7 px-2"><Share2 className="h-3.5 w-3.5" /><span className="hidden md:inline text-xs">Compartilhar</span></TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 h-7 px-2"><Settings className="h-3.5 w-3.5" /><span className="hidden md:inline text-xs">Config</span></TabsTrigger>
            </TabsList>

            <div className="flex-1" />

            <Badge variant={statusConfig[funnel.status].variant} className="h-6 text-[10px] uppercase tracking-wide">
              {statusConfig[funnel.status].label}
            </Badge>

            {warnings.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setActiveTab('flow')}
                    className="h-7 px-2 rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs font-medium flex items-center gap-1"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {warnings.length}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <ul className="space-y-0.5 text-xs">
                    {warnings.slice(0, 5).map((w, i) => <li key={i}>• {w}</li>)}
                    {warnings.length > 5 && <li>…e mais {warnings.length - 5}</li>}
                  </ul>
                </TooltipContent>
              </Tooltip>
            )}

            {funnel.status === 'active' ? (
              <Button variant="outline" size="sm" className="h-8" onClick={handlePause} disabled={updateStatus.isPending}>
                {updateStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Pausar'}
              </Button>
            ) : (
              <Button size="sm" className="h-8 gap-1.5" onClick={handlePublish} disabled={updateStatus.isPending}>
                {updateStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Rocket className="h-3.5 w-3.5" />Publicar</>}
              </Button>
            )}
          </div>

          <div className="flex-1 mt-2 overflow-hidden min-h-0">
            <TabsContent value="flow" className="h-full m-0"><QuizFlowTab funnel={funnel} /></TabsContent>
            <TabsContent value="appearance" className="h-full m-0 overflow-hidden"><QuizAppearanceTab funnel={funnel} /></TabsContent>
            <TabsContent value="integrations" className="h-full m-0 overflow-auto"><QuizIntegrationsTab funnel={funnel} /></TabsContent>
            <TabsContent value="results" className="h-full m-0 overflow-hidden"><QuizAnalyticsTab funnel={funnel} /></TabsContent>
            <TabsContent value="share" className="h-full m-0 overflow-auto"><QuizShareTab funnel={funnel} /></TabsContent>
            <TabsContent value="settings" className="h-full m-0 overflow-auto"><QuizSettingsTab funnel={funnel} /></TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
