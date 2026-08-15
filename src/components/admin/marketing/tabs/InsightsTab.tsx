import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Bot, User, Users, Loader2 } from 'lucide-react';
import { useMarketingCtx, iso } from '../context/MarketingFiltersContext';
import { fmtInt, fmtBRL, fmtRoas } from '../lib/format';

type BestOfRow = { kind: string; label: string; metric: string; value: number };
type AI = {
  leads_total: number; leads_ia: number; leads_humano: number; leads_misto: number;
  vendas_ia: number; vendas_humano: number; vendas_misto: number;
  receita_ia: number; receita_humano: number;
  taxa_conv_ia: number; taxa_conv_humano: number;
};

const KIND_LABEL: Record<string, string> = {
  campaign_by_roas: 'Melhor campanha (ROAS)',
  campaign_by_sales: 'Campanha que mais vendeu',
  campaign_by_leads: 'Campanha com mais leads',
  campaign_by_cpl: 'Melhor CPL',
};

export function InsightsTab() {
  const { orgId, filters } = useMarketingCtx();
  const [best, setBest] = useState<BestOfRow[]>([]);
  const [ai, setAI] = useState<AI | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const [{ data: b }, { data: a }] = await Promise.all([
        (supabase as any).rpc('rpc_marketing_best_of', { _org: orgId, _from: iso(filters.range.from), _until: iso(filters.range.to) }),
        (supabase as any).rpc('rpc_marketing_ai_influence', { _org: orgId, _from: iso(filters.range.from), _until: iso(filters.range.to) }),
      ]);
      setBest((b as any) ?? []);
      setAI(((a as any) ?? [])[0] ?? null);
      setLoading(false);
    })();
  }, [orgId, filters.range.from, filters.range.to]);

  const fmtVal = (kind: string, v: number | null) => {
    if (v == null) return '—';
    if (kind === 'campaign_by_roas') return fmtRoas(v);
    if (kind === 'campaign_by_cpl') return fmtBRL(v);
    return fmtInt(v);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Destaques do período</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-16 animate-pulse bg-muted rounded" /></CardContent></Card>
          ))}
          {!loading && best.map((b) => (
            <Card key={b.kind}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{KIND_LABEL[b.kind] ?? b.kind}</div>
                <div className="font-semibold truncate mt-1">{b.label || '—'}</div>
                <div className="text-2xl font-bold tabular-nums mt-1">{fmtVal(b.kind, Number(b.value))}</div>
              </CardContent>
            </Card>
          ))}
          {!loading && best.length === 0 && (
            <div className="col-span-full text-sm text-muted-foreground text-center py-6">Sem dados suficientes ainda.</div>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Influência da IA</h3>
        {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</div>}
        {ai && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Bot className="h-3.5 w-3.5" /> Atendidos pela IA</div>
                <div className="text-2xl font-bold mt-1 tabular-nums">{fmtInt(ai.leads_ia)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {fmtInt(ai.vendas_ia)} vendas · {fmtBRL(ai.receita_ia)} · conv. {(Number(ai.taxa_conv_ia) * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><User className="h-3.5 w-3.5" /> Atendidos por humano</div>
                <div className="text-2xl font-bold mt-1 tabular-nums">{fmtInt(ai.leads_humano)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {fmtInt(ai.vendas_humano)} vendas · {fmtBRL(ai.receita_humano)} · conv. {(Number(ai.taxa_conv_humano) * 100).toFixed(1)}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Mistos (IA + humano)</div>
                <div className="text-2xl font-bold mt-1 tabular-nums">{fmtInt(ai.leads_misto)}</div>
                <div className="text-xs text-muted-foreground mt-1">{fmtInt(ai.vendas_misto)} vendas</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Em breve: melhores criativos, melhores horários e melhores públicos.
        </CardContent>
      </Card>
    </div>
  );
}
