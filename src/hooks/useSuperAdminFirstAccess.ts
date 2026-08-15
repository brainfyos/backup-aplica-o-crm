import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const DEFAULT_EMAILS = ['superadmin@vendus.com.br', 'admin@vendus.com.br'];

/**
 * Detecta se o super admin atual está usando credenciais padrão de instalação
 * (email padrão OU senha ainda não trocada). Usado para forçar o modal de
 * primeiro acesso após o seed inicial em um remix.
 */
export function useSuperAdminFirstAccess() {
  const { user, isSuperAdmin } = useAuth();

  const query = useQuery({
    queryKey: ['platform-settings', 'first-access'],
    enabled: !!user?.id && isSuperAdmin(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('default_password_changed, remix_setup_completed')
        .maybeSingle();
      if (error) throw error;
      return {
        settings: data as { default_password_changed?: boolean; remix_setup_completed?: boolean } | null,
      };
    },
  });

  const usingDefaultEmail = !!user?.email && DEFAULT_EMAILS.includes(user.email.toLowerCase());
  const settings = query.data?.settings ?? null;
  // Se a query terminou e não há registro em platform_settings, força o wizard
  // (cenário de remix novo onde a tabela ainda está vazia).
  const noSettingsRow = !query.isLoading && !query.isError && settings == null;
  const passwordNotChanged =
    noSettingsRow || settings?.default_password_changed === false;
  const setupNotCompleted =
    noSettingsRow || settings?.remix_setup_completed === false;

  // Wizard teleguiado removido do primeiro acesso: vários passos dependem de
  // configurações fora do painel (Lovable Cloud, VPS Evolution). A orientação
  // agora é feita pelas aulas + checklist não bloqueante do dashboard.
  const shouldForceSetup = false;

  return {
    shouldForceSetup,
    usingDefaultEmail,
    passwordNotChanged,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
