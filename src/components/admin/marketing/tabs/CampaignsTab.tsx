import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { objectiveLabel, statusLabel, statusTone } from '@/lib/metaAdsLabels';
import { fmtBRL, fmtInt, fmtPct100, fmtRoas, safeDiv } from '../lib/format';
import { CampaignDrawer } from '../drawers/CampaignDrawer';

type Aggregate = { spend: number; impressions: number; clicks: number; ctwa: number; purchases: number; revenue: number };
type Campaign = { id: string; external_id: string; name: string | null; status: string | null; objective: string | null };
const empty: Aggregate = { spend: 0, impressions: 0, clicks: 0, ctwa: 0, purchases: 0, revenue: 0 };

export function CampaignsTab({ campaigns, perCampaign, conversionLabel, conversionHasValue }: { campaigns: Campaign[]; perCampaign: Record<string, Aggregate>; conversionLabel?: string | null; conversionHasValue?: boolean }) {
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campanha</TableHead>
              <TableHead>Objetivo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Investimento</TableHead>
              <TableHead className="text-right">Impressões</TableHead>
              <TableHead className="text-right">Cliques</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">CTWA</TableHead>
              <TableHead className="text-right">{conversionLabel ?? 'Conversões'}</TableHead>
              {conversionHasValue && <TableHead className="text-right">Receita</TableHead>}
              {conversionHasValue && <TableHead className="text-right">ROAS</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.length === 0 && (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Nenhuma campanha corresponde aos filtros.</TableCell></TableRow>
            )}
            {campaigns.map((c) => {
              const m = perCampaign[c.external_id] ?? empty;
              const tone = statusTone(c.status);
              return (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => { setSelected(c); setOpen(true); }}>
                  <TableCell className="font-medium max-w-[280px] truncate">{c.name || c.external_id}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{objectiveLabel(c.objective)}</TableCell>
                  <TableCell><Badge variant={tone === 'active' ? 'default' : tone === 'destructive' ? 'destructive' : 'outline'}>{statusLabel(c.status)}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBRL(m.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(m.impressions)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(m.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct100(safeDiv(m.clicks, m.impressions) != null ? (m.clicks / m.impressions) * 100 : null)}</TableCell>
                  <TableCell className="text-right tabular-nums">{safeDiv(m.spend, m.clicks) == null ? '—' : fmtBRL(m.spend / m.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(m.ctwa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(m.purchases)}</TableCell>
                  {conversionHasValue && <TableCell className="text-right tabular-nums">{fmtBRL(m.revenue)}</TableCell>}
                  {conversionHasValue && <TableCell className="text-right tabular-nums font-medium">{fmtRoas(safeDiv(m.revenue, m.spend))}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <CampaignDrawer
        campaign={selected}
        metrics={selected ? (perCampaign[selected.external_id] ?? empty) : null}
        open={open}
        onOpenChange={setOpen}
      />
    </Card>
  );
}
