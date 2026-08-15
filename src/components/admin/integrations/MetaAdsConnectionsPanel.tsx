import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Megaphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MetaOAuthConnectButton } from './MetaOAuthConnectButton';

export function MetaAdsConnectionsPanel() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const query = useQuery({
    queryKey: ['meta-ads-connections', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('org_marketing_credentials')
        .select('id,ad_account_id,business_id,account_name,is_active,last_sync_at,last_sync_status,last_sync_error')
        .eq('organization_id', orgId!).eq('provider', 'meta').order('account_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const openAccount = (credentialId: string) => {
    if (orgId) window.localStorage.setItem(`marketing.selectedCredential.${orgId}`, credentialId);
    navigate('/admin?tab=marketing-meta&view=campaigns');
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-blue-600" /> Meta Ads
          </h4>
          <p className="text-xs text-muted-foreground">Contas disponíveis para campanhas, sincronização e análises.</p>
        </div>
        {orgId && (
          <MetaOAuthConnectButton
            organizationId={orgId}
            purpose="ads"
            label="Adicionar conta"
            className="gap-1.5"
            onConnected={(credentialId) => {
              void query.refetch();
              if (credentialId) openAccount(credentialId);
            }}
          />
        )}
      </div>

      {query.isLoading && <p className="text-sm text-muted-foreground">Carregando contas Meta Ads…</p>}
      {!query.isLoading && (query.data ?? []).length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-5 text-center">
            <p className="text-sm font-medium">Nenhuma conta de anúncios conectada</p>
            <p className="text-xs text-muted-foreground mt-1">Adicione uma conta para criar e administrar campanhas pelo Vendus.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {(query.data ?? []).map((item: any) => (
          <Card key={item.id}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                <Megaphone className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{item.account_name || 'Conta Meta Ads'}</p>
                  <Badge variant={item.is_active ? 'secondary' : 'outline'}>
                    {item.is_active ? 'Conectada' : 'Desconectada'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {item.ad_account_id?.replace(/^act_/, '')}
                  {item.last_sync_status === 'ok' ? ' · Sincronizada' : ''}
                </p>
                {item.last_sync_error && <p className="text-xs text-destructive truncate mt-1">{item.last_sync_error}</p>}
              </div>
              {item.is_active && (
                <Button variant="outline" size="sm" onClick={() => openAccount(item.id)}>
                  Usar
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
