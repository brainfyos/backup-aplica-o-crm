// Resolve a conexão de envio (WhatsApp) preferida de um agente.
// Hierarquia:
//   1) product_agent_connections (multi-canal) -> Evolution conectada > Meta conectada > primeira ativa
//   2) Fallback legacy: product_agents.evolution_instance_id
//   3) Fallback final: primeira evolution_instance "connected" da organização
//
// Retorna `null` quando o agente não tem nenhuma conexão WhatsApp utilizável.

export type AgentSendConnection = {
  connection_type: 'evolution' | 'meta_whatsapp';
  connection_id: string;
  phone?: string | null;
  label?: string | null;
};

export async function resolveAgentSendConnection(
  supabase: any,
  agentId: string,
): Promise<AgentSendConnection | null> {
  if (!agentId) return null;

  // 1) Conexões dedicadas
  const { data: links } = await supabase
    .from('product_agent_connections')
    .select('connection_type, connection_id')
    .eq('agent_id', agentId);

  const rows = (links ?? []) as Array<{ connection_type: string; connection_id: string }>;
  const waLinks = rows.filter((r) => r.connection_type === 'evolution' || r.connection_type === 'meta_whatsapp');

  if (waLinks.length) {
    // Carrega status para priorizar conectadas
    const evoIds = waLinks.filter((r) => r.connection_type === 'evolution').map((r) => r.connection_id);
    const metaIds = waLinks.filter((r) => r.connection_type === 'meta_whatsapp').map((r) => r.connection_id);

    const [{ data: evos }, { data: metas }] = await Promise.all([
      evoIds.length
        ? supabase.from('evolution_instances').select('id, name, phone_number, status').in('id', evoIds)
        : Promise.resolve({ data: [] as any[] }),
      metaIds.length
        ? supabase.from('whatsapp_meta_connections').select('id, display_name, phone_number, status').in('id', metaIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const evoConnected = (evos ?? []).find((e: any) => e.status === 'connected');
    if (evoConnected) {
      return {
        connection_type: 'evolution',
        connection_id: evoConnected.id,
        phone: evoConnected.phone_number ?? null,
        label: evoConnected.name ?? null,
      };
    }
    const metaConnected = (metas ?? []).find((m: any) => m.status === 'active' || m.status === 'connected');
    if (metaConnected) {
      return {
        connection_type: 'meta_whatsapp',
        connection_id: metaConnected.id,
        phone: metaConnected.phone_number ?? null,
        label: metaConnected.display_name ?? null,
      };
    }
    // Caiu pra qualquer link existente (mesmo desconectado) — devolve o primeiro
    const first = waLinks[0];
    return {
      connection_type: first.connection_type as 'evolution' | 'meta_whatsapp',
      connection_id: first.connection_id,
    };
  }

  // 2) Legacy fallback: agente antigo com evolution_instance_id direto
  const { data: agent } = await supabase
    .from('product_agents')
    .select('evolution_instance_id, organization_id')
    .eq('id', agentId)
    .maybeSingle();

  if (agent?.evolution_instance_id) {
    const { data: evo } = await supabase
      .from('evolution_instances')
      .select('id, name, phone_number, status')
      .eq('id', agent.evolution_instance_id)
      .maybeSingle();
    if (evo) {
      return {
        connection_type: 'evolution',
        connection_id: evo.id,
        phone: evo.phone_number ?? null,
        label: evo.name ?? null,
      };
    }
  }

  // 3) Fallback final: primeira Evolution conectada da organização do agente
  if (agent?.organization_id) {
    const { data: evo } = await supabase
      .from('evolution_instances')
      .select('id, name, phone_number, status')
      .eq('organization_id', agent.organization_id)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle();
    if (evo) {
      return {
        connection_type: 'evolution',
        connection_id: evo.id,
        phone: evo.phone_number ?? null,
        label: evo.name ?? null,
      };
    }
  }

  return null;
}

/**
 * Resolve a conexão de envio a partir da conversa WhatsApp mais recente do lead.
 * Garante continuidade: o lead recebe pelo mesmo número em que já está falando.
 * Retorna `null` quando não há conversa WhatsApp com conexão identificável.
 */
export async function resolveConnectionFromConversation(
  supabase: any,
  leadId: string,
): Promise<AgentSendConnection | null> {
  if (!leadId) return null;

  const { data: convs } = await supabase
    .from('webchat_conversations')
    .select('id, channel, meta_connection_id, evolution_instance_id, last_message_at')
    .eq('lead_id', leadId)
    .in('channel', ['whatsapp', 'whatsapp_meta'])
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(5);

  const rows = (convs ?? []) as Array<{
    meta_connection_id: string | null;
    evolution_instance_id: string | null;
  }>;

  for (const c of rows) {
    if (c.meta_connection_id) {
      const { data: meta } = await supabase
        .from('whatsapp_meta_connections')
        .select('id, display_name, phone_number')
        .eq('id', c.meta_connection_id)
        .maybeSingle();
      if (meta) {
        return {
          connection_type: 'meta_whatsapp',
          connection_id: meta.id,
          phone: meta.phone_number ?? null,
          label: meta.display_name ?? null,
        };
      }
    }
    if (c.evolution_instance_id) {
      const { data: evo } = await supabase
        .from('evolution_instances')
        .select('id, name, phone_number')
        .eq('id', c.evolution_instance_id)
        .maybeSingle();
      if (evo) {
        return {
          connection_type: 'evolution',
          connection_id: evo.id,
          phone: evo.phone_number ?? null,
          label: evo.name ?? null,
        };
      }
    }
  }

  return null;
}

