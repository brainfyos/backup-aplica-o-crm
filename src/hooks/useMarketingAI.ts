import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type MarketingFinding = {
  id: string;
  organization_id: string;
  scope: 'campaign' | 'adset' | 'ad' | 'account' | 'operation';
  scope_ref_id: string | null;
  scope_ref_label: string | null;
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string | null;
  evidence: any;
  metrics: any;
  period_start: string | null;
  period_end: string | null;
  status: 'open' | 'dismissed' | 'resolved';
  created_at: string;
};

export type MarketingRecommendation = {
  id: string;
  organization_id: string;
  finding_id: string | null;
  action_type: string;
  target_type: 'campaign' | 'adset' | 'ad' | 'account';
  target_ref_id: string | null;
  target_label: string | null;
  current_state: any;
  proposed_state: any;
  rationale: string | null;
  data_used: any;
  risk: 'low' | 'medium' | 'high';
  expected_result: string | null;
  status: 'pending' | 'approved' | 'dismissed' | 'applied' | 'failed';
  created_at: string;
};

const UNVERIFIED_SALES_FINDINGS = new Set(['roas_high', 'spend_no_sales', 'no_conversion_tracking']);
const usesUnverifiedSales = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  return ['purchases', 'revenue', 'roas'].some((key) => Object.prototype.hasOwnProperty.call(value, key));
};

export function useMarketingFindings(status: 'open' | 'dismissed' | 'resolved' = 'open') {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['marketing-ai-findings', orgId, status],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketing_ai_findings')
        .select('*').eq('organization_id', orgId!).eq('status', status)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return ((data ?? []) as MarketingFinding[]).filter((finding) => !UNVERIFIED_SALES_FINDINGS.has(finding.category));
    },
  });
}

export function useMarketingRecommendations(status: MarketingRecommendation['status'] = 'pending') {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['marketing-ai-recs', orgId, status],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketing_ai_recommendations')
        .select('*').eq('organization_id', orgId!).eq('status', status)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return ((data ?? []) as MarketingRecommendation[]).filter((recommendation) => !usesUnverifiedSales(recommendation.data_used));
    },
  });
}

export function useAnalyzeMarketing() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation<any, Error, number | void>({
    mutationFn: async (windowDays) => {
      if (!profile?.organization_id) throw new Error('sem organização');
      const days = typeof windowDays === 'number' ? windowDays : 14;
      const { data, error } = await supabase.functions.invoke('marketing-ai-analyze', {
        body: { organization_id: profile.organization_id, window_days: days },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Análise concluída: ${data?.findings_created ?? 0} diagnósticos, ${data?.recommendations_created ?? 0} recomendações`);
      qc.invalidateQueries({ queryKey: ['marketing-ai-findings'] });
      qc.invalidateQueries({ queryKey: ['marketing-ai-recs'] });
    },
    onError: (e: any) => toast.error(`Falha na análise: ${e?.message ?? e}`),
  });
}

export function useUpdateFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MarketingFinding['status'] }) => {
      const { error } = await supabase.from('marketing_ai_findings').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketing-ai-findings'] }),
  });
}

export function useUpdateRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MarketingRecommendation['status'] }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('marketing_ai_recommendations')
        .update({ status, decided_by: u.user?.id ?? null, decided_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketing-ai-recs'] }),
  });
}

export async function askCopilot(orgId: string, messages: { role: 'user' | 'assistant'; content: string }[]) {
  const { data, error } = await supabase.functions.invoke('marketing-ai-copilot', {
    body: { organization_id: orgId, messages },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return (data as any).content as string;
}

export type MarketingExecution = {
  id: string;
  organization_id: string;
  recommendation_id: string | null;
  action_type: string;
  target_type: 'campaign' | 'adset' | 'ad' | 'account';
  target_ref_id: string | null;
  target_label: string | null;
  previous_state: any;
  applied_state: any;
  status: 'queued' | 'success' | 'failed' | 'reverted';
  error: string | null;
  provider: string;
  provider_response: any;
  executed_by: string | null;
  executed_at: string;
  reverted_at: string | null;
  reverted_by: string | null;
  revert_of: string | null;
};

export function useMarketingExecutions(filter: 'recent' | 'history' = 'recent') {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['marketing-ai-executions', orgId, filter],
    enabled: !!orgId,
    queryFn: async () => {
      const q = supabase.from('marketing_ai_executions')
        .select('*').eq('organization_id', orgId!)
        .order('executed_at', { ascending: false })
        .limit(filter === 'recent' ? 30 : 200);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MarketingExecution[];
    },
  });
}

export function useApplyRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recommendation_id: string) => {
      const { data, error } = await supabase.functions.invoke('marketing-ai-execute', {
        body: { mode: 'apply', recommendation_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { ok: boolean; execution: MarketingExecution };
    },
    onSuccess: (data) => {
      if (data.ok) toast.success('Recomendação aplicada na Meta');
      else toast.error('Meta recusou a execução (veja Execuções)');
      qc.invalidateQueries({ queryKey: ['marketing-ai-recs'] });
      qc.invalidateQueries({ queryKey: ['marketing-ai-executions'] });
    },
    onError: (e: any) => toast.error(`Falha ao aplicar: ${e?.message ?? e}`),
  });
}

export type MetaDirectAction = {
  action_type: 'set_status' | 'set_budget' | 'duplicate';
  target_type: 'campaign' | 'adset' | 'ad';
  target_ref_id: string;
  target_label?: string | null;
  proposed_state?: Record<string, unknown>;
};

export function useMetaDirectAction() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (action: MetaDirectAction) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada.');
      const { data, error } = await supabase.functions.invoke('marketing-ai-execute', {
        body: {
          mode: 'direct',
          organization_id: profile.organization_id,
          ...action,
        },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? 'A Meta recusou a alteração.');
      return data as { ok: true; execution: MarketingExecution; created_campaign_id?: string | null };
    },
    onSuccess: (data, action) => {
      const message = action.action_type === 'duplicate'
        ? 'Campanha duplicada e mantida pausada para revisão.'
        : action.action_type === 'set_budget'
        ? 'Orçamento atualizado na Meta.'
        : action.proposed_state?.status === 'ACTIVE'
        ? 'Campanha ativada na Meta.'
        : 'Campanha pausada na Meta.';
      toast.success(message);
      window.dispatchEvent(new CustomEvent('vendus:marketing-data-changed'));
      qc.invalidateQueries({ queryKey: ['marketing-ai-executions'] });
      qc.invalidateQueries({ queryKey: ['marketing-shell'] });
    },
    onError: (e: any) => toast.error(`Não foi possível concluir: ${e?.message ?? e}`),
  });
}

export function useRevertExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (execution_id: string) => {
      const { data, error } = await supabase.functions.invoke('marketing-ai-execute', {
        body: { mode: 'revert', execution_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      if (data.ok) toast.success('Execução revertida');
      else toast.error('Não foi possível reverter (veja Execuções)');
      qc.invalidateQueries({ queryKey: ['marketing-ai-executions'] });
      qc.invalidateQueries({ queryKey: ['marketing-ai-recs'] });
    },
    onError: (e: any) => toast.error(`Falha ao reverter: ${e?.message ?? e}`),
  });
}
