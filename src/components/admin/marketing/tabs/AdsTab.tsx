import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { statusLabel, statusTone } from '@/lib/metaAdsLabels';
import { fmtBRL, fmtInt, fmtRoas, safeDiv } from '../lib/format';
import { AdDrawer } from '../drawers/AdDrawer';

type Aggregate = { spend: number; impressions: number; clicks: number; ctwa: number; purchases: number; revenue: number };
type Ad = { id: string; external_id: string; name: string | null; status: string | null; campaign_external_id: string | null };
type Campaign = { external_id: string; name: string | null };
const empty: Aggregate = { spend: 0, impressions: 0, clicks: 0, ctwa: 0, purchases: 0, revenue: 0 };

export function AdsTab({ ads, campaigns, perAd, conversionLabel, conversionHasValue }: { ads: Ad[]; campaigns: Campaign[]; perAd: Record<string, Aggregate>; conversionLabel?: string | null; conversionHasValue?: boolean }) {
  const [selected, setSelected] = useState<Ad | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Anúncio</TableHead>
              <TableHead>Campanha</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Investimento</TableHead>
              <TableHead className="text-right">Cliques</TableHead>
              <TableHead className="text-right">CTWA</TableHead>
              <TableHead className="text-right">{conversionLabel ?? 'Conversões'}</TableHead>
              {conversionHasValue && <TableHead className="text-right">Receita</TableHead>}
              {conversionHasValue && <TableHead className="text-right">ROAS</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ads.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum anúncio corresponde aos filtros.</TableCell></TableRow>
            )}
            {ads.map((a) => {
              const camp = campaigns.find((c) => c.external_id === a.campaign_external_id);
              const m = perAd[a.external_id] ?? empty;
              const tone = statusTone(a.status);
              return (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => { setSelected(a); setOpen(true); }}>
                  <TableCell className="font-medium max-w-[280px] truncate">{a.name || a.external_id}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[240px] truncate">{camp?.name ?? a.campaign_external_id ?? '—'}</TableCell>
                  <TableCell><Badge variant={tone === 'active' ? 'default' : tone === 'destructive' ? 'destructive' : 'outline'}>{statusLabel(a.status)}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBRL(m.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(m.clicks)}</TableCell>
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
      <AdDrawer
        ad={selected}
        metrics={selected ? (perAd[selected.external_id] ?? empty) : null}
        campaignName={selected ? campaigns.find((c) => c.external_id === selected.campaign_external_id)?.name ?? null : null}
        open={open}
        onOpenChange={setOpen}
      />
    </Card>
  );
}
