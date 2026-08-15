// useMiaCommercialIntel — carrega e computa todos os dados de inteligência comercial.
// Funil · Lead Scoring · Seller Performance · Revenue Intelligence
// Atualiza a cada 3 minutos via polling + Supabase Realtime para mudanças críticas.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface FunnelStage {
  id:            string;
  name:          string;
  order:         number;
  total:         number;   // leads na etapa agora
  stalled:       number;   // parados há > 7 dias
  avgDays:       number;   // tempo médio que leads passam nesta etapa
  convRate:      number | null; // conversão desta etapa p/ próxima (0-1)
  value:         number;   // valor total dos deals nesta etapa (R$)
}

export interface ScoredLead {
  id:           string;
  name:         string;
  temperature:  string;
  score:        number;    // 0-100
  scoreLabel:   "Frio" | "Morno" | "Quente" | "Crítico";
  stage:        string | null;
  responsavel:  string | null;
  lastContact:  string | null;
  daysInStage:  number | null;
  nextAction:   string | null;
  reasons:      string[];  // motivos do score
}

export interface SellerIntel {
  id:             string;
  name:           string;
  conversas:      number;
  leads:          number;
  tarefasAtrasadas: number;
  convRate:       number | null; // % de leads convertidos (de mia_business_metrics)
  avgResponseMin: number | null;
  gargalo:        "baixo" | "medio" | "alto";
  score:          number;  // performance score 0-100
}

export interface RevenueIntel {
  pipelineTotal:   number;
  pipelineByStage: { stage: string; value: number; count: number; prob: number }[];
  forecastMonth:   number;  // R$ esperado com base na conversão histórica
  wonThisMonth:    number;
  lostThisMonth:   number;
  avgTicket:       number;
  topDeals:        { lead: string; value: number; stage: string; days: number }[];
  byChannel:       { channel: string; count: number; value: number }[];
}

export interface CommercialIntelData {
  funnel:      FunnelStage[];
  leads:       ScoredLead[];
  sellers:     SellerIntel[];
  revenue:     RevenueIntel | null;
  loading:     boolean;
  lastFetch:   Date | null;
  orgId:       string | null;
}

// ── Score de lead ─────────────────────────────────────────────────────────────

function computeScore(lead: any, avgDaysPerStage: Record<string, number>): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Temperatura (0-45 pts)
  if (lead.temperature === "hot")       { score += 45; reasons.push("Lead quente (+45)"); }
  else if (lead.temperature === "warm") { score += 25; reasons.push("Lead morno (+25)"); }
  else                                  { score += 5;  reasons.push("Lead frio (+5)"); }

  // Recência do contato (0-30 pts)
  if (lead.last_contact_at) {
    const d = (Date.now() - new Date(lead.last_contact_at).getTime()) / 86_400_000;
    if      (d < 1)  { score += 30; reasons.push("Contato hoje (+30)"); }
    else if (d < 3)  { score += 20; reasons.push("Contato há 2-3 dias (+20)"); }
    else if (d < 7)  { score += 10; reasons.push("Contato esta semana (+10)"); }
    else if (d > 30) { score -= 15; reasons.push("Sem contato há 30+ dias (-15)"); }
    else if (d > 14) { score -= 5;  reasons.push("Sem contato há 2 semanas (-5)"); }
  } else {
    score -= 10;
    reasons.push("Nunca contatado (-10)");
  }

  // Tem responsável (0-15 pts)
  if (lead.assigned_to) { score += 15; reasons.push("Tem responsável (+15)"); }
  else                  { score -= 10; reasons.push("Sem responsável (-10)"); }

  // Velocidade na etapa (0-20 pts) — usa updated_at como proxy
  const proxyDate = lead.updated_at ?? lead.created_at;
  if (lead.current_stage_id && proxyDate) {
    const daysInStage = (Date.now() - new Date(proxyDate).getTime()) / 86_400_000;
    const avg = avgDaysPerStage[lead.current_stage_id] ?? 7;
    if      (daysInStage < avg * 0.5)  { score += 20; reasons.push("Avançando rápido (+20)"); }
    else if (daysInStage < avg)        { score += 10; reasons.push("No ritmo normal (+10)"); }
    else if (daysInStage > avg * 3)    { score -= 20; reasons.push("Parado há muito tempo (-20)"); }
    else if (daysInStage > avg * 1.5)  { score -= 10; reasons.push("Abaixo do ritmo (-10)"); }
  }

  const capped = Math.max(0, Math.min(100, score));
  return { score: capped, reasons };
}

function scoreLabel(s: number): ScoredLead["scoreLabel"] {
  if (s >= 70) return "Crítico";   // alta prioridade
  if (s >= 50) return "Quente";
  if (s >= 30) return "Morno";
  return "Frio";
}

// ── Hook ─────────────────────────────────────────────────────────────────────

const EMPTY: CommercialIntelData = {
  funnel: [], leads: [], sellers: [], revenue: null,
  loading: true, lastFetch: null, orgId: null,
};

export function useMiaCommercialIntel() {
  const { profile } = useAuth();
  const [data, setData] = useState<CommercialIntelData>(EMPTY);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const orgId = profile?.organization_id;
    if (!orgId) return;

    setData(prev => ({ ...prev, loading: true }));

    // ── 1. Pipeline stages + contagem de leads ────────────────────────────────
    const [stagesRes, leadsRes, dealsRes, metricsRes] = await Promise.all([
      supabase.from("pipeline_stages" as any)
        .select("id, name, order_index, product_id, products!inner(organization_id)")
        .eq("products.organization_id", orgId)
        .order("order_index"),

      // Nota: stage_entered_at pode não existir — use updated_at como proxy
      supabase.from("leads" as any)
        .select("id, name, temperature, current_stage_id, assigned_to, last_contact_at, created_at, updated_at, next_action, source")
        .eq("organization_id", orgId)
        .order("last_contact_at", { ascending: false, nullsFirst: false })
        .limit(500),

      supabase.from("deals" as any)
        .select("id, deal_value, status, plan_name, product_id, lead_id, created_at, updated_at, closed_at, leads!deals_lead_id_fkey(id, name, current_stage_id, source)")
        .eq("organization_id", orgId)
        .order("deal_value", { ascending: false }),

      supabase.from("mia_business_metrics" as any)
        .select("dimension, dimension_key, conversion_rate, avg_response_time_min, total_conversations")
        .eq("organization_id", orgId)
        .eq("period", "month"),
    ]);

    if (!mountedRef.current) return;

    const stages: any[] = (stagesRes.data ?? []);
    const allLeads: any[] = (leadsRes.data ?? []);
    const deals: any[] = (dealsRes.data ?? []);
    const metrics: any[] = (metricsRes.data ?? []);

    // ── 2. Funil ──────────────────────────────────────────────────────────────

    // Conta leads por etapa
    const leadsByStage: Record<string, number> = {};
    const stalledByStage: Record<string, number> = {};
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    for (const lead of allLeads) {
      if (!lead.current_stage_id) continue;
      leadsByStage[lead.current_stage_id] = (leadsByStage[lead.current_stage_id] ?? 0) + 1;
      // Usa updated_at como proxy de tempo na etapa
      const proxy = lead.updated_at ?? lead.created_at;
      if (proxy && proxy < sevenDaysAgo) {
        stalledByStage[lead.current_stage_id] = (stalledByStage[lead.current_stage_id] ?? 0) + 1;
      }
    }

    // Tempo médio por etapa (usa updated_at como proxy — stage_entered_at pode não existir)
    const avgDaysPerStage: Record<string, number> = {};
    const stageDurationMap: Record<string, number[]> = {};
    for (const lead of allLeads) {
      if (lead.current_stage_id) {
        const proxy = lead.updated_at ?? lead.created_at;
        if (proxy) {
          const d = (Date.now() - new Date(proxy).getTime()) / 86_400_000;
          if (!stageDurationMap[lead.current_stage_id]) stageDurationMap[lead.current_stage_id] = [];
          stageDurationMap[lead.current_stage_id].push(Math.min(d, 90)); // cap 90d
        }
      }
    }
    for (const [stageId, durations] of Object.entries(stageDurationMap)) {
      avgDaysPerStage[stageId] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    }

    // Valor dos deals por etapa. A relação direta deal -> lead evita perder
    // nomes/etapas quando o lead não está entre os 500 mais recentes do painel.
    const leadToStage: Record<string, string> = {};
    for (const lead of allLeads) {
      if (lead.current_stage_id) leadToStage[lead.id] = lead.current_stage_id;
    }
    const valueByStage: Record<string, number> = {};
    for (const deal of deals) {
      const relatedLead = Array.isArray(deal.leads) ? deal.leads[0] : deal.leads;
      const stageId = relatedLead?.current_stage_id ?? (deal.lead_id ? leadToStage[deal.lead_id] : null);
      if (deal.status === "open" && stageId) {
        valueByStage[stageId] = (valueByStage[stageId] ?? 0) + Number(deal.deal_value ?? 0);
      }
    }

    const funnelStages: FunnelStage[] = stages
      .filter(s => (leadsByStage[s.id] ?? 0) > 0 || (valueByStage[s.id] ?? 0) > 0 || stages.indexOf(s) < 4)
      .map((s, idx, arr) => {
        const total = leadsByStage[s.id] ?? 0;
        const nextTotal = idx < arr.length - 1 ? (leadsByStage[arr[idx + 1].id] ?? 0) : null;
        const convRate = nextTotal != null && total > 0 ? nextTotal / total : null;
        return {
          id:       s.id,
          name:     s.name,
          order:    s.order_index,
          total,
          stalled:  stalledByStage[s.id] ?? 0,
          avgDays:  Math.round(avgDaysPerStage[s.id] ?? 0),
          convRate,
          value:    valueByStage[s.id] ?? 0,
        };
      });

    // ── 3. Lead Scoring ───────────────────────────────────────────────────────

    const profileMap: Record<string, string> = {};
    const { data: profs } = await supabase.from("profiles" as any)
      .select("id, full_name").eq("organization_id", orgId);
    for (const p of profs ?? []) profileMap[(p as any).id] = (p as any).full_name ?? "—";

    const stageNameMap: Record<string, string> = {};
    for (const s of stages) stageNameMap[s.id] = s.name;

    const scoredLeads: ScoredLead[] = allLeads.slice(0, 200).map(lead => {
      const { score, reasons } = computeScore(lead, avgDaysPerStage);
      const proxyDate = lead.updated_at ?? lead.created_at;
      const daysInStage = proxyDate
        ? Math.round((Date.now() - new Date(proxyDate).getTime()) / 86_400_000)
        : null;
      return {
        id:          lead.id,
        name:        lead.name ?? "—",
        temperature: lead.temperature ?? "cold",
        score,
        scoreLabel:  scoreLabel(score),
        stage:       lead.current_stage_id ? (stageNameMap[lead.current_stage_id] ?? null) : null,
        responsavel: lead.assigned_to ? (profileMap[lead.assigned_to] ?? null) : null,
        lastContact: lead.last_contact_at ?? null,
        daysInStage,
        nextAction:  lead.next_action ?? null,
        reasons,
      };
    }).sort((a, b) => b.score - a.score);

    // ── 4. Seller Intelligence ────────────────────────────────────────────────

    // Agrupa leads e conversas por vendedor
    const sellerLeads: Record<string, number> = {};
    for (const l of allLeads) {
      if (l.assigned_to) sellerLeads[l.assigned_to] = (sellerLeads[l.assigned_to] ?? 0) + 1;
    }

    // Métricas de seller dos business_metrics
    const sellerMetrics: Record<string, any> = {};
    for (const m of metrics) {
      if (m.dimension === "seller") {
        sellerMetrics[m.dimension_key] = m;
      }
    }

    const sellers: SellerIntel[] = (profs ?? [])
      // Inclui quem tem leads OU perfil ativo (conversas vêm do team_status depois)
      .map((p: any) => {
        const metKey  = p.full_name?.split(" ")[0]?.toLowerCase() ?? p.id;
        const met     = sellerMetrics[metKey] ?? sellerMetrics[p.full_name] ?? null;
        const convRate = met?.conversion_rate ?? null;
        const avgResp  = met?.avg_response_time_min ?? null;
        let score = 50;
        if (convRate != null) score += Math.round(convRate * 30);
        if (avgResp  != null) score -= Math.min(20, Math.round(avgResp / 5));
        score = Math.max(0, Math.min(100, score));
        return {
          id:              p.id,
          name:            p.full_name ?? "—",
          conversas:       0,   // enriquecido em MiaSellersTab via intel.team
          leads:           sellerLeads[p.id] ?? 0,
          tarefasAtrasadas: 0,  // enriquecido em MiaSellersTab
          convRate,
          avgResponseMin:  avgResp,
          gargalo:         "baixo" as const,
          score,
        };
      })
      // Não filtra por leads — deixa MiaSellersTab fazer o merge com team_status
      .filter(s => s.name !== "—");

    // ── 5. Revenue Intelligence ───────────────────────────────────────────────

    const openDeals = deals.filter(d => d.status === "open");
    const wonDeals  = deals.filter(d => d.status === "won");
    const lostDeals = deals.filter(d => d.status === "lost");

    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
    const wonThisMonth = wonDeals
      .filter(d => new Date(d.closed_at ?? d.updated_at ?? d.created_at) >= thisMonth)
      .reduce((s, d) => s + Number(d.deal_value ?? 0), 0);
    const lostThisMonth = lostDeals
      .filter(d => new Date(d.closed_at ?? d.updated_at ?? d.created_at) >= thisMonth)
      .reduce((s, d) => s + Number(d.deal_value ?? 0), 0);

    const pipelineTotal = openDeals.reduce((s, d) => s + Number(d.deal_value ?? 0), 0);
    const avgTicket = wonDeals.length > 0
      ? wonDeals.reduce((s, d) => s + Number(d.deal_value ?? 0), 0) / wonDeals.length
      : 0;

    // Probabilidade por posição dentro do produto. Etapas de produtos
    // diferentes não podem formar uma única sequência de conversão.
    const stagesByProduct = new Map<string, any[]>();
    for (const stage of stages) {
      const key = stage.product_id ?? "__sem_produto__";
      const list = stagesByProduct.get(key) ?? [];
      list.push(stage);
      stagesByProduct.set(key, list);
    }
    const stageProbability = new Map<string, number>();
    for (const productStages of stagesByProduct.values()) {
      productStages.sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
      productStages.forEach((stage, index) => {
        const progress = productStages.length <= 1 ? 0.5 : index / (productStages.length - 1);
        stageProbability.set(stage.id, Math.min(0.85, Math.max(0.15, 0.15 + progress * 0.7)));
      });
    }

    const revenueStages = new Map<string, { stage: string; value: number; count: number; prob: number }>();
    for (const deal of openDeals) {
      const lead = Array.isArray(deal.leads) ? deal.leads[0] : deal.leads;
      const stageId = lead?.current_stage_id ?? "__sem_etapa__";
      const current = revenueStages.get(stageId) ?? {
        stage: stageId === "__sem_etapa__" ? "Sem etapa" : (stageNameMap[stageId] ?? "Etapa não encontrada"),
        value: 0,
        count: 0,
        prob: stageProbability.get(stageId) ?? 0.25,
      };
      current.value += Number(deal.deal_value ?? 0);
      current.count += 1;
      revenueStages.set(stageId, current);
    }
    const pipelineByStage: RevenueIntel["pipelineByStage"] = [...revenueStages.values()]
      .sort((a, b) => b.value - a.value);

    // Forecast: soma ponderada por probabilidade de fechamento
    const forecastMonth = pipelineByStage.reduce((s, p) => s + p.value * p.prob, 0);

    // Top deals
    const topDeals: RevenueIntel["topDeals"] = openDeals
      .filter(d => d.deal_value > 0)
      .slice(0, 8)
      .map(d => {
        const lead = Array.isArray(d.leads) ? d.leads[0] : d.leads;
        const days = Math.round((Date.now() - new Date(d.updated_at).getTime()) / 86_400_000);
        return {
          lead:  lead?.name ?? "Negócio sem lead vinculado",
          value: Number(d.deal_value ?? 0),
          stage: lead?.current_stage_id ? (stageNameMap[lead.current_stage_id] ?? "Etapa não encontrada") : "Sem etapa",
          days,
        };
      });

    // Por canal
    const channelMap: Record<string, { count: number; value: number }> = {};
    for (const lead of allLeads) {
      const ch = lead.source ?? "direto";
      if (!channelMap[ch]) channelMap[ch] = { count: 0, value: 0 };
      channelMap[ch].count++;
    }
    // Adiciona valor dos deals ao canal
    for (const deal of openDeals) {
      const lead = Array.isArray(deal.leads) ? deal.leads[0] : deal.leads;
      const ch = lead?.source ?? "direto";
      if (!channelMap[ch]) channelMap[ch] = { count: 0, value: 0 };
      channelMap[ch].value += Number(deal.deal_value ?? 0);
    }
    const byChannel = Object.entries(channelMap)
      .map(([channel, v]) => ({ channel, ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const revenue: RevenueIntel = {
      pipelineTotal, pipelineByStage, forecastMonth,
      wonThisMonth, lostThisMonth, avgTicket, topDeals, byChannel,
    };

    if (mountedRef.current) {
      setData({
        funnel:    funnelStages,
        leads:     scoredLeads,
        sellers,
        revenue,
        loading:   false,
        lastFetch: new Date(),
        orgId,
      });
    }
  }, [profile?.organization_id]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const id = setInterval(load, 180_000); // atualiza a cada 3 min
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [load]);

  return { ...data, refresh: load };
}
