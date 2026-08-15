import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft, Loader2, Workflow, Eye, Share2, Settings, Code2,
  Activity, Palette, Rocket, AlertTriangle,
} from 'lucide-react';
import { useFunnel, useUpdateFunnel, useUpdateFunnelStatus } from '@/hooks/useFunnels';
import { FunnelStatus, FunnelBlock } from '@/types/funnel';
import { WidgetFlowTab } from './WidgetFlowTab';
import { WidgetPreviewTab } from './WidgetPreviewTab';
import { WidgetSettingsTab } from './WidgetSettingsTab';
import { WidgetAppearanceTab } from './WidgetAppearanceTab';
import { FunnelWebhookLogsTab } from '../FunnelWebhookLogsTab';
import { WidgetShareTab } from './WidgetShareTab';
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

function validateWidget(blocks: FunnelBlock[]): string[] {
  const warnings: string[] = [];
  if (!blocks || blocks.length === 0) {
    warnings.push('Fluxo vazio — adicione blocos para publicar.');
    return warnings;
  }
  const ids = new Set(blocks.map(b => b.id));
  blocks.forEach(b => {
    if (b.type === 'ai_takeover' && !(b.data as any)?.agent_id) {
      warnings.push(`Bloco "IA assume" (${(b.data as any)?.label || b.id.slice(0, 6)}) sem agente vinculado.`);
    }
    const next = (b.data as any)?.next_block_id;
    if (next && !ids.has(next)) {
      warnings.push(`Bloco "${b.type}" aponta para um bloco inexistente.`);
    }
  });
  return warnings;
}

export function WidgetBuilder({ funnelId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState('flow');
  const { data: funnel, isLoading } = useFunnel(funnelId);
  const updateStatus = useUpdateFunnelStatus();
  const updateFunnel = useUpdateFunnel();

  const warnings = useMemo(
    () => (funnel ? validateWidget(funnel.flow_blocks || []) : []),
    [funnel]
  );

  const handlePublish = async () => {
    if (!funnel) return;
    if (warnings.length > 0) {
      toast.error('Resolva os avisos do fluxo antes de publicar');
      setActiveTab('flow');
      return;
    }
    // Garante canal widget ativo
    if (!funnel.channels.widget?.enabled) {
      await updateFunnel.mutateAsync({
        id: funnelId,
        channels: { ...funnel.channels, widget: { ...(funnel.channels.widget || {}), enabled: true } },
      } as any);
    }
    await updateStatus.mutateAsync({ id: funnelId, status: 'active' });
    toast.success('Widget publicado!');
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
        <p className="text-muted-foreground">Widget não encontrado</p>
        <Button variant="outline" onClick={onBack} className="mt-4">Voltar</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 pb-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">{funnel.name}</h1>
              <Badge variant={statusConfig[funnel.status].variant}>
                {statusConfig[funnel.status].label}
              </Badge>
              {warnings.length > 0 && (
                <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  {warnings.length} aviso{warnings.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{funnel.products?.name || 'Widget de Site'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {funnel.status === 'active' ? (
            <Button variant="outline" onClick={handlePause} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pausar'}
            </Button>
          ) : (
            <Button onClick={handlePublish} disabled={updateStatus.isPending} className="gap-2">
              {updateStatus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Rocket className="h-4 w-4" />Publicar</>}
            </Button>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-1">
                Avisos do fluxo
              </p>
              <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 list-disc list-inside">
                {warnings.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}
                {warnings.length > 4 && <li>...e mais {warnings.length - 4}</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col mt-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-6">
          <TabsTrigger value="flow" className="gap-2"><Workflow className="h-4 w-4" /><span className="hidden sm:inline">Fluxo</span></TabsTrigger>
          <TabsTrigger value="preview" className="gap-2"><Eye className="h-4 w-4" /><span className="hidden sm:inline">Preview</span></TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2"><Palette className="h-4 w-4" /><span className="hidden sm:inline">Aparência</span></TabsTrigger>
          <TabsTrigger value="share" className="gap-2"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Instalar</span></TabsTrigger>
          <TabsTrigger value="logs" className="gap-2"><Activity className="h-4 w-4" /><span className="hidden sm:inline">Webhooks</span></TabsTrigger>
          <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" /><span className="hidden sm:inline">Config</span></TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-4 overflow-hidden">
          <TabsContent value="flow" className="h-full m-0"><WidgetFlowTab funnel={funnel} /></TabsContent>
          <TabsContent value="preview" className="h-full m-0"><WidgetPreviewTab funnel={funnel} /></TabsContent>
          <TabsContent value="appearance" className="h-full m-0 overflow-hidden"><WidgetAppearanceTab funnel={funnel} /></TabsContent>
          <TabsContent value="share" className="h-full m-0 overflow-auto"><WidgetShareTab funnel={funnel} /></TabsContent>
          <TabsContent value="logs" className="h-full m-0 overflow-hidden"><FunnelWebhookLogsTab funnelId={funnelId} /></TabsContent>
          <TabsContent value="settings" className="h-full m-0 overflow-auto"><WidgetSettingsTab funnel={funnel} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
