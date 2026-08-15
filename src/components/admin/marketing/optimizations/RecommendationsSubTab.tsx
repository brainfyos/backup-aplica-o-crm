import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, X, PlayCircle, TrendingUp, TrendingDown, PauseCircle,
  ImageOff, Copy, ArrowRightLeft, ArrowRight, Megaphone, Layers, Image as ImageIcon,
  Sparkles, ShieldCheck, ShieldAlert, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useMarketingRecommendations,
  useUpdateRecommendation,
  useApplyRecommendation,
  type MarketingRecommendation,
} from '@/hooks/useMarketingAI';

type ActionKey =
  | 'increase_budget' | 'decrease_budget' | 'pause' | 'activate'
  | 'swap_creative' | 'duplicate' | 'move_budget';

const ACTION_META: Record<string, {
  icon: any; label: string; verb: string; tone: string; ring: string; chip: string;
}> = {
  increase_budget: { icon: TrendingUp,   label: 'Aumentar verba',  verb: 'Aumentar verba de', tone: 'text-emerald-600', ring: 'from-emerald-500/70', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  decrease_budget: { icon: TrendingDown, label: 'Reduzir verba',   verb: 'Reduzir verba de',  tone: 'text-amber-600',   ring: 'from-amber-500/70',   chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  pause:           { icon: PauseCircle,  label: 'Pausar',          verb: 'Pausar',            tone: 'text-rose-600',    ring: 'from-rose-500/70',    chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' },
  activate:        { icon: PlayCircle,   label: 'Ativar',          verb: 'Ativar',            tone: 'text-emerald-600', ring: 'from-emerald-500/70', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  swap_creative:   { icon: ImageOff,     label: 'Trocar criativo', verb: 'Trocar criativo de',tone: 'text-violet-600',  ring: 'from-violet-500/70',  chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20' },
  duplicate:       { icon: Copy,         label: 'Duplicar',        verb: 'Duplicar',          tone: 'text-sky-600',     ring: 'from-sky-500/70',     chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20' },
  move_budget:     { icon: ArrowRightLeft,label:'Realocar verba',  verb: 'Realocar verba de', tone: 'text-indigo-600',  ring: 'from-indigo-500/70',  chip: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20' },
};

const TARGET_META: Record<string, { icon: any; label: string }> = {
  campaign: { icon: Megaphone,  label: 'Campanha' },
  adset:    { icon: Layers,     label: 'Conjunto de anúncios' },
  ad:       { icon: ImageIcon,  label: 'Anúncio' },
  account:  { icon: ShieldCheck,label: 'Conta' },
};

const RISK_META: Record<string, { icon: any; label: string; cls: string }> = {
  low:    { icon: ShieldCheck, label: 'Risco baixo',   cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  medium: { icon: Shield,      label: 'Risco médio',   cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  high:   { icon: ShieldAlert, label: 'Risco alto',    cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' },
};

// ---- Value formatting helpers ---------------------------------------------

const CURRENCY_KEYS = new Set(['daily_budget', 'lifetime_budget', 'budget', 'bid_amount']);
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo', PAUSED: 'Pausado', ARCHIVED: 'Arquivado', DELETED: 'Excluído',
};

function formatCurrencyBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toCurrencyValue(raw: any): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Meta stores in minor units when large; treat >=1000 as cents.
  return n >= 1000 ? n / 100 : n;
}

function formatValue(key: string, raw: any): string {
  if (raw == null || raw === '') return '—';
  if (CURRENCY_KEYS.has(key)) {
    const v = toCurrencyValue(raw);
    if (v == null) return String(raw);
    return key === 'daily_budget' ? `${formatCurrencyBRL(v)}/dia` : formatCurrencyBRL(v);
  }
  if (key === 'status') return STATUS_LABEL[String(raw).toUpperCase()] ?? String(raw);
  if (typeof raw === 'object') return JSON.stringify(raw);
  return String(raw);
}

const KEY_LABEL: Record<string, string> = {
  status: 'Status',
  daily_budget: 'Orçamento diário',
  lifetime_budget: 'Orçamento total',
  name: 'Nome',
  bid_amount: 'Lance',
};

type DiffRow = { key: string; label: string; from: string; to: string; delta?: string };

function buildDiff(current: any, proposed: any): DiffRow[] {
  const cur = (current ?? {}) as Record<string, any>;
  const prop = (proposed ?? {}) as Record<string, any>;
  const keys = Array.from(new Set([...Object.keys(cur), ...Object.keys(prop)]))
    .filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(prop[k]));

  return keys.map((k) => {
    const row: DiffRow = {
      key: k,
      label: KEY_LABEL[k] ?? k,
      from: formatValue(k, cur[k]),
      to: formatValue(k, prop[k]),
    };
    if (CURRENCY_KEYS.has(k)) {
      const a = toCurrencyValue(cur[k]);
      const b = toCurrencyValue(prop[k]);
      if (a != null && b != null && a > 0) {
        const pct = ((b - a) / a) * 100;
        const sign = pct > 0 ? '+' : '';
        row.delta = `${sign}${pct.toFixed(0)}%`;
      }
    }
    return row;
  });
}

// ---- Component -------------------------------------------------------------

export function RecommendationsSubTab() {
  const { data: recs = [], isLoading } = useMarketingRecommendations('pending');
  const update = useUpdateRecommendation();
  const apply = useApplyRecommendation();
  const [confirmRec, setConfirmRec] = useState<MarketingRecommendation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (recs.length === 0) {
    return (
      <Card className="p-10 text-center">
        <Sparkles className="h-8 w-8 mx-auto text-primary/60 mb-3" />
        <div className="font-medium">Sem recomendações pendentes</div>
        <p className="text-sm text-muted-foreground mt-1">
          Rode <b>Reanalisar agora</b> na aba Diagnóstico para gerar novas sugestões.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {recs.map((r) => {
          const action = ACTION_META[r.action_type] ?? ACTION_META.activate;
          const target = TARGET_META[r.target_type] ?? { icon: Megaphone, label: r.target_type };
          const risk = RISK_META[r.risk] ?? RISK_META.medium;
          const diff = buildDiff(r.current_state, r.proposed_state);
          const ActionIcon = action.icon;
          const TargetIcon = target.icon;
          const RiskIcon = risk.icon;
          const isBusy = busyId === r.id && apply.isPending;
          const requiresCreative = r.action_type === 'swap_creative';

          return (
            <Card key={r.id} className="overflow-hidden border-border/60 hover:border-border transition-colors">
              {/* Colored top ribbon */}
              <div className={cn('h-1 w-full bg-gradient-to-r to-transparent', action.ring)} />

              <div className="p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn('h-10 w-10 rounded-xl grid place-items-center shrink-0 border', action.chip)}>
                      <ActionIcon className={cn('h-5 w-5', action.tone)} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <TargetIcon className="h-3 w-3" />
                        {target.label}
                      </div>
                      <div className="font-semibold text-[15px] leading-tight mt-0.5 truncate" title={r.target_label ?? undefined}>
                        {r.target_label ?? r.target_ref_id ?? 'Alvo desconhecido'}
                      </div>
                      <div className="mt-1">
                        <Badge variant="outline" className={cn('h-5 text-[10px] font-medium', action.chip)}>
                          {action.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className={cn('gap-1 shrink-0', risk.cls)}>
                    <RiskIcon className="h-3 w-3" />
                    {risk.label}
                  </Badge>
                </div>

                {/* Rationale */}
                {r.rationale && (
                  <p className="text-sm text-foreground/80 leading-relaxed">{r.rationale}</p>
                )}

                {/* Visual diff */}
                {diff.length > 0 ? (
                  <div className="rounded-lg border bg-muted/30 divide-y">
                    {diff.map((d) => (
                      <div key={d.key} className="grid grid-cols-[110px_1fr] gap-3 px-3 py-2.5 items-center">
                        <div className="text-xs font-medium text-muted-foreground">{d.label}</div>
                        <div className="flex items-center gap-2 flex-wrap text-sm">
                          <span className="px-2 py-0.5 rounded-md bg-background border text-muted-foreground line-through decoration-muted-foreground/40">
                            {d.from}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className={cn('px-2 py-0.5 rounded-md border font-medium', action.chip)}>
                            {d.to}
                          </span>
                          {d.delta && (
                            <span className={cn('text-[11px] font-semibold', action.tone)}>{d.delta}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">Sem alterações estruturais.</div>
                )}

                {/* Expected */}
                {r.expected_result && (
                  <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                    <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <span className="font-semibold">Resultado esperado: </span>
                      <span className="text-foreground/80">{r.expected_result}</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update.mutate({ id: r.id, status: 'dismissed' })}
                    disabled={isBusy}
                  >
                    <X className="h-4 w-4 mr-1" /> Ignorar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => !requiresCreative && setConfirmRec(r)}
                    disabled={isBusy}
                    variant={requiresCreative ? 'outline' : 'default'}
                    className="shadow-sm"
                  >
                    {requiresCreative ? (
                      <><Sparkles className="h-4 w-4 mr-1" /> Requer novo criativo</>
                    ) : isBusy ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Aplicando…</>
                    ) : (
                      <><PlayCircle className="h-4 w-4 mr-1" /> Aplicar na Meta</>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!confirmRec} onOpenChange={(o) => !o && setConfirmRec(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar recomendação na Meta?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {confirmRec && (
                  <p>
                    <b>{ACTION_META[confirmRec.action_type]?.verb ?? 'Aplicar'}</b>{' '}
                    <span className="font-medium">{confirmRec.target_label ?? confirmRec.target_ref_id}</span>.
                  </p>
                )}
                {confirmRec && buildDiff(confirmRec.current_state, confirmRec.proposed_state).map((d) => (
                  <div key={d.key} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-24">{d.label}:</span>
                    <span className="line-through text-muted-foreground">{d.from}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-semibold">{d.to}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">
                  Aplicado imediatamente via Graph API e registrado em <b>Execuções</b>. Reversível a qualquer momento.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmRec) return;
                setBusyId(confirmRec.id);
                apply.mutate(confirmRec.id, { onSettled: () => setBusyId(null) });
                setConfirmRec(null);
              }}
            >
              Aplicar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
