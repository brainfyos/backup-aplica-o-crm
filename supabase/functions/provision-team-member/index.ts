// Edge Function: provision-team-member
// Cria um membro na empresa do caller com senha provisória e envia credenciais.
// Sem convite/aceite — no primeiro login o usuário é obrigado a trocar a senha.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendPlatformEmail } from "../_shared/platform-email-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Payload {
  email: string;
  full_name?: string;
  password: string;
  role: "admin" | "seller";
  squad_id?: string | null;
  public_app_url?: string;
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

    // Caller precisa ser admin (ou super_admin) de alguma organização
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("organization_id, full_name")
      .eq("id", caller.id)
      .maybeSingle();
    const organization_id = callerProfile?.organization_id;
    if (!organization_id) return json({ ok: false, error: "Organização não encontrada" }, 403);

    const { data: rolesRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const roles = (rolesRows || []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      return json({ ok: false, error: "Permissão negada" }, 403);
    }

    const body = (await req.json()) as Payload;
    const email = (body.email || "").trim().toLowerCase();
    const full_name = (body.full_name || "").trim() || email;
    const password = (body.password || "").trim();
    const role = body.role === "admin" ? "admin" : "seller";
    const squad_id = body.squad_id || null;
    const requestedAppUrl = (body.public_app_url || "").trim();

    if (!email || !/.+@.+\..+/.test(email)) return json({ ok: false, error: "E-mail inválido" }, 400);
    if (!password || password.length < 10) {
      return json({ ok: false, error: "A senha provisória precisa ter pelo menos 10 caracteres." }, 400);
    }

    // Localiza usuário existente
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
      // Já existe — se tiver perfil, só pode ser desta empresa.
      // Sem perfil = conta órfã de uma exclusão antiga: adotamos normalmente.
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      if (
        existingProfile?.organization_id &&
        existingProfile.organization_id !== organization_id
      ) {
        return json({ ok: false, error: "Este e-mail já pertence a outra empresa." }, 409);
      }
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

    // Profile + força troca de senha.
    // O trigger `on_auth_user_created` vive no schema `auth` e NÃO é copiado em
    // um Remix — por isso garantimos o perfil aqui e falhamos alto se não der.
    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: userId!,
        email,
        full_name,
        organization_id,
        must_change_password: true,
        password_set_at: null,
      },
      { onConflict: "id" },
    );
    if (profileErr) {
      return json({ ok: false, error: `Falha ao criar perfil: ${profileErr.message}` }, 500);
    }

    const { data: profileCheck } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId!)
      .maybeSingle();
    if (!profileCheck) {
      return json({
        ok: false,
        error:
          "O perfil do usuário não pôde ser criado. Rode o reparo em Super Admin > Paridade / Remix.",
      }, 500);
    }


    await admin
      .from("user_organizations")
      .upsert(
        { user_id: userId!, organization_id, role, joined_via: "provisioned", is_default: true },
        { onConflict: "user_id,organization_id" },
      );

    // Papel único
    await admin.from("user_roles").insert({ user_id: userId!, role });
    await admin.from("user_roles").delete().eq("user_id", userId!).neq("role", role);

    try {
      await admin.rpc("initialize_user_permissions", {
        p_user_id: userId!,
        p_organization_id: organization_id,
        p_role: role,
      });
    } catch (e) {
      console.warn("[provision-team-member] initialize_user_permissions failed:", e);
    }

    if (squad_id) {
      await admin
        .from("squad_members")
        .insert({ squad_id, user_id: userId!, role: "member" })
        .then(() => {}, (e) => console.warn("[provision-team-member] squad insert:", e));
    }

    // E-mail
    let appOrigin: string;
    try {
      appOrigin = new URL(requestedAppUrl || req.headers.get("origin") || "").origin;
    } catch {
      appOrigin = "";
    }
    const loginUrl = appOrigin ? `${appOrigin}/login` : "";

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
      idempotencyKey: `provisioned-member-${organization_id}-${email}-${Date.now()}`,
      variables: {
        platform_name: platformName,
        organization_name: organization?.name || platformName,
        login_email: email,
        provisional_password: password,
        login_url: loginUrl,
      },
    });
    if (!emailResult.ok) {
      console.error("[provision-team-member] email error:", emailResult.error);
    }

    return json({
      ok: true,
      user_id: userId,
      created,
      login_email: email,
      login_url: loginUrl,
      email_sent: emailResult.ok,
    });
  } catch (err) {
    console.error("[provision-team-member] error:", err);
    return json({ ok: false, error: (err as Error).message || "Erro interno" }, 500);
  }
});
