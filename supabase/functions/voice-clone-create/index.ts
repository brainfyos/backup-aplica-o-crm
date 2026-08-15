// voice-clone-create — cria voz clonada na xAI a partir de amostras no bucket voice-samples.
// Endpoint xAI: POST /v1/custom-voices (multipart/form-data), 1 arquivo por voz, max 120s.
// Se receber múltiplas amostras WAV do mesmo formato (mono/16k/16-bit gerados pelo recorder),
// concatenamos em um único WAV antes de enviar. Caso contrário, usamos a amostra maior.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const XAI_CUSTOM_VOICES_ENDPOINT = 'https://api.x.ai/v1/custom-voices';

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isRiffWav(bytes: Uint8Array): boolean {
  return bytes.length > 44 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;  // WAVE
}

// Concatena WAVs PCM mono de mesmo formato (16kHz/16-bit produzidos pelo recorder).
// Mantém o header do primeiro e recalcula chunkSize / data size.
function concatPcmWavs(files: Uint8Array[]): Uint8Array {
  if (files.length === 1) return files[0];
  const header = files[0].subarray(0, 44);
  const datas = files.map((f) => f.subarray(44));
  const totalData = datas.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(44 + totalData);
  out.set(header, 0);
  let off = 44;
  for (const c of datas) { out.set(c, off); off += c.length; }
  const view = new DataView(out.buffer);
  view.setUint32(4, 36 + totalData, true);   // RIFF chunk size
  view.setUint32(40, totalData, true);       // data chunk size
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return j({ error: 'missing auth' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return j({ error: 'not authenticated' }, 401);

    const { name, description, samplePaths } = await req.json().catch(() => ({}));
    if (!name || !Array.isArray(samplePaths) || samplePaths.length === 0)
      return j({ error: 'name and samplePaths required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: profile } = await admin
      .from('profiles').select('organization_id').eq('id', userData.user.id).maybeSingle();
    if (!profile?.organization_id) return j({ error: 'no organization' }, 400);
    const orgId = profile.organization_id;

    const { data: clone, error: cErr } = await admin
      .from('voice_clones')
      .insert({
        organization_id: orgId,
        name,
        description: description ?? null,
        sample_urls: samplePaths,
        status: 'processing',
        created_by: userData.user.id,
      })
      .select('id')
      .single();
    if (cErr || !clone) return j({ error: cErr?.message || 'db insert failed' }, 500);

    const finish = async (patch: Record<string, unknown>) =>
      admin.from('voice_clones').update(patch).eq('id', clone.id);

    const { getOrgProviderKey } = await import('../_shared/voice-credentials.ts');
    const xaiKey = await getOrgProviderKey(admin, orgId, 'xai');
    if (!xaiKey) {
      await finish({ status: 'failed', status_reason: 'xAI key not configured' });
      return j({ id: clone.id, status: 'failed', error: 'AI_NO_CREDENTIAL: cadastre sua chave xAI em Admin → Integrações → xAI (Grok).' }, 400);
    }

    // Baixa amostras
    const buffers: Array<{ name: string; bytes: Uint8Array }> = [];
    for (const path of samplePaths.slice(0, 3)) {
      const { data: file, error: dErr } = await admin.storage.from('voice-samples').download(path);
      if (dErr || !file) {
        await finish({ status: 'failed', status_reason: `sample download failed: ${dErr?.message}` });
        return j({ id: clone.id, status: 'failed', error: `Falha ao baixar amostra: ${dErr?.message || 'não encontrada'}` }, 500);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      buffers.push({ name: path.split('/').pop() || 'sample.wav', bytes });
    }

    // Consolida em UM único arquivo (xAI aceita apenas 1 por voz)
    let uploadName = buffers[0].name;
    let uploadBytes = buffers[0].bytes;
    let uploadType = 'audio/wav';

    const allWav = buffers.every((b) => isRiffWav(b.bytes) && b.name.toLowerCase().endsWith('.wav'));
    if (buffers.length > 1 && allWav) {
      try {
        uploadBytes = concatPcmWavs(buffers.map((b) => b.bytes));
        uploadName = `${name.replace(/[^a-zA-Z0-9._-]/g, '_')}-merged.wav`;
      } catch {
        // fallback: usa a maior amostra
        const largest = buffers.slice().sort((a, b) => b.bytes.length - a.bytes.length)[0];
        uploadBytes = largest.bytes;
        uploadName = largest.name;
      }
    } else if (buffers.length > 1) {
      const largest = buffers.slice().sort((a, b) => b.bytes.length - a.bytes.length)[0];
      uploadBytes = largest.bytes;
      uploadName = largest.name;
      const lower = uploadName.toLowerCase();
      if (lower.endsWith('.mp3')) uploadType = 'audio/mpeg';
      else if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) uploadType = 'audio/mp4';
      else if (lower.endsWith('.flac')) uploadType = 'audio/flac';
      else if (lower.endsWith('.ogg') || lower.endsWith('.opus')) uploadType = 'audio/ogg';
      else uploadType = 'audio/wav';
    }

    const form = new FormData();
    form.append('name', name);
    if (description) form.append('description', description);
    form.append('language', 'pt-BR');
    form.append('file', new Blob([uploadBytes], { type: uploadType }), uploadName);

    try {
      const r = await fetch(XAI_CUSTOM_VOICES_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${xaiKey}` },
        body: form,
      });
      const raw = await r.text().catch(() => '');
      if (!r.ok) {
        const reason = `xAI ${r.status}: ${raw.slice(0, 400)}`;
        console.error('[voice-clone-create] xAI error', reason);
        await finish({ status: 'failed', status_reason: reason });
        const friendly = r.status === 403
          ? 'xAI recusou a clonagem — Custom Voices está disponível apenas para contas dos EUA (fora de Illinois).'
          : r.status === 400
            ? `xAI recusou o áudio: ${raw.slice(0, 200)}`
            : `xAI ${r.status}: ${raw.slice(0, 200)}`;
        return j({ id: clone.id, status: 'failed', error: friendly }, 200);
      }
      let body: any = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
      const voiceId = body?.voice_id || body?.id || null;
      await finish({
        status: voiceId ? 'ready' : 'failed',
        status_reason: voiceId ? null : `resposta sem voice_id: ${raw.slice(0, 200)}`,
        grok_voice_id: voiceId,
      });
      return j({
        id: clone.id,
        status: voiceId ? 'ready' : 'failed',
        grok_voice_id: voiceId,
        ...(voiceId ? {} : { error: 'xAI não retornou voice_id' }),
      }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'network error';
      await finish({ status: 'failed', status_reason: msg });
      return j({ id: clone.id, status: 'failed', error: msg }, 200);
    }
  } catch (e) {
    console.error('[voice-clone-create]', e);
    return j({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
