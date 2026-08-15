import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import {
  Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import { MetaAdsWizard } from '@/components/admin/integrations/MetaAdsWizard';
import { MetaOAuthConnectButton } from '@/components/admin/integrations/MetaOAuthConnectButton';
import { MarketingFiltersBar, MarketingFilters } from './filters/MarketingFiltersBar';
import { computeRange } from './filters/DateRangeControl';
import { objectiveLabel } from '@/lib/metaAdsLabels';
import { MarketingFiltersProvider, iso } from './context/MarketingFiltersContext';
import { MarketingBody } from './MarketingBody';
import { ConversionFilter } from './filters/ConversionFilter';


async function extractFnError(error: any): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try { const body = await error.context.json(); return body?.details || body?.error || error.message; }
    catch { try { return await error.context.text(); } catch { /* ignore */ } }
  }
  return error?.message ?? String(error);
}

type Credential = {
  id: string; organization_id: string; provider: string;
  ad_account_id: string | null; business_id: string | null;
  account_name: string | null; is_active: boolean;
  last_sync_at: string | null; last_sync_status: string | null; last_sync_error: string | null;
};
type Campaign = { id: string; external_id: string; name: string | null; status: string | null; objective: string | null; daily_budget: number | null; ad_account_id: string | null };
type Adset = { id: string; external_id: string; name: string | null; status: string | null; campaign_external_id: string | null };
type Ad = { id: string; external_id: string; name: string | null; status: string | null; adset_external_id: string | null; campaign_external_id: string | null };
type Insight = { entity_type: string; entity_external_id: string; date: string; spend: number; impressions: number; clicks: number; ctwa_clicks: number; purchases: number; revenue: number };

type Aggregate = { spend: number; impressions: number; clicks: number; ctwa: number; purchases: number; revenue: number };
const emptyAgg = (): Aggregate => ({ spend: 0, impressions: 0, clicks: 0, ctwa: 0, purchases: 0, revenue: 0 });
const sumInsights = (l: Insight[]): Aggregate => l.reduce((a, i) => ({
  spend: a.spend + Number(i.spend || 0),
  impressions: a.impressions + Number(i.impressions || 0),
  clicks: a.clicks + Number(i.clicks || 0),
  ctwa: a.ctwa + Number(i.ctwa_clicks || 0),
  purchases: a.purchases + Number(i.purchases || 0),
  revenue: a.revenue + Number(i.revenue || 0),
}), emptyAgg());
const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);
const pctDelta = (c: number, p: number): number | null => {
  if (!isFinite(c) || !isFinite(p)) return null;
  if (p === 0) return c === 0 ? 0 : null;
  return ((c - p) / Math.abs(p)) * 100;
};

const defaultFilters = (): MarketingFilters => ({
  range: computeRange('30d'), adAccounts: [], campaignIds: [], adsetIds: [], adIds: [], objectives: [], status: 'all', onlyActive: false,
});

function rel(dt: string | null) {
  if (!dt) return 'nunca';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h atrás`;
  return `${Math.floor(h / 24)} d atrás`;
}

export function MarketingManager() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;

  const [loading, setLoading] = useState(true);
  const [cred, setCred] = useState<Credential | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adsets, setAdsets] = useState<Adset[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [filters, setFilters] = useState<MarketingFilters>(defaultFilters());

  const loadCredential = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase.from('org_marketing_credentials')
      .select('id, organization_id, provider, ad_account_id, business_id, account_name, is_active, last_sync_at, last_sync_status, last_sync_error')
      .eq('organization_id', orgId).eq('provider', 'meta').eq('is_active', true).maybeSingle();
    setCred((data as Credential | null) ?? null);
    setLoading(false);
  };

  const loadData = async () => {
    if (!orgId) return;
    const since = new Date();
    since.setDate(since.getDate() - 400);
    const [{ data: c }, { data: aset }, { data: a }, { data: i }] = await Promise.all([
      supabase.from('marketing_campaigns').select('id, external_id, name, status, objective, daily_budget, ad_account_id').eq('organization_id', orgId).eq('provider', 'meta').order('name').limit(1000),
      supabase.from('marketing_adsets').select('id, external_id, name, status, campaign_external_id').eq('organization_id', orgId).eq('provider', 'meta').order('name').limit(2000),
      supabase.from('marketing_ads').select('id, external_id, name, status, adset_external_id, campaign_external_id').eq('organization_id', orgId).eq('provider', 'meta').order('name').limit(2000),
      supabase.from('marketing_insights_daily').select('entity_type, entity_external_id, date, spend, impressions, clicks, ctwa_clicks, purchases, revenue').eq('organization_id', orgId).eq('provider', 'meta').gte('date', iso(since)).order('date', { ascending: false }).limit(20000),
    ]);
    setCampaigns((c ?? []) as Campaign[]);
    setAdsets((aset ?? []) as Adset[]);
    setAds((a ?? []) as Ad[]);
    setInsights((i ?? []) as Insight[]);
  };

  useEffect(() => { loadCredential(); }, [orgId]);
  useEffect(() => { if (cred) loadData(); }, [cred?.id]);
  useEffect(() => {
    const refresh = () => { if (cred) void loadData(); };
    window.addEventListener('vendus:marketing-data-changed', refresh);
    return () => window.removeEventListener('vendus:marketing-data-changed', refresh);
  }, [cred]);

  // Backfill on-demand
  const [backfilledSince, setBackfilledSince] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  useEffect(() => {
    if (!orgId || !cred || backfilling) return;
    const wantSince = iso(filters.range.from);
    if (backfilledSince && wantSince >= backfilledSince) return;
    let oldest: string | null = null;
    for (const i of insights) if (!oldest || i.date < oldest) oldest = i.date;
    if (oldest && wantSince >= oldest) return;
    (async () => {
      setBackfilling(true);
      const t = toast.loading('Buscando histórico do período… (pode levar até 1 min)');
      try {
        const until = iso(new Date());
        const { data, error } = await supabase.functions.invoke('marketing-sync', {
          body: { organization_id: orgId, provider: 'meta', since: wantSince, until },
        });
        if (error) throw new Error(await extractFnError(error));
        if ((data as any)?.error) throw new Error((data as any).details || (data as any).error);
        setBackfilledSince(wantSince);
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) { await new Promise((r) => setTimeout(r, 5000)); await loadData(); }
        toast.success('Histórico atualizado', { id: t });
      } catch (e: any) {
        toast.error(`Falha ao buscar histórico: ${e?.message ?? e}`, { id: t });
      } finally { setBackfilling(false); }
    })();
  }, [filters.range.from, cred?.id, orgId, insights, backfilledSince, backfilling]);

  const handleSync = async () => {
    if (!orgId) return;
    setSyncing(true);
    const t = toast.loading('Sincronizando em segundo plano…');
    try {
      const { data, error } = await supabase.functions.invoke('marketing-sync', { body: { organization_id: orgId, provider: 'meta' } });
      if (error) throw new Error(await extractFnError(error));
      if ((data as any)?.error) throw new Error((data as any).details || (data as any).error);
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) { await new Promise((r) => setTimeout(r, 5000)); await Promise.all([loadCredential(), loadData()]); }
      // dispara attribution-engine em background
      supabase.functions.invoke('attribution-engine', { body: { organization_id: orgId } }).catch(() => {});
      toast.success('Sincronização concluída', { id: t });
    } catch (e: any) {
      toast.error(`Falha no sync: ${e?.message ?? e}`, { id: t });
    } finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    if (!cred) return;
    if (!confirm('Desconectar esta conta do Meta Ads? O catálogo permanece salvo mas a sincronização para.')) return;
    const { error } = await supabase.from('org_marketing_credentials').update({ is_active: false }).eq('id', cred.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Conta desconectada');
    setCred(null); setCampaigns([]); setAdsets([]); setAds([]); setInsights([]);
  };

  // Opções derivadas para filtros
  const adAccountOptions = useMemo(() => {
    const acc = new Set<string>();
    campaigns.forEach((c) => { if (c.ad_account_id) acc.add(c.ad_account_id); });
    if (cred?.ad_account_id) acc.add(cred.ad_account_id);
    return Array.from(acc).map((v) => ({ value: v, label: v === cred?.ad_account_id ? (cred.account_name || v) : v }));
  }, [campaigns, cred]);
  const availableObjectives = useMemo(() => {
    const s = new Set<string>(); campaigns.forEach((c) => { if (c.objective) s.add(c.objective); }); return Array.from(s);
  }, [campaigns]);

  const scope = useMemo(() => {
    const matchStatus = (s: string | null) => filters.onlyActive ? s === 'ACTIVE' : (filters.status === 'all' ? true : s === filters.status);
    const matchAccount = (acc: string | null) => filters.adAccounts.length === 0 || (acc != null && filters.adAccounts.includes(acc));
    const matchObjective = (o: string | null) => filters.objectives.length === 0 || (o != null && filters.objectives.includes(o));
    let campSet = new Set(campaigns.filter((c) => matchStatus(c.status) && matchAccount(c.ad_account_id) && matchObjective(c.objective)).map((c) => c.external_id));
    if (filters.campaignIds.length > 0) campSet = new Set([...campSet].filter((id) => filters.campaignIds.includes(id)));
    let adsetSet = new Set(adsets.filter((a) => a.campaign_external_id && campSet.has(a.campaign_external_id) && matchStatus(a.status)).map((a) => a.external_id));
    if (filters.adsetIds.length > 0) adsetSet = new Set([...adsetSet].filter((id) => filters.adsetIds.includes(id)));
    let adSet = new Set(ads.filter((a) => (a.campaign_external_id ? campSet.has(a.campaign_external_id) : false) && (a.adset_external_id ? adsetSet.has(a.adset_external_id) : true) && matchStatus(a.status)).map((a) => a.external_id));
    if (filters.adIds.length > 0) adSet = new Set([...adSet].filter((id) => filters.adIds.includes(id)));
    return { campSet, adsetSet, adSet };
  }, [campaigns, adsets, ads, filters]);

  const campaignOptions = useMemo(() => campaigns.map((c) => ({ value: c.external_id, label: c.name || c.external_id, hint: objectiveLabel(c.objective) })), [campaigns]);
  const adsetOptions = useMemo(() => adsets.filter((a) => filters.campaignIds.length === 0 || (a.campaign_external_id && filters.campaignIds.includes(a.campaign_external_id))).map((a) => ({ value: a.external_id, label: a.name || a.external_id })), [adsets, filters.campaignIds]);
  const adOptions = useMemo(() => ads.filter((a) => {
    if (filters.adsetIds.length && (!a.adset_external_id || !filters.adsetIds.includes(a.adset_external_id))) return false;
    if (filters.campaignIds.length && (!a.campaign_external_id || !filters.campaignIds.includes(a.campaign_external_id))) return false;
    return true;
  }).map((a) => ({ value: a.external_id, label: a.name || a.external_id })), [ads, filters.campaignIds, filters.adsetIds]);

  const { current, previous } = useMemo(() => {
    const fromMs = filters.range.from.getTime();
    const toMs = filters.range.to.getTime();
    const spanMs = toMs - fromMs;
    const prevTo = fromMs - 1; const prevFrom = prevTo - spanMs;
    const cur: Insight[] = []; const prev: Insight[] = [];
    for (const i of insights) {
      if (i.entity_type !== 'ad') continue;
      if (!scope.adSet.has(i.entity_external_id)) continue;
      const d = new Date(i.date).getTime();
      if (d >= fromMs && d <= toMs) cur.push(i);
      else if (d >= prevFrom && d <= prevTo) prev.push(i);
    }
    return { current: cur, previous: prev };
  }, [insights, scope.adSet, filters.range]);

  const currTotals = useMemo(() => sumInsights(current), [current]);
  const prevTotals = useMemo(() => sumInsights(previous), [previous]);

  const kpis = useMemo(() => {
    const c = currTotals; const p = prevTotals;
    const ctr = (t: Aggregate) => safeDiv(t.clicks, t.impressions);
    const cpc = (t: Aggregate) => safeDiv(t.spend, t.clicks);
    const cpm = (t: Aggregate) => safeDiv(t.spend * 1000, t.impressions);
    const cpl = (t: Aggregate) => safeDiv(t.spend, t.ctwa);
    const roas = (t: Aggregate) => safeDiv(t.revenue, t.spend);
    return {
      spend: { curr: c.spend, delta: pctDelta(c.spend, p.spend) },
      impressions: { curr: c.impressions, delta: pctDelta(c.impressions, p.impressions) },
      clicks: { curr: c.clicks, delta: pctDelta(c.clicks, p.clicks) },
      ctr: { curr: ctr(c), delta: pctDelta(ctr(c) ?? 0, ctr(p) ?? 0) },
      cpc: { curr: cpc(c), delta: pctDelta(cpc(c) ?? 0, cpc(p) ?? 0) },
      cpm: { curr: cpm(c), delta: pctDelta(cpm(c) ?? 0, cpm(p) ?? 0) },
      leads: { curr: c.ctwa, delta: pctDelta(c.ctwa, p.ctwa) },
      cpl: { curr: cpl(c), delta: pctDelta(cpl(c) ?? 0, cpl(p) ?? 0) },
      conversas: { curr: c.ctwa, delta: pctDelta(c.ctwa, p.ctwa) },
      purchases: { curr: c.purchases, delta: pctDelta(c.purchases, p.purchases) },
      revenue: { curr: c.revenue, delta: pctDelta(c.revenue, p.revenue) },
      roas: { curr: roas(c), delta: pctDelta(roas(c) ?? 0, roas(p) ?? 0) },
    };
  }, [currTotals, prevTotals]);

  const perCampaign = useMemo(() => {
    const adToCamp: Record<string, string> = {};
    ads.forEach((a) => { if (a.campaign_external_id) adToCamp[a.external_id] = a.campaign_external_id; });
    const map: Record<string, Aggregate> = {};
    for (const i of current) {
      const camp = adToCamp[i.entity_external_id]; if (!camp) continue;
      const m = (map[camp] ||= emptyAgg());
      m.spend += Number(i.spend || 0); m.impressions += Number(i.impressions || 0); m.clicks += Number(i.clicks || 0);
      m.ctwa += Number(i.ctwa_clicks || 0); m.purchases += Number(i.purchases || 0); m.revenue += Number(i.revenue || 0);
    }
    return map;
  }, [current, ads]);

  const perAd = useMemo(() => {
    const map: Record<string, Aggregate> = {};
    for (const i of current) {
      const m = (map[i.entity_external_id] ||= emptyAgg());
      m.spend += Number(i.spend || 0); m.impressions += Number(i.impressions || 0); m.clicks += Number(i.clicks || 0);
      m.ctwa += Number(i.ctwa_clicks || 0); m.purchases += Number(i.purchases || 0); m.revenue += Number(i.revenue || 0);
    }
    return map;
  }, [current]);

  const filteredCampaigns = useMemo(() => campaigns.filter((c) => scope.campSet.has(c.external_id)), [campaigns, scope.campSet]);
  const filteredAds = useMemo(() => ads.filter((a) => scope.adSet.has(a.external_id)), [ads, scope.adSet]);

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
    </div>
  );

  if (!cred) return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Marketing · Meta Ads</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Conecte sua conta do Facebook/Instagram Ads para trazer campanhas, criativos, gastos e atribuição CTWA (click-to-WhatsApp) para dentro da Jornada do Lead.
        </p>
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="font-semibold">Conectar em 1 clique</h3>
            <p className="text-sm text-muted-foreground">Autorize com sua conta do Facebook. Nós escolhemos as permissões corretas.</p>
          </div>
          {orgId && <MetaOAuthConnectButton organizationId={orgId} purpose="ads" label="Conectar com Facebook" onConnected={loadCredential} />}
        </CardContent>
      </Card>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Usar meu próprio Meta App (avançado)</summary>
        <div className="mt-4"><MetaAdsWizard /></div>
      </details>
    </div>
  );

  return (
    <MarketingFiltersProvider filters={filters} orgId={orgId}>
      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Marketing · Meta Ads</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {cred.account_name || cred.ad_account_id} ·
              <span className="ml-2 inline-flex items-center gap-1">
                {cred.last_sync_status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> :
                 cred.last_sync_status ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : null}
                Última sync: {rel(cred.last_sync_at)}
              </span>
            </p>
            {cred.last_sync_error && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> {cred.last_sync_error}
              </p>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <ConversionFilter />
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>Desconectar</Button>
          </div>
        </div>

        <MarketingFiltersBar
          filters={filters}
          onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          onReset={() => setFilters(defaultFilters())}
          adAccountOptions={adAccountOptions}
          campaignOptions={campaignOptions}
          adsetOptions={adsetOptions}
          adOptions={adOptions}
          availableObjectives={availableObjectives}
        />

        <MarketingBody
          campaigns={campaigns}
          ads={ads}
          current={current}
          previous={previous}
          currTotals={currTotals}
          prevTotals={prevTotals}
          filteredCampaigns={filteredCampaigns}
          filteredAds={filteredAds}
        />

      </div>
    </MarketingFiltersProvider>
  );
}
