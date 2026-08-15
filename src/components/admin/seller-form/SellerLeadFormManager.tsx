import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, RotateCcw, Save, Smartphone, GripVertical, Loader2 } from 'lucide-react';
import {
  useSellerLeadFormConfig,
  useSaveSellerLeadFormConfig,
  DEFAULT_SELLER_FIELDS,
  SellerFormField,
  SellerFieldType,
  mergeWithDefaults,
} from '@/hooks/useSellerLeadFormConfig';
import { SellerCreateLeadDialog } from '@/components/mobile/SellerCreateLeadDialog';

const EXTRA_TYPE_LABELS: Record<string, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  number: 'Número',
  date: 'Data',
  select: 'Seleção',
};

export function SellerLeadFormManager() {
  const { data: stored, isLoading } = useSellerLeadFormConfig();
  const save = useSaveSellerLeadFormConfig();
  const [fields, setFields] = useState<SellerFormField[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rawOptions, setRawOptions] = useState<Record<string, string>>({});

  const optionsToRaw = (opts?: { value: string; label: string }[]) =>
    (opts || []).map((o) => (o.label === o.value ? o.value : `${o.value}|${o.label}`)).join('\n');

  const rawToOptions = (raw: string) =>
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [value, label] = line.split('|').map((s) => s.trim());
        return { value, label: label || value };
      });

  useEffect(() => {
    if (stored) setFields(stored);
  }, [stored]);

  const update = (idx: number, patch: Partial<SellerFormField>) => {
    setFields((p) => p.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const removeExtra = (idx: number) => setFields((p) => p.filter((_, i) => i !== idx));

  const addExtra = () => {
    const key = `custom_${Date.now()}`;
    setFields((p) => [
      ...p,
      {
        key,
        label: 'Novo campo',
        type: 'text',
        enabled: true,
        required: false,
        placeholder: '',
        builtin: false,
      },
    ]);
  };

  const restore = () => setFields(mergeWithDefaults(null));

  const handleSave = () => {
    // flush any pending raw textarea edits into options before saving
    const flushed = fields.map((f) => {
      if (f.type !== 'select') return f;
      const raw = rawOptions[f.key];
      return raw === undefined ? f : { ...f, options: rawToOptions(raw) };
    });
    setFields(flushed);
    save.mutate(flushed);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-primary" />
            Form Vendedores
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Configure quais campos aparecem para o vendedor quando ele toca em
            <Badge variant="outline" className="mx-1">Cadastrar cliente</Badge>
            no app mobile. O lead criado vai direto para a Minha Carteira de quem cadastrou.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            Pré-visualizar
          </Button>
          <Button variant="outline" size="sm" onClick={restore}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar padrão
          </Button>
          <Button size="sm" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos padrão</CardTitle>
          <CardDescription>Ative, desative, renomeie ou marque como obrigatório.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.filter((f) => f.builtin).map((f) => {
            const idx = fields.findIndex((x) => x.key === f.key);
            return (
              <div key={f.key} className="grid grid-cols-12 gap-3 items-center border rounded-md p-3">
                <div className="col-span-12 sm:col-span-4">
                  <Label className="text-xs text-muted-foreground">{f.key}</Label>
                  <Input
                    value={f.label}
                    onChange={(e) => update(idx, { label: e.target.value })}
                    disabled={!f.enabled}
                  />
                </div>
                <div className="col-span-12 sm:col-span-4">
                  <Label className="text-xs text-muted-foreground">Placeholder</Label>
                  <Input
                    value={f.placeholder || ''}
                    onChange={(e) => update(idx, { placeholder: e.target.value })}
                    disabled={!f.enabled || ['temperature', 'origin_select', 'channel_select'].includes(f.type)}
                  />
                </div>
                <div className="col-span-6 sm:col-span-2 flex items-center gap-2">
                  <Switch
                    checked={f.enabled}
                    onCheckedChange={(v) => update(idx, { enabled: v })}
                    disabled={f.key === 'name'}
                  />
                  <span className="text-sm">Ativo</span>
                </div>
                <div className="col-span-6 sm:col-span-2 flex items-center gap-2">
                  <Switch
                    checked={f.required}
                    onCheckedChange={(v) => update(idx, { required: v })}
                    disabled={!f.enabled || f.key === 'name'}
                  />
                  <span className="text-sm">Obrigatório</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">Campos personalizados</CardTitle>
            <CardDescription>Adicione campos extras específicos da sua operação.</CardDescription>
          </div>
          <Button size="sm" onClick={addExtra}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar campo
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.filter((f) => !f.builtin).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum campo personalizado ainda.
            </p>
          )}
          {fields.filter((f) => !f.builtin).map((f) => {
            const idx = fields.findIndex((x) => x.key === f.key);
            return (
              <div key={f.key} className="grid grid-cols-12 gap-3 items-start border rounded-md p-3">
                <GripVertical className="h-4 w-4 text-muted-foreground col-span-1 mt-3 hidden sm:block" />
                <div className="col-span-12 sm:col-span-3">
                  <Label className="text-xs text-muted-foreground">Rótulo</Label>
                  <Input value={f.label} onChange={(e) => update(idx, { label: e.target.value })} />
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={f.type} onValueChange={(v) => update(idx, { type: v as SellerFieldType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXTRA_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-12 sm:col-span-3">
                  <Label className="text-xs text-muted-foreground">Placeholder</Label>
                  <Input value={f.placeholder || ''} onChange={(e) => update(idx, { placeholder: e.target.value })} />
                </div>
                <div className="col-span-4 sm:col-span-1 flex items-center gap-1 mt-5">
                  <Switch checked={f.required} onCheckedChange={(v) => update(idx, { required: v })} />
                  <span className="text-xs">Obrig.</span>
                </div>
                <div className="col-span-12 sm:col-span-2 flex justify-end mt-5">
                  <Button variant="ghost" size="icon" onClick={() => removeExtra(idx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {f.type === 'select' && (
                  <div className="col-span-12 pl-0 sm:pl-7">
                    <Label className="text-xs text-muted-foreground">
                      Opções (uma por linha — formato "valor|rótulo" ou só "valor")
                    </Label>
                    <textarea
                      className="w-full mt-1 border rounded-md p-2 text-sm bg-background font-mono"
                      rows={4}
                      placeholder={'quente|Lead quente\nmorno|Lead morno\nfrio'}
                      value={rawOptions[f.key] ?? optionsToRaw(f.options)}
                      onChange={(e) => setRawOptions((p) => ({ ...p, [f.key]: e.target.value }))}
                      onBlur={() => {
                        const raw = rawOptions[f.key];
                        if (raw === undefined) return;
                        update(idx, { options: rawToOptions(raw) });
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <SellerCreateLeadDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onSubmit={() => setPreviewOpen(false)}
      />
    </div>
  );
}
