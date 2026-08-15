// Webhook de INBOUND para o número nativo da xAI.
// Recebido quando alguém liga para o número Grok Voice provisionado.
// Fluxo:
//   1. Normaliza número do caller e tenta casar com lead (por org).
//   2. Se não achar lead → cria um lead novo (source='voice_inbound').
//   3. Cria call_log (direction=inbound) e retorna instruções para a xAI de qual
//      agente inbound_default usar (system_prompt).
//   4. Eventos subsequentes (transcript, ended, summary) chegam em xai-voice-webhook.
//
// Este endpoint precisa que a xAI envie um header/param identificando a org
// (ou mapeamento por número). Como no MVP cada org tem 1 número xAI, tentamos
// resolver pela chave xAI que fez a chamada (payload deve trazer 'organization_id'
// via metadata configurada no Voice Builder da xAI).

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function normalizePhone(raw: string) {
  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const evt = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const orgId: string | null = evt.metadata?.organization_id || evt.organization_id || null;
    if (!orgId) return json({ error: 'missing organization_id in metadata' }, 400);

    const from = normalizePhone(evt.from || evt.caller_number || '');
    const to = evt.to || evt.called_number || null;

    // Try to find lead by phone in this org
    let leadId: string | null = null;
    if (from) {
      const variants = [from, from.replace(/^55/, ''), '+' + from];
      const { data: leads } = await admin
        .from('leads')
        .select('id')
        .eq('organization_id', orgId)
        .in('phone', variants)
        .limit(1);
      leadId = leads?.[0]?.id || null;

      // Auto-create lead if not found
      if (!leadId) {
        const { data: newLead } = await admin
          .from('leads')
          .insert({
            organization_id: orgId,
            name: `Ligação de ${from}`,
            phone: from,
            source: 'voice_inbound',
          })
          .select('id')
          .maybeSingle();
        leadId = newLead?.id || null;
      }
    }

    // Resolve inbound default agent
    const { data: agent } = await admin
      .from('voice_agents')
      .select('id, system_prompt, voice_option, language, external_agent_id')
      .eq('organization_id', orgId)
      .eq('is_inbound_default', true)
      .eq('is_active', true)
      .maybeSingle();

    // Create call_log
    const { data: callLog } = await admin
      .from('call_logs')
      .insert({
        organization_id: orgId,
        lead_id: leadId,
        voice_agent_id: agent?.id || null,
        provider: 'xai',
        direction: 'inbound',
        from_number: from,
        to_number: to,
        call_sid: evt.call_id || evt.id || null,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        answered_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    return json({
      accept: true,
      call_log_id: callLog?.id,
      lead_id: leadId,
      // Instrução para xAI: use este system_prompt neste atendimento
      agent: agent ? {
        id: agent.id,
        external_agent_id: agent.external_agent_id,
        system_prompt: agent.system_prompt,
        voice: agent.voice_option,
        language: agent.language,
      } : null,
      // Webhook para eventos subsequentes
      event_webhook: `${SUPABASE_URL}/functions/v1/xai-voice-webhook`,
      metadata: { call_log_id: callLog?.id, organization_id: orgId, lead_id: leadId },
    });
  } catch (e) {
    console.error('[xai-voice-inbound] error', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
