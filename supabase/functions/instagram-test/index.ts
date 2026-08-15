// instagram-test — health-check da conexão. Suporta os 2 modos de auth.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { igGraphFetch, IgGraphError } from '../_shared/ig-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { connection_id } = await req.json().catch(() => ({}));
  if (!connection_id) return json({ error: 'connection_id required' }, 400);

  const { data: conn } = await sb.from('instagram_connections').select('*').eq('id', connection_id).maybeSingle();
  if (!conn) return json({ error: 'not found' }, 404);

  try {
    if (conn.ig_auth_style === 'ig_user_token') {
      if (!conn.ig_user_access_token_encrypted) throw new Error('conexão sem IG User Access Token — reconecte');
      const token = await decryptSecret(conn.ig_user_access_token_encrypted);
      const ig = await igGraphFetch<any>(`/me?fields=id,user_id,username,name,followers_count`, token);
      const igUserId = String(ig?.id ?? ig?.user_id ?? '');
      const subs = await igGraphFetch<any>(`/${igUserId || conn.ig_business_account_id}/subscribed_apps`, token).catch(() => ({ data: [] }));
      const subscribed = Array.isArray(subs?.data) && subs.data.length > 0;
      await sb.from('instagram_connections').update({
        status: 'active',
        last_error: null,
        ...(igUserId ? { ig_user_id: igUserId } : {}),
      }).eq('id', connection_id);
      return json({ ok: true, ig, subscribed, mode: 'ig_user_token', ig_user_id: igUserId || null });
    }

    const token = await decryptSecret(conn.page_access_token_encrypted);
    const ig = await graphFetch<any>(`/${conn.ig_business_account_id}?fields=username,name,followers_count`, token);
    const subs = await graphFetch<any>(`/${conn.fb_page_id}/subscribed_apps`, token).catch(() => ({ data: [] }));
    const subscribed = Array.isArray(subs?.data) && subs.data.length > 0;
    await sb.from('instagram_connections').update({ status: 'active', last_error: null }).eq('id', connection_id);
    return json({ ok: true, ig, subscribed, mode: 'page_token' });
  } catch (e) {
    const ge = e as GraphError | IgGraphError;
    const msg = (ge as any).graph?.message ?? String(e);
    await sb.from('instagram_connections').update({ status: 'error', last_error: msg }).eq('id', connection_id);
    return json({ ok: false, error: msg }, 200);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
