export type CommerceSaleStatus = 'confirmed' | 'refunded' | 'chargeback' | 'cancelled';

export interface ReconcileCommerceSaleInput {
  organizationId: string;
  provider: 'cakto' | 'doppus' | 'hotmart' | 'manual' | 'other';
  externalOrderId: string;
  status: CommerceSaleStatus;
  leadId?: string | null;
  productId?: string | null;
  value?: number | null;
  currency?: string | null;
  paidAt?: string | null;
  attribution?: Record<string, unknown> | null;
  rawData?: Record<string, unknown> | null;
}

/**
 * Concilia um evento de checkout com a fonte canônica de vendas e, apenas
 * para pagamento confirmado, despacha Purchase para a Meta com chave estável.
 */
export async function reconcileCommerceSale(admin: any, input: ReconcileCommerceSaleInput) {
  const { data, error } = await admin.rpc('rpc_record_commerce_sale', {
    _organization_id: input.organizationId,
    _provider: input.provider,
    _external_order_id: input.externalOrderId,
    _status: input.status,
    _lead_id: input.leadId ?? null,
    _product_id: input.productId ?? null,
    _value: Number(input.value ?? 0),
    _currency: input.currency || 'BRL',
    _paid_at: input.paidAt ?? null,
    _raw_data: input.rawData ?? {},
  });
  if (error) throw new Error(`commerce_sale_reconcile_failed: ${error.message}`);

  const sale = Array.isArray(data) ? data[0] : data;
  const suppliedAttribution = input.attribution && Object.keys(input.attribution).length
    ? input.attribution
    : null;
  if (sale?.sale_id && suppliedAttribution && (!sale.attribution || Object.keys(sale.attribution).length === 0)) {
    await admin.from('commerce_sales')
      .update({ attribution: suppliedAttribution })
      .eq('id', sale.sale_id);
    sale.attribution = suppliedAttribution;
  }
  if (!sale?.sale_id || input.status !== 'confirmed') return { sale, capi: null };

  const eventId = `purchase:${input.provider}:${input.externalOrderId}`;
  let capi: any = null;
  try {
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-capi-dispatcher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        organization_id: input.organizationId,
        event_type: 'sale_completed',
        event_id: eventId,
        lead_id: input.leadId ?? null,
        sale_id: sale.sale_id,
        order_id: input.externalOrderId,
        value: Number(input.value ?? 0),
        currency: input.currency || 'BRL',
        event_time: input.paidAt ? Math.floor(new Date(input.paidAt).getTime() / 1000) : undefined,
        channel: 'website',
        custom_data: {
          provider: input.provider,
          product_id: input.productId ?? null,
          campaign_id: sale.attribution?.campaign_id ?? null,
          adset_id: sale.attribution?.adset_id ?? null,
          ad_id: sale.attribution?.ad_id ?? null,
          utm_campaign: sale.attribution?.utm_campaign ?? null,
          utm_content: sale.attribution?.utm_content ?? null,
        },
      }),
    });
    capi = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    const status = capi?.sent ? 'sent' : capi?.skipped ? 'skipped' : capi?.deduped ? (capi.status || 'sent') : 'failed';
    await admin.from('commerce_sales').update({
      capi_status: status,
      capi_event_id: eventId,
      capi_error: status === 'failed' ? JSON.stringify(capi).slice(0, 2000) : null,
    }).eq('id', sale.sale_id);
  } catch (error) {
    await admin.from('commerce_sales').update({
      capi_status: 'failed', capi_event_id: eventId, capi_error: String(error).slice(0, 2000),
    }).eq('id', sale.sale_id);
    console.error('[commerce-sale] CAPI dispatch failed', error);
  }

  return { sale, capi };
}

export function commerceStatusFromLifecycle(eventType: string | null | undefined): CommerceSaleStatus | null {
  if (eventType === 'compra_aprovada') return 'confirmed';
  if (eventType === 'reembolso') return 'refunded';
  if (eventType === 'chargeback') return 'chargeback';
  if (eventType === 'assinatura_cancelada') return 'cancelled';
  return null;
}
