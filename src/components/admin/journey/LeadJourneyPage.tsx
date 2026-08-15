import { useMemo, useState, lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Route, Calendar as CalendarIcon, X } from 'lucide-react';
import { JourneyDashboard } from '@/components/journey/JourneyDashboard';
import { JourneyFunnel } from '@/components/journey/JourneyFunnel';
import { JourneyTouchpoints } from '@/components/journey/JourneyTouchpoints';
import { JourneyStageDrawer } from '@/components/journey/JourneyStageDrawer';
import { JourneyTimelineDrawer } from '@/components/journey/JourneyTimelineDrawer';
import {
  useJourneyMetrics,
  useJourneyStages,
  useJourneyTouchpoints,
} from '@/hooks/useLeadJourney';
import type { JourneyCategory, JourneyFilters } from '@/lib/leadJourney';

const JourneyFunnelHeatmap = lazy(() => import('@/components/journey/JourneyFunnelHeatmap'));
const JourneyAcquisition = lazy(() => import('@/components/journey/JourneyAcquisition'));
const JourneyBottlenecks = lazy(() => import('@/components/journey/JourneyBottlenecks'));
const JourneyStageTiming = lazy(() => import('@/components/journey/JourneyStageTiming'));
const JourneyRealtimeTimeline = lazy(() => import('@/components/journey/JourneyRealtimeTimeline'));

const PERIODS = [
  { key: '7', label: 'Últimos 7 dias', days: 7 },
  { key: '30', label: 'Últimos 30 dias', days: 30 },
  { key: '90', label: 'Últimos 90 dias', days: 90 },
  { key: '365', label: 'Últimos 12 meses', days: 365 },
];

export function LeadJourneyPage() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const [period, setPeriod] = useState('30');
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<string | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<JourneyCategory | null>(null);
  const [selectedLead, setSelectedLead] = useState<{ id: string; name: string } | null>(null);

  const filters = useMemo<JourneyFilters | null>(() => {
    if (!orgId) return null;
    const days = PERIODS.find(p => p.key === period)?.days ?? 30;
    const from = new Date();
    from.setDate(from.getDate() - days);
    return {
      organizationId: orgId,
      from: from.toISOString(),
      channel: channelFilter,
      origin: originFilter,
      utmCampaign: campaignFilter,
    };
  }, [orgId, period, channelFilter, originFilter, campaignFilter]);

  const metrics = useJourneyMetrics(filters);
  const stages = useJourneyStages(filters);
  const touchpoints = useJourneyTouchpoints(filters);

  if (!orgId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Carregando organização...
      </div>
    );
  }

  const activeFilters = [
    channelFilter && { label: `Canal: ${channelFilter}`, clear: () => setChannelFilter(null) },
    originFilter && { label: `Origem: ${originFilter}`, clear: () => setOriginFilter(null) },
    campaignFilter && { label: `Campanha: ${campaignFilter}`, clear: () => setCampaignFilter(null) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  const openLead = (id: string, name: string) => {
    setSelectedStage(null);
    setSelectedLead({ id, name });
  };

  return (
    <div className="relative">
      {/* backdrop suave para separar da área de app */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/[0.04] via-primary/[0.015] to-transparent" />

      <div className="relative flex flex-col gap-6 p-4 md:p-8 max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary flex items-center justify-center ring-1 ring-primary/20 shadow-sm">
              <Route className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-[28px] font-bold tracking-tight leading-none">
                Jornada do Lead
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Origem, funil, gargalos e receita em tempo real.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {activeFilters.map((f, i) => (
              <Button key={i} variant="secondary" size="sm" onClick={f.clear} className="rounded-full h-9 gap-1.5">
                {f.label}
                <X className="h-3.5 w-3.5" />
              </Button>
            ))}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[190px] h-11 rounded-xl font-semibold shadow-sm">
                <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map(p => (
                  <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* Hint: quando não há dados históricos, avisar que o período maior não muda os números. */}
        {metrics.data && metrics.data.leadsCaptured === 0 && metrics.data.sales === 0 && (
          <p className="text-xs text-muted-foreground -mt-2">
            Sem movimentação nesse período. Tente ampliar a janela.
          </p>
        )}

        {/* KPI Row */}
        <JourneyDashboard metrics={metrics.data} isLoading={metrics.isLoading} />

        {/* Funil (hero) */}
        <JourneyFunnel
          stages={stages.data}
          isLoading={stages.isLoading}
          onStageClick={setSelectedStage}
        />

        {/* Aquisição + Timeline realtime lado a lado */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-5">
          <Suspense fallback={<Skeleton className="h-80 w-full rounded-lg" />}>
            <JourneyAcquisition
              filters={filters}
              onOriginClick={(o) => { setOriginFilter(o); setSelectedStage('origin'); }}
              onCampaignClick={(c) => { setCampaignFilter(c); setSelectedStage('origin'); }}
              onCreativeClick={() => { /* futuro */ }}
            />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
            <JourneyRealtimeTimeline filters={filters} onLeadClick={openLead} />
          </Suspense>
        </div>

        {/* Touchpoints + Gargalos */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-5">
          <JourneyTouchpoints
            touchpoints={touchpoints.data}
            isLoading={touchpoints.isLoading}
            activeChannel={channelFilter}
            onChannelClick={(ch) => setChannelFilter(prev => prev === ch ? null : ch)}
          />
          <Suspense fallback={<Skeleton className="h-40 w-full rounded-lg" />}>
            <JourneyBottlenecks
              filters={filters}
              onBottleneckClick={(b) => {
                if (b.key === 'stalled_opportunities' || b.key === 'proposals_no_reply') setSelectedStage('opportunity');
                else if (b.key === 'meetings_unconfirmed') setSelectedStage('meeting');
                else setSelectedStage('contact');
              }}
            />
          </Suspense>
        </div>

        {/* Heatmap + Timing */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Suspense fallback={<Skeleton className="h-52 w-full rounded-lg" />}>
            <JourneyFunnelHeatmap stages={stages.data} isLoading={stages.isLoading} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-52 w-full rounded-lg" />}>
            <JourneyStageTiming stages={stages.data} isLoading={stages.isLoading} />
          </Suspense>
        </div>

        <JourneyStageDrawer
          filters={filters}
          category={selectedStage}
          onClose={() => setSelectedStage(null)}
          onLeadSelect={openLead}
        />

        <JourneyTimelineDrawer
          leadId={selectedLead?.id ?? null}
          leadName={selectedLead?.name}
          onClose={() => setSelectedLead(null)}
        />
      </div>
    </div>
  );
}

export default LeadJourneyPage;
