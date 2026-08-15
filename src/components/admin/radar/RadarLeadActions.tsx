import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, Sparkles, UserPlus, ListTodo } from 'lucide-react';
import { CallWithAIDialog } from '@/components/lead/CallWithAIDialog';
import { LeadTransferModal } from '@/components/lead/LeadTransferModal';
import { CreateRadarTaskDialog } from './CreateRadarTaskDialog';
import type { ScanItem } from '@/hooks/useOpportunityScan';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Props {
  item: ScanItem;
  compact?: boolean;
  onOpenConversation?: (conversationId: string) => void;
}

export function RadarLeadActions({ item, compact, onOpenConversation }: Props) {
  const { profile } = useAuth();
  const [callOpen, setCallOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferLead, setTransferLead] = useState<any>(null);
  const [taskOpen, setTaskOpen] = useState(false);

  const snap = item.lead_snapshot || {};
  const leadName = snap.name || 'Lead';
  const leadPhone = snap.phone || null;
  const productId = snap.product_id || null;

  const contextText = [
    item.reason && `Análise: ${item.reason}`,
    item.suggested_action && `Sugestão: ${item.suggested_action}`,
    item.signals?.length && `Sinais: ${item.signals.join(', ')}`,
  ].filter(Boolean).join('\n');

  async function handleOpenConversation() {
    if (item.conversation_id && onOpenConversation) {
      onOpenConversation(item.conversation_id);
      return;
    }
    if (item.lead_id) {
      window.location.href = `/admin?tab=leads&lead=${item.lead_id}`;
    } else {
      toast.error('Conversa não disponível');
    }
  }

  async function handleOpenTransfer() {
    if (!item.lead_id) {
      toast.error('Lead não encontrado');
      return;
    }
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, assigned_to, squad_id, product_id, organization_id')
      .eq('id', item.lead_id)
      .maybeSingle();
    if (error || !data) {
      toast.error('Não foi possível carregar o lead');
      return;
    }
    setTransferLead(data);
    setTransferOpen(true);
  }

  const btnSize = compact ? 'sm' : 'sm';

  return (
    <>
      <div className={compact ? 'grid grid-cols-2 gap-1.5' : 'flex flex-wrap gap-1.5'}>
        <Button
          size={btnSize}
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={handleOpenConversation}
          disabled={!item.conversation_id && !item.lead_id}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Abrir conversa
        </Button>

        <Button
          size={btnSize}
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={() => setCallOpen(true)}
          disabled={!item.lead_id || !leadPhone}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Chamar com IA
        </Button>

        <Button
          size={btnSize}
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={handleOpenTransfer}
          disabled={!item.lead_id}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Atribuir
        </Button>

        <Button
          size={btnSize}
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={() => setTaskOpen(true)}
          disabled={!item.lead_id}
        >
          <ListTodo className="h-3.5 w-3.5" />
          Criar tarefa
        </Button>
      </div>

      {item.lead_id && (
        <CallWithAIDialog
          open={callOpen}
          onOpenChange={setCallOpen}
          lead={{ id: item.lead_id, name: leadName, phone: leadPhone, product_id: productId }}
          initialExtraContext={contextText}
          initialObjective={item.suggested_action || undefined}
        />
      )}

      {transferLead && (
        <LeadTransferModal
          isOpen={transferOpen}
          onClose={() => setTransferOpen(false)}
          lead={transferLead}
        />
      )}

      {item.lead_id && (
        <CreateRadarTaskDialog
          open={taskOpen}
          onOpenChange={setTaskOpen}
          lead={{ id: item.lead_id, name: leadName }}
          defaultTitle={`Follow-up Radar IA — ${leadName}`}
          defaultDescription={[
            contextText,
            item.followup_message ? `\nMensagem sugerida:\n"${item.followup_message}"` : '',
          ].filter(Boolean).join('\n')}
        />
      )}
    </>
  );
}
