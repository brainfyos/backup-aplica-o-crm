// voice-tool-dispatch — chamado pelo xai-voice-webhook quando o agente Grok
// aciona uma tool durante a ligação. Executa a ação escolhida pelo lead:
// agendar reunião, enviar link por WhatsApp/SMS/email, gerar checkout, marcar desinteresse.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const { call_log_id, tool_name, tool_args } = await req.json().catch(() => ({}));
    if (!call_log_id || !tool_name) return json({ error: 'call_log_id and tool_name required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: log } = await admin
      .from('call_logs')
      .select('id, organization_id, lead_id, campaign_id, campaign_target_id')
      .eq('id', call_log_id)
      .maybeSingle();
    if (!log) return json({ error: 'call_log not found' }, 404);

    const { data: lead } = log.lead_id
      ? await admin.from('leads').select('id, name, email, phone').eq('id', log.lead_id).maybeSingle()
      : { data: null };

    const { data: campaign } = log.campaign_id
      ? await admin.from('voice_campaigns').select('*').eq('id', log.campaign_id).maybeSingle()
      : { data: null };

    let stage = 'talked';
    let chosen_channel: string | null = null;
    const chosen_payload: Record<string, unknown> = { tool_name, ...(tool_args || {}) };

    switch (tool_name) {
      case 'agendar_reuniao': {
        stage = 'chose_meeting';
        chosen_channel = 'meeting';
        // Cria evento de calendário simplificado; app formal usa booking-* — aqui só reservamos slot
        const slot = tool_args?.slot_iso ? new Date(tool_args.slot_iso) : new Date(Date.now() + 24 * 3600_000);
        await admin.from('calendar_events').insert({
          organization_id: log.organization_id,
          lead_id: log.lead_id,
          title: `Reunião — ${lead?.name || 'Lead'}`,
          starts_at: slot.toISOString(),
          ends_at: new Date(slot.getTime() + 30 * 60000).toISOString(),
          status: 'confirmed',
          metadata: { via: 'voice_campaign', call_log_id },
        }).catch(() => {});
        break;
      }
      case 'enviar_link_whatsapp': {
        stage = 'chose_whatsapp';
        chosen_channel = 'whatsapp';
        // Dispara via manual-outreach (mensagem simples com o link)
        const link = tool_args?.link || tool_args?.url;
        const message = `${tool_args?.message || 'Aqui está o link que combinamos:'} ${link || ''}`.trim();
        if (lead?.phone && link) {
          await fetch(`${SUPABASE_URL}/functions/v1/manual-outreach`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({
              lead_ids: [log.lead_id],
              agent_id: null,
              organization_id: log.organization_id,
              objective: message,
              force_manual_followup: true,
            }),
          }).catch(() => {});
        }
        chosen_payload.link = link;
        break;
      }
      case 'enviar_link_sms':
        stage = 'chose_sms';
        chosen_channel = 'sms';
        // Placeholder — provedor SMS ainda não integrado; apenas registra escolha
        break;
      case 'enviar_link_email': {
        stage = 'chose_email';
        chosen_channel = 'email';
        break;
      }
      case 'finalizar_compra': {
        stage = 'chose_checkout';
        chosen_channel = tool_args?.channel || 'whatsapp';
        chosen_payload.offer_id = tool_args?.offer_id;
        break;
      }
      case 'marcar_desinteresse':
        stage = 'lost';
        chosen_payload.reason = tool_args?.motivo;
        break;
    }

    const { data: journey } = await admin.from('voice_campaign_journeys').insert({
      organization_id: log.organization_id,
      campaign_id: log.campaign_id,
      lead_id: log.lead_id,
      target_id: log.campaign_target_id,
      call_log_id,
      stage,
      chosen_channel,
      chosen_payload,
      utm: campaign ? { utm_source: 'voice_campaign', utm_campaign: campaign.id, utm_content: call_log_id } : {},
    }).select('id').single();

    return json({ ok: true, journey_id: journey?.id, stage });
  } catch (e) {
    console.error('[voice-tool-dispatch]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
