import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Sparkles, Info } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEvolutionInstances } from '@/hooks/useEvolutionInstances';
import { useMetaWAConnections } from '@/hooks/useMetaWhatsApp';
import { useInstagramConnections } from '@/hooks/useInstagramConnections';
import { useOrganizationEffectivePlan } from '@/hooks/useOrganizationPlan';
import { EvolutionInstancesPanel } from './EvolutionInstancesPanel';
import { MetaWhatsAppConnectionsPanel } from './MetaWhatsAppConnectionsPanel';
import { InstagramConnectionsPanel } from './InstagramConnectionsPanel';
import { NewConnectionDialog, type ConnectionProvider } from './NewConnectionDialog';
import { MetaOAuthConnectButton } from './MetaOAuthConnectButton';
import { MetaAdsConnectionsPanel } from './MetaAdsConnectionsPanel';
import { toast } from 'sonner';


export function UnifiedConnectionsPanel() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: instances } = useEvolutionInstances();
  const { data: metaConns } = useMetaWAConnections();
  const { data: igConns } = useInstagramConnections();
  const { data: effectivePlan } = useOrganizationEffectivePlan(profile?.organization_id);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [openEvolutionCreate, setOpenEvolutionCreate] = useState(false);
  const [openMetaWizard, setOpenMetaWizard] = useState(false);
  const [openIgWizard, setOpenIgWizard] = useState(false);

  const used = (instances?.length ?? 0) + (metaConns?.length ?? 0) + (igConns?.length ?? 0);
  const limit = effectivePlan?.limits?.max_connections ?? 1;
  const limitReached = used >= limit;

  const handleSelect = (provider: ConnectionProvider) => {
    if (limitReached) {
      toast.error(`Limite de ${limit} conexão(ões) atingido. Faça upgrade do plano.`);
      return;
    }
    if (provider === 'evolution') setOpenEvolutionCreate(true);
    else if (provider === 'meta_whatsapp') setOpenMetaWizard(true);
    else if (provider === 'meta_instagram') setOpenIgWizard(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Suas Conexões</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie todos os canais conectados (WhatsApp via QR, WhatsApp Oficial Meta e Instagram).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={limitReached ? 'destructive' : 'secondary'} className="text-sm">
            {used} / {limit} usadas
          </Badge>
          {limitReached ? (
            <Button onClick={() => navigate('/admin?tab=plan')} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Fazer upgrade
            </Button>
          ) : (
            <Button onClick={() => setPickerOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova conexão
            </Button>
          )}
        </div>
      </div>

      {limitReached && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-foreground">
            Você atingiu o limite de <strong>{limit}</strong> conexão(ões) do seu plano. Faça upgrade para criar mais conexões.
          </p>
        </div>
      )}

      {profile?.organization_id && (
        <div className="rounded-lg border bg-gradient-to-br from-blue-500/5 to-pink-500/5 p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-sm">Conectar Instagram + Meta Ads em 1 clique</div>
            <div className="text-xs text-muted-foreground">Autorize com sua conta do Facebook. Nós escolhemos as permissões corretas.</div>
          </div>
          <MetaOAuthConnectButton
            organizationId={profile.organization_id}
            purpose="both"
            label="Conectar com Facebook"
          />
        </div>
      )}


      <EvolutionInstancesPanel
        hideHeader
        openCreate={openEvolutionCreate}
        onCloseCreate={() => setOpenEvolutionCreate(false)}
      />

      <MetaAdsConnectionsPanel />

      <MetaWhatsAppConnectionsPanel
        hideHeader
        openWizard={openMetaWizard}
        onCloseWizard={() => setOpenMetaWizard(false)}
      />

      <InstagramConnectionsPanel
        hideHeader
        openWizard={openIgWizard}
        onCloseWizard={() => setOpenIgWizard(false)}
      />

      <NewConnectionDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
      />
    </div>
  );
}
