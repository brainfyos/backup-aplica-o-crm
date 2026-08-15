// meta-campaign-validate — checa se a org tem tudo pronto para publicar uma campanha.
// POST { organization_id?, credential_id, destination_type, destination_ref? }
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: claims } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
  const userId = claims?.claims?.sub;
  if (!userId) return json({ error: 'unauthorized' }, 401);

  // Lê o body UMA vez só (o stream não pode ser consumido duas vezes).
  const body = await req.json().catch(() => ({} as any));
  const destination_type = body?.destination_type ?? 'whatsapp';
  const destination_ref = body?.destination_ref ?? {};
  const credential_id = String(body?.credential_id ?? '').trim();

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: profile } = await service.from('profiles').select('organization_id').eq('id', userId).maybeSingle();
  const organization_id = body?.organization_id ?? profile?.organization_id;
  if (!organization_id) return json({ error: 'no_organization' }, 400);
  const [{ data: isSuper }, { data: membership }] = await Promise.all([
    service.rpc('is_super_admin', { _user_id: userId }),
    service.from('user_organizations').select('role')
      .eq('user_id', userId).eq('organization_id', organization_id).maybeSingle(),
  ]);
  if (!isSuper && !['admin', 'owner'].includes(membership?.role ?? '')) {
    return json({ error: 'forbidden' }, 403);
  }

  const checks: Record<string, { ok: boolean; message: string }> = {};

  // 1. Meta connected + credenciais de Pixel/CAPI (colunas físicas)
  let credentialQuery = service
    .from('org_marketing_credentials')
    .select('id, ad_account_id, is_active, meta_pixel_id, meta_capi_access_token_encrypted, capi_enabled')
    .eq('organization_id', organization_id)
    .eq('provider', 'meta')
    .eq('is_active', true);
  if (credential_id) credentialQuery = credentialQuery.eq('id', credential_id);
  const { data: credentialRows } = await credentialQuery.limit(2);
  const cred = credentialRows?.length === 1 ? credentialRows[0] : null;

  checks.meta_connected = cred
    ? { ok: true, message: `Conta ${cred.ad_account_id} conectada` }
    : { ok: false, message: !credential_id && (credentialRows?.length ?? 0) > 1
        ? 'Selecione qual conta Meta Ads será usada'
        : credential_id
        ? 'A conta de anúncios selecionada não está conectada ou está inativa'
        : 'Selecione uma conta de anúncios antes de continuar' };

  const hasPixel = !!cred?.meta_pixel_id;
  const hasCapiToken = !!cred?.meta_capi_access_token_encrypted;
  const capiOn = !!cred?.capi_enabled;
  checks.pixel_capi = hasPixel && hasCapiToken && capiOn
    ? { ok: true, message: `Pixel ${cred!.meta_pixel_id} + CAPI ativos` }
    : { ok: false, message: hasPixel && hasCapiToken
        ? 'Ative a API de Conversões em Marketing → Técnico'
        : 'Configure Pixel e API de Conversões em Marketing → Técnico' };

  // 2. Destino conforme tipo
  if (destination_type === 'whatsapp') {
    const connId = destination_ref?.whatsapp_connection_id;
    if (!connId) {
      checks.destination_ok = { ok: false, message: 'Selecione uma conexão WhatsApp' };
    } else {
      const [meta, evo] = await Promise.all([
        service.from('whatsapp_meta_connections').select('id, phone_number').eq('id', connId).eq('organization_id', organization_id).maybeSingle(),
        service.from('evolution_instances').select('id, phone_number, instance_name').eq('id', connId).eq('organization_id', organization_id).maybeSingle(),
      ]);
      const conn = meta.data ?? evo.data;
      checks.destination_ok = conn
        ? { ok: true, message: `WhatsApp ${conn.phone_number ?? (conn as any).instance_name} pronto` }
        : { ok: false, message: 'Conexão WhatsApp não encontrada' };
    }
  } else if (destination_type === 'form') {
    const formId = destination_ref?.form_id;
    const { data } = formId
      ? await service.from('forms').select('id, slug, is_published').eq('id', formId).eq('organization_id', organization_id).maybeSingle()
      : { data: null as any };
    checks.destination_ok = data
      ? { ok: true, message: `Formulário /${data.slug} pronto` }
      : { ok: false, message: 'Selecione um formulário publicado' };
  } else if (destination_type === 'quiz') {
    const quizId = destination_ref?.quiz_id;
    const { data } = quizId
      ? await service.from('quiz_templates').select('id, slug').eq('id', quizId).eq('organization_id', organization_id).maybeSingle()
      : { data: null as any };
    checks.destination_ok = data
      ? { ok: true, message: `Quiz /${data.slug} pronto` }
      : { ok: false, message: 'Selecione um quiz' };
  } else {
    const url = destination_ref?.url;
    checks.destination_ok = url && /^https?:\/\//.test(url)
      ? { ok: true, message: `Destino: ${url}` }
      : { ok: false, message: 'Informe uma URL válida (https://…)' };
  }

  // 3. CRM — exigências por destino
  const { pipeline_id, stage_id, agent_id } = destination_ref;
  if (destination_type === 'url') {
    checks.crm_ok = { ok: true, message: 'Destino externo — sem vínculo com CRM (atribuição via UTMs/fbclid)' };
  } else if (destination_type === 'whatsapp') {
    const missing: string[] = [];
    if (!pipeline_id) missing.push('pipeline');
    if (!stage_id) missing.push('etapa');
    if (!agent_id) missing.push('agente');
    checks.crm_ok = missing.length === 0
      ? { ok: true, message: 'Pipeline, etapa e agente definidos' }
      : { ok: false, message: `Faltando: ${missing.join(', ')}` };
  } else {
    // form / quiz
    const missing: string[] = [];
    if (!pipeline_id) missing.push('pipeline');
    if (!stage_id) missing.push('etapa');
    checks.crm_ok = missing.length === 0
      ? { ok: true, message: 'Pipeline e etapa definidos (agente opcional)' }
      : { ok: false, message: `Faltando: ${missing.join(', ')}` };
  }

  // 4. Tracking
  checks.tracking_ready = { ok: true, message: 'UTMs geradas automaticamente ao publicar' };

  const all_ok = Object.values(checks).every((c) => c.ok);
  return json({ ok: true, all_ok, checks });
});
