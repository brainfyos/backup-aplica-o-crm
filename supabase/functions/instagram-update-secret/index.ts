// instagram-update-secret
// Atualiza SOMENTE o app_secret_encrypted de uma conexão Instagram.
// Uso: quando o admin cola um novo App Secret do App da Meta para destravar
// a validação HMAC do webhook. NÃO refaz assinatura de campos.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { encryptSecret } from '../_shared/meta-crypto.ts';

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
  const { connection_id, app_secret } = body ?? {};
  if (!connection_id || !app_secret || typeof app_secret !== 'string' || app_secret.length < 8) {
    return json({ error: 'connection_id e app_secret (≥8 chars) obrigatórios' }, 400);
  }

  const { data: conn } = await sbAdmin
    .from('instagram_connections')
    .select('id, organization_id, last_error, status')
    .eq('id', connection_id)
    .maybeSingle();
  if (!conn) return json({ error: 'connection not found' }, 404);

  const { data: belongs, error: belongsErr } = await sbAdmin.rpc('user_belongs_to_organization', {
    _user_id: userId,
    _org_id: conn.organization_id,
  });
  if (belongsErr) return json({ error: belongsErr.message }, 500);
  if (!belongs) return json({ error: 'forbidden' }, 403);

  const encrypted = await encryptSecret(String(app_secret));
  const updates: Record<string, any> = { app_secret_encrypted: encrypted };

  // Se estava marcado com erro relacionado ao secret, limpa (usuário verá teste real depois)
  const err = String(conn.last_error ?? '').toLowerCase();
  if (conn.status === 'error' && (err.includes('app_secret') || err.includes('hmac'))) {
    updates.status = 'active';
    updates.last_error = null;
  }

  const { error: updErr } = await sbAdmin
    .from('instagram_connections')
    .update(updates)
    .eq('id', connection_id);
  if (updErr) return json({ error: updErr.message }, 500);

  return json({ ok: true });
});
