// meta-whatsapp-draft
// Cria uma conexão WhatsApp Meta em modo "rascunho" para que o wizard
// possa exibir Verify Token e URL de callback ANTES de o usuário ter
// terminado de criar o Meta App.
// Cada conexão recebe seu próprio webhook_verify_token; a URL final é
// {SUPABASE_URL}/functions/v1/meta-whatsapp-webhook/{connection_id}.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateVerifyToken } from '../_shared/meta-crypto.ts';

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
  const { organization_id, display_name, connection_id } = body ?? {};

  if (!organization_id || !display_name) {
    return json({ error: 'missing fields: organization_id, display_name' }, 400);
  }

  const { data: belongs, error: belongsErr } = await sbAdmin.rpc('user_belongs_to_organization', {
    _user_id: userId,
    _org_id: organization_id,
  });
  if (belongsErr) return json({ error: belongsErr.message }, 500);
  if (!belongs) return json({ error: 'forbidden' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Se passaram connection_id, tenta retomar rascunho existente.
  if (connection_id) {
    const { data: existing } = await sbAdmin
      .from('whatsapp_meta_connections')
      .select('id, webhook_verify_token, status, webhook_subscribed_at')
      .eq('id', connection_id)
      .eq('organization_id', organization_id)
      .maybeSingle();
    if (existing) {
      return json({
        connection_id: existing.id,
        verify_token: existing.webhook_verify_token,
        webhook_url: `${supabaseUrl}/functions/v1/meta-whatsapp-webhook/${existing.id}`,
        webhook_subscribed_at: existing.webhook_subscribed_at,
        status: existing.status,
      });
    }
  }

  // INSERT do rascunho.
  const verifyToken = generateVerifyToken();
  const { data: row, error } = await sbAdmin
    .from('whatsapp_meta_connections')
    .insert({
      organization_id,
      display_name,
      webhook_verify_token: verifyToken,
      status: 'draft',
      created_by: userId,
    })
    .select('id, webhook_verify_token, webhook_subscribed_at, status')
    .single();
  if (error) return json({ error: error.message }, 500);

  return json({
    connection_id: row.id,
    verify_token: row.webhook_verify_token,
    webhook_url: `${supabaseUrl}/functions/v1/meta-whatsapp-webhook/${row.id}`,
    webhook_subscribed_at: row.webhook_subscribed_at,
    status: row.status,
  });
});
