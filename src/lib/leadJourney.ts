/**
 * LeadJourney — camada única de consulta do módulo Jornada do Lead.
 * Nenhum componente da tela deve acessar Supabase direto para ler jornada;
 * tudo passa por aqui. Assim mantemos a base independente de IA e pronta
 * para APIs futuras.
 */
import { supabase } from '@/integrations/supabase/client';

export type JourneyCategory =
  | 'origin' | 'contact' | 'attendance' | 'qualification' | 'opportunity'
  | 'meeting' | 'proposal' | 'negotiation' | 'sale' | 'post_sale' | 'system';

export interface JourneyEvent {
  id: string;
  organization_id: string;
  lead_id: string | null;
  conversation_id: string | null;
  deal_id: string | null;
  product_id: string | null;
  pipeline_stage_id: string | null;
  user_id: string | null;
  agent_id: string | null;
  event_type: string;
  event_category: JourneyCategory;
  channel: string | null;
  source: string | null;
  title: string | null;
  description: string | null;
  payload: Record<string, any>;
  occurred_at: string;
  previous_event_id: string | null;
  time_since_previous_seconds: number | null;
  created_at: string;
}

export interface JourneyMetrics {
  leadsCaptured: number;
  conversations: number;
  qualified: number;
  opportunities: number;
  sales: number;
  revenue: number;
}

export interface JourneyStage {
  key: JourneyCategory;
  label: string;
  count: number;
  conversion: number | null;
  avgSecondsToNext: number | null;
  value: number;
  cumulativeRevenue: number;
}

export interface JourneyTouchpoint {
  channel: string;
  touches: number;
  leads: number;
}

export interface JourneyFilters {
  organizationId: string;
  from?: string;
  to?: string;
  productId?: string | null;
  channel?: string | null;
  assignedTo?: string | null;
  origin?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  // preparado para integrações futuras (ainda não usado):
  ctwaClickId?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  adAccountId?: string | null;
}

export interface AcquisitionOriginRow {
  key: string;
  label: string;
  leads: number;
  pct: number;
}

export interface AcquisitionCampaignRow {
  key: string;
  name: string;
  leads: number;
  qualified: number;
  opportunities: number;
  sales: number;
  revenue: number;
  conversion: number;
}

export interface AcquisitionCreativeRow {
  key: string;
  name: string;
  thumbnail_url: string | null;
  leads: number;
  conversion: number;
  revenue: number;
  spend: number;
  roas: number | null;
}

export interface BottleneckItem {
  key:
    | 'waiting_response'
    | 'no_owner'
    | 'stalled_opportunities'
    | 'proposals_no_reply'
    | 'meetings_unconfirmed';
  label: string;
  count: number;
  severity: 'critical' | 'warning' | 'info';
  hint?: string;
}

export interface LeadSummary {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  lead_origin: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  temperature: string | null;
  first_contact_at: string | null;
  deal_value: number;
  status: string | null;
}

const STAGES: { key: JourneyCategory; label: string }[] = [
  { key: 'origin', label: 'Origem' },
  { key: 'contact', label: 'Primeiro Contato' },
  { key: 'attendance', label: 'Atendimento' },
  { key: 'qualification', label: 'Qualificação' },
  { key: 'opportunity', label: 'Oportunidade' },
  { key: 'meeting', label: 'Reunião' },
  { key: 'proposal', label: 'Proposta' },
  { key: 'negotiation', label: 'Negociação' },
  { key: 'sale', label: 'Venda' },
  { key: 'post_sale', label: 'Pós-venda' },
];

function applyFilters(q: any, f: JourneyFilters) {
  q = q.eq('organization_id', f.organizationId);
  if (f.from) q = q.gte('occurred_at', f.from);
  if (f.to) q = q.lte('occurred_at', f.to);
  if (f.productId) q = q.eq('product_id', f.productId);
  if (f.channel) q = q.eq('channel', f.channel);
  if (f.assignedTo) q = q.eq('user_id', f.assignedTo);
  return q;
}

/** Hidrata a receita real: soma o maior valor entre payload do evento, deals ganhos e leads.deal_value. */
async function hydrateRevenueByLead(
  organizationId: string,
  saleLeadIds: Set<string>,
  saleDealIds: Set<string>,
  payloadRevenueByLead: Map<string, number>,
): Promise<Map<string, number>> {
  const dealsRevenueByLead = new Map<string, number>();

  if (saleDealIds.size > 0) {
    const { data } = await supabase
      .from('deals')
      .select('id, lead_id, deal_value, status')
      .eq('organization_id', organizationId)
      .in('id', Array.from(saleDealIds));
    for (const d of (data ?? []) as any[]) {
      const v = Number(d.deal_value ?? 0);
      if (!d.lead_id || isNaN(v) || v <= 0) continue;
      dealsRevenueByLead.set(d.lead_id, (dealsRevenueByLead.get(d.lead_id) ?? 0) + v);
    }
  }

  const leadsMissing = Array.from(saleLeadIds).filter(id => !dealsRevenueByLead.has(id));
  if (leadsMissing.length > 0) {
    const { data } = await supabase
      .from('deals')
      .select('lead_id, deal_value, status')
      .eq('organization_id', organizationId)
      .eq('status', 'won')
      .in('lead_id', leadsMissing);
    for (const d of (data ?? []) as any[]) {
      const v = Number(d.deal_value ?? 0);
      if (!d.lead_id || isNaN(v) || v <= 0) continue;
      dealsRevenueByLead.set(d.lead_id, (dealsRevenueByLead.get(d.lead_id) ?? 0) + v);
    }
  }

  const stillMissing = Array.from(saleLeadIds).filter(
    id => !dealsRevenueByLead.has(id) && !(payloadRevenueByLead.get(id) ?? 0),
  );
  const leadsFallback = new Map<string, number>();
  if (stillMissing.length > 0) {
    const { data } = await supabase
      .from('leads')
      .select('id, deal_value')
      .in('id', stillMissing);
    for (const l of (data ?? []) as any[]) {
      const v = Number(l.deal_value ?? 0);
      if (isNaN(v) || v <= 0) continue;
      leadsFallback.set(l.id, v);
    }
  }

  const out = new Map<string, number>();
  for (const leadId of saleLeadIds) {
    out.set(
      leadId,
      Math.max(
        payloadRevenueByLead.get(leadId) ?? 0,
        dealsRevenueByLead.get(leadId) ?? 0,
        leadsFallback.get(leadId) ?? 0,
      ),
    );
  }
  return out;
}

async function hydrateRevenue(
  organizationId: string,
  saleLeadIds: Set<string>,
  saleDealIds: Set<string>,
  payloadRevenueByLead: Map<string, number>,
): Promise<number> {
  const map = await hydrateRevenueByLead(organizationId, saleLeadIds, saleDealIds, payloadRevenueByLead);
  let revenue = 0;
  for (const v of map.values()) revenue += v;
  return revenue;
}

/**
 * Fonte de verdade para Vendas/Receita: tabela `deals` com status='won'.
 * Independe de eventos em lead_journey_events (que podem faltar por falha de trigger).
 * Janela por `updated_at` = momento em que o deal foi fechado como ganho.
 */
async function getSalesFromDeals(filters: JourneyFilters): Promise<{
  salesCount: number;
  revenue: number;
  leadIds: Set<string>;
  revenueByLead: Map<string, number>;
}> {
  let q = supabase
    .from('deals')
    .select('id, lead_id, deal_value, updated_at')
    .eq('organization_id', filters.organizationId)
    .eq('status', 'won');
  if (filters.from) q = q.gte('updated_at', filters.from);
  if (filters.to) q = q.lte('updated_at', filters.to);
  if (filters.productId) q = q.eq('product_id', filters.productId);
  const { data, error } = await q.limit(20000);
  if (error) throw error;

  const leadIds = new Set<string>();
  const revenueByLead = new Map<string, number>();
  let revenue = 0;
  let salesCount = 0;
  for (const d of (data ?? []) as any[]) {
    const v = Number(d.deal_value ?? 0) || 0;
    salesCount += 1;
    revenue += v;
    if (d.lead_id) {
      leadIds.add(d.lead_id);
      revenueByLead.set(d.lead_id, (revenueByLead.get(d.lead_id) ?? 0) + v);
    }
  }
  return { salesCount, revenue, leadIds, revenueByLead };
}

export const LeadJourney = {
  /** Timeline paginada por lead. */
  async getTimeline(leadId: string, opts: { limit?: number; before?: string } = {}) {
    const limit = opts.limit ?? 100;
    let q = supabase
      .from('lead_journey_events')
      .select('*')
      .eq('lead_id', leadId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (opts.before) q = q.lt('occurred_at', opts.before);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as JourneyEvent[];
  },

  /** Eventos filtrados (dashboard/funil). */
  async getEvents(filters: JourneyFilters & { types?: string[]; categories?: JourneyCategory[]; limit?: number }) {
    let q = supabase.from('lead_journey_events').select('*');
    q = applyFilters(q, filters);
    if (filters.types?.length) q = q.in('event_type', filters.types as any);
    if (filters.categories?.length) q = q.in('event_category', filters.categories as any);
    q = q.order('occurred_at', { ascending: false }).limit(filters.limit ?? 500);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as JourneyEvent[];
  },

  /** Últimos eventos com nomes de lead/usuário para timeline em tempo real. */
  async getRealtimeFeed(filters: JourneyFilters, limit = 50) {
    const events = await LeadJourney.getEvents({ ...filters, limit });
    const leadIds = Array.from(new Set(events.map(e => e.lead_id).filter(Boolean))) as string[];
    const userIds = Array.from(new Set(events.map(e => e.user_id).filter(Boolean))) as string[];
    const [leadsRes, usersRes] = await Promise.all([
      leadIds.length ? supabase.from('leads').select('id, name').in('id', leadIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const leadMap = new Map<string, string>();
    for (const l of (leadsRes.data ?? []) as any[]) leadMap.set(l.id, l.name);
    const userMap = new Map<string, { name: string; avatar: string | null }>();
    for (const u of (usersRes.data ?? []) as any[]) userMap.set(u.id, { name: u.full_name, avatar: u.avatar_url });
    return events.map(e => ({
      ...e,
      lead_name: e.lead_id ? leadMap.get(e.lead_id) ?? null : null,
      user_name: e.user_id ? userMap.get(e.user_id)?.name ?? null : null,
      user_avatar: e.user_id ? userMap.get(e.user_id)?.avatar ?? null : null,
    }));
  },

  /** Touchpoints agregados por canal. */
  async getTouchpoints(filters: JourneyFilters): Promise<JourneyTouchpoint[]> {
    let q = supabase
      .from('lead_journey_events')
      .select('channel, lead_id')
      .not('channel', 'is', null);
    q = applyFilters(q, filters);
    q = q.limit(20000);
    const { data, error } = await q;
    if (error) throw error;
    const map = new Map<string, { touches: number; leads: Set<string> }>();
    for (const row of (data ?? []) as any[]) {
      const ch = row.channel as string;
      if (!map.has(ch)) map.set(ch, { touches: 0, leads: new Set() });
      const entry = map.get(ch)!;
      entry.touches += 1;
      if (row.lead_id) entry.leads.add(row.lead_id);
    }
    return Array.from(map.entries())
      .map(([channel, v]) => ({ channel, touches: v.touches, leads: v.leads.size }))
      .sort((a, b) => b.touches - a.touches);
  },

  /** Funil consolidado por categoria (com contagem única por lead). */
  async getStages(filters: JourneyFilters): Promise<JourneyStage[]> {
    let q = supabase
      .from('lead_journey_events')
      .select('event_category, lead_id, deal_id, occurred_at, payload');
    q = applyFilters(q, filters);
    q = q.limit(50000);
    const [{ data, error }, salesFromDeals] = await Promise.all([
      q,
      getSalesFromDeals(filters),
    ]);
    if (error) throw error;

    const perLead: Map<string, Map<JourneyCategory, string>> = new Map();
    const saleLeadIds = new Set<string>();
    const saleDealIds = new Set<string>();
    const payloadRevenueByLead = new Map<string, number>();

    for (const row of (data ?? []) as any[]) {
      if (!row.lead_id) continue;
      let m = perLead.get(row.lead_id);
      if (!m) { m = new Map(); perLead.set(row.lead_id, m); }
      const cur = m.get(row.event_category as JourneyCategory);
      if (!cur || new Date(row.occurred_at) < new Date(cur)) {
        m.set(row.event_category as JourneyCategory, row.occurred_at);
      }
      if (row.event_category === 'sale') {
        saleLeadIds.add(row.lead_id);
        if (row.deal_id) saleDealIds.add(row.deal_id);
        const v = Number(row.payload?.deal_value ?? row.payload?.value ?? row.payload?.amount ?? 0);
        if (!isNaN(v) && v > 0) {
          payloadRevenueByLead.set(row.lead_id, Math.max(payloadRevenueByLead.get(row.lead_id) ?? 0, v));
        }
      }
    }

    const revenueByLead = await hydrateRevenueByLead(filters.organizationId, saleLeadIds, saleDealIds, payloadRevenueByLead);

    // Contagem cumulativa: cada lead conta em TODAS as etapas que já tocou.
    // Necessário para que "Conv:" entre etapas represente conversão real (funil clássico).
    const leadsAtStageCumulative: string[][] = STAGES.map((s) =>
      Array.from(perLead.entries())
        .filter(([, m]) => m.has(s.key))
        .map(([leadId]) => leadId),
    );

    // Etapa mais avançada por lead (para receita acumulada — evita dupla contagem).
    const stageIndexByLead = new Map<string, number>();
    for (const [leadId, m] of perLead) {
      let maxIdx = -1;
      for (let i = 0; i < STAGES.length; i++) if (m.has(STAGES[i].key)) maxIdx = i;
      if (maxIdx >= 0) stageIndexByLead.set(leadId, maxIdx);
    }
    const leadsAtMaxStage: string[][] = STAGES.map(() => []);
    for (const [leadId, idx] of stageIndexByLead) leadsAtMaxStage[idx].push(leadId);

    const stages: JourneyStage[] = STAGES.map((s, i) => {
      // Receita acumulada = soma dos leads em etapas ≥ i (usa max-stage p/ não duplicar).
      let cumulative = 0;
      for (let j = i; j < STAGES.length; j++) {
        for (const leadId of leadsAtMaxStage[j]) cumulative += revenueByLead.get(leadId) ?? 0;
      }
      // Etapa "sale": fonte de verdade é `deals` (status=won). Sobrescreve tudo
      // que veio de eventos para não perder fechamentos sem event trigger.
      if (s.key === 'sale') {
        return {
          key: s.key,
          label: s.label,
          count: salesFromDeals.salesCount,
          conversion: null,
          avgSecondsToNext: null,
          value: salesFromDeals.revenue,
          cumulativeRevenue: salesFromDeals.revenue,
        };
      }
      return {
        key: s.key,
        label: s.label,
        count: leadsAtStageCumulative[i].length,
        conversion: null,
        avgSecondsToNext: null,
        value: 0,
        cumulativeRevenue: cumulative,
      };
    });

    for (let i = 0; i < stages.length; i++) {
      if (i > 0) {
        const prev = stages[i - 1].count;
        stages[i].conversion = prev > 0 ? stages[i].count / prev : null;
      }
      const next = STAGES[i + 1]?.key;
      if (next) {
        let sum = 0, n = 0;
        for (const m of perLead.values()) {
          const a = m.get(STAGES[i].key);
          const b = m.get(next);
          if (a && b) {
            const dt = (new Date(b).getTime() - new Date(a).getTime()) / 1000;
            if (dt >= 0) { sum += dt; n += 1; }
          }
        }
        stages[i].avgSecondsToNext = n > 0 ? sum / n : null;
      }
    }
    return stages;
  },

  /** Métricas do topo (cards). Vendas/Receita vêm de `deals` (fonte de verdade). */
  async getMetrics(filters: JourneyFilters): Promise<JourneyMetrics> {
    const [events, salesFromDeals] = await Promise.all([
      LeadJourney.getEvents({ ...filters, limit: 50000 }),
      getSalesFromDeals(filters),
    ]);
    const seen = {
      leads: new Set<string>(),
      convs: new Set<string>(),
      qual: new Set<string>(),
      opp: new Set<string>(),
    };
    for (const e of events) {
      if (!e.lead_id) continue;
      if (e.event_type === 'lead_created') seen.leads.add(e.lead_id);
      if (e.event_type === 'first_conversation' || e.event_type === 'first_message_in') seen.convs.add(e.lead_id);
      if (e.event_type === 'lead_qualified' || e.event_type === 'temperature_changed') seen.qual.add(e.lead_id);
      if (e.event_category === 'opportunity') seen.opp.add(e.lead_id);
    }
    return {
      leadsCaptured: seen.leads.size,
      conversations: seen.convs.size,
      qualified: seen.qual.size,
      opportunities: seen.opp.size,
      sales: salesFromDeals.salesCount,
      revenue: salesFromDeals.revenue,
    };
  },

  /** Leads dentro de uma etapa (drill-down). */
  async getLeadsInStage(filters: JourneyFilters, category: JourneyCategory) {
    let q = supabase
      .from('lead_journey_events')
      .select('lead_id, occurred_at, title, description, channel')
      .eq('event_category', category)
      .not('lead_id', 'is', null);
    q = applyFilters(q, filters);
    q = q.order('occurred_at', { ascending: false }).limit(2000);
    const { data, error } = await q;
    if (error) throw error;
    const seen = new Map<string, any>();
    for (const row of (data ?? []) as any[]) {
      if (!seen.has(row.lead_id)) seen.set(row.lead_id, row);
    }
    // Etapa "sale": complementa com leads de deals ganhos (fonte de verdade).
    if (category === 'sale') {
      const sales = await getSalesFromDeals(filters);
      for (const leadId of sales.leadIds) {
        if (!seen.has(leadId)) {
          seen.set(leadId, { lead_id: leadId, occurred_at: null, title: 'Venda registrada', description: null, channel: null });
        }
      }
    }
    let leadIds = Array.from(seen.keys());
    if (!leadIds.length) return [];

    // filtros adicionais (origin/utm) via tabela leads
    let leadsQ = supabase
      .from('leads')
      .select('id, name, phone, email, temperature, assigned_to, lead_channel, lead_origin, utm_source, utm_campaign, utm_content')
      .in('id', leadIds);
    if (filters.origin) leadsQ = leadsQ.or(`lead_origin.eq.${filters.origin},utm_source.eq.${filters.origin}`);
    if (filters.utmCampaign) leadsQ = leadsQ.eq('utm_campaign', filters.utmCampaign);
    if (filters.utmContent) leadsQ = leadsQ.eq('utm_content', filters.utmContent);
    const { data: leads } = await leadsQ;
    return (leads ?? []).map((l: any) => ({ ...l, last_event: seen.get(l.id) }));
  },

  /** Aquisição por origem (usa leads.lead_origin com fallback em utm_source). */
  async getAcquisitionByOrigin(filters: JourneyFilters): Promise<AcquisitionOriginRow[]> {
    let q = supabase
      .from('leads')
      .select('id, lead_origin, utm_source, created_at')
      .eq('organization_id', filters.organizationId);
    if (filters.from) q = q.gte('created_at', filters.from);
    if (filters.to) q = q.lte('created_at', filters.to);
    if (filters.productId) q = q.eq('product_id', filters.productId);
    q = q.limit(20000);
    const { data, error } = await q;
    if (error) throw error;
    const map = new Map<string, number>();
    for (const l of (data ?? []) as any[]) {
      const key = (l.lead_origin || l.utm_source || 'nao_informado') as string;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
    return Array.from(map.entries())
      .map(([key, leads]) => ({
        key,
        label: prettifyOrigin(key),
        leads,
        pct: total > 0 ? leads / total : 0,
      }))
      .sort((a, b) => b.leads - a.leads);
  },

  /** Aquisição por campanha — cruza marketing_campaigns (se houver) com leads e eventos. */
  async getAcquisitionByCampaign(filters: JourneyFilters): Promise<AcquisitionCampaignRow[]> {
    let leadsQ = supabase
      .from('leads')
      .select('id, utm_campaign, created_at')
      .eq('organization_id', filters.organizationId)
      .not('utm_campaign', 'is', null);
    if (filters.from) leadsQ = leadsQ.gte('created_at', filters.from);
    if (filters.to) leadsQ = leadsQ.lte('created_at', filters.to);
    if (filters.productId) leadsQ = leadsQ.eq('product_id', filters.productId);
    const { data: leads } = await leadsQ.limit(20000);

    const byCampaign = new Map<string, { leads: Set<string> }>();
    for (const l of (leads ?? []) as any[]) {
      const k = l.utm_campaign as string;
      if (!byCampaign.has(k)) byCampaign.set(k, { leads: new Set() });
      byCampaign.get(k)!.leads.add(l.id);
    }
    if (byCampaign.size === 0) return [];

    const leadIds = (leads ?? []).map((l: any) => l.id);
    // eventos relevantes para esses leads
    const { data: evs } = await supabase
      .from('lead_journey_events')
      .select('lead_id, event_category, deal_id, payload')
      .in('lead_id', leadIds)
      .in('event_category', ['qualification', 'opportunity', 'sale']);

    const perLeadCats = new Map<string, Set<string>>();
    const saleLeadIds = new Set<string>();
    const saleDealIds = new Set<string>();
    const payloadRevenueByLead = new Map<string, number>();
    for (const e of (evs ?? []) as any[]) {
      if (!e.lead_id) continue;
      let s = perLeadCats.get(e.lead_id);
      if (!s) { s = new Set(); perLeadCats.set(e.lead_id, s); }
      s.add(e.event_category);
      if (e.event_category === 'sale') {
        saleLeadIds.add(e.lead_id);
        if (e.deal_id) saleDealIds.add(e.deal_id);
        const v = Number(e.payload?.deal_value ?? e.payload?.value ?? 0);
        if (!isNaN(v) && v > 0) payloadRevenueByLead.set(e.lead_id, Math.max(payloadRevenueByLead.get(e.lead_id) ?? 0, v));
      }
    }
    const revenueMap = await hydrateRevenueByLead(filters.organizationId, saleLeadIds, saleDealIds, payloadRevenueByLead);

    const rows: AcquisitionCampaignRow[] = [];
    for (const [name, v] of byCampaign) {
      let qualified = 0, opportunities = 0, sales = 0, revenue = 0;
      for (const lid of v.leads) {
        const cats = perLeadCats.get(lid);
        if (cats?.has('qualification')) qualified++;
        if (cats?.has('opportunity')) opportunities++;
        if (cats?.has('sale')) { sales++; revenue += revenueMap.get(lid) ?? 0; }
      }
      rows.push({
        key: name,
        name,
        leads: v.leads.size,
        qualified,
        opportunities,
        sales,
        revenue,
        conversion: v.leads.size > 0 ? sales / v.leads.size : 0,
      });
    }
    return rows.sort((a, b) => b.leads - a.leads);
  },

  /** Aquisição por criativo — usa marketing_creatives + insights + leads via utm_content. */
  async getAcquisitionByCreative(filters: JourneyFilters): Promise<AcquisitionCreativeRow[]> {
    const [creativesRes, leadsRes, insightsRes] = await Promise.all([
      supabase
        .from('marketing_creatives')
        .select('id, external_id, name, thumbnail_url')
        .eq('organization_id', filters.organizationId)
        .limit(500),
      (() => {
        let q = supabase
          .from('leads')
          .select('id, utm_content, created_at')
          .eq('organization_id', filters.organizationId)
          .not('utm_content', 'is', null);
        if (filters.from) q = q.gte('created_at', filters.from);
        if (filters.to) q = q.lte('created_at', filters.to);
        if (filters.productId) q = q.eq('product_id', filters.productId);
        return q.limit(20000);
      })(),
      supabase
        .from('marketing_insights_daily')
        .select('entity_external_id, entity_type, spend, revenue, date')
        .eq('organization_id', filters.organizationId)
        .in('entity_type', ['creative', 'ad'])
        .gte('date', filters.from?.slice(0, 10) ?? '2000-01-01')
        .lte('date', filters.to?.slice(0, 10) ?? '2999-12-31')
        .limit(20000),
    ]);

    const creatives = (creativesRes.data ?? []) as any[];
    if (creatives.length === 0) return [];

    const byUtm = new Map<string, Set<string>>();
    for (const l of (leadsRes.data ?? []) as any[]) {
      const k = l.utm_content as string;
      if (!byUtm.has(k)) byUtm.set(k, new Set());
      byUtm.get(k)!.add(l.id);
    }

    const spendByExt = new Map<string, number>();
    const revenueByExt = new Map<string, number>();
    for (const i of (insightsRes.data ?? []) as any[]) {
      spendByExt.set(i.entity_external_id, (spendByExt.get(i.entity_external_id) ?? 0) + Number(i.spend ?? 0));
      revenueByExt.set(i.entity_external_id, (revenueByExt.get(i.entity_external_id) ?? 0) + Number(i.revenue ?? 0));
    }

    // sales por lead → contribui em conversion
    const allLeadIds = Array.from(new Set(Array.from(byUtm.values()).flatMap(s => Array.from(s))));
    let salesLeads = new Set<string>();
    if (allLeadIds.length) {
      const { data: sEvs } = await supabase
        .from('lead_journey_events')
        .select('lead_id')
        .eq('event_category', 'sale')
        .in('lead_id', allLeadIds);
      for (const r of (sEvs ?? []) as any[]) if (r.lead_id) salesLeads.add(r.lead_id);
    }

    return creatives.map(c => {
      const leadSet = byUtm.get(c.external_id) ?? byUtm.get(c.name) ?? new Set<string>();
      const sales = Array.from(leadSet).filter(id => salesLeads.has(id)).length;
      const spend = spendByExt.get(c.external_id) ?? 0;
      const revenue = revenueByExt.get(c.external_id) ?? 0;
      return {
        key: c.id,
        name: c.name ?? c.external_id,
        thumbnail_url: c.thumbnail_url,
        leads: leadSet.size,
        conversion: leadSet.size > 0 ? sales / leadSet.size : 0,
        revenue,
        spend,
        roas: spend > 0 ? revenue / spend : null,
      };
    }).sort((a, b) => b.leads - a.leads);
  },

  /** Resumo do lead para o cabeçalho do drawer. */
  async getLeadSummary(leadId: string): Promise<LeadSummary | null> {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, name, phone, email, temperature, assigned_to, lead_origin, utm_source, utm_campaign, utm_content, deal_value, created_at')
      .eq('id', leadId)
      .maybeSingle();
    if (!lead) return null;

    const [firstEventRes, ownerRes, dealsRes] = await Promise.all([
      supabase
        .from('lead_journey_events')
        .select('occurred_at')
        .eq('lead_id', leadId)
        .in('event_category', ['contact', 'attendance'])
        .order('occurred_at', { ascending: true })
        .limit(1),
      lead.assigned_to
        ? supabase.from('profiles').select('id, full_name, avatar_url').eq('id', lead.assigned_to).maybeSingle()
        : Promise.resolve({ data: null as any }),
      supabase
        .from('deals')
        .select('deal_value, status')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    const owner = (ownerRes as any).data;
    const dealRow = ((dealsRes as any).data ?? [])[0];
    const dealValue = Number(dealRow?.deal_value ?? lead.deal_value ?? 0) || 0;

    return {
      id: lead.id,
      name: lead.name ?? null,
      phone: lead.phone ?? null,
      email: lead.email ?? null,
      avatar_url: owner?.avatar_url ?? null,
      lead_origin: lead.lead_origin,
      utm_source: lead.utm_source,
      utm_campaign: lead.utm_campaign,
      utm_content: lead.utm_content,
      assigned_to: lead.assigned_to,
      assigned_name: owner?.full_name ?? null,
      temperature: lead.temperature,
      first_contact_at: ((firstEventRes as any).data ?? [])[0]?.occurred_at ?? null,
      deal_value: dealValue,
      status: dealRow?.status ?? null,
    };
  },

  /** Gargalos comerciais — contadores por regra. */
  async getBottlenecks(filters: JourneyFilters): Promise<BottleneckItem[]> {
    const orgId = filters.organizationId;
    const now = new Date();
    const _30minAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const _15dAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const _3dAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const [waitingRes, noOwnerRes, stalledRes, proposalsRes, meetingsRes] = await Promise.all([
      supabase
        .from('webchat_conversations')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .not('human_response_pending_since', 'is', null)
        .lt('human_response_pending_since', _30minAgo),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .is('assigned_to', null),
      supabase
        .from('deals')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('status', ['open', 'in_progress', 'negotiation', 'proposal'])
        .lt('updated_at', _15dAgo),
      supabase
        .from('lead_journey_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('event_category', 'proposal')
        .lt('occurred_at', _3dAgo),
      supabase
        .from('booking_requests')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'pending'),
    ]);

    return [
      { key: 'waiting_response', label: 'Leads aguardando resposta', count: waitingRes.count ?? 0, severity: 'critical', hint: 'Última mensagem sem resposta há mais de 30min' },
      { key: 'no_owner', label: 'Leads sem vendedor', count: noOwnerRes.count ?? 0, severity: 'warning', hint: 'Sem atendente atribuído' },
      { key: 'stalled_opportunities', label: 'Oportunidades paradas', count: stalledRes.count ?? 0, severity: 'warning', hint: 'Sem movimentação há mais de 15 dias' },
      { key: 'proposals_no_reply', label: 'Propostas sem retorno', count: proposalsRes.count ?? 0, severity: 'info', hint: 'Enviadas há mais de 3 dias' },
      { key: 'meetings_unconfirmed', label: 'Reuniões sem confirmação', count: meetingsRes.count ?? 0, severity: 'info', hint: 'Aguardando confirmação' },
    ];
  },

  stages: STAGES,
};

function prettifyOrigin(key: string): string {
  const map: Record<string, string> = {
    facebook: 'Facebook Ads', fb: 'Facebook Ads', instagram: 'Instagram', ig: 'Instagram',
    google: 'Google', google_ads: 'Google Ads', tiktok: 'TikTok', linkedin: 'LinkedIn',
    organic: 'Orgânico', organico: 'Orgânico', referral: 'Indicação', indicacao: 'Indicação',
    website: 'Website', direct: 'Direto', email: 'Email', whatsapp: 'WhatsApp',
    manual: 'Cadastro Manual', api: 'API', form: 'Formulário', chat: 'Chat',
    nao_informado: 'Não informado',
  };
  return map[key.toLowerCase()] ?? key;
}
