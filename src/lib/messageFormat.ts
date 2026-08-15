import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Converte sintaxe nativa do WhatsApp em Markdown seguro.
 *  *texto*  -> **texto**  (negrito)
 *  _texto_  -> *texto*    (itálico)
 *  ~texto~  -> ~~texto~~  (tachado)
 *  ```code``` mantido
 * Faz auto-link de URLs, telefones e e-mails.
 * Escapa caracteres que poderiam ser interpretados como markdown indesejado.
 */
export function formatWhatsAppText(input: string | null | undefined): string {
  if (!input) return '';
  let text = String(input);

  // Preserva blocos de código (``` ... ```) e código inline (` ... `) durante a conversão
  const codeBlocks: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `§§CB${codeBlocks.length - 1}§§`;
  });
  const inlineCodes: string[] = [];
  text = text.replace(/`[^`\n]+`/g, (m) => {
    inlineCodes.push(m);
    return `§§IC${inlineCodes.length - 1}§§`;
  });

  // Escapa caracteres markdown sensíveis fora de código (mantém * _ ~ que vamos converter)
  text = text.replace(/([\\\[\]()#>])/g, '\\$1');

  // *bold* (apenas pares com conteúdo, não asteriscos isolados)
  text = text.replace(/(^|[\s(])\*([^\s*][^*\n]*?[^\s*]|\S)\*(?=[\s.,;:!?)]|$)/g, '$1**$2**');

  // _italic_  -> *italic*
  text = text.replace(/(^|[\s(])_([^\s_][^_\n]*?[^\s_]|\S)_(?=[\s.,;:!?)]|$)/g, '$1*$2*');

  // ~strike~ -> ~~strike~~
  text = text.replace(/(^|[\s(])~([^\s~][^~\n]*?[^\s~]|\S)~(?=[\s.,;:!?)]|$)/g, '$1~~$2~~');

  // Auto-link URLs (que ainda não estejam em link markdown)
  text = text.replace(
    /(^|[\s])((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]])/gi,
    (_m, pre, url) => `${pre}[${url}](${url.startsWith('http') ? url : 'https://' + url})`,
  );

  // Auto-link e-mails
  text = text.replace(
    /(^|[\s])([\w.+-]+@[\w-]+\.[\w.-]+)/g,
    (_m, pre, email) => `${pre}[${email}](mailto:${email})`,
  );

  // Auto-link telefones internacionais (ex: +55 11 99999-9999, +1 555-555-5555)
  text = text.replace(
    /(^|[\s])(\+\d{1,3}[\s\d().-]{7,}\d)/g,
    (_m, pre, phone) => {
      const clean = phone.replace(/\D/g, '');
      return `${pre}[${phone}](tel:+${clean})`;
    },
  );

  // Restaura códigos
  text = text.replace(/§§IC(\d+)§§/g, (_m, i) => inlineCodes[Number(i)] || '');
  text = text.replace(/§§CB(\d+)§§/g, (_m, i) => codeBlocks[Number(i)] || '');

  return text;
}

/**
 * Remove marcadores de formatação para previews em listas.
 * Colapsa quebras de linha e espaços.
 */
export function truncatePreview(input: string | null | undefined, maxLen = 80): string {
  if (!input) return '';
  let text = String(input)
    // remove marcadores wpp/markdown
    .replace(/```[\s\S]*?```/g, '[código]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]{1,2}([^*_~\n]+)[*_~]{1,2}/g, '$1')
    // colapsa whitespace
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLen) text = text.slice(0, maxLen - 1).trimEnd() + '…';
  return text;
}

const MEDIA_LABEL: Record<string, string> = {
  audio: '🎤 Áudio',
  image: '📷 Foto',
  sticker: '💟 Figurinha',
  video: '🎬 Vídeo',
  document: '📎 Documento',
};

/**
 * Gera o preview da última mensagem para listas (Inbox, histórico).
 * Se a mensagem tem mídia anexada, mostra o tipo (📷 Foto, 🎤 Áudio…)
 * — opcionalmente combinado com a legenda/conteúdo.
 */
export function previewWithMedia(
  content: string | null | undefined,
  metadata?: any,
  maxLen = 80,
): string {
  const media = metadata?.media;
  const mediaKind = typeof media?.kind === 'string' ? media.kind.toLowerCase() : null;
  const label = mediaKind ? MEDIA_LABEL[mediaKind] : null;
  const text = truncatePreview(content, maxLen);

  if (label && text) return `${label} · ${truncatePreview(text, maxLen - label.length - 3)}`;
  if (label) return label;
  return text;
}

export type MessageTimeVariant = 'bubble' | 'list' | 'full';

export function formatMessageTime(
  date: string | Date | null | undefined,
  variant: MessageTimeVariant = 'bubble',
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';

  if (variant === 'bubble') return format(d, 'HH:mm');

  if (variant === 'list') {
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Ontem';
    const diff = Math.abs(differenceInDays(new Date(), d));
    if (diff < 7) return format(d, 'EEEE', { locale: ptBR }).replace(/^./, (c) => c.toUpperCase());
    return format(d, 'dd/MM/yy');
  }

  // full
  return format(d, "d 'de' MMM 'às' HH:mm", { locale: ptBR });
}

export function formatSenderLabel(opts: {
  senderType: 'visitor' | 'agent' | 'bot';
  senderName?: string | null;
  isOwnMessage?: boolean;
  agentName?: string | null;
}): string {
  const { senderType, senderName, isOwnMessage, agentName } = opts;
  if (senderType === 'visitor') return senderName?.trim() || 'Visitante';
  if (senderType === 'bot') return `🤖 ${agentName?.trim() || senderName?.trim() || 'Agente IA'}`;
  if (isOwnMessage) return 'Você';
  const name = senderName?.trim();
  if (!name) return 'Agente';
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
