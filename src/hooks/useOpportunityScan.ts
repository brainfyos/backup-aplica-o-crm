import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

import { toast } from 'sonner';

export interface ScanFilters {
  // inclusão
  product_ids?: string[];
  assigned_user_ids?: string[];
  agent_ids?: string[];
  tag_ids?: string[];
  sector_ids?: string[];
  channels?: string[];
  statuses?: string[];
  squad_ids?: string[];
  temperatures?: Array<'hot' | 'warm' | 'cold'>;
  min_score?: number;
  min_deal_value?: number;
  // exclusão
  exclude_product_ids?: string[];
  exclude_assigned_user_ids?: string[];
  exclude_agent_ids?: string[];
  exclude_tag_ids?: string[];
  exclude_sector_ids?: string[];
  exclude_channels?: string[];
  exclude_lead_ids?: string[];
  require_no_tags?: boolean;
  require_no_sector?: boolean;
  require_no_assigned?: boolean;
  // gerais
  inactivity_days_min?: number;
  inactivity_days_max?: number;
  min_client_messages?: number;
  include_ai_active?: boolean;
}

export interface ActionConfig {
  apply_tag_id?: string;
  create_task?: { enabled: boolean; due_in_hours?: number };
  notify_owner?: boolean;
  notify_admin?: boolean;
  transfer_to_user_id?: string;
}
export interface ActionsConfig {
  hot?: ActionConfig;
  warm?: ActionConfig;
  cold?: ActionConfig;
  lost?: ActionConfig;
}

export interface OpportunityScan {
  id: string;
  organization_id: string;
  triggered_by: string | null;
  trigger_type: string;
  status: string;
  filters: ScanFilters;
  actions_config: ActionsConfig;
  total_candidates: number;
  total_analyzed: number;
  hot_count: number;
  warm_count: number;
  cold_count: number;
  lost_count: number;
  potential_revenue: number;
  cost_cents: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  error_message: string | null;
}

export interface ScanItem {
  id: string;
  scan_id: string;
  conversation_id: string | null;
  lead_id: string | null;
  classification: 'hot' | 'warm' | 'cold' | 'lost';
  score: number;
  reason: string | null;
  signals: string[];
  suggested_action: string | null;
  followup_message: string | null;
  lead_snapshot: any;
  action_applied: boolean;
  created_at: string;
}

export function useOpportunityScans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['opportunity-scans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_scans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as OpportunityScan[];
    },
    enabled: !!user,
  });
}

export function useOpportunityScan(scanId: string | null) {
  const query = useQuery({
    queryKey: ['opportunity-scan', scanId],
    queryFn: async () => {
      if (!scanId) return null;
      const { data, error } = await supabase
        .from('opportunity_scans')
        .select('*')
        .eq('id', scanId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as OpportunityScan | null;
    },
    enabled: !!scanId,
    // SECURITY: substitui assinatura Realtime por polling para evitar
    // exposição de eventos entre organizações na tabela opportunity_scans.
    refetchInterval: (q) => {
      const status = (q.state.data as any)?.status;
      return status && status !== 'completed' && status !== 'failed' ? 3000 : false;
    },
  });

  return query;
}

export function useScanItems(scanId: string | null) {
  return useQuery({
    queryKey: ['opportunity-scan-items', scanId],
    queryFn: async () => {
      if (!scanId) return [];
      const { data, error } = await supabase
        .from('opportunity_scan_items')
        .select('*')
        .eq('scan_id', scanId)
        .order('score', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ScanItem[];
    },
    enabled: !!scanId,
    refetchInterval: 5000,
  });
}

export function useRunOpportunityScan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { filters: ScanFilters; actions_config: ActionsConfig; preview_only?: boolean }) => {
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user!.id).single();
      const { data, error } = await supabase.functions.invoke('opportunity-scan-run', {
        body: {
          organization_id: profile?.organization_id,
          triggered_by: user!.id,
          filters: params.filters,
          actions_config: params.actions_config,
          preview_only: params.preview_only,
        },
      });
      if (error) {
        // Tenta extrair mensagem do contexto (FunctionsHttpError vem com body em .context)
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === 'string' ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) detail = parsed.error;
          }
        } catch {}
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      if (!variables.preview_only) {
        toast.success('Análise iniciada — acompanhe o progresso em tempo real');
        qc.invalidateQueries({ queryKey: ['opportunity-scans'] });
      }
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

export function useOpportunitySchedules() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['opportunity-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_scan_schedules')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useUpsertSchedule() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user!.id).single();
      const row = {
        ...payload,
        organization_id: profile?.organization_id,
        created_by: user!.id,
      };
      if (payload.id) {
        const { error } = await supabase.from('opportunity_scan_schedules').update(row).eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('opportunity_scan_schedules').insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Agendamento salvo');
      qc.invalidateQueries({ queryKey: ['opportunity-schedules'] });
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('opportunity_scan_schedules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Agendamento removido');
      qc.invalidateQueries({ queryKey: ['opportunity-schedules'] });
    },
  });
}
