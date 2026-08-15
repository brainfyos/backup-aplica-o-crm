import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface PanelConversation {
  id: string;
  organization_id: string;
  channel: string | null;
  status: string;
  sector_id: string | null;
  sector_name: string | null;
  sector_color: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  assigned_user_avatar: string | null;
  current_agent_id: string | null;
  current_agent_name: string | null;
  current_agent_avatar: string | null;
  last_message_at: string | null;
  unread_count_agents: number | null;
  visitor_name: string | null;
  visitor_phone: string | null;
  visitor_avatar_url: string | null;
  lead_name: string | null;
  lead_id: string | null;
}

export interface PanelFilters {
  search: string;
  channels: string[];
  sectorIds: string[];
  showQueue: boolean;
  showAI: boolean;
  showHumans: boolean;
}

const PAGE = 200;

async function loadTab(userId: string, tab: 'waiting' | 'attending' | 'agents'): Promise<PanelConversation[]> {
  const { data, error } = await supabase.rpc('inbox_list_conversations', {
    p_user_id: userId,
    p_tab: tab,
    p_limit: PAGE,
  });
  if (error) throw error;
  return (data || []) as unknown as PanelConversation[];
}

export function useAttendancePanel(filters: PanelFilters) {
  const { user, profile, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();

  const userId = user?.id;
  const orgId = profile?.organization_id;
  const enabled = !!userId && !!orgId && !authLoading;

  const commonQueryOptions = {
    enabled,
    refetchInterval: 90000,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
    staleTime: 0,
  };

  const queryWaiting = useQuery({
    queryKey: ['attendance-panel', orgId, 'waiting'],
    queryFn: () => loadTab(userId!, 'waiting'),
    ...commonQueryOptions,
  });

  const queryAttending = useQuery({
    queryKey: ['attendance-panel', orgId, 'attending'],
    queryFn: () => loadTab(userId!, 'attending'),
    ...commonQueryOptions,
  });

  const queryAgents = useQuery({
    queryKey: ['attendance-panel', orgId, 'agents'],
    queryFn: () => loadTab(userId!, 'agents'),
    ...commonQueryOptions,
  });

  // Quando a empresa ativa/perfil termina de carregar, força uma carga real.
  // Isso evita o painel nascer com listas vazias em cache e só popular após
  // alguma interação manual nos blocos "Fila" ou "Agentes IA".
  useEffect(() => {
    if (!enabled || !orgId) return;
    qc.invalidateQueries({ queryKey: ['attendance-panel', orgId] });
  }, [enabled, orgId, qc]);


  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`attendance-panel-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'webchat_conversations', filter: `organization_id=eq.${orgId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['attendance-panel', orgId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  const applyFilters = (list: PanelConversation[]) => {
    const term = filters.search.trim().toLowerCase();
    return list.filter((c) => {
      if (filters.channels.length && !filters.channels.includes(c.channel || 'webchat')) return false;
      if (filters.sectorIds.length) {
        const sid = c.sector_id || '__none__';
        if (!filters.sectorIds.includes(sid)) return false;
      }
      if (term) {
        const hay = `${c.lead_name || ''} ${c.visitor_name || ''} ${c.visitor_phone || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  };

  const sections = useMemo(() => {
    const waiting = queryWaiting.data || [];
    const attending = queryAttending.data || [];
    const agents = queryAgents.data || [];

    const queueRaw = waiting.filter((c) => !c.current_agent_id);
    const aiRaw = agents.filter((c) => !!c.current_agent_id);

    const queue = applyFilters(queueRaw);
    const ai = applyFilters(aiRaw);
    const humans = applyFilters(attending);

    // Group queue by sector
    const queueBySector = new Map<string, { sectorId: string | null; name: string; color: string | null; items: PanelConversation[] }>();
    for (const c of queue) {
      const key = c.sector_id || '__none__';
      if (!queueBySector.has(key)) {
        queueBySector.set(key, {
          sectorId: c.sector_id,
          name: c.sector_name || 'Sem setor',
          color: c.sector_color,
          items: [],
        });
      }
      queueBySector.get(key)!.items.push(c);
    }

    // Group AI by agent
    const aiByAgent = new Map<string, { agentId: string; name: string; avatar: string | null; items: PanelConversation[] }>();
    for (const c of ai) {
      const key = c.current_agent_id!;
      if (!aiByAgent.has(key)) {
        aiByAgent.set(key, {
          agentId: key,
          name: c.current_agent_name || 'Agente IA',
          avatar: c.current_agent_avatar,
          items: [],
        });
      }
      aiByAgent.get(key)!.items.push(c);
    }

    // Group humans by user
    const humansByUser = new Map<string, { userId: string; name: string; avatar: string | null; items: PanelConversation[] }>();
    for (const c of humans) {
      const key = c.assigned_user_id || '__none__';
      if (!humansByUser.has(key)) {
        humansByUser.set(key, {
          userId: key,
          name: c.assigned_user_name || 'Sem atendente',
          avatar: c.assigned_user_avatar,
          items: [],
        });
      }
      humansByUser.get(key)!.items.push(c);
    }

    return {
      queueBySector: Array.from(queueBySector.values()).sort((a, b) => b.items.length - a.items.length),
      aiByAgent: Array.from(aiByAgent.values()).sort((a, b) => b.items.length - a.items.length),
      humansByUser: Array.from(humansByUser.values()).sort((a, b) => b.items.length - a.items.length),
      totals: {
        queue: queue.length,
        ai: ai.length,
        humans: humans.length,
      },
    };
  }, [queryWaiting.data, queryAttending.data, queryAgents.data, filters]);

  return {
    sections,
    isLoading: !enabled || queryWaiting.isLoading || queryAttending.isLoading || queryAgents.isLoading,
    isFetching: queryWaiting.isFetching || queryAttending.isFetching || queryAgents.isFetching,
    refetch: () => {
      queryWaiting.refetch();
      queryAttending.refetch();
      queryAgents.refetch();
    },
  };
}


export function usePanelFiltersState() {
  const [filters, setFilters] = useState<PanelFilters>({
    search: '',
    channels: [],
    sectorIds: [],
    showQueue: true,
    showAI: true,
    showHumans: true,
  });
  return { filters, setFilters };
}
