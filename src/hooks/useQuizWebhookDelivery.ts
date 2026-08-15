import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface QuizWebhookDelivery {
  id?: string;
  funnel_id: string;
  organization_id?: string;
  enabled: boolean;
  mode: 'internal' | 'external';
  internal_webhook_id: string | null;
  external_url: string | null;
}

export function useQuizWebhookDelivery(funnelId: string) {
  return useQuery({
    queryKey: ['quiz-webhook-delivery', funnelId],
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from('quiz_webhook_deliveries')
        .select('id,funnel_id,organization_id,enabled,mode,internal_webhook_id,external_url')
        .eq('funnel_id', funnelId)
        .maybeSingle();
      if (error) throw error;
      return data as QuizWebhookDelivery | null;
    },
    enabled: !!funnelId,
  });
}

export function useSaveQuizWebhookDelivery(funnelId: string) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (delivery: Omit<QuizWebhookDelivery, 'funnel_id' | 'organization_id'>) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada.');
      if (delivery.enabled && delivery.mode === 'internal' && !delivery.internal_webhook_id) {
        throw new Error('Selecione um webhook interno.');
      }
      if (delivery.enabled && delivery.mode === 'external') {
        let parsed: URL;
        try {
          parsed = new URL(delivery.external_url || '');
        } catch {
          throw new Error('Informe uma URL externa válida.');
        }
        if (parsed.protocol !== 'https:') throw new Error('O webhook externo precisa usar HTTPS.');
      }

      const client = supabase as any;
      const { data, error } = await client
        .from('quiz_webhook_deliveries')
        .upsert({
          funnel_id: funnelId,
          organization_id: profile.organization_id,
          enabled: delivery.enabled,
          mode: delivery.mode,
          internal_webhook_id: delivery.mode === 'internal' ? delivery.internal_webhook_id : null,
          external_url: delivery.mode === 'external' ? delivery.external_url?.trim() || null : null,
        }, { onConflict: 'funnel_id' })
        .select()
        .single();
      if (error) throw error;
      return data as QuizWebhookDelivery;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz-webhook-delivery', funnelId] });
    },
  });
}
