import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { asaasFetch } from '../_shared/asaas-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    const userId = claims?.claims?.sub;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: profile } = await admin.from('profiles').select('organization_id').eq('id', userId).maybeSingle();
    const orgId = profile?.organization_id;
    if (!orgId) return json({ error: 'organization_not_found' }, 400);

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'save';

    if (action === 'delete') {
      await admin.from('asaas_credentials').delete().eq('organization_id', orgId);
      return json({ ok: true });
    }

    const environment = body.environment === 'production' ? 'production' : 'sandbox';
    const apiKey = String(body.api_key ?? '').trim();
    if (!apiKey) return json({ error: 'api_key required' }, 400);

    // Validate the key by hitting /myAccount
    const test = await asaasFetch(environment, apiKey, '/myAccount');
    if (test.status >= 400) {
      return json({ error: 'invalid_credentials', details: test.body }, 400);
    }

    const account = test.body ?? {};
    const { data: existing } = await admin
      .from('asaas_credentials')
      .select('id, webhook_token')
      .eq('organization_id', orgId)
      .maybeSingle();

    const payload: any = {
      organization_id: orgId,
      environment,
      api_key: apiKey,
      account_name: account.name ?? account.companyName ?? null,
      account_email: account.email ?? null,
      is_active: true,
      last_verified_at: new Date().toISOString(),
      last_error: null,
    };

    if (existing) {
      await admin.from('asaas_credentials').update(payload).eq('id', existing.id);
    } else {
      await admin.from('asaas_credentials').insert(payload);
    }

    const { data: fresh } = await admin
      .from('asaas_credentials')
      .select('id, environment, webhook_token, account_name, account_email, last_verified_at, is_active')
      .eq('organization_id', orgId)
      .maybeSingle();

    return json({ ok: true, credentials: fresh, account });
  } catch (e: any) {
    console.error('[asaas-credentials-save]', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
