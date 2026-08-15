import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProductStats {
  product_id: string;
  total_leads: number;
  sellers_count: number;
  won_count: number;
  won_value: number;
}

export function useProductsStats(organizationId?: string | null) {
  return useQuery({
    queryKey: ['products-stats', organizationId],
    enabled: !!organizationId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_products_stats', {
        _organization_id: organizationId!,
      });
      if (error) throw error;
      const map = new Map<string, ProductStats>();
      (data ?? []).forEach((row: any) => {
        map.set(row.product_id, {
          product_id: row.product_id,
          total_leads: Number(row.total_leads ?? 0),
          sellers_count: Number(row.sellers_count ?? 0),
          won_count: Number(row.won_count ?? 0),
          won_value: Number(row.won_value ?? 0),
        });
      });
      return map;
    },
  });
}
