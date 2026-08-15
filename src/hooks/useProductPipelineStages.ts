import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PipelineStage {
  id: string;
  product_id: string;
  name: string;
  color: string | null;
  order_index: number;
}

export function useProductPipelineStages(productId?: string) {
  return useQuery({
    queryKey: ['pipeline-stages', productId],
    enabled: !!productId,
    queryFn: async (): Promise<PipelineStage[]> => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, product_id, name, color, order_index')
        .eq('product_id', productId!)
        .order('order_index');
      if (error) throw error;
      return (data as PipelineStage[]) || [];
    },
  });
}
