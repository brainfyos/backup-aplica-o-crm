import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { FunnelBlock, FunnelBlockData } from '@/types/funnel';

interface Props {
  block: FunnelBlock;
  blocks: FunnelBlock[];
  onUpdate: (updates: Partial<FunnelBlock>) => void;
}

type Display = NonNullable<FunnelBlockData['block_display']>;
type Rule = NonNullable<Display['rules']>[number];

export function DisplayTab({ block, blocks, onUpdate }: Props) {
  const disp: Display = block.data.block_display || {};
  const setDisp = (patch: Partial<Display>) =>
    onUpdate({ data: { ...block.data, block_display: { ...disp, ...patch } } });

  const rules: Rule[] = disp.rules || [];

  const sources = useMemo(
    () =>
      blocks
        .filter((b) => b.id !== block.id && (b.data.variable_name || b.type === 'buttons' || b.type === 'input'))
        .map((b) => ({
          id: b.data.variable_name || b.id,
          label:
            (b.data as any).step_label ||
            b.data.content ||
            b.data.variable_name ||
            b.id.slice(0, 8),
        })),
    [blocks, block.id],
  );

  const updateRule = (idx: number, patch: Partial<Rule>) => {
    const next = [...rules];
    next[idx] = { ...next[idx], ...patch };
    setDisp({ rules: next });
  };
  const addRule = () =>
    setDisp({
      rules: [
        ...rules,
        {
          id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          source: sources[0]?.id || '',
          operator: 'eq',
          value: '',
          combinator: 'and',
        },
      ],
    });
  const removeRule = (idx: number) =>
    setDisp({ rules: rules.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Mostrar após</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input
            type="number"
            min={0}
            className="h-8 text-xs"
            value={disp.delay_seconds ?? ''}
            onChange={(e) =>
              setDisp({
                delay_seconds: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            placeholder="Segundos"
          />
          <span className="text-xs text-muted-foreground">segundos</span>
        </div>
      </div>

      <div>
        <Label className="text-xs">Aparecer em</Label>
        <Select value={disp.device || 'all'} onValueChange={(v) => setDisp({ device: v as any })}>
          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos os dispositivos</SelectItem>
            <SelectItem value="mobile" className="text-xs">Apenas mobile</SelectItem>
            <SelectItem value="desktop" className="text-xs">Apenas desktop</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border-t pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">Regras de exibição</Label>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={addRule}>
            <Plus className="h-3 w-3 mr-1" /> adicionar regra
          </Button>
        </div>

        {rules.length === 0 && (
          <p className="text-[11px] text-muted-foreground py-3 text-center border border-dashed rounded-md">
            Sem regras — o bloco sempre aparece.
          </p>
        )}

        {rules.map((r, idx) => (
          <div key={r.id} className="rounded-md border bg-muted/20 p-2 space-y-2">
            {idx > 0 && (
              <Select
                value={r.combinator || 'and'}
                onValueChange={(v) => updateRule(idx, { combinator: v as any })}
              >
                <SelectTrigger className="h-7 text-[11px] w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="and" className="text-xs">E</SelectItem>
                  <SelectItem value="or" className="text-xs">OU</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-1.5 items-start">
              <div className="space-y-1.5">
                <Select value={r.source} onValueChange={(v) => updateRule(idx, { source: v })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Variável" /></SelectTrigger>
                  <SelectContent>
                    {sources.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-[110px_1fr] gap-1.5">
                  <Select value={r.operator} onValueChange={(v) => updateRule(idx, { operator: v as any })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq" className="text-xs">igual</SelectItem>
                      <SelectItem value="neq" className="text-xs">diferente</SelectItem>
                      <SelectItem value="contains" className="text-xs">contém</SelectItem>
                      <SelectItem value="gt" className="text-xs">maior</SelectItem>
                      <SelectItem value="lt" className="text-xs">menor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-7 text-xs"
                    value={String(r.value ?? '')}
                    onChange={(e) => updateRule(idx, { value: e.target.value })}
                    placeholder="valor"
                  />
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive shrink-0"
                onClick={() => removeRule(idx)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
