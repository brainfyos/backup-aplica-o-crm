import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const OPEN_STATUSES = ['bot_active', 'waiting_human', 'human_active'] as const;
const PAGE_SIZE = 500;

interface ConversationRecord {
  id: string;
  status: string;
  visitor_name: string | null;
  channel: string;
  assigned_user_id: string | null;
  current_agent_id: string | null;
  product_id: string | null;
  sector_id: string | null;
  lead_id: string | null;
  last_message_at: string | null;
  needs_human: boolean;
  detected_intent: string | null;
}

export interface MiaBrainConversation {
  id: string;
  status: string;
  visitorName: string;
  channel: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerType: 'user' | 'agent' | 'unassigned';
  productId: string | null;
  productName: string | null;
  sectorId: string | null;
  sectorName: string | null;
  leadId: string | null;
  lastMessageAt: string | null;
  needsHuman: boolean;
  detectedIntent: string | null;
}

interface MiaBrainData {
  conversations: MiaBrainConversation[];
  loading: boolean;
  live: boolean;
  error: string | null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Não foi possível carregar as conversas abertas.';
}

async function loadOpenConversations(organizationId: string): Promise<ConversationRecord[]> {
  const rows: ConversationRecord[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('webchat_conversations')
      .select('id,status,visitor_name,channel,assigned_user_id,current_agent_id,product_id,sector_id,lead_id,last_message_at,needs_human,detected_intent')
      .eq('organization_id', organizationId)
      .in('status', [...OPEN_STATUSES])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as ConversationRecord[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export function useMiaBrainData(organizationId?: string | null, enabled = true) {
  const [state, setState] = useState<MiaBrainData>({
    conversations: [],
    loading: enabled,
    live: false,
    error: null,
  });
  const mountedRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!enabled || !organizationId) {
      setState((current) => ({ ...current, loading: false, conversations: [] }));
      return;
    }
    if (!quiet) setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const conversations = await loadOpenConversations(organizationId);
      const ownerIds = [...new Set(conversations.flatMap((conversation) =>
        [conversation.assigned_user_id ?? conversation.current_agent_id].filter((value): value is string => Boolean(value)),
      ))];
      const productIds = [...new Set(conversations.flatMap((conversation) =>
        [conversation.product_id].filter((value): value is string => Boolean(value)),
      ))];
      const sectorIds = [...new Set(conversations.flatMap((conversation) =>
        [conversation.sector_id].filter((value): value is string => Boolean(value)),
      ))];
      const agentIds = [...new Set(conversations.flatMap((conversation) =>
        [conversation.current_agent_id].filter((value): value is string => Boolean(value)),
      ))];

      const [ownersResult, productsResult, sectorsResult, agentsResult] = await Promise.all([
        ownerIds.length
          ? supabase.from('profiles').select('id,full_name').in('id', ownerIds)
          : Promise.resolve({ data: [], error: null }),
        productIds.length
          ? supabase.from('products').select('id,name').in('id', productIds)
          : Promise.resolve({ data: [], error: null }),
        sectorIds.length
          ? supabase.from('sectors').select('id,name').in('id', sectorIds)
          : Promise.resolve({ data: [], error: null }),
        agentIds.length
          ? supabase.from('product_agents').select('id,name').in('id', agentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (ownersResult.error) throw ownersResult.error;
      if (productsResult.error) throw productsResult.error;
      if (sectorsResult.error) throw sectorsResult.error;
      if (agentsResult.error) throw agentsResult.error;

      const owners = new Map((ownersResult.data ?? []).map((owner) => [owner.id, owner.full_name]));
      const products = new Map((productsResult.data ?? []).map((product) => [product.id, product.name]));
      const sectors = new Map((sectorsResult.data ?? []).map((sector) => [sector.id, sector.name]));
      const agents = new Map((agentsResult.data ?? []).map((agent) => [agent.id, agent.name]));
      const enriched = conversations.map<MiaBrainConversation>((conversation) => {
        const ownerId = conversation.assigned_user_id ?? conversation.current_agent_id;
        const ownerType = conversation.assigned_user_id
          ? 'user'
          : conversation.current_agent_id ? 'agent' : 'unassigned';
        return {
          id: conversation.id,
          status: conversation.status,
          visitorName: conversation.visitor_name?.trim() || 'Contato sem nome',
          channel: conversation.channel,
          ownerId,
          ownerName: conversation.assigned_user_id
            ? owners.get(conversation.assigned_user_id) ?? 'Responsável não identificado'
            : conversation.current_agent_id
              ? agents.get(conversation.current_agent_id) ?? 'Agente IA não identificado'
              : null,
          ownerType,
          productId: conversation.product_id,
          productName: conversation.product_id ? products.get(conversation.product_id) ?? 'Negócio não identificado' : null,
          sectorId: conversation.sector_id,
          sectorName: conversation.sector_id ? sectors.get(conversation.sector_id) ?? 'Setor não identificado' : null,
          leadId: conversation.lead_id,
          lastMessageAt: conversation.last_message_at,
          needsHuman: conversation.needs_human,
          detectedIntent: conversation.detected_intent,
        };
      });
      if (mountedRef.current) {
        setState((current) => ({ ...current, conversations: enriched, loading: false, error: null }));
      }
    } catch (error) {
      if (mountedRef.current) {
        setState((current) => ({ ...current, loading: false, error: errorMessage(error) }));
      }
    }
  }, [enabled, organizationId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    if (!enabled || !organizationId) return () => { mountedRef.current = false; };

    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => void load(true), 800);
    };
    const channel = supabase
      .channel(`mia-open-conversations-${organizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'webchat_conversations', filter: `organization_id=eq.${organizationId}` },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (mountedRef.current) setState((current) => ({ ...current, live: status === 'SUBSCRIBED' }));
      });

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [enabled, load, organizationId]);

  return { ...state, refresh: load };
}
