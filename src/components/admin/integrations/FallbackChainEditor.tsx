import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, GripVertical, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import {
  FALLBACK_TRIGGER_LABELS,
  DEFAULT_FALLBACK_TRIGGERS,
  type AICapability,
  type AIProvider,
  type FallbackStep,
  type FallbackTriggers,
} from '@/hooks/useAIRouting';
import { getModelsForCapability } from '@/config/aiModelsCatalog';

interface Props {
  capability: AICapability;
  primaryProvider: AIProvider;
  primaryModel: string | null;
  chain: FallbackStep[];
  triggers: FallbackTriggers;
  onChange: (next: { chain: FallbackStep[]; triggers: FallbackTriggers }) => void;
}

const PROVIDERS: AIProvider[] = ['lovable', 'openai', 'anthropic', 'gemini'];

export function FallbackChainEditor({ capability, primaryProvider, primaryModel, chain, triggers, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const safeChain = Array.isArray(chain) ? chain : [];
  const safeTriggers = { ...DEFAULT_FALLBACK_TRIGGERS, ...(triggers ?? {}) };

  const updateChain = (next: FallbackStep[]) => onChange({ chain: next, triggers: safeTriggers });
  const updateTrigger = (key: keyof FallbackTriggers, value: boolean) =>
    onChange({ chain: safeChain, triggers: { ...safeTriggers, [key]: value } });

  const addStep = () => {
    const provider: AIProvider = 'lovable';
    const models = getModelsForCapability(provider, capability);
    const nextModel = models.find((m) => m.id !== primaryModel)?.id || models[0]?.id || '';
    updateChain([...safeChain, { provider, model: nextModel }]);
  };
  const removeStep = (i: number) => updateChain(safeChain.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...safeChain];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    updateChain(next);
  };
  const updateStep = (i: number, patch: Partial<FallbackStep>) => {
    const next = [...safeChain];
    next[i] = { ...next[i], ...patch } as FallbackStep;
    if (patch.provider) {
      const models = getModelsForCapability(patch.provider, capability);
      if (!models.find((m) => m.id === next[i].model)) {
        next[i].model = models[0]?.id || '';
      }
    }
    updateChain(next);
  };

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5" />
          Cadeia de fallback
          {safeChain.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {safeChain.length} modelo{safeChain.length > 1 ? 's' : ''} alternativo{safeChain.length > 1 ? 's' : ''}
            </Badge>
          )}
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Se o modelo principal falhar, a plataforma tenta cada modelo abaixo na ordem definida.
          </p>

          {/* Modelo primário (referência, não editável aqui) */}
          <div className="flex items-center gap-2 rounded border border-dashed bg-muted/30 px-3 py-2 text-xs">
            <Badge variant="outline" className="text-[10px]">Principal</Badge>
            <span className="font-mono truncate">{primaryProvider} · {primaryModel || '—'}</span>
          </div>

          {safeChain.map((step, i) => {
            const models = getModelsForCapability(step.provider, capability);
            return (
              <div key={i} className="flex flex-col gap-2 rounded border bg-card p-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-1">
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant="secondary" className="text-[10px]">#{i + 1}</Badge>
                </div>
                <Select value={step.provider} onValueChange={(v) => updateStep(i, { provider: v as AIProvider })}>
                  <SelectTrigger className="h-8 w-full sm:w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={step.model} onValueChange={(v) => updateStep(i, { model: v })}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Modelo" /></SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (<SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === safeChain.length - 1}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeStep(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}

          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addStep}>
            <Plus className="h-3.5 w-3.5" /> Adicionar modelo de fallback
          </Button>

          <div className="rounded border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Escalar quando ocorrer:</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(FALLBACK_TRIGGER_LABELS) as (keyof FallbackTriggers)[]).map((key) => (
                <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={!!safeTriggers[key]}
                    onCheckedChange={(v) => updateTrigger(key, !!v)}
                  />
                  <span>{FALLBACK_TRIGGER_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
