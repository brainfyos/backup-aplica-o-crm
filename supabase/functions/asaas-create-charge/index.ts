import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { asaasFetch } from '../_shared/asaas-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function onlyDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

function normalizePhoneBR(raw: string | null | undefined): string | null {
  const d = onlyDigits(raw);
  if (!d) return null;
  const noCountry = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
  return noCountry.slice(-11) || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isService = authHeader === `Bearer ${SERVICE}`;

    const admin = createClient(SUPABASE_URL, SERVICE);

    let orgId: string | null = null;
    const body = await req.json().catch(() => ({}));

    if (isService) {
      orgId = body.organization_id ?? null;
    } else {
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
      const userId = claims?.claims?.sub;
      if (!userId) return json({ error: 'Unauthorized' }, 401);
      const { data: profile } = await admin.from('profiles').select('organization_id').eq('id', userId).maybeSingle();
      orgId = profile?.organization_id ?? null;
    }
    if (!orgId) return json({ error: 'organization_not_found' }, 400);

    const leadId: string | null = body.lead_id ?? null;
    const productId: string | null = body.product_id ?? null;
    const offerId: string | null = body.offer_id ?? null;
    const billingType: string = (body.billing_type ?? 'UNDEFINED').toUpperCase(); // BOLETO|CREDIT_CARD|PIX|UNDEFINED
    const value: number = Number(body.value ?? 0);
    const description: string | null = body.description ?? null;
    const dueDate: string = body.due_date ?? new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
    const externalReference: string | null = body.external_reference ?? leadId;

    if (!value || value <= 0) return json({ error: 'value_required' }, 400);

    // Load credentials
    const { data: cred } = await admin
      .from('asaas_credentials')
      .select('environment, api_key, is_active')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!cred || !cred.is_active) return json({ error: 'asaas_not_configured' }, 400);

    // Lead → customer data
    let customer = { name: body.customer_name, email: body.customer_email, phone: body.customer_phone, cpfCnpj: body.customer_cpf_cnpj };
    if (leadId) {
      const { data: lead } = await admin.from('leads').select('name, email, phone').eq('id', leadId).maybeSingle();
      if (lead) {
        customer.name = customer.name ?? lead.name;
        customer.email = customer.email ?? lead.email;
        customer.phone = customer.phone ?? lead.phone;
      }
    }
    if (!customer.name) return json({ error: 'customer_name_required' }, 400);

    // Create or reuse customer via CPF/e-mail. Asaas requires a customer id to create payment.
    let asaasCustomerId: string | null = null;
    // Try search by cpfCnpj first, else email
    const search = customer.cpfCnpj
      ? `/customers?cpfCnpj=${encodeURIComponent(onlyDigits(customer.cpfCnpj))}`
      : customer.email
      ? `/customers?email=${encodeURIComponent(customer.email)}`
      : null;
    if (search) {
      const s = await asaasFetch(cred.environment, cred.api_key, search);
      const found = s.body?.data?.[0];
      if (found?.id) asaasCustomerId = found.id;
    }
    if (!asaasCustomerId) {
      const created = await asaasFetch(cred.environment, cred.api_key, '/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: customer.name,
          email: customer.email ?? undefined,
          mobilePhone: normalizePhoneBR(customer.phone) ?? undefined,
          cpfCnpj: customer.cpfCnpj ? onlyDigits(customer.cpfCnpj) : undefined,
          externalReference: leadId ?? undefined,
          notificationDisabled: false,
        }),
      });
      if (created.status >= 400 || !created.body?.id) {
        return json({ error: 'customer_create_failed', details: created.body }, 400);
      }
      asaasCustomerId = created.body.id;
    }

    // Create payment
    const payment = await asaasFetch(cred.environment, cred.api_key, '/payments', {
      method: 'POST',
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType,
        value,
        dueDate,
        description: description ?? undefined,
        externalReference: externalReference ?? undefined,
      }),
    });
    if (payment.status >= 400 || !payment.body?.id) {
      return json({ error: 'payment_create_failed', details: payment.body }, 400);
    }
    const p = payment.body;

    // Get PIX QR code if applicable
    let pixQr: string | null = null;
    let pixCopy: string | null = null;
    if (billingType === 'PIX') {
      const q = await asaasFetch(cred.environment, cred.api_key, `/payments/${p.id}/pixQrCode`);
      if (q.status < 400) {
        pixQr = q.body?.encodedImage ? `data:image/png;base64,${q.body.encodedImage}` : null;
        pixCopy = q.body?.payload ?? null;
      }
    }

    // Persist
    const row: any = {
      organization_id: orgId,
      asaas_id: p.id,
      asaas_customer_id: asaasCustomerId,
      lead_id: leadId,
      product_id: productId,
      offer_id: offerId,
      status: p.status,
      billing_type: p.billingType,
      value: p.value,
      net_value: p.netValue ?? null,
      due_date: p.dueDate ?? null,
      invoice_url: p.invoiceUrl ?? null,
      bank_slip_url: p.bankSlipUrl ?? null,
      pix_qr_code: pixQr,
      pix_copy_paste: pixCopy,
      description: p.description ?? null,
      external_reference: p.externalReference ?? null,
      raw_payload: p,
    };
    await admin.from('asaas_charges').upsert(row, { onConflict: 'organization_id,asaas_id' });

    return json({
      ok: true,
      charge: {
        id: p.id,
        status: p.status,
        invoice_url: p.invoiceUrl,
        bank_slip_url: p.bankSlipUrl,
        pix_qr_code: pixQr,
        pix_copy_paste: pixCopy,
        value: p.value,
        due_date: p.dueDate,
        billing_type: p.billingType,
      },
    });
  } catch (e: any) {
    console.error('[asaas-create-charge]', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
