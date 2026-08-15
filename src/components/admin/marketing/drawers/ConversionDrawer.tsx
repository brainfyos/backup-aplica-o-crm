import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useMarketingCtx, iso } from '../context/MarketingFiltersContext';
import { fmtBRL, fmtInt, fmtRoas } from '../lib/format';
import type { ConversionDefinition } from '@/hooks/useConversionDefinitions';

type Row = {
  entity_external_id: string;
  count: number;
  value: number;
  spend: number;
  cost_per_conversion: number | null;
  roas: number | null;
};

export function ConversionDrawer({
  conversion, open, onOpenChange,
}: { conversion: ConversionDefinition | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { orgId, filters } = useMarketingCtx();
  const [byCampaign, setByCampaign] = useState<Row[]>([]);
  const [byAd, setByAd] = useState<Row[]>([]);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});
  const [adNames, setAdNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !conversion || !orgId) return;
    (async () => {
      setLoading(true);
      const from = iso(filters.range.from);
      const to = iso(filters.range.to);
      const [{ data: c }, { data: a }, { data: cn }, { data: an }] = await Promise.all([
        (supabase as any).rpc('rpc_marketing_conversion_performance', {
          p_org_id: orgId, p_action_type: conversion.external_id,
          p_entity_type: 'campaign', p_from: from, p_to: to,
        }),
        (supabase as any).rpc('rpc_marketing_conversion_performance', {
          p_org_id: orgId, p_action_type: conversion.external_id,
          p_entity_type: 'ad', p_from: from, p_to: to,
        }),
        supabase.from('marketing_campaigns').select('external_id, name').eq('organization_id', orgId).limit(2000),
        supabase.from('marketing_ads').select('external_id, name').eq('organization_id', orgId).limit(5000),
      ]);
      setByCampaign((c ?? []) as Row[]);
      setByAd((a ?? []) as Row[]);
      const cnMap: Record<string, string> = {};
      (cn ?? []).forEach((r: any) => { cnMap[r.external_id] = r.name; });
      setCampaignNames(cnMap);
      const anMap: Record<string, string> = {};
      (an ?? []).forEach((r: any) => { anMap[r.external_id] = r.name; });
      setAdNames(anMap);
      setLoading(false);
    })();
  }, [open, conversion?.id, orgId, filters.range]);

  const totals = useMemo(() => {
    return byAd.reduce((acc, r) => ({
      count: acc.count + Number(r.count || 0),
      value: acc.value + Number(r.value || 0),
      spend: acc.spend + Number(r.spend || 0),
    }), { count: 0, value: 0, spend: 0 });
  }, [byAd]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {conversion?.name}
            {conversion && <Badge variant="outline">{conversion.kind === 'custom' ? 'Custom' : 'Pixel'}</Badge>}
          </SheetTitle>
          <SheetDescription>
            {conversion?.category ?? '—'} · {conversion?.external_id}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-4 gap-3 mt-6">
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Conversões</div><div className="text-xl font-semibold">{fmtInt(totals.count)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Valor</div><div className="text-xl font-semibold">{fmtBRL(totals.value)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Investimento</div><div className="text-xl font-semibold">{fmtBRL(totals.spend)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Custo/conv</div><div className="text-xl font-semibold">{totals.count > 0 ? fmtBRL(totals.spend / totals.count) : '—'}</div></CardContent></Card>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-medium mb-2">Por campanha</h4>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Invest.</TableHead>
                  <TableHead className="text-right">Custo/conv</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>}
                {!loading && byCampaign.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>}
                {byCampaign.map((r) => (
                  <TableRow key={r.entity_external_id}>
                    <TableCell className="truncate max-w-[240px]">{campaignNames[r.entity_external_id] ?? r.entity_external_id}</TableCell>
                    <TableCell className="text-right">{fmtInt(r.count)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.value)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(r.spend)}</TableCell>
                    <TableCell className="text-right">{r.cost_per_conversion != null ? fmtBRL(r.cost_per_conversion) : '—'}</TableCell>
                    <TableCell className="text-right">{fmtRoas(r.roas)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-medium mb-2">Top anúncios</h4>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Anúncio</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">Custo/conv</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byAd.slice(0, 20).map((r) => (
                  <TableRow key={r.entity_external_id}>
                    <TableCell className="truncate max-w-[240px]">{adNames[r.entity_external_id] ?? r.entity_external_id}</TableCell>
                    <TableCell className="text-right">{fmtInt(r.count)}</TableCell>
                    <TableCell className="text-right">{r.cost_per_conversion != null ? fmtBRL(r.cost_per_conversion) : '—'}</TableCell>
                    <TableCell className="text-right">{fmtRoas(r.roas)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
