// Aplica post_response_actions quando um lead em uma campanha ativa responde.
// Chamado de forma fire-and-forget pelo evolution-webhook ao gravar visitor message.
// POST { conversation_id, lead_id?, organization_id }

import { createServiceClient } from "../_shared/campaign-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { conversation_id, lead_id: leadIdIn, organization_id } = await req.json();
    if (!conversation_id && !leadIdIn) {
      return new Response(JSON.stringify({ error: "Missing conversation_id or lead_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createServiceClient();

    // Resolve lead_id a partir da conversa quando não vier no payload
    let resolvedLeadId: string | null = leadIdIn ?? null;
    if (!resolvedLeadId && conversation_id) {
      const { data: conv } = await supabase
        .from("webchat_conversations")
        .select("lead_id")
        .eq("id", conversation_id)
        .maybeSingle();
      resolvedLeadId = (conv as any)?.lead_id ?? null;
    }

    // Localiza o target da campanha ativa para esta conversa/lead.
    let target: any = null;
    if (conversation_id) {
      const { data } = await supabase
        .from("campaign_targets")
        .select("id, campaign_id, lead_id, organization_id, status, responded_at")
        .eq("conversation_id", conversation_id)
        .in("status", ["sent", "sending"])
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      target = data;
    }
    // Fallback por lead_id (cobre casos onde o conversation_id divergiu entre envio/resposta)
    if (!target && resolvedLeadId) {
      const { data } = await supabase
        .from("campaign_targets")
        .select("id, campaign_id, lead_id, organization_id, status, responded_at")
        .eq("lead_id", resolvedLeadId)
        .in("status", ["sent", "sending"])
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      target = data;
    }

    if (!target) {
      console.log("[campaign-on-response] no_active_target", { conversation_id, lead_id: resolvedLeadId });
      return new Response(JSON.stringify({ ok: true, skipped: "no_active_target" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (target.responded_at) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, name, post_response_actions, tags_on_response")
      .eq("id", target.campaign_id)
      .maybeSingle();

    const actions = (campaign?.post_response_actions ?? {}) as any;
    const tagsOnResp: string[] = Array.isArray(campaign?.tags_on_response)
      ? (campaign!.tags_on_response as string[])
      : [];

    // 1) Marca target como respondido
    await supabase
      .from("campaign_targets")
      .update({ status: "responded", responded_at: new Date().toISOString() })
      .eq("id", target.id);

    // 2) Parar restantes desse lead nesta campanha (se stop=true, default)
    if (actions.stop !== false) {
      await supabase
        .from("campaign_targets")
        .update({ status: "cancelled", error: "Lead respondeu" })
        .eq("campaign_id", target.campaign_id)
        .eq("lead_id", target.lead_id)
        .eq("status", "queued");
    }

    // 3) Atualizações no lead (etapa, temperatura)
    const leadUpdate: Record<string, any> = {};
    if (actions.stage_id) leadUpdate.stage_id = actions.stage_id;
    if (actions.temperature) leadUpdate.temperature = actions.temperature;
    if (Object.keys(leadUpdate).length) {
      await supabase.from("leads").update(leadUpdate).eq("id", target.lead_id);
    }

    // 4) Tags ao responder
    if (tagsOnResp.length) {
      const rows = tagsOnResp.map((tag_id) => ({
        lead_id: target.lead_id,
        tag_id,
        source: "campaign_response",
      }));
      await supabase.from("lead_tag_assignments").upsert(rows, { onConflict: "lead_id,tag_id", ignoreDuplicates: true });
    }
    if (Array.isArray(actions.tags_add) && actions.tags_add.length) {
      const rows = actions.tags_add.map((tag_id: string) => ({
        lead_id: target.lead_id,
        tag_id,
        source: "campaign_response",
      }));
      await supabase.from("lead_tag_assignments").upsert(rows, { onConflict: "lead_id,tag_id", ignoreDuplicates: true });
    }
    if (Array.isArray(actions.tags_remove) && actions.tags_remove.length) {
      await supabase
        .from("lead_tag_assignments")
        .delete()
        .eq("lead_id", target.lead_id)
        .in("tag_id", actions.tags_remove);
    }

    // 5) Take over: muda conversa para humano (zera AI via trigger enforce_single_attendant)
    if (actions.take_over && conversation_id) {
      await supabase
        .from("webchat_conversations")
        .update({ status: "human", assigned_to: null })
        .eq("id", conversation_id);
    }

    // 6) Nota opcional no lead
    if (actions.note && typeof actions.note === "string" && actions.note.trim()) {
      await supabase.from("lead_notes").insert({
        lead_id: target.lead_id,
        content: `[Campanha: ${campaign?.name ?? "—"}] ${actions.note.trim()}`,
        organization_id: target.organization_id,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, target_id: target.id, campaign_id: target.campaign_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[campaign-on-response]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
