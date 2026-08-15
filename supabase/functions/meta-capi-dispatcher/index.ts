// Meta Conversions API — dispatcher REAL.
// - Descriptografa access_token via _shared/meta-crypto (AES-GCM).
// - Chama Graph API v21.0 /{pixel_id}/events.
// - Dedup estável via journey_event_id / sale_id / order_id (nunca Date.now()).
// - Persiste histórico em marketing_conversion_events com status sent|failed|skipped.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { GRAPH_BASE, graphFetch, GraphError } from '../_shared/meta-graph.ts';
import {
  buildCapiEvent,
  JOURNEY_TO_META,
  pickActionSource,
  pickMessagingChannel,
  stableDedupKey,
  type LeadUserData,
} from '../_shared/meta-capi-builders.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface DispatchInput {
  organization_id: string;
  event_type: string; // journey event type OR já em nome Meta
  event_id?: string | null;
  event_time?: number | null;
  journey_event_id?: string | null;
  lead_id?: string | null;
  sale_id?: string | null;
  order_id?: string | null;
  channel?: string | null;
  value?: number | null;
  currency?: string | null;
  event_source_url?: string | null;
  custom_data?: Record<string, unknown> | null;
  user_data_override?: Partial<LeadUserData> | null;
  force_retry?: boolean;
}

async function loadLeadUserData(sb: ReturnType<typeof createClient>, leadId: string | null | undefined): Promise<LeadUserData> {
  if (!leadId) return {};
  const { data } = await sb.from('leads')
    .select('id,name,email,phone,city,state,ctwa_clid,fbc,fbp,client_ip,user_agent')
    .eq('id', leadId).maybeSingle();
  if (!data) return { external_id: leadId };
  const anyd = data as any;
  const parts = (anyd.name ?? '').trim().split(/\s+/);
  return {
    external_id: anyd.id,
    email: anyd.email,
    phone: anyd.phone,
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts.slice(1).join(' ') : null,
    city: anyd.city,
    state: anyd.state,
    country: 'BR',
    ctwa_clid: anyd.ctwa_clid,
    fbc: anyd.fbc,
    fbp: anyd.fbp,
    client_ip: anyd.client_ip,
    client_user_agent: anyd.user_agent,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as DispatchInput;
    const {
      organization_id, event_type, event_id, event_time, journey_event_id, lead_id,
      sale_id, order_id, channel, value, currency,
      event_source_url, custom_data, user_data_override, force_retry,
    } = body ?? {};

    if (!organization_id || !event_type) {
      return new Response(JSON.stringify({ error: 'organization_id and event_type required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const metaEvent = JOURNEY_TO_META[event_type] ?? event_type;
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Enriquecimento de compra: commerce_sales é a fonte oficial. Os demais
    // caminhos são fallbacks para eventos legados e usam o esquema atual.
    let effValue = value;
    let effCurrency = currency;
    let effOrderId = order_id;
    if ((metaEvent === 'Purchase' || event_type === 'sale_completed') && (effValue == null || !effOrderId)) {
      try {
        if (sale_id || order_id) {
          const key = String(sale_id || order_id);
          const [sale, ck, hm, dl, pl] = await Promise.all([
            sb.from('commerce_sales').select('value,currency,external_order_id').or(`external_order_id.eq.${key},id.eq.${key}`).eq('organization_id', organization_id).maybeSingle(),
            sb.from('cakto_orders').select('amount,cakto_id').or(`cakto_id.eq.${key},id.eq.${key}`).eq('organization_id', organization_id).maybeSingle(),
            sb.from('hotmart_orders').select('amount,currency,transaction_id').or(`transaction_id.eq.${key},id.eq.${key}`).eq('organization_id', organization_id).maybeSingle(),
            sb.from('deals').select('deal_value,id').eq('id', key).eq('organization_id', organization_id).maybeSingle(),
            sb.from('payment_links').select('amount,currency,id').eq('id', key).eq('organization_id', organization_id).maybeSingle(),
          ]);
          const s: any = sale.data; const c: any = ck.data; const h: any = hm.data; const d: any = dl.data; const p: any = pl.data;
          if (effValue == null) effValue = s?.value ?? c?.amount ?? h?.amount ?? d?.deal_value ?? p?.amount ?? null;
          if (!effCurrency) effCurrency = s?.currency ?? h?.currency ?? p?.currency ?? 'BRL';
          if (!effOrderId) effOrderId = s?.external_order_id ?? c?.cakto_id ?? h?.transaction_id ?? d?.id ?? p?.id ?? null;
        }
      } catch (e) {
        console.warn('[meta-capi-dispatcher] purchase enrichment failed:', (e as Error).message);
      }
    }

    const { data: cred } = await sb
      .from('org_marketing_credentials')
      .select('meta_pixel_id, meta_capi_access_token_encrypted, meta_capi_test_event_code, capi_enabled')
      .eq('organization_id', organization_id)
      .eq('provider', 'meta')
      .eq('is_active', true)
      .eq('capi_enabled', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const dedup_key = stableDedupKey({
      event_id, journey_event_id, sale_id, order_id: effOrderId, event_type: metaEvent, lead_id,
    });

    const baseRow = {
      organization_id,
      lead_id: lead_id ?? null,
      journey_event_id: journey_event_id ?? null,
      provider: 'meta',
      event_type: metaEvent,
      dedup_key,
    } as const;

    // Sem credenciais → skipped (mantém histórico).
    if (!cred?.capi_enabled || !cred?.meta_pixel_id || !cred?.meta_capi_access_token_encrypted) {
      await sb.from('marketing_conversion_events').upsert({
        ...baseRow,
        status: 'skipped',
        payload: { event_name: metaEvent, value, currency },
        error_message: 'CAPI desabilitado ou credenciais incompletas',
      }, { onConflict: 'organization_id,provider,dedup_key' });
      return new Response(JSON.stringify({ skipped: true, reason: 'no_credentials' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Claim atômico: um event_id normal nunca pode ser enviado duas vezes à Meta.
    // Retentativas operacionais precisam ser explícitas via force_retry.
    if (force_retry) {
      await sb.from('marketing_conversion_events').upsert({
        ...baseRow,
        status: 'pending',
        payload: { event_name: metaEvent, value, currency },
        error_message: null,
      }, { onConflict: 'organization_id,provider,dedup_key' });
    } else {
      const { error: claimError } = await sb.from('marketing_conversion_events').insert({
        ...baseRow,
        status: 'pending',
        payload: { event_name: metaEvent, value, currency },
      });
      if (claimError?.code === '23505') {
        const { data: existing } = await sb.from('marketing_conversion_events')
          .select('status,sent_at')
          .eq('organization_id', organization_id)
          .eq('provider', 'meta')
          .eq('dedup_key', dedup_key)
          .maybeSingle();
        return new Response(JSON.stringify({ ok: true, deduped: true, dedup_key, status: existing?.status ?? 'pending' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (claimError) throw new Error(`conversion_event_claim_failed: ${claimError.message}`);
    }

    // Monta evento.
    const leadUD = await loadLeadUserData(sb, lead_id);
    const user_data: LeadUserData = { ...leadUD, ...(user_data_override ?? {}) };

    const custom: Record<string, unknown> = { ...(custom_data ?? {}) };
    if (effValue != null) {
      custom.value = Number(effValue);
      custom.currency = effCurrency || 'BRL';
    }
    if (effOrderId) custom.order_id = effOrderId;

    const capiEvent = await buildCapiEvent({
      event_name: metaEvent,
      event_id: dedup_key,
      event_time: event_time || undefined,
      action_source: pickActionSource(channel),
      messaging_channel: pickMessagingChannel(channel),
      event_source_url,
      user_data,
      custom_data: custom,
    });

    // Chama Graph API.
    let token: string;
    try {
      token = await decryptSecret(cred.meta_capi_access_token_encrypted);
    } catch (e) {
      await sb.from('marketing_conversion_events').upsert({
        ...baseRow, status: 'failed',
        payload: capiEvent as any,
        error_message: `Falha ao descriptografar token: ${(e as Error).message}`,
      }, { onConflict: 'organization_id,provider,dedup_key' });
      return new Response(JSON.stringify({ error: 'decrypt_failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const graphBody: Record<string, unknown> = { data: [capiEvent] };
    if (cred.meta_capi_test_event_code) graphBody.test_event_code = cred.meta_capi_test_event_code;

    try {
      const res = await graphFetch<unknown>(
        `/${cred.meta_pixel_id}/events`,
        token,
        { method: 'POST', body: JSON.stringify(graphBody) },
      );
      await sb.from('marketing_conversion_events').upsert({
        ...baseRow,
        status: 'sent',
        payload: capiEvent as any,
        meta_response: res as any,
        sent_at: new Date().toISOString(),
        error_message: null,
      }, { onConflict: 'organization_id,provider,dedup_key' });
      return new Response(JSON.stringify({ ok: true, sent: true, dedup_key, response: res }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      const ge = e instanceof GraphError ? e : null;
      const { data: cur } = await sb.from('marketing_conversion_events')
        .select('retry_count').eq('organization_id', organization_id).eq('provider', 'meta').eq('dedup_key', dedup_key).maybeSingle();
      const nextRetry = ((cur as any)?.retry_count ?? 0) + 1;
      await sb.from('marketing_conversion_events').upsert({
        ...baseRow,
        status: 'failed',
        payload: capiEvent as any,
        meta_response: (ge?.graph ?? { message: (e as Error).message }) as any,
        error_message: `${ge?.status ?? ''} ${(e as Error).message}`.trim(),
        retry_count: nextRetry,
      }, { onConflict: 'organization_id,provider,dedup_key' });
      return new Response(JSON.stringify({ error: 'graph_error', detail: ge?.graph ?? String(e) }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (e) {
    console.error('[meta-capi-dispatcher]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
