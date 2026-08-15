// meta-oauth-admin
// Endpoints para o Super Admin configurar credenciais Meta OAuth.
// GET  -> retorna { app_id, graph_version, enabled, has_secret }
// POST -> body { app_id, app_secret?, graph_version?, enabled? }
// Somente super_admin.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { encryptSecret } from '../_shared/meta-crypto.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const sbUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await sbUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

  const sbAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: isSuper } = await sbAdmin.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'super_admin',
  });
  if (!isSuper) return json({ error: 'forbidden' }, 403);

  const { data: current, error: selErr } = await sbAdmin
    .from('platform_settings')
    .select('id, meta_oauth_app_id, meta_oauth_app_secret_encrypted, meta_oauth_graph_version, meta_oauth_enabled, meta_oauth_scopes_override')
    .limit(1)
    .maybeSingle();
  if (selErr) return json({ error: selErr.message }, 500);

  if (req.method === 'GET') {
    return json({
      app_id: current?.meta_oauth_app_id ?? '',
      graph_version: current?.meta_oauth_graph_version ?? 'v21.0',
      enabled: !!current?.meta_oauth_enabled,
      has_secret: !!current?.meta_oauth_app_secret_encrypted,
      scopes_override: (current as any)?.meta_oauth_scopes_override ?? '',
      callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-oauth-callback`,
    });
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.app_id === 'string') patch.meta_oauth_app_id = body.app_id.trim() || null;
  if (typeof body.graph_version === 'string' && body.graph_version.trim()) {
    patch.meta_oauth_graph_version = body.graph_version.trim();
  }
  if (typeof body.enabled === 'boolean') patch.meta_oauth_enabled = body.enabled;
  if (typeof body.app_secret === 'string' && body.app_secret) {
    const candidateAppId = String(body.app_id ?? current?.meta_oauth_app_id ?? '').trim();
    const candidateVersion = String(body.graph_version ?? current?.meta_oauth_graph_version ?? 'v21.0').trim();
    if (!candidateAppId) return json({ error: 'Informe o App ID antes de salvar o App Secret.' }, 400);

    const tokenRes = await fetch(`https://graph.facebook.com/${candidateVersion}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: candidateAppId,
        client_secret: body.app_secret,
        grant_type: 'client_credentials',
      }),
    });
    if (!tokenRes.ok) {
      return json({
        error: 'O App Secret não corresponde ao App ID informado. Copie novamente em Meta for Developers → Configurações → Básico.',
      }, 400);
    }
    patch.meta_oauth_app_secret_encrypted = await encryptSecret(body.app_secret);
  }
  if (typeof body.scopes_override === 'string') {
    const v = body.scopes_override.trim();
    patch.meta_oauth_scopes_override = v || null;
  }

  if (!current?.id) {
    const { error: insErr } = await sbAdmin.from('platform_settings').insert(patch);
    if (insErr) return json({ error: insErr.message }, 500);
  } else {
    const { error: updErr } = await sbAdmin.from('platform_settings').update(patch).eq('id', current.id);
    if (updErr) return json({ error: updErr.message }, 500);
  }

  return json({ ok: true });
});
