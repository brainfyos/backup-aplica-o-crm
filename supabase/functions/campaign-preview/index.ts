// Preview do público de uma campanha.
// POST { organization_id, audience_filters, exclusion_filters }
// → { total_audience, will_receive, excluded, sample_ids }

import { resolveAudience, createServiceClient, type CampaignFilters } from "../_shared/campaign-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { organization_id, audience_filters, exclusion_filters } = (await req.json()) as {
      organization_id: string;
      audience_filters?: CampaignFilters;
      exclusion_filters?: CampaignFilters;
    };
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "Missing organization_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createServiceClient();
    const { leadIds, total, excluded } = await resolveAudience(
      supabase,
      organization_id,
      audience_filters ?? {},
      exclusion_filters ?? {},
    );

    return new Response(
      JSON.stringify({
        total_audience: total,
        will_receive: leadIds.length,
        excluded,
        sample_ids: leadIds.slice(0, 50),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[campaign-preview]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
