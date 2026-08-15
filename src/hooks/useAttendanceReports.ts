import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type ReportsPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'custom';
export type ReportsChannel = 'all' | 'whatsapp' | 'web_chat' | 'instagram' | 'facebook' | 'form' | 'quiz';

export interface ReportsFilters {
  period: ReportsPeriod;
  customFrom?: string; // ISO date
  customTo?: string;
  productId?: string | null;
  channel?: ReportsChannel;
  userId?: string | null;
  agentId?: string | null;
}

export interface ReportsRange {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

export function resolveRange(filters: ReportsFilters): ReportsRange {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  let from: Date;
  let to: Date;
  switch (filters.period) {
    case 'today':
      from = startOfDay(now);
      to = endOfDay(now);
      break;
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = startOfDay(y);
      to = endOfDay(y);
      break;
    }
    case '7d':
      from = startOfDay(new Date(now.getTime() - 6 * 86400000));
      to = endOfDay(now);
      break;
    case 'custom':
      from = filters.customFrom ? startOfDay(new Date(filters.customFrom)) : startOfDay(new Date(now.getTime() - 29 * 86400000));
      to = filters.customTo ? endOfDay(new Date(filters.customTo)) : endOfDay(now);
      break;
    case '30d':
    default:
      from = startOfDay(new Date(now.getTime() - 29 * 86400000));
      to = endOfDay(now);
  }
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { from, to, prevFrom, prevTo };
}

type ConvRow = {
  id: string;
  status: 'bot_active' | 'waiting_human' | 'human_active' | 'closed';
  channel: string;
  product_id: string | null;
  assigned_user_id: string | null;
  current_agent_id: string | null;
  visitor_name: string | null;
  visitor_phone: string | null;
  lead_id: string | null;
  first_response_at: string | null;
  last_message_at: string | null;
  created_at: string;
  closed_at: string | null;
  profiles?: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

type DealRow = {
  id: string;
  lead_id: string | null;
  seller_id: string | null;
  deal_value: number | null;
  status: string;
  closed_at: string | null;
};

export interface KpiDelta {
  current: number;
  previous: number;
  pct: number | null; // null = sem comparação
}

export interface TeamRankingRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  conversations: number;
  avgResponseMs: number | null;
  conversions: number;
}

export interface ChannelStatRow {
  channel: string;
  conversations: number;
  conversions: number;
  pct: number;
}

export interface RiskLeadRow {
  conversationId: string;
  leadName: string;
  channel: string;
  idleMinutes: number;
  responsible: string;
}

export interface AttendanceReportsData {
  isLoading: boolean;
  totalConversations: KpiDelta;
  activeConversations: KpiDelta;
  waiting: KpiDelta;
  avgResponseMs: KpiDelta;
  aiResolutionPct: KpiDelta;
  conversions: KpiDelta;
  risks: KpiDelta;
  statusBreakdown: { key: string; label: string; value: number; pct: number; tone: 'primary' | 'amber' | 'success' | 'muted' }[];
  team: TeamRankingRow[];
  channels: ChannelStatRow[];
  riskList: RiskLeadRow[];
}

async function fetchConversations(orgId: string, from: Date, to: Date, filters: ReportsFilters) {
  let q = supabase
    .from('webchat_conversations')
    .select('id,status,channel,product_id,assigned_user_id,current_agent_id,visitor_name,visitor_phone,lead_id,first_response_at,last_message_at,created_at,closed_at,profiles:profiles!webchat_conversations_assigned_user_id_fkey(id,full_name,avatar_url)')
    .eq('organization_id', orgId)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at', { ascending: false })
    .limit(1500);
  if (filters.productId) q = q.eq('product_id', filters.productId);
  if (filters.channel && filters.channel !== 'all') q = q.eq('channel', filters.channel);
  if (filters.userId) q = q.eq('assigned_user_id', filters.userId);
  if (filters.agentId) q = q.eq('current_agent_id', filters.agentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ConvRow[];
}

async function fetchDeals(orgId: string, from: Date, to: Date, filters: ReportsFilters) {
  let q = supabase
    .from('deals')
    .select('id,lead_id,seller_id,deal_value,status,closed_at')
    .eq('organization_id', orgId)
    .eq('status', 'won')
    .gte('closed_at', from.toISOString())
    .lte('closed_at', to.toISOString())
    .limit(2000);
  if (filters.productId) q = q.eq('product_id', filters.productId);
  if (filters.userId) q = q.eq('seller_id', filters.userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as DealRow[];
}




function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function computeMetrics(convs: ConvRow[], deals: DealRow[]) {
  const total = convs.length;
  const active = convs.filter(c => c.status === 'bot_active' || c.status === 'waiting_human' || c.status === 'human_active').length;
  const waiting = convs.filter(c => c.status === 'waiting_human').length;
  const closed = convs.filter(c => c.status === 'closed').length;
  const withResp = convs.filter(c => c.first_response_at && c.created_at);
  const avgResponseMs = withResp.length > 0
    ? withResp.reduce((s, c) => s + (new Date(c.first_response_at!).getTime() - new Date(c.created_at).getTime()), 0) / withResp.length
    : 0;
  const closedByAI = convs.filter(c => c.status === 'closed' && !c.assigned_user_id && c.current_agent_id).length;
  const aiPct = closed > 0 ? Math.round((closedByAI / closed) * 100) : 0;

  const now = Date.now();
  const riskList: ConvRow[] = convs.filter(c => {
    if (c.status === 'closed') return false;
    if (c.status === 'human_active') return false;
    const last = c.last_message_at ? new Date(c.last_message_at).getTime() : new Date(c.created_at).getTime();
    return now - last > 30 * 60 * 1000;
  });

  return { total, active, waiting, closed, avgResponseMs, aiPct, conversions: deals.length, risks: riskList.length, riskList };
}

export function useAttendanceReports(filters: ReportsFilters): AttendanceReportsData {
  const { profile } = useAuth();
  const orgId = profile?.organization_id as string | undefined;
  const range = useMemo(() => resolveRange(filters), [filters.period, filters.customFrom, filters.customTo]);

  const key = ['attendance-reports', orgId, filters.period, filters.customFrom, filters.customTo, filters.productId, filters.channel, filters.userId, filters.agentId];

  const current = useQuery({
    queryKey: [...key, 'current'],
    queryFn: async () => {
      if (!orgId) return { convs: [] as ConvRow[], deals: [] as DealRow[] };
      const [convs, deals] = await Promise.all([
        fetchConversations(orgId, range.from, range.to, filters),
        fetchDeals(orgId, range.from, range.to, filters),
      ]);
      return { convs, deals };
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const previous = useQuery({
    queryKey: [...key, 'previous'],
    queryFn: async () => {
      if (!orgId) return { convs: [] as ConvRow[], deals: [] as DealRow[] };
      const [convs, deals] = await Promise.all([
        fetchConversations(orgId, range.prevFrom, range.prevTo, filters),
        fetchDeals(orgId, range.prevFrom, range.prevTo, filters),
      ]);
      return { convs, deals };
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  return useMemo<AttendanceReportsData>(() => {
    const c = current.data ?? { convs: [], deals: [] };
    const p = previous.data ?? { convs: [], deals: [] };
    const cm = computeMetrics(c.convs, c.deals);
    const pm = computeMetrics(p.convs, p.deals);

    // Status breakdown
    const buckets = [
      { key: 'bot_active', label: 'Com IA', tone: 'primary' as const },
      { key: 'waiting_human', label: 'Aguardando Humano', tone: 'amber' as const },
      { key: 'human_active', label: 'Em Atendimento', tone: 'success' as const },
      { key: 'closed', label: 'Fechadas', tone: 'muted' as const },
    ];
    const statusBreakdown = buckets.map(b => {
      const value = c.convs.filter(x => x.status === b.key).length;
      return { ...b, value, pct: cm.total > 0 ? Math.round((value / cm.total) * 100) : 0 };
    });

    // Team ranking
    const byUser = new Map<string, TeamRankingRow>();
    for (const cv of c.convs) {
      if (!cv.assigned_user_id) continue;
      const row = byUser.get(cv.assigned_user_id) ?? {
        userId: cv.assigned_user_id,
        name: cv.profiles?.full_name ?? 'Sem nome',
        avatarUrl: cv.profiles?.avatar_url ?? null,
        conversations: 0,
        avgResponseMs: null,
        conversions: 0,
      };
      row.conversations += 1;
      if (cv.first_response_at) {
        const dt = new Date(cv.first_response_at).getTime() - new Date(cv.created_at).getTime();
        row.avgResponseMs = row.avgResponseMs == null ? dt : (row.avgResponseMs + dt) / 2;
      }
      byUser.set(cv.assigned_user_id, row);
    }
    for (const d of c.deals) {
      if (!d.seller_id) continue;
      const row = byUser.get(d.seller_id) ?? {
        userId: d.seller_id,
        name: 'Vendedor',
        avatarUrl: null,
        conversations: 0,
        avgResponseMs: null,
        conversions: 0,
      };
      row.conversions += 1;
      byUser.set(d.seller_id, row);
    }
    const team = Array.from(byUser.values()).sort((a, b) => b.conversions - a.conversions || b.conversations - a.conversations).slice(0, 8);

    // Channels — conversões = deals cujo lead aparece numa conversa daquele canal
    const leadsByChannel = new Map<string, Set<string>>();
    for (const cv of c.convs) {
      if (!cv.lead_id) continue;
      const s = leadsByChannel.get(cv.channel) ?? new Set<string>();
      s.add(cv.lead_id);
      leadsByChannel.set(cv.channel, s);
    }
    const knownChannels = ['whatsapp', 'web_chat', 'instagram', 'facebook'];
    const channelsSet = new Set<string>([...knownChannels, ...c.convs.map(x => x.channel)]);
    const channels: ChannelStatRow[] = Array.from(channelsSet).map(ch => {
      const conversations = c.convs.filter(x => x.channel === ch).length;
      const leadIds = leadsByChannel.get(ch) ?? new Set();
      const conversions = c.deals.filter(d => d.lead_id && leadIds.has(d.lead_id)).length;
      const pct = cm.total > 0 ? Math.round((conversations / cm.total) * 100) : 0;
      return { channel: ch, conversations, conversions, pct };
    }).sort((a, b) => b.conversations - a.conversations);

    // Risk list (até 25)
    const userMap = new Map(team.map(t => [t.userId, t.name]));
    const riskList: RiskLeadRow[] = cm.riskList.slice(0, 25).map(c => {
      const last = c.last_message_at ? new Date(c.last_message_at).getTime() : new Date(c.created_at).getTime();
      return {
        conversationId: c.id,
        leadName: c.visitor_name || c.visitor_phone || 'Visitante anônimo',
        channel: c.channel,
        idleMinutes: Math.round((Date.now() - last) / 60000),
        responsible: c.assigned_user_id ? (c.profiles?.full_name || userMap.get(c.assigned_user_id) || 'Atribuído') : 'Sem responsável',
      };
    });

    const isLoading = current.isLoading || previous.isLoading;

    return {
      isLoading,
      totalConversations: { current: cm.total, previous: pm.total, pct: pctDelta(cm.total, pm.total) },
      activeConversations: { current: cm.active, previous: pm.active, pct: pctDelta(cm.active, pm.active) },
      waiting: { current: cm.waiting, previous: pm.waiting, pct: pctDelta(cm.waiting, pm.waiting) },
      avgResponseMs: { current: cm.avgResponseMs, previous: pm.avgResponseMs, pct: pctDelta(cm.avgResponseMs, pm.avgResponseMs) },
      aiResolutionPct: { current: cm.aiPct, previous: pm.aiPct, pct: pctDelta(cm.aiPct, pm.aiPct) },
      conversions: { current: cm.conversions, previous: pm.conversions, pct: pctDelta(cm.conversions, pm.conversions) },
      risks: { current: cm.risks, previous: pm.risks, pct: pctDelta(cm.risks, pm.risks) },
      statusBreakdown,
      team,
      channels,
      riskList,
    };
  }, [current.data, previous.data, current.isLoading, previous.isLoading]);
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '--';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function channelLabel(ch: string): string {
  switch (ch) {
    case 'whatsapp': return 'WhatsApp';
    case 'web_chat': return 'Chat do Site';
    case 'instagram': return 'Instagram';
    case 'facebook': return 'Facebook';
    case 'form': return 'Formulário';
    case 'quiz': return 'Quiz';
    default: return ch;
  }
}
