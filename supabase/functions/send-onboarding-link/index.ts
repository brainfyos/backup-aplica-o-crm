// Super Admin gera link de implantação e envia por e-mail.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/platform-email-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: userData } = await userClient.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isSuperAdmin = (roles ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { organization_id, ttl_days = 7, email_to, send_email = false, force_reopen = false } = body ?? {};
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), { status: 400, headers: corsHeaders });
    }

    // Gera token via RPC (impersonando o super admin)
    const { data: linkData, error: linkErr } = await userClient.rpc("create_onboarding_link", {
      _organization_id: organization_id,
      _ttl_days: ttl_days,
      _force_reopen: force_reopen,
    });
    if (linkErr) {
      const msg = String(linkErr.message || linkErr);
      const code = msg.includes("org_already_onboarded") ? "org_already_onboarded" : msg;
      return new Response(JSON.stringify({ error: code }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const row = Array.isArray(linkData) ? linkData[0] : linkData;
    const token = row?.token as string;
    const expiresAt = row?.expires_at as string;
    const submissionId = row?.submission_id as string;

    const { data: org } = await admin
      .from("organizations").select("id,name,email").eq("id", organization_id).maybeSingle();

    const origin = req.headers.get("origin") ?? req.headers.get("referer")?.split("/").slice(0, 3).join("/") ?? "";
    const link = `${origin}/implantacao/${token}`;
    const targetEmail = send_email ? (email_to || org?.email || null) : null;

    let emailResult: any = { skipped: !targetEmail };
    if (targetEmail) {
      const sent = await sendPlatformEmail({
        slug: "onboarding-implantacao-link",
        to: targetEmail,
        variables: {
          organization_name: org?.name ?? "sua empresa",
          onboarding_link: link,
          expires_at: new Date(expiresAt).toLocaleString("pt-BR"),
        },
      });
      emailResult = sent;
    }

    return new Response(JSON.stringify({ ok: true, link, token, expires_at: expiresAt, submission_id: submissionId, email: emailResult }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("[send-onboarding-link]", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
