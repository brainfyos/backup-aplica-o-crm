import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';

interface CadencePickerProps {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
}

/** Reusable selector listing active cadences of the current organization. */
export function CadencePicker({ value, onChange, placeholder = 'Selecionar cadência...' }: CadencePickerProps) {
  const { user } = useAuth();
  const [list, setList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase.from('profiles').select('organization_id').eq('id', user.id).maybeSingle();
      const orgId = (prof as any)?.organization_id;
      if (!orgId) return;
      const { data } = await supabase
        .from('cadences' as any)
        .select('id, name, status')
        .eq('organization_id', orgId)
        .in('status', ['active', 'draft'])
        .order('name');
      setList(((data as any[]) ?? []).map((c) => ({ id: c.id, name: `${c.name}${c.status === 'draft' ? ' (rascunho)' : ''}` })));
    })();
  }, [user]);

  return (
    <Select value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Nenhuma — não inscrever</SelectItem>
        {list.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
