// Gera insights de uma campanha (melhor agente/contexto/horário, riscos)
// usando Lovable AI Gateway. POST { campaign_id }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordLovableUsage } from "../_shared/ai-router.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "Missing campaign_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI Gateway não configurado" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", campaign_id).maybeSingle();
    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targets } = await supabase
      .from("campaign_targets")
      .select("status, context_id, instance_id, sent_at, responded_at")
      .eq("campaign_id", campaign_id)
      .limit(5000);

    const list = targets ?? [];
    const total = list.length;
    const sent = list.filter((t: any) => ["sent", "responded"].includes(t.status)).length;
    const responded = list.filter((t: any) => t.status === "responded").length;
    const failed = list.filter((t: any) => t.status === "failed").length;
    const queued = list.filter((t: any) => ["queued", "sending"].includes(t.status)).length;

    // Distribuição de horário das respostas
    const respByHour: Record<number, number> = {};
    list.forEach((t: any) => {
      if (t.responded_at) {
        const h = new Date(t.responded_at).getHours();
        respByHour[h] = (respByHour[h] ?? 0) + 1;
      }
    });
    const bestHours = Object.entries(respByHour).sort(([, a], [, b]) => b - a).slice(0, 3).map(([h, n]) => ({ hour: Number(h), count: n }));

    // Por contexto
    const ctxStats: Record<string, { sent: number; responded: number }> = {};
    list.forEach((t: any) => {
      const k = t.context_id ?? "—";
      ctxStats[k] = ctxStats[k] ?? { sent: 0, responded: 0 };
      if (["sent", "responded"].includes(t.status)) ctxStats[k].sent++;
      if (t.status === "responded") ctxStats[k].responded++;
    });

    const summary = {
      campaign: { name: campaign.name, status: campaign.status, speed_preset: campaign.speed_preset, schedule_type: campaign.schedule_type },
      totals: { total, sent, responded, failed, queued, response_rate: sent ? Math.round((responded / sent) * 100) : 0 },
      best_response_hours: bestHours,
      contexts: ctxStats,
    };

    const prompt = `Você é o Assistente da Campanha Inteligente da Vendus. Analise os dados a seguir e produza 3 insights práticos para o gestor (em português, máximo 2 linhas cada, sem clichês). Cada insight deve ter: título curto + recomendação acionável.

Dados:
${JSON.stringify(summary, null, 2)}

Retorne JSON estrito no formato:
{ "insights": [ { "title": "...", "recommendation": "..." } ] }`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Gateway: ${resp.status} ${txt}`);
    }
    const ai = await resp.json();
    await recordLovableUsage(supabase, (campaign as any)?.organization_id, 'analysis_insights', 'google/gemini-2.5-flash', ai?.usage, 'campaign-ai-insights');
    const content = ai.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = { insights: [] };
    try { parsed = JSON.parse(content); } catch { /* leave default */ }

    return new Response(JSON.stringify({ ok: true, summary, insights: parsed.insights ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[campaign-ai-insights]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
