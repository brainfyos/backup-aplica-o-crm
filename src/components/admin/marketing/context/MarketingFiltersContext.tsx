import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { MarketingFilters } from '../filters/MarketingFiltersBar';
import { useConversionDefinitions, type ConversionDefinition } from '@/hooks/useConversionDefinitions';
import { resolveSelectedConversion } from '../lib/conversionGoals';

type Ctx = {
  filters: MarketingFilters;
  orgId: string | null;
  metaCredentialId: string | null;
  selectedConversionId: string | null; // action_type (external_id)
  setSelectedConversionId: (v: string | null) => void;
  selectedConversion: ConversionDefinition | null;
  conversionHasValue: boolean;
};
const MarketingFiltersContext = createContext<Ctx | null>(null);

const storageKey = (org: string | null) => `marketing.selectedConversion.${org ?? 'anon'}`;

export function MarketingFiltersProvider({
  filters, orgId, metaCredentialId = null, children,
}: { filters: MarketingFilters; orgId: string | null; metaCredentialId?: string | null; children: ReactNode }) {
  const [selectedConversionId, setSel] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(storageKey(orgId));
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setSel(window.localStorage.getItem(storageKey(orgId)));
  }, [orgId]);

  const setSelectedConversionId = useCallback((v: string | null) => {
    setSel(v);
    if (typeof window !== 'undefined') {
      if (v) window.localStorage.setItem(storageKey(orgId), v);
      else window.localStorage.removeItem(storageKey(orgId));
    }
  }, [orgId]);

  const { conversions } = useConversionDefinitions(orgId);
  const selectedConversion = useMemo(() => {
    return resolveSelectedConversion(conversions, selectedConversionId);
  }, [conversions, selectedConversionId]);
  useEffect(() => {
    if (!selectedConversion || selectedConversion.external_id === selectedConversionId) return;
    setSelectedConversionId(selectedConversion.external_id);
  }, [selectedConversion, selectedConversionId, setSelectedConversionId]);
  const conversionHasValue = !!selectedConversion && Number(selectedConversion.value_30d) > 0;

  return (
    <MarketingFiltersContext.Provider value={{
      filters, orgId, metaCredentialId,
      selectedConversionId, setSelectedConversionId,
      selectedConversion, conversionHasValue,
    }}>
      {children}
    </MarketingFiltersContext.Provider>
  );
}

export function useMarketingCtx(): Ctx {
  const v = useContext(MarketingFiltersContext);
  if (!v) throw new Error('MarketingFiltersProvider missing');
  return v;
}

/** Data civil local. Não use toISOString aqui: ele pode deslocar o dia no Brasil. */
export const iso = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
