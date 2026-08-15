import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useMarketingCtx, iso } from '../context/MarketingFiltersContext';
import { fmtBRL } from '../lib/format';

type Row = {
  lead_id: string; name: string; phone: string | null;
  temperature: string | null; deal_value: number | null;
  campaign_name: string | null; ad_name: string | null;
  utm_source: string | null; created_at: string;
};

export function LeadsTab() {
  const { orgId, filters } = useMarketingCtx();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('leads')
        .select(`
          id, name, phone, temperature, deal_value, created_at, utm_source,
          lead_attribution!inner(provider, campaign_name, ad_name)
        `)
        .eq('organization_id', orgId)
        .eq('lead_attribution.provider', 'meta')
        .gte('created_at', filters.range.from.toISOString())
        .lte('created_at', filters.range.to.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);
      const mapped: Row[] = (data ?? []).map((l: any) => ({
        lead_id: l.id, name: l.name, phone: l.phone,
        temperature: l.temperature, deal_value: l.deal_value,
        campaign_name: l.lead_attribution?.[0]?.campaign_name ?? null,
        ad_name: l.lead_attribution?.[0]?.ad_name ?? null,
        utm_source: l.utm_source, created_at: l.created_at,
      }));
      setRows(mapped);
      setLoading(false);
    })();
  }, [orgId, filters.range.from, filters.range.to]);

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        {loading && <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}
        {!loading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead>Anúncio</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Criado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum lead atribuído no período. Rode a sincronização para popular a atribuição.
                </TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.lead_id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.phone ?? '—'}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.campaign_name ?? '—'}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.ad_name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.utm_source ?? '—'}</TableCell>
                  <TableCell>{r.temperature ? <Badge variant="outline">{r.temperature}</Badge> : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBRL(r.deal_value ?? 0)}</TableCell>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString('pt-BR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
