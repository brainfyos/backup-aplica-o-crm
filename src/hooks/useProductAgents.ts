import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductAgent } from '@/types/agents';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function useProductAgents(productId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['product-agents', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_agents')
        .select('*')
        .eq('product_id', productId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ProductAgent[];
    },
    enabled: !!productId && !!profile,
  });
}

export interface AgentWithProduct extends ProductAgent {
  product?: { id: string; name: string } | null;
}

export function useAllAgents() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['all-agents', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_agents')
        .select('*, product:products(id, name)')
        .eq('organization_id', profile!.organization_id!)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as AgentWithProduct[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useProductAgent(agentId: string) {
  return useQuery({
    queryKey: ['product-agent', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_agents')
        .select('*')
        .eq('id', agentId)
        .single();

      if (error) throw error;
      return data as ProductAgent;
    },
    enabled: !!agentId,
  });
}

// Whitelist of real columns in product_agents (source of truth = DB).
// Any field outside this set is dropped before insert/update to avoid
// "column does not exist" errors when extra UI state leaks into formData.
const PRODUCT_AGENTS_COLUMNS = new Set<string>([
  'id', 'organization_id', 'product_id', 'created_by', 'created_at', 'updated_at',
  'name', 'description', 'avatar_url', 'agent_type', 'primary_objective',
  'can_do', 'cannot_do', 'handoff_triggers', 'end_conversation_triggers',
  'tone_style', 'message_style', 'always_end_with_question', 'additional_prompt',
  'required_phrases', 'prohibited_phrases',
  'auto_tag_leads', 'default_tags',
  'can_update_pipeline', 'can_create_tasks', 'can_schedule_meetings',
  'can_apply_tags', 'can_update_lead', 'can_send_emails', 'can_send_materials',
  'can_trigger_flows', 'can_transfer', 'can_notify', 'can_add_notes',
  'can_start_cadence', 'can_qualify', 'qualification_schema',
  'never_ask_email',
  'tool_configs',
  'active_in_funnels', 'active_in_chat', 'active_in_widget', 'active_in_inbox',
  'active_in_copilot', 'active_in_whatsapp', 'active_in_instagram', 'active_in_facebook',
  'is_active', 'is_default',
  'activation_keywords', 'activation_phrases', 'activation_priority', 'activation_scope',
  'takeover_on_match', 'evolution_instance_id', 'humanization',
  'allowed_event_type_ids', 'default_schedule_user_id',
  'booking_notification_user_ids', 'booking_notify_org_admins',
  'enable_audio_transcription', 'enable_image_vision',
  'handoff_delay_seconds', 'handoff_include_summary',
  'handoff_incoming_message', 'handoff_outgoing_message',
  'message_delay_seconds',
  'quick_menu_intro', 'quick_menu_invalid_message', 'quick_menu_mode', 'quick_menu_options',
  'welcome_enabled', 'welcome_message',
  // Modo voz / OpenAI Realtime
  'voice_mode_enabled', 'voice_behavior_prompt', 'voice_max_sentences', 'voice_max_seconds',
  'voice_always_end_with_question', 'voice_show_tools_early', 'voice_max_call_minutes',
  'voice_specific_rules', 'voice_provider', 'openai_voice_id', 'default_grok_voice_id',
  'voice_settings', 'voice_enabled',
  // Follow-up automático por agente
  'followup_enabled', 'followup_max_attempts', 'followup_intervals_minutes',
  'followup_tone', 'followup_extra_instructions', 'followup_respect_business_hours',
  'followup_stop_on_human', 'followup_stop_on_booking', 'followup_channels',
  'followup_attempt_hints',
]);

function pickAgentFields<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (PRODUCT_AGENTS_COLUMNS.has(k)) out[k] = v;
  }
  return out as Partial<T>;
}

// Back-compat alias (older code references this name)
const stripNonAgentFields = pickAgentFields;

/**
 * Sincroniza a tabela product_agent_connections com a lista vinda do form.
 * Faz delete-all + insert para simplicidade (lista pequena).
 */
async function syncAgentConnections(
  agentId: string,
  organizationId: string,
  connections?: Array<{ type: 'evolution' | 'meta_whatsapp' | 'instagram'; id: string }>
) {
  if (!connections) return; // undefined = não mexer
  await supabase.from('product_agent_connections').delete().eq('agent_id', agentId);
  if (connections.length === 0) return;
  const rows = connections.map((c) => ({
    agent_id: agentId,
    connection_type: c.type,
    connection_id: c.id,
    organization_id: organizationId,
  }));
  const { error } = await supabase.from('product_agent_connections').insert(rows);
  if (error) console.error('[syncAgentConnections] insert error', error);
}


export function useCreateAgent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (agentRaw: Partial<ProductAgent>) => {
      if (!profile?.organization_id) throw new Error('Organization not found');

      const agent = stripNonAgentFields(agentRaw);
      const insertData = {
        name: agent.name || '',
        product_id: agent.product_id ?? null,
        organization_id: profile.organization_id,
        created_by: profile.id,
        primary_objective: agent.primary_objective || '',
        agent_type: agent.agent_type || 'custom',
        description: agent.description,
        avatar_url: agent.avatar_url,
        can_do: agent.can_do || [],
        cannot_do: agent.cannot_do || [],
        handoff_triggers: agent.handoff_triggers || [],
        end_conversation_triggers: agent.end_conversation_triggers || [],
        tone_style: agent.tone_style || 'friendly',
        message_style: agent.message_style || 'balanced',
        always_end_with_question: agent.always_end_with_question ?? true,
        additional_prompt: agent.additional_prompt,
        required_phrases: agent.required_phrases || [],
        prohibited_phrases: agent.prohibited_phrases || [],
        auto_tag_leads: agent.auto_tag_leads ?? true,
        default_tags: agent.default_tags || [],
        can_update_pipeline: agent.can_update_pipeline ?? true,
        can_create_tasks: agent.can_create_tasks ?? true,
        can_schedule_meetings: agent.can_schedule_meetings ?? true,
        can_apply_tags: agent.can_apply_tags ?? false,
        can_update_lead: agent.can_update_lead ?? false,
        can_send_emails: agent.can_send_emails ?? false,
        can_send_materials: agent.can_send_materials ?? false,
        can_trigger_flows: agent.can_trigger_flows ?? false,
        can_transfer: agent.can_transfer ?? false,
        can_notify: agent.can_notify ?? false,
        can_add_notes: agent.can_add_notes ?? false,
        can_start_cadence: agent.can_start_cadence ?? false,
        can_qualify: agent.can_qualify ?? false,
        never_ask_email: (agent as any).never_ask_email ?? false,
        tool_configs: (agent.tool_configs ?? {}) as Record<string, unknown>,
        active_in_funnels: agent.active_in_funnels ?? true,
        active_in_chat: agent.active_in_chat ?? true,
        active_in_widget: agent.active_in_widget ?? true,
        active_in_inbox: agent.active_in_inbox ?? true,
        active_in_copilot: agent.active_in_copilot ?? false,
        active_in_whatsapp: agent.active_in_whatsapp ?? true,
        active_in_instagram: agent.active_in_instagram ?? true,
        active_in_facebook: agent.active_in_facebook ?? true,
        is_active: agent.is_active ?? true,
        is_default: agent.is_default ?? false,
        activation_keywords: agent.activation_keywords ?? [],
        activation_phrases: agent.activation_phrases ?? [],
        activation_priority: agent.activation_priority ?? 0,
        activation_scope: agent.activation_scope ?? 'all',
          takeover_on_match: agent.takeover_on_match ?? true,
          evolution_instance_id: agent.evolution_instance_id ?? null,
          humanization: (agent as any).humanization ?? {},
          voice_mode_enabled: agent.voice_mode_enabled ?? true,
          voice_behavior_prompt: agent.voice_behavior_prompt ?? null,
          voice_max_sentences: agent.voice_max_sentences ?? 2,
          voice_max_seconds: agent.voice_max_seconds ?? 10,
          voice_always_end_with_question: agent.voice_always_end_with_question ?? true,
          voice_show_tools_early: agent.voice_show_tools_early ?? true,
          voice_max_call_minutes: agent.voice_max_call_minutes ?? 10,
          voice_specific_rules: agent.voice_specific_rules ?? null,
          voice_provider: agent.voice_provider ?? 'grok',
          openai_voice_id: agent.openai_voice_id ?? null,
          default_grok_voice_id: agent.default_grok_voice_id ?? null,
          voice_settings: (agent as any).voice_settings ?? {},
        };

      // Check if this will be the first agent for the product — auto-set as default
      // (skip for global agents since "default" only makes sense per-product)
      if (insertData.product_id) {
        const { count } = await supabase
          .from('product_agents')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', insertData.product_id);
        
        if (count === 0) {
          insertData.is_default = true;
        }
      }

      const { data, error } = await supabase
        .from('product_agents')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      // Sync multi-channel dedicated connections (transient field)
      await syncAgentConnections(
        data.id,
        data.organization_id,
        (agentRaw as any).dedicated_connections
      );
      return data as ProductAgent;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-agents', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['all-agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-connections', data.id] });
      toast.success('Agente criado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Error creating agent:', error?.message, error?.code, error?.details, error?.hint, error);
      toast.error(`Erro ao criar agente: ${error?.message || 'desconhecido'}`);
    },

  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updatesRaw }: Partial<ProductAgent> & { id: string }) => {
      const updates = stripNonAgentFields(updatesRaw);
      const { data, error } = await supabase
        .from('product_agents')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      await syncAgentConnections(
        data.id,
        data.organization_id,
        (updatesRaw as any).dedicated_connections
      );
      return data as ProductAgent;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-agents', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['product-agent', data.id] });
      queryClient.invalidateQueries({ queryKey: ['all-agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-connections', data.id] });
      toast.success('Agente atualizado com sucesso!');
    },
    onError: (error: any) => {
      console.error('Error updating agent:', error?.message, error?.code, error?.details, error?.hint, error);
      toast.error(`Erro ao atualizar agente: ${error?.message || 'desconhecido'}`);
    },

  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string | null }) => {
      const { error } = await supabase
        .from('product_agents')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, productId };
    },
    onSuccess: ({ productId }) => {
      queryClient.invalidateQueries({ queryKey: ['product-agents', productId] });
      queryClient.invalidateQueries({ queryKey: ['all-agents'] });
      toast.success('Agente excluído com sucesso!');
    },
    onError: (error) => {
      console.error('Error deleting agent:', error);
      toast.error('Erro ao excluir agente');
    },
  });
}

export function useSetDefaultAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      // First, unset all defaults for this product
      await supabase
        .from('product_agents')
        .update({ is_default: false })
        .eq('product_id', productId);

      // Then set the new default
      const { data, error } = await supabase
        .from('product_agents')
        .update({ is_default: true })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductAgent;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-agents', data.product_id] });
      toast.success('Agente definido como padrão!');
    },
    onError: (error) => {
      console.error('Error setting default agent:', error);
      toast.error('Erro ao definir agente padrão');
    },
  });
}

export function useToggleAgentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('product_agents')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductAgent;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'all-agents' ||
          query.queryKey[0] === 'product-agents' ||
          query.queryKey[0] === 'product-agent',
      });
      toast.success(data.is_active ? 'Agente ativado!' : 'Agente desativado!');
    },
    onError: (error) => {
      console.error('Error toggling agent status:', error);
      toast.error('Erro ao alterar status do agente');
    },
  });
}

/**
 * Carrega as conexões dedicadas (multi-canal) de um agente.
 * Vazio = agente atende em qualquer conexão.
 */
export function useAgentConnections(agentId?: string | null) {
  return useQuery({
    queryKey: ['agent-connections', agentId],
    queryFn: async () => {
      if (!agentId) return [] as Array<{ type: 'evolution' | 'meta_whatsapp' | 'instagram'; id: string }>;
      const { data, error } = await supabase
        .from('product_agent_connections')
        .select('connection_type, connection_id')
        .eq('agent_id', agentId);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        type: r.connection_type as 'evolution' | 'meta_whatsapp' | 'instagram',
        id: r.connection_id as string,
      }));
    },
    enabled: !!agentId,
  });
}
