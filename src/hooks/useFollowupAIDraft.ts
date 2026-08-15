import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FollowupDraft {
  summary: string;
  strategy: string;
  strategy_label: string;
  draft_message: string;
  warnings?: string[];
  model?: string;
}

export function useFollowupAIDraft() {
  const [draft, setDraft] = useState<FollowupDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [regenCount, setRegenCount] = useState(0);

  const generate = useCallback(
    async (conversationId: string, forceRegenerate = false) => {
      if (!conversationId) return null;
      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('followup-ai-draft', {
          body: { conversation_id: conversationId, force_regenerate: forceRegenerate },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Falha ao gerar follow-up');
        const d: FollowupDraft = {
          summary: data.summary,
          strategy: data.strategy,
          strategy_label: data.strategy_label,
          draft_message: data.draft_message,
          warnings: data.warnings,
          model: data.model,
        };
        setDraft(d);
        if (forceRegenerate) setRegenCount((c) => c + 1);
        return d;
      } catch (e: any) {
        console.error('[useFollowupAIDraft]', e);
        toast.error(e?.message || 'Erro ao gerar follow-up com IA');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setDraft(null);
    setRegenCount(0);
  }, []);

  return { draft, isLoading, generate, reset, regenCount, canRegenerate: regenCount < 3 };
}
