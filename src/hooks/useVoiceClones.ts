import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface VoiceClone {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  grok_voice_id: string | null;
  sample_urls: string[];
  status: 'processing' | 'ready' | 'failed';
  status_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useVoiceClones() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['voice-clones', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_clones' as any)
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VoiceClone[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useDeleteVoiceClone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('voice-clone-delete', { body: { id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-clones'] });
      toast.success('Voz clonada removida');
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });
}

// Cria voz clonada a partir de arquivos já enviados ao bucket voice-samples.
// samplePaths: caminhos completos no storage (org_id/clone-tmp/xxx.mp3)
export function useCreateVoiceClone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; samplePaths: string[] }) => {
      const { data, error } = await supabase.functions.invoke('voice-clone-create', { body: input });
      if (error) {
        // Extrai o body real do FunctionsHttpError (Supabase mascara como "non-2xx")
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx?.text) {
            const raw = await ctx.text();
            const parsed = raw ? JSON.parse(raw) : null;
            if (parsed?.error) detail = parsed.error;
            else if (raw) detail = raw;
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { id: string; status: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-clones'] });
      toast.success('Clonagem iniciada — aguarde processamento');
    },
    onError: (e: Error) => toast.error(`Falha ao clonar: ${e.message}`),
  });
}

// Preview TTS: retorna URL de blob para tocar no <audio>.
export async function previewGrokVoice(voiceId: string, text?: string): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-preview`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      voice_id: voiceId,
      text: text || 'Olá! Esta é uma amostra da minha voz. Posso te ajudar com o que precisar.',
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    let message = t || `preview failed: ${res.status}`;
    try {
      const parsed = JSON.parse(t);
      message = parsed?.error || message;
    } catch {
      // mantém texto bruto quando a resposta não é JSON
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// Preview TTS OpenAI Realtime voice (usa /audio/speech com gpt-4o-mini-tts)
export async function previewOpenAIVoice(voiceId: string, text?: string): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-voice-preview`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      voice_id: voiceId,
      text: text || 'Olá! Sou seu agente de vendas, tudo bem por aí? Posso te ajudar em qualquer coisa que precisar.',
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    let message = t || `preview failed: ${res.status}`;
    try {
      const parsed = JSON.parse(t);
      message = parsed?.error || message;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
