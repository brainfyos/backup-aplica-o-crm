// Internal push dispatcher — invoked by other edge functions via service role.
// Body: { user_ids: string[], preference_key, title, body, url?, tag?, icon?, badge?, data?, requireInteraction? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUsers, type PushPreferenceKey } from "../_shared/push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_KEYS: PushPreferenceKey[] = [
  "push_new_message",
  "push_queue_lead",
  "push_assigned_lead",
  "push_booking_reminder",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { user_ids, preference_key, title, body: text, url, tag, icon, badge, data, requireInteraction } = body || {};

    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_KEYS.includes(preference_key)) {
      return new Response(JSON.stringify({ error: "invalid preference_key" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!title) {
      return new Response(JSON.stringify({ error: "title required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await sendPushToUsers(
      admin,
      user_ids,
      { title, body: text || "", url, tag, icon, badge, data, requireInteraction },
      preference_key as PushPreferenceKey,
    );

    return new Response(JSON.stringify({ ok: true, ...result, details: (result as any).details || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[push-dispatch]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
