import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PriorityItem {
  id: string;
  kind: 'conversation' | 'lead' | 'meeting';
  name: string;
  company?: string | null;
  status?: string | null;
  reason: string;
  ageMinutes?: number;
  actionLabel: 'Responder' | 'Ligar' | 'Abrir';
  actionTab: 'inbox' | 'leads' | 'bookings';
  payloadId: string;
}

export interface NextEvent {
  id: string;
  title: string;
  startTime: string;
  withName?: string | null;
}

export interface AIInsight {
  id: string;
  icon: 'flame' | 'alert' | 'calendar' | 'message' | 'trend';
  text: string;
}

export interface TimelineItem {
  id: string;
  time: string; // HH:mm
  startIso: string;
  kind: 'meeting' | 'task' | 'conversation' | 'lead';
  title: string;
  description?: string;
  countdown: string;
  tone: 'emerald' | 'sky' | 'amber' | 'destructive' | 'violet';
}

export interface SellerOperation {
  unansweredCount: number;
  activeLeadsCount: number; // conversas em atendimento humano (não leads do pipeline)
  todayMeetings: number;
  todayPendingTasks: number;
  priorities: PriorityItem[];
  nextEvent: NextEvent | null;
  insights: AIInsight[];
  timeline: TimelineItem[];
  myDay: { tasks: number; meetings: number; activeLeads: number };
}

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

const minutesSince = (iso?: string | null) => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
};

const humanizeAge = (mins: number) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
};

const formatHHmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const formatCountdown = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) {
    const past = Math.floor(-diff / 60_000);
    if (past < 60) return `há ${past} min`;
    const h = Math.floor(past / 60);
    return `há ${h}h`;
  }
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `Em ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `Em ${h}h${m.toString().padStart(2, '0')}min` : `Em ${h}h`;
};

const safeCount = (res: { count?: number | null } | undefined | null) =>
  res && typeof res.count === 'number' ? res.count : 0;

export function useSellerOperation() {
  const { user, profile } = useAuth();
  const orgId = profile?.organization_id;
  const userId = user?.id;

  return useQuery({
    queryKey: ['seller-operation', orgId, userId],
    enabled: !!orgId && !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SellerOperation> => {
      const today = startOfToday();
      const eod = endOfToday();
      const now = new Date().toISOString();
      const staleMins = 15;
      const staleIso = new Date(Date.now() - staleMins * 60_000).toISOString();

      // Enum task_status válido: pending | in_progress | completed | overdue
      const openTaskStatuses = ['pending', 'in_progress', 'overdue'] as const;


      const [
        unansweredRes,
        activeConversationsRes,
        prioritiesConvsRes,
        priorityLeadsPoolRes,
        nextEventsRes,
        todayMeetingsRes,
        todayTasksRes,
        overdueTasksRes,
        upcomingTasksRes,
      ] = await Promise.all([
        supabase
          .from('webchat_conversations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('assigned_user_id', userId)
          .in('status', ['waiting_human', 'human_active'])
          .eq('last_message_sender_type', 'visitor'),
        supabase
          .from('webchat_conversations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('assigned_user_id', userId)
          .eq('status', 'human_active'),
        supabase
          .from('webchat_conversations')
          .select('id, lead_id, last_message_at, visitor_name, leads:leads(name, company)')
          .eq('organization_id', orgId)
          .eq('assigned_user_id', userId)
          .in('status', ['waiting_human', 'human_active'])
          .eq('last_message_sender_type', 'visitor')
          .order('last_message_at', { ascending: true })
          .limit(5),
        supabase
          .from('leads')
          .select('id, name, company, temperature, deal_value, expected_close_date, last_contact_at, updated_at')
          .eq('organization_id', orgId)
          .eq('assigned_to', userId)
          .order('updated_at', { ascending: false })
          .limit(30),
        supabase
          .from('calendar_events')
          .select('id, title, start_time, lead:leads(name)')
          .eq('organization_id', orgId)
          .eq('user_id', userId)
          .gte('start_time', today)
          .lte('start_time', eod)
          .order('start_time', { ascending: true })
          .limit(8),
        supabase
          .from('calendar_events')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('user_id', userId)
          .gte('start_time', today)
          .lte('start_time', eod),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', openTaskStatuses)
          .gte('due_date', today)
          .lte('due_date', eod),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', openTaskStatuses)
          .lt('due_date', now),
        supabase
          .from('tasks')
          .select('id, title, due_date, type, leads:leads(name, company)')
          .eq('user_id', userId)
          .in('status', openTaskStatuses)
          .gte('due_date', today)
          .lte('due_date', eod)
          .order('due_date', { ascending: true })
          .limit(8),
      ]);

      // ===== Ranking de leads prioritários =====
      type LeadRow = {
        id: string;
        name: string | null;
        company: string | null;
        temperature: string | null;
        deal_value: number | null;
        expected_close_date: string | null;
        last_contact_at: string | null;
        updated_at: string | null;
      };
      const dayMs = 86_400_000;
      const nowMs = Date.now();
      const rankedLeads = (priorityLeadsPoolRes.data ?? [])
        .map((l: any) => {
          const lead = l as LeadRow;
          let score = 0;
          const reasonBits: string[] = [];

          const temp = (lead.temperature || '').toLowerCase();
          if (temp === 'hot') { score += 40; reasonBits.push('Quente'); }
          else if (temp === 'warm') { score += 20; reasonBits.push('Morno'); }
          else if (temp === 'cold') { score += 5; }

          const dv = Number(lead.deal_value || 0);
          if (dv > 0) {
            score += Math.min(dv / 10000, 1) * 30;
            reasonBits.push(`R$ ${dv >= 1000 ? (dv / 1000).toFixed(dv >= 10000 ? 0 : 1) + 'k' : dv.toFixed(0)}`);
          }

          if (lead.expected_close_date) {
            const days = Math.floor((new Date(lead.expected_close_date).getTime() - nowMs) / dayMs);
            if (days <= 7) { score += 20; reasonBits.push(days <= 0 ? 'fecha hoje' : `fecha em ${days}d`); }
            else if (days <= 30) { score += 10; reasonBits.push(`fecha em ${days}d`); }
          }

          if (!lead.last_contact_at) {
            score += 15;
            reasonBits.push('sem contato');
          } else {
            const ageMin = minutesSince(lead.last_contact_at);
            if (ageMin <= 1440) score += 10;
            else if (ageMin <= 10080) score += 5;
          }

          return { lead, score, reason: reasonBits.join(' • ') };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      // ===== Priorities =====
      const priorities: PriorityItem[] = [];
      for (const c of prioritiesConvsRes.data ?? []) {
        const leadRel: any = (c as any).leads;
        const name = leadRel?.name || (c as any).visitor_name || 'Contato';
        const ageMin = minutesSince((c as any).last_message_at);
        priorities.push({
          id: `conv-${c.id}`,
          kind: 'conversation',
          name,
          company: leadRel?.company ?? null,
          status: leadRel?.status ?? null,
          reason: `Sem resposta há ${humanizeAge(ageMin)}`,
          ageMinutes: ageMin,
          actionLabel: 'Responder',
          actionTab: 'inbox',
          payloadId: c.id,
        });
      }

      const events = (nextEventsRes as any).data ?? [];
      const futureEvent = events.find(
        (e: any) => new Date(e.start_time).getTime() >= Date.now()
      );
      if (futureEvent) {
        const mins = Math.floor(
          (new Date(futureEvent.start_time).getTime() - Date.now()) / 60_000
        );
        if (mins <= 120 && mins >= -30) {
          const time = formatHHmm(futureEvent.start_time);
          priorities.unshift({
            id: `evt-${futureEvent.id}`,
            kind: 'meeting',
            name: futureEvent.lead?.name || futureEvent.title || 'Reunião',
            reason: `Reunião às ${time}`,
            actionLabel: 'Abrir',
            actionTab: 'bookings',
            payloadId: futureEvent.id,
          });
        }
      }

      for (const r of rankedLeads) {
        const l = r.lead;
        const ageMin = minutesSince(l.last_contact_at || l.updated_at);
        priorities.push({
          id: `lead-${l.id}`,
          kind: 'lead',
          name: l.name || 'Lead',
          company: l.company,
          status: null,
          reason: r.reason || (l.company ? `${l.company}` : 'Lead com potencial'),
          ageMinutes: l.last_contact_at ? ageMin : undefined,
          actionLabel: 'Ligar',
          actionTab: 'leads',
          payloadId: l.id,
        });
      }

      const top5 = priorities.slice(0, 5);

      const nextEvent: NextEvent | null = futureEvent
        ? {
            id: futureEvent.id,
            title: futureEvent.title || 'Reunião',
            startTime: futureEvent.start_time,
            withName: futureEvent.lead?.name ?? null,
          }
        : null;

      // ===== Timeline (Meu Dia) =====
      const timeline: TimelineItem[] = [];
      for (const e of events) {
        timeline.push({
          id: `t-evt-${e.id}`,
          time: formatHHmm(e.start_time),
          startIso: e.start_time,
          kind: 'meeting',
          title: e.lead?.name ? `Reunião com ${e.lead.name}` : e.title || 'Reunião',
          description: e.title || undefined,
          countdown: formatCountdown(e.start_time),
          tone: 'emerald',
        });
      }
      for (const t of upcomingTasksRes.data ?? []) {
        if (!t.due_date) continue;
        const leadRel: any = (t as any).leads;
        const tone: TimelineItem['tone'] =
          t.type === 'cadence' ? 'sky' : t.type === 'followup' ? 'amber' : 'violet';
        timeline.push({
          id: `t-task-${t.id}`,
          time: formatHHmm(t.due_date),
          startIso: t.due_date,
          kind: 'task',
          title: t.title,
          description: leadRel?.name
            ? leadRel.company
              ? `${leadRel.name} • ${leadRel.company}`
              : leadRel.name
            : undefined,
          countdown: formatCountdown(t.due_date),
          tone,
        });
      }
      timeline.sort(
        (a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime()
      );

      // ===== Insights =====
      const insights: AIInsight[] = [];
      const hotCount = rankedLeads.filter((r) => (r.lead.temperature || '').toLowerCase() === 'hot').length;
      const overdue = safeCount(overdueTasksRes);
      const unanswered = safeCount(unansweredRes);
      if (hotCount > 0) {
        insights.push({
          id: 'hot',
          icon: 'flame',
          text: `${hotCount} lead${hotCount > 1 ? 's' : ''} quente${hotCount > 1 ? 's' : ''} sem retorno`,
        });
      }
      if (overdue > 0) {
        insights.push({
          id: 'overdue',
          icon: 'alert',
          text: `Você possui ${overdue} tarefa${overdue > 1 ? 's' : ''} vencida${overdue > 1 ? 's' : ''}`,
        });
      }
      if (nextEvent) {
        const mins = Math.floor(
          (new Date(nextEvent.startTime).getTime() - Date.now()) / 60_000
        );
        const meetingsSoon = events.filter((e: any) => {
          const m = Math.floor((new Date(e.start_time).getTime() - Date.now()) / 60_000);
          return m >= 0 && m <= 30;
        }).length;
        if (meetingsSoon > 0) {
          insights.push({
            id: 'meetings-soon',
            icon: 'calendar',
            text: `${meetingsSoon} reunião${meetingsSoon > 1 ? 'ões' : ''} começam em 30 minutos`,
          });
        } else if (mins >= 0 && mins <= 120) {
          insights.push({
            id: 'meeting-soon',
            icon: 'calendar',
            text:
              mins < 60
                ? `1 reunião em ${mins} min`
                : `1 reunião em ${Math.round(mins / 60)}h`,
          });
        }
      }
      if (unanswered > 0) {
        insights.push({
          id: 'unanswered',
          icon: 'message',
          text: `${unanswered} conversa${unanswered > 1 ? 's' : ''} aguardam resposta`,
        });
      }

      const activeConversations = safeCount(activeConversationsRes);

      return {
        unansweredCount: unanswered,
        activeLeadsCount: activeConversations,
        todayMeetings: safeCount(todayMeetingsRes),
        todayPendingTasks: safeCount(todayTasksRes),
        priorities: top5,
        nextEvent,
        insights: insights.slice(0, 5),
        timeline: timeline.slice(0, 6),
        myDay: {
          tasks: safeCount(todayTasksRes),
          meetings: safeCount(todayMeetingsRes),
          activeLeads: activeConversations,
        },
      };
    },
  });
}
