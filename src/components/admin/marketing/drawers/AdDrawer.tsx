import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { statusLabel, statusTone } from '@/lib/metaAdsLabels';
import { fmtBRL, fmtInt, fmtPct100, fmtRoas, safeDiv } from '../lib/format';
import { useMarketingCtx } from '../context/MarketingFiltersContext';
import { conversionGoalLabel } from '../lib/conversionGoals';

type Aggregate = { spend: number; impressions: number; clicks: number; ctwa: number; purchases: number; revenue: number };
type Ad = { external_id: string; name: string | null; status: string | null; campaign_external_id: string | null };
type Creative = { external_id: string; name: string | null; headline: string | null; body: string | null; thumbnail_url: string | null; media_url: string | null } | null;

export function AdDrawer({
  ad, metrics, campaignName, open, onOpenChange,
}: {
  ad: Ad | null;
  metrics: Aggregate | null;
  campaignName?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { orgId, selectedConversion, conversionHasValue } = useMarketingCtx();
  const [creative, setCreative] = useState<Creative>(null);

  useEffect(() => {
    if (!open || !ad || !orgId) return;
    (async () => {
      const { data: adRow } = await supabase.from('marketing_ads')
        .select('preview_url, metadata, creative_external_id')
        .eq('organization_id', orgId).eq('external_id', ad.external_id).maybeSingle();
      const creExt = (adRow as any)?.creative_external_id;
      if (!creExt) { setCreative(null); return; }
      const { data: cre } = await supabase.from('marketing_creatives')
        .select('external_id, name, headline, body, thumbnail_url, media_url')
        .eq('organization_id', orgId).eq('external_id', creExt).maybeSingle();
      setCreative((cre as any) ?? null);
    })();
  }, [open, ad?.external_id, orgId]);

  const tone = statusTone(ad?.status ?? null);
  const m = metrics;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">{ad?.name || ad?.external_id || 'Anúncio'}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant={tone === 'active' ? 'default' : tone === 'destructive' ? 'destructive' : 'outline'}>
              {statusLabel(ad?.status ?? null)}
            </Badge>
            {campaignName && <span className="text-xs truncate">{campaignName}</span>}
          </SheetDescription>
        </SheetHeader>

        {creative && (creative.thumbnail_url || creative.media_url) && (
          <div className="mt-6 rounded-lg overflow-hidden border bg-muted/30">
            <img
              src={creative.thumbnail_url || creative.media_url || ''}
              alt={creative.name || ''}
              className="w-full max-h-72 object-contain"
              loading="lazy"
            />
          </div>
        )}
        {creative && (creative.headline || creative.body) && (
          <div className="mt-4 space-y-1">
            {creative.headline && <div className="font-medium text-sm">{creative.headline}</div>}
            {creative.body && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{creative.body}</div>}
          </div>
        )}

        {m && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Pill label="Investimento" value={fmtBRL(m.spend)} />
            <Pill label="Impressões" value={fmtInt(m.impressions)} />
            <Pill label="Cliques" value={fmtInt(m.clicks)} />
            <Pill label="CTR" value={fmtPct100(m.impressions ? (m.clicks/m.impressions)*100 : null)} />
            <Pill label="CPC" value={m.clicks ? fmtBRL(m.spend/m.clicks) : '—'} />
            <Pill label="CTWA" value={fmtInt(m.ctwa)} />
            <Pill label={selectedConversion ? conversionGoalLabel(selectedConversion.name) : 'Conversões'} value={fmtInt(m.purchases)} />
            {conversionHasValue && <Pill label="Receita" value={fmtBRL(m.revenue)} />}
            {conversionHasValue && <Pill label="ROAS" value={fmtRoas(safeDiv(m.revenue, m.spend))} />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}
