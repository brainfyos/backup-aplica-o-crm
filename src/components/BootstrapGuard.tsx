import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Verifica uma única vez se a plataforma já tem um Super Admin.
 * - Se NÃO tem: força navegação para /setup.
 * - Se TEM e usuário está em /setup: redireciona para /login.
 *
 * Rotas públicas que não devem disparar setup (formulários, agendamento etc.)
 * ficam de fora do redirecionamento.
 */
const PUBLIC_PREFIXES = [
  '/setup',
  '/f/',
  '/c/',
  '/q/',
  '/agendar',
  '/confirmar',
  '/reagendar',
  '/vendas',
  '/unsubscribe',
  '/docs',
  '/install',
];

export function BootstrapGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    const path = location.pathname;
    const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p));

    // Cache persistente: evita uma chamada de rede no boot de cada aba/navegação.
    const cached = localStorage.getItem('vendus:hasSuperAdmin') || sessionStorage.getItem('vendus:hasSuperAdmin');
    if (cached === 'true') {
      if (path.startsWith('/setup')) navigate('/login', { replace: true });
      setChecked(true);
      return;
    }
    // Em rotas públicas não há nada a decidir — não gasta requisição no boot.
    if (isPublic && !path.startsWith('/setup')) {
      setChecked(true);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('super-admin-status');
        if (!mounted) return;
        if (error) return;
        const hasSuperAdmin = !!data?.hasSuperAdmin;
        if (hasSuperAdmin) localStorage.setItem('vendus:hasSuperAdmin', 'true');
        if (!hasSuperAdmin && !path.startsWith('/setup')) {
          if (!isPublic) navigate('/setup', { replace: true });
        } else if (hasSuperAdmin && path.startsWith('/setup')) {
          navigate('/login', { replace: true });
        }
      } catch {
        // silencioso
      } finally {
        if (mounted) setChecked(true);
      }
    })();
    return () => {
      mounted = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return null;
}
