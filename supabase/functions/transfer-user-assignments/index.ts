// transfer-user-assignments
// Transfere todas as conversas + leads atribuídos de um usuário para outro
// dentro da mesma organização. Requer admin/super_admin.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const sbUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await sbUser.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return json({ error: 'unauthorized' }, 401);
  const requesterId = claims.claims.sub as string;

  const body = await req.json().catch(() => ({}));
  const fromUserId: string | undefined = body?.from_user_id;
  const toUserId: string | undefined = body?.to_user_id;
  const reason: string | null = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;

  if (!fromUserId || !toUserId) return json({ error: 'from_user_id and to_user_id are required' }, 400);
  if (fromUserId === toUserId) return json({ error: 'from and to must be different users' }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE);

  // Resolve organização do usuário origem
  const { data: fromOrg, error: fromOrgErr } = await sb
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', fromUserId)
    .maybeSingle();
  if (fromOrgErr || !fromOrg?.organization_id) return json({ error: 'source user not found' }, 404);
  const orgId = fromOrg.organization_id as string;

  // Confirma que destino pertence à mesma org
  const { data: toOrg } = await sb
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', toUserId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!toOrg) return json({ error: 'destination user not in same organization' }, 403);

  // Autoriza requester (admin/super_admin)
  const { data: isSuper } = await sb.rpc('has_role', { _user_id: requesterId, _role: 'super_admin' });
  let authorized = !!isSuper;
  if (!authorized) {
    const { data: isAdmin } = await sb.rpc('has_role', { _user_id: requesterId, _role: 'admin' });
    if (isAdmin) {
      const { data: reqOrg } = await sb
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', requesterId)
        .eq('organization_id', orgId)
        .maybeSingle();
      authorized = !!reqOrg;
    }
  }
  if (!authorized) return json({ error: 'forbidden' }, 403);

  // Contagens iniciais por status
  const statuses = ['human_active', 'waiting_human', 'closed', 'bot_active'] as const;
  const counts: Record<string, number> = { human_active: 0, waiting_human: 0, closed: 0, bot_active: 0, other: 0 };
  for (const st of statuses) {
    const { count } = await sb
      .from('webchat_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('assigned_user_id', fromUserId)
      .eq('status', st);
    counts[st] = count ?? 0;
  }
  const { count: totalConvCount } = await sb
    .from('webchat_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('assigned_user_id', fromUserId);
  counts.other = (totalConvCount ?? 0) - counts.human_active - counts.waiting_human - counts.closed - counts.bot_active;

  // IDs de conversas para registrar histórico
  const { data: convRows } = await sb
    .from('webchat_conversations')
    .select('id')
    .eq('organization_id', orgId)
    .eq('assigned_user_id', fromUserId);
  const convIds = (convRows ?? []).map((r: any) => r.id as string);

  // Atualiza conversas
  if (convIds.length) {
    const { error: updConvErr } = await sb
      .from('webchat_conversations')
      .update({ assigned_user_id: toUserId })
      .eq('organization_id', orgId)
      .eq('assigned_user_id', fromUserId);
    if (updConvErr) return json({ error: `conversations update failed: ${updConvErr.message}` }, 500);

    // Histórico de conversas (em lotes)
    const transferRows = convIds.map((id) => ({
      conversation_id: id,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      internal_note: reason,
      created_by: requesterId,
    }));
    for (let i = 0; i < transferRows.length; i += 500) {
      await sb.from('conversation_transfers').insert(transferRows.slice(i, i + 500));
    }
  }

  // Leads
  const { data: leadRows } = await sb
    .from('leads')
    .select('id, squad_id')
    .eq('organization_id', orgId)
    .eq('assigned_to', fromUserId);
  const leadIds = (leadRows ?? []).map((r: any) => r.id as string);
  const leadsCount = leadIds.length;

  if (leadsCount) {
    const nowIso = new Date().toISOString();
    const { error: updLeadsErr } = await sb
      .from('leads')
      .update({
        assigned_to: toUserId,
        previous_assigned_to: fromUserId,
        transferred_at: nowIso,
        transferred_by: requesterId,
        transfer_reason: reason,
      })
      .eq('organization_id', orgId)
      .eq('assigned_to', fromUserId);
    if (updLeadsErr) return json({ error: `leads update failed: ${updLeadsErr.message}` }, 500);

    const histRows = (leadRows ?? []).map((r: any) => ({
      lead_id: r.id,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      from_squad_id: r.squad_id ?? null,
      to_squad_id: r.squad_id ?? null,
      reason,
      transferred_by: requesterId,
    }));
    for (let i = 0; i < histRows.length; i += 500) {
      await sb.from('lead_transfer_history').insert(histRows.slice(i, i + 500));
    }
  }

  // Audit log (best effort)
  try {
    await sb.from('platform_audit_logs').insert({
      action: 'transfer_user_assignments',
      actor_id: requesterId,
      metadata: {
        organization_id: orgId,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        reason,
        moved: { conversations: counts, leads: leadsCount },
      },
    });
  } catch (_) { /* ignore */ }

  return json({
    ok: true,
    moved: {
      conversations: counts,
      conversations_total: convIds.length,
      leads: leadsCount,
    },
  });
});
