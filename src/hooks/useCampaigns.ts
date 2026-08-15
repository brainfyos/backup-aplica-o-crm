import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type Campaign = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  channel: string;
  status: 'draft' | 'preparing' | 'active' | 'paused' | 'completed' | 'cancelled';
  agent_id: string | null;
  audience_filters: any;
  exclusion_filters: any;
  contexts: any[];
  context_distribution: string;
  instance_strategy: string;
  instance_distribution: any[];
  speed_preset: string;
  speed_config: any;
  schedule_type: string;
  scheduled_at: string | null;
  recurrence: any;
  post_response_actions: any;
  tags_on_response: string[];
  totals: { audience?: number; will_receive?: number; excluded?: number };
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type CampaignPreparation = {
  campaign_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  total_contacts: number;
  processed_contacts: number;
  error: string | null;
};

export type CampaignStats = {
  total: number; queued: number; sending: number; sent: number;
  responded: number; failed: number; skipped: number; cancelled: number;
};

export function useCampaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Record<string, CampaignStats>>({});
  const [preparations, setPreparations] = useState<Record<string, CampaignPreparation>>({});
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setOrgId(data?.organization_id ?? null));
  }, [user]);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    const list = (data as any[]) ?? [];
    setCampaigns(list);

    if (list.length) {
      const ids = list.map((c) => c.id);
      const [statsRes, { data: prepJobs }] = await Promise.all([
        supabase.rpc('get_campaign_stats_for_org', { p_org: orgId }),
        supabase
          .from('campaign_preparation_jobs')
          .select('campaign_id, status, total_contacts, processed_contacts, error')
          .in('campaign_id', ids)
          .in('status', ['pending', 'running', 'failed'])
          .order('created_at', { ascending: false }),
      ]);
      const agg: Record<string, CampaignStats> = {};
      ids.forEach((id) => {
        agg[id] = { total: 0, queued: 0, sending: 0, sent: 0, responded: 0, failed: 0, skipped: 0, cancelled: 0 };
      });
      ((statsRes.data as any[]) ?? []).forEach((row: any) => {
        const a = agg[row.campaign_id];
        if (!a) return;
        const n = Number(row.cnt) || 0;
        a.total += n;
        if ((a as any)[row.status] !== undefined) (a as any)[row.status] = n;
      });
      setStats(agg);

      const prepMap: Record<string, CampaignPreparation> = {};
      (prepJobs ?? []).forEach((j: any) => {
        if (!prepMap[j.campaign_id]) prepMap[j.campaign_id] = j;
      });
      setPreparations(prepMap);
    } else {
      setStats({});
      setPreparations({});
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    const ch = supabase
      .channel('campaigns-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaigns', filter: `organization_id=eq.${orgId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_preparation_jobs', filter: `organization_id=eq.${orgId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, refresh]);

  return { campaigns, stats, preparations, loading, refresh, orgId };
}

export function useCampaignTargets(campaignId: string | null) {
  const [targets, setTargets] = useState<any[]>([]);
  const [counts, setCounts] = useState({ queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, responded: 0, cancelled: 0 });

  const refresh = useCallback(async () => {
    if (!campaignId) return;
    const [{ data }, countsRes] = await Promise.all([
      supabase
        .from('campaign_targets')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('scheduled_for', { ascending: true })
        .limit(500),
      supabase.rpc('get_campaign_target_counts', { p_campaign: campaignId }),
    ]);
    setTargets(data ?? []);
    const c = { queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, responded: 0, cancelled: 0 };
    ((countsRes.data as any[]) ?? []).forEach((row: any) => {
      if ((c as any)[row.status] !== undefined) (c as any)[row.status] = Number(row.cnt) || 0;
    });
    setCounts(c);
  }, [campaignId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!campaignId) return;
    const ch = supabase
      .channel(`campaign-targets-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_targets', filter: `campaign_id=eq.${campaignId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [campaignId, refresh]);

  return { targets, counts, refresh };
}
