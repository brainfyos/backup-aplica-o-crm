// Secure Meta Ads Insights bridge for the launch dashboard.
// The OAuth token remains encrypted in Vendus; callers receive metrics only.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeAccount(value: unknown) {
  return String(value || '').replace(/^act_/, '').replace(/\D/g, '');
}

function customConversionActionType(value: unknown) {
  const id = String(value || '').replace(/\D/g, '');
  return id ? `offsite_conversion.custom.${id}` : null;
}

function actionValue(actions: unknown, actionTypes: Set<string>) {
  if (!Array.isArray(actions) || actionTypes.size === 0) return 0;
  return actions.reduce((total, action) => {
    const type = String(action?.action_type || '');
    if (!actionTypes.has(type)) return total;
    const value = Number(action?.value || 0);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

async function graphGet(
  path: string,
  token: string,
  params: Record<string, string>,
) {
  const url = new URL(`https://graph.facebook.com/v21.0${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Meta Graph ${response.status}`);
  }
  return payload;
}

async function fetchAllPages(
  path: string,
  token: string,
  params: Record<string, string>,
  maxPages = 20,
) {
  const rows: Record<string, unknown>[] = [];
  let payload: any = await graphGet(path, token, params);
  for (let page = 0; page < maxPages; page += 1) {
    if (Array.isArray(payload?.data)) rows.push(...payload.data);
    const next = payload?.paging?.next;
    if (!next) break;
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Meta Graph ${response.status}`);
    }
  }
  return rows;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const expectedSecret = Deno.env.get('LAUNCH_META_INSIGHTS_SECRET') || '';
  const providedSecret = request.headers.get('x-launch-meta-secret') || '';
  if (!expectedSecret || !safeEqual(providedSecret, expectedSecret)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const accountId = normalizeAccount(url.searchParams.get('account_id'));
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!accountId || !isDate(from) || !isDate(to) || from > to) {
    return json({ error: 'account_id_from_to_required' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: credentials, error: credentialsError } = await supabase
    .from('org_marketing_credentials')
    .select('id,organization_id,account_name,ad_account_id,access_token_encrypted,last_sync_at,last_sync_status')
    .eq('provider', 'meta')
    .eq('is_active', true);
  if (credentialsError) return json({ error: 'credential_lookup_failed' }, 500);

  const credential = (credentials || []).find(
    (row: Record<string, unknown>) => normalizeAccount(row.ad_account_id) === accountId,
  );
  if (!credential?.access_token_encrypted) {
    return json({ error: 'connected_ad_account_not_found' }, 404);
  }

  try {
    const accessToken = await decryptSecret(credential.access_token_encrypted);
    const account = `/act_${accountId}/insights`;
    const timeRange = JSON.stringify({ since: from, until: to });
    const [daily, ads, adsets] = await Promise.all([
      fetchAllPages(account, accessToken, {
        fields: 'spend,impressions,clicks,reach,ctr,cpm,cpc,actions,date_start,date_stop',
        level: 'account',
        time_increment: '1',
        time_range: timeRange,
        limit: '100',
      }, 5),
      fetchAllPages(account, accessToken, {
        fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,cost_per_action_type',
        level: 'ad',
        time_range: timeRange,
        limit: '500',
      }),
      fetchAllPages(`/act_${accountId}/adsets`, accessToken, {
        fields: 'id,name,promoted_object',
        limit: '500',
      }),
    ]);

    const resultActionByAdset = new Map<string, string>();
    for (const adset of adsets) {
      const actionType = customConversionActionType(
        (adset.promoted_object as Record<string, unknown> | undefined)?.custom_conversion_id,
      );
      if (actionType) resultActionByAdset.set(String(adset.id || ''), actionType);
    }
    const resultActionTypes = new Set(resultActionByAdset.values());

    const enrichedDaily = daily.map((row) => ({
      ...row,
      results: actionValue(row.actions, resultActionTypes),
    }));
    const enrichedAds = ads.map((row) => {
      const actionType = resultActionByAdset.get(String(row.adset_id || '')) || null;
      return {
        ...row,
        result_action_type: actionType,
        results: actionType ? actionValue(row.actions, new Set([actionType])) : 0,
      };
    });

    return json({
      connected: true,
      source: 'vendus_oauth',
      account: {
        id: accountId,
        name: credential.account_name || null,
        last_sync_at: credential.last_sync_at || null,
        last_sync_status: credential.last_sync_status || null,
      },
      conversions: enrichedAds.reduce(
        (total, row) => total + Number(row.results || 0),
        0,
      ),
      conversion_action_types: [...resultActionTypes],
      daily: enrichedDaily,
      ads: enrichedAds,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[launch-meta-insights]', error);
    return json({
      connected: false,
      error: 'meta_insights_unavailable',
      message: error instanceof Error ? error.message : 'Meta Ads indisponível',
    }, 502);
  }
});
