// meta-whatsapp-connect
// Recebe credenciais do wizard, valida via Graph API, criptografa, salva.
// Retorna webhook_url + verify_token para o cliente colar no Meta App.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { GRAPH_BASE, graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { encryptSecret, generateVerifyToken } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {

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
    access_token,
    phone_number_id,
    waba_id,
    default_reengagement_template_id,
  } = body ?? {};

  if (!organization_id || !display_name || !app_id || !access_token || !phone_number_id || !waba_id) {
    return json({ error: 'missing fields' }, 400);
  }

  // Confirma membership da org
  const { data: belongs, error: belongsErr } = await sbAdmin.rpc('user_belongs_to_organization', {
    _user_id: userId,
    _org_id: organization_id,
  });
  if (belongsErr) console.error('[meta-whatsapp-connect] belongs check error', belongsErr);
  if (!belongs) return json({ error: 'forbidden' }, 403);

  // Valida no Graph
  let phoneInfo: any;
  try {
    phoneInfo = await graphFetch(`/${phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`, access_token);
  } catch (e) {
    const ge = e as GraphError;
    return json({ error: 'phone_number_id inválido ou token sem permissão', detail: ge.graph?.message ?? String(e) }, 400);
  }
  let wabaInfo: any;
  try {
    wabaInfo = await graphFetch(`/${waba_id}?fields=name,id`, access_token);
  } catch (e) {
    const ge = e as GraphError;
    return json({ error: 'WABA ID inválido ou sem permissão whatsapp_business_management', detail: ge.graph?.message ?? String(e) }, 400);
  }

  // Detecta se é update/promoção (connection_id) ou criação direta (sem id).
  const isExisting = !!connection_id;
  let row: any;

  if (isExisting) {
    // Carrega o registro (rascunho ou ativo) e promove a 'active'.
    const { data: current, error: loadErr } = await sbAdmin
      .from('whatsapp_meta_connections')
      .select('id, status, app_secret_encrypted, access_token_encrypted, webhook_verify_token')
      .eq('id', connection_id)
      .eq('organization_id', organization_id)
      .single();
    if (loadErr || !current) return json({ error: 'connection not found' }, 404);

    const updates: Record<string, any> = {
      display_name,
      app_id,
      phone_number_id,
      waba_id,
      phone_number: phoneInfo?.display_phone_number ?? null,
      business_account_name: wabaInfo?.name ?? null,
      quality_rating: phoneInfo?.quality_rating ?? null,
      messaging_limit_tier: phoneInfo?.messaging_limit_tier ?? null,
      status: 'active',
      last_error: null,
      last_health_check_at: new Date().toISOString(),
      default_reengagement_template_id: default_reengagement_template_id ?? null,
    };
    if (app_secret) {
      updates.app_secret_encrypted = await encryptSecret(app_secret);
    } else if (!current.app_secret_encrypted) {
      return json({ error: 'app_secret obrigatório (não há um salvo anteriormente)' }, 400);
    }
    if (access_token) {
      // Defesa: só regrava o token se parecer um token Meta válido (EA... e comprimento razoável).
      // Evita corromper a conexão quando o painel envia um valor placeholder / ofuscado.
      const looksValid = typeof access_token === 'string'
        && access_token.length >= 40
        && /^EA[A-Za-z0-9]/.test(access_token.trim());
      if (!looksValid) {
        return json({
          error: 'access_token inválido: cole o token completo da Meta (começa com "EA…"). Se não quiser trocar, deixe o campo em branco.',
        }, 400);
      }
      updates.access_token_encrypted = await encryptSecret(access_token.trim());
    } else if (!current.access_token_encrypted) {
      return json({ error: 'access_token obrigatório (não há um salvo anteriormente)' }, 400);
    }

    const { data, error } = await sbAdmin
      .from('whatsapp_meta_connections')
      .update(updates)
      .eq('id', connection_id)
      .eq('organization_id', organization_id)
      .select('id, webhook_verify_token')
      .single();
    if (error) return json({ error: error.message }, 500);
    row = data;
  } else {
    if (!app_secret) return json({ error: 'app_secret obrigatório na criação' }, 400);
    const verifyToken = generateVerifyToken();
    const { data, error } = await sbAdmin
      .from('whatsapp_meta_connections')
      .insert({
        organization_id,
        display_name,
        app_id,
        app_secret_encrypted: await encryptSecret(app_secret),
        access_token_encrypted: await encryptSecret(access_token),
        phone_number_id,
        waba_id,
        phone_number: phoneInfo?.display_phone_number ?? null,
        business_account_name: wabaInfo?.name ?? null,
        quality_rating: phoneInfo?.quality_rating ?? null,
        messaging_limit_tier: phoneInfo?.messaging_limit_tier ?? null,
        webhook_verify_token: verifyToken,
        status: 'active',
        last_health_check_at: new Date().toISOString(),
        created_by: userId,
      })
      .select('id, webhook_verify_token')
      .single();
    if (error) return json({ error: error.message }, 500);
    row = data;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const webhookUrl = `${supabaseUrl}/functions/v1/meta-whatsapp-webhook/${row.id}`;
  return json({
    connection_id: row.id,
    webhook_url: webhookUrl,
    verify_token: row.webhook_verify_token,
    subscribe_fields: ['messages', 'message_template_status_update'],
  });
  } catch (e) {
    console.error('[meta-whatsapp-connect] unhandled', e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || 'internal error' }, 500);
  }
});



function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
