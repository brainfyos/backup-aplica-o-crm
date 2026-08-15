// Inicia uma campanha: resolve público + opt-out, monta snapshot e cria
// um job em `campaign_preparation_jobs`. O worker `campaign-prepare` insere
// os `campaign_targets` em segundo plano. Resposta < 500ms.
// POST { campaign_id }

import { resolveAudience, createServiceClient, type CampaignFilters } from "../_shared/campaign-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { campaign_id } = (await req.json()) as { campaign_id: string };
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "Missing campaign_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createServiceClient();

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    if (campaign.status === "active" || campaign.status === "preparing") {
      return new Response(JSON.stringify({ error: `Campaign already ${campaign.status}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Resolve público (snapshot)
    const audience = await resolveAudience(
      supabase,
      campaign.organization_id,
      (campaign.audience_filters ?? {}) as CampaignFilters,
      (campaign.exclusion_filters ?? {}) as CampaignFilters,
    );
    let { leadIds } = audience;
    const { total } = audience;
    let { excluded } = audience;

    // 2) Opt-out guard
    if (leadIds.length) {
      const { data: optedOut } = await supabase
        .from('leads')
        .select('id')
        .in('id', leadIds)
        .eq('whatsapp_opt_in', false);
      const optedSet = new Set(((optedOut ?? []) as any[]).map((r) => r.id));
      if (optedSet.size) {
        leadIds = leadIds.filter((id) => !optedSet.has(id));
        excluded = (excluded ?? 0) + optedSet.size;
      }
    }

    // 3) Resolve instâncias (snapshot leve — IDs + tipo + peso)
    let instances: Array<{ id: string; connection_type: 'evolution' | 'meta_whatsapp'; weight: number }> = [];
    const distItems = Array.isArray(campaign.instance_distribution) ? (campaign.instance_distribution as any[]) : [];

    if (campaign.instance_strategy === "manual" && distItems.length) {
      const evoIds = distItems
        .filter((i) => (i.connection_type ?? 'evolution') === 'evolution')
        .map((i) => i.instance_id)
        .filter(Boolean);
      const metaIds = distItems
        .filter((i) => i.connection_type === 'meta_whatsapp')
        .map((i) => i.instance_id)
        .filter(Boolean);

      const [{ data: evos }, { data: metas }] = await Promise.all([
        evoIds.length
          ? supabase.from("evolution_instances").select("id, status").in("id", evoIds)
          : Promise.resolve({ data: [] as any[] }),
        metaIds.length
          ? supabase.from("whatsapp_meta_connections").select("id, status").in("id", metaIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const findWeight = (id: string) => distItems.find((x) => x.instance_id === id)?.weight ?? 1;
      instances = [
        ...((evos ?? []) as any[])
          .filter((i) => i.status === "connected")
          .map((i) => ({ id: i.id, connection_type: 'evolution' as const, weight: findWeight(i.id) })),
        ...((metas ?? []) as any[])
          .filter((i) => i.status === "active")
          .map((i) => ({ id: i.id, connection_type: 'meta_whatsapp' as const, weight: findWeight(i.id) })),
      ];
    } else {
      const [{ data: evos }, { data: metas }] = await Promise.all([
        supabase
          .from("evolution_instances")
          .select("id")
          .eq("organization_id", campaign.organization_id)
          .eq("status", "connected"),
        supabase
          .from("whatsapp_meta_connections")
          .select("id")
          .eq("organization_id", campaign.organization_id)
          .eq("status", "active"),
      ]);
      instances = [
        ...((evos ?? []) as any[]).map((i) => ({ id: i.id, connection_type: 'evolution' as const, weight: 1 })),
        ...((metas ?? []) as any[]).map((i) => ({ id: i.id, connection_type: 'meta_whatsapp' as const, weight: 1 })),
      ];
    }

    if (!instances.length) {
      return new Response(
        JSON.stringify({ error: "Nenhum número WhatsApp conectado para envio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4) Resolve contextos (snapshot com texto já materializado)
    const contextEntries: Array<{ text: string; id?: string; weight: number }> = [];
    const declared = Array.isArray(campaign.contexts) ? (campaign.contexts as any[]) : [];
    for (const c of declared) {
      if (c.inline_text) {
        contextEntries.push({ text: c.inline_text, weight: c.weight ?? 1 });
      } else if (c.context_id) {
        const { data: ctx } = await supabase
          .from("campaign_contexts")
          .select("instructions, objective, tone, cta")
          .eq("id", c.context_id)
          .maybeSingle();
        if (ctx) {
          const text = [
            ctx.objective ? `Objetivo: ${ctx.objective}` : "",
            ctx.tone ? `Tom: ${ctx.tone}` : "",
            ctx.cta ? `CTA: ${ctx.cta}` : "",
            ctx.instructions,
          ].filter(Boolean).join("\n");
          contextEntries.push({ text, id: c.context_id, weight: c.weight ?? 1 });
        }
      }
    }
    if (!contextEntries.length) {
      contextEntries.push({ text: campaign.description ?? campaign.name, weight: 1 });
    }

    // 5) Cria snapshot completo
    const snapshot = {
      instances,
      contexts: contextEntries,
      instance_strategy: campaign.instance_strategy,
      context_distribution: campaign.context_distribution,
      speed_preset: campaign.speed_preset,
      speed_config: campaign.speed_config,
      schedule_type: campaign.schedule_type,
      scheduled_at: campaign.scheduled_at,
      base_time_ms: campaign.schedule_type === "scheduled" && campaign.scheduled_at
        ? new Date(campaign.scheduled_at).getTime()
        : Date.now(),
    };

    // 6) Cria job de preparação + marca campanha como 'preparing'
    const { data: job, error: jobErr } = await supabase
      .from("campaign_preparation_jobs")
      .insert({
        campaign_id,
        organization_id: campaign.organization_id,
        status: "pending",
        total_contacts: leadIds.length,
        lead_ids: leadIds,
        campaign_snapshot: snapshot,
      })
      .select("id")
      .single();
    if (jobErr) throw jobErr;

    await supabase
      .from("campaigns")
      .update({
        status: "preparing",
        totals: { audience: total, will_receive: leadIds.length, excluded },
      })
      .eq("id", campaign_id);

    // 7) Incrementa usage_count dos contextos da biblioteca
    const usedIds = Array.from(new Set(contextEntries.map((c) => c.id).filter(Boolean))) as string[];
    for (const id of usedIds) {
      const { data: row } = await supabase
        .from("campaign_contexts")
        .select("usage_count")
        .eq("id", id)
        .maybeSingle();
      if (row) {
        await supabase
          .from("campaign_contexts")
          .update({ usage_count: (row.usage_count ?? 0) + 1 })
          .eq("id", id);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: "preparing",
        preparation_job_id: job.id,
        total_audience: total,
        scheduled: leadIds.length,
        excluded,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[campaign-start]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
