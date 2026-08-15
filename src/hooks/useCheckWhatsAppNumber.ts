import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CheckWhatsAppResult {
  ok: boolean;
  exists: boolean;
  reliable?: boolean;
  diagnosis?: 'ok' | 'number_not_found' | 'provider_false_negative_or_session_issue' | string;
  original_phone: string;
  normalized_phone: string | null;
  jid: string | null;
  checked_variants: Array<{ number: string; exists: boolean; jid: string | null }>;
  updated: boolean;
  has_recent_inbound?: boolean;
  has_existing_conversation?: boolean;
  last_inbound_at?: string | null;
  session_warning?: boolean;
  wa_lid?: string | null;
  instance?: { id: string; name: string; status: string; remote_connected?: boolean | null };
  error?: string;
  message?: string;
}

export function useCheckWhatsAppNumber() {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<CheckWhatsAppResult | null>(null);

  async function check(params: {
    phone: string;
    organization_id?: string;
    instance_id?: string;
    conversation_id?: string;
    apply?: boolean;
    silent?: boolean;
  }): Promise<CheckWhatsAppResult | null> {
    if (!params.phone) {
      toast.error('Número não informado');
      return null;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-check-number', {
        body: {
          phone: params.phone,
          organization_id: params.organization_id,
          instance_id: params.instance_id,
          conversation_id: params.conversation_id,
          apply: params.apply ?? false,
        },
      });
      if (error) throw error;
      const result = data as CheckWhatsAppResult;
      setLastResult(result);

      if (!params.silent) {
        if (result.error === 'no_instance') {
          toast.error('Nenhuma instância WhatsApp conectada');
        } else if (result.reliable === false || result.diagnosis === 'provider_false_negative_or_session_issue') {
          toast.warning('Validação inconclusiva pela conexão WhatsApp', {
            description: result.wa_lid
              ? 'O lead já respondeu e tem LID WhatsApp; a falha parece ser da sessão/provedor, não do telefone.'
              : 'Há histórico com este número; a falha parece ser da sessão/conexão, não do telefone.',
          });
        } else if (!result.exists) {
          toast.error('Número não está registrado no WhatsApp', {
            description: 'Verifique se o telefone do lead está correto ou peça o número atual.',
          });
        } else if (result.updated) {
          toast.success('Número corrigido automaticamente', {
            description: `Atualizado para ${result.normalized_phone}`,
          });
        } else {
          toast.success('Número válido no WhatsApp');
        }
      }
      return result;
    } catch (e: any) {
      if (!params.silent) toast.error('Falha ao verificar', { description: e?.message });
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { check, loading, lastResult };
}
