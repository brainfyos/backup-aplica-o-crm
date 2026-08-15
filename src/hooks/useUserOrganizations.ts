import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UserOrganization {
  organization_id: string;
  name: string;
  logo_url: string | null;
  role: string;
  is_default: boolean;
  is_active: boolean;
}

export function useUserOrganizations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-organizations', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<UserOrganization[]> => {
      const { data, error } = await supabase.rpc('list_my_organizations');
      if (error) throw error;
      return (data ?? []) as UserOrganization[];
    },
    staleTime: 60_000,
  });
}

export function useSwitchOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (organization_id: string) => {
      const { data, error } = await supabase.rpc('switch_active_organization', {
        target_org_id: organization_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      try {
        await supabase.auth.refreshSession();
      } catch {}
      qc.clear();
      // Reload completo para a home — evita vazamento de cache/realtime entre orgs
      window.location.assign('/');
    },
  });
}
