// Função utilitária interna: aplica um export completo de agente (JSON) sobre
// um registro existente em product_agents. Protegida por token compartilhado.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const IMMUTABLE = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "organization_id",
  "product_id",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = Deno.env.get("AGENT_IMPORT_TOKEN");
  if (!token || req.headers.get("x-import-token") !== token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    const agent = payload?.agent ?? payload;
    const targetId = payload?.target_agent_id ?? agent?.id;
    if (!targetId || typeof agent !== "object") {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(agent)) {
      if (!IMMUTABLE.has(k)) update[k] = v;
    }
    update.updated_at = new Date().toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("product_agents")
      .update(update)
      .eq("id", targetId)
      .select("id, name, updated_at")
      .maybeSingle();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, agent: data, fields: Object.keys(update).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
