import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Returns distinct values for a given custom field key
 * (stored in leads.metadata->custom_fields->{fieldKey})
 * scoped to the current organization.
 */
export function useCustomFieldValues(fieldKey: string | null) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['custom-field-values', orgId, fieldKey],
    queryFn: async () => {
      if (!orgId || !fieldKey) return [] as string[];
      const { data, error } = await supabase
        .from('leads')
        .select('metadata')
        .eq('organization_id', orgId)
        .not(`metadata->custom_fields->>${fieldKey}`, 'is', null)
        .limit(500);
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((row: any) => {
        const v = row?.metadata?.custom_fields?.[fieldKey];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          set.add(String(v));
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    },
    enabled: !!orgId && !!fieldKey,
    staleTime: 60_000,
  });
}
