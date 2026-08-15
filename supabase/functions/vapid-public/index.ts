// vapid-public
// Retorna a chave pública VAPID + subject para o PWA se inscrever.
// Nunca retorna a chave privada.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data } = await admin
    .from('platform_settings')
    .select('vapid_public_key, vapid_subject')
    .limit(1)
    .maybeSingle();

  if (!data?.vapid_public_key) {
    return json({ configured: false }, 200);
  }
  return json({
    configured: true,
    public_key: data.vapid_public_key,
    subject: data.vapid_subject || 'mailto:noreply@vendus.com.br',
  });
});
