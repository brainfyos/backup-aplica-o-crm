import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OverviewTab } from './tabs/OverviewTab';
import { CampaignsTab } from './tabs/CampaignsTab';
import { AdsTab } from './tabs/AdsTab';
import { CreativesTab } from './tabs/CreativesTab';
import { ConversionsTab } from './tabs/ConversionsTab';
import { JourneyTab } from './tabs/JourneyTab';
import { LeadsTab } from './tabs/LeadsTab';
import { RevenueTab } from './tabs/RevenueTab';
import { InsightsTab } from './tabs/InsightsTab';
import { OptimizationsTab } from './tabs/OptimizationsTab';
import { TechnicalTab } from './tabs/TechnicalTab';
import { useMarketingCtx, iso } from './context/MarketingFiltersContext';
import { conversionGoalLabel } from './lib/conversionGoals';

type Aggregate = { spend: number; impressions: number; clicks: number; ctwa: number; purchases: number; revenue: number };
type Ad = { id: string; external_id: string; name: string | null; status: string | null; adset_external_id: string | null; campaign_external_id: string | null };
type Campaign = { id: string; external_id: string; name: string | null; status: string | null; objective: string | null; daily_budget: number | null; ad_account_id: string | null };
type Insight = { entity_type: string; entity_external_id: string; date: string; spend: number; impressions: number; clicks: number; ctwa_clicks: number; purchases: number; revenue: number };

const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);
const pctDelta = (c: number, p: number): number | null => {
  if (!isFinite(c) || !isFinite(p)) return null;
  if (p === 0) return c === 0 ? 0 : null;
  return ((c - p) / Math.abs(p)) * 100;
};

type ConvRow = { entity_external_id: string; date: string; count: number; value: number };

export function MarketingBody({
  campaigns, ads, current, previous, currTotals, prevTotals,
  filteredCampaigns, filteredAds,
}: {
  campaigns: Campaign[];
  ads: Ad[];
  current: Insight[];
  previous: Insight[];
  currTotals: Aggregate;
  prevTotals: Aggregate;
  filteredCampaigns: Campaign[];
  filteredAds: Ad[];
}) {
  const { orgId, filters, selectedConversion, conversionHasValue } = useMarketingCtx();
  const actionType = selectedConversion?.external_id ?? null;

  const [convRows, setConvRows] = useState<ConvRow[]>([]);

  useEffect(() => {
    if (!orgId || !actionType) { setConvRows([]); return; }
    let cancelled = false;
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 400);
      const { data } = await (supabase as any)
        .from('marketing_conversion_metrics_daily')
        .select('entity_external_id, date, count, value')
        .eq('organization_id', orgId).eq('provider', 'meta').eq('entity_type', 'ad')
        .eq('action_type', actionType)
        .gte('date', iso(since))
        .limit(20000);
      if (!cancelled) setConvRows((data ?? []) as ConvRow[]);
    })();
    return () => { cancelled = true; };
  }, [orgId, actionType]);

  const { convCurr, convPrev, convByAd, convByCampaign } = useMemo(() => {
    const fromKey = iso(filters.range.from);
    const toKey = iso(filters.range.to);
    const spanDays = Math.round((filters.range.to.getTime() - filters.range.from.getTime()) / 864e5);
    const prevToDate = new Date(filters.range.from); prevToDate.setDate(prevToDate.getDate() - 1);
    const prevFromDate = new Date(prevToDate); prevFromDate.setDate(prevFromDate.getDate() - spanDays);
    const prevFromKey = iso(prevFromDate);
    const prevToKey = iso(prevToDate);
    const adSet = new Set(filteredAds.map((a) => a.external_id));
    const adToCamp: Record<string, string> = {};
    ads.forEach((a) => { if (a.campaign_external_id) adToCamp[a.external_id] = a.campaign_external_id; });

    let curCount = 0, curValue = 0, prvCount = 0, prvValue = 0;
    const byAd: Record<string, { count: number; value: number }> = {};
    const byCamp: Record<string, { count: number; value: number }> = {};

    for (const r of convRows) {
      if (!adSet.has(r.entity_external_id)) continue;
      const dateKey = r.date.slice(0, 10);
      const cnt = Number(r.count || 0);
      const val = Number(r.value || 0);
      if (dateKey >= fromKey && dateKey <= toKey) {
        curCount += cnt; curValue += val;
        const a = (byAd[r.entity_external_id] ||= { count: 0, value: 0 });
        a.count += cnt; a.value += val;
        const camp = adToCamp[r.entity_external_id];
        if (camp) {
          const c = (byCamp[camp] ||= { count: 0, value: 0 });
          c.count += cnt; c.value += val;
        }
      } else if (dateKey >= prevFromKey && dateKey <= prevToKey) {
        prvCount += cnt; prvValue += val;
      }
    }
    return {
      convCurr: { count: curCount, value: curValue },
      convPrev: { count: prvCount, value: prvValue },
      convByAd: byAd,
      convByCampaign: byCamp,
    };
  }, [convRows, filteredAds, ads, filters.range]);

  const kpis = useMemo(() => {
    const c = currTotals; const p = prevTotals;
    const ctr = (t: Aggregate) => safeDiv(t.clicks, t.impressions);
    const cpc = (t: Aggregate) => safeDiv(t.spend, t.clicks);
    const cpm = (t: Aggregate) => safeDiv(t.spend * 1000, t.impressions);
    const roas = (rev: number, spend: number) => safeDiv(rev, spend);

    // Base leads = CTWA. Se conversão selecionada, sobrescreve por count.
    const leadsCurr = actionType ? convCurr.count : c.ctwa;
    const leadsPrev = actionType ? convPrev.count : p.ctwa;
    const cplCurr = safeDiv(c.spend, leadsCurr);
    const cplPrev = safeDiv(p.spend, leadsPrev);

    // Compras/Receita: se conversão selecionada tem valor, usa dela; senão, mantém insights.purchases/revenue.
    const purCurr = actionType && conversionHasValue ? convCurr.count : c.purchases;
    const purPrev = actionType && conversionHasValue ? convPrev.count : p.purchases;
    const revCurr = actionType && conversionHasValue ? convCurr.value : c.revenue;
    const revPrev = actionType && conversionHasValue ? convPrev.value : p.revenue;

    return {
      spend: { curr: c.spend, delta: pctDelta(c.spend, p.spend) },
      impressions: { curr: c.impressions, delta: pctDelta(c.impressions, p.impressions) },
      clicks: { curr: c.clicks, delta: pctDelta(c.clicks, p.clicks) },
      ctr: { curr: ctr(c), delta: pctDelta(ctr(c) ?? 0, ctr(p) ?? 0) },
      cpc: { curr: cpc(c), delta: pctDelta(cpc(c) ?? 0, cpc(p) ?? 0) },
      cpm: { curr: cpm(c), delta: pctDelta(cpm(c) ?? 0, cpm(p) ?? 0) },
      leads: { curr: leadsCurr, delta: pctDelta(leadsCurr, leadsPrev) },
      cpl: { curr: cplCurr, delta: pctDelta(cplCurr ?? 0, cplPrev ?? 0) },
      conversas: { curr: c.ctwa, delta: pctDelta(c.ctwa, p.ctwa) },
      purchases: { curr: purCurr, delta: pctDelta(purCurr, purPrev) },
      revenue: { curr: revCurr, delta: pctDelta(revCurr, revPrev) },
      roas: { curr: roas(revCurr, c.spend), delta: pctDelta(roas(revCurr, c.spend) ?? 0, roas(revPrev, p.spend) ?? 0) },
    };
  }, [currTotals, prevTotals, actionType, conversionHasValue, convCurr, convPrev]);

  const perCampaign = useMemo(() => {
    const adToCamp: Record<string, string> = {};
    ads.forEach((a) => { if (a.campaign_external_id) adToCamp[a.external_id] = a.campaign_external_id; });
    const map: Record<string, Aggregate> = {};
    for (const i of current) {
      const camp = adToCamp[i.entity_external_id]; if (!camp) continue;
      const m = (map[camp] ||= { spend:0,impressions:0,clicks:0,ctwa:0,purchases:0,revenue:0 });
      m.spend += Number(i.spend || 0); m.impressions += Number(i.impressions || 0); m.clicks += Number(i.clicks || 0);
      m.ctwa += Number(i.ctwa_clicks || 0); m.purchases += Number(i.purchases || 0); m.revenue += Number(i.revenue || 0);
    }
    if (actionType) {
      for (const [camp, m] of Object.entries(map)) {
        const cv = convByCampaign[camp];
        m.purchases = cv ? cv.count : 0;
        m.revenue = conversionHasValue && cv ? cv.value : 0;
      }
    }
    return map;
  }, [current, ads, actionType, conversionHasValue, convByCampaign]);

  const perAd = useMemo(() => {
    const map: Record<string, Aggregate> = {};
    for (const i of current) {
      const m = (map[i.entity_external_id] ||= { spend:0,impressions:0,clicks:0,ctwa:0,purchases:0,revenue:0 });
      m.spend += Number(i.spend || 0); m.impressions += Number(i.impressions || 0); m.clicks += Number(i.clicks || 0);
      m.ctwa += Number(i.ctwa_clicks || 0); m.purchases += Number(i.purchases || 0); m.revenue += Number(i.revenue || 0);
    }
    if (actionType) {
      for (const [id, m] of Object.entries(map)) {
        const cv = convByAd[id];
        m.purchases = cv ? cv.count : 0;
        m.revenue = conversionHasValue && cv ? cv.value : 0;
      }
    }
    return map;
  }, [current, actionType, conversionHasValue, convByAd]);

  const conversionLabel = selectedConversion ? conversionGoalLabel(selectedConversion.name) : null;

  return (
    <Tabs defaultValue="overview">
      <TabsList className="flex flex-wrap h-auto">
        <TabsTrigger value="overview">Visão Geral</TabsTrigger>
        <TabsTrigger value="campaigns">Campanhas ({filteredCampaigns.length})</TabsTrigger>
        <TabsTrigger value="ads">Anúncios ({filteredAds.length})</TabsTrigger>
        <TabsTrigger value="creatives">Criativos</TabsTrigger>
        <TabsTrigger value="conversions">Conversões</TabsTrigger>
        <TabsTrigger value="journey">Jornada</TabsTrigger>
        <TabsTrigger value="leads">Leads</TabsTrigger>
        <TabsTrigger value="revenue">Receita</TabsTrigger>
        <TabsTrigger value="insights">Insights</TabsTrigger>
        <TabsTrigger value="optimizations">Otimizações</TabsTrigger>
        <TabsTrigger value="technical">Técnico</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <OverviewTab
          kpis={kpis}
          campaigns={filteredCampaigns}
          ads={filteredAds}
          perCampaign={perCampaign}
          perAd={perAd}
          campaignsAll={campaigns}
          conversionLabel={conversionLabel}
          conversionHasValue={conversionHasValue}
        />
      </TabsContent>
      <TabsContent value="campaigns" className="mt-4">
        <CampaignsTab campaigns={filteredCampaigns} perCampaign={perCampaign} conversionLabel={conversionLabel} conversionHasValue={conversionHasValue} />
      </TabsContent>
      <TabsContent value="ads" className="mt-4">
        <AdsTab ads={filteredAds} campaigns={campaigns} perAd={perAd} conversionLabel={conversionLabel} conversionHasValue={conversionHasValue} />
      </TabsContent>
      <TabsContent value="creatives" className="mt-4"><CreativesTab /></TabsContent>
      <TabsContent value="conversions" className="mt-4"><ConversionsTab /></TabsContent>
      <TabsContent value="journey" className="mt-4"><JourneyTab /></TabsContent>
      <TabsContent value="leads" className="mt-4"><LeadsTab /></TabsContent>
      <TabsContent value="revenue" className="mt-4"><RevenueTab /></TabsContent>
      <TabsContent value="insights" className="mt-4"><InsightsTab /></TabsContent>
      <TabsContent value="optimizations" className="mt-4"><OptimizationsTab /></TabsContent>
      <TabsContent value="technical" className="mt-4"><TechnicalTab /></TabsContent>
    </Tabs>
  );
}
