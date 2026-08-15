import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useIsSuperAdmin } from '@/hooks/useSuperAdmin';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

interface SuperAdminRouteProps {
  children: React.ReactNode;
}

export function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { user, isLoading: authLoading } = useAuth();
  const { data: isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin();
  const qc = useQueryClient();
  const [promoting, setPromoting] = useState(false);

  // Conta super admins existentes — usado para detectar bootstrap (parceiro recém-clonado)
  const { data: superAdminCount, isLoading: countLoading } = useQuery({
    queryKey: ['super-admin-count'],
    enabled: !!user && !authLoading && !superAdminLoading && !isSuperAdmin,
    queryFn: async () => {
      const { count } = await supabase
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'super_admin' as any);
      return count ?? 0;
    },
  });

  if (authLoading || superAdminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (!isSuperAdmin) {
    // Aguarda contagem para decidir entre "redirecionar" ou "oferecer auto-promoção"
    if (countLoading) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    // Bootstrap: nenhum super admin existe ainda — esta é a primeira pessoa entrando
    // no painel após clonar o projeto. Oferecemos auto-promoção.
    if ((superAdminCount ?? 0) === 0) {
      const promote = async () => {
        setPromoting(true);
        const { data, error } = await supabase.rpc('promote_self_to_super_admin' as any);
        setPromoting(false);
        if (error) {
          toast.error('Erro ao promover', { description: error.message });
          return;
        }
        if ((data as any)?.ok) {
          toast.success('Você é o Super Admin da plataforma!');
          await qc.invalidateQueries({ queryKey: ['is-super-admin'] });
          await qc.invalidateQueries({ queryKey: ['super-admin-count'] });
          window.location.reload();
        } else {
          toast.error('Não foi possível promover', {
            description: (data as any)?.error ?? 'Erro desconhecido',
          });
        }
      };

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 shadow-lg space-y-5 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Configurar plataforma</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Esta plataforma ainda não tem um Super Admin definido. Como você é o primeiro a entrar,
                podemos te promover agora para finalizar a configuração inicial.
              </p>
            </div>
            <Button className="w-full" onClick={promote} disabled={promoting}>
              {promoting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Promover-me a Super Admin
            </Button>
            <p className="text-xs text-muted-foreground">
              Isso só funciona quando ainda não existe nenhum Super Admin na plataforma.
            </p>
          </div>
        </div>
      );
    }

    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
