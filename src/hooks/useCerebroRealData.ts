// useCerebroRealData — carrega conversas REAIS e as prepara para o Cérebro.
//
// Regra inviolável: zero dado fabricado.
// Cada pontinho = uma conversa real do banco.
// Cor = derivada de status + timestamps + deals reais.
// Se um dado não puder ser calculado, o pontinho fica cinza — nunca random.
//
// Realtime: assina webchat_conversations com debounce de 2.5s.
// Fallback: refresh a cada 30s caso o Realtime caia.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export interface RealConv {
  id:             string;
  channel:        string;
  status:         "bot_active" | "waiting_human" | "human_active" | "closed";
  visitorName:    string;
  leadId:         string | null;
  assignedUserId: string | null;
  currentAgentId: string | null;
  lastMsgAt:      string | null;
  createdAt:      string | null;
  // derivados — calculados de dados reais, nunca inventados
  color:          string;
  dotSize:        number;
  urgency:        number;
  minsWaiting:    number | null;
  tooltipText:    string;
  // enriquecimento para filtros
  productId:      string | null;
  productName:    string | null;
  dealValue:      number | null;  // valor do deal aberto associado ao lead
}

export interface SellerNode {
  profileId:  string;
  name:       string;
  convs:      RealConv[];
  // stats extras do team_status (se disponíveis)
  teamStats?: any;
}

export interface AgentNode {
  agentId:    string;
  name:       string;
  agentType:  string;
  convs:      RealConv[];
}

export interface ProductItem { id: string; name: string }

export interface CerebroData {
  sellers:    SellerNode[];
  agents:     AgentNode[];
  unassigned: RealConv[];
  allConvs:   RealConv[];   // lista plana de todas as conversas (para filtros)
  totalOpen:  number;
  loading:    boolean;
  lastFetch:  Date | null;
  isLive:     boolean;
  profileMap: Map<string, string>;
  products:   ProductItem[]; // para dropdown de filtro
}

// ── Lógica de cor — 100% derivada de dados reais ──────────────────────────────
// Prioridade: urgente > sem dono > fila > recompra > negociação > comprou recente > normal

const WON_WINDOW_DAYS  = 30;  // janela "comprou recentemente"
const URGENT_MINS      = 15;  // minutos sem resposta para urgente

// Calcula ciclo médio de recompra por produto a partir do histórico real de deals.
// Retorna Map<product_id, avg_days>.
// Se não houver histórico suficiente, retorna mapa vazio (azul não aparece).
function computeAvgRepurchaseCycle(deals: any[]): Map<string, number> {
  const byLeadProduct = new Map<string, any[]>();
  for (const d of deals) {
    if (!d.product_id) continue;
    const k = `${d.lead_id}:${d.product_id}`;
    const arr = byLeadProduct.get(k) ?? [];
    arr.push(d);
    byLeadProduct.set(k, arr);
  }
  const cyclesByProduct = new Map<string, number[]>();
  for (const [, items] of byLeadProduct.entries()) {
    if (items.length < 2) continue;
    items.sort((a: any, b: any) => a.closed_at.localeCompare(b.closed_at));
    for (let i = 1; i < items.length; i++) {
      const days = (new Date(items[i].closed_at).getTime() - new Date(items[i-1].closed_at).getTime()) / 86_400_000;
      if (days > 0 && days < 730) {
        const arr = cyclesByProduct.get(items[i].product_id) ?? [];
        arr.push(days);
        cyclesByProduct.set(items[i].product_id, arr);
      }
    }
  }
  const result = new Map<string, number>();
  for (const [pid, cycles] of cyclesByProduct.entries()) {
    if (cycles.length >= 2) { // exige pelo menos 2 intervalos para confiança
      result.set(pid, Math.round(cycles.reduce((a,b) => a+b, 0) / cycles.length));
    }
  }
  return result;
}

function computeConvColor(
  conv:                any,
  wonLeadIds:          Set<string>,
  negotiatingLeadIds:  Set<string>,
  recompraLeadIds:     Set<string>,
): { color: string; size: number; urgency: number } {
  const lastMsg    = conv.last_inbound_at ?? conv.last_message_at;
  const minsWait   = lastMsg ? (Date.now() - new Date(lastMsg).getTime()) / 60_000 : null;
  const isWaiting  = conv.status === "waiting_human";
  const hasOwner   = !!conv.assigned_user_id || !!conv.current_agent_id;

  // 🔴 Urgente: aguardando humano + sem resposta há >URGENT_MINS
  if (isWaiting && (minsWait ?? 0) > URGENT_MINS) {
    return { color: "#ef4444", size: 9, urgency: 100 };
  }
  // 🟡 Sem dono
  if (!hasOwner) {
    return { color: "#eab308", size: 8, urgency: 80 };
  }
  // 🟠 Na fila (waiting_human, recente)
  if (isWaiting) {
    return { color: "#f97316", size: 8, urgency: 70 };
  }
  // 🔵 Recompra — SOMENTE se ciclo médio calculado de dados reais
  if (conv.lead_id && recompraLeadIds.has(conv.lead_id)) {
    return { color: "#3b82f6", size: 8, urgency: 45 };
  }
  // 🟡 Lead com deal aberto (negociação)
  if (conv.lead_id && negotiatingLeadIds.has(conv.lead_id)) {
    return { color: "#eab308", size: 7, urgency: 50 };
  }
  // 🟢 Lead com deal won recente
  if (conv.lead_id && wonLeadIds.has(conv.lead_id)) {
    return { color: "#22c55e", size: 8, urgency: 35 };
  }
  // ⚪ Normal (bot_active, human_active sem deal aberto)
  return { color: "#94a3b8", size: 6, urgency: 10 };
}

// ── Hook principal ─────────────────────────────────────────────────────────────

const EMPTY: CerebroData = {
  sellers: [], agents: [], unassigned: [], allConvs: [], totalOpen: 0,
  loading: true, lastFetch: null, isLive: false, profileMap: new Map(), products: [],
};

export function useCerebroRealData(): CerebroData & { refresh: () => void } {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;

  const [data, setData]     = useState<CerebroData>(EMPTY);
  const mountedRef          = useRef(true);
  const debounceRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeRef         = useRef<any>(null);
  const [isLive, setIsLive] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) { setData(d => ({ ...d, loading: false })); return; }

    // ── 1. Conversas abertas da organização ─────────────────────────────────
    const { data: convRows, error: convErr } = await supabase
      .from("webchat_conversations" as any)
      .select([
        "id", "channel", "status",
        "visitor_name", "lead_id",
        "assigned_user_id", "current_agent_id",
        "last_message_at", "last_inbound_at",
      ].join(", "))
      .eq("organization_id", orgId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false, nullsFirst: false });
      // Sem limit — canvas renderiza qualquer volume sem travar o DOM

    if (convErr) { console.error("[Cérebro] conv query:", convErr); }
    if (!mountedRef.current) return;

    const convs = (convRows ?? []) as any[];

    // ── 2. Deals para os leads dessas conversas ─────────────────────────────
    const leadIds = [...new Set(convs.map((c: any) => c.lead_id).filter(Boolean))];
    const wonLeadIds          = new Set<string>();
    const negotiatingLeadIds  = new Set<string>();

    // Mapas declarados fora do if — acessíveis em todo o escopo da função
    const leadToProduct   = new Map<string, string | null>();
    const leadToDealValue = new Map<string, number>();

    // Calcula recompra e deals em paralelo
    const recompraLeadIds = new Set<string>();
    let hasRecompraData   = false;

    if (leadIds.length) {
      const wonCutoff   = new Date(Date.now() - WON_WINDOW_DAYS * 86_400_000).toISOString();
      const safeLeadIds = leadIds.slice(0, 200); // evita URL overflow no .in()

      const [dealsRes, allDealsRes, leadsRes] = await Promise.all([
        supabase.from("deals" as any)
          .select("lead_id, product_id, status, closed_at, deal_value")
          .eq("organization_id", orgId)
          .in("lead_id", safeLeadIds),
        supabase.from("deals" as any)
          .select("lead_id, product_id, closed_at")
          .eq("organization_id", orgId)
          .eq("status", "won")
          .order("closed_at", { ascending: true })
          .limit(300),
        safeLeadIds.length > 0
          ? supabase.from("leads" as any)
              .select("id, product_id")
              .in("id", safeLeadIds)
          : Promise.resolve({ data: [] }),
      ]);

      // Popula os mapas de enriquecimento
      for (const l of (leadsRes.data ?? []) as any[]) {
        leadToProduct.set(l.id, l.product_id ?? null);
      }

      const dealRows = (dealsRes.data ?? []) as any[];
      for (const d of dealRows) {
        if (d.status === "won" && d.closed_at && d.closed_at > wonCutoff) {
          wonLeadIds.add(d.lead_id);
        } else if (!["won", "lost", "cancelled"].includes(d.status ?? "")) {
          negotiatingLeadIds.add(d.lead_id);
          // guarda o valor do deal aberto mais alto por lead
          const existing = leadToDealValue.get(d.lead_id) ?? 0;
          if ((d.deal_value ?? 0) > existing) leadToDealValue.set(d.lead_id, d.deal_value ?? 0);
        }
      }

      // ── Etapa 6: recompra com ciclo calculado de dados reais ──────────────
      const avgCycle = computeAvgRepurchaseCycle((allDealsRes.data ?? []) as any[]);
      hasRecompraData = avgCycle.size > 0;

      if (hasRecompraData) {
        // Latest won deal por lead+produto
        const latestWon = new Map<string, any>();
        for (const d of ((allDealsRes.data ?? []) as any[])) {
          const k = `${d.lead_id}:${d.product_id}`;
          if (!latestWon.has(k) || d.closed_at > latestWon.get(k).closed_at) {
            latestWon.set(k, d);
          }
        }
        const now = Date.now();
        for (const [, d] of latestWon.entries()) {
          if (!leadIds.includes(d.lead_id)) continue; // só leads que têm conversa aberta
          const cycle = avgCycle.get(d.product_id);
          if (!cycle) continue; // sem ciclo calculado → não marca azul
          const daysSince = (now - new Date(d.closed_at).getTime()) / 86_400_000;
          if (daysSince >= cycle * 0.75) recompraLeadIds.add(d.lead_id);
        }
      }
    }
    if (!mountedRef.current) return;

    // ── 3. Produtos (opcional — falha graciosamente) ──────────────────────
    let productMap = new Map<string, string>();
    let products: ProductItem[] = [];
    try {
      const { data: productsData } = await supabase
        .from("products" as any)
        .select("id, name")
        .eq("organization_id", orgId)
        .order("name");
      productMap = new Map((productsData ?? []).map((p: any) => [p.id, p.name as string]));
      products   = (productsData ?? []).map((p: any) => ({ id: p.id, name: p.name }));
    } catch { /* produtos são opcionais — sem eles os filtros ficam sem dropdown */ }

    if (!mountedRef.current) return;

    // ── 4. Constrói RealConv com cor derivada de dado real ─────────────────
    const realConvs: RealConv[] = convs.map((conv: any) => {
      const { color, size, urgency } = computeConvColor(conv, wonLeadIds, negotiatingLeadIds, recompraLeadIds);
      const lastMsg = conv.last_inbound_at ?? conv.last_message_at;
      const minsWaiting = lastMsg
        ? Math.round((Date.now() - new Date(lastMsg).getTime()) / 60_000)
        : null;
      const ch = (conv.channel ?? "webchat").toLowerCase();
      const chLabel: Record<string,string> = { whatsapp:"WhatsApp", instagram:"Instagram", webchat:"WebChat", email:"E-mail" };
      const productId   = conv.lead_id ? (leadToProduct.get(conv.lead_id) ?? null) : null;
      const productName = productId ? (productMap.get(productId) ?? null) : null;
      const dealValue   = conv.lead_id ? (leadToDealValue.get(conv.lead_id) ?? null) : null;
      return {
        id:             conv.id,
        channel:        conv.channel ?? "webchat",
        status:         conv.status,
        visitorName:    conv.visitor_name ?? "Visitante",
        leadId:         conv.lead_id ?? null,
        assignedUserId: conv.assigned_user_id ?? null,
        currentAgentId: conv.current_agent_id ?? null,
        lastMsgAt:      conv.last_message_at ?? null,
        createdAt:      conv.created_at ?? null,
        color, dotSize: size, urgency,
        minsWaiting,
        productId, productName, dealValue,
        tooltipText: [
          conv.visitor_name ?? "Visitante",
          chLabel[ch] ?? ch,
          minsWaiting != null ? `${minsWaiting}min` : "—",
        ].join(" · "),
      } as RealConv;
    });

    // variável products já declarada acima

    // ── 4. Profiles de TODOS os membros da org (não só dos assigned) ──────
    // Carrega por orgId para garantir nomes reais mesmo quando assigned_user_id
    // não bate com os IDs retornados por convs individuais.
    const profileMap = new Map<string, string>();
    {
      const { data: profRows } = await supabase
        .from("profiles" as any)
        .select("id, full_name")
        .eq("organization_id", orgId);
      for (const p of ((profRows ?? []) as any[])) {
        if (p.id && p.full_name) profileMap.set(p.id, p.full_name);
      }
    }
    if (!mountedRef.current) return;

    // ── 5. Agentes de IA ativos ────────────────────────────────────────────
    const { data: agentRows } = await supabase
      .from("product_agents" as any)
      .select("id, name, agent_type, is_active")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name");

    const activeAgentIds = new Set((agentRows ?? []).map((a: any) => a.id));
    if (!mountedRef.current) return;

    // ── 6. Agrupa conversas ────────────────────────────────────────────────
    const sellerMap = new Map<string, RealConv[]>();
    const agentMap  = new Map<string, RealConv[]>();
    const unassigned: RealConv[] = [];

    for (const conv of realConvs) {
      if (conv.currentAgentId && activeAgentIds.has(conv.currentAgentId)) {
        const arr = agentMap.get(conv.currentAgentId) ?? [];
        arr.push(conv);
        agentMap.set(conv.currentAgentId, arr);
      } else if (conv.assignedUserId) {
        const arr = sellerMap.get(conv.assignedUserId) ?? [];
        arr.push(conv);
        sellerMap.set(conv.assignedUserId, arr);
      } else {
        unassigned.push(conv);
      }
    }

    const byUrgency = (a: RealConv, b: RealConv) => b.urgency - a.urgency;

    const sellers: SellerNode[] = [...sellerMap.entries()].map(([pid, convs]) => ({
      profileId: pid,
      name:      profileMap.get(pid) ?? pid,
      convs:     convs.sort(byUrgency),
    }));

    const agents: AgentNode[] = (agentRows ?? [])
      .map((agent: any) => ({
        agentId:   agent.id,
        name:      agent.name,
        agentType: agent.agent_type ?? "custom",
        convs:     (agentMap.get(agent.id) ?? []).sort(byUrgency),
      }))
      .filter((a: AgentNode) => a.convs.length > 0); // só mostra agentes com convs ativas

    if (mountedRef.current) {
      setData({
        sellers,
        agents,
        unassigned:  unassigned.sort(byUrgency),
        allConvs:    realConvs,
        totalOpen:   realConvs.length,
        loading:     false,
        lastFetch:   new Date(),
        isLive: false,
        profileMap,
        products,
      });
    }
  }, [orgId]);

  // ── Carga inicial + fallback de refresh ──────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    load();
    const timer = setInterval(load, 30_000);
    return () => { mountedRef.current = false; clearInterval(timer); };
  }, [load]);

  // ── Realtime com debounce de 2.5s ─────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`cerebro-live-${orgId}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "webchat_conversations", filter: `organization_id=eq.${orgId}` },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => { load(); }, 2500);
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    realtimeRef.current = channel;
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
      setIsLive(false);
    };
  }, [orgId, load]);

  return { ...data, isLive, refresh: load };
}
