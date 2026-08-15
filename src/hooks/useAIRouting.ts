import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type AICapability =
  | 'agent_chat'
  | 'sales_copilot'
  | 'audio_transcription'
  | 'image_vision'
  | 'content_generation'
  | 'analysis_insights'
  | 'embeddings'
  | 'voice_call';

export type AIProvider = 'lovable' | 'openai' | 'anthropic' | 'gemini' | 'xai';

export interface FallbackStep {
  provider: AIProvider;
  model: string;
}

export interface FallbackTriggers {
  rate_limit: boolean;
  credits: boolean;
  server_error: boolean;
  empty_output: boolean;
  degenerate: boolean;
  timeout: boolean;
}

export const DEFAULT_FALLBACK_TRIGGERS: FallbackTriggers = {
  rate_limit: true,
  credits: true,
  server_error: true,
  empty_output: true,
  degenerate: true,
  timeout: false,
};

export const FALLBACK_TRIGGER_LABELS: Record<keyof FallbackTriggers, string> = {
  rate_limit: 'Excesso de requisições (429)',
  credits: 'Créditos esgotados (402)',
  server_error: 'Erro do provedor (5xx)',
  empty_output: 'Resposta vazia',
  degenerate: 'Loop de repetição',
  timeout: 'Timeout',
};

export interface AIRoutingRow {
  id?: string;
  capability: AICapability;
  provider: AIProvider;
  model: string | null;
  fallback_to_lovable: boolean;
  fallback_chain?: FallbackStep[];
  fallback_triggers?: FallbackTriggers;
}

export interface AICredentialRow {
  provider: 'openai' | 'anthropic' | 'gemini' | 'xai';
  api_key_masked: string | null;
  model_default: string | null;
  last_verified_at: string | null;
  last_error: string | null;
}

export const CAPABILITY_LABELS: Record<AICapability, { title: string; desc: string }> = {
  agent_chat:           { title: 'Agentes de conversa',     desc: 'WhatsApp, WebChat e Inbox' },
  sales_copilot:        { title: 'Copiloto de vendas',      desc: 'Sugestões para vendedores no painel' },
  audio_transcription:  { title: 'Transcrição de áudio',    desc: 'Conversão de áudios em texto (Whisper)' },
  image_vision:         { title: 'Leitura de imagens',      desc: 'Análise de fotos e prints recebidos' },
  content_generation:   { title: 'Geração de conteúdo',     desc: 'Criação de funis, formulários, agentes, objeções' },
  analysis_insights:    { title: 'Análise e insights',      desc: 'Avaliação de conversas, supervisão e relatórios' },
  embeddings:           { title: 'Memória semântica',       desc: 'Embeddings para busca contextual em conversas' },
  voice_call:           { title: 'Chamadas de voz',         desc: 'Ligações do módulo de Voz (Grok/xAI, futuros OpenAI Realtime)' },
};

export function useAICredentials() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['org-ai-credentials', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_ai_credentials')
        .select('provider, api_key_masked, model_default, last_verified_at, last_error')
        .eq('organization_id', profile!.organization_id!);
      if (error) throw error;
      return (data ?? []) as AICredentialRow[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useSaveAICredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { provider: 'openai' | 'anthropic' | 'gemini' | 'xai'; api_key: string; model_default?: string }) => {
      const { data, error } = await supabase.functions.invoke('save-ai-credential', { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-ai-credentials'] });
      qc.invalidateQueries({ queryKey: ['integration-settings'] });
      toast.success('Chave verificada e salva');
    },
    onError: (e: Error) => toast.error(`Falha ao salvar: ${e.message}`),
  });
}

export function useDeleteAICredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: 'openai' | 'anthropic' | 'gemini' | 'xai') => {
      const { data, error } = await supabase.functions.invoke('save-ai-credential', {
        body: { provider, action: 'delete' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-ai-credentials'] });
      toast.success('Chave removida');
    },
  });
}

export function useAIRouting() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['org-ai-routing', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_ai_routing')
        .select('id, capability, provider, model, fallback_to_lovable, fallback_chain, fallback_triggers')
        .eq('organization_id', profile!.organization_id!);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        fallback_chain: Array.isArray(r.fallback_chain) ? r.fallback_chain : [],
        fallback_triggers: { ...DEFAULT_FALLBACK_TRIGGERS, ...(r.fallback_triggers ?? {}) },
      })) as AIRoutingRow[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useSaveAIRouting() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AIRoutingRow) => {
      const { error } = await supabase
        .from('org_ai_routing')
        .upsert(
          {
            organization_id: profile!.organization_id!,
            capability: input.capability,
            provider: input.provider,
            model: input.model,
            fallback_to_lovable: input.fallback_to_lovable,
            fallback_chain: (input.fallback_chain ?? []) as any,
            fallback_triggers: (input.fallback_triggers ?? DEFAULT_FALLBACK_TRIGGERS) as any,
          } as any,
          { onConflict: 'organization_id,capability' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-ai-routing'] });
    },
    onError: (e: Error) => toast.error(`Falha ao salvar roteamento: ${e.message}`),
  });
}

export interface TestAIRoutingResult {
  ok: boolean;
  capability: string;
  provider?: string;
  model?: string;
  source?: string;
  endpoint?: string;
  allow_fallback?: boolean;
  status?: number;
  latency_ms?: number;
  sample?: string | null;
  error?: string | null;
  code?: string | null;
}

export function useTestAIRouting() {
  return useMutation({
    mutationFn: async (capability: AICapability): Promise<TestAIRoutingResult> => {
      const { data, error } = await supabase.functions.invoke('test-ai-routing', { body: { capability } });
      if (error) throw error;
      return data as TestAIRoutingResult;
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(`OK (${data.provider} · ${data.model}) — ${data.latency_ms}ms`);
      } else {
        toast.error(`Falha: ${data.error || data.code || 'erro desconhecido'}`);
      }
    },
    onError: (e: Error) => toast.error(`Erro no teste: ${e.message}`),
  });
}
