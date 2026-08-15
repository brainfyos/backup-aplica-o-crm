import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CampaignContext = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  objective: string | null;
  tone: string | null;
  cta: string | null;
  instructions: string;
  usage_count: number;
  created_at: string;
};

export function useContextLibrary(orgId: string | null) {
  const [contexts, setContexts] = useState<CampaignContext[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from('campaign_contexts')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    setContexts((data as any) ?? []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { contexts, loading, refresh };
}
