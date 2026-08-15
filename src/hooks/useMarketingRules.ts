import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type RuleAction =
  | { type: 'pause' }
  | { type: 'activate' }
  | { type: 'increase_budget'; pct: number }
  | { type: 'decrease_budget'; pct: number };

export type RuleCondition = {
  metric: 'spend' | 'clicks' | 'impressions' | 'leads' | 'purchases' | 'revenue' | 'roas' | 'ctr' | 'cpl' | 'cpc' | 'cpm';
  operator: '>=' | '<=' | '>' | '<' | '==' | '!=';
  value: number;
};

export const UNVERIFIED_SALES_METRICS = new Set<RuleCondition['metric']>(['purchases', 'revenue', 'roas']);

export type MarketingRule = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  mode: 'suggest' | 'auto';
  scope: 'campaign' | 'adset' | 'ad';
  conditions: RuleCondition[];
  window_days: number;
  action: RuleAction;
  cooldown_hours: number;
  last_run_at: string | null;
  last_match_count: number;
  created_at: string;
  updated_at: string;
};

export type SafetyLimits = {
  organization_id: string;
  max_budget_change_pct: number;
  max_daily_spend_cents: number;
  allow_auto_pause: boolean;
  allow_auto_budget: boolean;
  allow_auto_activate: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  timezone: string;
  blocked_campaign_ids: string[];
  max_actions_per_day: number;
};

export type RuleRun = {
  id: string;
  rule_id: string;
  organization_id: string;
  evaluated_at: string;
  matched_count: number;
  recommendations_created: number;
  executions_created: number;
  skipped_count: number;
  skipped_reasons: any;
  triggered_by: 'cron' | 'manual';
};

const DEFAULT_LIMITS: Omit<SafetyLimits, 'organization_id'> = {
  max_budget_change_pct: 30,
  max_daily_spend_cents: 0,
  allow_auto_pause: true,
  allow_auto_budget: false,
  allow_auto_activate: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: 'America/Sao_Paulo',
  blocked_campaign_ids: [],
  max_actions_per_day: 10,
};

export function useMarketingRules() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['marketing-ai-rules', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketing_ai_rules' as any)
        .select('*').eq('organization_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MarketingRule[];
    },
  });
}

export function useSafetyLimits() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['marketing-ai-safety', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<SafetyLimits> => {
      const { data, error } = await supabase.from('marketing_ai_safety_limits' as any)
        .select('*').eq('organization_id', orgId!).maybeSingle();
      if (error && (error as any).code !== 'PGRST116') throw error;
      return (data as unknown as SafetyLimits) ?? { organization_id: orgId!, ...DEFAULT_LIMITS };
    },
  });
}

export function useSaveRule() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (rule: Partial<MarketingRule> & { id?: string }) => {
      if (!profile?.organization_id) throw new Error('sem organização');
      if ((rule.conditions ?? []).some((condition) => UNVERIFIED_SALES_METRICS.has(condition.metric))) {
        throw new Error('Vendas, receita e ROAS estão bloqueados até a integração com checkout/CRM ser validada.');
      }
      const payload: any = {
        organization_id: profile.organization_id,
        name: rule.name, description: rule.description ?? null,
        enabled: rule.enabled ?? true,
        mode: rule.mode ?? 'suggest',
        scope: rule.scope ?? 'campaign',
        conditions: rule.conditions ?? [],
        window_days: rule.window_days ?? 7,
        action: rule.action,
        cooldown_hours: rule.cooldown_hours ?? 24,
      };
      if (rule.id) {
        const { error } = await supabase.from('marketing_ai_rules' as any).update(payload).eq('id', rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('marketing_ai_rules' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Regra salva');
      qc.invalidateQueries({ queryKey: ['marketing-ai-rules'] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
}

export function useToggleRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from('marketing_ai_rules' as any).update({ enabled }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketing-ai-rules'] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_ai_rules' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Regra removida');
      qc.invalidateQueries({ queryKey: ['marketing-ai-rules'] });
    },
  });
}

export function useSaveSafetyLimits() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (limits: Partial<SafetyLimits>) => {
      if (!profile?.organization_id) throw new Error('sem organização');
      const { error } = await supabase.from('marketing_ai_safety_limits' as any)
        .upsert({ organization_id: profile.organization_id, ...limits }, { onConflict: 'organization_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Limites atualizados');
      qc.invalidateQueries({ queryKey: ['marketing-ai-safety'] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
}

export function useRunRulesNow() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (rule_id?: string) => {
      const { data, error } = await supabase.functions.invoke('marketing-ai-rules-tick', {
        body: { organization_id: profile?.organization_id, rule_id, triggered_by: 'manual' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as any;
    },
    onSuccess: (d) => {
      toast.success(`Regras avaliadas: ${d.matches} matches, ${d.recommendations} recs, ${d.executions} execuções`);
      qc.invalidateQueries({ queryKey: ['marketing-ai-rules'] });
      qc.invalidateQueries({ queryKey: ['marketing-ai-recs'] });
      qc.invalidateQueries({ queryKey: ['marketing-ai-executions'] });
      qc.invalidateQueries({ queryKey: ['marketing-ai-rule-runs'] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
}

export function useRuleRuns(rule_id?: string) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['marketing-ai-rule-runs', orgId, rule_id],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from('marketing_ai_rule_runs' as any).select('*')
        .eq('organization_id', orgId!)
        .order('evaluated_at', { ascending: false }).limit(50);
      if (rule_id) q = q.eq('rule_id', rule_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RuleRun[];
    },
  });
}
