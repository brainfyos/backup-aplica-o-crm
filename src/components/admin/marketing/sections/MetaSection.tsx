import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MarketingShell } from '../MarketingShell';
import { OverviewTab } from '../tabs/OverviewTab';
import { CampaignsTab } from '../tabs/CampaignsTab';
import { AdsTab } from '../tabs/AdsTab';
import { CreativesTab } from '../tabs/CreativesTab';
import { useIsMobile } from '@/hooks/use-mobile';
import { MarketingMobileShell } from '../mobile/MarketingMobileShell';
import { AlertTriangle } from 'lucide-react';

const VALID = ['overview', 'campaigns', 'ads', 'creatives'] as const;

export function MetaSection() {
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const view = (VALID.includes(params.get('view') as any) ? params.get('view') : 'overview') as string;
  const setView = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('view', v);
    setParams(next, { replace: true });
  };

  if (isMobile) {
    return <MarketingMobileShell />;
  }

  return (
    <MarketingShell scope="meta" title="Marketing · Meta Ads">
      {(ctx) => (
        <div className="space-y-4">
          {!ctx.salesVerified && (
            <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">Vendas da Meta em quarentena</p>
                <p className="text-xs text-muted-foreground">Os eventos Purchase ainda não foram validados pelo checkout/CRM. Eles não entram em vendas, receita, ROAS, regras ou decisões da IA.</p>
              </div>
            </div>
          )}
          <Tabs value={view} onValueChange={setView}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="campaigns">Campanhas ({ctx.filteredCampaigns.length})</TabsTrigger>
            <TabsTrigger value="ads">Anúncios ({ctx.filteredAds.length})</TabsTrigger>
            <TabsTrigger value="creatives">Criativos</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4">
            <OverviewTab kpis={ctx.kpis} campaigns={ctx.filteredCampaigns} ads={ctx.filteredAds} perCampaign={ctx.perCampaign} perAd={ctx.perAd} campaignsAll={ctx.campaigns} conversionLabel={ctx.conversionLabel} conversionHasValue={ctx.conversionHasValue} />
          </TabsContent>
          <TabsContent value="campaigns" className="mt-4">
            <CampaignsTab campaigns={ctx.filteredCampaigns} perCampaign={ctx.perCampaign} conversionLabel={ctx.conversionLabel} conversionHasValue={ctx.conversionHasValue} />
          </TabsContent>
          <TabsContent value="ads" className="mt-4">
            <AdsTab ads={ctx.filteredAds} campaigns={ctx.campaigns} perAd={ctx.perAd} conversionLabel={ctx.conversionLabel} conversionHasValue={ctx.conversionHasValue} />
          </TabsContent>
          <TabsContent value="creatives" className="mt-4"><CreativesTab /></TabsContent>
          </Tabs>
        </div>
      )}
    </MarketingShell>
  );
}
