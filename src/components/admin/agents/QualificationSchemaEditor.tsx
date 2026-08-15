import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import {
  QUALIFICATION_PRESETS,
  type QualificationSchema,
  type QualificationField,
} from '@/types/agents';

interface Props {
  value: QualificationSchema | Record<string, any> | null | undefined;
  onChange: (next: QualificationSchema | null) => void;
}

function normalize(raw: any): QualificationSchema {
  if (raw && Array.isArray(raw.fields)) {
    return {
      name: raw.name || 'Qualificação',
      fields: raw.fields.map((f: any) => ({
        key: String(f.key || ''),
        label: String(f.label || ''),
        weight: typeof f.weight === 'number' ? f.weight : 0,
        hints: Array.isArray(f.hints) ? f.hints.map(String) : [],
      })),
    };
  }
  return QUALIFICATION_PRESETS.bant;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function QualificationSchemaEditor({ value, onChange }: Props) {
  const schema = useMemo(() => normalize(value), [value]);
  const totalWeight = schema.fields.reduce((sum, f) => sum + (f.weight || 0), 0);
  const weightOk = totalWeight === 100;

  const updateField = (idx: number, patch: Partial<QualificationField>) => {
    const next = { ...schema, fields: schema.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)) };
    onChange(next);
  };

  const removeField = (idx: number) => {
    onChange({ ...schema, fields: schema.fields.filter((_, i) => i !== idx) });
  };

  const addField = () => {
    onChange({
      ...schema,
      fields: [...schema.fields, { key: `campo_${schema.fields.length + 1}`, label: 'Novo campo', weight: 0, hints: [] }],
    });
  };

  const applyPreset = (presetKey: string) => {
    const preset = QUALIFICATION_PRESETS[presetKey];
    if (preset) onChange({ name: preset.name, fields: preset.fields.map((f) => ({ ...f, hints: [...(f.hints || [])] })) });
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm">Método de qualificação</CardTitle>
        <CardDescription className="text-xs">
          A IA preencherá esses campos com a fala real do cliente quando usar a tool <code>qualify_lead</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Modelos prontos:</span>
          <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('bant')}>BANT</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('gpct')}>GPCT</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => applyPreset('bmc')}>Método BMC</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>Resetar (BANT)</Button>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Nome do método</Label>
          <Input
            value={schema.name}
            onChange={(e) => onChange({ ...schema, name: e.target.value })}
            placeholder="Ex: Método BMC"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Campos</Label>
            <span className={`text-xs ${weightOk ? 'text-emerald-600' : 'text-amber-600'}`}>
              Soma dos pesos: {totalWeight}/100
            </span>
          </div>
          {schema.fields.map((field, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-start p-2 rounded-md bg-muted/40">
              <div className="col-span-5">
                <Label className="text-[10px] text-muted-foreground">Rótulo</Label>
                <Input
                  value={field.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    updateField(idx, { label, key: field.key || slugify(label) });
                  }}
                  placeholder="Ex: Base da Obra"
                />
              </div>
              <div className="col-span-3">
                <Label className="text-[10px] text-muted-foreground">Chave</Label>
                <Input
                  value={field.key}
                  onChange={(e) => updateField(idx, { key: slugify(e.target.value) })}
                  placeholder="base_obra"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] text-muted-foreground">Peso</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={field.weight}
                  onChange={(e) => updateField(idx, { weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                />
              </div>
              <div className="col-span-2 flex justify-end pt-5">
                <Button type="button" size="icon" variant="ghost" onClick={() => removeField(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="col-span-12">
                <Label className="text-[10px] text-muted-foreground">Pistas (separadas por vírgula)</Label>
                <Input
                  value={(field.hints || []).join(', ')}
                  onChange={(e) =>
                    updateField(idx, {
                      hints: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="construção nova, reforma, ampliação"
                />
              </div>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={addField}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar campo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
