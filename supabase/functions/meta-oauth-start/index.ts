// meta-oauth-start
// Gera state, cria sessão pendente e devolve a URL do Facebook Login.
// O fluxo atual usa POST autenticado para não expor o JWT do Supabase na URL.
// GET continua aceito temporariamente para compatibilidade com clientes antigos.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { loadPlatformMetaApp, buildAuthorizeUrl, resolveScopes } from '../_shared/meta-oauth.ts';

function html(body: string, status = 200) {
  return new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:24px;color:#111">${body}</body>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const isPost = req.method === 'POST';
    if (!isPost && req.method !== 'GET') return json({ error: 'method not allowed' }, 405);

    const body = isPost ? await req.json().catch(() => ({})) : {};
    const organization_id = String(
      isPost ? body?.organization_id ?? '' : url.searchParams.get('org_id') ?? '',
    ).trim();
    const purpose = String(
      isPost ? body?.purpose ?? 'both' : url.searchParams.get('purpose') ?? 'both',
    ) as 'instagram' | 'ads' | 'both';
    const authHeader = req.headers.get('Authorization');
    const legacyToken = url.searchParams.get('sb_token');
    const bearer = authHeader?.replace(/^Bearer\s+/i, '') || legacyToken;
    const fail = (message: string, status: number) =>
      isPost ? json({ error: message }, status) : html(message, status);

    if (!organization_id || !bearer || !['instagram', 'ads', 'both'].includes(purpose)) {
      return fail('Parâmetros inválidos.', 400);
    }

    const sbUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${bearer}` } } },
    );
    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return fail('Sessão inválida. Faça login e tente novamente.', 401);

    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: belongs } = await sbAdmin.rpc('user_belongs_to_organization', {
      _user_id: userData.user.id,
      _org_id: organization_id,
    });
    if (!belongs) return fail('Sem permissão para esta organização.', 403);

    const app = await loadPlatformMetaApp().catch((e) => {
      throw new Error(`Meta OAuth não configurado: ${e.message}`);
    });
    if (!app.enabled) return fail('Meta OAuth está desativado no Super Admin.', 400);

    const state = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const { data: oauthSession, error: insErr } = await sbAdmin
      .from('meta_oauth_sessions')
      .insert({
        state,
        organization_id,
        user_id: userData.user.id,
        purpose,
        status: 'pending',
      })
      .select('id')
      .single();
    if (insErr) return fail(`Erro ao iniciar sessão: ${insErr.message}`, 500);

    const redirect_uri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-oauth-callback`;
    const scope = resolveScopes(purpose, app.scopes_override);
    const authUrl = buildAuthorizeUrl(app, { redirect_uri, state, scope });
    return isPost
      ? json({ auth_url: authUrl, session_id: oauthSession.id })
      : new Response(null, {
          status: 302,
          headers: {
            Location: authUrl,
            'Referrer-Policy': 'no-referrer',
          },
        });
  } catch (e) {
    console.error('[meta-oauth-start]', e);
    const message = `Erro: ${(e as Error).message}`;
    return req.method === 'POST' ? json({ error: message }, 500) : html(message, 500);
  }
});
