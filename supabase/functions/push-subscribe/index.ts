import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      console.warn("[push-subscribe] invalid auth", claimsErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub;

    const body = await req.json();
    const { endpoint, keys, user_agent, platform, is_standalone } = body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return new Response(JSON.stringify({ error: "Invalid subscription payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // fetch org_id from profile
    const { data: profile } = await admin
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();

    const row = {
      user_id: userId,
      organization_id: profile?.organization_id ?? null,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: user_agent || null,
      platform: platform || null,
      is_standalone: !!is_standalone,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    };

    const { error } = await admin
      .from("push_subscriptions")
      .upsert(row, { onConflict: "endpoint" });
    if (error) {
      console.error("[push-subscribe] upsert failed", error);
      throw error;
    }

    // Ensure master push_enabled flag is ON — otherwise sendPushToUsers filters this user out.
    const { error: prefErr } = await admin
      .from("user_notification_settings")
      .upsert(
        { user_id: userId, push_enabled: true },
        { onConflict: "user_id", ignoreDuplicates: false },
      );
    if (prefErr) console.warn("[push-subscribe] enable master flag failed", prefErr);

    console.log("[push-subscribe] subscription saved", { user_id: userId, platform, is_standalone: !!is_standalone });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[push-subscribe]", err);
    return new Response(JSON.stringify({ error: err.message || "push_subscribe_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
