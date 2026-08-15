import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  startOfDay,
  endOfDay,
  startOfTomorrow,
  endOfTomorrow,
  addDays,
  subDays,
} from 'date-fns';

export type ActivityType =
  | 'task'
  | 'followup'
  | 'call'
  | 'email'
  | 'whatsapp'
  | 'meeting'
  | 'scheduled_message'
  | 'cadence_action';

export type ActivitySource =
  | 'task'
  | 'scheduled_message'
  | 'calendar_event'
  | 'cadence_step';

export type ActivityStatus =
  | 'pending'
  | 'in_progress'
  | 'scheduled'
  | 'overdue'
  | 'failed'
  | 'cancelled'
  | 'completed';

export type ActivityPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Activity {
  id: string;
  source: ActivitySource;
  source_id: string;
  type: ActivityType;
  title: string;
  description?: string | null;
  due_at: string;
  priority: ActivityPriority;
  status: ActivityStatus;
  lead?: { id: string; name: string } | null;
  pipeline_stage?: string | null;
  channel?: 'whatsapp' | 'email' | 'call' | 'meeting' | null;
  cadence_name?: string | null;
  open_lead_id?: string | null;
}

function isOverdue(due: string, status: ActivityStatus) {
  if (status === 'completed') return false;
  return new Date(due).getTime() < Date.now();
}

function normalizeTaskType(t?: string | null): ActivityType {
  switch (t) {
    case 'followup':
      return 'followup';
    case 'call':
      return 'call';
    case 'email':
      return 'email';
    case 'whatsapp':
      return 'whatsapp';
    case 'meeting':
      return 'meeting';
    case 'scheduled_message':
      return 'scheduled_message';
    case 'cadence_action':
      return 'cadence_action';
    default:
      return 'task';
  }
}

export function useSellerActivities(userId?: string, productId?: string) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['seller-activities', userId, productId, orgId],
    enabled: !!userId && !!orgId,
    staleTime: 30_000,
    queryFn: async (): Promise<Activity[]> => {
      const horizonStart = subDays(new Date(), 30).toISOString();
      const horizonEnd = addDays(new Date(), 60).toISOString();

      // 1) Tasks (do vendedor)
      let tasksQuery = supabase
        .from('tasks')
        .select('id, title, description, due_date, priority, status, type, lead_id, product_id, leads(id, name, current_stage_id)')
        .eq('user_id', userId!)
        .gte('due_date', horizonStart)
        .lte('due_date', horizonEnd);
      if (productId) tasksQuery = tasksQuery.eq('product_id', productId);
      const tasksRes = await tasksQuery;

      // 2) Calendar events do vendedor
      let eventsQuery = supabase
        .from('calendar_events')
        .select('id, title, description, start_time, lead_id, product_id, status, leads(id, name)')
        .eq('user_id', userId!)
        .eq('organization_id', orgId!)
        .gte('start_time', horizonStart)
        .lte('start_time', horizonEnd);
      if (productId) eventsQuery = eventsQuery.eq('product_id', productId);
      const eventsRes = await eventsQuery;

      // 3) Mensagens agendadas (org) — inclui falhas/canceladas para visibilidade
      const scheduledRes = await supabase
        .from('scheduled_messages')
        .select('id, content, scheduled_at, status, conversation_id, last_error')
        .eq('organization_id', orgId!)
        .eq('created_by', userId!)
        .in('status', ['pending', 'sent', 'failed', 'cancelled'])
        .gte('scheduled_at', horizonStart)
        .lte('scheduled_at', horizonEnd);

      // 4) Cadência (org) — inclui finalizadas para histórico
      const cadenceRes = await supabase
        .from('cadence_step_runs')
        .select('id, scheduled_at, status, enrollment_id, cadence_steps(name, cadences(name)), cadence_enrollments(lead_id, leads(id, name))')
        .eq('organization_id', orgId!)
        .in('status', ['pending', 'scheduled', 'sent', 'cancelled', 'failed', 'skipped'])
        .gte('scheduled_at', subDays(new Date(), 1).toISOString())
        .lte('scheduled_at', horizonEnd)
        .limit(200);

      const activities: Activity[] = [];

      for (const t of tasksRes.data ?? []) {
        const type = normalizeTaskType(t.type);
        const due = t.due_date ?? new Date().toISOString();
        const baseStatus: ActivityStatus =
          (t.status as ActivityStatus) ?? 'pending';
        const status: ActivityStatus =
          baseStatus === 'completed'
            ? 'completed'
            : baseStatus === 'cancelled'
              ? 'cancelled'
              : isOverdue(due, baseStatus)
                ? 'overdue'
                : baseStatus;
        activities.push({
          id: `task-${t.id}`,
          source: 'task',
          source_id: t.id,
          type,
          title: t.title,
          description: t.description,
          due_at: due,
          priority: (t.priority as ActivityPriority) ?? 'medium',
          status,
          lead: t.leads ? { id: (t.leads as any).id, name: (t.leads as any).name } : null,
          pipeline_stage: (t.leads as any)?.current_stage_id ?? null,
          channel:
            type === 'call'
              ? 'call'
              : type === 'email'
                ? 'email'
                : type === 'whatsapp'
                  ? 'whatsapp'
                  : type === 'meeting'
                    ? 'meeting'
                    : null,
          open_lead_id: t.lead_id,
        });
      }

      for (const e of eventsRes.data ?? []) {
        const due = e.start_time;
        const evStatus = (e as any).status as string | null;
        const status: ActivityStatus =
          evStatus === 'completed'
            ? 'completed'
            : evStatus === 'cancelled'
              ? 'cancelled'
              : isOverdue(due, 'scheduled')
                ? 'overdue'
                : 'scheduled';
        activities.push({
          id: `event-${e.id}`,
          source: 'calendar_event',
          source_id: e.id,
          type: 'meeting',
          title: e.title,
          description: e.description,
          due_at: due,
          priority: 'high',
          status,
          lead: e.leads ? { id: (e.leads as any).id, name: (e.leads as any).name } : null,
          channel: 'meeting',
          open_lead_id: e.lead_id,
        });
      }

      for (const s of scheduledRes.data ?? []) {
        const due = s.scheduled_at;
        const status: ActivityStatus =
          s.status === 'sent'
            ? 'completed'
            : s.status === 'failed'
              ? 'failed'
              : s.status === 'cancelled'
                ? 'cancelled'
                : isOverdue(due, 'scheduled')
                  ? 'overdue'
                  : 'scheduled';
        const lastError = (s as any).last_error as string | null;
        const title =
          status === 'failed'
            ? 'Mensagem agendada (falhou)'
            : status === 'cancelled'
              ? 'Mensagem agendada (cancelada)'
              : status === 'completed'
                ? 'Mensagem enviada'
                : 'Mensagem agendada';
        activities.push({
          id: `sched-${s.id}`,
          source: 'scheduled_message',
          source_id: s.id,
          type: 'scheduled_message',
          title,
          description: lastError ? `${s.content ?? ''}${s.content ? ' • ' : ''}Erro: ${lastError}` : s.content,
          due_at: due,
          priority: 'medium',
          status,
          channel: 'whatsapp',
          open_lead_id: null,
        });
      }

      for (const r of cadenceRes.data ?? []) {
        const due = r.scheduled_at;
        const enr: any = r.cadence_enrollments;
        const lead = enr?.leads;
        const stepName = (r.cadence_steps as any)?.name ?? 'Passo';
        const cadenceName = (r.cadence_steps as any)?.cadences?.name ?? 'Cadência';
        const rStatus = (r as any).status as string | null;
        const status: ActivityStatus =
          rStatus === 'sent'
            ? 'completed'
            : rStatus === 'cancelled' || rStatus === 'skipped'
              ? 'cancelled'
              : rStatus === 'failed'
                ? 'failed'
                : isOverdue(due, 'scheduled')
                  ? 'overdue'
                  : 'scheduled';
        activities.push({
          id: `cad-${r.id}`,
          source: 'cadence_step',
          source_id: r.id,
          type: 'cadence_action',
          title: `${cadenceName} • ${stepName}`,
          description: null,
          due_at: due,
          priority: 'low',
          status,
          lead: lead ? { id: lead.id, name: lead.name } : null,
          cadence_name: cadenceName,
          channel: 'whatsapp',
          open_lead_id: lead?.id ?? null,
        });
      }

      activities.sort(
        (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
      );

      return activities;
    },
  });
}

export interface ActivityCounts {
  today: number;
  overdue: number;
  scheduled: number;
  meetings: number;
  cadences: number;
  completed: number;
  urgentNext2h: number;
  todayDeltaPct: number;
  meetingsToday: number;
}

export function computeCounts(activities: Activity[]): ActivityCounts {
  const now = Date.now();
  const todayStart = startOfDay(new Date()).getTime();
  const todayEnd = endOfDay(new Date()).getTime();
  const yStart = startOfDay(subDays(new Date(), 1)).getTime();
  const yEnd = endOfDay(subDays(new Date(), 1)).getTime();
  const next2h = now + 2 * 60 * 60 * 1000;

  let today = 0,
    overdue = 0,
    scheduled = 0,
    meetings = 0,
    cadences = 0,
    completed = 0,
    urgentNext2h = 0,
    yest = 0,
    meetingsToday = 0;

  for (const a of activities) {
    const t = new Date(a.due_at).getTime();
    const inToday = t >= todayStart && t <= todayEnd;
    if (inToday) today += 1;
    if (a.status === 'overdue') overdue += 1;
    if (a.status === 'scheduled' && t > now) scheduled += 1;
    if (a.type === 'meeting') {
      meetings += 1;
      if (inToday) meetingsToday += 1;
    }
    if (a.source === 'cadence_step') cadences += 1;
    if (a.status === 'completed' || a.status === 'cancelled' || a.status === 'failed') completed += 1;
    if (inToday && t >= now && t <= next2h && a.status !== 'completed')
      urgentNext2h += 1;
    if (t >= yStart && t <= yEnd) yest += 1;
  }

  const todayDeltaPct = yest === 0 ? (today > 0 ? 100 : 0) : Math.round(((today - yest) / yest) * 100);

  return {
    today,
    overdue,
    scheduled,
    meetings,
    cadences,
    completed,
    urgentNext2h,
    todayDeltaPct,
    meetingsToday,
  };
}

export function filterByTab(activities: Activity[], tab: string): Activity[] {
  const now = Date.now();
  const todayStart = startOfDay(new Date()).getTime();
  const todayEnd = endOfDay(new Date()).getTime();
  const isFinal = (s: ActivityStatus) => s === 'completed' || s === 'cancelled' || s === 'failed';
  switch (tab) {
    case 'today':
      return activities.filter((a) => {
        const t = new Date(a.due_at).getTime();
        return t >= todayStart && t <= todayEnd && !isFinal(a.status);
      });
    case 'overdue':
      return activities.filter((a) => a.status === 'overdue');
    case 'scheduled':
      return activities.filter(
        (a) => new Date(a.due_at).getTime() > todayEnd && !isFinal(a.status),
      );
    case 'meetings':
      return activities.filter((a) => a.type === 'meeting');
    case 'cadences':
      return activities.filter((a) => a.source === 'cadence_step');
    case 'done':
      return activities.filter((a) => a.status === 'completed' || a.status === 'cancelled' || a.status === 'failed');
    default:
      return activities;
  }
}

export function kanbanColumns(activities: Activity[]) {
  const now = Date.now();
  const todayStart = startOfDay(new Date()).getTime();
  const todayEnd = endOfDay(new Date()).getTime();
  const tomStart = startOfTomorrow().getTime();
  const tomEnd = endOfTomorrow().getTime();

  const cols: Record<string, Activity[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    upcoming: [],
    completed: [],
  };
  for (const a of activities) {
    const t = new Date(a.due_at).getTime();
    if (a.status === 'completed') cols.completed.push(a);
    else if (a.status === 'overdue') cols.overdue.push(a);
    else if (t >= todayStart && t <= todayEnd) cols.today.push(a);
    else if (t >= tomStart && t <= tomEnd) cols.tomorrow.push(a);
    else if (t > tomEnd) cols.upcoming.push(a);
  }
  return cols;
}
