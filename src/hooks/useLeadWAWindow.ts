import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Verifica se o lead tem uma conversa WhatsApp dentro da janela 24h da Meta.
 * Retorna `{ withinWindow, hasConversation }`. Quando não há conversa ainda,
 * a abertura via API Oficial só pode ser feita com template HSM.
 */
export function useLeadWAWindow(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ['lead-wa-window', leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!leadId) return { withinWindow: false, hasConversation: false };
      const { data: conv } = await supabase
        .from('webchat_conversations')
        .select('id')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!conv?.id) return { withinWindow: false, hasConversation: false };
      const { data: ok } = await supabase.rpc('is_within_24h_window' as any, { _conversation_id: conv.id });
      return { withinWindow: !!ok, hasConversation: true };
    },
  });
}
