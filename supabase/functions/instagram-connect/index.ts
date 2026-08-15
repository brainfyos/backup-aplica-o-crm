// instagram-connect
// Promove uma conexão Instagram em rascunho para ATIVA.
// Suporta 2 modos de auth (ig_auth_style):
//   - 'page_token' (padrão via Facebook Login for Business, Graph v25.0):
//        Usa Page Access Token contra graph.facebook.com. Aceita também um User
//        Access Token (temporário) e converte automaticamente para o Page Token
//        correspondente via /me/accounts, descartando o User token.
//   - 'ig_user_token' ("Instagram API with Instagram Login"): usa IG User Access
//        Token contra graph.instagram.com, keyed por IG User ID.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { igGraphFetch, IgGraphError, igSubscribeWebhookFields } from '../_shared/ig-graph.ts';
import { encryptSecret } from '../_shared/meta-crypto.ts';
import { subscribeIgWebhookFields } from '../_shared/ig-subscribe.ts';
import {
  igPageGraphFetch,
  IgPageGraphError,
  debugAccessToken,
  listPagesForUserToken,
  IG_PAGE_GRAPH_VERSION,
} from '../_shared/ig-page-graph.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const sbUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData, error: userErr } = await sbUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
  const userId = userData.user.id;

  const body = await req.json().catch(() => ({}));
  const {
    connection_id,
    organization_id,
    display_name,
    app_id,
    app_secret,
    // page_token
    fb_page_id,
    page_access_token,
    // ig_user_token
    ig_user_access_token,
    // comum
    ig_business_account_id,
    ig_auth_style: rawAuthStyle,
  } = body ?? {};

  const ig_auth_style: 'page_token' | 'ig_user_token' =
    rawAuthStyle === 'ig_user_token' ? 'ig_user_token' : 'page_token';

  if (!connection_id || !organization_id || !app_id || !ig_business_account_id) {
    return json({ error: 'campos obrigatórios ausentes' }, 400);
  }
  if (ig_auth_style === 'page_token' && !page_access_token) {
    return json({ error: 'page_access_token é obrigatório (Page Token ou User Token)' }, 400);
  }
  if (ig_auth_style === 'ig_user_token' && !ig_user_access_token) {
    return json({ error: 'ig_user_access_token é obrigatório no modo Instagram Business Login' }, 400);
  }

  const { data: belongs, error: belongsErr } = await sbAdmin.rpc('user_belongs_to_organization', {
    _user_id: userId,
    _org_id: organization_id,
  });
  if (belongsErr) return json({ error: belongsErr.message }, 500);
  if (!belongs) return json({ error: 'forbidden' }, 403);

  const { data: existing } = await sbAdmin
    .from('instagram_connections')
    .select('id, status, app_secret_encrypted')
    .eq('id', connection_id)
    .eq('organization_id', organization_id)
    .maybeSingle();
  if (!existing) return json({ error: 'connection not found' }, 404);

  const updates: Record<string, any> = {
    display_name: display_name ?? undefined,
    app_id: String(app_id),
    ig_business_account_id: String(ig_business_account_id),
    ig_auth_style,
    graph_version: IG_PAGE_GRAPH_VERSION,
  };
  const capabilities: Record<string, boolean> = {};
  let subscribed_granted: string[] = [];
  let subscribed_failed: any[] = [];
  let subscribed_missing_scopes: string[] = [];
  let subscribe_error_summary: string | null = null;
  let ig_username: string | null = null;
  let fb_page_name: string | null = null;
  let token_type: 'PAGE' | 'USER_CONVERTED' | 'IG_USER' = 'IG_USER';
  let data_access_expires_at: string | null = null;

  if (ig_auth_style === 'page_token') {
    // --------- Detecta tipo do token e converte USER → PAGE se preciso ---------
    let effectivePageToken = String(page_access_token);
    let effectivePageId = fb_page_id ? String(fb_page_id) : '';
    let pickedPageName: string | null = null;

    if (app_secret) {
      const info = await debugAccessToken(String(page_access_token), String(app_id), String(app_secret));
      if (info?.expires_at) {
        updates.token_expires_at = new Date(info.expires_at * 1000).toISOString();
      }
      if (info?.data_access_expires_at) {
        data_access_expires_at = new Date(info.data_access_expires_at * 1000).toISOString();
      }

      if (info?.type && info.type.toUpperCase() === 'USER') {
        // Buscar páginas e escolher a que casa com fb_page_id (se informado)
        // ou a que tem a IGBA solicitada.
        let pages;
        try {
          pages = await listPagesForUserToken(String(page_access_token));
        } catch (e) {
          const ge = e as IgPageGraphError;
          return json({
            error: 'Não foi possível listar suas Páginas com este User Access Token.',
            detail: ge.graph?.message ?? String(e),
          }, 400);
        }

        let picked = effectivePageId ? pages.find(p => p.id === effectivePageId) : null;
        if (!picked) {
          picked = pages.find(p => p.instagram_business_account?.id === String(ig_business_account_id))
            ?? null;
        }
        if (!picked) {
          return json({
            error: 'Nenhuma Página vinculada a este usuário corresponde ao IGBA informado.',
            hint: 'Verifique se o usuário tem acesso à Página do Facebook associada à conta @' + ig_business_account_id + '.',
            pages_found: pages.map(p => ({ id: p.id, name: p.name, iba: p.instagram_business_account?.id ?? null })),
          }, 400);
        }
        if (!picked.access_token) {
          return json({ error: 'A Página foi encontrada mas /me/accounts não retornou access_token para ela.' }, 400);
        }
        effectivePageToken = picked.access_token;
        effectivePageId = picked.id;
        pickedPageName = picked.name;
        token_type = 'USER_CONVERTED';
        console.log('[ig-connect] user_token_converted_to_page', {
          page_id: picked.id, iba: picked.instagram_business_account?.id ?? null,
        });
      } else if (info?.type && info.type.toUpperCase().includes('PAGE')) {
        token_type = 'PAGE';
      }
    }

    if (!effectivePageId) {
      return json({ error: 'fb_page_id é obrigatório quando não é possível descobrir a Página automaticamente.' }, 400);
    }

    // Cross-validação Page ↔ IGBA
    let pageInfo: any;
    try {
      pageInfo = await igPageGraphFetch(`/${effectivePageId}?fields=name,id,instagram_business_account`, effectivePageToken);
    } catch (e) {
      const ge = e as IgPageGraphError;
      console.error('[ig-connect] page fetch failed', { effectivePageId, code: ge.graph?.code, message: ge.graph?.message });
      return json({ error: 'Facebook Page ID ou Page Access Token inválido', detail: ge.graph?.message ?? String(e) }, 400);
    }
    const linkedIgba = pageInfo?.instagram_business_account?.id ? String(pageInfo.instagram_business_account.id) : null;
    if (linkedIgba && linkedIgba !== String(ig_business_account_id)) {
      return json({ error: `A conta IG da página é ${linkedIgba}, não ${ig_business_account_id}` }, 400);
    }
    if (!linkedIgba) {
      return json({ error: 'Esta Página do Facebook não tem uma conta Instagram Business vinculada.' }, 400);
    }

    let igInfo: any;
    try {
      igInfo = await igPageGraphFetch(`/${ig_business_account_id}?fields=username,name`, effectivePageToken);
    } catch (e) {
      const ge = e as IgPageGraphError;
      return json({ error: 'Instagram Business Account ID inválido', detail: ge.graph?.message ?? String(e) }, 400);
    }

    const subscribeResult = await subscribeIgWebhookFields({
      fb_page_id: effectivePageId,
      page_access_token: effectivePageToken,
      app_id: String(app_id),
      app_secret: app_secret ? String(app_secret) : undefined,
    });
    subscribed_granted = subscribeResult.granted;
    subscribed_failed = subscribeResult.failed;
    subscribed_missing_scopes = subscribeResult.missing_scopes;
    subscribe_error_summary = subscribeResult.error_summary;

    ig_username = igInfo?.username ?? null;
    fb_page_name = pageInfo?.name ?? pickedPageName ?? null;

    // Capacidades derivadas do que a Meta confirmou como inscrito
    capabilities.receive_dms = subscribed_granted.includes('messages');
    capabilities.receive_comments = subscribed_granted.includes('feed');
    capabilities.receive_mentions = subscribed_granted.includes('mention');
    capabilities.receive_reactions = subscribed_granted.includes('message_reactions');
    // No modo page_token temos as APIs necessárias para responder DM, comentar
    // e curtir comentários, desde que os escopos correspondentes existam.
    capabilities.send_dms = capabilities.receive_dms;
    capabilities.reply_comments = capabilities.receive_comments;
    capabilities.like_comments = capabilities.receive_comments;
    capabilities.private_reply = capabilities.receive_comments;

    updates.fb_page_id = effectivePageId;
    updates.fb_page_name = fb_page_name;
    updates.ig_username = ig_username;
    updates.page_access_token_encrypted = await encryptSecret(effectivePageToken);
    // Modo page_token não usa IG User Token
    updates.ig_user_access_token_encrypted = null;
    updates.ig_user_id = null;
    updates.token_type = token_type;
    updates.data_access_expires_at = data_access_expires_at;
  } else {
    // ------------------ Modo Instagram Business Login ------------------
    let me: any;
    try {
      me = await igGraphFetch<any>(`/me?fields=user_id,username,name`, String(ig_user_access_token));
    } catch (e) {
      const ge = e as IgGraphError;
      console.error('[ig-connect] ig /me failed', { code: ge.graph?.code, message: ge.graph?.message });
      return json({ error: 'IG User Access Token inválido', detail: ge.graph?.message ?? String(e) }, 400);
    }
    const meId = String(me?.user_id ?? me?.id ?? '');
    ig_username = me?.username ?? null;
    const igUserIdForSend = meId || String(ig_business_account_id);

    const sub = await igSubscribeWebhookFields({
      ig_user_id: igUserIdForSend,
      ig_user_token: String(ig_user_access_token),
    });
    subscribed_granted = sub.granted;
    subscribed_failed = sub.failed;
    subscribe_error_summary = sub.error_summary;

    capabilities.receive_dms = subscribed_granted.includes('messages');
    capabilities.receive_comments = subscribed_granted.includes('comments');
    capabilities.receive_mentions = subscribed_granted.includes('mentions');
    capabilities.send_dms = true;
    capabilities.reply_comments = true;
    capabilities.like_comments = true;
    capabilities.private_reply = true;

    updates.ig_username = ig_username;
    updates.ig_user_id = igUserIdForSend;
    updates.ig_user_access_token_encrypted = await encryptSecret(String(ig_user_access_token));
    updates.page_access_token_encrypted = null;
    updates.fb_page_id = null;
    updates.fb_page_name = null;
    updates.token_type = 'IG_USER';
  }

  // Regra do PRD: essenciais = messages + feed (ou comments no novo modo).
  // Se algum essencial falhou, ainda salvamos como 'partial' (não 'error') para
  // não bloquear o cliente — a UI mostra o que faltou para ele corrigir.
  const essentialsFailed = subscribed_failed.some((f: any) =>
    ['messages', 'feed', 'comments'].includes(String(f?.field ?? '')),
  );
  const nothingGranted = subscribed_granted.length === 0;
  const anyFailure = subscribed_failed.length > 0;
  updates.status = nothingGranted
    ? 'error'
    : (anyFailure || essentialsFailed ? 'partial' : 'active');
  updates.status_reason = subscribe_error_summary;
  updates.last_error = subscribe_error_summary;
  updates.subscribed_fields = subscribed_granted;
  updates.webhook_subscribed_at = new Date().toISOString();
  updates.capabilities = capabilities;

  if (app_secret) updates.app_secret_encrypted = await encryptSecret(String(app_secret));
  else if (!existing.app_secret_encrypted) {
    return json({ error: 'app_secret é obrigatório na primeira ativação (usado para validar HMAC do webhook)' }, 400);
  }

  // Auto-revoga conexões ATIVAS antigas para o mesmo IGBA nesta empresa —
  // evita colidir com o índice único `uq_ig_conn_iba_active`.
  if (['active', 'partial'].includes(String(updates.status))) {
    const { data: dupes } = await sbAdmin
      .from('instagram_connections')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('ig_business_account_id', String(ig_business_account_id))
      .in('status', ['active', 'partial'])
      .neq('id', connection_id);
    if (Array.isArray(dupes) && dupes.length) {
      const ids = dupes.map((d: any) => d.id);
      await sbAdmin
        .from('instagram_connections')
        .update({
          status: 'revoked',
          status_reason: 'Substituída por nova conexão para o mesmo Instagram Business Account.',
        })
        .in('id', ids);
      console.log('[ig-connect] revoked previous connections', { count: ids.length, ids });
    }
  }

  const { error: updErr } = await sbAdmin
    .from('instagram_connections')
    .update(updates)
    .eq('id', connection_id);
  if (updErr) return json({ error: updErr.message }, 500);

  return json({
    ok: true,
    connection_id,
    ig_auth_style,
    ig_username,
    fb_page_name,
    status: updates.status,
    subscribed: !essentialsFailed && !nothingGranted,
    granted: subscribed_granted,
    failed: subscribed_failed,
    missing_scopes: subscribed_missing_scopes,
    capabilities,
    token_type: updates.token_type,
  });
});
