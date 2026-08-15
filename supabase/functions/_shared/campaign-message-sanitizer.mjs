const INTERNAL_CAMPAIGN_LINE = /^\s*(?:[#>*_-]+\s*)?(?:objetivo(?:\s+da\s+campanha|\s+desta\s+abordagem)?|tom(?:\s+de\s+voz)?|cta|miss[aã]o|briefing(?:\s+da\s+mensagem)?|contexto(?:\s+interno|\s+da\s+campanha)?|instru[cç][oõ]es(?:\s+internas)?|estilo\s+de\s+mensagem)\s*:/i;
const INTERNAL_CAMPAIGN_HEADER = /^\s*(?:[#>*_-]+\s*)?(?:🤖\s*)?(?:agente|assistente)\s+ia\s*[:.-]?\s*$/i;
const INTERNAL_FENCE = /^\s*(?:```|"""|''')\s*$/;

/**
 * Barreira de saída das Campanhas Inteligentes.
 * Objetivo, tom, CTA e demais metadados ajudam a IA a redigir, mas nunca são
 * conteúdo para o contato. O filtro é deliberadamente restrito a linhas com
 * rótulos internos para não reescrever a mensagem comercial gerada.
 *
 * @param {string | null | undefined} text
 * @returns {{ text: string, removed: string[] }}
 */
export function sanitizeCampaignFacingMessage(text) {
  const removed = [];
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const kept = lines.filter((line) => {
    const internal = INTERNAL_CAMPAIGN_LINE.test(line)
      || INTERNAL_CAMPAIGN_HEADER.test(line)
      || INTERNAL_FENCE.test(line);
    if (internal) removed.push(line.trim());
    return !internal;
  });

  return {
    text: kept
      .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
      .join('\n')
      .replace(/^\s+|\s+$/g, '')
      .replace(/\n{3,}/g, '\n\n'),
    removed,
  };
}
