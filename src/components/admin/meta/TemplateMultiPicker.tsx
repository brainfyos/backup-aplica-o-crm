import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Shuffle } from 'lucide-react';
import type { VariableMapping } from './TemplatePicker';

export interface TemplateVariant {
  template_id: string;
  variable_mapping: VariableMapping;
}

export type TemplateRotation = 'random' | 'round_robin';

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  connection_id: string;
  components: any[];
}

function detectVars(comps: any[] = []): number[] {
  const text = (comps.find((c) => c.type === 'BODY')?.text ?? '') + ' ' + (comps.find((c) => c.type === 'HEADER')?.text ?? '');
  const set = new Set<number>();
  const re = /\{\{(\d+)\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) set.add(parseInt(m[1], 10));
  return Array.from(set).sort((a, b) => a - b);
}

const SOURCE_OPTIONS = [
  { value: 'ai_fill', label: '🤖 Preencher com IA (recomendado)' },
  { value: 'lead.name', label: 'Nome do lead' },
  { value: 'lead.email', label: 'Email do lead' },
  { value: 'lead.phone', label: 'Telefone do lead' },
  { value: 'static', label: 'Texto fixo…' },
];

export function TemplateMultiPicker({
  organizationId,
  connectionIds,
  value,
  rotation,
  onChange,
  onRotationChange,
  label = 'Templates HSM de reabertura',
  helperText,
}: {
  organizationId: string | null;
  connectionIds?: string[];
  value: TemplateVariant[];
  rotation: TemplateRotation;
  onChange: (v: TemplateVariant[]) => void;
  onRotationChange: (r: TemplateRotation) => void;
  label?: string;
  helperText?: string;
}) {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('whatsapp_meta_templates')
        .select('id, name, language, status, connection_id, components')
        .eq('organization_id', organizationId)
        .eq('status', 'APPROVED')
        .order('name');
      let rows = (data ?? []) as MetaTemplate[];
      if (connectionIds && connectionIds.length) {
        rows = rows.filter((t) => connectionIds.includes(t.connection_id));
      }
      setTemplates(rows);
      setLoading(false);
    })();
  }, [organizationId, JSON.stringify(connectionIds)]);

  const selectedIds = useMemo(() => new Set(value.map((v) => v.template_id)), [value]);

  const toggle = (tpl: MetaTemplate, checked: boolean) => {
    if (checked) {
      const vars = detectVars(tpl.components);
      const mapping: VariableMapping = {};
      vars.forEach((n) => { mapping[String(n)] = { source: 'ai_fill' }; });
      onChange([...value, { template_id: tpl.id, variable_mapping: mapping }]);
    } else {
      onChange(value.filter((v) => v.template_id !== tpl.id));
    }
  };

  const updateMap = (templateId: string, num: number, patch: Partial<VariableMapping[string]>) => {
    onChange(value.map((v) => v.template_id !== templateId ? v : {
      ...v,
      variable_mapping: {
        ...(v.variable_mapping || {}),
        [String(num)]: { ...(v.variable_mapping?.[String(num)] ?? { source: 'ai_fill' }), ...patch },
      },
    }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-sm">{label} *</Label>
        {value.length > 1 && (
          <div className="flex items-center gap-2">
            <Shuffle className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={rotation} onValueChange={(v: any) => onRotationChange(v)}>
              <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Rodízio: Aleatório</SelectItem>
                <SelectItem value="round_robin">Rodízio: Sequencial</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}

      <div className="rounded-md border divide-y">
        {loading && <p className="p-3 text-xs text-muted-foreground">Carregando…</p>}
        {!loading && !templates.length && (
          <p className="p-3 text-xs text-muted-foreground">
            Nenhum template APPROVED — crie em Conexões → API Oficial → Templates
          </p>
        )}
        {templates.map((t) => {
          const checked = selectedIds.has(t.id);
          const variant = value.find((v) => v.template_id === t.id);
          const vars = detectVars(t.components);
          return (
            <div key={t.id} className="p-3 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={checked} onCheckedChange={(c) => toggle(t, !!c)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{t.name}</span>
                    <Badge variant="outline" className="text-[10px]">{t.language}</Badge>
                    {vars.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {vars.length} variáve{vars.length === 1 ? 'l' : 'is'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                    {t.components?.find((c: any) => c.type === 'BODY')?.text ?? '—'}
                  </p>
                </div>
              </label>

              {checked && vars.length > 0 && (
                <div className="space-y-1.5 pl-6">
                  {vars.map((n) => {
                    const m = variant?.variable_mapping?.[String(n)] ?? { source: 'ai_fill' };
                    return (
                      <div key={n} className="grid grid-cols-12 gap-2 items-center">
                        <Badge className="col-span-1 justify-center text-[10px]">{`{{${n}}}`}</Badge>
                        <Select value={m.source} onValueChange={(v) => updateMap(t.id, n, { source: v, static_value: '' })}>
                          <SelectTrigger className="col-span-5 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {m.source === 'static' && (
                          <Input
                            className="col-span-6 h-8 text-xs"
                            placeholder="Texto fixo (máx 60)"
                            value={m.static_value ?? ''}
                            onChange={(e) => updateMap(t.id, n, { static_value: e.target.value.slice(0, 60) })}
                          />
                        )}
                        {m.source === 'ai_fill' && (
                          <Input
                            className="col-span-6 h-8 text-xs"
                            placeholder="Dica para a IA (ex: nome do evento)"
                            value={m.hint ?? ''}
                            onChange={(e) => updateMap(t.id, n, { hint: e.target.value })}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {value.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {value.length} variações marcadas — cada lead recebe uma{rotation === 'random' ? ' sorteada aleatoriamente' : ' em ordem circular'}.
        </p>
      )}
    </div>
  );
}
