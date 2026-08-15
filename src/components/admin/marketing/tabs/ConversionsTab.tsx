import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, ChevronDown, CircleAlert, Radio, Target } from 'lucide-react';
import { toast } from 'sonner';
import { useMarketingCtx } from '../context/MarketingFiltersContext';
import { useConversionDefinitions, setConversionPrimary, setConversionStageMap, type ConversionDefinition } from '@/hooks/useConversionDefinitions';
import { groupConversionGoals, normalizeConversionName } from '../lib/conversionGoals';
import { fmtInt } from '../lib/format';
import { ConversionDrawer } from '../drawers/ConversionDrawer';

type Stage = { id: string; name: string };

export function ConversionsTab() {
  const { orgId, selectedConversion, setSelectedConversionId } = useMarketingCtx();
  const { conversions, reload } = useConversionDefinitions(orgId);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selected, setSelected] = useState<ConversionDefinition | null>(null);
  const goals = useMemo(() => groupConversionGoals(conversions), [conversions]);
  const activeGoal = goals.find((goal) => goal.recommended.external_id === selectedConversion?.external_id) ?? goals[0];

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      // pipeline_stages não tem organization_id: as etapas pertencem aos produtos da org.
      const { data: prods } = await (supabase.from('products') as any)
        .select('id')
        .eq('organization_id', orgId);
      const productIds = (prods ?? []).map((p: any) => p.id);
      if (!productIds.length) { if (!cancelled) setStages([]); return; }
      const { data } = await (supabase.from('pipeline_stages') as any)
        .select('id, name')
        .in('product_id', productIds)
        .order('order_index');
      if (!cancelled) setStages((data ?? []) as Stage[]);
    })();
    return () => { cancelled = true; };
  }, [orgId]);


  const activateGoal = async (conversion: ConversionDefinition) => {
    if (!orgId) return;
    const { error } = await setConversionPrimary(orgId, conversion.id);
    if (error) return toast.error(error.message);
    setSelectedConversionId(conversion.external_id);
    toast.success('Objetivo aplicado ao painel');
    reload();
  };

  const handleStage = async (conversion: ConversionDefinition, stageId: string) => {
    const { error } = await setConversionStageMap(conversion.id, stageId === '__none__' ? null : stageId);
    if (error) toast.error(error.message);
    else { toast.success('Etapa da jornada salva'); reload(); }
  };

  const duplicateCount = activeGoal ? activeGoal.definitions.length - 1 : 0;
  const hasRecentEvents = Number(activeGoal?.recommended.count_30d ?? 0) > 0;
  const purchaseUnverified = ['purchase', 'compras'].includes(normalizeConversionName(activeGoal?.recommended.name ?? ''));

  return (
    <div className="space-y-4">
      {purchaseUnverified && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex gap-3"><CircleAlert className="h-5 w-5 shrink-0 text-amber-600" /><div><div className="font-medium">Isto é um evento Purchase da Meta, não uma venda confirmada</div><p className="mt-1 text-sm text-muted-foreground">Os {fmtInt(activeGoal?.count30d ?? 0)} eventos ficam fora de vendas, receita e ROAS até serem conciliados com o checkout/CRM.</p></div></div>
        </div>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Objetivo de conversão</CardTitle>
          <p className="text-sm text-muted-foreground">Escolha o resultado do negócio. O Vendus cuida do evento e da conversão técnica usados na Meta.</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal) => {
            const active = goal.recommended.external_id === selectedConversion?.external_id;
            return (
              <button key={goal.key} onClick={() => activateGoal(goal.recommended)} className={`rounded-lg border p-4 text-left transition-colors ${active ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{goal.label}</div><div className="text-xs text-muted-foreground mt-1">{fmtInt(goal.count30d)} resultados em 30 dias</div></div>
                  {active && <Badge>Em uso</Badge>}
                </div>
                {goal.definitions.length > 1 && <div className="mt-3 text-xs text-amber-700 dark:text-amber-400">{goal.definitions.length} definições encontradas · melhor opção selecionada automaticamente</div>}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Diagnóstico do rastreamento</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HealthItem ok={!!activeGoal} label="Evento identificado" detail={activeGoal?.label ?? 'Sincronize a conta Meta'} />
          <HealthItem ok={!!activeGoal?.recommended.pixel_id} label="Pixel conectado" detail={activeGoal?.recommended.pixel_id ? `Pixel ${activeGoal.recommended.pixel_id}` : 'Pixel não informado pela Meta'} />
          <HealthItem ok={hasRecentEvents} label="Conversões recebidas" detail={hasRecentEvents ? `${fmtInt(activeGoal!.count30d)} nos últimos 30 dias` : 'Nenhum resultado recente'} />
          <HealthItem ok label="Atribuição alinhada" detail="Configuração do conjunto de anúncios" />
        </CardContent>
      </Card>

      {duplicateCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-4 dark:bg-amber-950/20">
          <div className="flex gap-3"><CircleAlert className="h-5 w-5 text-amber-600 shrink-0" /><div><div className="font-medium">Duplicata tratada pelo Vendus</div><p className="text-sm text-muted-foreground mt-1">Encontramos {duplicateCount + 1} conversões com o mesmo objetivo. O painel usa somente a recomendada e não soma eventos diferentes.</p></div></div>
        </div>
      )}

      <details className="group rounded-lg border">
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium">Configurações avançadas <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
        <div className="border-t overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Definição técnica</TableHead><TableHead>Tipo</TableHead><TableHead>Etapa da jornada</TableHead><TableHead className="text-right">30 dias</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
            <TableBody>
              {conversions.map((conversion) => (
                <TableRow key={conversion.id} className="cursor-pointer" onClick={() => setSelected(conversion)}>
                  <TableCell><div className="font-medium">{conversion.name}</div><div className="text-[11px] text-muted-foreground font-mono">{conversion.external_id}</div></TableCell>
                  <TableCell><Badge variant="outline">{conversion.kind === 'custom' ? 'Personalizada' : 'Evento do Pixel'}</Badge></TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}><Select value={conversion.mapped_stage_id ?? '__none__'} onValueChange={(value) => handleStage(conversion, value)}><SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none__">Não mapeada</SelectItem>{stages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell className="text-right">{fmtInt(conversion.count_30d)}</TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}><Button size="sm" variant={conversion.external_id === selectedConversion?.external_id ? 'secondary' : 'ghost'} onClick={() => activateGoal(conversion)}><Radio className="h-3.5 w-3.5 mr-1" /> Usar</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>

      <ConversionDrawer conversion={selected} open={!!selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}

function HealthItem({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-sm font-medium">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-amber-600" />}{label}</div><div className="mt-1 text-xs text-muted-foreground truncate">{detail}</div></div>;
}
