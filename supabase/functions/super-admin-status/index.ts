import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory cache so we never block the app on a slow DB.
// Once we've confirmed a super admin exists, we don't need to ask again for a while.
let cachedHasSuperAdmin: boolean | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Serve from cache when fresh — never block login on DB latency.
  const now = Date.now();
  if (cachedHasSuperAdmin !== null && now - cachedAt < CACHE_TTL_MS) {
    return new Response(
      JSON.stringify({ hasSuperAdmin: cachedHasSuperAdmin, cached: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const query = admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "super_admin")
      .limit(1);

    const { data, error } = await withTimeout(query as unknown as Promise<any>, 3000);
    if (error) throw error;

    cachedHasSuperAdmin = (data?.length ?? 0) > 0;
    cachedAt = now;

    return new Response(
      JSON.stringify({ hasSuperAdmin: cachedHasSuperAdmin }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[super-admin-status] error/timeout:", (err as Error).message);
    // Safe fallback: assume Super Admin EXISTS so we never push real users to /setup.
    // The BootstrapGuard treats this as "do nothing", keeping the user where they are.
    return new Response(
      JSON.stringify({ hasSuperAdmin: true, degraded: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
