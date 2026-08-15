// marketing-connect — cadastra/atualiza credencial Meta Marketing para a organização atual.
// POST { access_token, ad_account_id, business_id?, account_name? }
// Requer JWT do usuário (admin/super_admin da org).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { encryptSecret } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return json({ error: 'unauthorized' }, 401);
  const userId = claims.claims.sub as string;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const access_token = String(body?.access_token ?? '').trim();
  const ad_account_id_raw = String(body?.ad_account_id ?? '').trim();
  const business_id = body?.business_id ? String(body.business_id).trim() : null;
  const account_name = body?.account_name ? String(body.account_name).trim() : null;

  if (!access_token || access_token.length < 20) return json({ error: 'invalid_access_token' }, 400);
  if (!ad_account_id_raw) return json({ error: 'missing_ad_account_id' }, 400);
  const ad_account_id = ad_account_id_raw.startsWith('act_') ? ad_account_id_raw : `act_${ad_account_id_raw}`;

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Resolver organização ativa do usuário
  const { data: profile, error: profileErr } = await service
    .from('profiles').select('organization_id').eq('id', userId).maybeSingle();
  if (profileErr || !profile?.organization_id) return json({ error: 'no_organization' }, 400);
  const organization_id = profile.organization_id as string;

  // Autorização: admin da org OU super_admin
  const [{ data: isSuper }, { data: uo }] = await Promise.all([
    service.rpc('is_super_admin', { _user_id: userId }),
    service.from('user_organizations')
      .select('role').eq('user_id', userId).eq('organization_id', organization_id).maybeSingle(),
  ]);
  const role = uo?.role as string | undefined;
  if (!isSuper && role !== 'admin' && role !== 'owner') {
    return json({ error: 'forbidden' }, 403);
  }

  // Pré-checks contra Graph API (mensagens amigáveis antes de salvar)
  const GRAPH = 'https://graph.facebook.com/v21.0';
  const graphGet = async (path: string) => {
    const url = new URL(`${GRAPH}${path}`);
    url.searchParams.set('access_token', access_token);
    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  };

  try {
    // 1) Token válido?
    const me = await graphGet('/me?fields=id,name');
    if (!me.ok) {
      const msg = me.data?.error?.message ?? 'Token inválido ou expirado';
      return json({ error: 'invalid_token', details: `Token rejeitado pela Meta: ${msg}. Gere um novo System User Access Token no Meta Business.` }, 400);
    }

    // 2) Permissões
    const perms = await graphGet('/me/permissions');
    const granted: string[] = Array.isArray(perms.data?.data)
      ? perms.data.data.filter((p: any) => p.status === 'granted').map((p: any) => p.permission)
      : [];
    if (!granted.includes('ads_read')) {
      return json({
        error: 'missing_permission',
        details: 'Token sem permissão obrigatória ads_read. No Meta Business, edite o System User e adicione ads_read + business_management antes de gerar o token.',
      }, 400);
    }

    // 3) Ad Account acessível
    const acct = await graphGet(`/${ad_account_id}?fields=id,name,account_status,currency`);
    if (!acct.ok) {
      const errMsg = acct.data?.error?.message ?? `Não foi possível acessar ${ad_account_id}`;
      const code = acct.data?.error?.code;
      let hint = '';
      if (code === 100) hint = ' Confira se o ID está correto (formato act_XXXXXXXXX) e se o System User desse token tem acesso a essa conta de anúncios.';
      else if (code === 190) hint = ' Token expirado — gere um novo.';
      else if (code === 200) hint = ' O System User não tem permissão para essa Ad Account. Adicione-o no Meta Business como usuário da conta.';
      return json({ error: 'ad_account_forbidden', details: `${errMsg}.${hint}` }, 400);
    }
    if (!account_name && acct.data?.name) body.account_name = acct.data.name;
  } catch (e) {
    return json({ error: 'meta_unreachable', details: `Falha ao contatar a Meta: ${(e as Error).message}` }, 502);
  }

  const encrypted = await encryptSecret(access_token);

  const { data: upserted, error: upErr } = await service
    .from('org_marketing_credentials')
    .upsert({
      organization_id,
      provider: 'meta',
      ad_account_id,
      business_id,
      account_name: account_name ?? body.account_name ?? null,
      access_token_encrypted: encrypted,
      is_active: true,
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider,ad_account_id' })
    .select('id, ad_account_id, account_name, business_id, is_active, last_sync_at, last_sync_status')
    .maybeSingle();

  if (upErr) return json({ error: 'db_error', details: upErr.message }, 500);
  return json({ ok: true, credential: upserted });
});
