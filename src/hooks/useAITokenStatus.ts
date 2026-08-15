import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface AITokenStatus {
  allow_platform_ai: boolean;
  included: number;
  bonus: number;
  used: number;
  total: number;
  remaining: number;
  percent_used: number;
  period_start: string;
}

/**
 * Lê o status de tokens de IA da plataforma para a organização atual.
 * Se o plano não inclui IA da plataforma, o cliente precisa cadastrar chave própria.
 */
export function useAITokenStatus() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['ai-token-status', orgId],
    queryFn: async (): Promise<AITokenStatus | null> => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc('get_org_ai_tokens_status', { p_org_id: orgId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      const included = Number(row.included || 0);
      const bonus = Number(row.bonus || 0);
      const used = Number(row.used || 0);
      const total = included + bonus;
      const remaining = Math.max(0, total - used);
      const percent_used = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
      return {
        allow_platform_ai: !!row.allow_platform_ai,
        included,
        bonus,
        used,
        total,
        remaining,
        percent_used,
        period_start: row.period_start,
      };
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });
}
