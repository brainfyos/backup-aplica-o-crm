// openai-voice-ephemeral — Mints an OpenAI Realtime ephemeral token for the browser
// to connect via WebRTC. The browser calls this via voice-call-start when the
// agent's voice_provider is 'openai' (or 'auto' with a valid OpenAI key).
//
// Returns { token, model, session_config } that the frontend uses to open a
// WebRTC peer connection with OpenAI directly.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { buildOpenAIRealtimeSession, normalizeOpenAIRealtimeVoice, OPENAI_REALTIME_MODEL } from '../_shared/openai-realtime.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

interface Body {
  organization_id: string;
  voice: string;
  instructions: string;
  tools?: any[];
  language?: string;
}

/**
 * Resolve the OpenAI Realtime key for an org via org_ai_credentials only.
 */
async function resolveOpenAIKey(admin: any, orgId: string): Promise<string | null> {
  const { getOrgProviderKey } = await import('../_shared/voice-credentials.ts');
  return await getOrgProviderKey(admin, orgId, 'openai');
}

export async function mintOpenAIEphemeral(params: Body & { adminOverride?: any }): Promise<
  { ok: true; token: string; model: string; session: any } | { ok: false; error: string; status: number }
> {
  const admin = params.adminOverride
    || createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const key = await resolveOpenAIKey(admin, params.organization_id);
  if (!key) return { ok: false, error: 'OpenAI API key não configurada para esta organização.', status: 400 };

  const session = buildOpenAIRealtimeSession({
    voice: params.voice,
    instructions: params.instructions,
    tools: params.tools || [],
    language: params.language,
  });

  // OpenAI Realtime GA ephemeral client secret
  const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session }),
  });

  if (!r.ok) {
    const txt = await r.text();
    console.error('[openai-voice-ephemeral] failed:', r.status, txt.slice(0, 400));
    return { ok: false, error: `OpenAI ${r.status}: ${txt.slice(0, 200)}`, status: 502 };
  }
  const payload = await r.json();
  const token = payload?.value || payload?.client_secret?.value || payload?.client_secret;
  if (!token) return { ok: false, error: 'OpenAI response missing client_secret.value', status: 502 };

  return {
    ok: true,
    token,
    model: OPENAI_REALTIME_MODEL,
    session: { ...session, voice: normalizeOpenAIRealtimeVoice(params.voice) },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { organization_id, voice, instructions, tools, language } = body || {};
    if (!organization_id || !voice || !instructions) {
      return json({ error: 'organization_id, voice, instructions são obrigatórios' }, 400);
    }
    const result = await mintOpenAIEphemeral({ organization_id, voice, instructions, tools, language });
    if (!result.ok) return json({ error: result.error }, result.status);
    return json({ token: result.token, model: result.model, session: result.session, provider: 'openai' });
  } catch (e) {
    console.error('[openai-voice-ephemeral]', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
