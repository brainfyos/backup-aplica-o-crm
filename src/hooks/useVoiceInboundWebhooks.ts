import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface VoiceInboundWebhook {
  id: string;
  organization_id: string;
  name: string;
  token: string;
  campaign_id: string | null;
  mode: 'enroll_campaign' | 'call_immediate' | 'call_scheduled';
  default_agent_id: string | null;
  schedule_offset_minutes: number;
  field_mapping: Record<string, string>;
  default_tags: string[];
  default_source: string | null;
  active: boolean;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export function useVoiceInboundWebhooks() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['voice-inbound-webhooks', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_inbound_webhooks' as any)
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VoiceInboundWebhook[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useSaveVoiceInboundWebhook() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<VoiceInboundWebhook> & { id?: string }) => {
      const payload: any = {
        organization_id: profile!.organization_id!,
        name: input.name,
        campaign_id: input.campaign_id ?? null,
        mode: input.mode ?? 'enroll_campaign',
        default_agent_id: input.default_agent_id ?? null,
        schedule_offset_minutes: input.schedule_offset_minutes ?? 0,
        field_mapping: input.field_mapping ?? {},
        default_tags: input.default_tags ?? [],
        default_source: input.default_source ?? null,
        active: input.active ?? true,
      };
      if (input.id) {
        const { error } = await supabase.from('voice_inbound_webhooks' as any).update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('voice_inbound_webhooks' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-inbound-webhooks'] });
      toast.success('Webhook salvo');
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });
}

export function useDeleteVoiceInboundWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('voice_inbound_webhooks' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-inbound-webhooks'] });
      toast.success('Webhook removido');
    },
  });
}

export function buildVoiceInboundWebhookUrl(token: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/voice-inbound-lead?token=${token}`;
}
