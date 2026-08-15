// Shared temporal-awareness block injected into every AI agent/outreach prompt.
// Goal: prevent the model from referencing past events (calls, deadlines, meetings)
// as if they were still in the future. The block is stateless and cheap to regenerate.

export function formatNowInTZ(tz = 'America/Sao_Paulo'): string {
  try {
    const fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz,
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    // Ex: "quarta-feira, 03/07/2026 10:55"
    return fmt.format(new Date()).replace(',', ',');
  } catch {
    return new Date().toISOString();
  }
}

export function buildTemporalPromptBlock(tz = 'America/Sao_Paulo'): string {
  const now = formatNowInTZ(tz);
  return `\n\n🗓️ CONTEXTO TEMPORAL (obrigatório respeitar):
- Hoje é ${now} (fuso ${tz}).
- SEMPRE compare qualquer data/compromisso citado no histórico com HOJE antes de mencionar.
- Se o evento (call, reunião, envio, prazo, "terça às 14h", etc.) JÁ PASSOU: trate como passado. Pergunte como foi, o que ficou pendente, e proponha o PRÓXIMO passo. É PROIBIDO falar como se ainda fosse acontecer (ex: "na nossa call de terça" quando terça já passou).
- Se o evento é HOJE: confirme presença/horário de forma objetiva.
- Se é FUTURO: pode reforçar, sem repetir a cada mensagem.
- Nunca invente datas. Em dúvida, pergunte ao lead.`;
}
