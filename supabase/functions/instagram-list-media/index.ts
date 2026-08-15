// instagram-list-media — lista posts/reels recentes da conta IG para o post-picker.
// Suporta os 2 modos: 'page_token' (graph.facebook.com /{ig_id}/media) e
// 'ig_user_token' (graph.instagram.com /me/media).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { igGraphFetch, IgGraphError } from '../_shared/ig-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return j({ error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return j({ error: 'unauthorized' }, 401);
  const sbUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const sbAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: userData } = await sbUser.auth.getUser();
  if (!userData?.user) return j({ error: 'unauthorized' }, 401);

  const { connection_id, limit } = await req.json().catch(() => ({}));
  if (!connection_id) return j({ error: 'connection_id required' }, 400);

  const { data: conn } = await sbAdmin
    .from('instagram_connections')
    .select('id, organization_id, ig_business_account_id, page_access_token_encrypted, ig_user_access_token_encrypted, ig_auth_style')
    .eq('id', connection_id).maybeSingle();
  if (!conn) return j({ error: 'connection not found' }, 404);

  const { data: belongs } = await sbAdmin.rpc('user_belongs_to_organization', {
    _user_id: userData.user.id, _org_id: conn.organization_id,
  });
  if (!belongs) return j({ error: 'forbidden' }, 403);

  if (!conn.ig_business_account_id) return j({ error: 'conexão incompleta' }, 400);
  const lim = Math.min(50, Math.max(1, Number(limit || 25)));
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

  try {
    let res: any;
    if (conn.ig_auth_style === 'ig_user_token') {
      if (!conn.ig_user_access_token_encrypted) return j({ error: 'conexão sem IG User Token' }, 400);
      const token = await decryptSecret(conn.ig_user_access_token_encrypted);
      res = await igGraphFetch<any>(`/me/media?fields=${fields}&limit=${lim}`, token);
    } else {
      if (!conn.page_access_token_encrypted) return j({ error: 'conexão sem Page Token' }, 400);
      const token = await decryptSecret(conn.page_access_token_encrypted);
      res = await graphFetch<any>(`/${conn.ig_business_account_id}/media?fields=${fields}&limit=${lim}`, token);
    }
    const media = (res?.data ?? []).map((m: any) => ({
      id: m.id,
      caption: m.caption ?? '',
      media_type: m.media_type,
      thumbnail_url: m.thumbnail_url ?? m.media_url ?? null,
      permalink: m.permalink,
      timestamp: m.timestamp,
    }));
    return j({ ok: true, media });
  } catch (e) {
    const ge = e as GraphError | IgGraphError;
    return j({ error: (ge as any).graph?.message ?? String(e) }, 400);
  }
});
