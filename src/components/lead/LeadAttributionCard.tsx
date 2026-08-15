import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Loader2, ExternalLink } from 'lucide-react';
import { formatDistanceStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Attribution = {
  provider: string;
  campaign_id: string | null; campaign_name: string | null;
  adset_id: string | null; adset_name: string | null;
  ad_id: string | null; ad_name: string | null;
  creative_id: string | null; creative_name: string | null;
  placement: string | null;
  fbclid: string | null; ctwa_clid: string | null; gclid: string | null; ttclid: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
  utm_content: string | null; utm_term: string | null;
  attribution_method: string | null;
  confidence_score: number | null;
  attributed_at: string | null;
};

const PROVIDER_LABEL: Record<string, string> = {
  meta: 'Meta Ads', google: 'Google Ads', tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn', email: 'E-mail', utm: 'UTM', qr: 'QR Code', whatsapp: 'WhatsApp',
};

const METHOD_LABEL: Record<string, string> = {
  fbclid: 'fbclid', ctwa: 'Click-to-WhatsApp',
  utm_exact: 'UTM (exato)', utm_fuzzy: 'UTM (aproximado)',
  manual: 'Manual', gclid: 'gclid', ttclid: 'ttclid',
};

export function LeadAttributionCard({ leadId, leadCreatedAt }: { leadId: string; leadCreatedAt: string | null }) {
  const [rows, setRows] = useState<Attribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('lead_attribution')
        .select('provider, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, creative_id, creative_name, placement, fbclid, ctwa_clid, gclid, ttclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, attribution_method, confidence_score, attributed_at')
        .eq('lead_id', leadId)
        .order('attributed_at', { ascending: false });
      if (!cancelled) { setRows((data ?? []) as Attribution[]); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  if (loading) {
    return (
      <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando atribuição…
      </CardContent></Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Target className="h-4 w-4" /> Nenhuma atribuição resolvida para este lead ainda.
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-primary" /> Atribuição
          </div>
          <span className="text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? 'origem' : 'origens'}</span>
        </div>

        <div className="space-y-2">
          {rows.map((r, idx) => {
            const window = r.attributed_at && leadCreatedAt
              ? formatDistanceStrict(new Date(r.attributed_at), new Date(leadCreatedAt), { locale: ptBR, addSuffix: false })
              : null;
            const confPct = r.confidence_score != null ? Math.round(Number(r.confidence_score) * 100) : null;
            const clickId = r.fbclid || r.ctwa_clid || r.gclid || r.ttclid;
            return (
              <div key={`${r.provider}-${idx}`} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{PROVIDER_LABEL[r.provider] ?? r.provider}</Badge>
                    {r.attribution_method && (
                      <Badge variant="outline" className="text-xs">
                        {METHOD_LABEL[r.attribution_method] ?? r.attribution_method}
                        {confPct != null && ` · ${confPct}%`}
                      </Badge>
                    )}
                  </div>
                  {window && (
                    <span className="text-xs text-muted-foreground">Janela: {window}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <Row label="Campanha" value={r.campaign_name} secondary={r.campaign_id} />
                  <Row label="Conjunto" value={r.adset_name} secondary={r.adset_id} />
                  <Row label="Anúncio" value={r.ad_name} secondary={r.ad_id} />
                  <Row label="Criativo" value={r.creative_name} secondary={r.creative_id} />
                  {r.placement && <Row label="Posicionamento" value={r.placement} />}
                  {clickId && <Row label="Click ID" value={clickId} mono />}
                </div>

                {(r.utm_source || r.utm_medium || r.utm_campaign || r.utm_content || r.utm_term) && (
                  <div className="pt-2 border-t flex flex-wrap gap-1">
                    {r.utm_source && <UtmChip k="source" v={r.utm_source} />}
                    {r.utm_medium && <UtmChip k="medium" v={r.utm_medium} />}
                    {r.utm_campaign && <UtmChip k="campaign" v={r.utm_campaign} />}
                    {r.utm_content && <UtmChip k="content" v={r.utm_content} />}
                    {r.utm_term && <UtmChip k="term" v={r.utm_term} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, secondary, mono }: { label: string; value: string | null; secondary?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-1 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={`truncate ${mono ? 'font-mono' : 'font-medium'}`} title={value}>{value}</span>
      {secondary && <span className="text-muted-foreground text-[10px] truncate">· {secondary}</span>}
    </div>
  );
}

function UtmChip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-background border">
      <span className="text-muted-foreground">utm_{k}</span>
      <span className="font-mono truncate max-w-[140px]" title={v}>{v}</span>
    </span>
  );
}
