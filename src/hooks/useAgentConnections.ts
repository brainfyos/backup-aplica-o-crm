import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type AgentConnectionOption = {
  id: string;
  type: 'evolution' | 'meta_whatsapp';
  label: string;
  phone: string | null;
  status: string | null;
  connected: boolean;
};

/**
 * Lista as conexões WhatsApp (Evolution + Meta Cloud) vinculadas a um agente,
 * com status e telefone — para a UI permitir escolher por qual canal enviar.
 *
 * Hierarquia espelha `resolveAgentSendConnection` do backend:
 *   Evolution conectada > Meta ativa > primeira vinculada > legacy evolution_instance_id
 */
export function useAgentConnections(agentId: string | null | undefined) {
  return useQuery<AgentConnectionOption[]>({
    queryKey: ['agent-connections', agentId],
    enabled: !!agentId,
    queryFn: async () => {
      if (!agentId) return [];

      const { data: links } = await supabase
        .from('product_agent_connections')
        .select('connection_type, connection_id')
        .eq('agent_id', agentId);

      const rows = (links ?? []) as Array<{ connection_type: string; connection_id: string }>;
      const evoIds = rows.filter((r) => r.connection_type === 'evolution').map((r) => r.connection_id);
      const metaIds = rows.filter((r) => r.connection_type === 'meta_whatsapp').map((r) => r.connection_id);

      const [evosRes, metasRes] = await Promise.all([
        evoIds.length
          ? supabase
              .from('evolution_instances')
              .select('id, name, phone_number, status')
              .in('id', evoIds)
          : Promise.resolve({ data: [] as any[] }),
        metaIds.length
          ? supabase
              .from('whatsapp_meta_connections')
              .select('id, display_name, phone_number, status')
              .in('id', metaIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // Fallback legacy: agente antigo com evolution_instance_id direto
      let legacy: AgentConnectionOption[] = [];
      if (!rows.length) {
        const { data: agent } = await supabase
          .from('product_agents')
          .select('evolution_instance_id')
          .eq('id', agentId)
          .maybeSingle();
        if (agent?.evolution_instance_id) {
          const { data: evo } = await supabase
            .from('evolution_instances')
            .select('id, name, phone_number, status')
            .eq('id', agent.evolution_instance_id)
            .maybeSingle();
          if (evo) {
            legacy = [{
              id: evo.id,
              type: 'evolution',
              label: evo.name ?? 'Evolution',
              phone: evo.phone_number ?? null,
              status: evo.status ?? null,
              connected: evo.status === 'connected',
            }];
          }
        }
      }

      const evos: AgentConnectionOption[] = ((evosRes.data ?? []) as any[]).map((e) => ({
        id: e.id,
        type: 'evolution',
        label: e.name ?? 'Evolution',
        phone: e.phone_number ?? null,
        status: e.status ?? null,
        connected: e.status === 'connected',
      }));

      const metas: AgentConnectionOption[] = ((metasRes.data ?? []) as any[]).map((m) => ({
        id: m.id,
        type: 'meta_whatsapp',
        label: m.display_name ?? 'API Oficial',
        phone: m.phone_number ?? null,
        status: m.status ?? null,
        connected: m.status === 'active' || m.status === 'connected',
      }));

      // Ordem: Meta conectadas → Evolution conectadas → restantes
      const all = [...metas, ...evos, ...legacy];
      return all.sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        if (a.type !== b.type) return a.type === 'meta_whatsapp' ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
    },
  });
}

/** Espelha a hierarquia do backend para mostrar quem ganharia em "Automático". */
export function pickAutoConnection(
  conns: AgentConnectionOption[] | undefined,
): AgentConnectionOption | null {
  if (!conns?.length) return null;
  const evoConnected = conns.find((c) => c.type === 'evolution' && c.connected);
  if (evoConnected) return evoConnected;
  const metaConnected = conns.find((c) => c.type === 'meta_whatsapp' && c.connected);
  if (metaConnected) return metaConnected;
  return conns[0];
}
