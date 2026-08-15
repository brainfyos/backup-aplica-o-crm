import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OrgSuspendedGate } from '@/components/billing/OrgSuspendedGate';
import { useOrganizationStatus } from '@/hooks/useOrganizationStatus';


interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'manager' | 'seller';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, roles, isLoading, profile, isAdmin, isManager, isSuperAdmin } = useAuth();
  const { isSuspended, loaded: statusLoaded } = useOrganizationStatus();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setStuck(true), 6000);
    return () => clearTimeout(t);
  }, [isLoading]);

  const showLoader =
    isLoading ||
    (!!user && !!profile?.organization_id && !isSuperAdmin() && !statusLoaded);

  if (showLoader) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {stuck ? 'Demorando mais que o esperado…' : 'Entrando…'}
        </p>
        {stuck && (
          <button
            onClick={() => window.location.reload()}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (!user) {
    const currentPath = window.location.pathname + window.location.search;
    const next = currentPath && currentPath !== '/login' ? `?next=${encodeURIComponent(currentPath)}` : '';
    return <Navigate to={`/login${next}`} replace />;
  }

  // Força troca de senha no primeiro acesso (senha provisória)
  const mustChange = (profile as any)?.must_change_password === true;
  if (mustChange && window.location.pathname !== '/trocar-senha') {
    const back = window.location.pathname + window.location.search;
    return <Navigate to={`/trocar-senha?next=${encodeURIComponent(back)}`} replace />;
  }

  if (requiredRole) {
    const hasRole = requiredRole === 'admin'
      ? isAdmin()
      : requiredRole === 'manager'
        ? isManager()
        : roles.includes(requiredRole);

    if (!hasRole) {
      return <Navigate to="/" replace />;
    }
  }

  // Empresa suspensa: bloqueia o app inteiro. Para admin, libera apenas
  // /admin?tab=plan para regularizar; demais rotas/abas são redirecionadas.
  if (isSuspended && !isSuperAdmin()) {
    const params = new URLSearchParams(window.location.search);
    const isAdminRoute = window.location.pathname.startsWith('/admin');
    const onPlanRoute = isAdminRoute && params.get('tab') === 'plan';
    if (isAdminRoute && !onPlanRoute) {
      return <Navigate to="/admin?tab=plan" replace />;
    }
    if (!isAdminRoute) {
      return <OrgSuspendedGate />;
    }
  }

  return <>{children}</>;
}

