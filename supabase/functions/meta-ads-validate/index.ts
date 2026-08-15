// meta-ads-validate — roda 3 checks contra a Graph API do Meta antes de salvar credencial.
// POST { access_token, ad_account_id } → { ok, checks:[{key,status,message}], account? }
// Requer JWT do usuário.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GRAPH = 'https://graph.facebook.com/v21.0';

type CheckStatus = 'ok' | 'warn' | 'fail';
interface Check { key: string; label: string; status: CheckStatus; message: string }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function graphGet(path: string, token: string): Promise<any> {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
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

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const access_token = String(body?.access_token ?? '').trim();
  const ad_account_raw = String(body?.ad_account_id ?? '').trim();
  if (!access_token || access_token.length < 20) return json({ error: 'invalid_access_token' }, 400);
  if (!ad_account_raw) return json({ error: 'missing_ad_account_id' }, 400);
  const ad_account_id = ad_account_raw.startsWith('act_') ? ad_account_raw : `act_${ad_account_raw}`;

  const checks: Check[] = [];
  let account: any = null;

  // Check 1 — token válido
  const me = await graphGet('/me?fields=id,name', access_token);
  if (!me.ok) {
    checks.push({ key: 'token', label: 'Access token', status: 'fail', message: me.data?.error?.message ?? 'Token inválido ou expirado' });
    return json({ ok: false, checks });
  }
  checks.push({ key: 'token', label: 'Access token', status: 'ok', message: `Autenticado como ${me.data?.name ?? me.data?.id}` });

  // Check 2 — permissões
  const perms = await graphGet('/me/permissions', access_token);
  const granted: string[] = Array.isArray(perms.data?.data)
    ? perms.data.data.filter((p: any) => p.status === 'granted').map((p: any) => p.permission)
    : [];
  const required = ['ads_read'];
  const recommended = ['business_management', 'read_insights'];
  const missingRequired = required.filter((p) => !granted.includes(p));
  const missingRec = recommended.filter((p) => !granted.includes(p));
  if (missingRequired.length) {
    checks.push({
      key: 'permissions', label: 'Permissões', status: 'fail',
      message: `Faltam permissões obrigatórias: ${missingRequired.join(', ')}. Gere um token com essas permissões no Meta Business.`,
    });
  } else if (missingRec.length) {
    checks.push({
      key: 'permissions', label: 'Permissões', status: 'warn',
      message: `ads_read ok. Recomendado adicionar: ${missingRec.join(', ')} para dados de insights completos.`,
    });
  } else {
    checks.push({ key: 'permissions', label: 'Permissões', status: 'ok', message: 'Todas as permissões recomendadas concedidas' });
  }

  // Check 3 — Ad Account acessível
  const acct = await graphGet(`/${ad_account_id}?fields=id,name,account_status,currency,business{id,name}`, access_token);
  if (!acct.ok) {
    checks.push({
      key: 'ad_account', label: 'Conta de anúncios', status: 'fail',
      message: acct.data?.error?.message ?? `Não foi possível acessar ${ad_account_id}`,
    });
    return json({ ok: false, checks });
  }
  account = {
    id: acct.data?.id,
    name: acct.data?.name,
    account_status: acct.data?.account_status,
    currency: acct.data?.currency,
    business_id: acct.data?.business?.id ?? null,
    business_name: acct.data?.business?.name ?? null,
  };
  checks.push({
    key: 'ad_account', label: 'Conta de anúncios', status: 'ok',
    message: `${account.name} · ${account.currency} · status ${account.account_status}`,
  });

  const failed = checks.some((c) => c.status === 'fail');
  return json({ ok: !failed, checks, account });
});
