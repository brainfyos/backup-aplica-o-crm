// Cron: para cada campanha recorrente ativa, refaz snapshot da audiência
// e enfileira novos targets (UNIQUE constraint evita duplicar leads que já receberam).
// Roda 1x a cada 15 minutos.

import { resolveAudience, createServiceClient, type CampaignFilters } from "../_shared/campaign-audience.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SpeedPreset = "safe" | "recommended" | "fast" | "aggressive" | "custom";

function speedSecondsRange(preset: SpeedPreset, custom?: any): [number, number] {
  switch (preset) {
    case "safe": return [120, 300];
    case "recommended": return [60, 180];
    case "fast": return [30, 120];
    case "aggressive": return [10, 45];
    case "custom":
      return [Number(custom?.min_seconds ?? 60), Number(custom?.max_seconds ?? 180)];
    default: return [60, 180];
  }
}
function randBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function weightedPick<T extends { weight?: number }>(items: T[]): T | null {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + (i.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const it of items) { r -= it.weight ?? 1; if (r <= 0) return it; }
  return items[items.length - 1];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createServiceClient();
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("*")
      .eq("status", "active")
      .eq("schedule_type", "recurring");

    const list = campaigns ?? [];
    if (!list.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];
    for (const campaign of list) {
      try {
        // Resolve audiência atual
        const { leadIds } = await resolveAudience(
          supabase,
          campaign.organization_id,
          (campaign.audience_filters ?? {}) as CampaignFilters,
          (campaign.exclusion_filters ?? {}) as CampaignFilters,
        );
        if (!leadIds.length) { results.push({ campaign: campaign.id, new: 0 }); continue; }

        // Filtra leads que já têm target nessa campanha
        const { data: existing } = await supabase
          .from("campaign_targets")
          .select("lead_id")
          .eq("campaign_id", campaign.id)
          .in("lead_id", leadIds);
        const existingSet = new Set((existing ?? []).map((r: any) => r.lead_id));
        const newLeads = leadIds.filter((id) => !existingSet.has(id));
        if (!newLeads.length) { results.push({ campaign: campaign.id, new: 0 }); continue; }

        // Resolve instâncias conectadas
        let instances: any[] = [];
        if (campaign.instance_strategy === "manual" && Array.isArray(campaign.instance_distribution) && campaign.instance_distribution.length) {
          const ids = (campaign.instance_distribution as any[]).map((i: any) => i.instance_id);
          const { data } = await supabase.from("evolution_instances").select("id, status").in("id", ids);
          instances = (data ?? []).filter((i: any) => i.status === "connected")
            .map((i: any) => ({ ...i, weight: (campaign.instance_distribution as any[]).find((x: any) => x.instance_id === i.id)?.weight ?? 1 }));
        } else {
          const { data } = await supabase.from("evolution_instances")
            .select("id, status").eq("organization_id", campaign.organization_id).eq("status", "connected");
          instances = (data ?? []).map((i: any) => ({ ...i, weight: 1 }));
        }
        if (!instances.length) { results.push({ campaign: campaign.id, new: 0, error: "no_instance" }); continue; }

        // Contextos
        const ctxEntries: Array<{ text: string; id?: string; weight: number }> = [];
        for (const c of (campaign.contexts as any[] | null) ?? []) {
          if (c.inline_text) ctxEntries.push({ text: c.inline_text, weight: c.weight ?? 1 });
          else if (c.context_id) {
            const { data: ctx } = await supabase.from("campaign_contexts")
              .select("instructions, objective, tone, cta").eq("id", c.context_id).maybeSingle();
            if (ctx) {
              const text = [
                ctx.objective ? `Objetivo: ${ctx.objective}` : "",
                ctx.tone ? `Tom: ${ctx.tone}` : "",
                ctx.cta ? `CTA: ${ctx.cta}` : "",
                ctx.instructions,
              ].filter(Boolean).join("\n");
              ctxEntries.push({ text, id: c.context_id, weight: c.weight ?? 1 });
            }
          }
        }
        if (!ctxEntries.length) ctxEntries.push({ text: campaign.description ?? campaign.name, weight: 1 });

        const [minSec, maxSec] = speedSecondsRange(campaign.speed_preset as SpeedPreset, campaign.speed_config);
        let cursor = Date.now();
        let seq = 0, instIdx = 0;
        const dist = campaign.context_distribution as string;
        const targets: any[] = [];
        for (const leadId of newLeads) {
          const ctx = dist === "sequential" ? ctxEntries[seq++ % ctxEntries.length]
            : dist === "weighted" ? weightedPick(ctxEntries)!
            : ctxEntries[Math.floor(Math.random() * ctxEntries.length)];
          const inst = campaign.instance_strategy === "rotation"
            ? instances[instIdx++ % instances.length]
            : campaign.instance_strategy === "manual"
            ? weightedPick(instances)!
            : instances[Math.floor(Math.random() * instances.length)];
          cursor += randBetween(minSec, maxSec) * 1000;
          targets.push({
            campaign_id: campaign.id,
            lead_id: leadId,
            organization_id: campaign.organization_id,
            status: "queued",
            context_used: ctx.text,
            context_id: ctx.id ?? null,
            instance_id: inst.id,
            scheduled_for: new Date(cursor).toISOString(),
          });
        }

        const CHUNK = 500;
        for (let i = 0; i < targets.length; i += CHUNK) {
          await supabase.from("campaign_targets")
            .upsert(targets.slice(i, i + CHUNK), { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
        }
        results.push({ campaign: campaign.id, new: targets.length });
      } catch (err) {
        console.error("[campaign-recurring-snapshot] campaign error", campaign.id, err);
        results.push({ campaign: campaign.id, error: (err as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[campaign-recurring-snapshot]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
