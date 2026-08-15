// Reprocessa um pedido Cakto já salvo em `cakto_orders`, rodando novamente o
// pipeline de provisionamento (plano + usuário admin). Idempotente.

import { buildAdminClient, provisionFromOrder } from '../_shared/cakto-plan-provisioning.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = buildAdminClient();

    // Autoriza apenas super_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const userClient = (await import('https://esm.sh/@supabase/supabase-js@2.45.0')).createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: 'unauthorized' }, 401);

    const { data: isSuper } = await admin.rpc('is_super_admin', { _user_id: caller.id });
    if (!isSuper) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const orderId = body.order_id ?? body.orderId;
    if (!orderId) return json({ error: 'order_id required' }, 400);

    const { data: order, error } = await admin
      .from('cakto_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!order) return json({ error: 'order not found' }, 404);

    const result = await provisionFromOrder(admin, order as any);
    return json({ ok: result.ok, result });
  } catch (e: any) {
    console.error('[cakto-reprocess-order] error', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
