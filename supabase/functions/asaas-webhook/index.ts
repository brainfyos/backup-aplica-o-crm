import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { mapAsaasStatus } from '../_shared/asaas-client.ts';
import { reconcileCommerceSale } from '../_shared/commerce-sale.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function eventToTag(evt: string | null | undefined, status: string | null | undefined, billing: string | null | undefined): string | null {
  const e = String(evt ?? '').toUpperCase();
  const s = String(status ?? '').toUpperCase();
  const b = String(billing ?? '').toUpperCase();
  if (e === 'PAYMENT_CONFIRMED' || e === 'PAYMENT_RECEIVED' || s === 'CONFIRMED' || s === 'RECEIVED') return 'compra_aprovada';
  if (e.startsWith('PAYMENT_REFUND') || s === 'REFUNDED') return 'reembolso';
  if (e.includes('CHARGEBACK')) return 'chargeback';
  if (e === 'PAYMENT_CREATED' || e === 'PAYMENT_UPDATED' || e === 'PAYMENT_AWAITING_RISK_ANALYSIS' || s === 'PENDING') {
    if (b === 'PIX') return 'pix_gerado';
    if (b === 'BOLETO') return 'boleto_gerado';
    return null;
  }
  if (e === 'PAYMENT_DELETED') return 'assinatura_cancelada';
  return null;
}

async function resolveOrCreateLead(admin: any, orgId: string, customer: any, externalRef: string | null): Promise<string | null> {
  if (externalRef) {
    // externalReference is set to lead_id when we create charges from the app
    const { data } = await admin.from('leads').select('id').eq('id', externalRef).eq('organization_id', orgId).maybeSingle();
    if (data?.id) return data.id;
  }
  const email = customer?.email?.trim().toLowerCase() || null;
  const phone = (customer?.phone || customer?.mobilePhone || '').replace(/\D/g, '') || null;
  const name = customer?.name || email || phone || 'Cliente Asaas';
  if (!email && !phone) return null;

  let lead: { id: string } | null = null;
  if (email) {
    const { data } = await admin.from('leads').select('id').eq('organization_id', orgId).eq('email', email).maybeSingle();
    lead = data;
  }
  if (!lead && phone) {
    const { data } = await admin.from('leads').select('id').eq('organization_id', orgId)
      .or(`phone.eq.${phone},phone_normalized.eq.${phone}`).limit(1).maybeSingle();
    lead = data;
  }
  if (lead) return lead.id;

  const { data: created } = await admin.from('leads').insert({
    organization_id: orgId, name, email, phone, lead_origin: 'asaas', lead_channel: 'checkout',
  }).select('id').single();
  return created?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE);

  try {
    const url = new URL(req.url);
    const orgId = url.searchParams.get('org');
    if (!orgId) return json({ error: 'org_param_required' }, 400);

    const providedToken = req.headers.get('asaas-access-token') ?? url.searchParams.get('token') ?? '';
    const { data: cred } = await admin
      .from('asaas_credentials')
      .select('webhook_token, environment, api_key')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!cred) return json({ error: 'credentials_not_found' }, 404);

    const signatureValid = !!cred.webhook_token && providedToken === cred.webhook_token;

    const payload = await req.json().catch(() => ({} as any));
    const evt: string | null = payload?.event ?? null;
    const p: any = payload?.payment ?? payload?.data ?? payload ?? {};

    await admin.from('asaas_webhook_logs').insert({
      organization_id: orgId,
      event: evt,
      asaas_id: p?.id ?? null,
      signature_valid: signatureValid,
      payload,
    });

    if (!signatureValid) {
      // Return 200 so Asaas does not retry indefinitely; log already captured.
      return json({ ok: false, error: 'invalid_token' }, 200);
    }

    if (!p?.id) return json({ ok: true, skipped: 'no_payment' });

    // Fetch customer details when needed
    let customer: any = null;
    if (p.customer && typeof p.customer === 'string') {
      const r = await fetch(`${cred.environment === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'}/customers/${p.customer}`, {
        headers: { access_token: cred.api_key, Accept: 'application/json' },
      });
      customer = await r.json().catch(() => null);
    }

    const leadId = await resolveOrCreateLead(admin, orgId, customer, p.externalReference ?? null);

    // Upsert charge
    const row: any = {
      organization_id: orgId,
      asaas_id: p.id,
      asaas_customer_id: typeof p.customer === 'string' ? p.customer : (p.customer?.id ?? null),
      lead_id: leadId,
      status: p.status,
      billing_type: p.billingType,
      value: p.value,
      net_value: p.netValue ?? null,
      due_date: p.dueDate ?? null,
      paid_at: p.paymentDate ?? p.clientPaymentDate ?? p.confirmedDate ?? null,
      invoice_url: p.invoiceUrl ?? null,
      bank_slip_url: p.bankSlipUrl ?? null,
      description: p.description ?? null,
      external_reference: p.externalReference ?? null,
      raw_payload: p,
    };
    await admin.from('asaas_charges').upsert(row, { onConflict: 'organization_id,asaas_id' });

    // Load product_id from existing charge (from create-charge time)
    const { data: existing } = await admin.from('asaas_charges')
      .select('product_id').eq('organization_id', orgId).eq('asaas_id', p.id).maybeSingle();

    // Tag automations
    const tagEvent = eventToTag(evt, p.status, p.billingType);
    if (leadId && tagEvent) {
      try {
        await admin.rpc('apply_tag_automations', {
          p_lead_id: leadId,
          p_event_type: tagEvent,
          p_product_id: existing?.product_id ?? null,
          p_organization_id: orgId,
        });
        if (tagEvent === 'compra_aprovada') {
          await admin.rpc('remove_lifecycle_tags_on_event', {
            p_lead_id: leadId,
            p_event_type: tagEvent,
            p_product_id: existing?.product_id ?? null,
            p_organization_id: orgId,
          });
        }
      } catch (err) {
        console.error('[asaas-webhook] tag automation error', err);
      }
    }

    // Canonical sale + Meta CAPI
    const commerceStatus = mapAsaasStatus(p.status);
    if (commerceStatus) {
      try {
        await reconcileCommerceSale(admin, {
          organizationId: orgId,
          provider: 'other',
          externalOrderId: String(p.id),
          status: commerceStatus,
          leadId,
          productId: existing?.product_id ?? null,
          value: Number(p.value ?? 0),
          currency: 'BRL',
          paidAt: p.paymentDate ?? p.confirmedDate ?? null,
          rawData: p,
        });
      } catch (err) {
        console.error('[asaas-webhook] commerce reconciliation error', err);
      }
    }

    return json({ ok: true, event: evt, status: p.status });
  } catch (e: any) {
    console.error('[asaas-webhook]', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
