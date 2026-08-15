import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UsageFilters {
  startDate: string; // ISO
  endDate: string;   // ISO
  provider?: string | null;
  organizationId?: string | null;
}

export interface UsageSummary {
  total_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  unique_orgs: number;
  by_provider: Record<string, { calls: number; prompt_tokens: number; completion_tokens: number; total_tokens: number }>;
}

export interface UsageTimeseriesPoint {
  day: string;
  provider: string;
  calls: number;
  total_tokens: number;
}

export interface UsageByOrg {
  organization_id: string | null;
  org_name: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface UsageByModel {
  provider: string;
  model: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface UsageByKey {
  platform_key_id: string | null;
  key_label: string;
  provider: string;
  calls: number;
  total_tokens: number;
}

function args(f: UsageFilters) {
  return {
    p_start: f.startDate,
    p_end: f.endDate,
    p_provider: f.provider || null,
    p_org_id: f.organizationId || null,
  };
}

export function useAIUsageSummary(f: UsageFilters) {
  return useQuery({
    queryKey: ['ai-usage-summary', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_usage_summary' as any, args(f));
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as UsageSummary;
    },
  });
}

export function useAIUsageTimeseries(f: UsageFilters) {
  return useQuery({
    queryKey: ['ai-usage-timeseries', f],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_usage_timeseries' as any, args(f));
      if (error) throw error;
      return (data ?? []) as UsageTimeseriesPoint[];
    },
  });
}

export function useAIUsageByOrg(f: UsageFilters, limit = 10) {
  return useQuery({
    queryKey: ['ai-usage-by-org', f, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_usage_by_org' as any, {
        p_start: f.startDate, p_end: f.endDate, p_provider: f.provider || null, p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as UsageByOrg[];
    },
  });
}

export function useAIUsageByModel(f: UsageFilters, limit = 30) {
  return useQuery({
    queryKey: ['ai-usage-by-model', f, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_usage_by_model' as any, {
        p_start: f.startDate, p_end: f.endDate, p_provider: f.provider || null, p_org_id: f.organizationId || null, p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as UsageByModel[];
    },
  });
}

export function useAIUsageByKey(f: UsageFilters, limit = 30) {
  return useQuery({
    queryKey: ['ai-usage-by-key', f, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_usage_by_key' as any, {
        p_start: f.startDate, p_end: f.endDate, p_provider: f.provider || null, p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as UsageByKey[];
    },
  });
}
