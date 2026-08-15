// Edge Function: create-organization-admin
// Cria a conta do admin da empresa direto com senha provisória (sem convite).
// No primeiro login o usuário será obrigado a trocar a senha.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendPlatformEmail } from "../_shared/platform-email-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  organization_id: string;
  email: string;
  full_name?: string;
  password: string;
  public_app_url?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Não autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await userClient.auth.getUser();
    if (!caller) return json({ ok: false, error: "Sessão inválida" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isSuper } = await admin.rpc("is_super_admin", {
      _user_id: caller.id,
    });
    if (!isSuper) return json({ ok: false, error: "Permissão negada" }, 403);

    const body = (await req.json()) as Payload;
    const organization_id = (body.organization_id || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const full_name = (body.full_name || "").trim() || email;
    const password = (body.password || "").trim();
    const requestedAppUrl = (body.public_app_url || "").trim();

    if (!organization_id || !email) {
      return json({ ok: false, error: "organization_id e email são obrigatórios" }, 400);
    }
    if (!password || password.length < 10) {
      return json({ ok: false, error: "A senha provisória precisa ter pelo menos 10 caracteres." }, 400);
    }

    // Link de implantação para o próximo destino após o primeiro login
    let onboardingToken: string | null = null;
    try {
      const { data: linkData } = await userClient.rpc("create_onboarding_link", {
        _organization_id: organization_id,
        _ttl_days: 14,
        _force_reopen: false,
      });
      const row = Array.isArray(linkData) ? linkData[0] : linkData;
      onboardingToken = (row?.token as string) ?? null;
    } catch (e) {
      console.warn("[create-organization-admin] onboarding link skipped:", e);
    }

    // Procura usuário existente por e-mail (paginado)
    let existingUserId: string | null = null;
    let page = 1;
    while (page <= 20 && !existingUserId) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = data.users.find((u) => (u.email || "").toLowerCase() === email);
      if (found) { existingUserId = found.id; break; }
      if (data.users.length < 200) break;
      page++;
    }

    let userId = existingUserId;
    let created = false;

    if (!userId) {
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createError || !createdUser?.user) {
        const msg = (createError?.message || "").toLowerCase();
        if (msg.includes("pwned") || msg.includes("weak")) {
          return json({ ok: false, error: "Esta senha foi exposta em vazamentos. Escolha outra." }, 422);
        }
        throw createError || new Error("Falha ao criar usuário");
      }
      userId = createdUser.user.id;
      created = true;
    } else {
      // Já existe: verifica se pertence a outra empresa
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      if (
        existingProfile?.organization_id &&
        existingProfile.organization_id !== organization_id
      ) {
        return json(
          { ok: false, error: "Este e-mail já pertence a outra empresa. Use um e-mail diferente." },
          409,
        );
      }
      // Atualiza a senha e confirma o e-mail para permitir o primeiro login
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (updErr) {
        const msg = (updErr.message || "").toLowerCase();
        if (msg.includes("pwned") || msg.includes("weak")) {
          return json({ ok: false, error: "Esta senha foi exposta em vazamentos. Escolha outra." }, 422);
        }
        throw updErr;
      }
    }

    // Upsert profile — força troca de senha no primeiro acesso
    await admin.from("profiles").upsert(
      {
        id: userId!,
        email,
        full_name,
        organization_id,
        must_change_password: true,
        password_set_at: null,
      },
      { onConflict: "id" }
    );

    // Vínculo com a organização
    await admin
      .from("user_organizations")
      .upsert(
        { user_id: userId!, organization_id, role: "admin", joined_via: "provisioned", is_default: true },
        { onConflict: "user_id,organization_id" },
      );

    // Papel admin (limpa outros)
    await admin.from("user_roles").insert({ user_id: userId!, role: "admin" });
    await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId!)
      .neq("role", "admin");

    // Permissões padrão do papel admin
    try {
      await admin.rpc("initialize_user_permissions", {
        p_user_id: userId!,
        p_organization_id: organization_id,
        p_role: "admin",
      });
    } catch (e) {
      console.warn("[create-organization-admin] initialize_user_permissions failed:", e);
    }

    // Envia e-mail com credenciais e link direto para o login → implantação
    let appOrigin: string;
    try {
      appOrigin = new URL(requestedAppUrl || req.headers.get("origin") || "").origin;
    } catch {
      throw new Error("URL pública da aplicação inválida");
    }
    const nextPath = onboardingToken ? `/implantacao/${onboardingToken}` : "/admin/implantacao";
    const loginUrl = `${appOrigin}/login?next=${encodeURIComponent(nextPath)}`;

    const { data: platformSettings } = await admin
      .from("platform_settings")
      .select("platform_name")
      .maybeSingle();
    const platformName = platformSettings?.platform_name || "Vendus";
    const { data: organization } = await admin
      .from("organizations")
      .select("name")
      .eq("id", organization_id)
      .maybeSingle();

    const emailResult = await sendPlatformEmail({
      slug: "provisional_credentials",
      to: email,
      idempotencyKey: `provisioned-admin-${organization_id}-${email}-${Date.now()}`,
      variables: {
        platform_name: platformName,
        organization_name: organization?.name || platformName,
        login_email: email,
        provisional_password: password,
        login_url: loginUrl,
      },
    });
    if (!emailResult.ok) {
      console.error("[create-organization-admin] email error:", emailResult.error);
    }

    // Audit
    await admin.from("platform_audit_logs").insert({
      actor_id: caller.id,
      action: `Admin da empresa provisionado: ${email}`,
      entity_type: "organization",
      entity_id: organization_id,
      metadata: { email, created } as any,
    });

    return json({
      ok: true,
      user_id: userId,
      created,
      login_email: email,
      login_url: loginUrl,
      next_path: nextPath,
      email_sent: emailResult.ok,
    });
  } catch (err) {
    console.error("[create-organization-admin] error:", err);
    return json({ ok: false, error: (err as Error).message || "Erro interno" }, 500);
  }
});
