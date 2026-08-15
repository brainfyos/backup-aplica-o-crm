import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useMarketingCtx, iso } from '../context/MarketingFiltersContext';
import { fmtInt } from '../lib/format';
import { FunnelStageDrawer } from '../drawers/FunnelStageDrawer';

const STAGE_LABEL: Record<string, string> = {
  leads: 'Leads',
  conversas: 'Conversas iniciadas',
  qualificados: 'Qualificados',
  reunioes: 'Reuniões',
  propostas: 'Propostas',
  vendas: 'Vendas',
};

const STAGE_ORDER = ['leads', 'conversas', 'qualificados', 'reunioes', 'propostas', 'vendas'];

export function JourneyTab() {
  const { orgId, filters } = useMarketingCtx();
  const [rows, setRows] = useState<{ stage: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [openStage, setOpenStage] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc('rpc_marketing_funnel', {
        _org: orgId, _from: iso(filters.range.from), _until: iso(filters.range.to),
      });
      if (!error && data) setRows(data as any);
      setLoading(false);
    })();
  }, [orgId, filters.range.from, filters.range.to]);

  const map = new Map(rows.map((r) => [r.stage, Number(r.count)]));
  const first = Number(map.get('leads') ?? 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-1">Jornada dos leads Meta</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Só considera leads cuja atribuição foi resolvida para uma campanha Meta.
          </p>

          {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</div>}

          {!loading && (
            <div className="space-y-2">
              {STAGE_ORDER.map((stage) => {
                const c = Number(map.get(stage) ?? 0);
                const pct = first > 0 ? (c / first) * 100 : 0;
                const prevKey = STAGE_ORDER[STAGE_ORDER.indexOf(stage) - 1];
                const prev = prevKey ? Number(map.get(prevKey) ?? 0) : 0;
                const drop = prev > 0 ? Math.max(0, prev - c) : 0;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => setOpenStage(stage)}
                    className="w-full text-left relative border rounded-lg p-4 bg-muted/30 hover:bg-muted/50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{STAGE_LABEL[stage]}</div>
                        {drop > 0 && (
                          <div className="text-xs text-destructive mt-0.5">
                            {fmtInt(drop)} perdidos na etapa anterior
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold tabular-nums">{fmtInt(c)}</div>
                        <div className="text-xs text-muted-foreground">{pct.toFixed(1)}% do topo</div>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <FunnelStageDrawer stage={openStage} open={!!openStage} onOpenChange={(o) => !o && setOpenStage(null)} />
    </div>
  );
}
