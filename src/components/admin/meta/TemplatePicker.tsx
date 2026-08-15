import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export interface VariableMapping {
  [num: string]: { source: string; hint?: string; static_value?: string };
}

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

export function TemplatePicker({
  organizationId,
  connectionIds,
  value,
  onChange,
  required,
  label = 'Template HSM (abertura de conversa)',
  helperText = 'Templates aprovados pela Meta. Use quando o lead estiver fora da janela de 24h.',
}: {
  organizationId: string | null;
  connectionIds?: string[];           // restringe a essas conexões (opcional)
  value: { template_id: string | null; variable_mapping: VariableMapping };
  onChange: (v: { template_id: string | null; variable_mapping: VariableMapping }) => void;
  required?: boolean;
  label?: string;
  helperText?: string;
}) {
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    (async () => {
      let q = (supabase as any).from('whatsapp_meta_templates')
        .select('id, name, language, status, connection_id, components')
        .eq('organization_id', organizationId)
        .eq('status', 'APPROVED')
        .order('name');
      const { data } = await q;
      let rows = (data ?? []) as MetaTemplate[];
      if (connectionIds && connectionIds.length) {
        rows = rows.filter((t) => connectionIds.includes(t.connection_id));
      }
      setTemplates(rows);
      setLoading(false);
    })();
  }, [organizationId, JSON.stringify(connectionIds)]);

  const selected = useMemo(() => templates.find((t) => t.id === value.template_id) || null, [templates, value.template_id]);
  const vars = useMemo(() => (selected ? detectVars(selected.components) : []), [selected]);

  // Garante mapping default = ai_fill
  useEffect(() => {
    if (!selected) return;
    const m = { ...(value.variable_mapping || {}) };
    let changed = false;
    for (const n of vars) {
      if (!m[String(n)]) { m[String(n)] = { source: 'ai_fill' }; changed = true; }
    }
    if (changed) onChange({ ...value, variable_mapping: m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const updateMap = (num: number, patch: Partial<VariableMapping[string]>) => {
    onChange({
      ...value,
      variable_mapping: {
        ...(value.variable_mapping || {}),
        [String(num)]: { ...(value.variable_mapping?.[String(num)] ?? { source: 'ai_fill' }), ...patch },
      },
    });
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}{required ? ' *' : ''}</Label>
      <Select
        value={value.template_id ?? '__none'}
        onValueChange={(v) => onChange({ template_id: v === '__none' ? null : v, variable_mapping: {} })}
      >
        <SelectTrigger><SelectValue placeholder={loading ? 'Carregando…' : 'Selecione um template aprovado'} /></SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value="__none">Nenhum (envio livre)</SelectItem>}
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name} <span className="text-xs text-muted-foreground">({t.language})</span>
            </SelectItem>
          ))}
          {!templates.length && !loading && (
            <SelectItem value="__empty" disabled>Nenhum template APPROVED — crie em Conexões → API Oficial → Templates</SelectItem>
          )}
        </SelectContent>
      </Select>
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}

      {selected && (
        <div className="space-y-2 mt-2 p-3 border rounded-md bg-muted/30">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{selected.status}</Badge>
            <Badge variant="outline" className="text-[10px]">{selected.language}</Badge>
            <span className="text-xs text-muted-foreground">{vars.length} variáve{vars.length === 1 ? 'l' : 'is'}</span>
          </div>
          <div className="text-xs whitespace-pre-wrap text-foreground/80">
            {selected.components.find((c: any) => c.type === 'BODY')?.text ?? '—'}
          </div>

          {vars.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t">
              {vars.map((n) => {
                const m = value.variable_mapping?.[String(n)] ?? { source: 'ai_fill' };
                return (
                  <div key={n} className="grid grid-cols-12 gap-2 items-center">
                    <Badge className="col-span-1 justify-center text-[10px]">{`{{${n}}}`}</Badge>
                    <Select value={m.source} onValueChange={(v) => updateMap(n, { source: v, static_value: '' })}>
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
                        onChange={(e) => updateMap(n, { static_value: e.target.value.slice(0, 60) })}
                      />
                    )}
                    {m.source === 'ai_fill' && (
                      <Input
                        className="col-span-6 h-8 text-xs"
                        placeholder="Dica para a IA (ex: nome do evento)"
                        value={m.hint ?? ''}
                        onChange={(e) => updateMap(n, { hint: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
