import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ConversionDefinition = {
  id: string;
  external_id: string;
  name: string;
  kind: 'custom' | 'standard';
  category: string | null;
  pixel_id: string | null;
  is_primary: boolean;
  mapped_stage_id: string | null;
  count_30d: number;
  value_30d: number;
};

export function useConversionDefinitions(orgId: string | null) {
  const [data, setData] = useState<ConversionDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) { setData([]); return; }
    setLoading(true);
    const { data: rows, error } = await (supabase as any).rpc('rpc_marketing_conversion_options', { p_org_id: orgId });
    if (!error && rows) setData(rows as ConversionDefinition[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { reload(); }, [reload]);

  return { conversions: data, loading, reload };
}

export async function setConversionPrimary(orgId: string, id: string) {
  await (supabase.from('marketing_conversion_definitions') as any)
    .update({ is_primary: false }).eq('organization_id', orgId).eq('is_primary', true);
  return (supabase.from('marketing_conversion_definitions') as any)
    .update({ is_primary: true }).eq('id', id);
}

export async function setConversionStageMap(id: string, stageId: string | null) {
  return (supabase.from('marketing_conversion_definitions') as any)
    .update({ mapped_stage_id: stageId }).eq('id', id);
}

export async function setConversionActive(id: string, active: boolean) {
  return (supabase.from('marketing_conversion_definitions') as any)
    .update({ is_active: active }).eq('id', id);
}
