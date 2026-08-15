// meta-whatsapp-test
// Health check: valida credenciais, atualiza qualidade/tier, sincroniza templates.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { connection_id } = await req.json().catch(() => ({}));
  if (!connection_id) return json({ error: 'connection_id required' }, 400);

  const { data: conn, error } = await sb.from('whatsapp_meta_connections').select('*').eq('id', connection_id).maybeSingle();
  if (error || !conn) return json({ error: 'connection not found' }, 404);

  const accessToken = await decryptSecret(conn.access_token_encrypted);
  const checks: any = {};

  try {
    const phone: any = await graphFetch(`/${conn.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status`, accessToken);
    checks.phone = { ok: true, ...phone };
    await sb.from('whatsapp_meta_connections').update({
      status: 'active',
      last_error: null,
      last_health_check_at: new Date().toISOString(),
      quality_rating: phone?.quality_rating ?? null,
      messaging_limit_tier: phone?.messaging_limit_tier ?? null,
      phone_number: phone?.display_phone_number ?? conn.phone_number,
    }).eq('id', connection_id);
  } catch (e) {
    const ge = e as GraphError;
    const msg = ge.graph?.message ?? String(e);
    await sb.from('whatsapp_meta_connections').update({ status: 'error', last_error: msg, last_health_check_at: new Date().toISOString() }).eq('id', connection_id);
    return json({ ok: false, error: msg, checks }, 200);
  }

  try {
    const waba: any = await graphFetch(`/${conn.waba_id}?fields=name,id`, accessToken);
    checks.waba = { ok: true, ...waba };
  } catch (e) {
    checks.waba = { ok: false, error: (e as GraphError).graph?.message ?? String(e) };
  }

  // Subscribe app to WABA (idempotente)
  try {
    await graphFetch(`/${conn.waba_id}/subscribed_apps`, accessToken, { method: 'POST' });
    checks.subscribed_apps = { ok: true };
  } catch (e) {
    checks.subscribed_apps = { ok: false, error: (e as GraphError).graph?.message ?? String(e) };
  }

  // Sync templates inline
  try {
    const tpl: any = await graphFetch(`/${conn.waba_id}/message_templates?fields=name,language,status,category,components,id&limit=100`, accessToken);
    const items = tpl?.data ?? [];
    for (const t of items) {
      await sb.from('whatsapp_meta_templates').upsert({
        connection_id,
        organization_id: conn.organization_id,
        meta_template_id: String(t.id ?? ''),
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components ?? [],
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'connection_id,name,language' });
    }
    checks.templates = { ok: true, count: items.length };
  } catch (e) {
    checks.templates = { ok: false, error: (e as GraphError).graph?.message ?? String(e) };
  }

  return json({ ok: true, checks });
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
