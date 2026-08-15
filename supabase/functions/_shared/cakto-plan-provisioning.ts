// Helper compartilhado entre `cakto-webhook` e `cakto-reprocess-order`.
// Provisiona o plano da plataforma e o usuário admin a partir de um pedido Cakto.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getEmailSender } from './email-sender.ts';
import { sendPlatformEmail } from './platform-email-send.ts';

export interface CaktoOrderLike {
  cakto_id?: string | null;
  cakto_ref_id?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  amount?: number | null;
  status?: string | null;
  cakto_offer_slug?: string | null;
  product_cakto_id?: string | null;
  product_name?: string | null;
  raw_payload?: any;
}

export function extractOfferSlug(raw: any, fallback?: string | null): string | null {
  if (fallback) return fallback;
  // Cakto envia em camelCase (`checkoutUrl`); aceitar ambos.
  const candidates: Array<string | undefined> = [
    raw?.checkoutUrl,
    raw?.checkout_url,
    raw?.data?.order?.checkoutUrl,
    raw?.data?.order?.checkout_url,
    raw?.order?.checkoutUrl,
    raw?.order?.checkout_url,
    raw?.data?.checkoutUrl,
    raw?.data?.checkout_url,
  ];
  const url = candidates.find((u) => typeof u === 'string' && u.length > 0);
  if (!url) return null;
  const m = url.match(/\/([^/?#]+)(?:[?#].*)?$/);
  return m ? m[1] : null;
}

interface ProvisionResult {
  ok: boolean;
  organization_id?: string;
  plan_id?: string;
  user_id?: string;
  skipped?: string;
  errors?: string[];
}

/**
 * Resolve um plano pelo cakto_offer_slug (preferencial) ou cakto_product_id (fallback).
 */
async function resolvePlatformPlan(
  admin: SupabaseClient,
  offerSlug: string | null,
  productCaktoId: string | null,
) {
  if (offerSlug) {
    const { data } = await admin
      .from('platform_plans')
      .select('id, name, slug, price_monthly, cakto_offer_slug, cakto_product_id')
      .eq('cakto_offer_slug', offerSlug)
      .maybeSingle();
    if (data) return data;
  }
  if (productCaktoId) {
    const { data } = await admin
      .from('platform_plans')
      .select('id, name, slug, price_monthly, cakto_offer_slug, cakto_product_id')
      .eq('cakto_product_id', productCaktoId)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

/**
 * Provisiona o plano da plataforma para o e-mail do comprador.
 * - Cria/encontra a organization pelo cakto_customer_email.
 * - Grava plan_id, plan_status='active', plan_activated_at, cakto_subscription_id.
 * - Insere billing_history idempotente via metadata.cakto_id.
 */
export async function provisionPlatformPlan(
  admin: SupabaseClient,
  order: CaktoOrderLike,
): Promise<ProvisionResult> {
  const errors: string[] = [];
  const email = (order.customer_email || '').trim().toLowerCase();
  if (!email) return { ok: false, skipped: 'missing customer_email' };

  // Só provisiona quando o pedido está aprovado/pago
  const status = (order.status || '').toLowerCase();
  if (status !== 'paid' && status !== 'approved') {
    return { ok: false, skipped: `status=${status}` };
  }

  const offerSlug = extractOfferSlug(order.raw_payload, order.cakto_offer_slug ?? null);
  const plan = await resolvePlatformPlan(admin, offerSlug, order.product_cakto_id ?? null);
  if (!plan) {
    return {
      ok: false,
      skipped: `plan not found (offer=${offerSlug ?? '-'}, product=${order.product_cakto_id ?? '-'})`,
    };
  }

  // 1) Localiza/cria a organization
  let orgId: string | null = null;
  const { data: existingOrg } = await admin
    .from('organizations')
    .select('id')
    .eq('cakto_customer_email', email)
    .maybeSingle();

  if (existingOrg) {
    orgId = existingOrg.id;
  } else {
    const { data: created, error: createErr } = await admin
      .from('organizations')
      .insert({
        name: order.customer_name || email,
        email,
        cakto_customer_email: email,
        status: 'active',
      })
      .select('id')
      .single();
    if (createErr || !created) {
      errors.push(`org create: ${createErr?.message ?? 'unknown'}`);
      return { ok: false, errors };
    }
    orgId = created.id;
  }

  // 2) Ativa plano
  const { error: planErr } = await admin
    .from('organizations')
    .update({
      plan_id: plan.id,
      plan_status: 'active',
      plan_activated_at: new Date().toISOString(),
      cakto_subscription_id: order.cakto_ref_id ?? order.cakto_id ?? null,
    })
    .eq('id', orgId);
  if (planErr) errors.push(`plan update: ${planErr.message}`);

  // 3) Registra billing_history idempotente
  const caktoId = order.cakto_id ?? order.cakto_ref_id ?? null;
  if (caktoId) {
    const { data: existingBill } = await admin
      .from('billing_history')
      .select('id')
      .eq('organization_id', orgId)
      .filter('metadata->>cakto_id', 'eq', caktoId)
      .maybeSingle();

    if (!existingBill) {
      const { error: billErr } = await admin.from('billing_history').insert({
        organization_id: orgId,
        amount: order.amount ?? plan.price_monthly ?? 0,
        status: 'paid',
        description: `Plano ${plan.name} — Cakto`,
        payment_date: new Date().toISOString(),
        metadata: {
          cakto_id: caktoId,
          cakto_offer_slug: offerSlug,
          source: 'cakto',
        } as any,
      });
      if (billErr) errors.push(`billing: ${billErr.message}`);
    }
  }

  return { ok: errors.length === 0, organization_id: orgId, plan_id: plan.id, errors };
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const base = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  // garante variedade de classes
  return `Vd!${base.slice(0, 28)}A1`;
}

interface EnsureAdminArgs {
  email: string;
  fullName?: string | null;
  organizationId: string;
  planName?: string | null;
  phone?: string | null;
}

/**
 * Garante usuário admin para a organização e dispara e-mail de boas-vindas idempotente.
 */
export async function ensureAdminUser(
  admin: SupabaseClient,
  args: EnsureAdminArgs,
): Promise<{ ok: boolean; user_id?: string; errors?: string[] }> {
  const errors: string[] = [];
  const email = args.email.trim().toLowerCase();
  if (!email) return { ok: false, errors: ['missing email'] };

  // 1) Tenta achar usuário existente
  let userId: string | null = null;
  const { data: foundId, error: rpcErr } = await admin.rpc('get_auth_user_id_by_email', {
    _email: email,
  });
  if (rpcErr) errors.push(`rpc: ${rpcErr.message}`);
  if (typeof foundId === 'string') userId = foundId;

  // 2) Cria se necessário
  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      user_metadata: { full_name: args.fullName ?? undefined },
    });
    if (createErr || !created?.user?.id) {
      errors.push(`createUser: ${createErr?.message ?? 'unknown'}`);
      return { ok: false, errors };
    }
    userId = created.user.id;
  }

  // 3) Upsert profile
  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      email,
      full_name: args.fullName ?? null,
      organization_id: args.organizationId,
      recovery_whatsapp: args.phone ?? null,
      is_active: true,
    } as any,
    { onConflict: 'id' },
  );
  if (profileErr) errors.push(`profile: ${profileErr.message}`);

  // 4) Garante role admin
  const { data: existingRole } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!existingRole) {
    const { error: roleErr } = await admin
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' } as any);
    if (roleErr) errors.push(`role: ${roleErr.message}`);
  }

  // 5) Gera link de recuperação + dispara e-mail (idempotente)
  try {
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });
    const recoveryLink =
      (linkData as any)?.properties?.action_link ||
      (linkData as any)?.action_link ||
      null;

    const sender = await getEmailSender(admin);
    const emailResult = await sendPlatformEmail({
      slug: 'welcome_admin_access',
      to: email,
      idempotencyKey: `welcome-admin-${userId}`,
      variables: {
        platform_name: sender.siteName,
        user_name: args.fullName || email.split('@')[0],
        plan_name: args.planName || 'plano contratado',
        recovery_link: recoveryLink || sender.siteUrl,
        login_email: email,
      },
    });
    if (!emailResult.ok) errors.push(`email: ${emailResult.error}`);
  } catch (e: any) {
    errors.push(`email: ${e?.message ?? String(e)}`);
  }

  return { ok: errors.length === 0, user_id: userId, errors };
}

/**
 * Roda o pipeline completo (plano + admin user).
 */
export async function provisionFromOrder(
  admin: SupabaseClient,
  order: CaktoOrderLike,
): Promise<ProvisionResult & { user_id?: string }> {
  const planRes = await provisionPlatformPlan(admin, order);
  if (!planRes.ok || !planRes.organization_id) return planRes;

  const offerSlug = extractOfferSlug(order.raw_payload, order.cakto_offer_slug ?? null);
  const plan = await resolvePlatformPlan(admin, offerSlug, order.product_cakto_id ?? null);

  const userRes = await ensureAdminUser(admin, {
    email: order.customer_email!,
    fullName: order.customer_name ?? null,
    phone: order.customer_phone ?? null,
    organizationId: planRes.organization_id,
    planName: plan?.name ?? null,
  });

  return {
    ...planRes,
    user_id: userRes.user_id,
    ok: planRes.ok && userRes.ok,
    errors: [...(planRes.errors ?? []), ...(userRes.errors ?? [])],
  };
}

export function buildAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
