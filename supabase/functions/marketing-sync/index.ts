// marketing-sync — sincroniza catálogo Meta Ads (campanhas/adsets/ads/creativos/insights)
// e resolve atribuições pendentes de CTWA.
//
// POST { organization_id?: string, credential_id?: string, provider?: 'meta' }
// - Sem organization_id: roda para todas empresas com credenciais ativas.
// - Provider default: 'meta' (Facebook + Instagram Ads).
//
// verify_jwt = false (chamável via cron interno)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function supa() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

const GRAPH = 'https://graph.facebook.com/v20.0';

async function graphGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error?.message || res.statusText;
    throw new Error(`Meta Graph ${path}: ${err}`);
  }
  return body;
}

const STD_ACTION_LABELS: Record<string, string> = {
  lead: 'Leads',
  purchase: 'Compras',
  complete_registration: 'Cadastros completos',
  initiate_checkout: 'Checkouts iniciados',
  add_to_cart: 'Add. ao carrinho',
  view_content: 'Visualização de conteúdo',
  subscribe: 'Assinaturas',
  contact: 'Contatos',
  schedule: 'Agendamentos',
  submit_application: 'Aplicações enviadas',
  add_payment_info: 'Info de pagamento',
  start_trial: 'Início de trial',
  'onsite_conversion.messaging_conversation_started_7d': 'Conversas iniciadas (7d)',
  'onsite_conversion.messaging_first_reply': 'Primeira resposta (msg)',
  'onsite_conversion.lead_grouped': 'Leads (agrupado)',
  'onsite_conversion.purchase': 'Compras (onsite)',
};

function labelForActionType(t: string): string {
  if (STD_ACTION_LABELS[t]) return STD_ACTION_LABELS[t];
  if (t.startsWith('offsite_conversion.custom.')) return `Custom · ${t.split('.').pop()}`;
  if (t.startsWith('offsite_conversion.fb_pixel_')) return `Pixel · ${t.replace('offsite_conversion.fb_pixel_', '')}`;
  if (t.startsWith('onsite_conversion.')) return `Onsite · ${t.replace('onsite_conversion.', '')}`;
  return t;
}

const TRACKABLE_ACTION_PREFIXES = [
  'lead', 'purchase', 'complete_registration', 'initiate_checkout', 'add_to_cart',
  'view_content', 'subscribe', 'contact', 'schedule', 'submit_application',
  'add_payment_info', 'start_trial',
  'onsite_conversion.', 'offsite_conversion.',
];
function isTrackableAction(t: string): boolean {
  return TRACKABLE_ACTION_PREFIXES.some((p) => t === p || t.startsWith(p));
}

type SyncWindow = { since?: string; until?: string };

async function syncMetaForOrg(
  sb: any,
  cred: any,
  window: SyncWindow = {},
): Promise<{ ok: boolean; error?: string; counts?: any }> {
  const token = await decryptSecret(cred.access_token_encrypted).catch(() => null);
  if (!token) return { ok: false, error: 'missing_or_invalid_token' };
  const adAcct = cred.ad_account_id;
  if (!adAcct) return { ok: false, error: 'missing_ad_account_id' };
  const acctPath = adAcct.startsWith('act_') ? `/${adAcct}` : `/act_${adAcct}`;
  const counts = { campaigns: 0, adsets: 0, ads: 0, creatives: 0, insights: 0, conversions: 0, conv_defs: 0 };

  // Custom conversions (catálogo)
  try {
    const cc = await graphGet(`${acctPath}/customconversions`, token, {
      fields: 'id,name,rule,custom_event_type,pixel,default_conversion_value',
      limit: '200',
    });
    const liveCustomIds = new Set<string>();
    for (const c of cc.data ?? []) {
      const externalId = `offsite_conversion.custom.${c.id}`;
      liveCustomIds.add(externalId);
      const pixelId = c?.pixel?.id ?? null;
      await sb.from('marketing_conversion_definitions').upsert({
        organization_id: cred.organization_id,
        provider: 'meta',
        external_id: externalId,
        kind: 'custom',
        name: c.name ?? `Custom ${c.id}`,
        category: c.custom_event_type ?? null,
        rule: c.rule ? (typeof c.rule === 'string' ? JSON.parse(c.rule) : c.rule) : null,
        pixel_id: pixelId,
        default_currency: c?.default_conversion_value?.currency ?? null,
        is_active: true,
        metadata: c,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,provider,external_id' });
      counts.conv_defs++;
    }

    // A API só devolve conversões existentes. Desativa no Vendus as que foram
    // removidas na Meta para elas não continuarem selecionáveis no dashboard.
    const { data: storedCustom } = await sb.from('marketing_conversion_definitions')
      .select('id,external_id')
      .eq('organization_id', cred.organization_id)
      .eq('provider', 'meta')
      .eq('kind', 'custom')
      .eq('is_active', true);
    for (const stored of storedCustom ?? []) {
      if (!liveCustomIds.has(stored.external_id)) {
        await sb.from('marketing_conversion_definitions')
          .update({ is_active: false, is_primary: false, synced_at: new Date().toISOString() })
          .eq('id', stored.id);
      }
    }
  } catch (e) {
    console.warn('[marketing-sync] customconversions error:', (e as Error).message);
  }


  // Campanhas
  const campRes = await graphGet(`${acctPath}/campaigns`, token, {
    fields: 'id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time',
    limit: '200',
  });
  for (const c of campRes.data ?? []) {
    await sb.from('marketing_campaigns').upsert({
      organization_id: cred.organization_id,
      provider: 'meta',
      external_id: c.id,
      ad_account_id: adAcct,
      name: c.name, objective: c.objective, status: c.status,
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
      start_time: c.start_time ?? null, stop_time: c.stop_time ?? null,
      metadata: c, synced_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider,external_id' });
    counts.campaigns++;
  }

  // Adsets
  const asetRes = await graphGet(`${acctPath}/adsets`, token, {
    fields: 'id,name,status,campaign_id,targeting,daily_budget,lifetime_budget',
    limit: '200',
  });
  for (const a of asetRes.data ?? []) {
    const { data: camp } = await sb.from('marketing_campaigns')
      .select('id').eq('organization_id', cred.organization_id).eq('provider', 'meta')
      .eq('external_id', a.campaign_id).maybeSingle();
    await sb.from('marketing_adsets').upsert({
      organization_id: cred.organization_id,
      provider: 'meta', external_id: a.id,
      campaign_id: camp?.id ?? null, campaign_external_id: a.campaign_id ?? null,
      name: a.name, status: a.status, targeting: a.targeting ?? {},
      daily_budget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
      lifetime_budget: a.lifetime_budget ? Number(a.lifetime_budget) / 100 : null,
      metadata: a, synced_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider,external_id' });
    counts.adsets++;
  }

  // Ads + creatives
  const adRes = await graphGet(`${acctPath}/ads`, token, {
    fields: 'id,name,status,campaign_id,adset_id,creative{id,name,title,body,call_to_action_type,thumbnail_url,image_url},preview_shareable_link',
    limit: '200',
  });
  for (const ad of adRes.data ?? []) {
    let creativeUuid: string | null = null;
    if (ad.creative?.id) {
      const cr = ad.creative;
      const { data: creRow } = await sb.from('marketing_creatives').upsert({
        organization_id: cred.organization_id,
        provider: 'meta', external_id: cr.id,
        name: cr.name, headline: cr.title, body: cr.body,
        cta_type: cr.call_to_action_type,
        thumbnail_url: cr.thumbnail_url, media_url: cr.image_url,
        metadata: cr, synced_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,provider,external_id' }).select('id').maybeSingle();
      creativeUuid = creRow?.id ?? null;
      counts.creatives++;
    }
    const { data: camp } = await sb.from('marketing_campaigns')
      .select('id').eq('organization_id', cred.organization_id).eq('provider', 'meta')
      .eq('external_id', ad.campaign_id).maybeSingle();
    const { data: aset } = await sb.from('marketing_adsets')
      .select('id').eq('organization_id', cred.organization_id).eq('provider', 'meta')
      .eq('external_id', ad.adset_id).maybeSingle();

    await sb.from('marketing_ads').upsert({
      organization_id: cred.organization_id,
      provider: 'meta', external_id: ad.id,
      campaign_id: camp?.id ?? null, campaign_external_id: ad.campaign_id ?? null,
      adset_id: aset?.id ?? null, adset_external_id: ad.adset_id ?? null,
      creative_id: creativeUuid, creative_external_id: ad.creative?.id ?? null,
      name: ad.name, status: ad.status, preview_url: ad.preview_shareable_link ?? null,
      metadata: ad, synced_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider,external_id' });
    counts.ads++;
  }

  // Insights nível ad — janela customizável (default: últimos 90 dias) com paginação.
  const discoveredActions = new Set<string>();
  try {
    const insParams: Record<string, string> = {
      level: 'ad',
      fields: 'ad_id,adset_id,campaign_id,spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values,date_start,date_stop',
      time_increment: '1',
      use_unified_attribution_setting: 'true',
      action_report_time: 'conversion',
      limit: '500',
    };
    if (window.since && window.until) {
      insParams.time_range = JSON.stringify({ since: window.since, until: window.until });
    } else {
      // Intervalo explícito inclui o dia corrente; `last_90d` da Meta pode terminar ontem.
      const until = new Date();
      const since = new Date(until);
      since.setUTCDate(since.getUTCDate() - 89);
      insParams.time_range = JSON.stringify({
        since: since.toISOString().slice(0, 10),
        until: until.toISOString().slice(0, 10),
      });
    }

    let pageUrl: string | null = null;
    let pageCount = 0;
    const MAX_PAGES = 60;
    let insRes: any = await graphGet(`${acctPath}/insights`, token, insParams);
    while (insRes) {
      pageCount++;
      for (const row of insRes.data ?? []) {
        const actions = Array.isArray(row.actions) ? row.actions : [];
        const actionValues = Array.isArray(row.action_values) ? row.action_values : [];
        const purchases = Number(actions.find((a: any) => a.action_type === 'purchase')?.value ?? 0);
        const revenue = Number(actionValues.find((a: any) => a.action_type === 'purchase')?.value ?? actions.find((a: any) => a.action_type === 'purchase_value')?.value ?? 0);
        const ctwa = Number(actions.find((a: any) => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value ?? 0);
        try {
          await sb.from('marketing_insights_daily').upsert({
            organization_id: cred.organization_id,
            provider: 'meta', entity_type: 'ad', entity_external_id: row.ad_id,
            date: row.date_start,
            spend: Number(row.spend ?? 0),
            impressions: Number(row.impressions ?? 0),
            clicks: Number(row.clicks ?? 0),
            ctr: row.ctr ? Number(row.ctr) : null,
            cpc: row.cpc ? Number(row.cpc) : null,
            cpm: row.cpm ? Number(row.cpm) : null,
            reach: row.reach ? Number(row.reach) : null,
            frequency: row.frequency ? Number(row.frequency) : null,
            ctwa_clicks: ctwa, purchases, revenue,
            raw: row, synced_at: new Date().toISOString(),
          }, { onConflict: 'organization_id,provider,entity_type,entity_external_id,date' });
          counts.insights++;

          // Persistir cada action_type em marketing_conversion_metrics_daily
          const perAction: Record<string, { count: number; value: number }> = {};
          for (const a of actions) {
            if (!a?.action_type || !isTrackableAction(a.action_type)) continue;
            const bucket = (perAction[a.action_type] ||= { count: 0, value: 0 });
            bucket.count += Number(a.value ?? 0);
            discoveredActions.add(a.action_type);
          }
          for (const av of actionValues) {
            if (!av?.action_type || !isTrackableAction(av.action_type)) continue;
            const bucket = (perAction[av.action_type] ||= { count: 0, value: 0 });
            bucket.value += Number(av.value ?? 0);
            discoveredActions.add(av.action_type);
          }
          const convRows = Object.entries(perAction).map(([action_type, v]) => ({
            organization_id: cred.organization_id,
            provider: 'meta',
            date: row.date_start,
            entity_type: 'ad',
            entity_external_id: row.ad_id,
            action_type,
            count: v.count,
            value: v.value,
            synced_at: new Date().toISOString(),
          }));
          if (convRows.length) {
            const { error: convErr } = await sb.from('marketing_conversion_metrics_daily')
              .upsert(convRows, { onConflict: 'organization_id,provider,date,entity_type,entity_external_id,action_type' });
            if (convErr) console.warn('[marketing-sync] conv upsert error:', convErr.message);
            else counts.conversions += convRows.length;
          }
        } catch (upErr) {
          console.warn('[marketing-sync] upsert insight error:', (upErr as Error).message);
        }
      }
      pageUrl = insRes.paging?.next ?? null;
      if (!pageUrl || pageCount >= MAX_PAGES) break;
      try {
        const res = await fetch(pageUrl);
        insRes = await res.json();
        if (!res.ok) {
          console.warn('[marketing-sync] page fetch not ok:', insRes?.error?.message ?? res.statusText);
          break;
        }
      } catch (pageErr) {
        console.warn('[marketing-sync] page fetch error:', (pageErr as Error).message);
        break;
      }
    }
  } catch (e) {
    console.warn('[marketing-sync] insights error:', (e as Error).message);
  }

  // Upsert de standard events descobertos como definições
  for (const at of discoveredActions) {
    if (at.startsWith('offsite_conversion.custom.')) continue; // já veio do catálogo
    try {
      await sb.from('marketing_conversion_definitions').upsert({
        organization_id: cred.organization_id,
        provider: 'meta',
        external_id: at,
        kind: 'standard',
        name: labelForActionType(at),
        category: at.split('.')[0],
        synced_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,provider,external_id', ignoreDuplicates: false });
      counts.conv_defs++;
    } catch (e) {
      console.warn('[marketing-sync] std def upsert error:', (e as Error).message);
    }
  }

  // Garante que exista uma conversão marcada como padrão (is_primary)
  try {
    const { data: definitions } = await sb.from('marketing_conversion_definitions')
      .select('id,external_id,name,kind,category,pixel_id,is_primary')
      .eq('organization_id', cred.organization_id).eq('provider', 'meta').eq('is_active', true);
    const currentPrimary = (definitions ?? []).find((definition: any) => definition.is_primary);
    let chosen = currentPrimary ?? null;
    if (currentPrimary) {
      const normalizeName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const sameGoal = (definitions ?? []).filter((definition: any) => normalizeName(definition.name) === normalizeName(currentPrimary.name));
      if (sameGoal.length > 1) {
        const since30d = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
        const { data: recentMetrics } = await sb.from('marketing_conversion_metrics_daily')
          .select('action_type,count').eq('organization_id', cred.organization_id).eq('provider', 'meta').gte('date', since30d);
        const totals: Record<string, number> = {};
        for (const metric of recentMetrics ?? []) totals[metric.action_type] = (totals[metric.action_type] ?? 0) + Number(metric.count ?? 0);
        chosen = [...sameGoal].sort((a: any, b: any) => {
          const score = (definition: any) => (definition.kind === 'custom' ? 10_000 : 0)
            + ((definition.category ?? '').toUpperCase() === 'LEAD' ? 100_000 : 0)
            + (definition.pixel_id ? 1_000 : 0)
            + Math.min(totals[definition.external_id] ?? 0, 999);
          return score(b) - score(a);
        })[0];
      }
    } else {
      const preferred = ['purchase', 'lead', 'onsite_conversion.messaging_conversation_started_7d', 'complete_registration'];
      chosen = (definitions ?? []).find((definition: any) => preferred.includes(definition.external_id)) ?? definitions?.[0] ?? null;
    }
    if (chosen && (!currentPrimary || chosen.id !== currentPrimary.id)) {
      await sb.from('marketing_conversion_definitions').update({ is_primary: false })
        .eq('organization_id', cred.organization_id).eq('provider', 'meta').eq('is_primary', true);
      await sb.from('marketing_conversion_definitions').update({ is_primary: true }).eq('id', chosen.id);
    }
  } catch (error) {
    console.warn('[marketing-sync] primary conversion resolution error:', (error as Error).message);
  }

  return { ok: true, counts };
}



async function resolvePendingAttributions(sb: any, organization_id?: string): Promise<number> {
  // Leads com ctwa_clid/fbclid ainda sem evento campaign_identified
  let q = sb.from('leads')
    .select('id')
    .not('ctwa_clid', 'is', null)
    .limit(500);
  if (organization_id) q = q.eq('organization_id', organization_id);
  const { data } = await q;
  let n = 0;
  for (const l of data ?? []) {
    try {
      await sb.rpc('resolve_click_attribution', { p_lead_id: l.id });
      n++;
    } catch (_) {}
  }
  return n;
}

async function runSync(sb: any, creds: any[], window: SyncWindow) {
  for (const cred of creds ?? []) {
    let result: any;
    try {
      result = await syncMetaForOrg(sb, cred, window);
    } catch (e) {
      result = { ok: false, error: (e as Error).message };
    }
    try {
      const resolved = await resolvePendingAttributions(sb, cred.organization_id);
      await sb.from('org_marketing_credentials').update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.ok ? 'ok' : 'error',
        last_sync_error: result.ok ? null : String(result.error ?? ''),
      }).eq('id', cred.id);
      console.log('[marketing-sync] done', { org: cred.organization_id, resolved, ...result });
    } catch (e) {
      console.warn('[marketing-sync] post error:', (e as Error).message);
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = supa();
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const organization_id: string | undefined = body?.organization_id;
  const credential_id: string | undefined = body?.credential_id;
  const provider: string = body?.provider ?? 'meta';
  const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const window: SyncWindow = {};
  if (isYmd(body?.since)) window.since = body.since;
  if (isYmd(body?.until)) window.until = body.until;

  if (credential_id) {
    if (!organization_id) {
      return new Response(JSON.stringify({ ok: false, error: 'organization_id_required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const [{ data: member }, { data: superRole }] = await Promise.all([
      sb.from('user_organizations').select('role')
        .eq('user_id', userData.user.id).eq('organization_id', organization_id).maybeSingle(),
      sb.from('user_roles').select('role')
        .eq('user_id', userData.user.id).eq('role', 'super_admin').maybeSingle(),
    ]);
    if (!superRole && !['admin', 'owner'].includes(member?.role ?? '')) {
      return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let credsQ = sb.from('org_marketing_credentials')
    .select('*').eq('is_active', true).eq('provider', provider);
  if (organization_id) credsQ = credsQ.eq('organization_id', organization_id);
  if (credential_id) credsQ = credsQ.eq('id', credential_id);
  const { data: creds, error } = await credsQ;
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const now = new Date();
  const runnable: any[] = [];
  for (const cred of creds ?? []) {
    const lastUpdate = cred.last_sync_at ? new Date(cred.last_sync_at).getTime() : 0;
    const runningRecently = cred.last_sync_status === 'running' && (now.getTime() - lastUpdate) < 10 * 60 * 1000;
    if (runningRecently) continue;
    let lockQuery = sb.from('org_marketing_credentials').update({
      last_sync_at: now.toISOString(),
      last_sync_status: 'running',
      last_sync_error: null,
    }).eq('id', cred.id);
    lockQuery = cred.last_sync_at
      ? lockQuery.eq('last_sync_at', cred.last_sync_at)
      : lockQuery.is('last_sync_at', null);
    const { data: locked, error: lockError } = await lockQuery.select('id').maybeSingle();
    if (!lockError && locked) runnable.push(cred);
  }

  // Executa em background para não estourar o idle timeout (150s).
  const task = runSync(sb, runnable, window);
  // @ts-ignore EdgeRuntime é global no Supabase Edge Runtime
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
  }

  return new Response(JSON.stringify({
    ok: true,
    queued: runnable.length > 0,
    already_running: (creds ?? []).length > 0 && runnable.length === 0,
    orgs: runnable.length,
    window,
  }), {
    status: 202,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
