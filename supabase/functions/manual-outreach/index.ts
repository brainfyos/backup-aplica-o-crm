// Compatibilidade: API pública mantida. Internamente delega ao
// _shared/outreach-core para reaproveitar lógica em manual-outreach-batch.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createOutreachCache, processOutreachTarget, type OutreachTarget } from "../_shared/outreach-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json() as {
      lead_ids: string[];
      agent_id: string;
      organization_id: string;
      objective?: string;
      extra_context?: string;
      context_mode?: "literal" | "guidance";
      event_context?: Record<string, unknown>;
      mode?: "direct" | "conversational";
      force_when_human?: boolean;
      force_manual_followup?: boolean;
      revive_from_queue?: boolean;

      instance_id?: string;
      connection_type?: "evolution" | "meta_whatsapp";
      template_config?: { template_id: string; variable_mapping?: Record<string, any> } | null;
      fixed_text?: string | null;
      no_agent?: boolean;
    };

    if (!body.lead_ids?.length || !body.agent_id) {
      return new Response(JSON.stringify({ error: "Missing lead_ids or agent_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    {
      const { assertOrgActive } = await import("../_shared/org-status.ts");
      const guard = await assertOrgActive(supabase, body.organization_id);
      if (!guard.ok) {
        return new Response(JSON.stringify(guard.body), {
          status: guard.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const cache = createOutreachCache();
    const results = [] as any[];
    for (const leadId of body.lead_ids) {
      const target: OutreachTarget = {
        lead_id: leadId,
        agent_id: body.agent_id,
        organization_id: body.organization_id,
        objective: body.objective,
        extra_context: body.extra_context,
        context_mode: body.context_mode,
        event_context: body.event_context,
        mode: body.mode,
        force_when_human: body.force_when_human,
        force_manual_followup: body.force_manual_followup,
        revive_from_queue: body.revive_from_queue,

        instance_id: body.instance_id,
        connection_type: body.connection_type,
        template_config: body.template_config ?? null,
        fixed_text: body.fixed_text ?? null,
        no_agent: body.no_agent ?? false,
      };
      const r = await processOutreachTarget(supabase, lovableApiKey, cache, target);
      results.push(r);
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
