// Edge Function: accept-invite-signup
// Cria/recupera o usuário e aceita o convite em uma única chamada server-side.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const BodySchema = z.object({
  token: z.string().trim().min(32).max(256),
  full_name: z.string().trim().min(2).max(160),
  password: z.string().min(10).max(128),
  attempt_id: z.string().uuid().optional(),
});

function authErrorResponse(error: { message?: string; code?: string; reasons?: string[] }) {
  const text = `${error.code || ""} ${error.message || ""} ${(error.reasons || []).join(" ")}`.toLowerCase();
  if (text.includes("pwned") || text.includes("weak_password") || text.includes("known to be weak")) {
    return json({
      ok: false,
      error: "weak_password",
      message: "Esta senha foi exposta em vazamentos. Escolha outra senha.",
    }, 422);
  }
  if (text.includes("password")) {
    return json({
      ok: false,
      error: "invalid_password",
      message: "A senha não atende aos requisitos de segurança.",
    }, 422);
  }
  return json({ ok: false, error: "account_update_failed", message: error.message || "Não foi possível preparar a conta." }, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("[accept-invite-signup] backend configuration missing");
    return json({ ok: false, error: "backend_unavailable", message: "Serviço temporariamente indisponível." }, 503);
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let rawPayload: unknown;
  try {
    rawPayload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json", message: "Dados inválidos." }, 400);
  }

  const parsed = BodySchema.safeParse(rawPayload);
  if (!parsed.success) {
    return json({
      ok: false,
      error: "invalid_fields",
      message: "Preencha o nome e use uma senha com pelo menos 10 caracteres.",
      fields: parsed.error.flatten().fieldErrors,
    }, 400);
  }
  const { token, full_name: fullName, password } = parsed.data;
  const attemptId = parsed.data.attempt_id || crypto.randomUUID();

  // Reserva o convite antes de tocar na conta. Só uma aba/dispositivo pode
  // obter a reserva; as demais apenas acompanham o estado.
  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_invitation_processing",
    { p_token: token, p_attempt_id: attemptId, p_lock_seconds: 90 },
  );
  if (claimError) {
    console.error("[accept-invite-signup] claim error", claimError);
    return json({ ok: false, error: "claim_failed", message: "Não foi possível reservar o convite. Tente novamente." }, 500);
  }

  const claim = (claimData || {}) as {
    state?: string;
    email?: string;
    role?: string;
    auth_user_id?: string | null;
  };
  if (claim.state === "processing") {
    return json({ ok: false, error: "invitation_processing", message: "Este convite está sendo concluído em outra aba." }, 409);
  }
  if (claim.state === "accepted") {
    return json({ ok: true, state: "already_accepted" });
  }
  if (claim.state === "expired") {
    return json({ ok: false, error: "invitation_expired", message: "Este convite expirou. Solicite um novo." }, 410);
  }
  if (claim.state !== "claimed" || !claim.email) {
    return json({ ok: false, error: "invitation_invalid", message: "Convite inválido." }, 404);
  }

  const releaseClaim = async (errorCode: string) => {
    const { error } = await admin.rpc("release_invitation_processing", {
      p_token: token,
      p_attempt_id: attemptId,
      p_error_code: errorCode,
    });
    if (error) console.error("[accept-invite-signup] release error", error);
  };

  const email = claim.email.toLowerCase();

  // 2) Pegar/Criar usuário Auth (admin API — sem envio de e-mail)
  let userId: string | null = claim.auth_user_id || null;

  // Tenta encontrar por e-mail (paginando — admin API não tem getUserByEmail)
  try {
    let page = 1;
    while (page <= 20 && !userId) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const found = data.users.find((u) => (u.email || "").toLowerCase() === email);
      if (found) {
        userId = found.id;
        break;
      }
      if (data.users.length < 200) break;
      page++;
    }
  } catch (e) {
    console.error("[accept-invite-signup] listUsers failed", e);
  }

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created.user) {
      console.error("[accept-invite-signup] createUser failed", createErr);
      const msg = (createErr?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered")) {
        await releaseClaim("email_race");
        return json({ ok: false, error: "retry_required", message: "A conta foi encontrada durante o processamento. Tente novamente para concluir." }, 409);
      }
      await releaseClaim(createErr?.code || "create_user_failed");
      if (createErr) return authErrorResponse(createErr);
      return json({ ok: false, error: "create_user_failed", message: "Não foi possível criar a conta." }, 500);
    }
    userId = created.user.id;
  } else {
    // Usuário já existia: atualiza senha + nome (idempotente em retries)
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (updErr) {
      console.warn("[accept-invite-signup] updateUserById failed", updErr);
      await releaseClaim(updErr.code || "account_update_failed");
      return authErrorResponse(updErr);
    }
  }

  if (!userId) {
    await releaseClaim("missing_user");
    return json({ ok: false, error: "account_update_failed", message: "Não foi possível preparar a conta." }, 500);
  }

  // Garante que o perfil exista antes da finalização transacional. Não altera
  // a empresa atual de uma conta que já participa de outra organização.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  const profileWrite = existingProfile
    ? admin.from("profiles").update({ email, full_name: fullName }).eq("id", userId)
    : admin.from("profiles").insert({ id: userId, email, full_name: fullName });
  const { error: profileError } = await profileWrite;
  if (profileError) {
    console.error("[accept-invite-signup] profile error", profileError);
    await releaseClaim("profile_failed");
    return json({ ok: false, error: "profile_failed", message: "Não foi possível preparar o perfil. Tente novamente." }, 500);
  }

  const { error: attachError } = await admin.rpc("attach_invitation_auth_user", {
    p_token: token,
    p_attempt_id: attemptId,
    p_user_id: userId,
  });
  if (attachError) {
    console.error("[accept-invite-signup] attach error", attachError);
    await releaseClaim("attach_failed");
    return json({ ok: false, error: "attach_failed", message: "Não foi possível vincular a conta. Tente novamente." }, 500);
  }

  const { data: finalData, error: finalError } = await admin.rpc("finalize_invitation_acceptance", {
    p_token: token,
    p_attempt_id: attemptId,
    p_user_id: userId,
  });
  if (finalError) {
    console.error("[accept-invite-signup] finalize error", finalError);
    await releaseClaim("finalize_failed");
    return json({ ok: false, error: "finalize_failed", message: "A conta foi preparada, mas o vínculo não foi concluído. Tente novamente." }, 500);
  }

  const finalResult = (finalData || {}) as { state?: string };
  if (!['accepted', 'already_accepted'].includes(finalResult.state || '')) {
    await releaseClaim(finalResult.state || "finalize_failed");
    const message = finalResult.state === "email_mismatch"
      ? "O e-mail da conta não corresponde ao convite."
      : "Não foi possível concluir o convite. Tente novamente.";
    return json({ ok: false, error: finalResult.state || "finalize_failed", message }, 409);
  }

  // Remove o papel padrão somente depois que a finalização foi confirmada.
  if (claim.role !== "seller") {
    const { error: delErr } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "seller");
    if (delErr) console.warn("[accept-invite-signup] cleanup seller role failed", delErr);
  }

  return json({ ok: true, state: finalResult.state, email, user_id: userId });
});
