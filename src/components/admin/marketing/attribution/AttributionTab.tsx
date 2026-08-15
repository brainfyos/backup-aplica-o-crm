import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { DateRangeControl, DateRange, computeRange } from '../filters/DateRangeControl';
import { fmtBRL } from '../lib/format';

type State = 'all' | 'resolved' | 'partial' | 'unresolved';

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  deal_value: number | null;
  utm_source: string | null;
  fbclid: string | null;
  attribution?: {
    provider: string | null;
    campaign_id: string | null;
    campaign_name: string | null;
    ad_id: string | null;
    ad_name: string | null;
    attribution_method: string | null;
    attributed_at: string | null;
    confidence_score: number | null;
  } | null;
};

const PAGE_SIZES = [25, 50, 100];

/**
 * AttributionTab — visão de leads x atribuição.
 * - Sempre filtra por `organization_id`.
 * - Paginação, busca e filtros server-side.
 * - Nunca `select('*')`.
 * - Três estados (Resolvido / Parcial / Não resolvido) baseados em
 *   `attribution_method`, `attributed_at`, `campaign_id`, `ad_id`.
 */
export function AttributionTab() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;

  const [range, setRange] = useState<DateRange>(() => computeRange('30d'));
  const [state, setState] = useState<State>('all');
  const [provider, setProvider] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [state, provider, debounced, range.from.getTime(), range.to.getTime(), pageSize]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);

      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const cols = 'id, name, email, phone, created_at, deal_value, utm_source, fbclid';
      const attrCols = 'provider, campaign_id, campaign_name, ad_id, ad_name, attribution_method, attributed_at, confidence_score';

      const applyStateFilter = (q: any, includeInner: boolean) => {
        // provider é aplicado sempre que houver join
        if (provider !== 'all' && includeInner) q = q.eq('lead_attribution.provider', provider);
        return q;
      };

      let data: any[] = [];
      let count = 0;

      if (state === 'unresolved') {
        // Leads sem qualquer linha em lead_attribution OU com attribution_method='unresolved'
        // Para não perder leads totalmente sem atribuição, partimos de leads (LEFT).
        let q = supabase
          .from('leads')
          .select(`${cols}, lead_attribution!left(${attrCols})`, { count: 'exact' })
          .eq('organization_id', orgId)
          .gte('created_at', fromISO).lte('created_at', toISO);

        if (debounced) {
          q = q.or(`name.ilike.%${debounced}%,email.ilike.%${debounced}%,phone.ilike.%${debounced}%`);
        }

        const { data: d, count: c } = await q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
        const filtered = (d ?? []).filter((l: any) => {
          const att = l.lead_attribution?.[0];
          if (!att) return true;
          if (att.attribution_method === 'unresolved') return true;
          if (!att.attributed_at) return true;
          return false;
        });
        data = filtered;
        // count aqui é total de leads no período — não perfeito, mas serve como cota máxima
        count = c ?? filtered.length;
      } else if (state === 'partial') {
        let q = supabase
          .from('leads')
          .select(`${cols}, lead_attribution!inner(${attrCols})`, { count: 'exact' })
          .eq('organization_id', orgId)
          .gte('created_at', fromISO).lte('created_at', toISO)
          .not('lead_attribution.attributed_at', 'is', null)
          .neq('lead_attribution.attribution_method', 'unresolved')
          .or('campaign_id.is.null,ad_id.is.null', { referencedTable: 'lead_attribution' });
        q = applyStateFilter(q, true);
        if (debounced) q = q.or(`name.ilike.%${debounced}%,email.ilike.%${debounced}%,phone.ilike.%${debounced}%`);
        const { data: d, count: c } = await q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
        data = d ?? [];
        count = c ?? data.length;
      } else if (state === 'resolved') {
        let q = supabase
          .from('leads')
          .select(`${cols}, lead_attribution!inner(${attrCols})`, { count: 'exact' })
          .eq('organization_id', orgId)
          .gte('created_at', fromISO).lte('created_at', toISO)
          .not('lead_attribution.attributed_at', 'is', null)
          .neq('lead_attribution.attribution_method', 'unresolved')
          .not('lead_attribution.campaign_id', 'is', null);
        q = applyStateFilter(q, true);
        if (debounced) q = q.or(`name.ilike.%${debounced}%,email.ilike.%${debounced}%,phone.ilike.%${debounced}%`);
        const { data: d, count: c } = await q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
        data = d ?? [];
        count = c ?? data.length;
      } else {
        // all
        let q = supabase
          .from('leads')
          .select(`${cols}, lead_attribution!left(${attrCols})`, { count: 'exact' })
          .eq('organization_id', orgId)
          .gte('created_at', fromISO).lte('created_at', toISO);
        if (provider !== 'all') q = q.eq('lead_attribution.provider', provider);
        if (debounced) q = q.or(`name.ilike.%${debounced}%,email.ilike.%${debounced}%,phone.ilike.%${debounced}%`);
        const { data: d, count: c } = await q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
        data = d ?? [];
        count = c ?? data.length;
      }

      const mapped: Row[] = data.map((l: any) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        created_at: l.created_at,
        deal_value: l.deal_value,
        utm_source: l.utm_source,
        fbclid: l.fbclid,
        attribution: l.lead_attribution?.[0] ?? null,
      }));
      setRows(mapped);
      setTotal(count);
      setLoading(false);
    })();
  }, [orgId, state, provider, debounced, range.from.getTime(), range.to.getTime(), page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const stateBadge = (r: Row) => {
    const a = r.attribution;
    if (!a || a.attribution_method === 'unresolved' || !a.attributed_at) {
      return <Badge variant="outline" className="border-destructive/50 text-destructive">Não resolvido</Badge>;
    }
    if (!a.campaign_id || !a.ad_id) {
      return <Badge variant="outline" className="border-amber-500/50 text-amber-600">Parcial</Badge>;
    }
    return <Badge variant="outline" className="border-emerald-500/50 text-emerald-600">Resolvido</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Período</div>
              <DateRangeControl value={range} onChange={setRange} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Estado</div>
              <Select value={state} onValueChange={(v) => setState(v as State)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="resolved">Resolvidos</SelectItem>
                  <SelectItem value="partial">Parciais</SelectItem>
                  <SelectItem value="unresolved">Não resolvidos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Provedor</div>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="meta">Meta</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="organic">Orgânico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Buscar (nome, e-mail, telefone)</div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: Maria, maria@exemplo.com" className="pl-8" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Provedor</TableHead>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Anúncio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Criado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum lead encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{r.email || '—'}</div>
                      <div>{r.phone || '—'}</div>
                    </TableCell>
                    <TableCell>
                      {r.attribution?.provider ? <Badge variant="secondary">{r.attribution.provider}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.attribution?.campaign_name ?? '—'}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.attribution?.ad_name ?? '—'}</TableCell>
                    <TableCell>{stateBadge(r)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(r.deal_value ?? 0)}</TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {total.toLocaleString('pt-BR')} {total === 1 ? 'registro' : 'registros'}
          {state === 'unresolved' && ' (aproximado — filtrado sobre a página)'}
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="w-[90px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}/pág</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-xs tabular-nums">{page + 1} / {totalPages}</div>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
