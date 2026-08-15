import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus, Play, Trash2, Zap, ShieldCheck, Loader2, Clock, Target, Sparkles, AlertTriangle,
} from 'lucide-react';
import {
  useMarketingRules, useSafetyLimits, useSaveRule, useToggleRule, useDeleteRule,
  useSaveSafetyLimits, useRunRulesNow, useRuleRuns,
  type MarketingRule, type RuleAction, type RuleCondition, type SafetyLimits, UNVERIFIED_SALES_METRICS,
} from '@/hooks/useMarketingRules';
import { cn } from '@/lib/utils';

const METRIC_LABELS: Record<string, string> = {
  spend: 'Gasto (R$)', clicks: 'Cliques', impressions: 'Impressões',
  leads: 'Leads', purchases: 'Vendas', revenue: 'Receita (R$)',
  roas: 'ROAS', ctr: 'CTR (%)', cpl: 'CPL (R$)', cpc: 'CPC (R$)', cpm: 'CPM (R$)',
};
const OPS = ['>=', '<=', '>', '<', '==', '!='] as const;
const SELECTABLE_METRICS = Object.entries(METRIC_LABELS).filter(([key]) => !UNVERIFIED_SALES_METRICS.has(key as RuleCondition['metric']));
const SCOPE_LABELS = { campaign: 'Campanha', adset: 'Conjunto', ad: 'Anúncio' };

function emptyRule(): Partial<MarketingRule> {
  return {
    name: '', description: '', enabled: true, mode: 'suggest', scope: 'campaign',
    conditions: [{ metric: 'spend', operator: '>=', value: 50 }],
    window_days: 7, action: { type: 'pause' }, cooldown_hours: 24,
  };
}

// -------- Rule Editor Dialog ---------------------------------------------------

function RuleEditor({ initial, trigger, onSaved }: {
  initial?: MarketingRule; trigger: React.ReactNode; onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<MarketingRule>>(initial ?? emptyRule());
  const save = useSaveRule();

  const setAction = (a: RuleAction) => setDraft((d) => ({ ...d, action: a }));
  const setCondition = (i: number, patch: Partial<RuleCondition>) => {
    setDraft((d) => ({ ...d, conditions: (d.conditions ?? []).map((c, idx) => idx === i ? { ...c, ...patch } : c) }));
  };
  const addCondition = () => setDraft((d) => ({ ...d, conditions: [...(d.conditions ?? []), { metric: 'spend', operator: '>=', value: 10 }] }));
  const removeCondition = (i: number) => setDraft((d) => ({ ...d, conditions: (d.conditions ?? []).filter((_, idx) => idx !== i) }));

  const action = draft.action ?? { type: 'pause' };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(initial ?? emptyRule()); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar regra' : 'Nova regra automática'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex.: Pausar campanhas sem venda" />
            </div>
            <div>
              <Label>Escopo</Label>
              <Select value={draft.scope} onValueChange={(v) => setDraft({ ...draft, scope: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="campaign">Campanha</SelectItem>
                  <SelectItem value="adset">Conjunto</SelectItem>
                  <SelectItem value="ad">Anúncio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>

          {/* Conditions */}
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Se (todas as condições)</Label>
              <Button type="button" size="sm" variant="ghost" onClick={addCondition}>
                <Plus className="h-3.5 w-3.5 mr-1" /> condição
              </Button>
            </div>
            {(draft.conditions ?? []).map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_1fr_auto] gap-2 items-center">
                <Select value={c.metric} onValueChange={(v) => setCondition(i, { metric: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SELECTABLE_METRICS.map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={c.operator} onValueChange={(v) => setCondition(i, { operator: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" step="0.01" value={c.value}
                  onChange={(e) => setCondition(i, { value: Number(e.target.value) })} />
                <Button type="button" size="icon" variant="ghost" onClick={() => removeCondition(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Label className="text-xs text-muted-foreground">Janela:</Label>
              <Input type="number" min={1} max={90} className="w-20"
                value={draft.window_days ?? 7}
                onChange={(e) => setDraft({ ...draft, window_days: Number(e.target.value) })} />
              <span className="text-xs text-muted-foreground">dias</span>
            </div>
          </div>

          {/* Action */}
          <div className="rounded-lg border p-3 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Então</Label>
            <Select value={action.type} onValueChange={(v) => {
              if (v === 'pause' || v === 'activate') setAction({ type: v });
              else setAction({ type: v as any, pct: (action as any).pct ?? 20 });
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pause">Pausar</SelectItem>
                <SelectItem value="activate">Ativar</SelectItem>
                <SelectItem value="increase_budget">Aumentar verba (%)</SelectItem>
                <SelectItem value="decrease_budget">Reduzir verba (%)</SelectItem>
              </SelectContent>
            </Select>
            {(action.type === 'increase_budget' || action.type === 'decrease_budget') && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Percentual:</Label>
                <Input type="number" min={1} max={500} className="w-24"
                  value={(action as any).pct}
                  onChange={(e) => setAction({ type: action.type, pct: Number(e.target.value) } as RuleAction)} />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            )}
          </div>

          {/* Mode + cooldown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Modo</Label>
              <Select value={draft.mode} onValueChange={(v) => setDraft({ ...draft, mode: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="suggest">Sugerir (criar recomendação)</SelectItem>
                  <SelectItem value="auto">Aplicar automaticamente</SelectItem>
                </SelectContent>
              </Select>
              {draft.mode === 'auto' && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Sujeito aos Limites de Segurança da organização.
                </p>
              )}
            </div>
            <div>
              <Label>Cooldown</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} value={draft.cooldown_hours ?? 24}
                  onChange={(e) => setDraft({ ...draft, cooldown_hours: Number(e.target.value) })} />
                <span className="text-xs text-muted-foreground">horas</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            disabled={!draft.name || (draft.conditions ?? []).length === 0 || save.isPending}
            onClick={() => save.mutate({ ...(initial ?? {}), ...draft } as any, {
              onSuccess: () => { setOpen(false); onSaved?.(); },
            })}
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Safety Limits Card ---------------------------------------------------

function SafetyLimitsCard() {
  const { data: limits } = useSafetyLimits();
  const save = useSaveSafetyLimits();
  const [draft, setDraft] = useState<Partial<SafetyLimits> | null>(null);
  const cur = draft ?? limits;
  if (!cur) return null;

  const patch = (p: Partial<SafetyLimits>) => setDraft({ ...(cur as any), ...p });
  const dirty = draft !== null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Limites de segurança
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Guardrails que a IA respeita antes de aplicar qualquer regra automática.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Variação máxima de verba</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={500} value={cur.max_budget_change_pct}
                onChange={(e) => patch({ max_budget_change_pct: Number(e.target.value) })} />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <Label>Ações máximas por dia</Label>
            <Input type="number" min={0} value={cur.max_actions_per_day}
              onChange={(e) => patch({ max_actions_per_day: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Horário silencioso</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={23} className="w-16" placeholder="—"
                value={cur.quiet_hours_start ?? ''}
                onChange={(e) => patch({ quiet_hours_start: e.target.value === '' ? null : Number(e.target.value) })} />
              <span className="text-xs text-muted-foreground">às</span>
              <Input type="number" min={0} max={23} className="w-16" placeholder="—"
                value={cur.quiet_hours_end ?? ''}
                onChange={(e) => patch({ quiet_hours_end: e.target.value === '' ? null : Number(e.target.value) })} />
              <span className="text-[11px] text-muted-foreground">({cur.timezone})</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 rounded-md border p-2.5">
            <Switch checked={cur.allow_auto_pause} onCheckedChange={(v) => patch({ allow_auto_pause: v })} />
            <span className="text-sm">Permitir pausar automaticamente</span>
          </label>
          <label className="flex items-center gap-2 rounded-md border p-2.5">
            <Switch checked={cur.allow_auto_budget} onCheckedChange={(v) => patch({ allow_auto_budget: v })} />
            <span className="text-sm">Permitir alterar verba automaticamente</span>
          </label>
          <label className="flex items-center gap-2 rounded-md border p-2.5">
            <Switch checked={cur.allow_auto_activate} onCheckedChange={(v) => patch({ allow_auto_activate: v })} />
            <span className="text-sm">Permitir ativar automaticamente</span>
          </label>
        </div>

        <div>
          <Label>Campanhas bloqueadas (IDs separados por vírgula)</Label>
          <Input
            value={(cur.blocked_campaign_ids ?? []).join(', ')}
            onChange={(e) => patch({ blocked_campaign_ids: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            placeholder="123456789, 987654321"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Nunca serão tocadas por regras automáticas. Recomendações ainda podem ser criadas.
          </p>
        </div>

        {dirty && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(draft!, { onSuccess: () => setDraft(null) })}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar limites
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------- Rule Row -------------------------------------------------------------

function actionLabel(a: RuleAction): string {
  switch (a.type) {
    case 'pause': return 'Pausar';
    case 'activate': return 'Ativar';
    case 'increase_budget': return `Aumentar verba +${a.pct}%`;
    case 'decrease_budget': return `Reduzir verba −${a.pct}%`;
  }
}

function RuleCard({ rule }: { rule: MarketingRule }) {
  const toggle = useToggleRule();
  const del = useDeleteRule();
  const run = useRunRulesNow();
  const usesUnverifiedSales = rule.conditions.some((condition) => UNVERIFIED_SALES_METRICS.has(condition.metric));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{rule.name}</span>
              <Badge variant="outline" className={cn(
                'text-[10px]',
                rule.mode === 'auto'
                  ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                  : 'bg-primary/10 text-primary border-primary/20',
              )}>
                {rule.mode === 'auto' ? <Zap className="h-3 w-3 mr-1 inline" /> : <Sparkles className="h-3 w-3 mr-1 inline" />}
                {rule.mode === 'auto' ? 'Automático' : 'Sugerir'}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                <Target className="h-3 w-3 mr-1 inline" />{SCOPE_LABELS[rule.scope]}
              </Badge>
            </div>
            {rule.description && (
              <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
            )}
          </div>
          <Switch checked={rule.enabled && !usesUnverifiedSales} disabled={usesUnverifiedSales} onCheckedChange={(v) => toggle.mutate({ id: rule.id, enabled: v })} />
        </div>

        <div className="rounded-md bg-muted/40 p-2.5 text-xs space-y-1">
          <div>
            <span className="text-muted-foreground">Se </span>
            {rule.conditions.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="text-muted-foreground"> e </span>}
                <b>{METRIC_LABELS[c.metric] ?? c.metric}</b> {c.operator} <b>{c.value}</b>
              </span>
            ))}
            <span className="text-muted-foreground"> na janela de </span><b>{rule.window_days}d</b>
          </div>
          <div>
            <span className="text-muted-foreground">Então </span>
            <b>{actionLabel(rule.action)}</b>
            <span className="text-muted-foreground"> · cooldown </span><b>{rule.cooldown_hours}h</b>
          </div>
        </div>
        {usesUnverifiedSales && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> Regra bloqueada: usa vendas/receita/ROAS ainda não verificados.
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {rule.last_run_at
              ? `Última avaliação: ${new Date(rule.last_run_at).toLocaleString('pt-BR')} (${rule.last_match_count} matches)`
              : 'Nunca executada'}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => run.mutate(rule.id)} disabled={run.isPending || usesUnverifiedSales}>
              {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              <span className="ml-1">Executar</span>
            </Button>
            <RuleEditor initial={rule} trigger={<Button size="sm" variant="ghost">Editar</Button>} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover regra?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => del.mutate(rule.id)}>Remover</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// -------- Main Sub Tab ---------------------------------------------------------

export function RulesSubTab() {
  const { data: rules = [], isLoading } = useMarketingRules();
  const { data: runs = [] } = useRuleRuns();
  const run = useRunRulesNow();

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> Vendas, receita e ROAS ficam indisponíveis nas automações até a origem de compra ser validada pelo checkout/CRM.
      </div>
      <SafetyLimitsCard />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Regras automáticas</h3>
          <p className="text-xs text-muted-foreground">
            Combine condições de performance com ações. Modo <b>Sugerir</b> cria recomendações; <b>Automático</b> aplica direto na Meta respeitando os limites.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(undefined)}>
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            Executar todas
          </Button>
          <RuleEditor trigger={<Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova regra</Button>} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rules.length === 0 ? (
        <Card className="p-8 text-center">
          <Zap className="h-8 w-8 mx-auto text-primary/60 mb-2" />
          <div className="font-medium">Nenhuma regra criada</div>
          <p className="text-sm text-muted-foreground mt-1">Crie sua primeira regra para automatizar decisões de otimização.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {rules.map((r) => <RuleCard key={r.id} rule={r} />)}
        </div>
      )}

      {runs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Últimas avaliações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs divide-y">
              {runs.slice(0, 15).map((r) => {
                const rule = rules.find((x) => x.id === r.rule_id);
                return (
                  <div key={r.id} className="py-2 grid grid-cols-[1fr_auto] gap-2">
                    <div>
                      <div className="font-medium">{rule?.name ?? 'Regra removida'}</div>
                      <div className="text-muted-foreground">
                        {new Date(r.evaluated_at).toLocaleString('pt-BR')} · {r.triggered_by === 'cron' ? 'automático' : 'manual'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      <Badge variant="outline">{r.matched_count} matches</Badge>
                      {r.recommendations_created > 0 && <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{r.recommendations_created} recs</Badge>}
                      {r.executions_created > 0 && <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20">{r.executions_created} aplicadas</Badge>}
                      {r.skipped_count > 0 && <Badge variant="outline" className="bg-muted">{r.skipped_count} ignoradas</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
