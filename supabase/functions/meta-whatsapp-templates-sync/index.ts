// meta-whatsapp-templates-sync
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch } from '../_shared/meta-graph.ts';
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
  let next = `/${conn.waba_id}/message_templates?fields=name,language,status,category,components,quality_score,id,rejected_reason&limit=100`;
  const allNames: { name: string; language: string }[] = [];

  while (next) {
    const page: any = await graphFetch(next, accessToken);
    const items = page?.data ?? [];
    for (const t of items) {
      allNames.push({ name: t.name, language: t.language });
      await sb.from('whatsapp_meta_templates').upsert({
        connection_id,
        organization_id: conn.organization_id,
        meta_template_id: String(t.id ?? ''),
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components ?? [],
        quality_score: t.quality_score ?? null,
        rejected_reason: t.rejected_reason ?? null,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'connection_id,name,language' });
    }
    next = page?.paging?.next ?? '';
  }

  return json({ ok: true, count: allNames.length, templates: allNames });
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
