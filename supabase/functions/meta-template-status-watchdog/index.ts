// meta-template-status-watchdog
// Cron 15 min: percorre conexões Meta ativas, dispara sync de templates
// e notifica admins sobre rejeições novas.
// verify_jwt = false (cron interno).

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { data: conns } = await sb
    .from('whatsapp_meta_connections')
    .select('id, organization_id, display_name')
    .eq('status', 'active');

  let synced = 0;
  const newlyRejected: Array<{ org: string; name: string; reason: string | null }> = [];

  for (const c of (conns ?? [])) {
    // Captura status anterior dos REJECTED conhecidos para diff
    const { data: prevRejected } = await sb
      .from('whatsapp_meta_templates')
      .select('id, name')
      .eq('connection_id', c.id)
      .eq('status', 'REJECTED');
    const prevIds = new Set((prevRejected ?? []).map((r: any) => r.id));

    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/meta-whatsapp-templates-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ connection_id: c.id }),
      });
      if (r.ok) synced++;
    } catch (e) {
      console.error('[watchdog] sync error', c.id, e);
      continue;
    }

    // Após sync, busca novos REJECTED
    const { data: nowRejected } = await sb
      .from('whatsapp_meta_templates')
      .select('id, name, rejected_reason')
      .eq('connection_id', c.id)
      .eq('status', 'REJECTED');
    for (const t of (nowRejected ?? [])) {
      if (!prevIds.has(t.id)) {
        newlyRejected.push({ org: c.organization_id, name: t.name, reason: t.rejected_reason });
        // Notificação admin
        try {
          await sb.from('admin_notifications').insert({
            organization_id: c.organization_id,
            type: 'system',
            title: `Template "${t.name}" foi rejeitado pela Meta`,
            message: t.rejected_reason ?? 'Sem motivo informado. Edite o template e reenvie.',
            scope: 'all',
          });
        } catch (e) { console.error('[watchdog] notify error', e); }
      }

    }
  }

  return new Response(JSON.stringify({ ok: true, connections: conns?.length ?? 0, synced, newlyRejected: newlyRejected.length }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
