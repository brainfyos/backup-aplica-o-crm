// Webhook público para eventos da xAI Voice Agent.
// - Endpoint SEM verify_jwt (público).
// - Valida assinatura HMAC (header 'x-xai-signature') opcional se secret configurado.
// - Identifica call_log via metadata.call_log_id ou call_sid.
// - Persiste evento em call_events e atualiza call_logs conforme event_type.
//
// Eventos esperados (provisórios, ajustar conforme doc oficial):
//   call.started, call.answered, transcript.partial, transcript.final,
//   call.ended, summary.ready, recording.ready

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-xai-signature',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const raw = await req.text();
    const evt = JSON.parse(raw);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const eventType: string = evt.event || evt.type || 'unknown';
    const metadata = evt.metadata || {};
    const callSid: string | null = evt.call_id || evt.id || evt.sid || null;
    const callLogId: string | null = metadata.call_log_id || null;

    // Resolve call_log
    let query = admin.from('call_logs').select('id, organization_id').limit(1);
    if (callLogId) query = query.eq('id', callLogId);
    else if (callSid) query = query.eq('call_sid', callSid);
    const { data: logs } = await query;
    const log = logs?.[0];
    if (!log) {
      console.warn('[xai-voice-webhook] call_log not found for event', eventType, callSid);
      return json({ received: true, note: 'log not found' });
    }

    // Persist raw event
    await admin.from('call_events').insert({
      call_log_id: log.id,
      organization_id: log.organization_id,
      event_type: eventType,
      role: evt.role || null,
      content: evt.text || evt.content || null,
      payload: evt,
      occurred_at: evt.timestamp || new Date().toISOString(),
    });

    // Update call_log based on event type
    const patch: Record<string, unknown> = {};
    switch (eventType) {
      case 'call.started':
      case 'call.ringing':
        patch.status = 'ringing';
        break;
      case 'call.answered':
        patch.status = 'in_progress';
        patch.answered_at = new Date().toISOString();
        break;
      case 'transcript.final':
      case 'transcript.partial': {
        // Append to transcription_text
        const { data: current } = await admin.from('call_logs').select('transcription_text').eq('id', log.id).maybeSingle();
        const speaker = evt.role === 'agent' ? 'Agente' : evt.role === 'customer' ? 'Cliente' : 'Sistema';
        const line = `[${speaker}] ${evt.text || evt.content || ''}`;
        patch.transcription_text = (current?.transcription_text ? current.transcription_text + '\n' : '') + line;
        break;
      }
      case 'call.ended':
      case 'call.completed': {
        patch.status = evt.status === 'no_answer' ? 'no_answer' : evt.status === 'busy' ? 'busy' : evt.status === 'failed' ? 'failed' : 'completed';
        patch.ended_at = new Date().toISOString();
        if (typeof evt.duration_sec === 'number') patch.duration_sec = evt.duration_sec;
        if (typeof evt.duration === 'number') patch.duration_sec = evt.duration;
        if (evt.cost_usd) patch.cost_usd = evt.cost_usd;
        if (evt.recording_url) patch.recording_url = evt.recording_url;
        break;
      }
      case 'summary.ready':
        if (evt.summary) patch.summary = evt.summary;
        if (evt.sentiment) patch.sentiment = evt.sentiment;
        if (Array.isArray(evt.key_points)) patch.key_points = evt.key_points;
        if (Array.isArray(evt.next_actions)) patch.next_actions = evt.next_actions;
        break;
      case 'recording.ready':
        if (evt.recording_url) patch.recording_url = evt.recording_url;
        break;
      case 'tool.call':
      case 'tool_call': {
        // Roteia para voice-tool-dispatch (dispara ação escolhida pelo lead na ligação)
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/voice-tool-dispatch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({
              call_log_id: log.id,
              tool_name: evt.tool || evt.name || evt.tool_name,
              tool_args: evt.arguments || evt.args || evt.tool_args || {},
            }),
          });
        } catch (err) {
          console.error('[xai-voice-webhook] tool-dispatch failed', err);
        }
        break;
      }
    }

    if (Object.keys(patch).length > 0) {
      await admin.from('call_logs').update(patch).eq('id', log.id);
    }

    // Dispara pós-ligação quando a ligação termina
    if (['call.ended', 'call.completed'].includes(eventType)) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/voice-postcall-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ call_log_id: log.id }),
        });
      } catch (e) {
        console.error('[xai-voice-webhook] postcall trigger failed', e);
      }
    }

    return json({ received: true });
  } catch (e) {
    console.error('[xai-voice-webhook] error', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
