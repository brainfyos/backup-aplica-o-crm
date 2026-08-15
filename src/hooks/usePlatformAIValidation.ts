import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AIPingResult {
  ok: boolean;
  provider?: string;
  model?: string;
  source?: string;
  label?: string | null;
  latency_ms?: number;
  sample?: string | null;
  error?: string | null;
}

export type PlatformAIMode = 'lovable' | 'own_key' | 'per_org';

export const AI_MODE_LABELS: Record<PlatformAIMode, string> = {
  lovable: 'IA da plataforma (Lovable)',
  own_key: 'IA da plataforma (chave própria)',
  per_org: 'Cada empresa usa a própria chave',
};

/**
 * Estado de validação da IA em escopo plataforma (Super Admin).
 * `ai_validated_at` só é preenchido após um ping real bem-sucedido.
 * `ai_mode` define quem fornece a IA — no modo `per_org` não há teste central.
 */
export function usePlatformAIValidation() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['platform-ai-validation'],
    queryFn: async () => {
      const { data } = await supabase
        .from('platform_settings')
        .select('ai_validated_at, ai_validated_provider, ai_mode')
        .maybeSingle();
      return (data ?? null) as {
        ai_validated_at?: string | null;
        ai_validated_provider?: string | null;
        ai_mode?: PlatformAIMode | null;
      } | null;
    },
  });

  const test = useMutation({
    mutationFn: async (provider?: string) => {
      const { data, error } = await supabase.functions.invoke('platform-ai-test', {
        body: provider ? { provider } : {},
      });
      if (error) throw error;
      return data as AIPingResult;
    },
    onSuccess: (res) => {
      if (res?.ok) {
        qc.invalidateQueries({ queryKey: ['platform-ai-validation'] });
        qc.invalidateQueries({ queryKey: ['super-admin-setup-checklist'] });
      }
    },
  });

  const setMode = useMutation({
    mutationFn: async (mode: PlatformAIMode) => {
      const { data: existing } = await supabase
        .from('platform_settings')
        .select('id')
        .maybeSingle();
      if (!existing?.id) throw new Error('platform_settings ainda não inicializado');
      const { error } = await supabase
        .from('platform_settings')
        .update({ ai_mode: mode } as any)
        .eq('id', existing.id);
      if (error) throw error;
      return mode;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-ai-validation'] });
      qc.invalidateQueries({ queryKey: ['super-admin-setup-checklist'] });
    },
  });

  const mode = (query.data?.ai_mode ?? 'lovable') as PlatformAIMode;

  return {
    mode,
    validatedAt: query.data?.ai_validated_at ?? null,
    validatedProvider: query.data?.ai_validated_provider ?? null,
    // No modo per_org quem valida é o Admin de cada empresa (Integrações → Roteamento de IA).
    isValidated: mode === 'per_org' || !!query.data?.ai_validated_at,
    isPingValidated: !!query.data?.ai_validated_at,
    isLoading: query.isLoading,
    test: test.mutateAsync,
    isTesting: test.isPending,
    setMode: setMode.mutateAsync,
    isSavingMode: setMode.isPending,
  };
}
