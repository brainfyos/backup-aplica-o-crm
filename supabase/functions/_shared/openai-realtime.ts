// Shared helper: mints an OpenAI Realtime ephemeral token for a browser
// WebRTC session using the current GA API (`/v1/realtime/client_secrets`).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.0';

export const OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';

const REALTIME_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'marin', 'sage', 'shimmer', 'verse',
]);

export function normalizeOpenAIRealtimeVoice(voice?: string | null) {
  const v = String(voice || '').trim().toLowerCase();
  return REALTIME_VOICES.has(v) ? v : 'marin';
}

export async function resolveOpenAIKey(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { getOrgProviderKey } = await import('./voice-credentials.ts');
  return await getOrgProviderKey(admin, orgId, 'openai');
}

export interface MintOpenAIParams {
  apiKey: string;
  voice: string;
  instructions: string;
  tools?: any[];
  language?: string;
}

export function buildOpenAIRealtimeSession(p: Omit<MintOpenAIParams, 'apiKey'>) {
  const ptBrPrefix = [
    'IDIOMA E SOTAQUE:',
    '- Responda SEMPRE em Português do Brasil, com sotaque BRASILEIRO natural.',
    '- NUNCA use sotaque europeu, africano ou qualquer outro estrangeiro.',
    '- Pronúncia brasileira neutra (paulista/carioca), sem construções de Portugal.',
    '',
    'ROBUSTEZ A RUÍDO E INTERRUPÇÕES:',
    '- Se você for interrompido por ruído curto, silêncio, tosse, cadeira, click ou fala sem sentido: NÃO diga "entendi", "sim", "certo" ou similares. IGNORE completamente e continue de onde parou, exatamente na frase anterior.',
    '- Só reaja quando ouvir uma fala clara, articulada e com conteúdo real.',
    '- Se ficou em dúvida se o lead falou algo, espere mais um pouco antes de responder.',
    '',
  ].join('\n');
  return {
    type: 'realtime',
    model: OPENAI_REALTIME_MODEL,
    instructions: `${ptBrPrefix}\n${p.instructions}`,
    output_modalities: ['audio'],
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: 24000 },
        // Semantic VAD: o servidor analisa se o áudio foi FALA REAL antes de interromper.
        // Muito mais robusto contra ruído ambiente que o server_vad tradicional.
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'low',
          interrupt_response: false,
        },
        noise_reduction: { type: 'near_field' },
        transcription: { model: 'whisper-1', language: 'pt' },
      },
      output: {
        format: { type: 'audio/pcm', rate: 24000 },
        voice: normalizeOpenAIRealtimeVoice(p.voice),
      },
    },
    tools: p.tools || [],
    tool_choice: 'auto',
    reasoning: { effort: 'low' },
  };
}

export async function mintOpenAIRealtime(p: MintOpenAIParams): Promise<
  { ok: true; token: string; model: string; session: any; voice: string } | { ok: false; error: string; status: number }
> {
  const session = buildOpenAIRealtimeSession(p);
  const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session }),
  });
  if (!r.ok) {
    const txt = await r.text();
    console.error('[openai-realtime] mint failed', r.status, txt.slice(0, 400));
    return { ok: false, error: `OpenAI ${r.status}: ${txt.slice(0, 200)}`, status: 502 };
  }
  const payload = await r.json();
  const token = payload?.value || payload?.client_secret?.value || payload?.client_secret;
  if (!token) return { ok: false, error: 'OpenAI response missing client_secret.value', status: 502 };
  return { ok: true, token, model: OPENAI_REALTIME_MODEL, session, voice: session.audio.output.voice };
}
