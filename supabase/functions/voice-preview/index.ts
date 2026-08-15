// voice-preview — retorna áudio TTS de uma voz Grok (nativa ou clone).
// Usa a chave xAI configurada em org_ai_credentials (BYO).
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const XAI_TTS_ENDPOINT = 'https://api.x.ai/v1/tts';

function jsonErr(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isXaiEntitlementError(status: number, body: string) {
  if (status !== 403) return false;
  const text = body.toLowerCase();
  return (
    text.includes('permission-denied') ||
    text.includes('does not have permission') ||
    text.includes('not authorized') ||
    text.includes('credits') ||
    text.includes('licenses') ||
    text.includes('specified operation')
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonErr('missing auth', 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return jsonErr('not authenticated', 401);

    const { voice_id, text, language } = await req.json().catch(() => ({}));
    if (!voice_id) return jsonErr('voice_id required');
    const input = String(text || 'Olá! Esta é uma amostra da minha voz.').slice(0, 500);
    const lang = String(language || 'pt');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: profile } = await admin
      .from('profiles').select('organization_id').eq('id', userData.user.id).maybeSingle();
    if (!profile?.organization_id) return jsonErr('no organization', 400);

    const { data: cred } = await admin
      .from('org_ai_credentials')
      .select('api_key_encrypted')
      .eq('organization_id', profile.organization_id)
      .eq('provider', 'xai')
      .maybeSingle();
    if (!cred?.api_key_encrypted) return jsonErr('xAI key not configured — Integrações → xAI', 400);

    const r = await fetch(XAI_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cred.api_key_encrypted}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: input,
        voice_id,
        language: lang,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (isXaiEntitlementError(r.status, t)) {
        return jsonErr(
          'A chave xAI foi aceita, mas o time xAI não está autorizado para TTS/Voz. Adicione créditos/licença de Voice em https://console.x.ai e tente novamente.',
          402,
        );
      }
      if (r.status === 401) return jsonErr('Chave xAI inválida ou revogada. Atualize em Integrações → xAI.', 401);
      return jsonErr(`xAI TTS ${r.status}: ${t.slice(0, 200)}`, 502);
    }
    const audio = await r.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[voice-preview]', e);
    return jsonErr(e instanceof Error ? e.message : 'unknown', 500);
  }
});
