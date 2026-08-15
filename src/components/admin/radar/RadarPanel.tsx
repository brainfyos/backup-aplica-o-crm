import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, History, CalendarClock, Play, Loader2 } from 'lucide-react';
import { RadarFilters } from './RadarFilters';
import { RadarActionsConfig } from './RadarActionsConfig';
import { RadarDashboard } from './RadarDashboard';
import { RadarHistory } from './RadarHistory';
import { RadarSchedules } from './RadarSchedules';
import {
  useRunOpportunityScan,
  useOpportunityScans,
  type ScanFilters,
  type ActionsConfig,
} from '@/hooks/useOpportunityScan';
import { ScrollArea } from '@/components/ui/scroll-area';

const DEFAULT_FILTERS: ScanFilters = {
  inactivity_days_min: 0,
  inactivity_days_max: 14,
  min_client_messages: 1,
  include_ai_active: false,
  statuses: ['waiting_human', 'human_active', 'bot_active'],
  product_ids: [],
  assigned_user_ids: [],
  tag_ids: [],
  sector_ids: [],
  channels: [],
  squad_ids: [],
  temperatures: [],
  exclude_product_ids: [],
  exclude_assigned_user_ids: [],
  exclude_tag_ids: [],
  exclude_sector_ids: [],
  exclude_channels: [],
  exclude_lead_ids: [],
};

const DEFAULT_ACTIONS: ActionsConfig = {
  hot: { create_task: { enabled: true, due_in_hours: 4 }, notify_owner: true },
  warm: { create_task: { enabled: false, due_in_hours: 24 } },
  cold: {},
  lost: {},
};

export function RadarPanel({ onOpenConversation }: { onOpenConversation?: (id: string) => void } = {}) {
  const [filters, setFilters] = useState<ScanFilters>(DEFAULT_FILTERS);
  const [actions, setActions] = useState<ActionsConfig>(DEFAULT_ACTIONS);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [tab, setTab] = useState('run');

  const runScan = useRunOpportunityScan();
  const { data: scans } = useOpportunityScans();

  const lastRunning = useMemo(() => scans?.find((s) => s.status === 'running' || s.status === 'pending'), [scans]);
  const latestId = lastRunning?.id || scans?.[0]?.id || null;
  const displayScanId = activeScanId || latestId;
  const isHistorical = !!activeScanId && activeScanId !== latestId;

  function handleSelectHistory(id: string) {
    setActiveScanId(id);
    setTab('run');
  }

  async function handleRun() {
    const res = await runScan.mutateAsync({ filters, actions_config: actions });
    setActiveScanId((res as any).scan_id);
  }


  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Sparkles className="h-5 w-5 text-primary" />
                Radar IA
              </CardTitle>
              <CardDescription>
                Analisa conversas em aberto e identifica oportunidades quentes que precisam de atenção
              </CardDescription>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Powered by AI
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="run" className="gap-2">
            <Play className="h-4 w-4" /> Rodar Análise
          </TabsTrigger>
          <TabsTrigger value="schedules" className="gap-2">
            <CalendarClock className="h-4 w-4" /> Agendamentos
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="space-y-4">
          <div className="grid lg:grid-cols-[380px_1fr] gap-4">
            <ScrollArea className="lg:h-[calc(100vh-280px)]">
              <div className="space-y-4 pr-2">
                <RadarFilters value={filters} onChange={setFilters} />
                <RadarActionsConfig value={actions} onChange={setActions} />

                <Card>
                  <CardContent className="pt-6 space-y-3">
                    <Button
                      onClick={handleRun}
                      className="w-full gap-2"
                      disabled={runScan.isPending || !!lastRunning}
                    >
                      {runScan.isPending || lastRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {lastRunning ? 'Análise em andamento...' : 'Iniciando...'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Rodar Radar agora
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>

            <div>
              {displayScanId ? (
                <RadarDashboard
                  scanId={displayScanId}
                  onOpenConversation={onOpenConversation}
                  isHistorical={isHistorical}
                  onBackToLatest={() => setActiveScanId(null)}
                />
              ) : (
                <Card>
                  <CardContent className="py-16 text-center text-muted-foreground">
                    <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Configure os filtros e rode sua primeira análise</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schedules">
          <RadarSchedules defaultFilters={filters} defaultActions={actions} />
        </TabsContent>

        <TabsContent value="history">
          <RadarHistory onSelect={handleSelectHistory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
