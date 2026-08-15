import { KpiCard } from '@/components/admin/webchat/reports/KpiCard';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign, Eye, MousePointerClick, Percent, Users, ShoppingCart,
  TrendingUp, MessageCircle, Target, Coins, Wallet, BarChart3,
} from 'lucide-react';
import { objectiveLabel, statusLabel, statusTone } from '@/lib/metaAdsLabels';
import { fmtBRL, fmtInt, fmtPct100, fmtRoas, safeDiv } from '../lib/format';

type Aggregate = { spend: number; impressions: number; clicks: number; ctwa: number; purchases: number; revenue: number };
type Campaign = { id: string; external_id: string; name: string | null; status: string | null; objective: string | null };
type Ad = { id: string; external_id: string; name: string | null; status: string | null; campaign_external_id: string | null };

type Kpi = {
  spend: { curr: number; delta: number | null };
  impressions: { curr: number; delta: number | null };
  clicks: { curr: number; delta: number | null };
  ctr: { curr: number | null; delta: number | null };
  cpc: { curr: number | null; delta: number | null };
  cpm: { curr: number | null; delta: number | null };
  leads: { curr: number; delta: number | null };
  cpl: { curr: number | null; delta: number | null };
  conversas: { curr: number; delta: number | null };
  purchases: { curr: number; delta: number | null };
  revenue: { curr: number; delta: number | null };
  roas: { curr: number | null; delta: number | null };
};

const empty: Aggregate = { spend: 0, impressions: 0, clicks: 0, ctwa: 0, purchases: 0, revenue: 0 };

export function OverviewTab({
  kpis, campaigns, ads, perCampaign, perAd, campaignsAll,
  conversionLabel, conversionHasValue,
}: {
  kpis: Kpi;
  campaigns: Campaign[];
  ads: Ad[];
  perCampaign: Record<string, Aggregate>;
  perAd: Record<string, Aggregate>;
  campaignsAll: Campaign[];
  conversionLabel?: string | null;
  conversionHasValue?: boolean;
}) {
  const convName = conversionLabel || 'Leads / Conversas';
  const hasValue = conversionHasValue !== false; // default true (para não quebrar CTWA/insights padrão)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Investimento" value={fmtBRL(kpis.spend.curr)} delta={kpis.spend.delta} hint="vs período anterior" tone="primary" icon={Wallet} />
        <KpiCard label="Impressões" value={fmtInt(kpis.impressions.curr)} delta={kpis.impressions.delta} hint="vs período anterior" icon={Eye} />
        <KpiCard label="Cliques" value={fmtInt(kpis.clicks.curr)} delta={kpis.clicks.delta} hint="vs período anterior" icon={MousePointerClick} />
        <KpiCard label="CTR" value={kpis.ctr.curr == null ? '—' : `${(kpis.ctr.curr * 100).toFixed(2)}%`} delta={kpis.ctr.delta} hint="vs período anterior" icon={Percent} />
        <KpiCard label="CPC" value={kpis.cpc.curr == null ? '—' : fmtBRL(kpis.cpc.curr)} delta={kpis.cpc.delta} hint="vs período anterior" invertDelta icon={Coins} />
        <KpiCard label="CPM" value={kpis.cpm.curr == null ? '—' : fmtBRL(kpis.cpm.curr)} delta={kpis.cpm.delta} hint="vs período anterior" invertDelta icon={BarChart3} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label={convName} value={fmtInt(kpis.leads.curr)} delta={kpis.leads.delta} hint="vs período anterior" tone="success" icon={Users} />
        <KpiCard label={`Custo por ${convName}`} value={kpis.cpl.curr == null ? '—' : fmtBRL(kpis.cpl.curr)} delta={kpis.cpl.delta} hint="vs período anterior" invertDelta icon={Target} />
        <KpiCard label="Conversas CTWA" value={fmtInt(kpis.conversas.curr)} delta={kpis.conversas.delta} hint="vs período anterior" icon={MessageCircle} />
        {hasValue && <KpiCard label="Compras" value={fmtInt(kpis.purchases.curr)} delta={kpis.purchases.delta} hint="vs período anterior" tone="success" icon={ShoppingCart} />}
        {hasValue && <KpiCard label="Receita" value={fmtBRL(kpis.revenue.curr)} delta={kpis.revenue.delta} hint="vs período anterior" tone="success" icon={DollarSign} />}
        {hasValue && <KpiCard label="ROAS" value={fmtRoas(kpis.roas.curr)} delta={kpis.roas.delta} hint="vs período anterior" tone="primary" icon={TrendingUp} />}
      </div>


      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="p-4 pb-0 text-sm font-medium text-muted-foreground">Top campanhas do período</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Objetivo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Investimento</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">CTWA</TableHead>
                <TableHead className="text-right">{convName}</TableHead>
                {hasValue && <TableHead className="text-right">Receita</TableHead>}
                {hasValue && <TableHead className="text-right">ROAS</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Sem dados no período.</TableCell></TableRow>
              )}
              {campaigns.slice(0, 10).map((c) => {
                const m = perCampaign[c.external_id] ?? empty;
                const tone = statusTone(c.status);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium max-w-[260px] truncate">{c.name || c.external_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{objectiveLabel(c.objective)}</TableCell>
                    <TableCell><Badge variant={tone === 'active' ? 'default' : tone === 'destructive' ? 'destructive' : 'outline'}>{statusLabel(c.status)}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(m.spend)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(m.clicks)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct100(safeDiv(m.clicks, m.impressions) != null ? (m.clicks / m.impressions) * 100 : null)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(m.ctwa)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(m.purchases)}</TableCell>
                    {hasValue && <TableCell className="text-right tabular-nums">{fmtBRL(m.revenue)}</TableCell>}
                    {hasValue && <TableCell className="text-right tabular-nums font-medium">{fmtRoas(safeDiv(m.revenue, m.spend))}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
