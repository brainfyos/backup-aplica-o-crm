// meta-oauth-finalize
// Cliente autenticado escolhe entre os assets descobertos e cria/atualiza as conexões.
// Payload:
//   { session_id, instagram?: { fb_page_id, ig_business_account_id, display_name? },
//                  ads?: { ad_account_id, business_id?, account_name? } }

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { encryptSecret, decryptSecret, generateVerifyToken } from '../_shared/meta-crypto.ts';
import { loadPlatformMetaApp } from '../_shared/meta-oauth.ts';
import { subscribeIgWebhookFields, IG_SUBSCRIBED_FIELDS } from '../_shared/ig-subscribe.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const sbUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await sbUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const { session_id, instagram, ads } = body ?? {};
  if (!session_id) return json({ error: 'session_id ausente' }, 400);

  const { data: session, error: sErr } = await sbAdmin
    .from('meta_oauth_sessions')
    .select('*')
    .eq('id', session_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (sErr || !session) return json({ error: 'sessão não encontrada' }, 404);
  if (session.status !== 'ready') return json({ error: `sessão em estado ${session.status}` }, 400);

  const userToken = await decryptSecret(session.user_access_token_encrypted!);
  const app = await loadPlatformMetaApp();
  const results: Record<string, unknown> = {};

  // ---------- Instagram ----------
  if (instagram?.fb_page_id && instagram?.ig_business_account_id) {
    const pages = (session.discovered?.pages ?? []) as any[];
    const page = pages.find((p) => String(p.id) === String(instagram.fb_page_id));
    if (!page) return json({ error: 'página escolhida não encontrada na sessão' }, 400);
    if (!page.access_token) return json({ error: 'page_access_token indisponível' }, 400);
    const igId = String(instagram.ig_business_account_id);
    const igMeta = page.instagram_business_account;
    if (!igMeta || String(igMeta.id) !== igId) {
      return json({ error: 'IG account não corresponde à página' }, 400);
    }

    const subscribeResult = await subscribeIgWebhookFields({
      fb_page_id: String(page.id),
      page_access_token: String(page.access_token),
      app_id: app.app_id,
      app_secret: app.app_secret,
      fields: IG_SUBSCRIBED_FIELDS,
    });

    const displayName = instagram.display_name || `${page.name} · @${igMeta.username ?? ''}`.trim();
    const capabilities = {
      receive_dms: subscribeResult.granted.includes('messages'),
      receive_comments: subscribeResult.granted.includes('feed'),
      receive_mentions: subscribeResult.granted.includes('mention'),
      receive_reactions: subscribeResult.granted.includes('message_reactions'),
      send_dms: subscribeResult.granted.includes('messages'),
      reply_comments: subscribeResult.granted.includes('feed'),
      like_comments: subscribeResult.granted.includes('feed'),
      private_reply: subscribeResult.granted.includes('feed'),
    };
    const essentialsReady = capabilities.receive_dms && capabilities.receive_comments;
    const { data: existing } = await sbAdmin
      .from('instagram_connections')
      .select('id')
      .eq('organization_id', session.organization_id)
      .eq('ig_business_account_id', igId)
      .maybeSingle();

    const payload = {
      organization_id: session.organization_id,
      display_name: displayName,
      auth_mode: 'platform_oauth',
      app_id: app.app_id,
      fb_page_id: String(page.id),
      fb_page_name: page.name,
      ig_business_account_id: igId,
      ig_username: igMeta.username ?? null,
      page_access_token_encrypted: await encryptSecret(page.access_token),
      user_access_token_encrypted: await encryptSecret(userToken),
      // O webhook da Meta assina cada payload com o App Secret da plataforma.
      // Sem persistir este segredo na conexão, todos os eventos legítimos são
      // rejeitados por HMAC antes de chegarem ao motor de automações.
      app_secret_encrypted: await encryptSecret(app.app_secret),
      token_expires_at: session.token_expires_at,
      status: essentialsReady ? (subscribeResult.failed.length === 0 ? 'active' : 'partial') : 'error',
      last_error: subscribeResult.error_summary,
      subscribed_fields: subscribeResult.granted,
      capabilities,
    };

    if (existing?.id) {
      const { error: updateErr } = await sbAdmin
        .from('instagram_connections')
        .update(payload)
        .eq('id', existing.id);
      if (updateErr) return json({ error: `instagram: ${updateErr.message}` }, 500);
      results.instagram = { id: existing.id, updated: true, subscribed: subscribeResult.failed.length === 0, failed: subscribeResult.failed, missing_scopes: subscribeResult.missing_scopes };
    } else {
      const { data: ins, error: insErr } = await sbAdmin
        .from('instagram_connections')
        .insert({
          ...payload,
          created_by: userId,
          webhook_verify_token: generateVerifyToken(),
        })
        .select('id')
        .single();
      if (insErr) return json({ error: `instagram: ${insErr.message}` }, 500);
      results.instagram = { id: ins.id, created: true, subscribed: subscribeResult.failed.length === 0, failed: subscribeResult.failed, missing_scopes: subscribeResult.missing_scopes };
    }
  }

  // ---------- Ads ----------
  if (ads?.ad_account_id) {
    const list = (session.discovered?.ad_accounts ?? []) as any[];
    const acct = list.find((a) => String(a.id) === String(ads.ad_account_id) || String(a.account_id) === String(ads.ad_account_id));
    if (!acct) return json({ error: 'ad account não encontrada na sessão' }, 400);

    const payload = {
      organization_id: session.organization_id,
      provider: 'meta',
      auth_mode: 'platform_oauth',
      access_token_encrypted: await encryptSecret(userToken),
      expires_at: session.token_expires_at,
      ad_account_id: acct.id,
      business_id: acct.business?.id ?? ads.business_id ?? null,
      account_name: acct.name ?? ads.account_name ?? null,
      is_active: true,
      last_sync_status: null,
      last_sync_error: null,
    };
    const { data: existingAds } = await sbAdmin
      .from('org_marketing_credentials')
      .select('id')
      .eq('organization_id', session.organization_id)
      .eq('provider', 'meta')
      .eq('ad_account_id', acct.id)
      .maybeSingle();

    if (existingAds?.id) {
      const { error: updateErr } = await sbAdmin
        .from('org_marketing_credentials')
        .update(payload)
        .eq('id', existingAds.id);
      if (updateErr) return json({ error: `ads: ${updateErr.message}` }, 500);
      results.ads = { id: existingAds.id, ad_account_id: acct.id, account_name: payload.account_name, updated: true };
    } else {
      const { data: ins, error: insErr } = await sbAdmin
        .from('org_marketing_credentials')
        .insert(payload)
        .select('id')
        .single();
      if (insErr) return json({ error: `ads: ${insErr.message}` }, 500);
      results.ads = { id: ins.id, ad_account_id: acct.id, account_name: payload.account_name, created: true };
    }
  }

  await sbAdmin.from('meta_oauth_sessions')
    .update({ status: 'consumed', consumed_at: new Date().toISOString() })
    .eq('id', session.id);

  return json({ ok: true, ...results });
});
