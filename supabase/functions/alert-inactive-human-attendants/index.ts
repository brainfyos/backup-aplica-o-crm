// alert-inactive-human-attendants
// Cron periódico (recomendado: a cada 5 min) que percorre conversas em
// `human_active` com `human_response_pending_since` mais antigo que o threshold
// e ainda sem alerta enviado, notificando o vendedor responsável (push) e
// registrando um agent_alert para o admin. NÃO devolve para IA.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushToUsers } from '../_shared/push.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Threshold default: 30 min sem resposta humana. Pode ser sobrescrito via body.
const DEFAULT_THRESHOLD_MIN = 30;
// Após alertar, esperar ao menos este intervalo antes de re-alertar (evita spam).
const RE_ALERT_MIN = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let thresholdMin = DEFAULT_THRESHOLD_MIN;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.threshold_minutes === 'number' && body.threshold_minutes > 0) {
      thresholdMin = body.threshold_minutes;
    }
  } catch { /* ignore */ }

  const cutoff = new Date(Date.now() - thresholdMin * 60_000).toISOString();
  const reAlertCutoff = new Date(Date.now() - RE_ALERT_MIN * 60_000).toISOString();

  const { data: rows, error } = await supabase
    .from('webchat_conversations')
    .select('id, organization_id, assigned_to, visitor_name, visitor_phone, human_response_pending_since, human_response_alert_sent_at')
    .eq('status', 'human_active')
    .not('human_response_pending_since', 'is', null)
    .lte('human_response_pending_since', cutoff)
    .limit(500);

  if (error) {
    console.error('[alert-inactive-human] query error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let notified = 0;
  let skipped = 0;

  for (const c of rows ?? []) {
    // Cooldown de re-alerta
    if (c.human_response_alert_sent_at && c.human_response_alert_sent_at > reAlertCutoff) {
      skipped++;
      continue;
    }

    const pendingSinceMs = new Date(c.human_response_pending_since!).getTime();
    const waitingMin = Math.round((Date.now() - pendingSinceMs) / 60_000);
    const label = c.visitor_name || c.visitor_phone || 'Cliente';

    // Push ao vendedor responsável
    if (c.assigned_to) {
      try {
        await sendPushToUsers(
          supabase,
          [c.assigned_to],
          {
            title: `Cliente aguardando há ${waitingMin} min`,
            body: `${label} enviou uma mensagem e ainda não recebeu resposta.`,
            tag: `human-sla-${c.id}`,
            url: `/inbox?conversation=${c.id}`,
            data: { conversation_id: c.id, type: 'human_sla' },
            requireInteraction: true,
          },
          'push_new_message',
        );
      } catch (e) {
        console.warn('[alert-inactive-human] push failed', e);
      }
    }

    // Registro em agent_alerts (visível no admin) — best-effort
    try {
      await supabase.from('agent_alerts').insert({
        organization_id: c.organization_id,
        conversation_id: c.id,
        alert_type: 'human_no_response',
        severity: waitingMin >= thresholdMin * 2 ? 'high' : 'medium',
        message: `Vendedor não respondeu ao cliente ${label} há ${waitingMin} minutos.`,
        metadata: { waiting_minutes: waitingMin, assigned_to: c.assigned_to },
      });
    } catch (e) {
      // Tabela pode não existir em orgs antigas — não fatal.
      console.warn('[alert-inactive-human] agent_alerts insert skipped', (e as Error)?.message);
    }

    await supabase
      .from('webchat_conversations')
      .update({ human_response_alert_sent_at: new Date().toISOString() })
      .eq('id', c.id);

    notified++;
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: rows?.length ?? 0, notified, skipped, threshold_minutes: thresholdMin }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
