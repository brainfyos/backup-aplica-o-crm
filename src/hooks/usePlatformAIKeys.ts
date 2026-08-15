import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type PoolProvider = 'lovable' | 'openai' | 'anthropic' | 'gemini';
export type PlatformAIKeyPurpose = 'platform' | 'mia';

export interface PlatformAIKey {
  id: string;
  provider: PoolProvider;
  purpose: PlatformAIKeyPurpose;
  label: string;
  api_key_masked: string;
  model_default: string | null;
  priority: number;
  weight: number;
  is_active: boolean;
  last_used_at: string | null;
  usage_count: number;
  last_error: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export function usePlatformAIKeys() {
  return useQuery({
    queryKey: ['platform-ai-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_ai_keys' as any)
        .select('id, provider, purpose, label, api_key_masked, model_default, priority, weight, is_active, last_used_at, usage_count, last_error, last_verified_at, created_at, updated_at')
        .order('provider', { ascending: true })
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PlatformAIKey[];
    },
  });
}

export interface SavePlatformKeyInput {
  id?: string;
  provider: PoolProvider;
  purpose?: PlatformAIKeyPurpose;
  label: string;
  api_key?: string;
  model_default?: string;
  priority?: number;
  weight?: number;
  is_active?: boolean;
}

export function useSavePlatformAIKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePlatformKeyInput) => {
      const { data, error } = await supabase.functions.invoke('save-platform-ai-key', { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-ai-keys'] });
      toast.success('Chave salva e verificada');
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });
}

export function usePlatformAIKeyAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; action: 'delete' | 'toggle' | 'test'; is_active?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('save-platform-ai-key', { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['platform-ai-keys'] });
      if (vars.action === 'test') toast.success('Chave verificada com sucesso');
      if (vars.action === 'delete') toast.success('Chave removida');
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });
}
