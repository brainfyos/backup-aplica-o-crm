// mia-aggregate — computa métricas de negócio agregadas por dimensão.
// Cron: 1x por hora. Lê mia_conversation_insights + leads + profiles
// e grava em mia_business_metrics.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Period = "day" | "week" | "month" | "all_time";

function periodStart(period: Period): string {
  const d = new Date();
  if (period === "day")   { d.setHours(0,0,0,0); }
  if (period === "week")  { d.setDate(d.getDate() - 7); }
  if (period === "month") { d.setDate(d.getDate() - 30); }
  if (period === "all_time") { return "2020-01-01"; }
  return d.toISOString().slice(0, 10);
}

function avgOrNull(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sentimentScore(s: string | null): number {
  if (s === "positivo") return 1;
  if (s === "negativo") return -1;
  return 0;
}

function topItems(arr: string[], limit = 5): { text: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const item of arr) {
    if (!item) continue;
    map[item] = (map[item] ?? 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
}

async function computeAndUpsert(
  admin: any,
  orgId: string,
  insights: any[],
  leadMap: Map<string, any>,
  sellerMap: Map<string, string>,
  period: Period,
) {
  if (!insights.length) return;
  const pStart = periodStart(period);
  const cutoff = new Date(pStart + "T00:00:00Z");

  const inPeriod = period === "all_time"
    ? insights
    : insights.filter(i => new Date(i.processed_at) >= cutoff);

  if (!inPeriod.length) return;

  // ── Agrupa por dimensão ─────────────────────────────────────────────────────

  const groups: Record<string, { dim: string; key: string; dimId?: string; items: any[] }> = {};

  const add = (dim: string, key: string, item: any, dimId?: string) => {
    const k = `${dim}::${key}`;
    if (!groups[k]) groups[k] = { dim, key, dimId, items: [] };
    groups[k].items.push(item);
  };

  for (const ins of inPeriod) {
    const conv = ins._conv; // joined below
    if (!conv) continue;

    // canal
    const channel = conv.channel ?? "unknown";
    add("channel", channel, ins);

    // vendedor
    const sellerId = conv.assigned_user_id ?? null;
    const sellerName = sellerId ? (sellerMap.get(sellerId) ?? sellerId) : "sem_responsavel";
    add("seller", sellerName, ins, sellerId ?? undefined);

    // hora do dia (UTC → adjust if needed)
    const hour = new Date(ins.processed_at).getUTCHours();
    add("hour_of_day", String(hour).padStart(2, "0") + "h", ins);

    // dia da semana
    const days = ["dom","seg","ter","qua","qui","sex","sab"];
    const dow = days[new Date(ins.processed_at).getUTCDay()];
    add("day_of_week", dow, ins);

    // origem do lead
    const lead = conv.lead_id ? leadMap.get(conv.lead_id) : null;
    const source = lead?.source ?? "unknown";
    add("lead_source", source, ins);
  }

  // overall
  groups["overall::all"] = { dim: "overall", key: "all", items: inPeriod };

  // ── Computa métricas por grupo e upserta ────────────────────────────────────

  const upserts: any[] = [];

  for (const { dim, key, dimId, items } of Object.values(groups)) {
    const total       = items.length;
    const converted   = items.filter(i => i.outcome === "converted").length;
    const lost        = items.filter(i => i.outcome === "lost").length;
    const inProgress  = items.filter(i => i.outcome === "in_progress" || i.outcome === "unknown").length;
    const convRate    = (converted + lost) > 0 ? converted / (converted + lost) : null;

    const responseTimes = items.map(i => i.response_time_avg_min).filter((v): v is number => v != null);
    const durations     = items.map(i => i.duration_days).filter((v): v is number => v != null);
    const msgCounts     = items.map(i => i.messages_count).filter((v): v is number => v != null);
    const sentiments    = items.map(i => sentimentScore(i.sentiment));

    const allObjections = items.flatMap(i => Array.isArray(i.objections) ? i.objections : []);
    const allPatterns   = items
      .flatMap(i => Array.isArray(i.patterns) ? i.patterns : [])
      .filter(p => p.category === "winning_pattern")
      .map(p => p.title);

    upserts.push({
      organization_id:      orgId,
      dimension:            dim,
      dimension_key:        key,
      dimension_id:         dimId ?? null,
      period,
      period_start:         pStart,
      total_conversations:  total,
      converted,
      lost,
      in_progress:          inProgress,
      avg_response_time_min: avgOrNull(responseTimes),
      avg_duration_days:    avgOrNull(durations),
      avg_messages_count:   avgOrNull(msgCounts),
      conversion_rate:      convRate,
      avg_sentiment_score:  avgOrNull(sentiments),
      top_objections:       topItems(allObjections),
      top_winning_patterns: topItems(allPatterns),
      computed_at:          new Date().toISOString(),
    });
  }

  if (upserts.length) {
    await admin.from("mia_business_metrics").upsert(upserts, {
      onConflict: "organization_id,dimension,dimension_key,period,period_start",
    });
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Carrega todas as organizações com insights
    const { data: orgs } = await admin
      .from("mia_conversation_insights")
      .select("organization_id")
      .gt("id", "00000000-0000-0000-0000-000000000000");

    const orgIds = [...new Set((orgs ?? []).map((r: any) => r.organization_id))];
    if (!orgIds.length) {
      return new Response(JSON.stringify({ processed: 0, reason: "no_data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalOrgs = 0;
    for (const orgId of orgIds) {
      try {
        // Insights da org com dados da conversa joinados
        const { data: insights } = await admin
          .from("mia_conversation_insights")
          .select("*, webchat_conversations!inner(id, channel, assigned_user_id, lead_id)")
          .eq("organization_id", orgId)
          .order("processed_at", { ascending: false })
          .limit(2000); // máx 2k por org para não explodir a memória

        if (!insights?.length) continue;

        // Junta conversa no insight para facilitar grouping
        const insightsWithConv = insights.map((i: any) => ({
          ...i,
          _conv: i.webchat_conversations,
        }));

        // Carrega sellers da org
        const { data: profs } = await admin
          .from("profiles")
          .select("id, full_name")
          .eq("organization_id", orgId);
        const sellerMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name ?? p.id]));

        // Carrega leads para source
        const leadIds = [...new Set(insightsWithConv.map((i: any) => i._conv?.lead_id).filter(Boolean))];
        const leadMap = new Map<string, any>();
        if (leadIds.length) {
          const { data: leads } = await admin
            .from("leads")
            .select("id, source")
            .in("id", leadIds);
          for (const l of leads ?? []) leadMap.set(l.id, l);
        }

        // Computa para cada período
        for (const period of ["day", "week", "month", "all_time"] as Period[]) {
          await computeAndUpsert(admin, orgId, insightsWithConv, leadMap, sellerMap, period);
        }

        totalOrgs++;
      } catch (e) {
        console.error(`[mia-aggregate] org ${orgId}:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, orgs_processed: totalOrgs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[mia-aggregate]", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
