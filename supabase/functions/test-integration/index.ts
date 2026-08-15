import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailSender } from "../_shared/email-sender.ts";
import { sendPlatformEmail } from "../_shared/platform-email-send.ts";
import { PLATFORM_EMAIL_SAMPLE_VARIABLES } from "../_shared/platform-email-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestIntegrationRequest {
  integrationType?: string;
  type?: string;
  email?: string;
  templateSlug?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireSuperAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceKey || !authHeader) return null;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isSuperAdmin, error } = await admin.rpc("is_super_admin", {
    _user_id: user.id,
  });
  if (error || !isSuperAdmin) return null;
  return admin;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: TestIntegrationRequest = await req.json();
    // aceita ambos: { integrationType } ou { type }
    const integrationType = body.integrationType ?? body.type;
    const recipientEmail = body.email;
    const templateSlug = body.templateSlug || "auth_password_recovery";

    switch (integrationType) {
      case "email":
      case "lovable_emails":
      case "resend": {
        // O teste de e-mail usa service_role internamente; a autorização de
        // Super Admin precisa ser verificada no servidor, não apenas na tela.
        const admin = await requireSuperAdmin(req);
        if (!admin) return json({ error: "Permissão negada" }, 403);

        if (recipientEmail) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
            return json({ error: "E-mail inválido" }, 400);
          }

          const sender = await getEmailSender(admin);
          const result = await sendPlatformEmail({
            slug: templateSlug,
            to: recipientEmail,
            idempotencyKey: `test-${templateSlug}-${Date.now()}`,
            variables: {
              ...PLATFORM_EMAIL_SAMPLE_VARIABLES,
              platform_name: sender.siteName,
              platform_url: sender.siteUrl,
              recipient_email: recipientEmail,
              login_email: recipientEmail,
            },
          });
          if (!result.ok) throw new Error(result.error || "Falha ao enfileirar e-mail");
          return json({
            success: true,
            queued: true,
            templateSlug,
            message: "E-mail de teste enfileirado",
          });
        }

        return json({ success: true, message: "Lovable Emails está ativo. Domínio configurado." });
      }


      case "firecrawl": {
        const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
        if (!firecrawlApiKey) {
          throw new Error("FIRECRAWL_API_KEY não configurada");
        }

        const res = await fetch("https://api.firecrawl.dev/v0/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${firecrawlApiKey}`,
          },
          body: JSON.stringify({
            url: "https://example.com",
            pageOptions: { onlyMainContent: true },
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Chave Firecrawl inválida");
        }

        return new Response(
          JSON.stringify({ success: true, message: "Conexão com Firecrawl bem-sucedida" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error(`Tipo de integração desconhecido: ${integrationType}`);
    }
  } catch (error: unknown) {
    console.error("Error in test-integration:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
