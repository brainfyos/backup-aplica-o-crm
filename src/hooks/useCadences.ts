import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type CadenceStatus = 'draft' | 'active' | 'paused' | 'archived';

export type Cadence = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  objective: string | null;
  agent_id: string | null;
  status: CadenceStatus;
  entry_filters: any;
  exclusion_filters: any;
  stop_rules: any;
  stop_actions: any;
  execution_window: any;
  channel: string;
  totals: any;
  last_executed_at: string | null;
  created_at: string;
};

export type CadenceStep = {
  id: string;
  cadence_id: string;
  order_index: number;
  name: string;
  objective: string | null;
  execute_immediately: boolean;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  delay_from: 'previous_step' | 'enrollment';
  context_id: string | null;
  context_inline: string | null;
  tone: string | null;
  conditions: any;
};

export type CadenceEnrollmentStats = {
  active: number; completed: number; stopped: number; paused: number; total: number;
};

export function useCadences() {
  const { user } = useAuth();
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [stats, setStats] = useState<Record<string, CadenceEnrollmentStats>>({});
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('organization_id').eq('id', user.id).maybeSingle()
      .then(({ data }) => setOrgId((data as any)?.organization_id ?? null));
  }, [user]);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from('cadences' as any)
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    const list = (data as any[]) ?? [];
    setCadences(list as Cadence[]);

    if (list.length) {
      const ids = list.map((c) => c.id);
      const { data: enrollments } = await supabase
        .from('cadence_enrollments' as any)
        .select('cadence_id, status')
        .in('cadence_id', ids);
      const agg: Record<string, CadenceEnrollmentStats> = {};
      ids.forEach((id) => { agg[id] = { active: 0, completed: 0, stopped: 0, paused: 0, total: 0 }; });
      (enrollments as any[] ?? []).forEach((e) => {
        const a = agg[e.cadence_id];
        if (!a) return;
        a.total++;
        if ((a as any)[e.status] !== undefined) (a as any)[e.status]++;
      });
      setStats(agg);
    } else {
      setStats({});
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    const ch = supabase
      .channel('cadences-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cadences', filter: `organization_id=eq.${orgId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, refresh]);

  return { cadences, stats, loading, refresh, orgId };
}

export function useCadenceSteps(cadenceId: string | null) {
  const [steps, setSteps] = useState<CadenceStep[]>([]);

  const refresh = useCallback(async () => {
    if (!cadenceId) { setSteps([]); return; }
    const { data } = await supabase
      .from('cadence_steps' as any)
      .select('*')
      .eq('cadence_id', cadenceId)
      .order('order_index', { ascending: true });
    setSteps((data as any[]) ?? [] as CadenceStep[]);
  }, [cadenceId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { steps, refresh };
}
