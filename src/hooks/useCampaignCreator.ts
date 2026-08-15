import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CampaignDestination } from '@/lib/metaObjectiveMap';

export type CampaignCopy = {
  primary_text: string;
  headline: string;
  description: string;
  cta?: string;
};

export type CampaignDraft = {
  nome_sugerido: string;
  produto?: string;
  oferta?: string;
  publico_texto?: string;
  tom?: string;
  destino: CampaignDestination;
  orcamento_diario_brl: number;
  data_inicio?: string;
  data_fim?: string;
  localizacao: {
    paises: string[];
    cidades?: any[];
    idade_min: number;
    idade_max: number;
    interesses?: Array<{ id?: string; name: string }>;
  };
  copies: CampaignCopy[];
  mensagem_inicial_whatsapp?: string;
  creatives?: Array<{ upload_base64?: string; upload_type?: 'image' | 'video'; filename?: string; preview_url?: string; image_hash?: string }>;
};

export type DestinationRef = {
  whatsapp_connection_id?: string;
  facebook_page_id?: string;
  agent_id?: string;
  pipeline_id?: string;
  stage_id?: string;
  form_id?: string;
  quiz_id?: string;
  url?: string;
  tags?: string[];
};

export function useDraftAI() {
  return useMutation({
    mutationFn: async (payload: { description?: string; mode?: 'draft' | 'regenerate_copy'; base?: any; style?: string }) => {
      const { data, error } = await supabase.functions.invoke('meta-campaign-draft-ai', {
        body: { mode: 'draft', ...payload },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).details ?? (data as any).error);
      return (data as any).draft as CampaignDraft;
    },
    onError: (e: any) => toast.error(`IA falhou: ${e?.message ?? e}`),
  });
}

export function useValidateCampaign() {
  return useMutation({
    mutationFn: async (payload: { credential_id: string; destination_type: CampaignDestination; destination_ref: DestinationRef }) => {
      const { data, error } = await supabase.functions.invoke('meta-campaign-validate', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).details ?? (data as any).error);
      return data as { ok: true; all_ok: boolean; checks: Record<string, { ok: boolean; message: string }> };
    },
  });
}

export function usePublishCampaign() {
  return useMutation({
    mutationFn: async (payload: { credential_id: string; draft: CampaignDraft; destination_ref: DestinationRef }) => {
      const { data, error } = await supabase.functions.invoke('meta-campaign-publish', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).details ?? (data as any).error);
      return data as { ok: true; campaign_id: string; adset_id: string; ads: string[]; ads_manager_url: string };
    },
    onSuccess: () => toast.success('Campanha publicada e pausada para revisão. Você pode ativá-la no Vendus.'),
    onError: (e: any) => toast.error(`Publicação falhou: ${e?.message ?? e}`),
  });
}
