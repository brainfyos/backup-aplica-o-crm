// Edge Function: delete-team-member
// Remove um membro DA EMPRESA do caller.
// - Se o usuário ainda pertence a outra empresa: mantém a conta de login e o
//   perfil, apenas desvincula desta empresa (e reaponta o perfil para a
//   empresa restante quando necessário).
// - Se era o último vínculo: limpa tudo (RPC delete_team_member) e apaga a
//   conta na base de autenticação, evitando "contas fantasmas".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ ok: false, error: "Sessão inválida" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json()) as { user_id?: string; organization_id?: string };
    const targetId = (body.user_id || "").trim();
    if (!targetId) return json({ ok: false, error: "user_id é obrigatório" }, 400);
    if (targetId === caller.id) {
      return json({ ok: false, error: "Você não pode excluir a própria conta." }, 400);
    }

    // Empresa em contexto = a do caller (ou a informada, se super admin)
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("id", caller.id)
      .maybeSingle();

    const { data: rolesRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const callerRoles = (rolesRows || []).map((r: any) => r.role);
    const isSuper = callerRoles.includes("super_admin");
    if (!isSuper && !callerRoles.includes("admin")) {
      return json({ ok: false, error: "Permissão negada" }, 403);
    }

    const orgId = (isSuper && body.organization_id) || callerProfile?.organization_id;
    if (!orgId) return json({ ok: false, error: "Organização não encontrada" }, 400);

    // Alvo precisa pertencer a esta empresa
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id, organization_id")
      .eq("id", targetId)
      .maybeSingle();

    const { data: memberships } = await admin
      .from("user_organizations")
      .select("organization_id, role")
      .eq("user_id", targetId);

    const orgList = memberships || [];
    const belongsHere =
      targetProfile?.organization_id === orgId ||
      orgList.some((m: any) => m.organization_id === orgId);

    if (!targetProfile && orgList.length === 0) {
      // Conta órfã: nada em public. Remove só o login.
      await admin.auth.admin.deleteUser(targetId).catch(() => {});
      return json({ ok: true, mode: "orphan_removed" });
    }
    if (!belongsHere && !isSuper) {
      return json({ ok: false, error: "Este usuário não pertence à sua empresa." }, 403);
    }

    // ---- Limpeza escopada nesta empresa -------------------------------------
    await admin
      .from("user_organizations")
      .delete()
      .eq("user_id", targetId)
      .eq("organization_id", orgId);

    await admin
      .from("user_permissions")
      .delete()
      .eq("user_id", targetId)
      .eq("organization_id", orgId);

    // Setores e squads desta empresa
    const { data: orgSectors } = await admin
      .from("sectors")
      .select("id")
      .eq("organization_id", orgId);
    const sectorIds = (orgSectors || []).map((s: any) => s.id);
    if (sectorIds.length > 0) {
      await admin
        .from("sector_members")
        .delete()
        .eq("user_id", targetId)
        .in("sector_id", sectorIds);
    }

    const { data: orgSquads } = await admin
      .from("sales_squads")
      .select("id")
      .eq("organization_id", orgId);
    const squadIds = (orgSquads || []).map((s: any) => s.id);
    if (squadIds.length > 0) {
      await admin
        .from("squad_members")
        .delete()
        .eq("user_id", targetId)
        .in("squad_id", squadIds);
    }

    // Libera carteira desta empresa
    await admin
      .from("leads")
      .update({ assigned_to: null })
      .eq("assigned_to", targetId)
      .eq("organization_id", orgId);
    await admin
      .from("deals")
      .update({ seller_id: null })
      .eq("seller_id", targetId)
      .eq("organization_id", orgId);

    const remaining = orgList.filter((m: any) => m.organization_id !== orgId);

    if (remaining.length > 0) {
      // Saída parcial: mantém conta e perfil, reaponta para a empresa restante
      const next = remaining[0];
      if (targetProfile?.organization_id === orgId) {
        await admin
          .from("profiles")
          .update({ organization_id: next.organization_id })
          .eq("id", targetId);
      }
      await admin
        .from("user_organizations")
        .update({ is_default: true })
        .eq("user_id", targetId)
        .eq("organization_id", next.organization_id);

      // Papel é global hoje: recalcula a partir do vínculo restante
      if (next.role) {
        await admin.from("user_roles").delete().eq("user_id", targetId);
        await admin.from("user_roles").insert({ user_id: targetId, role: next.role });
      }

      return json({
        ok: true,
        mode: "removed_from_organization",
        remaining_organizations: remaining.length,
      });
    }

    // ---- Saída total ---------------------------------------------------------
    const { error: rpcErr } = await admin.rpc("delete_team_member", { p_user_id: targetId });
    if (rpcErr) {
      console.error("[delete-team-member] rpc error", rpcErr);
      return json({ ok: false, error: rpcErr.message }, 500);
    }

    const { error: authErr } = await admin.auth.admin.deleteUser(targetId);
    if (authErr) {
      console.error("[delete-team-member] auth delete error", authErr);
      return json({
        ok: false,
        error:
          "Os dados foram removidos, mas a conta de login não pôde ser apagada. Tente novamente.",
      }, 500);
    }

    return json({ ok: true, mode: "account_deleted" });
  } catch (err) {
    console.error("[delete-team-member] error:", err);
    return json({ ok: false, error: (err as Error).message || "Erro interno" }, 500);
  }
});
