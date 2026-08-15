import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TrackingSettings {
  enabled: boolean;
  allowed_domains: string[];
  allow_localhost: boolean;
}

export interface TrackingOrgInfo {
  id: string;
  tracking_public_key: string | null;
  tracking_settings: TrackingSettings;
}

const DEFAULT_SETTINGS: TrackingSettings = { enabled: true, allowed_domains: [], allow_localhost: false };

export function useTrackingOrg(organizationId?: string) {
  return useQuery({
    queryKey: ['tracking-org', organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<TrackingOrgInfo | null> => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, tracking_public_key, tracking_settings')
        .eq('id', organizationId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: (data as any).id,
        tracking_public_key: (data as any).tracking_public_key,
        tracking_settings: { ...DEFAULT_SETTINGS, ...((data as any).tracking_settings || {}) },
      };
    },
  });
}

export function useRegenerateTrackingKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data, error } = await supabase.rpc('regenerate_tracking_key', { p_org_id: organizationId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_d, orgId) => qc.invalidateQueries({ queryKey: ['tracking-org', orgId] }),
  });
}

export function useUpdateTrackingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, settings }: { organizationId: string; settings: TrackingSettings }) => {
      const { data, error } = await supabase.rpc('update_tracking_settings', {
        p_org_id: organizationId,
        p_settings: settings as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['tracking-org', v.organizationId] }),
  });
}

export function useTrackingStatus(organizationId?: string) {
  return useQuery({
    queryKey: ['tracking-status', organizationId],
    enabled: !!organizationId,
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [visitorsRes, eventsRes, lastEvtRes] = await Promise.all([
        supabase
          .from('tracking_visitors')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId!)
          .gte('last_seen_at', since),
        supabase
          .from('tracking_events')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId!)
          .gte('created_at', since),
        supabase
          .from('tracking_events')
          .select('id, event_name, event_id, hostname, page_url, referrer, created_at, visitor_id, lead_id, first_touch, last_touch, properties')
          .eq('organization_id', organizationId!)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      return {
        visitors_24h: visitorsRes.count ?? 0,
        events_24h: eventsRes.count ?? 0,
        recent_events: (lastEvtRes.data ?? []) as any[],
      };
    },
  });
}
