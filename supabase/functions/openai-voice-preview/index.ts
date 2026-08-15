// openai-voice-preview — retorna áudio TTS de uma voz OpenAI Realtime.
// Usa a chave OpenAI configurada em org_ai_credentials (BYO) ou secret global.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { resolveOpenAIKey, normalizeOpenAIRealtimeVoice } from '../_shared/openai-realtime.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function jsonErr(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    const { voice_id, text } = await req.json().catch(() => ({}));
    const voice = normalizeOpenAIRealtimeVoice(voice_id);
    const input = String(
      text ||
        'Olá! Sou seu agente de vendas, tudo bem por aí? Posso te ajudar em qualquer coisa que precisar.',
    ).slice(0, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (!profile?.organization_id) return jsonErr('no organization', 400);

    const key = await resolveOpenAIKey(admin, profile.organization_id);
    if (!key) return jsonErr('OpenAI API key não configurada — Integrações → OpenAI', 400);

    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input,
        response_format: 'mp3',
        instructions:
          'Fale em Português do Brasil, com sotaque brasileiro natural (nunca europeu, nunca com sotaque estrangeiro). Pronúncia neutra brasileira, tom cordial e profissional.',
      }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (r.status === 401) return jsonErr('Chave OpenAI inválida ou revogada.', 401);
      return jsonErr(`OpenAI TTS ${r.status}: ${t.slice(0, 200)}`, 502);
    }
    const audio = await r.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[openai-voice-preview]', e);
    return jsonErr(e instanceof Error ? e.message : 'unknown', 500);
  }
});
