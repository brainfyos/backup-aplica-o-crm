// optin-guard: verifica se um lead pode receber WhatsApp.
// Lead opta por sair → whatsapp_opt_in=false. Soft mode: null = pode enviar.

export async function canSendWhatsAppToLead(sb: any, leadId: string | null | undefined): Promise<boolean> {
  if (!leadId) return true;
  try {
    const { data, error } = await sb.from('leads').select('whatsapp_opt_in').eq('id', leadId).maybeSingle();
    if (error) return false;
    return data?.whatsapp_opt_in !== false;
  } catch { return false; }
}

/** Lê opt-in por telefone (DDI 55 normalizado) — útil quando só temos o número. */
export async function canSendWhatsAppToPhone(sb: any, organizationId: string, phoneNormalized: string): Promise<boolean> {
  if (!phoneNormalized) return true;
  try {
    const { data, error } = await sb.from('leads').select('whatsapp_opt_in').eq('organization_id', organizationId).eq('phone', phoneNormalized).maybeSingle();
    if (error) return false;
    return data?.whatsapp_opt_in !== false;
  } catch { return false; }
}

const OPT_OUT_PATTERNS = [
  /^sair da lista$/i,
  /^sair$/i,
  /^cancelar$/i,
  /^parar$/i,
  /^stop$/i,
  /^unsubscribe$/i,
  /^descadastrar$/i,
  /^remover$/i,
];

export function isOptOutMessage(text: string | null | undefined, payloadId?: string | null): boolean {
  if (payloadId && /^opt[_-]?out$/i.test(payloadId)) return true;
  if (!text) return false;
  const t = String(text).trim();
  if (!t) return false;
  return OPT_OUT_PATTERNS.some((re) => re.test(t));
}

/** Marca lead como opted-out e dispara cadence-stop para enrollments ativos. */
export async function markLeadOptOut(sb: any, leadId: string | null | undefined, organizationId: string): Promise<void> {
  if (!leadId) return;
  await sb.from('leads').update({
    whatsapp_opt_in: false,
    whatsapp_opted_out_at: new Date().toISOString(),
  }).eq('id', leadId);

  // Para cadências ativas do lead
  try {
    const { data: enrs } = await sb.from('cadence_enrollments').select('id').eq('lead_id', leadId).eq('status', 'active');
    for (const e of (enrs ?? [])) {
      try {
        await sb.functions.invoke('cadence-stop', {
          body: { enrollment_id: e.id, reason: 'whatsapp_opt_out' },
        });
      } catch (err) { console.error('[optin-guard] cadence-stop error', err); }
    }
  } catch (e) { console.error('[optin-guard] enrollments lookup error', e); }

  // Cancela campaign_targets pendentes
  try {
    await sb.from('campaign_targets').update({
      status: 'cancelled',
      error: 'whatsapp_opt_out',
    }).eq('lead_id', leadId).in('status', ['queued', 'sending']);
  } catch (e) { console.error('[optin-guard] campaign_targets cancel error', e); }

  // Cancela abordagens e mensagens ainda pendentes em outros motores.
  try {
    await sb.from('ai_outreach_queue').update({
      status: 'cancelled',
      error_message: 'whatsapp_opt_out',
    }).eq('lead_id', leadId).in('status', ['pending', 'processing', 'scheduled']);
  } catch (e) { console.error('[optin-guard] outreach queue cancel error', e); }
}

