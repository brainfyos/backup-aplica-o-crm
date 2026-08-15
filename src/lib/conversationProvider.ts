/**
 * Resolve o provedor real de uma conversa.
 *
 * Distingue WhatsApp via Evolution (QR) de WhatsApp Oficial (Meta Cloud)
 * e separa Instagram, Webchat, etc. — usado para escolher ícone, cor e
 * rótulo de conexão na Inbox.
 */
export type ConvProvider =
  | 'webchat'
  | 'whatsapp_evolution'
  | 'whatsapp_meta'
  | 'instagram'
  | 'email'
  | 'sms'
  | 'unknown';

export interface ConvProviderInput {
  channel?: string | null;
  meta_connection_id?: string | null;
  instagram_connection_id?: string | null;
  evolution_instance_id?: string | null;
}

export function resolveProvider(conv: ConvProviderInput | null | undefined): ConvProvider {
  if (!conv) return 'unknown';
  if (conv.instagram_connection_id) return 'instagram';
  if (conv.meta_connection_id) return 'whatsapp_meta';
  const ch = (conv.channel || '').toLowerCase();
  if (ch === 'instagram') return 'instagram';
  if (ch === 'whatsapp') return 'whatsapp_evolution';
  if (ch === 'webchat' || ch === 'web_chat') return 'webchat';
  if (ch === 'email') return 'email';
  if (ch === 'sms') return 'sms';
  return 'unknown';
}

export const PROVIDER_LABEL: Record<ConvProvider, string> = {
  webchat: 'Site',
  whatsapp_evolution: 'WhatsApp (QR)',
  whatsapp_meta: 'WhatsApp Oficial',
  instagram: 'Instagram',
  email: 'Email',
  sms: 'SMS',
  unknown: 'Outro',
};
