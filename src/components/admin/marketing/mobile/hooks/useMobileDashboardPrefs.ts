import { useCallback, useEffect, useState } from 'react';

export type MobileKpiKey =
  | 'spend' | 'impressions' | 'clicks' | 'ctr'
  | 'cpc' | 'cpm' | 'leads' | 'cpl'
  | 'conversas' | 'purchases' | 'revenue' | 'roas';

export const MOBILE_KPI_META: Record<MobileKpiKey, { label: string; hint: string }> = {
  spend:       { label: 'Investimento',  hint: 'Valor gasto no período' },
  impressions: { label: 'Impressões',    hint: 'Total de exibições' },
  clicks:      { label: 'Cliques',       hint: 'Cliques no anúncio' },
  ctr:         { label: 'CTR',           hint: 'Taxa de clique' },
  cpc:         { label: 'CPC',           hint: 'Custo por clique' },
  cpm:         { label: 'CPM',           hint: 'Custo por mil impressões' },
  leads:       { label: 'Leads',         hint: 'Cliques no WhatsApp' },
  cpl:         { label: 'CPL',           hint: 'Custo por lead' },
  conversas:   { label: 'Conversas',     hint: 'Conversas iniciadas' },
  purchases:   { label: 'Compras',       hint: 'Compras registradas' },
  revenue:     { label: 'Receita',       hint: 'Receita atribuída' },
  roas:        { label: 'ROAS',          hint: 'Retorno sobre gasto' },
};

const DEFAULT_ORDER: MobileKpiKey[] = [
  'spend', 'leads', 'cpl', 'roas',
  'impressions', 'clicks', 'ctr', 'cpc',
  'cpm', 'conversas', 'purchases', 'revenue',
];

const DEFAULT_HIDDEN: MobileKpiKey[] = [];

const STORAGE_KEY = 'vendus.mkt.mobile.kpi-prefs.v1';

type Prefs = { order: MobileKpiKey[]; hidden: MobileKpiKey[] };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN };
    const p = JSON.parse(raw) as Prefs;
    // sanitize
    const validOrder = p.order?.filter((k) => (k as any) in MOBILE_KPI_META) ?? DEFAULT_ORDER;
    const known = new Set<MobileKpiKey>(validOrder);
    // preserva novos KPIs adicionados no futuro
    for (const k of DEFAULT_ORDER) if (!known.has(k)) validOrder.push(k);
    return {
      order: validOrder,
      hidden: (p.hidden ?? []).filter((k) => (k as any) in MOBILE_KPI_META),
    };
  } catch {
    return { order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN };
  }
}

export function useMobileDashboardPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => load());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs]);

  const toggle = useCallback((k: MobileKpiKey) => {
    setPrefs((p) => {
      const hidden = new Set(p.hidden);
      if (hidden.has(k)) hidden.delete(k); else hidden.add(k);
      return { ...p, hidden: [...hidden] };
    });
  }, []);

  const reset = useCallback(() => setPrefs({ order: DEFAULT_ORDER, hidden: DEFAULT_HIDDEN }), []);

  const visible = prefs.order.filter((k) => !prefs.hidden.includes(k));

  return { order: prefs.order, hidden: prefs.hidden, visible, toggle, reset };
}
