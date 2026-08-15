// Helper compartilhado do OAuth centralizado da Meta.
// Lê App ID/Secret da tabela platform_settings (cadastrados pelo Super Admin).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from './meta-crypto.ts';

export interface PlatformMetaApp {
  app_id: string;
  app_secret: string;
  graph_version: string;
  enabled: boolean;
  scopes_override: string | null;
}

let cached: PlatformMetaApp | null = null;
let cachedAt = 0;

export async function loadPlatformMetaApp(): Promise<PlatformMetaApp> {
  if (cached && Date.now() - cachedAt < 60_000) return cached;
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await sb
    .from('platform_settings')
    .select('meta_oauth_app_id, meta_oauth_app_secret_encrypted, meta_oauth_graph_version, meta_oauth_enabled, meta_oauth_scopes_override')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`platform_settings: ${error.message}`);
  if (!data?.meta_oauth_app_id || !data?.meta_oauth_app_secret_encrypted) {
    throw new Error('Meta OAuth não configurado no Super Admin');
  }
  const app_secret = await decryptSecret(data.meta_oauth_app_secret_encrypted);
  cached = {
    app_id: String(data.meta_oauth_app_id),
    app_secret,
    graph_version: data.meta_oauth_graph_version || 'v21.0',
    enabled: !!data.meta_oauth_enabled,
    scopes_override: (data as any).meta_oauth_scopes_override || null,
  };
  cachedAt = Date.now();
  return cached;
}

export function invalidatePlatformMetaAppCache() {
  cached = null;
  cachedAt = 0;
}

export function buildAuthorizeUrl(app: PlatformMetaApp, params: {
  redirect_uri: string;
  state: string;
  scope: string;
}): string {
  const u = new URL(`https://www.facebook.com/${app.graph_version}/dialog/oauth`);
  u.searchParams.set('client_id', app.app_id);
  u.searchParams.set('redirect_uri', params.redirect_uri);
  u.searchParams.set('state', params.state);
  u.searchParams.set('scope', params.scope);
  u.searchParams.set('response_type', 'code');
  return u.toString();
}

// Presets mínimos por caso de uso. Só peça permissões que você JÁ adicionou no
// Meta App Dashboard → App Review → Permissions and Features. Em modo Dev, pedir
// escopos não cadastrados retorna "Invalid Scopes" e bloqueia o login.
export const SCOPES_INSTAGRAM = [
  'pages_show_list',
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'instagram_manage_engagement',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
];

export const SCOPES_ADS = [
  'ads_read',
  'ads_management',
  'business_management',
];

export function resolveScopes(
  purpose: 'instagram' | 'ads' | 'both',
  override?: string | null,
): string {
  const allowed = new Set<string>();
  if (purpose === 'instagram' || purpose === 'both') SCOPES_INSTAGRAM.forEach(s => allowed.add(s));
  if (purpose === 'ads' || purpose === 'both') SCOPES_ADS.forEach(s => allowed.add(s));

  if (override && override.trim()) {
    return override
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => s && allowed.has(s))
      .join(',');
  }
  return Array.from(allowed).join(',');
}

/** Compat: mantido só para não quebrar imports antigos. Prefira resolveScopes(). */
export const DEFAULT_SCOPES = [...SCOPES_INSTAGRAM, ...SCOPES_ADS].join(',');

export async function exchangeCodeForToken(app: PlatformMetaApp, code: string, redirect_uri: string) {
  const u = new URL(`https://graph.facebook.com/${app.graph_version}/oauth/access_token`);
  u.searchParams.set('client_id', app.app_id);
  u.searchParams.set('client_secret', app.app_secret);
  u.searchParams.set('redirect_uri', redirect_uri);
  u.searchParams.set('code', code);
  const res = await fetch(u.toString());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`token exchange: ${JSON.stringify(body)}`);
  return body as { access_token: string; expires_in?: number; token_type?: string };
}

export async function exchangeForLongLivedToken(app: PlatformMetaApp, shortToken: string) {
  const u = new URL(`https://graph.facebook.com/${app.graph_version}/oauth/access_token`);
  u.searchParams.set('grant_type', 'fb_exchange_token');
  u.searchParams.set('client_id', app.app_id);
  u.searchParams.set('client_secret', app.app_secret);
  u.searchParams.set('fb_exchange_token', shortToken);
  const res = await fetch(u.toString());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`long-lived exchange: ${JSON.stringify(body)}`);
  return body as { access_token: string; expires_in?: number; token_type?: string };
}

export async function discoverAssets(
  app: PlatformMetaApp,
  userToken: string,
  purpose: 'instagram' | 'ads' | 'both' = 'both',
) {
  const base = `https://graph.facebook.com/${app.graph_version}`;
  const pagesPromise = purpose === 'ads'
    ? null
    : fetch(`${base}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}&limit=100`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
  const adsPromise = purpose === 'instagram'
    ? null
    : fetch(`${base}/me/adaccounts?fields=id,account_id,name,account_status,currency,business{id,name}&limit=100`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
  const [pagesRes, adsRes] = await Promise.all([pagesPromise, adsPromise]);
  const pagesJson = pagesRes ? await pagesRes.json().catch(() => ({})) : {};
  const adsJson = adsRes ? await adsRes.json().catch(() => ({})) : {};
  return {
    pages: Array.isArray(pagesJson?.data) ? pagesJson.data : [],
    ad_accounts: Array.isArray(adsJson?.data) ? adsJson.data : [],
    pages_error: !pagesRes || pagesRes.ok ? null : pagesJson,
    ads_error: !adsRes || adsRes.ok ? null : adsJson,
  };
}
