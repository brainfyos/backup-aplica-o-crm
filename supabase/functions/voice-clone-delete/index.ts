// voice-clone-delete — remove voz clonada (xAI + banco + storage).
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    const { id } = await req.json().catch(() => ({}));
    if (!id) return j({ error: 'id required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: profile } = await admin
      .from('profiles').select('organization_id').eq('id', userData.user.id).maybeSingle();
    if (!profile?.organization_id) return j({ error: 'no organization' }, 400);

    const { data: clone } = await admin
      .from('voice_clones')
      .select('*')
      .eq('id', id)
      .eq('organization_id', profile.organization_id)
      .maybeSingle();
    if (!clone) return j({ error: 'not found' }, 404);

    // Best-effort: apaga na xAI
    if (clone.grok_voice_id) {
      try {
        const { data: cred } = await admin
          .from('org_ai_credentials')
          .select('api_key_encrypted')
          .eq('organization_id', profile.organization_id)
          .eq('provider', 'xai')
          .maybeSingle();
        if (cred?.api_key_encrypted) {
          await fetch(`https://api.x.ai/v1/voices/${clone.grok_voice_id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${cred.api_key_encrypted}` },
          });
        }
      } catch (e) {
        console.warn('[voice-clone-delete] xAI delete failed', e);
      }
    }

    // Apaga amostras do storage
    if (Array.isArray(clone.sample_urls) && clone.sample_urls.length > 0) {
      try {
        await admin.storage.from('voice-samples').remove(clone.sample_urls as string[]);
      } catch (e) {
        console.warn('[voice-clone-delete] storage remove failed', e);
      }
    }

    await admin.from('voice_clones').delete().eq('id', id);
    return j({ ok: true });
  } catch (e) {
    console.error('[voice-clone-delete]', e);
    return j({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
