import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronRight } from 'lucide-react';
import { fmtBRL, fmtInt, safeDiv } from '../../lib/format';
import { objectiveLabel, statusLabel, statusTone } from '@/lib/metaAdsLabels';
import { MetaShellContext, Campaign } from '../../MarketingShell';
import { CampaignDrawer } from '../../drawers/CampaignDrawer';

type Filter = 'all' | 'active' | 'paused';

export function CampanhasScreen({ ctx }: { ctx: MetaShellContext }) {
  const { filteredCampaigns, perCampaign } = ctx;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [open, setOpen] = useState(false);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return filteredCampaigns.filter((c) => {
      if (filter === 'active' && (c.status || '').toUpperCase() !== 'ACTIVE') return false;
      if (filter === 'paused' && (c.status || '').toUpperCase() === 'ACTIVE') return false;
      if (!term) return true;
      const name = (c.name || c.external_id).toLowerCase();
      return name.includes(term);
    });
  }, [filteredCampaigns, q, filter]);

  return (
    <div className="pb-24">
      {/* Filtros pinados */}
      <div className="sticky top-[calc(env(safe-area-inset-top,0px)+56px)] z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="p-3 space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar campanha…"
              className="pl-9 h-10 rounded-full bg-muted/50 border-transparent focus-visible:bg-background"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {(['all', 'active', 'paused'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {f === 'all' ? 'Todas' : f === 'active' ? 'Ativas' : 'Pausadas'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="px-4 pt-3 space-y-2">
        {list.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            Nenhuma campanha corresponde aos filtros.
          </p>
        )}
        {list.map((c) => {
          const m = perCampaign[c.external_id];
          const spend = m?.spend ?? 0;
          const results = m?.purchases ?? 0;
          const costPerResult = m ? safeDiv(m.spend, m.purchases) : null;
          const tone = statusTone(c.status);
          return (
            <button
              key={c.id}
              onClick={() => { setSelected(c); setOpen(true); }}
              className="w-full text-left"
            >
              <Card className="p-4 hover:bg-accent/40 active:bg-accent transition-colors">
                <div className="flex items-start gap-2 justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{c.name || c.external_id}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {objectiveLabel(c.objective)}
                    </p>
                  </div>
                  <Badge
                    variant={tone === 'active' ? 'default' : tone === 'destructive' ? 'destructive' : 'outline'}
                    className="text-[10px] shrink-0"
                  >
                    {statusLabel(c.status)}
                  </Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Gasto</p>
                    <p className="text-xs font-semibold tabular-nums">{fmtBRL(spend)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground truncate">{ctx.conversionLabel ?? 'Resultados'}</p>
                    <p className="text-xs font-semibold tabular-nums">{fmtInt(results)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Custo/res.</p>
                    <p className="text-xs font-semibold tabular-nums">
                      {costPerResult == null ? '—' : fmtBRL(costPerResult)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Cliques</p>
                    <p className="text-xs font-semibold tabular-nums">{fmtInt(m?.clicks ?? 0)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-end mt-2 text-[11px] text-muted-foreground">
                  Ver detalhes <ChevronRight className="h-3 w-3 ml-0.5" />
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <CampaignDrawer
        campaign={selected}
        metrics={selected ? perCampaign[selected.external_id] ?? { spend: 0, impressions: 0, clicks: 0, ctwa: 0, purchases: 0, revenue: 0 } : null}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
