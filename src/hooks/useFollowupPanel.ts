import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type FollowupFilters = {
  from: string; // ISO
  to: string;   // ISO
  agentId?: string | null;
  status?: FollowupStatusKey | 'all';
};

export type FollowupStatusKey =
  | 'waiting_next'
  | 'waiting_reply'
  | 'paused'
  | 'cancelled'
  | 'closed'
  | 'recovered';

export type PanelStats = {
  kpis: {
    leads_in_followup: number;
    waiting_next: number;
    sent_today: number;
    recovered: number;
    sent_in_period: number;
    rulers_closed: number;
  };
  recovery_by_attempt: Array<{ attempt: number; sent: number; replied: number; rate: number }>;
  sent_trend_7d: Array<{ day: string; count: number }>;
  active_status_breakdown: { waiting_next: number; waiting_reply: number; paused: number; others: number };
  upcoming_buckets: { in_5m: number; in_15m: number; in_30m: number; in_1h: number; in_2h: number; after_24h: number };
};

export function useFollowupPanelStats(filters: FollowupFilters) {
  return useQuery({
    queryKey: ['followup-panel-stats', filters.from, filters.to, filters.agentId ?? null],
    queryFn: async (): Promise<PanelStats> => {
      const { data, error } = await supabase.rpc('get_followup_panel_stats' as never, {
        p_from: filters.from,
        p_to: filters.to,
        p_agent_id: filters.agentId ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as PanelStats;
    },
    refetchInterval: 90_000,
  });
}

export type ActiveLeadRow = {
  id: string;
  lead_id: string;
  agent_id: string | null;
  status: string;
  followup_enabled: boolean;
  ruler_closed: boolean;
  next_followup_at: string | null;
  last_outreach_at: string | null;
  last_attempt_executed: number;
  max_followups: number | null;
  followup_intervals_minutes: number[] | null;
  error_message: string | null;
  lead: { name: string | null; phone: string | null } | null;
  agent: { name: string | null } | null;
};

export function useFollowupActiveLeads(filters: FollowupFilters) {
  return useQuery({
    queryKey: ['followup-active-leads', filters.agentId ?? null, filters.status ?? 'all'],
    queryFn: async (): Promise<ActiveLeadRow[]> => {
      let q = supabase
        .from('ai_outreach_queue')
        .select(
          'id, lead_id, agent_id, status, followup_enabled, ruler_closed, next_followup_at, last_outreach_at, last_attempt_executed, max_followups, followup_intervals_minutes, error_message, lead:leads(name, phone), agent:product_agents(name)'
        )
        .order('next_followup_at', { ascending: true, nullsFirst: false })
        .limit(100);

      if (filters.agentId) q = q.eq('agent_id', filters.agentId);

      const status = filters.status ?? 'all';
      const nowIso = new Date().toISOString();
      switch (status) {
        case 'waiting_next':
          q = q.eq('ruler_closed', false).eq('followup_enabled', true).gt('next_followup_at', nowIso);
          break;
        case 'waiting_reply':
          q = q.eq('ruler_closed', false).eq('followup_enabled', true).lte('next_followup_at', nowIso);
          break;
        case 'paused':
          q = q.eq('ruler_closed', false).eq('followup_enabled', false).is('error_message', null);
          break;
        case 'cancelled':
          q = q.eq('ruler_closed', true).eq('error_message', 'cancelled_by_user');
          break;
        case 'closed':
          q = q.eq('ruler_closed', true);
          break;
        case 'recovered':
          q = q.eq('status', 'replied');
          break;
        case 'all':
        default:
          q = q.eq('ruler_closed', false);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as ActiveLeadRow[]) ?? [];
    },
    refetchInterval: 90_000,
  });
}

export function useFollowupRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('followup-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_outreach_queue' }, () => {
        qc.invalidateQueries({ queryKey: ['followup-panel-stats'] });
        qc.invalidateQueries({ queryKey: ['followup-active-leads'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);
}

export function useFollowupActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['followup-panel-stats'] });
    qc.invalidateQueries({ queryKey: ['followup-active-leads'] });
  };

  const pause = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_outreach_queue')
        .update({ followup_enabled: false, next_followup_at: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Follow-up pausado'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Erro ao pausar'),
  });

  const resume = useMutation({
    mutationFn: async (row: ActiveLeadRow) => {
      const intervals = row.followup_intervals_minutes ?? [15, 120, 1440];
      const idx = Math.min(row.last_attempt_executed, intervals.length - 1);
      const delayMin = intervals[idx] ?? 60;
      const next = new Date(Date.now() + delayMin * 60_000).toISOString();
      const { error } = await supabase
        .from('ai_outreach_queue')
        .update({ followup_enabled: true, next_followup_at: next })
        .eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Follow-up retomado'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Erro ao retomar'),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_outreach_queue')
        .update({
          status: 'completed',
          ruler_closed: true,
          followup_enabled: false,
          next_followup_at: null,
          error_message: 'cancelled_by_user',
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Follow-up cancelado'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Erro ao cancelar'),
  });

  return { pause, resume, cancel };
}
