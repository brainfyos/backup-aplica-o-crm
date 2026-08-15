import { useMemo } from 'react';
import type { Message } from '@/components/seller/inbox/ChatArea';

/**
 * Detecta se a conversa está "parada" e merece um nudge de follow-up:
 *  - última mensagem do lead há > 6h sem resposta do vendedor, OU
 *  - último contato do vendedor há > 24h sem resposta do lead.
 */
export function useConversationStaleness(messages: Message[] | undefined) {
  return useMemo(() => {
    if (!messages || messages.length === 0) return { stale: false, reason: null as string | null };
    // mensagens chegam em ordem ascendente (mais antiga → mais recente)
    const last = messages[messages.length - 1];
    if (!last) return { stale: false, reason: null };
    const ageMs = Date.now() - new Date(last.created_at).getTime();
    const HOUR = 60 * 60 * 1000;

    if (last.sender_type === 'visitor' && ageMs > 6 * HOUR) {
      return { stale: true, reason: 'lead_waiting' as const };
    }
    if ((last.sender_type === 'agent' || last.sender_type === 'bot') && ageMs > 24 * HOUR) {
      return { stale: true, reason: 'no_reply' as const };
    }
    return { stale: false, reason: null };
  }, [messages]);
}
