import { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, User } from 'lucide-react';
import { LEAD_ORIGINS, LEAD_CHANNELS } from '@/hooks/useLeadTracking';
import { useSellerLeadFormConfig, DEFAULT_SELLER_FIELDS, SellerFormField } from '@/hooks/useSellerLeadFormConfig';

export interface SellerLeadSubmitData {
  // builtin
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  position?: string;
  temperature: 'hot' | 'warm' | 'cold';
  lead_origin?: string;
  lead_channel?: string;
  notes?: string;
  // extras saved to leads.metadata.custom_fields
  custom_fields: Record<string, unknown>;
  // labels of extras saved to leads.metadata.custom_field_labels
  custom_field_labels: Record<string, string>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: SellerLeadSubmitData) => void | Promise<void>;
  isLoading?: boolean;
}

export function SellerCreateLeadDialog({ open, onOpenChange, onSubmit, isLoading }: Props) {
  const { data: configFields } = useSellerLeadFormConfig();
  const fields = useMemo(() => (configFields || DEFAULT_SELLER_FIELDS).filter((f) => f.enabled), [configFields]);

  const [values, setValues] = useState<Record<string, any>>({ temperature: 'warm' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setValues({ temperature: 'warm' });
      setErrors({});
    }
  }, [open]);

  const setVal = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key];
      const empty = v === undefined || v === null || v === '';
      if (f.required && empty) errs[f.key] = 'Obrigatório';
      if (!empty && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) errs[f.key] = 'Email inválido';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const custom_fields: Record<string, unknown> = {};
    const custom_field_labels: Record<string, string> = {};
    const builtinKeys = new Set(DEFAULT_SELLER_FIELDS.map((f) => f.key));
    for (const f of fields) {
      if (!builtinKeys.has(f.key)) {
        const v = values[f.key];
        if (v !== undefined && v !== '' && v !== null) {
          custom_fields[f.key] = v;
          custom_field_labels[f.key] = f.label;
        }
      }
    }
    onSubmit({
      name: String(values.name ?? '').trim(),
      email: values.email || undefined,
      phone: values.phone || undefined,
      company: values.company || undefined,
      position: values.position || undefined,
      temperature: (values.temperature as any) || 'warm',
      lead_origin: values.lead_origin || undefined,
      lead_channel: values.lead_channel || undefined,
      notes: values.notes || undefined,
      custom_fields,
      custom_field_labels,
    });
  };

  const renderField = (f: SellerFormField) => {
    const v = values[f.key] ?? '';
    const err = errors[f.key];
    const common = (
      <Label className="text-sm font-medium">
        {f.label}
        {f.required && <span className="text-destructive ml-1">*</span>}
      </Label>
    );
    let control: React.ReactNode = null;
    switch (f.type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
      case 'date':
        control = (
          <Input
            type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
            placeholder={f.placeholder}
            value={v}
            onChange={(e) => setVal(f.key, e.target.value)}
          />
        );
        break;
      case 'textarea':
        control = (
          <Textarea
            placeholder={f.placeholder}
            rows={3}
            value={v}
            onChange={(e) => setVal(f.key, e.target.value)}
          />
        );
        break;
      case 'temperature':
        control = (
          <Select value={v || 'warm'} onValueChange={(x) => setVal(f.key, x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hot">🔥 Quente</SelectItem>
              <SelectItem value="warm">🌡️ Morno</SelectItem>
              <SelectItem value="cold">❄️ Frio</SelectItem>
            </SelectContent>
          </Select>
        );
        break;
      case 'origin_select':
        control = (
          <Select value={v || ''} onValueChange={(x) => setVal(f.key, x)}>
            <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
            <SelectContent>
              {LEAD_ORIGINS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
        break;
      case 'channel_select':
        control = (
          <Select value={v || ''} onValueChange={(x) => setVal(f.key, x)}>
            <SelectTrigger><SelectValue placeholder="Selecione o canal" /></SelectTrigger>
            <SelectContent>
              {LEAD_CHANNELS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
        break;
      case 'select':
        control = (
          <Select value={v || ''} onValueChange={(x) => setVal(f.key, x)}>
            <SelectTrigger><SelectValue placeholder={f.placeholder || 'Selecione'} /></SelectTrigger>
            <SelectContent>
              {(f.options || []).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
        break;
    }
    return (
      <div key={f.key} className="space-y-1.5">
        {common}
        {control}
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Novo Lead
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(renderField)}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Lead
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
