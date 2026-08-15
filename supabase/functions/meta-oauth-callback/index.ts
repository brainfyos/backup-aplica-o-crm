// meta-oauth-callback
// Facebook chama esta URL com ?code&state. Trocamos code -> token, exchange para long-lived,
// descobrimos páginas/ad accounts e marcamos a sessão como 'ready'. Por fim, redireciona
// para uma página do próprio Vendus, que devolve o resultado à janela principal.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { encryptSecret } from '../_shared/meta-crypto.ts';
import {
  loadPlatformMetaApp,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  discoverAssets,
} from '../_shared/meta-oauth.ts';

function redirectToVendus(payload: Record<string, unknown>) {
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || Deno.env.get('SITE_URL') || 'https://app.vendus.com.br';
  const url = new URL('/meta-oauth-complete.html', appUrl);
  url.searchParams.set('status', String(payload.status ?? 'error'));
  if (payload.session_id) url.searchParams.set('session_id', String(payload.session_id));
  if (payload.error) url.searchParams.set('error', String(payload.error).slice(0, 600));
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const err = url.searchParams.get('error') || url.searchParams.get('error_description');
    if (err) return redirectToVendus({ status: 'error', error: err });
    if (!code || !state) return redirectToVendus({ status: 'error', error: 'missing code/state' });

    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: session, error: selErr } = await sbAdmin
      .from('meta_oauth_sessions')
      .select('*')
      .eq('state', state)
      .maybeSingle();
    if (selErr || !session) return redirectToVendus({ status: 'error', error: 'sessão inválida' });
    if (session.status !== 'pending') return redirectToVendus({ status: 'error', error: 'sessão já usada' });

    const app = await loadPlatformMetaApp();
    const redirect_uri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-oauth-callback`;

    try {
      const short = await exchangeCodeForToken(app, code, redirect_uri);
      const long = await exchangeForLongLivedToken(app, short.access_token).catch(() => short);
      const expiresAt = long.expires_in
        ? new Date(Date.now() + long.expires_in * 1000).toISOString()
        : null;
      const assets = await discoverAssets(app, long.access_token, session.purpose);

      await sbAdmin.from('meta_oauth_sessions').update({
        status: 'ready',
        user_access_token_encrypted: await encryptSecret(long.access_token),
        token_expires_at: expiresAt,
        discovered: assets,
      }).eq('id', session.id);

      return redirectToVendus({ status: 'ready', session_id: session.id });
    } catch (e) {
      await sbAdmin.from('meta_oauth_sessions').update({
        status: 'error',
        error: (e as Error).message,
      }).eq('id', session.id);
      return redirectToVendus({ status: 'error', error: (e as Error).message });
    }
  } catch (e) {
    console.error('[meta-oauth-callback]', e);
    return redirectToVendus({ status: 'error', error: (e as Error).message });
  }
});
