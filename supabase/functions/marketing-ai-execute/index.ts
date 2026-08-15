// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';

type Body = {
  mode: 'apply' | 'revert' | 'direct';
  recommendation_id?: string; // for apply
  execution_id?: string; // for revert
  organization_id?: string;
  action_type?: 'set_status' | 'set_budget' | 'duplicate';
  target_type?: 'campaign' | 'adset' | 'ad';
  target_ref_id?: string;
  target_label?: string;
  proposed_state?: Record<string, any>;
};

async function graphPost(nodeId: string, token: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH}/${nodeId}`);
  url.searchParams.set('access_token', token);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  const res = await fetch(url.toString(), { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Meta ${res.status}`);
  return body;
}

async function graphGet(nodeId: string, token: string, fields: string) {
  const url = new URL(`${GRAPH}/${nodeId}`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('fields', fields);
  const res = await fetch(url.toString());
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Meta ${res.status}`);
  return body;
}

function buildParamsFromState(target_type: string, state: Record<string, any>): Record<string, string> {
  const p: Record<string, string> = {};
  if (state.status) p.status = String(state.status).toUpperCase();
  if (state.daily_budget != null) {
    // daily_budget is stored in currency minor units (cents) at Meta
    const v = Number(state.daily_budget);
    // Accept either currency amount (e.g. 30.50) or cents (e.g. 3050)
    p.daily_budget = String(Math.round(v < 1000 ? v * 100 : v));
  }
  if (state.lifetime_budget != null) {
    const v = Number(state.lifetime_budget);
    p.lifetime_budget = String(Math.round(v < 1000 ? v * 100 : v));
  }
  if (state.name) p.name = String(state.name);
  return p;
}

async function credentialForTarget(
  sb: any,
  organizationId: string,
  targetType: string,
  targetRefId: string,
  knownTarget?: any,
) {
  if (targetType === 'account') {
    const { data: credentials } = await sb.from('org_marketing_credentials')
      .select('id,ad_account_id,access_token_encrypted')
      .eq('organization_id', organizationId).eq('provider', 'meta').eq('is_active', true)
      .eq('ad_account_id', targetRefId).limit(2);
    return credentials?.length === 1
      ? { target: { ad_account_id: targetRefId }, cred: credentials[0], error: null }
      : { target: null, cred: null, error: 'account_credential_not_found' };
  }
  const table = targetType === 'campaign'
    ? 'marketing_campaigns'
    : targetType === 'adset'
    ? 'marketing_adsets'
    : 'marketing_ads';
  const target = knownTarget ?? (await sb.from(table)
    .select('*').eq('organization_id', organizationId).eq('provider', 'meta')
    .eq('external_id', targetRefId).maybeSingle()).data;
  if (!target) return { target: null, cred: null, error: 'target_not_found' };

  let adAccountId = target.ad_account_id ?? null;
  if (!adAccountId && target.campaign_external_id) {
    const { data: campaign } = await sb.from('marketing_campaigns')
      .select('ad_account_id').eq('organization_id', organizationId).eq('provider', 'meta')
      .eq('external_id', target.campaign_external_id).maybeSingle();
    adAccountId = campaign?.ad_account_id ?? null;
  }

  let query = sb.from('org_marketing_credentials')
    .select('id,ad_account_id,access_token_encrypted')
    .eq('organization_id', organizationId).eq('provider', 'meta').eq('is_active', true);
  if (adAccountId) query = query.eq('ad_account_id', adAccountId);
  const { data: credentials } = await query.limit(2);
  if (!credentials?.length) return { target, cred: null, error: 'account_credential_not_found' };
  if (!adAccountId && credentials.length !== 1) {
    return { target, cred: null, error: 'target_account_unknown' };
  }
  return { target, cred: credentials[0], error: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const body = (await req.json()) as Body;
    const { mode, recommendation_id, execution_id } = body;
    if (!mode || (mode === 'apply' && !recommendation_id) || (mode === 'revert' && !execution_id)) {
      return json({ error: 'invalid_body' }, 400);
    }

    // ============ DIRECT CONTROL ============
    if (mode === 'direct') {
      const {
        organization_id, action_type, target_type, target_ref_id,
        target_label, proposed_state = {},
      } = body;
      if (!organization_id || !action_type || !target_type || !target_ref_id) {
        return json({ error: 'invalid_direct_body' }, 400);
      }

      const { data: mem } = await sb.from('user_organizations')
        .select('role').eq('user_id', user.id).eq('organization_id', organization_id).maybeSingle();
      const { data: superRole } = await sb.from('user_roles')
        .select('role').eq('user_id', user.id).eq('role', 'super_admin').maybeSingle();
      if (!['admin', 'owner'].includes(mem?.role ?? '') && !superRole) {
        return json({ error: 'forbidden' }, 403);
      }

      const table = target_type === 'campaign'
        ? 'marketing_campaigns'
        : target_type === 'adset'
        ? 'marketing_adsets'
        : 'marketing_ads';
      const { data: localTarget } = await sb.from(table)
        .select('*').eq('organization_id', organization_id).eq('provider', 'meta')
        .eq('external_id', target_ref_id).maybeSingle();
      if (!localTarget) return json({ error: 'target_not_found' }, 404);

      const resolved = await credentialForTarget(sb, organization_id, target_type, target_ref_id, localTarget);
      const cred = resolved.cred;
      if (!cred) return json({ error: resolved.error ?? 'meta_not_connected' }, 400);
      const token = await decryptSecret(cred.access_token_encrypted).catch(() => null);
      if (!token) return json({ error: 'invalid_token' }, 400);

      const fields = target_type === 'campaign'
        ? 'id,name,status,daily_budget,lifetime_budget,objective'
        : target_type === 'adset'
        ? 'id,name,status,daily_budget,lifetime_budget'
        : 'id,name,status';
      const livePrev = await graphGet(target_ref_id, token, fields).catch(() => localTarget);

      let providerResp: any = {};
      let appliedState = proposed_state;
      let createdCampaignId: string | null = null;
      try {
        if (action_type === 'set_status') {
          const status = String(proposed_state.status ?? '').toUpperCase();
          if (!['ACTIVE', 'PAUSED'].includes(status)) return json({ error: 'invalid_status' }, 400);

          // Campanhas criadas pelo Vendus nascem totalmente pausadas. Para ativar,
          // liberamos anúncios/conjuntos primeiro e a campanha por último.
          if (target_type === 'campaign' && status === 'ACTIVE') {
            const { data: storedAdsets } = await sb.from('marketing_adsets')
              .select('external_id').eq('organization_id', organization_id)
              .eq('provider', 'meta').eq('campaign_external_id', target_ref_id);
            const liveAdsets = (storedAdsets ?? []).length
              ? storedAdsets
              : ((await graphGet(`${target_ref_id}/adsets`, token, 'id')).data ?? [])
                  .map((row: any) => ({ external_id: row.id }));
            for (const child of liveAdsets) await graphPost(child.external_id, token, { status: 'ACTIVE' });
            const { data: storedAds } = await sb.from('marketing_ads')
              .select('external_id').eq('organization_id', organization_id)
              .eq('provider', 'meta').eq('campaign_external_id', target_ref_id);
            const liveAds = (storedAds ?? []).length
              ? storedAds
              : ((await graphGet(`${target_ref_id}/ads`, token, 'id')).data ?? [])
                  .map((row: any) => ({ external_id: row.id }));
            for (const ad of liveAds) await graphPost(ad.external_id, token, { status: 'ACTIVE' });
          }
          providerResp = await graphPost(target_ref_id, token, { status });
          await sb.from(table).update({ status }).eq('organization_id', organization_id)
            .eq('provider', 'meta').eq('external_id', target_ref_id);
          if (target_type === 'campaign' && status === 'ACTIVE') {
            await sb.from('marketing_adsets').update({ status }).eq('organization_id', organization_id)
              .eq('provider', 'meta').eq('campaign_external_id', target_ref_id);
            await sb.from('marketing_ads').update({ status }).eq('organization_id', organization_id)
              .eq('provider', 'meta').eq('campaign_external_id', target_ref_id);
          }
        } else if (action_type === 'set_budget') {
          if (target_type === 'ad') return json({ error: 'budget_not_supported_for_ad' }, 400);
          const dailyBudget = Number(proposed_state.daily_budget);
          if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) return json({ error: 'invalid_budget' }, 400);
          const cents = Math.round(dailyBudget * 100);
          providerResp = await graphPost(target_ref_id, token, { daily_budget: String(cents) });
          appliedState = { daily_budget: dailyBudget };
          await sb.from(table).update({ daily_budget: dailyBudget }).eq('organization_id', organization_id)
            .eq('provider', 'meta').eq('external_id', target_ref_id);
        } else if (action_type === 'duplicate') {
          if (target_type !== 'campaign') return json({ error: 'duplicate_requires_campaign' }, 400);
          providerResp = await graphPost(`${target_ref_id}/copies`, token, {
            deep_copy: 'true',
            status_option: 'PAUSED',
            rename_options: JSON.stringify({ rename_strategy: 'DEEP_RENAME', rename_suffix: ' — Cópia Vendus' }),
          });
          createdCampaignId = providerResp?.copied_campaign_id ?? providerResp?.id ?? null;
          if (!createdCampaignId) throw new Error('A Meta não retornou o ID da campanha duplicada.');
          const copied = await graphGet(createdCampaignId, token, 'id,name,status,objective,daily_budget,lifetime_budget');
          await sb.from('marketing_campaigns').upsert({
            organization_id,
            provider: 'meta',
            external_id: createdCampaignId,
            ad_account_id: localTarget.ad_account_id,
            name: copied.name ?? `${localTarget.name ?? 'Campanha'} — Cópia Vendus`,
            status: copied.status ?? 'PAUSED',
            objective: copied.objective ?? localTarget.objective,
            daily_budget: copied.daily_budget ? Number(copied.daily_budget) / 100 : null,
            lifetime_budget: copied.lifetime_budget ? Number(copied.lifetime_budget) / 100 : null,
            metadata: { ...(localTarget.metadata ?? {}), duplicated_from: target_ref_id, duplicated_by: user.id },
            synced_at: new Date().toISOString(),
          }, { onConflict: 'organization_id,provider,external_id' });
          const copiedAdsets = await graphGet(
            `${createdCampaignId}/adsets`,
            token,
            'id,name,status,daily_budget,lifetime_budget',
          ).catch(() => ({ data: [] }));
          for (const row of copiedAdsets.data ?? []) {
            await sb.from('marketing_adsets').upsert({
              organization_id,
              provider: 'meta',
              external_id: row.id,
              campaign_external_id: createdCampaignId,
              name: row.name ?? null,
              status: row.status ?? 'PAUSED',
              daily_budget: row.daily_budget ? Number(row.daily_budget) / 100 : null,
              lifetime_budget: row.lifetime_budget ? Number(row.lifetime_budget) / 100 : null,
              synced_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,provider,external_id' });
          }
          const copiedAds = await graphGet(
            `${createdCampaignId}/ads`,
            token,
            'id,name,status,adset_id,creative{id}',
          ).catch(() => ({ data: [] }));
          for (const row of copiedAds.data ?? []) {
            await sb.from('marketing_ads').upsert({
              organization_id,
              provider: 'meta',
              external_id: row.id,
              campaign_external_id: createdCampaignId,
              adset_external_id: row.adset_id ?? null,
              creative_external_id: row.creative?.id ?? null,
              name: row.name ?? null,
              status: row.status ?? 'PAUSED',
              synced_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,provider,external_id' });
          }
          appliedState = { status: 'PAUSED', created_campaign_id: createdCampaignId };
        } else {
          return json({ error: 'unsupported_action' }, 400);
        }

        const { data: exec } = await sb.from('marketing_ai_executions').insert({
          organization_id,
          action_type,
          target_type,
          target_ref_id,
          target_label: target_label ?? localTarget.name ?? target_ref_id,
          previous_state: livePrev ?? {},
          applied_state: appliedState,
          status: 'success',
          provider_response: providerResp ?? {},
          executed_by: user.id,
        }).select().maybeSingle();
        return json({ ok: true, execution: exec, created_campaign_id: createdCampaignId });
      } catch (e) {
        const message = (e as Error).message;
        const { data: exec } = await sb.from('marketing_ai_executions').insert({
          organization_id,
          action_type,
          target_type,
          target_ref_id,
          target_label: target_label ?? localTarget.name ?? target_ref_id,
          previous_state: livePrev ?? {},
          applied_state: appliedState,
          status: 'failed',
          error: message,
          provider_response: providerResp ?? {},
          executed_by: user.id,
        }).select().maybeSingle();
        return json({ ok: false, execution: exec, error: message }, 400);
      }
    }

    // ============ REVERT ============
    if (mode === 'revert') {
      const { data: prev, error: pe } = await sb.from('marketing_ai_executions')
        .select('*').eq('id', execution_id!).maybeSingle();
      if (pe || !prev) return json({ error: 'execution_not_found' }, 404);
      if (prev.status !== 'success') return json({ error: 'not_revertable' }, 400);
      if (prev.reverted_at) return json({ error: 'already_reverted' }, 400);

      // membership check
      const { data: mem } = await sb.from('user_organizations')
        .select('organization_id').eq('user_id', user.id).eq('organization_id', prev.organization_id).maybeSingle();
      if (!mem) return json({ error: 'forbidden' }, 403);

      const resolved = await credentialForTarget(sb, prev.organization_id, prev.target_type, prev.target_ref_id);
      const cred = resolved.cred;
      if (!cred) return json({ error: resolved.error ?? 'meta_not_connected' }, 400);
      const token = await decryptSecret(cred.access_token_encrypted).catch(() => null);
      if (!token) return json({ error: 'invalid_token' }, 400);

      const params = buildParamsFromState(prev.target_type, prev.previous_state);
      if (Object.keys(params).length === 0) return json({ error: 'nothing_to_revert' }, 400);

      let providerResp: any = null;
      let ok = true; let err: string | null = null;
      try { providerResp = await graphPost(prev.target_ref_id, token, params); }
      catch (e) { ok = false; err = (e as Error).message; }

      const { data: revEx } = await sb.from('marketing_ai_executions').insert({
        organization_id: prev.organization_id,
        recommendation_id: prev.recommendation_id,
        action_type: `revert:${prev.action_type}`,
        target_type: prev.target_type,
        target_ref_id: prev.target_ref_id,
        target_label: prev.target_label,
        previous_state: prev.applied_state,
        applied_state: prev.previous_state,
        status: ok ? 'success' : 'failed',
        error: err,
        provider_response: providerResp ?? {},
        executed_by: user.id,
        revert_of: prev.id,
      }).select().maybeSingle();

      if (ok) {
        await sb.from('marketing_ai_executions').update({
          status: 'reverted', reverted_at: new Date().toISOString(), reverted_by: user.id,
        }).eq('id', prev.id);
      }

      return json({ ok, execution: revEx, error: err });
    }

    // ============ APPLY ============
    const { data: rec, error: re } = await sb.from('marketing_ai_recommendations')
      .select('*').eq('id', recommendation_id!).maybeSingle();
    if (re || !rec) return json({ error: 'recommendation_not_found' }, 404);
    if (rec.status === 'applied') return json({ error: 'already_applied' }, 400);

    const { data: mem } = await sb.from('user_organizations')
      .select('organization_id').eq('user_id', user.id).eq('organization_id', rec.organization_id).maybeSingle();
    if (!mem) return json({ error: 'forbidden' }, 403);

    const dataUsed = rec.data_used && typeof rec.data_used === 'object' ? rec.data_used : {};
    if (['purchases', 'revenue', 'roas'].some((key) => Object.prototype.hasOwnProperty.call(dataUsed, key))) {
      return json({ error: 'unverified_sales_metric', details: 'Purchase da Meta ainda não foi conciliado com checkout/CRM.' }, 409);
    }

    if (!rec.target_ref_id) return json({ error: 'missing_target_ref_id' }, 400);

    const resolved = await credentialForTarget(sb, rec.organization_id, rec.target_type, rec.target_ref_id);
    const cred = resolved.cred;
    if (!cred) return json({ error: resolved.error ?? 'meta_not_connected' }, 400);
    const token = await decryptSecret(cred.access_token_encrypted).catch(() => null);
    if (!token) return json({ error: 'invalid_token' }, 400);

    // Capture live previous state for audit
    let livePrev: Record<string, any> = {};
    try {
      const fields = rec.target_type === 'campaign'
        ? 'id,name,status,daily_budget,lifetime_budget,objective'
        : rec.target_type === 'adset'
        ? 'id,name,status,daily_budget,lifetime_budget'
        : 'id,name,status';
      livePrev = await graphGet(rec.target_ref_id, token, fields);
    } catch (_) { /* best effort */ }

    const params = buildParamsFromState(rec.target_type, rec.proposed_state);
    if (Object.keys(params).length === 0) return json({ error: 'nothing_to_apply' }, 400);

    let providerResp: any = null;
    let ok = true; let err: string | null = null;
    try { providerResp = await graphPost(rec.target_ref_id, token, params); }
    catch (e) { ok = false; err = (e as Error).message; }

    const { data: exec } = await sb.from('marketing_ai_executions').insert({
      organization_id: rec.organization_id,
      recommendation_id: rec.id,
      action_type: rec.action_type,
      target_type: rec.target_type,
      target_ref_id: rec.target_ref_id,
      target_label: rec.target_label,
      previous_state: { ...(rec.current_state ?? {}), ...livePrev },
      applied_state: rec.proposed_state,
      status: ok ? 'success' : 'failed',
      error: err,
      provider_response: providerResp ?? {},
      executed_by: user.id,
    }).select().maybeSingle();

    await sb.from('marketing_ai_recommendations').update({
      status: ok ? 'applied' : 'failed',
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    }).eq('id', rec.id);

    return json({ ok, execution: exec, error: err });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'internal_error' }, 500);
  }
});
