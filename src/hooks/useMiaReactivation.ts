// useMiaReactivation — detecta clientes prontos para recompra/reativação.
// Usa tabela deals (deals won) + cálculo de ciclo médio por produto.
// "R$ X dormindo em N clientes prontos pra voltar."

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ReactivationCandidate {
  leadId:         string;
  leadName:       string;
  leadPhone:      string | null;
  leadEmail:      string | null;
  productId:      string | null;
  productName:    string | null;
  dealValue:      number;
  lastDealAt:     string;   // ISO
  daysSince:      number;
  avgCycleDays:   number;   // ciclo médio do produto
  urgencyScore:   number;   // 0-100, quanto mais além do ciclo, maior
  assignedTo:     string | null;
  assignedName:   string | null;
}

export interface ReactivationData {
  candidates:    ReactivationCandidate[];
  totalValue:    number;
  loading:       boolean;
  lastFetch:     Date | null;
}

export function useMiaReactivation() {
  const { profile } = useAuth();
  const [data, setData]     = useState<ReactivationData>({ candidates: [], totalValue: 0, loading: true, lastFetch: null });
  const mountedRef          = useRef(true);

  const load = useCallback(async () => {
    const orgId = profile?.organization_id;
    if (!orgId) { setData(d => ({ ...d, loading: false })); return; }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();

    // 1. Carrega deals won dos últimos 90 dias com dados do lead
    const { data: deals } = await supabase
      .from("deals" as any)
      .select("id, lead_id, product_id, deal_value, closed_at, seller_id")
      .eq("organization_id", orgId)
      .eq("status", "won")
      .gte("closed_at", ninetyDaysAgo)
      .order("closed_at", { ascending: false });

    if (!deals?.length) {
      if (mountedRef.current) setData({ candidates: [], totalValue: 0, loading: false, lastFetch: new Date() });
      return;
    }

    // 2. Carrega todos os deals won (para calcular ciclo médio por produto)
    const { data: allDeals } = await supabase
      .from("deals" as any)
      .select("lead_id, product_id, closed_at")
      .eq("organization_id", orgId)
      .eq("status", "won")
      .order("closed_at", { ascending: true });

    // 3. Calcula ciclo médio de recompra por produto
    const productCycles: Record<string, number[]> = {};
    const byLeadProduct: Record<string, any[]> = {};
    for (const d of ((allDeals ?? []) as any[])) {
      const k = `${d.lead_id}:${d.product_id}`;
      if (!byLeadProduct[k]) byLeadProduct[k] = [];
      byLeadProduct[k].push(d);
    }
    for (const items of Object.values(byLeadProduct)) {
      if (items.length < 2) continue;
      const pid = items[0].product_id;
      if (!productCycles[pid]) productCycles[pid] = [];
      for (let i = 1; i < items.length; i++) {
        const days = (new Date(items[i].closed_at).getTime() - new Date(items[i-1].closed_at).getTime()) / 86_400_000;
        if (days > 0 && days < 365) productCycles[pid].push(days);
      }
    }
    const avgCycleByProduct: Record<string, number> = {};
    for (const [pid, cycles] of Object.entries(productCycles)) {
      avgCycleByProduct[pid] = Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length);
    }

    // 4. Deduplica: 1 deal mais recente por lead+produto
    const latestByKey: Record<string, any> = {};
    for (const deal of (deals as any[])) {
      const k = `${deal.lead_id}:${deal.product_id}`;
      if (!latestByKey[k]) latestByKey[k] = deal;
    }

    const candidates = Object.values(latestByKey);
    if (!candidates.length) {
      if (mountedRef.current) setData({ candidates: [], totalValue: 0, loading: false, lastFetch: new Date() });
      return;
    }

    // 5. Busca dados dos leads + produtos + profiles
    const leadIds    = [...new Set(candidates.map((d: any) => d.lead_id))];
    const productIds = [...new Set(candidates.map((d: any) => d.product_id).filter(Boolean))];
    const sellerIds  = [...new Set(candidates.map((d: any) => d.seller_id).filter(Boolean))];

    const [leadsRes, productsRes, sellersRes] = await Promise.all([
      supabase.from("leads" as any).select("id, name, phone, email, assigned_to").in("id", leadIds),
      productIds.length ? supabase.from("products" as any).select("id, name").in("id", productIds) : Promise.resolve({ data: [] }),
      sellerIds.length  ? supabase.from("profiles" as any).select("id, full_name").in("id", sellerIds) : Promise.resolve({ data: [] }),
    ]);

    const leadMap    = new Map((leadsRes.data ?? []).map((l: any) => [l.id, l]));
    const productMap = new Map(((productsRes as any).data ?? []).map((p: any) => [p.id, p]));
    const sellerMap  = new Map(((sellersRes as any).data ?? []).map((s: any) => [s.id, s.full_name]));

    const now = Date.now();
    const DEFAULT_CYCLE = 30; // dias padrão se sem histórico

    const result: ReactivationCandidate[] = candidates
      .map((deal: any) => {
        const lead       = leadMap.get(deal.lead_id);
        if (!lead) return null;
        const product    = (deal.product_id ? productMap.get(deal.product_id) : null) as any;
        const avgCycle   = avgCycleByProduct[deal.product_id] ?? DEFAULT_CYCLE;
        const daysSince  = Math.round((now - new Date(deal.closed_at).getTime()) / 86_400_000);
        const overdue    = daysSince - avgCycle; // negativo = ainda não chegou a hora
        const urgency    = Math.min(100, Math.max(0, Math.round((overdue / avgCycle) * 50 + 50)));

        return {
          leadId:       lead.id,
          leadName:     lead.name ?? "—",
          leadPhone:    lead.phone ?? null,
          leadEmail:    lead.email ?? null,
          productId:    deal.product_id ?? null,
          productName:  product?.name ?? null,
          dealValue:    deal.deal_value ?? 0,
          lastDealAt:   deal.closed_at,
          daysSince,
          avgCycleDays: avgCycle,
          urgencyScore: urgency,
          assignedTo:   deal.seller_id ?? null,
          assignedName: deal.seller_id ? (sellerMap.get(deal.seller_id) ?? null) : null,
        } as ReactivationCandidate;
      })
      .filter((c): c is ReactivationCandidate => c !== null && c.daysSince >= c.avgCycleDays * 0.75)
      .sort((a, b) => b.urgencyScore - a.urgencyScore);

    const totalValue = result.reduce((s, c) => s + c.dealValue, 0);

    if (mountedRef.current) setData({ candidates: result, totalValue, loading: false, lastFetch: new Date() });
  }, [profile?.organization_id]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const id = setInterval(load, 10 * 60_000); // refresh a cada 10 min
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [load]);

  return { ...data, refresh: load };
}
