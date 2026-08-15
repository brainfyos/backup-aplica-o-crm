import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Loader2, Pause, Play, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { objectiveLabel, statusLabel, statusTone } from '@/lib/metaAdsLabels';
import { fmtBRL, fmtInt, fmtPct100, fmtRoas, safeDiv } from '../lib/format';
import { useMarketingCtx, iso } from '../context/MarketingFiltersContext';
import { conversionGoalLabel } from '../lib/conversionGoals';
import { MetaDirectAction, useMetaDirectAction } from '@/hooks/useMarketingAI';

type Aggregate = { spend: number; impressions: number; clicks: number; ctwa: number; purchases: number; revenue: number };
type Campaign = { external_id: string; name: string | null; status: string | null; objective: string | null; daily_budget?: number | null };
type AdRow = { external_id: string; name: string | null; status: string | null };
type AdsetRow = { external_id: string; name: string | null; status: string | null; daily_budget: number | null };
type ConvAgg = { count: number; value: number };

export function CampaignDrawer({
  campaign, metrics, open, onOpenChange,
}: {
  campaign: Campaign | null;
  metrics: Aggregate | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { orgId, filters, selectedConversion, conversionHasValue } = useMarketingCtx();
  const actionType = selectedConversion?.external_id ?? null;
  const convName = selectedConversion ? conversionGoalLabel(selectedConversion.name) : null;

  const [ads, setAds] = useState<AdRow[]>([]);
  const [adsets, setAdsets] = useState<AdsetRow[]>([]);
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [perAd, setPerAd] = useState<Record<string, Aggregate>>({});
  const [convByAd, setConvByAd] = useState<Record<string, ConvAgg>>({});
  const [convTotals, setConvTotals] = useState<ConvAgg>({ count: 0, value: 0 });
  const [leads, setLeads] = useState<{ id: string; name: string; created_at: string; deal_value: number | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<MetaDirectAction | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const directAction = useMetaDirectAction();

  useEffect(() => {
    if (open) setLocalStatus(campaign?.status ?? null);
  }, [open, campaign?.external_id, campaign?.status]);

  useEffect(() => {
    if (!open || !campaign || !orgId) return;
    (async () => {
      setLoading(true);
      const [{ data: aRows }, { data: setRows }, { data: iRows }, { data: lRows }, convRes] = await Promise.all([
        supabase.from('marketing_ads').select('external_id, name, status')
          .eq('organization_id', orgId).eq('provider', 'meta')
          .eq('campaign_external_id', campaign.external_id).limit(500),
        supabase.from('marketing_adsets').select('external_id, name, status, daily_budget')
          .eq('organization_id', orgId).eq('provider', 'meta')
          .eq('campaign_external_id', campaign.external_id).limit(200),
        supabase.from('marketing_insights_daily')
          .select('entity_external_id, spend, impressions, clicks, ctwa_clicks, purchases, revenue')
          .eq('organization_id', orgId).eq('provider', 'meta').eq('entity_type', 'ad')
          .gte('date', iso(filters.range.from)).lte('date', iso(filters.range.to)).limit(20000),
        (supabase as any).from('lead_attribution')
          .select('lead_id, leads:leads!inner(id, name, created_at, deal_value)')
          .eq('organization_id', orgId).eq('provider', 'meta')
          .eq('campaign_id', campaign.external_id)
          .gte('attributed_at', filters.range.from.toISOString())
          .limit(200),
        actionType
          ? (supabase as any).from('marketing_conversion_metrics_daily')
              .select('entity_external_id, count, value')
              .eq('organization_id', orgId).eq('provider', 'meta').eq('entity_type', 'ad')
              .eq('action_type', actionType)
              .gte('date', iso(filters.range.from)).lte('date', iso(filters.range.to))
              .limit(20000)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const adExtSet = new Set(((aRows ?? []) as any[]).map((a) => a.external_id));
      const agg: Record<string, Aggregate> = {};
      for (const i of (iRows ?? []) as any[]) {
        if (!adExtSet.has(i.entity_external_id)) continue;
        const m = (agg[i.entity_external_id] ||= { spend:0,impressions:0,clicks:0,ctwa:0,purchases:0,revenue:0 });
        m.spend += Number(i.spend||0); m.impressions += Number(i.impressions||0); m.clicks += Number(i.clicks||0);
        m.ctwa += Number(i.ctwa_clicks||0); m.purchases += Number(i.purchases||0); m.revenue += Number(i.revenue||0);
      }
      const cAgg: Record<string, ConvAgg> = {};
      let cTot = { count: 0, value: 0 };
      for (const r of ((convRes as any)?.data ?? []) as any[]) {
        if (!adExtSet.has(r.entity_external_id)) continue;
        const x = (cAgg[r.entity_external_id] ||= { count: 0, value: 0 });
        const cnt = Number(r.count || 0); const val = Number(r.value || 0);
        x.count += cnt; x.value += val;
        cTot.count += cnt; cTot.value += val;
      }
      setAds((aRows ?? []) as AdRow[]);
      const normalizedSets = (setRows ?? []) as AdsetRow[];
      setAdsets(normalizedSets);
      setBudgets(Object.fromEntries(normalizedSets.map((row) => [row.external_id, String(row.daily_budget ?? '')])));
      setPerAd(agg);
      setConvByAd(cAgg);
      setConvTotals(cTot);
      setLeads(((lRows ?? []) as any[]).map((r) => r.leads).filter(Boolean));
      setLoading(false);
    })();
  }, [open, campaign?.external_id, orgId, filters.range.from, filters.range.to, actionType]);

  const effectiveStatus = localStatus ?? campaign?.status ?? null;
  const tone = statusTone(effectiveStatus);
  const m = metrics;
  const convLabel = convName || 'CTWA';
  const showValue = conversionHasValue;
  const totalConvCount = actionType ? convTotals.count : (m?.ctwa ?? 0);
  const totalConvValue = actionType && showValue ? convTotals.value : (m?.revenue ?? 0);
  const costPerConv = m && m.spend > 0 && totalConvCount > 0 ? m.spend / totalConvCount : null;
  const isActive = String(effectiveStatus ?? '').toUpperCase() === 'ACTIVE';

  const executeConfirmed = async () => {
    if (!confirmation) return;
    await directAction.mutateAsync(confirmation);
    if (confirmation.action_type === 'set_status') {
      setLocalStatus(String(confirmation.proposed_state?.status ?? effectiveStatus));
    }
    setConfirmation(null);
  };

  const saveBudget = (adset: AdsetRow) => {
    const value = Number(String(budgets[adset.external_id] ?? '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    setConfirmation({
      action_type: 'set_budget',
      target_type: 'adset',
      target_ref_id: adset.external_id,
      target_label: adset.name,
      proposed_state: { daily_budget: value },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-2xl overflow-y-auto"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
      >
        <SheetHeader className="mt-2">
          <SheetTitle className="pr-8">{campaign?.name || campaign?.external_id || 'Campanha'}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <Badge variant={tone === 'active' ? 'default' : tone === 'destructive' ? 'destructive' : 'outline'}>
              {statusLabel(effectiveStatus)}
            </Badge>
            <span className="text-xs">{objectiveLabel(campaign?.objective ?? null)}</span>
          </SheetDescription>
        </SheetHeader>

        {campaign && (
          <div className="mt-6 rounded-xl border bg-muted/20 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">Central de controle</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Alterações são enviadas à Meta e registradas no histórico do Vendus.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={isActive ? 'outline' : 'default'}
                  onClick={() => setConfirmation({
                    action_type: 'set_status',
                    target_type: 'campaign',
                    target_ref_id: campaign.external_id,
                    target_label: campaign.name,
                    proposed_state: { status: isActive ? 'PAUSED' : 'ACTIVE' },
                  })}
                >
                  {isActive ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                  {isActive ? 'Pausar' : 'Ativar'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmation({
                    action_type: 'duplicate',
                    target_type: 'campaign',
                    target_ref_id: campaign.external_id,
                    target_label: campaign.name,
                  })}
                >
                  <Copy className="h-4 w-4 mr-2" />Duplicar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Orçamento diário por conjunto</Label>
              {adsets.length === 0 && (
                <p className="text-xs text-muted-foreground">Sincronize a conta para carregar os conjuntos desta campanha.</p>
              )}
              {adsets.map((adset) => (
                <div key={adset.external_id} className="grid grid-cols-[1fr_130px_auto] items-center gap-2">
                  <span className="text-sm truncate" title={adset.name ?? adset.external_id}>
                    {adset.name || adset.external_id}
                  </span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                    <Input
                      className="pl-9 h-9"
                      inputMode="decimal"
                      value={budgets[adset.external_id] ?? ''}
                      onChange={(e) => setBudgets((prev) => ({ ...prev, [adset.external_id]: e.target.value }))}
                    />
                  </div>
                  <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => saveBudget(adset)}>
                    <Save className="h-4 w-4" />
                    <span className="sr-only">Salvar orçamento</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {m && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            <MetricPill label="Investimento" value={fmtBRL(m.spend)} />
            <MetricPill label="Cliques" value={fmtInt(m.clicks)} />
            <MetricPill label="CTR" value={fmtPct100(m.impressions ? (m.clicks/m.impressions)*100 : null)} />
            <MetricPill label={convLabel} value={fmtInt(totalConvCount)} />
            <MetricPill label={`Custo por ${convLabel}`} value={costPerConv == null ? '—' : fmtBRL(costPerConv)} />
            <MetricPill label="ROAS" value={showValue ? fmtRoas(safeDiv(totalConvValue, m.spend)) : '—'} />
          </div>
        )}

        <div className="mt-8">
          <h4 className="text-sm font-semibold mb-2">Anúncios ({ads.length})</h4>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anúncio</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                    <TableHead className="text-right">{convLabel}</TableHead>
                    <TableHead className="text-right">Custo por {convLabel}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ads.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-sm">Nenhum anúncio.</TableCell></TableRow>
                  )}
                  {ads.map((a) => {
                    const mm = perAd[a.external_id];
                    const cv = actionType ? convByAd[a.external_id] : null;
                    const cnt = actionType ? (cv?.count ?? 0) : (mm?.ctwa ?? 0);
                    const cost = mm && mm.spend > 0 && cnt > 0 ? mm.spend / cnt : null;
                    return (
                      <TableRow key={a.external_id}>
                        <TableCell className="max-w-[240px] truncate text-sm">{a.name || a.external_id}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtInt(mm?.clicks ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{fmtInt(cnt)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{cost == null ? '—' : fmtBRL(cost)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="mt-8">
          <h4 className="text-sm font-semibold mb-2">Leads atribuídos ({leads.length})</h4>
          <div className="border rounded-lg divide-y">
            {leads.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhum lead atribuído no período.</div>}
            {leads.slice(0, 30).map((l) => (
              <div key={l.id} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString('pt-BR')}</div>
                </div>
                <div className="tabular-nums">{fmtBRL(l.deal_value ?? 0)}</div>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>

      <Dialog open={!!confirmation} onOpenChange={(open) => !open && setConfirmation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation?.action_type === 'duplicate'
                ? 'Duplicar esta campanha?'
                : confirmation?.action_type === 'set_budget'
                ? 'Alterar o orçamento?'
                : confirmation?.proposed_state?.status === 'ACTIVE'
                ? 'Ativar esta campanha?'
                : 'Pausar esta campanha?'}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.action_type === 'duplicate'
                ? 'A cópia será criada na Meta totalmente pausada para você revisar antes de gastar.'
                : confirmation?.action_type === 'set_budget'
                ? `O novo orçamento diário será de ${fmtBRL(Number(confirmation.proposed_state?.daily_budget ?? 0))}.`
                : 'A alteração será aplicada imediatamente na Meta e ficará registrada no histórico.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>Cancelar</Button>
            <Button onClick={executeConfirmed} disabled={directAction.isPending}>
              {directAction.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}
