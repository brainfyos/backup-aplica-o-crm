import { useState } from 'react';
import { useCustomFields, type CustomField } from '@/hooks/useCustomFields';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface Props {
  fieldKey: string;
  valueSource: 'option_label' | 'option_value' | 'static';
  staticValue?: string;
  onChange: (patch: {
    field_key?: string;
    value_source?: 'option_label' | 'option_value' | 'static';
    static_value?: string;
  }) => void;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  number: 'Número',
  select: 'Seleção',
  boolean: 'Sim/Não',
  date: 'Data',
};

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export function CustomFieldPicker({ fieldKey, valueSource, staticValue, onChange }: Props) {
  const { fields } = useCustomFields();
  const [createOpen, setCreateOpen] = useState(false);

  const current = fields.find((f) => f.field_key === fieldKey);

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Campo personalizado
        </Label>
        <div className="flex gap-1.5 mt-1">
          <Select
            value={fieldKey || ''}
            onValueChange={(v) => {
              if (v === '__create__') {
                setCreateOpen(true);
                return;
              }
              onChange({ field_key: v });
            }}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Escolha o campo…" />
            </SelectTrigger>
            <SelectContent>
              {fields.length === 0 && (
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                  Nenhum campo criado ainda.
                </div>
              )}
              {fields.map((f) => (
                <SelectItem key={f.id} value={f.field_key} className="text-xs">
                  {f.name}{' '}
                  <span className="text-muted-foreground">
                    · {FIELD_TYPE_LABELS[f.field_type] || f.field_type}
                  </span>
                </SelectItem>
              ))}
              <div className="border-t my-1" />
              <SelectItem value="__create__" className="text-xs text-primary">
                + Criar novo campo
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {current && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Chave: <span className="font-mono">{current.field_key}</span>
          </p>
        )}
      </div>

      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Valor a salvar
        </Label>
        <Select
          value={valueSource}
          onValueChange={(v) =>
            onChange({ value_source: v as 'option_label' | 'option_value' | 'static' })
          }
        >
          <SelectTrigger className="h-8 text-xs mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option_label" className="text-xs">
              Rótulo da opção escolhida
            </SelectItem>
            <SelectItem value="option_value" className="text-xs">
              Valor técnico da opção
            </SelectItem>
            <SelectItem value="static" className="text-xs">
              Valor fixo
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {valueSource === 'static' && (
        <Input
          value={staticValue || ''}
          placeholder="Valor a gravar no campo"
          onChange={(e) => onChange({ static_value: e.target.value })}
          className="h-8 text-xs"
        />
      )}

      {!fieldKey && (
        <Badge variant="outline" className="text-[10px]">
          Selecione ou crie um campo
        </Badge>
      )}

      <CreateFieldDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(f) => onChange({ field_key: f.field_key })}
      />
    </div>
  );
}

function CreateFieldDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (f: CustomField) => void;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'number' | 'select' | 'boolean' | 'date'>('text');
  const [optionInput, setOptionInput] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName('');
    setType('text');
    setOptions([]);
    setOptionInput('');
  };

  const addOption = () => {
    if (!optionInput.trim()) return;
    setOptions((prev) => [...prev, optionInput.trim()]);
    setOptionInput('');
  };

  const save = async () => {
    if (!name.trim() || !profile?.organization_id) return;
    setSaving(true);
    try {
      const field_key = slugify(name);
      const { data, error } = await supabase
        .from('custom_fields')
        .insert({
          organization_id: profile.organization_id,
          name: name.trim(),
          field_key,
          field_type: type,
          options: type === 'select' ? options : [],
        } as any)
        .select('*')
        .single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo criado');
      onCreated(data as unknown as CustomField);
      reset();
      onOpenChange(false);
    } catch (err: any) {
      if (String(err?.message || '').includes('duplicate')) {
        toast.error('Já existe um campo com essa chave');
      } else {
        toast.error('Erro ao criar campo');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo campo personalizado</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome</Label>
            <Input
              placeholder="Ex: Faturamento médio"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {name && (
              <p className="text-[10px] text-muted-foreground">
                Chave: <span className="font-mono">{slugify(name)}</span>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="number">Número</SelectItem>
                <SelectItem value="select">Seleção</SelectItem>
                <SelectItem value="boolean">Sim/Não</SelectItem>
                <SelectItem value="date">Data</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'select' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Opções</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar opção…"
                  value={optionInput}
                  onChange={(e) => setOptionInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                />
                <Button type="button" variant="outline" onClick={addOption}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {options.map((o, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {o}
                    <button
                      onClick={() => setOptions((p) => p.filter((_, idx) => idx !== i))}
                      className="ml-1 hover:text-destructive"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!name.trim() || saving}>
            {saving ? 'Criando…' : 'Criar campo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
