import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await userClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isSuper } = await admin.rpc("is_super_admin", {
      _user_id: caller.id,
    });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Permissão negada" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { organization_id } = (await req.json()) as {
      organization_id: string;
    };
    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id obrigatório" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: org } = await admin
      .from("organizations")
      .select("id, name")
      .eq("id", organization_id)
      .maybeSingle();

    if (!org) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deleta usuários da org no auth (cascata limpa profiles e roles)
    const { data: members } = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", organization_id);

    if (members && members.length) {
      for (const m of members) {
        try {
          await admin.auth.admin.deleteUser(m.id);
        } catch (e) {
          console.error("[delete-organization] deleteUser error:", m.id, e);
        }
      }
    }

    // Coleta e-mails de convites pendentes desta org para limpar usuários órfãos
    // no Auth (ex.: admin convidado que ainda não completou o cadastro e não tem
    // profile). Só apaga do Auth quem NÃO tem profile em nenhuma outra org.
    const { data: pendingInvites } = await admin
      .from("team_invitations")
      .select("email")
      .eq("organization_id", organization_id);

    let orphansRemoved = 0;
    const inviteEmails = Array.from(
      new Set((pendingInvites ?? []).map((i: any) => String(i.email || "").toLowerCase()).filter(Boolean))
    );

    if (inviteEmails.length) {
      // Varre o Auth (paginado) e cruza com convites pendentes
      let page = 1;
      const matched: { id: string; email: string }[] = [];
      while (page <= 20) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        for (const u of data.users) {
          const em = (u.email || "").toLowerCase();
          if (em && inviteEmails.includes(em)) matched.push({ id: u.id, email: em });
        }
        if (data.users.length < 200) break;
        page++;
      }

      for (const u of matched) {
        // Preserva se o usuário ainda tem profile em outra empresa
        const { data: otherProfile } = await admin
          .from("profiles")
          .select("id, organization_id")
          .eq("id", u.id)
          .maybeSingle();
        if (otherProfile?.organization_id && otherProfile.organization_id !== organization_id) {
          continue;
        }
        try {
          await admin.auth.admin.deleteUser(u.id);
          orphansRemoved++;
        } catch (e) {
          console.error("[delete-organization] orphan deleteUser error:", u.id, e);
        }
      }
    }

    // Deleta a empresa (cascata FK cuida do restante)
    const { error: delError } = await admin
      .from("organizations")
      .delete()
      .eq("id", organization_id);
    if (delError) {
      console.error("[delete-organization] delete org error:", delError);
      return new Response(
        JSON.stringify({
          ok: false,
          error: delError.message,
          details: (delError as any).details ?? null,
          hint: (delError as any).hint ?? null,
          code: (delError as any).code ?? null,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await admin.from("platform_audit_logs").insert({
      actor_id: caller.id,
      action: `Empresa excluída permanentemente: ${org.name}`,
      entity_type: "organization",
      entity_id: organization_id,
      metadata: {
        name: org.name,
        members_removed: members?.length || 0,
        orphans_removed: orphansRemoved,
        pending_invites_cleaned: inviteEmails.length,
      } as any,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        members_removed: members?.length || 0,
        orphans_removed: orphansRemoved,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[delete-organization] error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
