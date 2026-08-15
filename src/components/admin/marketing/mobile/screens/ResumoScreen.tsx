import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Sparkles, SlidersHorizontal, Trophy, AlertTriangle } from 'lucide-react';
import { KpiCardLarge } from '../components/KpiCardLarge';
import { fmtBRL, fmtInt, fmtPct100, fmtRoas, safeDiv } from '../../lib/format';
import { MOBILE_KPI_META, MobileKpiKey, useMobileDashboardPrefs } from '../hooks/useMobileDashboardPrefs';
import { MetaShellContext } from '../../MarketingShell';


type Props = { ctx: MetaShellContext; onOpenCopilot: () => void };

/** Configuração de KPI → função de formatação e regra de inversão de delta. */
const KPI_CONFIG: Record<MobileKpiKey, {
  format: (v: any) => string;
  invert?: boolean;
}> = {
  spend:       { format: (v) => fmtBRL(v) },
  impressions: { format: (v) => fmtInt(v) },
  clicks:      { format: (v) => fmtInt(v) },
  ctr:         { format: (v) => fmtPct100(v != null ? v * 100 : null) },
  cpc:         { format: (v) => (v == null ? '—' : fmtBRL(v)), invert: true },
  cpm:         { format: (v) => (v == null ? '—' : fmtBRL(v)), invert: true },
  leads:       { format: (v) => fmtInt(v) },
  cpl:         { format: (v) => (v == null ? '—' : fmtBRL(v)), invert: true },
  conversas:   { format: (v) => fmtInt(v) },
  purchases:   { format: (v) => fmtInt(v) },
  revenue:     { format: (v) => fmtBRL(v) },
  roas:        { format: (v) => fmtRoas(v) },
};

export function ResumoScreen({ ctx, onOpenCopilot }: Props) {
  const { kpis, filteredCampaigns, perCampaign, hasDataInPeriod, syncing, syncError, cred, filters } = ctx;
  const { visible, order, hidden, toggle, reset } = useMobileDashboardPrefs();
  const [customize, setCustomize] = useState(false);
  const trustedVisible = visible.filter((key) => ctx.salesVerified || !['purchases', 'revenue', 'roas'].includes(key));
  const trustedOrder = order.filter((key) => ctx.salesVerified || !['purchases', 'revenue', 'roas'].includes(key));

  const { topCampaign, worstCampaign } = useMemo(() => {
    let top: { name: string; cost: number | null; spend: number } | null = null;
    let worst: { name: string; cost: number | null; spend: number } | null = null;
    for (const c of filteredCampaigns) {
      const m = perCampaign[c.external_id];
      if (!m || m.spend <= 0) continue;
      const cost = safeDiv(m.spend, m.purchases);
      if (cost == null) continue;
      const entry = { name: c.name || c.external_id, cost, spend: m.spend };
      if (!top || cost < (top.cost ?? Infinity)) top = entry;
      if (!worst || cost > (worst.cost ?? -Infinity)) worst = entry;
    }
    return { topCampaign: top, worstCampaign: worst };
  }, [filteredCampaigns, perCampaign]);

  return (
    <div className="px-4 pb-24 pt-3 space-y-4">
      {/* CTA IA — cartão hero */}
      <button
        type="button"
        onClick={onOpenCopilot}
        className="w-full rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 flex items-center gap-3 text-left active:scale-[0.99] transition"
      >
        <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Copiloto de Marketing</p>
          <p className="text-xs text-muted-foreground truncate">
            Pergunte, diagnostique e otimize suas campanhas
          </p>
        </div>
      </button>

      {/* Cabeçalho de KPIs com botão de personalizar */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-foreground">Métricas do período</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => setCustomize(true)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
          Personalizar
        </Button>
      </div>

      {!hasDataInPeriod && !syncing && (
        <div className="px-1 text-xs text-muted-foreground" role="status">
          {syncError
            ? 'Não foi possível atualizar os dados agora.'
            : filters.range.preset === 'today'
              ? 'Sem atividade registrada hoje pela Meta.'
              : 'Sem atividade registrada neste período.'}
          {cred?.last_sync_at && (
            <span className="block mt-0.5">
              Última atualização: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(cred.last_sync_at))}
            </span>
          )}
        </div>
      )}

      {/* Grid de KPIs 2 colunas */}
      <div className="grid grid-cols-2 gap-3">
        {trustedVisible.map((key) => {
          const meta = MOBILE_KPI_META[key];
          const cfg = KPI_CONFIG[key];
          const k = (kpis as any)?.[key];
          const value = cfg.format(k?.curr);
          const delta = k?.delta ?? null;
          return (
            <KpiCardLarge
              key={key}
              label={meta.label}
              value={value}
              delta={delta}
              invertDelta={cfg.invert}
              hint={meta.hint}
              accent={key === 'roas' || key === 'leads' ? 'primary' : 'default'}
            />
          );
        })}
        {trustedVisible.length === 0 && (
          <p className="col-span-2 text-center text-sm text-muted-foreground py-6">
            Nenhum KPI visível. Toque em <b>Personalizar</b> para escolher.
          </p>
        )}
      </div>

      {/* Destaques */}
      {(topCampaign || worstCampaign) && (
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-semibold text-foreground px-1">Destaques</h2>
          {topCampaign && (
            <Card className="p-3 flex items-center gap-3 border-emerald-500/30 bg-emerald-500/5">
              <div className="h-9 w-9 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Trophy className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Menor custo por {ctx.conversionLabel ?? 'resultado'}</p>
                <p className="text-sm font-medium truncate">{topCampaign.name}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {topCampaign.cost == null ? '—' : fmtBRL(topCampaign.cost)}
              </p>
            </Card>
          )}
          {worstCampaign && worstCampaign.name !== topCampaign?.name && (
            <Card className="p-3 flex items-center gap-3 border-rose-500/30 bg-rose-500/5">
              <div className="h-9 w-9 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Requer atenção</p>
                <p className="text-sm font-medium truncate">{worstCampaign.name}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {worstCampaign.cost == null ? '—' : fmtBRL(worstCampaign.cost)}
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Sheet de personalização */}
      <Sheet open={customize} onOpenChange={setCustomize}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left mb-2">
            <SheetTitle>Personalizar métricas</SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mb-3">
            Escolha quais cartões aparecem no seu resumo.
          </p>
          <div className="space-y-1">
            {trustedOrder.map((key) => {
              const isVisible = !hidden.includes(key);
              const meta = MOBILE_KPI_META[key];
              return (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 py-2.5 px-1 border-b border-border last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">{meta.hint}</p>
                  </div>
                  <Switch checked={isVisible} onCheckedChange={() => toggle(key)} />
                </label>
              );
            })}
          </div>
          <div className="pt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={reset}>
              Restaurar padrão
            </Button>
            <Button className="flex-1" onClick={() => setCustomize(false)}>
              Concluir
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
