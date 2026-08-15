import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type SellerFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'temperature'
  | 'origin_select'
  | 'channel_select'
  | 'number'
  | 'date'
  | 'select';

export interface SellerFormField {
  key: string;
  label: string;
  type: SellerFieldType;
  enabled: boolean;
  required: boolean;
  placeholder?: string;
  /** present for type='select' (and other custom enumerable types if added) */
  options?: { label: string; value: string }[];
  /** true for the 9 default fields that map 1:1 to leads.* columns; false for custom extras saved in metadata */
  builtin: boolean;
}

export const DEFAULT_SELLER_FIELDS: SellerFormField[] = [
  { key: 'name', label: 'Nome', type: 'text', enabled: true, required: true, placeholder: 'Nome do lead', builtin: true },
  { key: 'temperature', label: 'Temperatura', type: 'temperature', enabled: true, required: false, builtin: true },
  { key: 'email', label: 'Email', type: 'email', enabled: true, required: false, placeholder: 'email@exemplo.com', builtin: true },
  { key: 'phone', label: 'Telefone', type: 'phone', enabled: true, required: false, placeholder: '(11) 99999-9999', builtin: true },
  { key: 'company', label: 'Empresa', type: 'text', enabled: true, required: false, placeholder: 'Nome da empresa', builtin: true },
  { key: 'position', label: 'Cargo', type: 'text', enabled: true, required: false, placeholder: 'Cargo/Função', builtin: true },
  { key: 'lead_origin', label: 'Origem', type: 'origin_select', enabled: true, required: false, builtin: true },
  { key: 'lead_channel', label: 'Canal', type: 'channel_select', enabled: true, required: false, builtin: true },
  { key: 'notes', label: 'Observações', type: 'textarea', enabled: true, required: false, placeholder: 'Notas iniciais sobre o lead...', builtin: true },
];

/** Merge stored fields onto the canonical defaults so missing builtins are always present. */
export function mergeWithDefaults(stored: SellerFormField[] | null | undefined): SellerFormField[] {
  const list = Array.isArray(stored) ? stored : [];
  const byKey = new Map(list.map((f) => [f.key, f]));
  const merged: SellerFormField[] = DEFAULT_SELLER_FIELDS.map((d) => {
    const s = byKey.get(d.key);
    if (!s) return d;
    return { ...d, label: s.label ?? d.label, enabled: s.enabled ?? d.enabled, required: s.required ?? d.required, placeholder: s.placeholder ?? d.placeholder };
  });
  // append extras (non-builtin) preserving order
  for (const f of list) {
    if (!DEFAULT_SELLER_FIELDS.find((d) => d.key === f.key)) {
      merged.push({ ...f, builtin: false });
    }
  }
  return merged;
}

export function useSellerLeadFormConfig() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery<SellerFormField[]>({
    queryKey: ['seller-lead-form-config', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seller_lead_form_config' as any)
        .select('fields')
        .eq('organization_id', orgId!)
        .maybeSingle();
      if (error) {
        console.error('[useSellerLeadFormConfig]', error);
        return DEFAULT_SELLER_FIELDS;
      }
      return mergeWithDefaults((data as any)?.fields);
    },
    staleTime: 60_000,
  });
}

export function useSaveSellerLeadFormConfig() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (fields: SellerFormField[]) => {
      const orgId = profile?.organization_id;
      if (!orgId) throw new Error('Sem organização');
      const { error } = await supabase
        .from('seller_lead_form_config' as any)
        .upsert(
          { organization_id: orgId, fields: fields as any },
          { onConflict: 'organization_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Formulário do vendedor salvo');
      qc.invalidateQueries({ queryKey: ['seller-lead-form-config'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });
}
