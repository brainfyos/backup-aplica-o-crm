import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface IGMedia {
  id: string;
  caption: string;
  media_type: string;
  thumbnail_url: string | null;
  permalink: string;
  timestamp: string;
}

export function useInstagramMedia(connectionId: string | null | undefined) {
  return useQuery({
    queryKey: ['instagram-media', connectionId],
    enabled: !!connectionId,
    staleTime: 60_000,
    queryFn: async (): Promise<IGMedia[]> => {
      const { data, error } = await supabase.functions.invoke('instagram-list-media', {
        body: { connection_id: connectionId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.media ?? []) as IGMedia[];
    },
  });
}

export interface ReSubscribeResult {
  ok: boolean;
  granted: string[];
  attempted: string[];
  failed: Array<{ field: string; code?: number; subcode?: number; message: string }>;
  token_scopes: string[] | null;
  missing_scopes: string[];
  error?: string;
}

export function useReSubscribeInstagram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connection_id: string): Promise<ReSubscribeResult> => {
      const { data, error } = await supabase.functions.invoke('instagram-subscribe-fields', {
        body: { connection_id },
      });
      if (error) {
        // A edge devolve 400 com corpo JSON detalhado quando algum field falha
        try {
          const anyErr = error as any;
          const ctx = anyErr?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body && typeof body === 'object') return body as ReSubscribeResult;
          }
          if (ctx && typeof ctx.text === 'function') {
            const txt = await ctx.text();
            try { return JSON.parse(txt) as ReSubscribeResult; } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
        throw error;
      }
      return (data ?? {}) as ReSubscribeResult;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['instagram-connections'] });
      if (res.ok) {
        toast.success('Campos re-inscritos na Meta — automações de comentários/menções agora rodam.');
      } else if (res.missing_scopes?.length) {
        toast.error(
          `Reconecte a conta do Instagram — o token atual não tem: ${res.missing_scopes.join(', ')}.`,
          { duration: 8000 },
        );
      } else if (res.failed?.some(f => /Page Access Token|token da Página|token de acesso à Página/i.test(f.message))) {
        toast.error('O token salvo não é um Page Access Token válido para esta Página. Gere um token da Página e reconecte.', { duration: 10000 });
      } else {
        toast.error(res.error ?? 'Meta rejeitou alguns campos. Veja logs.', { duration: 8000 });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao reassinar'),
  });
}

export interface GenerateFlowInput {
  prompt: string;
  organization_id?: string;
  connection_id?: string | null;
  existing_flow_id?: string;
}

export function useGenerateInstagramFlowAI() {
  return useMutation({
    mutationFn: async (input: GenerateFlowInput) => {
      const { data, error } = await supabase.functions.invoke('instagram-flow-generate-ai', { body: input });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { ok: true; flow_id: string; name: string; trigger_type: string; blocks: any[]; warnings: string[] };
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao gerar com IA'),
  });
}

export function useGenerateInstagramTextVariationsAI() {
  return useMutation({
    mutationFn: async (input: { base_text: string; count?: number; context?: 'public_comment' | 'direct_message' }) => {
      const { data, error } = await supabase.functions.invoke('instagram-flow-generate-ai', {
        body: {
          action: 'generate_text_variations',
          base_text: input.base_text,
          count: input.count ?? 3,
          context: input.context ?? 'public_comment',
        },
      });
      if (error) {
        let detail = '';
        try {
          const payload = await (error as any)?.context?.json?.();
          detail = String(payload?.error ?? payload?.message ?? '');
        } catch {
          // Mantém a mensagem original quando a resposta não contém JSON.
        }
        throw new Error(detail || error.message || 'Falha ao criar variações');
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { ok: true; variations: string[] };
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao criar variações'),
  });
}

export interface FlowDryRunPlan {
  block_id: string;
  type: string;
  action: string;
  preview?: string;
}

export function useDryRunInstagramFlow() {
  return useMutation({
    mutationFn: async (input: { flow_id: string; trigger_text?: string; trigger_source?: string }) => {
      const { data, error } = await supabase.functions.invoke('ig-flow-executor', {
        body: {
          flow_id: input.flow_id,
          trigger_source: input.trigger_source ?? 'manual',
          trigger_text: input.trigger_text ?? '',
          sender_ig_id: 'preview_sender',
          comment_id: 'preview_comment',
          dry_run: true,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return (data as any) as { ok: true; dry_run: true; plan: FlowDryRunPlan[]; executed: string[] };
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha no preview'),
  });
}
