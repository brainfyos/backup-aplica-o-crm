import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type VoiceCallStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface CaptureField {
  key: string;
  label: string;
  type: 'text' | 'phone' | 'email' | 'custom';
  required?: boolean;
}

export type CtaKind = 'link' | 'schedule' | 'whatsapp' | 'interest';

export interface CallCtaLink {
  id: string;
  label: string;
  url: string;
}

export interface CallCta {
  id: string;
  kind: CtaKind;
  label: string;
  // legacy: single link (mantido pra retrocompatibilidade). Novo shape usa `links[]`.
  url?: string;
  links?: CallCtaLink[];
  event_type_id?: string;
  whatsapp_target?: string;
  tag_id?: string;
  score?: number;
  color?: string;
  track_click?: boolean;
}

export interface VoiceCallTracking {
  meta_pixel_id?: string;
  meta_access_token?: string;
  ga4_id?: string;
  ga4_api_secret?: string;
  webhook_url?: string;
}

export interface PostCallRule {
  outcome: string;
  cadence_id?: string | null;
  create_task?: boolean;
  task_title?: string;
  task_priority?: 'low' | 'medium' | 'high';
  task_due_hours?: number;
  notify_admins?: boolean;
}

export interface VoiceCall {
  id: string;
  organization_id: string;
  product_id: string | null;
  voice_agent_id: string | null; // legacy
  product_agent_id: string | null;
  voice_provider: 'grok' | 'openai' | 'auto' | null;
  openai_voice_id: string | null;
  grok_voice_id: string | null;
  voice_settings: Record<string, any>;
  language: string;
  name: string;
  slug: string;
  context: string;
  status: VoiceCallStatus;
  appearance: Record<string, any>;
  capture_fields: CaptureField[];
  ctas: CallCta[];
  tracking: VoiceCallTracking;
  post_call_automations: { rules: PostCallRule[] };
  post_cadence_id: string | null;
  stats: { views?: number; calls?: number; conversions?: number };
  created_at: string;
  updated_at: string;
  products?: { name: string } | null;
  product_agent?: { id: string; name: string; avatar_url: string | null } | null;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `call-${Date.now().toString(36)}`;
}

export function useVoiceCalls() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  return useQuery({
    queryKey: ['voice-calls', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_calls')
        .select('*, products(name), product_agent:product_agents!voice_calls_product_agent_id_fkey(id, name, avatar_url)')
        .eq('organization_id', orgId!)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VoiceCall[];
    },
  });
}

export function useVoiceCall(id: string | null) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  return useQuery({
    queryKey: ['voice-call', orgId, id],
    enabled: !!id && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_calls')
        .select('*, products(name), product_agent:product_agents!voice_calls_product_agent_id_fkey(id, name, avatar_url)')
        .eq('id', id!)
        .eq('organization_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as VoiceCall | null;
    },
  });
}

export function useCreateVoiceCall() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; product_id?: string | null; product_agent_id?: string | null; grok_voice_id?: string | null; voice_provider?: 'grok' | 'openai' | 'auto' | null; openai_voice_id?: string | null }) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      const slug = `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase
        .from('voice_calls')
        .insert({
          organization_id: profile.organization_id,
          product_id: input.product_id ?? null,
          product_agent_id: input.product_agent_id ?? null,
          voice_provider: input.voice_provider ?? null,
          openai_voice_id: input.openai_voice_id ?? null,
          grok_voice_id: input.grok_voice_id ?? null,
          name: input.name,
          slug,
          status: 'draft',
        } as any)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as VoiceCall;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-calls'] });
      toast.success('Ligação criada');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao criar ligação'),
  });
}

export function useUpdateVoiceCall() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<VoiceCall> }) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      const { data, error } = await supabase
        .from('voice_calls')
        .update(patch as any)
        .eq('id', id)
        .eq('organization_id', profile.organization_id)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as VoiceCall;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['voice-calls'] });
      qc.invalidateQueries({ queryKey: ['voice-call', data.id] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });
}

export function useDeleteVoiceCall() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      const { error } = await supabase
        .from('voice_calls')
        .delete()
        .eq('id', id)
        .eq('organization_id', profile.organization_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-calls'] });
      toast.success('Ligação excluída');
    },
  });
}

export function useDuplicateVoiceCall() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      const { data: src, error: e1 } = await supabase
        .from('voice_calls')
        .select('*')
        .eq('id', id)
        .eq('organization_id', profile.organization_id)
        .single();
      if (e1) throw e1;
      const clone: any = { ...src };
      delete clone.id;
      delete clone.created_at;
      delete clone.updated_at;
      clone.name = `${src.name} (cópia)`;
      clone.slug = `${slugify(src.name)}-${Math.random().toString(36).slice(2, 6)}`;
      clone.status = 'draft';
      clone.stats = {};
      clone.organization_id = profile.organization_id;
      const { data, error } = await supabase.from('voice_calls').insert(clone).select('*').single();
      if (error) throw error;
      return data as unknown as VoiceCall;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-calls'] });
      toast.success('Ligação duplicada');
    },
  });
}

export function useToggleVoiceCallStatus() {
  const update = useUpdateVoiceCall();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: VoiceCallStatus }) => {
      return update.mutateAsync({ id, patch: { status } as any });
    },
  });
}
