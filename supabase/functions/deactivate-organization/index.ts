import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "suspend" | "reactivate";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "unauthorized" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: caller.id });
    if (!isSuper) return json({ error: "forbidden" }, 403);

    const body = (await req.json()) as { organization_id: string; action: Action; reason?: string };
    const { organization_id, action, reason } = body;
    if (!organization_id || !action) return json({ error: "organization_id and action required" }, 400);

    if (action === "suspend") {
      const { error } = await admin.rpc("deactivate_organization", {
        _org_id: organization_id,
        _reason: reason ?? "manual",
      });
      if (error) throw error;

      // Tenta forçar logout das instâncias Evolution para derrubar QR
      try {
        const { data: settings } = await admin
          .from("platform_settings").select("evolution_global_url, evolution_global_token").limit(1).maybeSingle();
        const url = (settings as any)?.evolution_global_url;
        const token = (settings as any)?.evolution_global_token;
        if (url && token) {
          const { data: insts } = await admin
            .from("evolution_instances")
            .select("name")
            .eq("organization_id", organization_id);
          for (const ev of insts ?? []) {
            try {
              await fetch(`${url.replace(/\/$/, "")}/instance/logout/${encodeURIComponent((ev as any).name)}`, {
                method: "DELETE",
                headers: { apikey: token },
              });
            } catch (e) {
              console.warn("[deactivate-organization] evolution logout failed:", e);
            }
          }
        }
      } catch (e) {
        console.warn("[deactivate-organization] evolution logout block failed:", e);
      }

      return json({ ok: true, status: "suspended" });
    }

    if (action === "reactivate") {
      const { error } = await admin.rpc("reactivate_organization", { _org_id: organization_id });
      if (error) throw error;
      return json({ ok: true, status: "active" });
    }

    return json({ error: "invalid action" }, 400);
  } catch (err) {
    console.error("[deactivate-organization] error:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
