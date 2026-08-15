import { createClient } from 'npm:@supabase/supabase-js@2';
import { reconcileCommerceSale, type CommerceSaleStatus } from '../_shared/commerce-sale.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FLOWINAR_SECRET = Deno.env.get('FLOWINAR_SALES_WEBHOOK_SECRET') || '';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-flowinar-secret',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

function safeText(value: unknown, max = 500): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function normalizePhone(value: unknown): string | null {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 11 && !digits.startsWith('55')) digits = `55${digits}`;
  return digits.slice(0, 20);
}

function validUuid(value: unknown): string | null {
  const normalized = safeText(value);
  return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

async function sameSecret(received: string, expected: string): Promise<boolean> {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  if (!await sameSecret(req.headers.get('x-flowinar-secret') || '', FLOWINAR_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const organizationId = validUuid(body?.organization_id);
  const transactionId = safeText(body?.transaction_id);
  const provider = body?.provider === 'doppus' ? 'doppus' : null;
  const allowedStatuses = new Set<CommerceSaleStatus>(['confirmed', 'refunded', 'chargeback', 'cancelled']);
  const status = allowedStatuses.has(body?.status) ? body.status as CommerceSaleStatus : null;
  if (!organizationId || !transactionId || !provider || !status) {
    return json({ ok: false, error: 'missing_or_invalid_fields' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const email = safeText(body?.customer?.email)?.toLowerCase() || null;
  const phone = normalizePhone(body?.customer?.phone);
  let leadId = validUuid(body?.lead_id);

  if (leadId) {
    const { data } = await admin.from('leads')
      .select('id')
      .eq('id', leadId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!data) leadId = null;
  }
  if (!leadId && email) {
    const { data } = await admin.from('leads')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = data?.id ?? null;
  }
  if (!leadId && phone) {
    const { data } = await admin.from('leads')
      .select('id')
      .eq('organization_id', organizationId)
      .or(`phone.eq.${phone},phone_normalized.eq.${phone}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = data?.id ?? null;
  }

  try {
    const result = await reconcileCommerceSale(admin, {
      organizationId,
      provider,
      externalOrderId: transactionId,
      status,
      leadId,
      value: Number(body?.value) || 0,
      currency: safeText(body?.currency, 10) || 'BRL',
      paidAt: safeText(body?.paid_at),
      attribution: body?.attribution && typeof body.attribution === 'object' ? body.attribution : {},
      rawData: {
        source: 'flowinar',
        flowinar: body?.flowinar || {},
        attribution: body?.attribution || {},
        customer_match: leadId ? 'matched' : 'unmatched',
      },
    });
    return json({
      ok: true,
      sale_id: result.sale?.sale_id ?? null,
      lead_matched: Boolean(leadId),
      capi_status: result.capi?.sent ? 'sent' : result.capi?.deduped ? 'deduped' : result.capi?.skipped ? 'skipped' : null,
    });
  } catch (error) {
    console.error('[flowinar-sale-webhook] reconcile failed', error);
    return json({ ok: false, error: 'reconcile_failed' }, 500);
  }
});
