// Códigos de erro da Meta Cloud API → mensagens amigáveis PT-BR.
// Usado pelo bubble do inbox e pela tela de detalhes de campanha.

export interface MetaErrorInfo {
  code?: number | string | null;
  title?: string | null;
  details?: string | null;
}

const DICT: Record<string, string> = {
  '131026': 'Número não é WhatsApp válido.',
  '131047': 'Janela de 24h encerrada — só é possível enviar template.',
  '131051': 'Template inválido ou não aprovado.',
  '131053': 'Mídia do template inacessível pela Meta. Reenvie o vídeo/imagem na edição do template.',
  '131056': 'Conta de WhatsApp pareada com outro destino.',
  '132000': 'Número de parâmetros do template não confere.',
  '132001': 'Template não existe no idioma informado.',
  '132005': 'Tradução do template não aprovada.',
  '132007': 'Variáveis do template em formato inválido.',
  '132012': 'Parâmetro do template inválido.',
  '132015': 'Template pausado pela Meta.',
  '132016': 'Template desativado pela Meta.',
  '133010': 'Limite de mensagens da conta atingido.',
  '368': 'Conta bloqueada temporariamente.',
  bot_loop_detected: 'Loop com bot detectado — envio bloqueado.',
  whatsapp_opt_out: 'Lead optou por sair da lista de WhatsApp.',
  OUT_OF_WINDOW: 'Fora da janela 24h — envie um template HSM aprovado.',
  WHATSAPP_VALIDATION_UNRELIABLE: 'Falha da conexão WhatsApp/LID — o lead existe e respondeu, mas o provedor recusou o envio.',
  PHONE_NOT_ON_WHATSAPP: 'Número não confirmado no WhatsApp pela conexão atual.',
  OPTED_OUT: 'Lead optou por sair da lista de WhatsApp.',
  MISSING_HEADER_MEDIA: 'Template com header de mídia sem vídeo/imagem configurada. Edite o template em Conexões → API Oficial → Templates.',
};

/** Retorna mensagem PT-BR a partir do código + título/details brutos. */
export function metaErrorMessage(info: MetaErrorInfo | null | undefined, fallback?: string | null): string {
  if (!info) return fallback || 'Falha ao enviar.';
  const key = String(info.code ?? '').trim();
  if (key && DICT[key]) return DICT[key];
  const composed = [info.title, info.details].filter(Boolean).join(': ');
  return composed || fallback || 'Falha ao enviar.';
}

export function metaErrorFromMetadata(metadata: any, fallback?: string | null): string | null {
  if (!metadata) return fallback ?? null;
  const ms = metadata.meta_status;
  if (ms && (ms.code || ms.title || ms.details)) {
    return metaErrorMessage({ code: ms.code, title: ms.title, details: ms.details }, fallback);
  }
  // Novos campos vindos do meta-whatsapp-send (Graph error)
  const gCode = metadata.graph_code ?? metadata.code;
  const gMsg = metadata.graph_message ?? metadata.error;
  if (gCode && DICT[String(gCode)]) {
    return `${DICT[String(gCode)]} (Meta #${gCode})`;
  }
  if (gCode || gMsg) {
    const parts = [gMsg, gCode ? `Meta #${gCode}` : null].filter(Boolean);
    return parts.join(' · ') || fallback || null;
  }
  if (metadata.error_code && DICT[String(metadata.error_code)]) return DICT[String(metadata.error_code)];
  if (metadata.error) return String(metadata.error);
  return fallback ?? null;
}
