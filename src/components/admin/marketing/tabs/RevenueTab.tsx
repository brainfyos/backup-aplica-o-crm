import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown, Wallet, DollarSign, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useMarketingCtx, iso } from '../context/MarketingFiltersContext';
import { fmtBRL, fmtRoas } from '../lib/format';

type Row = { campaign_id: string; campaign_name: string; spend: number; revenue: number; roas: number; sales: number };

export function RevenueTab() {
  const { orgId, filters } = useMarketingCtx();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await (supabase as any).rpc('rpc_marketing_campaign_performance', {
        _org: orgId, _from: iso(filters.range.from), _until: iso(filters.range.to),
      });
      if (rpcError) setError(rpcError.message || 'Não foi possível carregar a receita confirmada.');
      setRows((data as any) ?? []);
      setLoading(false);
    })();
  }, [orgId, filters.range.from, filters.range.to]);

  const totalSpend = rows.reduce((s, r) => s + Number(r.spend || 0), 0);
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
  const profit = totalRevenue - totalSpend;
  const roi = totalSpend > 0 ? (profit / totalSpend) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div><strong>Receita verificada pelo checkout.</strong> Esta tela ignora o campo “Compras” informado pela Meta e conta somente pagamentos confirmados por Cakto, Doppus ou Hotmart.</div>
      </div>
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="h-3.5 w-3.5" /> Investimento</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{fmtBRL(totalSpend)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="h-3.5 w-3.5" /> Receita</div>
          <div className="text-2xl font-bold mt-1 tabular-nums text-emerald-600">{fmtBRL(totalRevenue)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {profit >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
            Lucro
          </div>
          <div className={`text-2xl font-bold mt-1 tabular-nums ${profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{fmtBRL(profit)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">ROI / ROAS</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {roi.toFixed(0)}% <span className="text-sm text-muted-foreground font-normal">/ {fmtRoas(totalSpend > 0 ? totalRevenue / totalSpend : 0)}</span>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</div>}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Sem dados de vendas atribuídas no período.</p>
          )}
          {!loading && rows.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold">Receita por campanha</h4>
              {rows
                .filter((r) => Number(r.revenue) > 0 || Number(r.spend) > 0)
                .sort((a, b) => Number(b.revenue) - Number(a.revenue))
                .slice(0, 15)
                .map((r) => {
                  const rev = Number(r.revenue || 0);
                  const spend = Number(r.spend || 0);
                  const p = rev - spend;
                  return (
                    <div key={r.campaign_id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium truncate max-w-[60%]">{r.campaign_name}</div>
                        <div className="text-sm tabular-nums">
                          <span className="text-muted-foreground mr-3">Invest.: {fmtBRL(spend)}</span>
                          <span className="text-emerald-600 mr-3">Rec.: {fmtBRL(rev)}</span>
                          <span className={p >= 0 ? 'text-emerald-600 font-semibold' : 'text-destructive font-semibold'}>Lucro: {fmtBRL(p)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
