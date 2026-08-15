import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

export interface HealthKpis {
  openConversations: number;
  unanswered: number;
  hotLeads: number;
  hotNeedAction: number;
  todayAgenda: number;
  todayMeetings: number;
  overdueActivities: number;
  scheduledMessagesToday: number;
  onlineAttendants: number;
  attendingNow: number;
}

export interface OperationPriorities {
  unansweredConversations: number;
  hotLeadsUnassigned: number;
  meetingsStartingSoon: number;
  /** @deprecated use meetingsStartingSoon */
  pendingMeetings: number;
  overdueTasks: number;
  scheduledMessagesToday: number;
}

export interface SellerPerformance {
  userId: string;
  name: string;
  avatarUrl: string | null;
  conversations: number;
  unansweredConversations: number;
  leads: number;
  overdue: number;
  meetingsToday: number;
  status: 'healthy' | 'attention' | 'critical';
}

export interface RealtimeOps {
  conversations: {
    withAI: number;
    inAttendance: number;
    humanQueue: number;
    resolvedToday: number;
  };
  cadences: {
    activeEnrollments: number;
    executedToday: number;
    responded: number;
    paused: number;
  };
  agenda: {
    todayMeetings: number;
    confirmed: number;
    pending: number;
  };
}

export interface LeadAtRisk {
  id: string;
  name: string;
  assignedName: string | null;
  reason: string;
  lastActionAt: string | null;
}

export interface RadarInsight {
  id: string;
  icon: 'fire' | 'warn' | 'money' | 'calendar' | 'users';
  title: string;
  hint: string;
  navigateTo?: string;
}

function useOrgId() {
  const { profile } = useAuth();
  return profile?.organization_id;
}

// ============ KPIs Linha 1 ============
export function useHealthKpis() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['op-health-kpis', orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<HealthKpis> => {
      const today = startOfToday();
      const eod = endOfToday();
      const stale = hoursAgo(0.25); // 15 min

      const [
        openConvs,
        unanswered,
        hot,
        hotUnassigned,
        meetingsToday,
        overdueTasks,
        scheduled,
        online,
        attending,
      ] = await Promise.all([
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).in('status', ['bot_active', 'human_active', 'waiting_human']),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).in('status', ['waiting_human', 'human_active'])
          .lt('last_message_at', stale),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('temperature', 'hot'),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('temperature', 'hot').is('assigned_to', null),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('start_time', today).lte('start_time', eod),
        supabase.from('tasks').select('id, leads!inner(organization_id)', { count: 'exact', head: true })
          .eq('leads.organization_id', orgId)
          .lt('due_date', new Date().toISOString())
          .neq('status', 'completed'),
        supabase.from('scheduled_messages').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('scheduled_at', today).lte('scheduled_at', eod)
          .eq('status', 'pending'),
        supabase.from('user_status').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('status', 'online'),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('status', 'human_active'),
      ]);

      return {
        openConversations: openConvs.count ?? 0,
        unanswered: unanswered.count ?? 0,
        hotLeads: hot.count ?? 0,
        hotNeedAction: hotUnassigned.count ?? 0,
        todayAgenda: (meetingsToday.count ?? 0),
        todayMeetings: meetingsToday.count ?? 0,
        overdueActivities: overdueTasks.count ?? 0,
        scheduledMessagesToday: scheduled.count ?? 0,
        onlineAttendants: online.count ?? 0,
        attendingNow: attending.count ?? 0,
      };
    },
  });
}

// ============ Linha 2: Prioridades ============
export function useOperationPriorities() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['op-priorities', orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<OperationPriorities> => {
      const stale = hoursAgo(0.25);
      const today = startOfToday();
      const eod = endOfToday();
      const soonEnd = inMinutes(60);
      const now = new Date().toISOString();

      const [unanswered, hotUnassigned, soon, overdue, scheduled] = await Promise.all([
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).in('status', ['waiting_human', 'human_active'])
          .lt('last_message_at', stale),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('temperature', 'hot').is('assigned_to', null),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('start_time', now).lte('start_time', soonEnd),
        supabase.from('tasks').select('id, leads!inner(organization_id)', { count: 'exact', head: true })
          .eq('leads.organization_id', orgId).lt('due_date', now).neq('status', 'completed'),
        supabase.from('scheduled_messages').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('scheduled_at', today).lte('scheduled_at', eod)
          .eq('status', 'pending'),
      ]);

      return {
        unansweredConversations: unanswered.count ?? 0,
        hotLeadsUnassigned: hotUnassigned.count ?? 0,
        meetingsStartingSoon: soon.count ?? 0,
        pendingMeetings: soon.count ?? 0,
        overdueTasks: overdue.count ?? 0,
        scheduledMessagesToday: scheduled.count ?? 0,
      };
    },
  });
}

// ============ Linha 3: Performance da Equipe ============
export function useTeamPerformance() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['op-team-performance', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<SellerPerformance[]> => {
      const today = startOfToday();
      const eod = endOfToday();
      const stale = hoursAgo(0.25);
      const now = new Date().toISOString();

      // 1. Sellers da org
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('organization_id', orgId);

      const sellerIds = (profiles ?? []).map((p) => p.id);
      if (sellerIds.length === 0) return [];

      // 2. Agregações em paralelo
      const [convsRes, unansRes, leadsRes, tasksRes, eventsRes] = await Promise.all([
        supabase.from('webchat_conversations').select('assigned_user_id')
          .eq('organization_id', orgId).in('status', ['human_active', 'waiting_human'])
          .not('assigned_user_id', 'is', null),
        supabase.from('webchat_conversations').select('assigned_user_id')
          .eq('organization_id', orgId).in('status', ['human_active', 'waiting_human'])
          .lt('last_message_at', stale).not('assigned_user_id', 'is', null),
        supabase.from('leads').select('assigned_to')
          .eq('organization_id', orgId).not('assigned_to', 'is', null),
        supabase.from('tasks').select('user_id, leads!inner(organization_id)')
          .eq('leads.organization_id', orgId)
          .lt('due_date', now).neq('status', 'completed'),
        supabase.from('calendar_events').select('user_id')
          .eq('organization_id', orgId).gte('start_time', today).lte('start_time', eod)
          .not('user_id', 'is', null),
      ]);

      const tally = (rows: any[] | null | undefined, key: string) => {
        const map = new Map<string, number>();
        (rows ?? []).forEach((r: any) => {
          const k = r?.[key];
          if (!k) return;
          map.set(k, (map.get(k) ?? 0) + 1);
        });
        return map;
      };

      const convMap = tally(convsRes.data as any, 'assigned_user_id');
      const unansMap = tally(unansRes.data as any, 'assigned_user_id');

      const leadMap = tally(leadsRes.data as any, 'assigned_to');
      const taskMap = tally(tasksRes.data as any, 'user_id');
      const evtMap = tally(eventsRes.data as any, 'user_id');

      const result: SellerPerformance[] = (profiles ?? []).map((p: any) => {
        const overdue = taskMap.get(p.id) ?? 0;
        const unanswered = unansMap.get(p.id) ?? 0;
        let status: SellerPerformance['status'] = 'healthy';
        if (overdue >= 5 || unanswered >= 10) status = 'critical';
        else if (overdue >= 2 || unanswered >= 5) status = 'attention';
        return {
          userId: p.id,
          name: p.full_name || 'Sem nome',
          avatarUrl: p.avatar_url,
          conversations: convMap.get(p.id) ?? 0,
          unansweredConversations: unanswered,
          leads: leadMap.get(p.id) ?? 0,
          overdue,
          meetingsToday: evtMap.get(p.id) ?? 0,
          status,
        };
      });

      // Mostra quem tem atividade primeiro
      return result.sort((a, b) =>
        (b.conversations + b.leads + b.overdue + b.meetingsToday) -
        (a.conversations + a.leads + a.overdue + a.meetingsToday)
      );
    },
  });
}

// ============ Linha 4: Operação em Tempo Real ============
export function useRealtimeOps() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['op-realtime', orgId],
    enabled: !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<RealtimeOps> => {
      const today = startOfToday();
      const eod = endOfToday();
      const now = new Date().toISOString();

      const [
        withAI,
        inAttendance,
        humanQueue,
        resolvedToday,
        activeEnroll,
        execToday,
        responded,
        paused,
        meetingsToday,
        confirmed,
        pending,
      ] = await Promise.all([
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('status', 'bot_active'),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('status', 'human_active'),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('status', 'waiting_human').is('current_agent_id', null),
        supabase.from('webchat_conversations').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('status', 'closed').gte('closed_at', today),
        supabase.from('cadence_enrollments').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('status', 'active'),
        supabase.from('cadence_step_runs').select('id, cadence_enrollments!inner(organization_id)', { count: 'exact', head: true })
          .eq('cadence_enrollments.organization_id', orgId).gte('executed_at', today),
        supabase.from('cadence_enrollments').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('stop_reason', 'response').gte('updated_at', today),
        supabase.from('cadence_enrollments').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).eq('status', 'paused'),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('start_time', today).lte('start_time', eod),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('start_time', today).lte('start_time', eod)
          .in('status', ['confirmed', 'scheduled']),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('start_time', today).lte('start_time', eod)
          .eq('status', 'pending'),
      ]);

      return {
        conversations: {
          withAI: withAI.count ?? 0,
          inAttendance: inAttendance.count ?? 0,
          humanQueue: humanQueue.count ?? 0,
          resolvedToday: resolvedToday.count ?? 0,
        },
        cadences: {
          activeEnrollments: activeEnroll.count ?? 0,
          executedToday: execToday.count ?? 0,
          responded: responded.count ?? 0,
          paused: paused.count ?? 0,
        },
        agenda: {
          todayMeetings: meetingsToday.count ?? 0,
          confirmed: confirmed.count ?? 0,
          pending: pending.count ?? 0,
        },
      };
    },
  });
}

// ============ Linha 5: Leads em Risco ============
export function useLeadsAtRisk() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['op-leads-at-risk', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<LeadAtRisk[]> => {
      const fourDays = daysAgo(4);

      // Estratégia simples: leads não fechados com last_contact_at antigo
      const { data } = await supabase
        .from('leads')
        .select('id, name, last_contact_at, assigned_to, temperature, profiles:profiles!leads_assigned_to_fkey(full_name)')
        .eq('organization_id', orgId)
        .not('assigned_to', 'is', null)
        .lt('last_contact_at', fourDays)
        .order('last_contact_at', { ascending: true })
        .limit(8);

      return (data ?? []).map((l: any) => ({
        id: l.id,
        name: l.name || 'Sem nome',
        assignedName: l.profiles?.full_name ?? null,
        reason: l.temperature === 'hot' ? 'Lead quente sem contato' : 'Sem contato há +4 dias',
        lastActionAt: l.last_contact_at,
      }));
    },
  });
}

// ============ Linha 6: Radar IA ============
export function useAIRadarInsights() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['op-radar-insights', orgId],
    enabled: !!orgId,
    staleTime: 60_000,
    queryFn: async (): Promise<RadarInsight[]> => {
      const today = startOfToday();
      const sevenDays = daysAgo(7);
      const soonEnd = inMinutes(60);
      const now = new Date().toISOString();
      const yesterday = hoursAgo(24);

      const [topOverdueSeller, hotUnassigned, stalled, recentDeals, soonMeetings] = await Promise.all([
        // top vendedor com mais atrasos
        supabase.from('tasks').select('user_id, leads!inner(organization_id)')
          .eq('leads.organization_id', orgId).lt('due_date', now).neq('status', 'completed'),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).is('assigned_to', null),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).lt('updated_at', sevenDays)
          .not('current_stage_id', 'is', null),
        supabase.from('deals').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('created_at', yesterday),
        supabase.from('calendar_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId).gte('start_time', now).lte('start_time', soonEnd),
      ]);

      // Calcula vendedor com mais atrasos
      const overdueMap = new Map<string, number>();
      (topOverdueSeller.data ?? []).forEach((t: any) => {
        if (!t.user_id) return;
        overdueMap.set(t.user_id, (overdueMap.get(t.user_id) ?? 0) + 1);
      });
      let topSellerName = '';
      let topCount = 0;
      if (overdueMap.size > 0) {
        const [topId, count] = [...overdueMap.entries()].sort((a, b) => b[1] - a[1])[0];
        topCount = count;
        const { data: p } = await supabase.from('profiles').select('full_name').eq('id', topId).maybeSingle();
        topSellerName = p?.full_name ?? 'Vendedor';
      }

      const insights: RadarInsight[] = [];
      if (topCount > 0) {
        insights.push({
          id: 'top-overdue',
          icon: 'fire',
          title: `${topSellerName} possui ${topCount} follow-ups atrasados`,
          hint: 'Prioridade alta',
          navigateTo: 'team',
        });
      }
      const unassignedCount = hotUnassigned.count ?? 0;
      if (unassignedCount > 0) {
        insights.push({
          id: 'unassigned',
          icon: 'users',
          title: `Existem ${unassignedCount} leads sem responsável`,
          hint: 'Atribua responsáveis',
          navigateTo: 'leads',
        });
      }
      const stalledCount = stalled.count ?? 0;
      if (stalledCount > 0) {
        insights.push({
          id: 'stalled',
          icon: 'warn',
          title: `${stalledCount} oportunidades paradas há mais de 7 dias`,
          hint: 'Risco de perda',
          navigateTo: 'pipeline',
        });
      }
      const recentCount = recentDeals.count ?? 0;
      if (recentCount > 0) {
        insights.push({
          id: 'recent-deals',
          icon: 'money',
          title: `${recentCount} propostas abertas nas últimas 24h`,
          hint: 'Acompanhe agora',
          navigateTo: 'pipeline',
        });
      }
      const soonCount = soonMeetings.count ?? 0;
      if (soonCount > 0) {
        insights.push({
          id: 'soon-meetings',
          icon: 'calendar',
          title: `${soonCount} reuniões começam em menos de 60 minutos`,
          hint: 'Fique atento',
          navigateTo: 'calendar',
        });
      }
      return insights;
    },
  });
}
