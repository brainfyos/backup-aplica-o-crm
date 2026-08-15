// instagram-subscribe-fields
// Re-inscreve os campos do webhook numa conexão IG já ativa.
// Modo 'page_token': POST /{fb_page_id}/subscribed_apps (Page token, escopos pages_*).
// Modo 'ig_user_token': POST /{ig_user_id}/subscribed_apps em graph.instagram.com (IG User token).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { subscribeIgWebhookFields, IG_SUBSCRIBED_FIELDS } from '../_shared/ig-subscribe.ts';
import { igSubscribeWebhookFields, IG_SUBSCRIBED_FIELDS_NEW } from '../_shared/ig-graph.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'unauthorized' }, 401);

  const sbUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userData } = await sbUser.auth.getUser();
  if (!userData?.user) return json({ error: 'unauthorized' }, 401);

  const { connection_id } = await req.json().catch(() => ({}));
  if (!connection_id) return json({ error: 'connection_id required' }, 400);

  const { data: conn } = await sbAdmin
    .from('instagram_connections')
    .select('id, organization_id, fb_page_id, ig_business_account_id, app_id, page_access_token_encrypted, ig_user_access_token_encrypted, app_secret_encrypted, ig_auth_style, status')
    .eq('id', connection_id)
    .maybeSingle();
  if (!conn) return json({ error: 'connection not found' }, 404);

  const { data: belongs } = await sbAdmin.rpc('user_belongs_to_organization', {
    _user_id: userData.user.id, _org_id: conn.organization_id,
  });
  if (!belongs) return json({ error: 'forbidden' }, 403);

  try {
    if (conn.ig_auth_style === 'ig_user_token') {
      if (!conn.ig_user_access_token_encrypted) {
        return json({ error: 'conexão sem IG User Access Token — reconecte' }, 400);
      }
      const token = await decryptSecret(conn.ig_user_access_token_encrypted);
      const result = await igSubscribeWebhookFields({
        ig_user_id: String(conn.ig_business_account_id),
        ig_user_token: token,
        fields: IG_SUBSCRIBED_FIELDS_NEW,
      });
      await sbAdmin.from('instagram_connections')
        .update({
          subscribed_fields: result.granted,
          last_error: result.error_summary,
          status: result.failed.length === 0 ? 'active' : 'error',
          webhook_subscribed_at: new Date().toISOString(),
        })
        .eq('id', connection_id);
      const ok = result.failed.length === 0;
      return json({
        ok, mode: 'ig_user_token',
        granted: result.granted, attempted: result.attempted, failed: result.failed,
        error: ok ? undefined : result.error_summary,
      }, ok ? 200 : 400);
    }

    // page_token legado
    if (!conn.fb_page_id || !conn.page_access_token_encrypted) {
      return json({ error: 'conexão sem page_access_token — refaça a conexão' }, 400);
    }
    const token = await decryptSecret(conn.page_access_token_encrypted);
    let appSecret: string | undefined;
    if (conn.app_secret_encrypted) {
      try { appSecret = await decryptSecret(conn.app_secret_encrypted); } catch (_) { /* opcional */ }
    }
    const result = await subscribeIgWebhookFields({
      fb_page_id: conn.fb_page_id,
      page_access_token: token,
      app_id: conn.app_id ?? undefined,
      app_secret: appSecret,
      fields: IG_SUBSCRIBED_FIELDS,
    });
    await sbAdmin.from('instagram_connections')
      .update({
        subscribed_fields: result.granted,
        last_error: result.error_summary,
        status: result.failed.length === 0 ? 'active' : 'error',
        webhook_subscribed_at: new Date().toISOString(),
      })
      .eq('id', connection_id);
    const ok = result.failed.length === 0;
    return json({
      ok, mode: 'page_token',
      granted: result.granted, attempted: result.attempted, failed: result.failed,
      token_scopes: result.token_scopes, missing_scopes: result.missing_scopes,
      error: ok ? undefined : result.error_summary,
    }, ok ? 200 : 400);
  } catch (e) {
    console.error('[instagram-subscribe-fields] failed', e);
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
