// mia-briefing-generator — gera briefing do dia adaptado por papel.
// Cron: 0 7,18 * * *  (7h manhã + 18h noite, Brasília = UTC-3 = 10h + 21h UTC)
// Salva em mia_daily_summaries com sections por papel (dono/gestor/vendedor).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function gpt(messages: any[], key: string): Promise<string> {
  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0.3, max_tokens: 600 }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const j = await r.json();
  return j.choices[0].message.content ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  try {
    // Processa todas as organizações ativas
    const { data: orgs } = await admin.from("organizations").select("id, name");
    if (!orgs?.length) return new Response(JSON.stringify({ ok: true, orgs: 0 }), { headers: corsHeaders });

    const today = new Date().toISOString().slice(0, 10);
    const hour  = new Date().getUTCHours(); // 10 = 7h Brasília, 21 = 18h
    const period = hour < 15 ? "morning" : "evening";

    let processed = 0;

    for (const org of orgs) {
      try {
        const orgId = org.id;

        // Coleta dados operacionais
        const [convRes, leadRes, taskRes, dealRes, teamRes] = await Promise.all([
          admin.from("webchat_conversations").select("id, status, assigned_user_id")
            .eq("organization_id", orgId).neq("status", "closed"),
          admin.from("leads").select("id, temperature, assigned_to")
            .eq("organization_id", orgId),
          admin.from("tasks").select("id, user_id, priority, due_date, status")
            .in("user_id",
              (await admin.from("profiles").select("id").eq("organization_id", orgId)).data?.map((p: any) => p.id) ?? []
            ).neq("status", "completed"),
          admin.from("deals").select("id, deal_value, status, updated_at")
            .eq("organization_id", orgId).not("status", "in", '["won","lost","cancelled"]'),
          admin.from("profiles").select("id, full_name").eq("organization_id", orgId),
        ]);

        const convs    = convRes.data ?? [];
        const leads    = leadRes.data ?? [];
        const tasks    = taskRes.data ?? [];
        const deals    = dealRes.data ?? [];
        const profiles = teamRes.data ?? [];
        const profMap  = new Map(profiles.map((p: any) => [p.id, p.full_name]));

        // Métricas derivadas
        const now = Date.now();
        const waitingHuman  = convs.filter((c: any) => c.status === "waiting_human").length;
        const hotLeads       = leads.filter((l: any) => l.temperature === "hot").length;
        const noOwner        = leads.filter((l: any) => !l.assigned_to).length;
        const overdueTasks   = tasks.filter((t: any) => t.due_date && new Date(t.due_date) < new Date()).length;
        const pipeline       = deals.reduce((s: number, d: any) => s + (d.deal_value ?? 0), 0);
        const stalledDeals   = deals.filter((d: any) => new Date(d.updated_at) < new Date(now - 3 * 86_400_000)).length;

        // Gera recomendações por papel (se OpenAI disponível)
        let donoHero = `${pipeline >= 1000 ? `R$ ${(pipeline/1000).toFixed(0)}k no pipeline` : "Pipeline em construção"}`;
        let gestorHero = `${profiles.length} vendedores · ${waitingHuman} sem resposta`;
        let vendedorHero = `${hotLeads} leads quentes pra chamar hoje`;

        let donoRecs: string[] = [];
        let gestorRecs: string[] = [];
        let vendedorRecs: string[] = [];

        if (openaiKey) {
          const ctx = `Empresa: ${org.name}. Conversas aguardando: ${waitingHuman}. Leads quentes: ${hotLeads}. Sem responsável: ${noOwner}. Tarefas atrasadas: ${overdueTasks}. Pipeline: R$${pipeline.toFixed(0)}. Propostas paradas: ${stalledDeals}.`;

          const [d, g, v] = await Promise.all([
            gpt([
              { role: "system", content: "Você é consultor comercial. Dê 3 recomendações CURTAS e DIRETAS em pt-BR para o dono/CEO focadas em dinheiro e risco. Formato: JSON array de strings. Sem floreio." },
              { role: "user", content: ctx },
            ], openaiKey).then(t => { try { return JSON.parse(t); } catch { return []; } }),
            gpt([
              { role: "system", content: "Você é consultor de gestão. Dê 3 recomendações CURTAS para o gestor focadas em equipe e operação. Formato: JSON array de strings." },
              { role: "user", content: ctx },
            ], openaiKey).then(t => { try { return JSON.parse(t); } catch { return []; } }),
            gpt([
              { role: "system", content: "Você é coach de vendas. Dê 3 dicas CURTAS para o vendedor sobre o que priorizar hoje. Formato: JSON array de strings." },
              { role: "user", content: ctx },
            ], openaiKey).then(t => { try { return JSON.parse(t); } catch { return []; } }),
          ]);

          donoRecs    = Array.isArray(d) ? d : [];
          gestorRecs  = Array.isArray(g) ? g : [];
          vendedorRecs = Array.isArray(v) ? v : [];
        } else {
          // Fallback sem IA
          if (waitingHuman > 0) donoRecs.push(`Priorize as ${waitingHuman} conversas aguardando resposta.`);
          if (stalledDeals > 0) donoRecs.push(`${stalledDeals} propostas paradas há +3 dias — risco de perda.`);
          if (hotLeads > 0) donoRecs.push(`Foque nos ${hotLeads} leads quentes.`);
          gestorRecs = donoRecs;
          if (hotLeads > 0) vendedorRecs.push(`Ligue para os ${hotLeads} leads quentes primeiro.`);
          if (overdueTasks > 0) vendedorRecs.push(`Finalize as ${overdueTasks} tarefas em atraso.`);
        }

        // Salva em mia_daily_summaries (upsert)
        const payload = {
          gerado_em: new Date().toISOString(),
          period,
          operacao: { conversas_abertas: convs.length, conversas_sem_resposta: waitingHuman, leads_quentes: hotLeads, leads_sem_responsavel: noOwner, tarefas_atrasadas: overdueTasks, reunioes_hoje: 0 },
          leads_quentes:          leads.filter((l: any) => l.temperature === "hot").slice(0, 5),
          oportunidades_em_risco: deals.filter((d: any) => new Date(d.updated_at) < new Date(now - 7 * 86_400_000)),
          followups:              { followups_atrasados: overdueTasks },
          recomendacoes:          donoRecs,
          // Seções por papel (novas)
          sections: {
            dono:     { hero: donoHero,    recommendations: donoRecs     },
            gestor:   { hero: gestorHero,  recommendations: gestorRecs   },
            vendedor: { hero: vendedorHero, recommendations: vendedorRecs },
          },
        };

        await admin.from("mia_daily_summaries").upsert({
          organization_id: orgId,
          summary_date:    today,
          payload,
          updated_at:      new Date().toISOString(),
        }, { onConflict: "organization_id,summary_date" });

        processed++;
      } catch (e) {
        console.error(`[mia-briefing-generator] org ${org.id}:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, period }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("[mia-briefing-generator]", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
