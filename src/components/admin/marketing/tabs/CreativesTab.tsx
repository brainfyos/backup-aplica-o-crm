import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, ImageIcon } from 'lucide-react';
import { useMarketingCtx, iso } from '../context/MarketingFiltersContext';
import { fmtBRL, fmtInt, safeDiv } from '../lib/format';
import { conversionGoalLabel } from '../lib/conversionGoals';

type Creative = { id: string; external_id: string; name: string | null; thumbnail_url: string | null; media_url: string | null; headline: string | null };
type Ad = { external_id: string; creative_external_id: string | null; name: string | null };
type Aggregate = { spend: number; clicks: number; conversions: number };
type ConversionRow = { entity_external_id: string; count: number };

export function CreativesTab() {
  const { orgId, filters, selectedConversion } = useMarketingCtx();
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [insights, setInsights] = useState<{ entity_external_id: string; spend: number; clicks: number }[]>([]);
  const [conversionRows, setConversionRows] = useState<ConversionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const conversionQuery = selectedConversion
        ? (supabase as any).from('marketing_conversion_metrics_daily').select('entity_external_id, count')
          .eq('organization_id', orgId).eq('provider', 'meta').eq('entity_type', 'ad')
          .eq('action_type', selectedConversion.external_id)
          .gte('date', iso(filters.range.from)).lte('date', iso(filters.range.to)).limit(20000)
        : Promise.resolve({ data: [] });
      const [{ data: cre }, { data: ad }, { data: ins }, { data: conv }] = await Promise.all([
        supabase.from('marketing_creatives').select('id, external_id, name, thumbnail_url, media_url, headline')
          .eq('organization_id', orgId).eq('provider', 'meta').limit(500),
        supabase.from('marketing_ads').select('external_id, creative_external_id, name')
          .eq('organization_id', orgId).eq('provider', 'meta').limit(2000),
        supabase.from('marketing_insights_daily').select('entity_external_id, spend, clicks')
          .eq('organization_id', orgId).eq('provider', 'meta').eq('entity_type', 'ad')
          .gte('date', iso(filters.range.from)).lte('date', iso(filters.range.to)).limit(20000),
        conversionQuery,
      ]);
      setCreatives((cre ?? []) as Creative[]);
      setAds((ad ?? []) as Ad[]);
      setInsights((ins ?? []) as any);
      setConversionRows((conv ?? []) as ConversionRow[]);
      setLoading(false);
    })();
  }, [orgId, filters.range.from, filters.range.to, selectedConversion?.external_id]);

  const perCreative = useMemo(() => {
    const adToCre: Record<string, string> = {};
    for (const a of ads) if (a.creative_external_id) adToCre[a.external_id] = a.creative_external_id;
    const adCountByCre: Record<string, number> = {};
    for (const a of ads) if (a.creative_external_id) adCountByCre[a.creative_external_id] = (adCountByCre[a.creative_external_id] ?? 0) + 1;
    const map: Record<string, Aggregate> = {};
    for (const i of insights) {
      const cre = adToCre[i.entity_external_id]; if (!cre) continue;
      const m = (map[cre] ||= { spend: 0, clicks: 0, conversions: 0 });
      m.spend += Number(i.spend||0); m.clicks += Number(i.clicks||0);
    }
    for (const row of conversionRows) {
      const cre = adToCre[row.entity_external_id]; if (!cre) continue;
      const m = (map[cre] ||= { spend: 0, clicks: 0, conversions: 0 });
      m.conversions += Number(row.count || 0);
    }
    return { agg: map, adCount: adCountByCre };
  }, [ads, insights, conversionRows]);

  const sorted = useMemo(() => {
    return [...creatives].sort((a, b) => (perCreative.agg[b.external_id]?.spend ?? 0) - (perCreative.agg[a.external_id]?.spend ?? 0));
  }, [creatives, perCreative]);

  if (loading) return (
    <Card><CardContent className="p-12 flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando criativos…
    </CardContent></Card>
  );

  if (creatives.length === 0) return (
    <Card><CardContent className="p-12 text-center text-muted-foreground text-sm">
      Nenhum criativo sincronizado ainda. Rode a sincronização de Meta Ads.
    </CardContent></Card>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {sorted.map((c) => {
        const m = perCreative.agg[c.external_id];
        const thumb = c.thumbnail_url || c.media_url;
        return (
          <Card key={c.id} className="overflow-hidden hover:shadow-md transition">
            <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
              {thumb ? (
                <img src={thumb} alt={c.name || ''} loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
              )}
            </div>
            <CardContent className="p-3 space-y-2">
              <div className="text-sm font-medium truncate" title={c.name || c.external_id}>
                {c.headline || c.name || c.external_id}
              </div>
              <div className="text-xs text-muted-foreground">{perCreative.adCount[c.external_id] ?? 0} anúncios</div>
              <div className="grid grid-cols-4 gap-1 text-xs">
                <Metric label="Invest." value={fmtBRL(m?.spend ?? 0)} />
                <Metric label="Cliques" value={fmtInt(m?.clicks ?? 0)} />
                <Metric label={selectedConversion ? conversionGoalLabel(selectedConversion.name) : 'Resultados'} value={fmtInt(m?.conversions ?? 0)} />
                <Metric label="Custo/res." value={m?.conversions ? fmtBRL(safeDiv(m.spend, m.conversions) ?? 0) : '—'} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
