import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// ============================================================================
// VOICE AGENTS
// ============================================================================
export interface VoiceAgent {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  // Novo modelo: aponta para um product_agent existente
  product_agent_id: string | null;
  grok_voice_id: string | null;
  voice_settings: Record<string, unknown>;
  context_override: string | null;
  // Legado (fallback)
  objective: string | null;
  system_prompt: string | null;
  voice_option: string | null;
  language: string;
  provider: string;
  external_agent_id: string | null;
  tools: unknown[];
  tools_config: Record<string, any>;
  outcomes: Array<{ id: string; label: string; kind: string; screen_config?: any }>;
  is_active: boolean;
  is_inbound_default: boolean;
  public_slug: string | null;
  public_enabled: boolean;
  public_config: Record<string, any>;
  photo_url: string | null;
  display_name: string | null;
  role_title: string | null;
  theme: string;
  created_at: string;
  updated_at: string;
}

export function useVoiceAgents() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['voice-agents', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_agents' as any)
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VoiceAgent[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useSaveVoiceAgent() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<VoiceAgent> & { id?: string }) => {
      const payload: any = {
        organization_id: profile!.organization_id!,
        name: input.name,
        description: input.description ?? null,
        product_agent_id: input.product_agent_id ?? null,
        grok_voice_id: input.grok_voice_id ?? null,
        voice_settings: input.voice_settings ?? {},
        context_override: input.context_override ?? null,
        // Legado — preenchidos só se vierem
        objective: input.objective ?? null,
        system_prompt: input.system_prompt ?? null,
        voice_option: input.voice_option ?? input.grok_voice_id ?? 'default',
        language: input.language ?? 'pt-BR',
        provider: input.provider ?? 'xai',
        external_agent_id: input.external_agent_id ?? null,
        tools: input.tools ?? [],
        tools_config: (input as any).tools_config ?? {},
        outcomes: (input as any).outcomes ?? [],
        is_active: input.is_active ?? true,
        is_inbound_default: input.is_inbound_default ?? false,
        public_slug: (input as any).public_slug || null,
        public_enabled: (input as any).public_enabled ?? false,
        public_config: (input as any).public_config ?? {},
        photo_url: (input as any).photo_url ?? null,
        display_name: (input as any).display_name ?? null,
        role_title: (input as any).role_title ?? null,
        theme: (input as any).theme ?? 'phone',
      };
      if (input.id) {
        const { error } = await supabase.from('voice_agents' as any).update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('voice_agents' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-agents'] });
      toast.success('Perfil de voz salvo');
    },
    onError: (e: Error) => toast.error(`Falha ao salvar: ${e.message}`),
  });
}

export function useDeleteVoiceAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('voice_agents' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-agents'] });
      toast.success('Agente removido');
    },
  });
}

// ============================================================================
// CALL LOGS
// ============================================================================
export interface CallLog {
  id: string;
  organization_id: string;
  lead_id: string | null;
  voice_agent_id: string | null;
  campaign_id: string | null;
  provider: string;
  direction: 'outbound' | 'inbound';
  from_number: string | null;
  to_number: string | null;
  call_sid: string | null;
  status: string;
  status_reason: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  cost_usd: number | null;
  recording_url: string | null;
  transcription_text: string | null;
  summary: string | null;
  sentiment: string | null;
  key_points: unknown[];
  next_actions: unknown[];
  metadata: Record<string, unknown>;
  initiated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCallLogs(filters?: { leadId?: string; status?: string; direction?: string }) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['call-logs', profile?.organization_id, filters],
    queryFn: async () => {
      let q = supabase
        .from('call_logs' as any)
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (filters?.leadId) q = q.eq('lead_id', filters.leadId);
      if (filters?.status) q = q.eq('status', filters.status);
      if (filters?.direction) q = q.eq('direction', filters.direction);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CallLog[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCallLog(id?: string) {
  return useQuery({
    queryKey: ['call-log', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('call_logs' as any).select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as unknown as CallLog | null;
    },
    enabled: !!id,
  });
}

// ============================================================================
// START CALL
// ============================================================================
export function useStartVoiceCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lead_id: string;
      product_agent_id: string;
      grok_voice_id?: string | null;
      context_override?: string | null;
      voice_context_id?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('xai-voice-call-start', { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { call_log_id: string; call_sid: string | null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      toast.success('Ligação iniciada — a IA está discando');
    },
    onError: (e: Error) => toast.error(`Falha ao iniciar ligação: ${e.message}`),
  });
}

// ============================================================================
// VOICE CONTEXTS
// ============================================================================
export interface VoiceContext {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  content: string;
  product_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export function useVoiceContexts() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['voice-contexts', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_contexts' as any)
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VoiceContext[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useSaveVoiceContext() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<VoiceContext> & { id?: string }) => {
      const payload: any = {
        organization_id: profile!.organization_id!,
        name: input.name,
        description: input.description ?? null,
        content: input.content ?? '',
        product_id: input.product_id ?? null,
        tags: input.tags ?? [],
      };
      if (input.id) {
        const { error } = await supabase.from('voice_contexts' as any).update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('voice_contexts' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-contexts'] });
      toast.success('Contexto salvo');
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });
}

export function useDeleteVoiceContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('voice_contexts' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-contexts'] });
      toast.success('Contexto removido');
    },
  });
}

// ============================================================================
// VOICE CAMPAIGNS
// ============================================================================
export interface VoiceAudienceFilters {
  tag_ids?: string[];
  source_ids?: string[];
  stage_ids?: string[];
  product_id?: string | null;
  created_from?: string | null;
  created_to?: string | null;
  city?: string;
  state?: string;
}

export interface VoicePostCallRule {
  outcome: string; // e.g. 'answered' | 'no_answer' | 'chose_meeting' | 'chose_checkout' | 'lost'
  add_tag_ids?: string[];
  remove_tag_ids?: string[];
  move_stage_id?: string | null;
  create_task_title?: string | null;
  enroll_cadence_id?: string | null;
}

export interface VoiceCampaign {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  voice_agent_id: string | null;
  voice_context_id: string | null;
  product_id: string | null;
  context_id: string | null;
  audience_filters: VoiceAudienceFilters;
  exclusion_filters: VoiceAudienceFilters;
  dial_numbers: string[];
  dial_strategy: 'round_robin' | 'random' | 'weighted';
  business_hours_only: boolean;
  timezone: string;
  scheduled_at: string | null;
  post_call_actions: { rules?: VoicePostCallRule[] };
  source_webhook_id: string | null;
  totals: { audience?: number; excluded?: number; will_receive?: number };
  lead_filter: Record<string, unknown>;
  schedule: Record<string, unknown>;
  max_concurrent: number;
  max_attempts: number;
  retry_interval_minutes: number;
  status: 'draft' | 'running' | 'paused' | 'completed';
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useVoiceCampaigns() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['voice-campaigns', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_campaigns' as any)
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VoiceCampaign[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useVoiceCampaign(id?: string) {
  return useQuery({
    queryKey: ['voice-campaign', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_campaigns' as any)
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as VoiceCampaign | null;
    },
    enabled: !!id,
  });
}

export function useSaveVoiceCampaign() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<VoiceCampaign> & { id?: string }) => {
      const payload: any = {
        organization_id: profile!.organization_id!,
        name: input.name,
        description: input.description ?? null,
        voice_agent_id: input.voice_agent_id ?? null,
        voice_context_id: input.voice_context_id ?? null,
        product_id: input.product_id ?? null,
        context_id: input.context_id ?? null,
        audience_filters: input.audience_filters ?? {},
        exclusion_filters: input.exclusion_filters ?? {},
        dial_numbers: input.dial_numbers ?? [],
        dial_strategy: input.dial_strategy ?? 'round_robin',
        business_hours_only: input.business_hours_only ?? false,
        timezone: input.timezone ?? 'America/Sao_Paulo',
        scheduled_at: input.scheduled_at ?? null,
        post_call_actions: input.post_call_actions ?? {},
        totals: input.totals ?? {},
        lead_filter: input.lead_filter ?? {},
        schedule: input.schedule ?? {},
        max_concurrent: input.max_concurrent ?? 3,
        max_attempts: input.max_attempts ?? 2,
        retry_interval_minutes: input.retry_interval_minutes ?? 60,
        status: input.status ?? 'draft',
      };
      if (input.id) {
        const { error } = await supabase.from('voice_campaigns' as any).update(payload).eq('id', input.id);
        if (error) throw error;
        return { id: input.id };
      }
      const { data, error } = await supabase.from('voice_campaigns' as any).insert(payload).select('id').single();
      if (error) throw error;
      return data as unknown as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-campaigns'] });
      toast.success('Campanha salva');
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });
}

// Contagem prévia de audiência via RPC
export function useVoiceAudienceCount(filters: VoiceAudienceFilters, exclusions: VoiceAudienceFilters) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['voice-audience-count', profile?.organization_id, filters, exclusions],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('count_voice_campaign_audience' as any, {
        p_org: profile!.organization_id!,
        p_filters: filters as any,
        p_exclusions: exclusions as any,
      });
      if (error) throw error;
      const row = (data as any[])?.[0] || {};
      return {
        audience: Number(row.audience || 0),
        excluded: Number(row.excluded || 0),
        will_receive: Number(row.will_receive || 0),
      };
    },
    enabled: !!profile?.organization_id,
  });
}

// Journeys de uma campanha (timeline unificada)
export interface VoiceCampaignJourney {
  id: string;
  campaign_id: string | null;
  lead_id: string | null;
  target_id: string | null;
  call_log_id: string | null;
  stage: string;
  chosen_channel: string | null;
  chosen_payload: Record<string, unknown>;
  utm: Record<string, unknown>;
  notes: string | null;
  created_at: string;
}

export function useVoiceCampaignJourney(campaignId?: string, leadId?: string) {
  return useQuery({
    queryKey: ['voice-journey', campaignId, leadId],
    queryFn: async () => {
      let q = supabase
        .from('voice_campaign_journeys' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (campaignId) q = q.eq('campaign_id', campaignId);
      if (leadId) q = q.eq('lead_id', leadId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VoiceCampaignJourney[];
    },
    enabled: !!(campaignId || leadId),
  });
}

export function useDeleteVoiceCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('voice_campaigns' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-campaigns'] });
      toast.success('Campanha removida');
    },
  });
}

export function useSetCampaignStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: VoiceCampaign['status'] }) => {
      const patch: any = { status: input.status };
      if (input.status === 'running') patch.started_at = new Date().toISOString();
      if (input.status === 'completed') patch.finished_at = new Date().toISOString();
      const { error } = await supabase.from('voice_campaigns' as any).update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['voice-campaigns'] }),
  });
}

// Targets
export interface VoiceCampaignTarget {
  id: string;
  campaign_id: string;
  organization_id: string;
  lead_id: string | null;
  phone: string;
  status: 'pending' | 'calling' | 'completed' | 'failed' | 'skipped';
  attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
  scheduled_for: string | null;
  created_at: string;
}

export function useCampaignTargets(campaignId?: string) {
  return useQuery({
    queryKey: ['voice-campaign-targets', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_campaign_targets' as any)
        .select('*')
        .eq('campaign_id', campaignId!)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as VoiceCampaignTarget[];
    },
    enabled: !!campaignId,
  });
}

export function useAddCampaignTargets() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { campaign_id: string; leads: Array<{ id: string; phone: string }> }) => {
      const rows = input.leads
        .filter((l) => l.phone)
        .map((l) => ({
          campaign_id: input.campaign_id,
          organization_id: profile!.organization_id!,
          lead_id: l.id,
          phone: l.phone,
          status: 'pending',
        }));
      if (!rows.length) throw new Error('Nenhum lead com telefone para adicionar');
      const { error } = await supabase.from('voice_campaign_targets' as any).insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ['voice-campaign-targets'] });
      toast.success(`${n} lead(s) adicionado(s) à campanha`);
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });
}

// ============================================================================
// VOICE ACTIONS (tarefas pós-ligação)
// ============================================================================
export interface VoiceAction {
  id: string;
  organization_id: string;
  call_log_id: string;
  lead_id: string | null;
  action_type: string;
  title: string;
  description: string | null;
  due_at: string | null;
  payload: Record<string, unknown>;
  status: string;
  executed_at: string | null;
  created_at: string;
}

export function useVoiceActions(filters?: { leadId?: string; callLogId?: string }) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['voice-actions', profile?.organization_id, filters],
    queryFn: async () => {
      let q = supabase
        .from('voice_actions' as any)
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (filters?.leadId) q = q.eq('lead_id', filters.leadId);
      if (filters?.callLogId) q = q.eq('call_log_id', filters.callLogId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VoiceAction[];
    },
    enabled: !!profile?.organization_id,
  });
}
