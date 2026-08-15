import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Checa a janela 24h da Meta diretamente pelo conversation_id.
 * Mais preciso que useLeadWAWindow quando já há uma conversa selecionada.
 */
export function useConversationWAWindow(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: ['conv-wa-window', conversationId],
    enabled: !!conversationId,
    staleTime: 30_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      if (!conversationId) return { withinWindow: false, hasConversation: false };
      const { data: ok } = await supabase.rpc(
        'is_within_24h_window' as any,
        { _conversation_id: conversationId },
      );
      return { withinWindow: !!ok, hasConversation: true };
    },
  });
}
