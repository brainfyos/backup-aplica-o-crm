import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const fullName = String(body?.fullName ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const companyName = String(body?.companyName ?? "").trim();
    const phone = String(body?.phone ?? "").trim();

    if (!fullName) return json(400, { ok: false, error: "Nome é obrigatório" });
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return json(400, { ok: false, error: "Email inválido" });
    if (!password || password.length < 8)
      return json(400, { ok: false, error: "Senha precisa de no mínimo 8 caracteres" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Trava de segurança: só permite se NÃO existe nenhum super_admin
    const { data: existing, error: checkErr } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .limit(1);
    if (checkErr) throw checkErr;
    if ((existing?.length ?? 0) > 0) {
      return json(409, { ok: false, error: "Super Admin já foi configurado" });
    }

    // Fail closed before creating any user: a new Remix may only start after
    // the immutable database contract (ACLs + Realtime) has been reconciled.
    const { data: reconciliation, error: reconciliationError } = await admin.rpc(
      "reconcile_remix_database_contract",
    );
    if (reconciliationError) {
      console.error(
        "[setup-super-admin] database contract:",
        reconciliationError.message,
      );
      return json(503, {
        ok: false,
        error: "A estrutura do Remix ainda não foi certificada. Aplique a migration de paridade e tente novamente.",
      });
    }

    // Materialize the environment-specific runtime before any operational
    // record exists. A partial bootstrap must never produce a "finished" setup.
    const { data: bootstrap, error: bootstrapError } = await admin.rpc(
      "ensure_platform_bootstrap",
      {
        p_project_url: Deno.env.get("SUPABASE_URL")!,
        p_anon_key: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
    );
    if (bootstrapError) {
      console.error("[setup-super-admin] runtime bootstrap:", bootstrapError.message);
      return json(503, {
        ok: false,
        error: "A infraestrutura do Remix não pôde ser concluída. Revise a tela de paridade e tente novamente.",
      });
    }

    // Cria o usuário (auto-confirmado)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr) throw createErr;
    const userId = created.user?.id;
    if (!userId) throw new Error("Falha ao criar usuário");

    // Garante profile (trigger normalmente cria, blindamos)
    await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: fullName,
          email,
          phone: phone || null,
          is_active: true,
        },
        { onConflict: "id" },
      );

    // Organização opcional
    let organizationId: string | null = null;
    if (companyName) {
      const { data: org, error: orgErr } = await admin
        .from("organizations")
        .insert({
          name: companyName,
          email,
          phone: phone || null,
          owner_id: userId,
          status: "active",
        })
        .select("id")
        .single();
      if (orgErr) throw orgErr;
      organizationId = org.id;
      await admin
        .from("profiles")
        .update({ organization_id: organizationId })
        .eq("id", userId);
    }

    // Papéis
    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "super_admin" }, { onConflict: "user_id,role" });
    await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

    // Marca lock permanente em platform_settings
    const { data: settings } = await admin
      .from("platform_settings")
      .select("id")
      .maybeSingle();
    const payload = {
      super_admin_bootstrapped: true,
      super_admin_bootstrapped_at: new Date().toISOString(),
      default_password_changed: true,
      // Wizard teleguiado removido — o setup é considerado concluído aqui.
      remix_setup_completed: true,
    };
    if (settings?.id) {
      await admin.from("platform_settings").update(payload).eq("id", settings.id);
    } else {
      await admin.from("platform_settings").insert(payload);
    }

    return json(200, {
      ok: true,
      user_id: userId,
      organization_id: organizationId,
      reconciliation,
      bootstrap,
    });

  } catch (err) {
    console.error("[setup-super-admin] error:", err);
    return json(500, { ok: false, error: (err as Error).message });
  }
});
