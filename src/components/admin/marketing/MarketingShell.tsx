import { useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { MetaAdsWizard } from '@/components/admin/integrations/MetaAdsWizard';
import { MetaOAuthConnectButton } from '@/components/admin/integrations/MetaOAuthConnectButton';
import { MarketingFiltersBar, MarketingFilters } from './filters/MarketingFiltersBar';
import { computeRange } from './filters/DateRangeControl';
import { objectiveLabel } from '@/lib/metaAdsLabels';
import { MarketingFiltersProvider, iso, useMarketingCtx } from './context/MarketingFiltersContext';
import { ConversionFilter } from './filters/ConversionFilter';
import { conversionGoalLabel } from './lib/conversionGoals';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

async function extractFnError(error: any): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try { const body = await error.context.json(); return body?.details || body?.error || error.message; }
    catch { try { return await error.context.text(); } catch { /* ignore */ } }
  }
  return error?.message ?? String(error);
}

export type Credential = {
  id: string; organization_id: string; provider: string;
  ad_account_id: string | null; business_id: string | null;
  account_name: string | null; is_active: boolean;
  last_sync_at: string | null; last_sync_status: string | null; last_sync_error: string | null;
};
export type Campaign = { id: string; external_id: string; name: string | null; status: string | null; objective: string | null; daily_budget: number | null; ad_account_id: string | null };
export type Adset = { id: string; external_id: string; name: string | null; status: string | null; campaign_external_id: string | null };
export type Ad = { id: string; external_id: string; name: string | null; status: string | null; adset_external_id: string | null; campaign_external_id: string | null };
export type Insight = { entity_type: string; entity_external_id: string; date: string; spend: number; impressions: number; clicks: number; ctwa_clicks: number; purchases: number; revenue: number };

export type Aggregate = { spend: number; impressions: number; clicks: number; ctwa: number; purchases: number; revenue: number };
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
const credentialStorageKey = (orgId: string) => `marketing.selectedCredential.${orgId}`;

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

export type MetaShellContext = {
  orgId: string | null;
  cred: Credential | null;
  credentials: Credential[];
  setActiveCredential: (id: string) => Promise<void>;
  reloadCredentials: (preferredId?: string) => Promise<void>;
  filters: MarketingFilters;
  setFilters: (patch: Partial<MarketingFilters>) => void;
  campaigns: Campaign[];
  adsets: Adset[];
  ads: Ad[];
  filteredCampaigns: Campaign[];
  filteredAds: Ad[];
  perCampaign: Record<string, Aggregate>;
  perAd: Record<string, Aggregate>;
  kpis: any;
  syncing: boolean;
  hasDataInPeriod: boolean;
  syncError: string | null;
  onSync: () => Promise<void>;
  conversionLabel: string | null;
  conversionExternalId: string | null;
  conversionHasValue: boolean;
  salesVerified: boolean;
};

type ConversionMetricRow = { entity_external_id: string; date: string; count: number; value: number };

function MarketingMetricsContent({
  scope, baseContext, children,
}: {
  scope: Props['scope'];
  baseContext: MetaShellContext;
  children: Props['children'];
}) {
  const { orgId, filters, selectedConversion } = useMarketingCtx();
  const actionType = selectedConversion?.external_id ?? null;
  const [rows, setRows] = useState<ConversionMetricRow[]>([]);

  useEffect(() => {
    if (scope !== 'meta' || !orgId || !actionType) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 400);
      const { data } = await (supabase as any).from('marketing_conversion_metrics_daily')
        .select('entity_external_id, date, count, value')
        .eq('organization_id', orgId).eq('provider', 'meta').eq('entity_type', 'ad')
        .eq('action_type', actionType).gte('date', iso(since)).limit(20000);
      if (!cancelled) setRows((data ?? []) as ConversionMetricRow[]);
    })();
    return () => { cancelled = true; };
  }, [scope, orgId, actionType]);

  const context = useMemo<MetaShellContext>(() => {
    if (scope !== 'meta') return baseContext;

    const fromKey = iso(filters.range.from);
    const toKey = iso(filters.range.to);
    const days = Math.round((Date.UTC(filters.range.to.getFullYear(), filters.range.to.getMonth(), filters.range.to.getDate()) - Date.UTC(filters.range.from.getFullYear(), filters.range.from.getMonth(), filters.range.from.getDate())) / 86_400_000) + 1;
    const prevTo = new Date(filters.range.from); prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
    const prevFromKey = iso(prevFrom);
    const prevToKey = iso(prevTo);
    const allowedAds = new Set(baseContext.filteredAds.map((ad) => ad.external_id));
    const adToCampaign: Record<string, string> = {};
    baseContext.ads.forEach((ad) => { if (ad.campaign_external_id) adToCampaign[ad.external_id] = ad.campaign_external_id; });

    let currentCount = 0;
    let previousCount = 0;
    const byAd: Record<string, number> = {};
    const byCampaign: Record<string, number> = {};
    for (const row of rows) {
      if (!allowedAds.has(row.entity_external_id)) continue;
      const day = row.date.slice(0, 10);
      const count = Number(row.count || 0);
      if (day >= fromKey && day <= toKey) {
        currentCount += count;
        byAd[row.entity_external_id] = (byAd[row.entity_external_id] ?? 0) + count;
        const campaignId = adToCampaign[row.entity_external_id];
        if (campaignId) byCampaign[campaignId] = (byCampaign[campaignId] ?? 0) + count;
      } else if (day >= prevFromKey && day <= prevToKey) {
        previousCount += count;
      }
    }

    const perAd: Record<string, Aggregate> = {};
    for (const [id, metric] of Object.entries(baseContext.perAd)) {
      perAd[id] = { ...metric, purchases: actionType ? (byAd[id] ?? 0) : 0, revenue: 0 };
    }
    const perCampaign: Record<string, Aggregate> = {};
    for (const [id, metric] of Object.entries(baseContext.perCampaign)) {
      perCampaign[id] = { ...metric, purchases: actionType ? (byCampaign[id] ?? 0) : 0, revenue: 0 };
    }

    const spend = Number(baseContext.kpis.spend?.curr ?? 0);
    const previousSpend = spend / (1 + Number(baseContext.kpis.spend?.delta ?? 0) / 100);
    const currentCpl = safeDiv(spend, currentCount);
    const previousCpl = safeDiv(Number.isFinite(previousSpend) ? previousSpend : 0, previousCount);
    const kpis = {
      ...baseContext.kpis,
      leads: { curr: currentCount, delta: pctDelta(currentCount, previousCount) },
      cpl: { curr: currentCpl, delta: pctDelta(currentCpl ?? 0, previousCpl ?? 0) },
      purchases: { curr: 0, delta: 0 },
      revenue: { curr: 0, delta: 0 },
      roas: { curr: null, delta: null },
    };

    return {
      ...baseContext,
      perAd,
      perCampaign,
      kpis,
      conversionLabel: selectedConversion ? conversionGoalLabel(selectedConversion.name) : null,
      conversionExternalId: actionType,
      conversionHasValue: false,
      salesVerified: false,
    };
  }, [scope, baseContext, filters.range, selectedConversion, actionType, rows]);

  return <>{typeof children === 'function' ? children(context) : children}</>;
}


type Props = {
  scope: 'global' | 'meta' | 'tracking';
  title: string;
  subtitle?: string;
  /**
   * Quando `false` (default), o Shell NÃO renderiza `MarketingFiltersBar` em
   * escopo `global`/`tracking`. A `LeadJourneyPage` é dona da própria barra
   * de filtros — não devemos montar duas.
   */
  showJourneyFilters?: boolean;
  /**
   * Quando `true`, o Shell não renderiza o header/filtros desktop.
   * Usado pela experiência mobile, que renderiza seu próprio chrome.
   * O gate de conexão Meta continua funcionando.
   */
  bare?: boolean;
  children: ReactNode | ((ctx: MetaShellContext) => ReactNode);
};


/**
 * Container único de Marketing.
 * - scope='meta': carrega credenciais + catálogo Meta (campanhas/adsets/ads/insights),
 *   dispara backfill sob demanda, mostra header/sync/filtros e gate de conexão.
 * - scope='global': só monta o Provider com filtros default. **NÃO** carrega
 *   nada da Meta. Header enxuto. Nenhum backfill nem sync.
 * - scope='tracking': carrega apenas a credencial (para mostrar status Pixel/CAPI).
 *   Não carrega campanhas/insights nem faz backfill.
 */
export function MarketingShell({ scope, title, subtitle, showJourneyFilters = false, bare = false, children }: Props) {
  const { profile, isLoading: authLoading } = useAuth();
  const orgId = profile?.organization_id ?? null;

  const [filters, setFilters] = useState<MarketingFilters>(defaultFilters());
  const [cred, setCred] = useState<Credential | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(scope === 'meta');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [adsets, setAdsets] = useState<Adset[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoaded, setInsightsLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncLockRef = useRef(false);
  const attemptedWindowsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadCredential = useCallback(async (showLoading = false, preferredId?: string): Promise<Credential | null> => {
    // scope='global' NUNCA lê credencial (não precisamos dela pra Overview/Jornada/Atribuição).
    if (scope === 'global') return null;
    if (!orgId) {
      if (!authLoading) setLoading(false);
      return null;
    }
    if (showLoading) setLoading(true);
    try {
      const { data, error } = await supabase.from('org_marketing_credentials')
        .select('id, organization_id, provider, ad_account_id, business_id, account_name, is_active, last_sync_at, last_sync_status, last_sync_error')
        .eq('organization_id', orgId).eq('provider', 'meta')
        .order('account_name', { ascending: true });
      if (error) throw error;
      const list = ((data ?? []) as Credential[]).filter((item) => item.is_active);
      setCredentials(list);
      const storedId = preferredId || window.localStorage.getItem(credentialStorageKey(orgId));
      const selected = list.find((c) => c.id === storedId) ?? list[0] ?? null;
      if (selected) {
        window.localStorage.setItem(credentialStorageKey(orgId), selected.id);
        setFilters((current) => ({
          ...current,
          adAccounts: selected.ad_account_id ? [selected.ad_account_id] : [],
        }));
      } else {
        window.localStorage.removeItem(credentialStorageKey(orgId));
      }
      setCred(selected);
      return selected;
    } catch (error: any) {
      setSyncError(error?.message ?? 'Não foi possível consultar a conta conectada.');
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [authLoading, orgId, scope]);

  const setActiveCredential = useCallback(async (id: string) => {
    if (!orgId) return;
    const target = credentials.find((c) => c.id === id);
    if (!target || target.id === cred?.id) return;
    window.localStorage.setItem(credentialStorageKey(orgId), id);
    setCred(target);
    setFilters((current) => ({
      ...current,
      adAccounts: target.ad_account_id ? [target.ad_account_id] : [],
      campaignIds: [],
      adsetIds: [],
      adIds: [],
    }));
    setCampaigns([]); setAdsets([]); setAds([]); setInsights([]); setInsightsLoaded(false);
    attemptedWindowsRef.current.clear();
  }, [orgId, credentials, cred?.id]);

  const loadCatalog = useCallback(async () => {
    // Só o escopo 'meta' precisa do catálogo completo. 'tracking' apenas mostra status.
    if (!orgId || scope !== 'meta') return;
    const [{ data: c }, { data: aset }, { data: a }] = await Promise.all([
      supabase.from('marketing_campaigns').select('id, external_id, name, status, objective, daily_budget, ad_account_id').eq('organization_id', orgId).eq('provider', 'meta').order('name').limit(1000),
      supabase.from('marketing_adsets').select('id, external_id, name, status, campaign_external_id').eq('organization_id', orgId).eq('provider', 'meta').order('name').limit(2000),
      supabase.from('marketing_ads').select('id, external_id, name, status, adset_external_id, campaign_external_id').eq('organization_id', orgId).eq('provider', 'meta').order('name').limit(2000),
    ]);
    setCampaigns((c ?? []) as Campaign[]);
    setAdsets((aset ?? []) as Adset[]);
    setAds((a ?? []) as Ad[]);
  }, [orgId, scope]);

  const loadInsights = useCallback(async (): Promise<Insight[]> => {
    if (!orgId || scope !== 'meta') return [];
    try {
      const since = new Date(); since.setDate(since.getDate() - 400);
      const { data, error } = await supabase.from('marketing_insights_daily')
        .select('entity_type, entity_external_id, date, spend, impressions, clicks, ctwa_clicks, purchases, revenue')
        .eq('organization_id', orgId).eq('provider', 'meta').gte('date', iso(since))
        .order('date', { ascending: false }).limit(20000);
      if (error) throw error;
      const next = (data ?? []) as Insight[];
      setInsights(next);
      return next;
    } finally {
      setInsightsLoaded(true);
    }
  }, [orgId, scope]);

  const loadData = useCallback(async () => {
    await Promise.all([loadCatalog(), loadInsights()]);
  }, [loadCatalog, loadInsights]);

  useEffect(() => { void loadCredential(true); }, [loadCredential]);
  useEffect(() => { if (cred && scope === 'meta') void loadData(); }, [cred?.id, loadData, scope]);
  useEffect(() => {
    const refresh = () => { if (cred && scope === 'meta') void loadData(); };
    window.addEventListener('vendus:marketing-data-changed', refresh);
    return () => window.removeEventListener('vendus:marketing-data-changed', refresh);
  }, [cred, loadData, scope]);

  const [backfilling, setBackfilling] = useState(false);

  const waitForSync = useCallback(async (baseline: string | null, timeoutMs: number): Promise<Credential | null> => {
    const deadline = Date.now() + timeoutMs;
    while (mountedRef.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (!mountedRef.current) return null;
      const latest = await loadCredential(false);
      const advanced = !!latest?.last_sync_at && (!baseline || latest.last_sync_at > baseline);
      if (advanced && latest?.last_sync_status !== 'running') return latest;
    }
    return null;
  }, [loadCredential]);

  useEffect(() => {
    if (scope !== 'meta' || !orgId || !cred || !insightsLoaded || backfilling) return;
    const wantSince = iso(filters.range.from);
    const wantUntil = iso(filters.range.to);
    const windowKey = `${wantSince}:${wantUntil}`;
    if (attemptedWindowsRef.current.has(windowKey)) return;

    let oldest: string | null = null;
    let newest: string | null = null;
    for (const i of insights) {
      const day = i.date.slice(0, 10);
      if (!oldest || day < oldest) oldest = day;
      if (!newest || day > newest) newest = day;
    }
    if (oldest && newest && oldest <= wantSince && newest >= wantUntil) {
      attemptedWindowsRef.current.add(windowKey);
      return;
    }

    const debounce = setTimeout(() => {
      (async () => {
        attemptedWindowsRef.current.add(windowKey);
        setBackfilling(true);
        setSyncing(true);
        try {
          const baseline = cred.last_sync_at;
          const { data, error } = await supabase.functions.invoke('marketing-sync', {
            body: { organization_id: orgId, credential_id: cred.id, provider: 'meta', since: wantSince, until: wantUntil },
          });
          if (error) throw new Error(await extractFnError(error));
          if ((data as any)?.error) throw new Error((data as any).details || (data as any).error);
          const completed = await waitForSync(baseline, 45_000);
          if (mountedRef.current && completed?.last_sync_status === 'ok') await loadInsights();
        } catch (e: any) {
          console.warn('[marketing] silent backfill failed:', e?.message ?? e);
        } finally {
          if (mountedRef.current) {
            setBackfilling(false);
            setSyncing(false);
          }
        }
      })();
    }, 300);
    return () => clearTimeout(debounce);
  }, [filters.range.from, filters.range.to, cred?.id, cred?.last_sync_at, orgId, insights, insightsLoaded, backfilling, scope, loadInsights, waitForSync]);

  const handleSync = async () => {
    if (!orgId || syncLockRef.current) return;
    syncLockRef.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      const baseline = cred?.last_sync_at ?? null;
      const { data, error } = await supabase.functions.invoke('marketing-sync', {
        body: {
          organization_id: orgId,
          credential_id: cred?.id,
          provider: 'meta',
          since: iso(filters.range.from),
          until: iso(filters.range.to),
        },
      });
      if (error) throw new Error(await extractFnError(error));
      if ((data as any)?.error) throw new Error((data as any).details || (data as any).error);
      const completed = await waitForSync(baseline, 60_000);
      if (!completed) {
        toast.message('A atualização continua em segundo plano. Os dados aparecerão assim que a Meta concluir.');
        return;
      }
      if (completed.last_sync_status === 'error') throw new Error(completed.last_sync_error || 'A Meta não concluiu a atualização.');
      await loadData();
      supabase.functions.invoke('attribution-engine', { body: { organization_id: orgId } }).catch(() => {});
      toast.success('Dados atualizados');
    } catch (e: any) {
      const message = e?.message ?? String(e);
      setSyncError(message);
      toast.error(message);
    } finally {
      syncLockRef.current = false;
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!cred) return;
    if (!confirm('Desconectar esta conta do Meta Ads? O catálogo permanece salvo mas a sincronização para.')) return;
    const { error } = await supabase.from('org_marketing_credentials').update({ is_active: false }).eq('id', cred.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Conta desconectada');
    window.localStorage.removeItem(credentialStorageKey(cred.organization_id));
    setCampaigns([]); setAdsets([]); setAds([]); setInsights([]);
    await loadCredential(false);
  };

  const adAccountOptions = useMemo(() => {
    const acc = new Set<string>();
    campaigns.forEach((c) => { if (c.ad_account_id) acc.add(c.ad_account_id); });
    if (cred?.ad_account_id) acc.add(cred.ad_account_id);
    return Array.from(acc).map((v) => ({ value: v, label: v === cred?.ad_account_id ? (cred.account_name || v) : v }));
  }, [campaigns, cred]);
  const availableObjectives = useMemo(() => {
    const s = new Set<string>(); campaigns.forEach((c) => { if (c.objective) s.add(c.objective); }); return Array.from(s);
  }, [campaigns]);

  const scopeSets = useMemo(() => {
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
    const fromDay = iso(filters.range.from);
    const toDay = iso(filters.range.to);
    const dayCount = Math.round((Date.UTC(filters.range.to.getFullYear(), filters.range.to.getMonth(), filters.range.to.getDate()) - Date.UTC(filters.range.from.getFullYear(), filters.range.from.getMonth(), filters.range.from.getDate())) / 86_400_000) + 1;
    const previousToDate = new Date(filters.range.from);
    previousToDate.setDate(previousToDate.getDate() - 1);
    const previousFromDate = new Date(previousToDate);
    previousFromDate.setDate(previousFromDate.getDate() - dayCount + 1);
    const previousFromDay = iso(previousFromDate);
    const previousToDay = iso(previousToDate);
    const cur: Insight[] = []; const prev: Insight[] = [];
    for (const i of insights) {
      if (i.entity_type !== 'ad') continue;
      if (!scopeSets.adSet.has(i.entity_external_id)) continue;
      const day = i.date.slice(0, 10);
      if (day >= fromDay && day <= toDay) cur.push(i);
      else if (day >= previousFromDay && day <= previousToDay) prev.push(i);
    }
    return { current: cur, previous: prev };
  }, [insights, scopeSets.adSet, filters.range]);

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

  const filteredCampaigns = useMemo(() => campaigns.filter((c) => scopeSets.campSet.has(c.external_id)), [campaigns, scopeSets.campSet]);
  const filteredAds = useMemo(() => ads.filter((a) => scopeSets.adSet.has(a.external_id)), [ads, scopeSets.adSet]);

  const setFiltersPatch = (patch: Partial<MarketingFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const ctx: MetaShellContext = {
    orgId, cred, credentials, setActiveCredential,
    reloadCredentials: async (preferredId?: string) => { await loadCredential(false, preferredId); },
    filters, setFilters: setFiltersPatch,
    campaigns, adsets, ads, filteredCampaigns, filteredAds, perCampaign, perAd, kpis,
    syncing, hasDataInPeriod: current.length > 0, syncError, onSync: handleSync,
    conversionLabel: null, conversionExternalId: null, conversionHasValue: false, salesVerified: false,
  };

  // Gate: connect Meta only when scope is 'meta' and no active credential.
  if (scope === 'meta' && loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
      </div>
    );
  }

  if (scope === 'meta' && !authLoading && !orgId) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        Não foi possível identificar a empresa desta conta.
      </div>
    );
  }

  if (scope === 'meta' && !cred) {
    return (
      <MarketingFiltersProvider filters={filters} orgId={orgId} metaCredentialId={cred?.id}>
        <div className="p-6 max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Conecte sua conta do Facebook/Instagram Ads para trazer campanhas, criativos, gastos e atribuição CTWA para dentro da Jornada do Lead.
            </p>
          </div>
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="font-semibold">Conectar em 1 clique</h3>
                <p className="text-sm text-muted-foreground">Autorize com sua conta do Facebook. Nós escolhemos as permissões corretas.</p>
              </div>
              {orgId && (
                <MetaOAuthConnectButton
                  organizationId={orgId}
                  purpose="ads"
                  label="Conectar com Facebook"
                  onConnected={(credentialId) => { void loadCredential(false, credentialId); }}
                />
              )}
            </CardContent>
          </Card>
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Usar meu próprio Meta App (avançado)</summary>
            <div className="mt-4"><MetaAdsWizard /></div>
          </details>
        </div>
      </MarketingFiltersProvider>
    );
  }

  if (bare) {
    return (
      <MarketingFiltersProvider filters={filters} orgId={orgId} metaCredentialId={cred?.id}>
        <MarketingMetricsContent scope={scope} baseContext={ctx}>{children}</MarketingMetricsContent>
      </MarketingFiltersProvider>
    );
  }

  return (

    <MarketingFiltersProvider filters={filters} orgId={orgId} metaCredentialId={cred?.id}>
      <div className="p-6 max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
            {scope !== 'global' && cred && (
              <p className="text-muted-foreground text-sm mt-1">
                {cred.account_name || cred.ad_account_id} ·
                <span className="ml-2 inline-flex items-center gap-1">
                  {cred.last_sync_status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> :
                   cred.last_sync_status ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : null}
                  Última sync: {rel(cred.last_sync_at)}
                </span>
              </p>
            )}
            {scope === 'meta' && cred?.last_sync_error && (
              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> {cred.last_sync_error}
              </p>
            )}
          </div>
          {scope !== 'global' && cred && (
            <div className="flex gap-2 items-center">
              <Select value={cred.id} onValueChange={(value) => { void setActiveCredential(value); }}>
                <SelectTrigger className="w-[230px]" aria-label="Conta de anúncios operacional">
                  <SelectValue placeholder="Selecionar conta" />
                </SelectTrigger>
                <SelectContent>
                  {credentials.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.account_name || item.ad_account_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scope === 'meta' && <ConversionFilter />}
              {scope === 'meta' && (
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                  {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Sincronizar
                </Button>
              )}
              {orgId && (
                <MetaOAuthConnectButton
                  organizationId={orgId}
                  purpose="ads"
                  label="+ Conta"
                  className="h-9"
                  onConnected={(credentialId) => { void loadCredential(false, credentialId); }}
                />
              )}
              {scope === 'meta' && <Button variant="ghost" size="sm" onClick={handleDisconnect}>Desconectar</Button>}
            </div>
          )}
        </div>

        {scope === 'meta' && cred && (
          <MarketingFiltersBar
            filters={filters}
            onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            onReset={() => setFilters({
              ...defaultFilters(),
              adAccounts: cred.ad_account_id ? [cred.ad_account_id] : [],
            })}
            adAccountOptions={adAccountOptions}
            campaignOptions={campaignOptions}
            adsetOptions={adsetOptions}
            adOptions={adOptions}
            availableObjectives={availableObjectives}
          />
        )}

        <MarketingMetricsContent scope={scope} baseContext={ctx}>{children}</MarketingMetricsContent>
      </div>
    </MarketingFiltersProvider>
  );
}
