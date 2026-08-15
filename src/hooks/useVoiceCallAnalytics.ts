import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type Period = '24h' | '7d' | '30d' | 'mtd' | 'all';

export function periodRange(period: Period): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  switch (period) {
    case '24h': from.setDate(to.getDate() - 1); break;
    case '7d': from.setDate(to.getDate() - 7); break;
    case '30d': from.setDate(to.getDate() - 30); break;
    case 'mtd': from.setDate(1); from.setHours(0, 0, 0, 0); break;
    case 'all': from.setFullYear(2000); break;
  }
  return { from, to };
}

export interface VoiceCallKpis {
  views_unique: number;
  views_total: number;
  calls_started: number;
  calls_completed: number;
  total_seconds: number;
  avg_seconds: number;
  cost_usd: number;
  schedules: number;
  link_clicks: number;
  whatsapp_clicks: number;
  interest_clicks: number;
  leads_captured: number;
  leads_new: number;
}

export function useVoiceCallKpis(period: Period = '30d') {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const { from, to } = periodRange(period);
  return useQuery({
    queryKey: ['voice-call-kpis', orgId, period],
    enabled: !!orgId,
    queryFn: async (): Promise<VoiceCallKpis> => {
      const { data, error } = await supabase.rpc('voice_call_kpis' as any, {
        p_org: orgId, p_from: from.toISOString(), p_to: to.toISOString(),
      });
      if (error) throw error;
      const row = (data as any[])?.[0] || {};
      return {
        views_unique: Number(row.views_unique || 0),
        views_total: Number(row.views_total || 0),
        calls_started: Number(row.calls_started || 0),
        calls_completed: Number(row.calls_completed || 0),
        total_seconds: Number(row.total_seconds || 0),
        avg_seconds: Number(row.avg_seconds || 0),
        cost_usd: Number(row.cost_usd || 0),
        schedules: Number(row.schedules || 0),
        link_clicks: Number(row.link_clicks || 0),
        whatsapp_clicks: Number(row.whatsapp_clicks || 0),
        interest_clicks: Number(row.interest_clicks || 0),
        leads_captured: Number(row.leads_captured || 0),
        leads_new: Number(row.leads_new || 0),
      };
    },
  });
}

export interface VoiceCallTrendRow {
  day: string; views: number; calls: number; minutes: number; schedules: number; cost_usd: number;
}

export function useVoiceCallTrend(period: Period = '30d') {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const { from, to } = periodRange(period);
  return useQuery({
    queryKey: ['voice-call-trend', orgId, period],
    enabled: !!orgId,
    queryFn: async (): Promise<VoiceCallTrendRow[]> => {
      const { data, error } = await supabase.rpc('voice_call_trend' as any, {
        p_org: orgId, p_from: from.toISOString(), p_to: to.toISOString(),
      });
      if (error) throw error;
      return (data as any[] ?? []).map((r) => ({
        day: r.day,
        views: Number(r.views || 0),
        calls: Number(r.calls || 0),
        minutes: Number(r.minutes || 0),
        schedules: Number(r.schedules || 0),
        cost_usd: Number(r.cost_usd || 0),
      }));
    },
  });
}

export interface UsageByMonthRow {
  month: string; calls: number; minutes: number;
  audio_sec_in: number; audio_sec_out: number;
  tokens_in: number; tokens_out: number;
  cost_grok: number; cost_openai: number; cost_total: number;
}

export function useVoiceUsageByMonth() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  return useQuery({
    queryKey: ['voice-usage-month', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<UsageByMonthRow[]> => {
      const { data, error } = await supabase.rpc('voice_call_usage_by_month' as any, { p_org: orgId });
      if (error) throw error;
      return (data as any[] ?? []).map((r) => ({
        month: r.month,
        calls: Number(r.calls || 0),
        minutes: Number(r.minutes || 0),
        audio_sec_in: Number(r.audio_sec_in || 0),
        audio_sec_out: Number(r.audio_sec_out || 0),
        tokens_in: Number(r.tokens_in || 0),
        tokens_out: Number(r.tokens_out || 0),
        cost_grok: Number(r.cost_grok || 0),
        cost_openai: Number(r.cost_openai || 0),
        cost_total: Number(r.cost_total || 0),
      }));
    },
  });
}

export interface UsageByDimRow {
  key: string; label: string; calls: number; minutes: number;
  cost_grok: number; cost_openai: number; cost_total: number;
}

export function useVoiceUsageByDim(dim: 'voice_call' | 'agent' | 'provider', period: Period = 'mtd') {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const { from, to } = periodRange(period);
  return useQuery({
    queryKey: ['voice-usage-dim', orgId, dim, period],
    enabled: !!orgId,
    queryFn: async (): Promise<UsageByDimRow[]> => {
      const { data, error } = await supabase.rpc('voice_call_usage_by_dim' as any, {
        p_org: orgId, p_dim: dim, p_from: from.toISOString(), p_to: to.toISOString(),
      });
      if (error) throw error;
      return (data as any[] ?? []).map((r) => ({
        key: r.key,
        label: r.label,
        calls: Number(r.calls || 0),
        minutes: Number(r.minutes || 0),
        cost_grok: Number(r.cost_grok || 0),
        cost_openai: Number(r.cost_openai || 0),
        cost_total: Number(r.cost_total || 0),
      }));
    },
  });
}

// Sessões detalhadas para a aba Histórico
export interface VoiceSessionRow {
  id: string;
  voice_call_id: string;
  voice_call_name: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_created_at: string | null;
  captured_data: Record<string, any>;
  ctas_clicked: any[];
  tags_applied: any[];
  ai_analysis: any;
  duration_sec: number;
  cost_usd_estimated: number;
  cost_usd_reported: number | null;
  provider: string | null;
  voice_id: string | null;
  model: string | null;
  outcome: string | null;
  started_at: string;
  ended_at: string | null;
  utms: Record<string, any>;
  transcript: any[];
  audio_seconds_in: number;
  audio_seconds_out: number;
  tokens_in: number;
  tokens_out: number;
  pricing_snapshot: any;
}

export function useVoiceSessions(period: Period = '30d', voiceCallId?: string | null) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const { from, to } = periodRange(period);
  return useQuery({
    queryKey: ['voice-sessions-history', orgId, period, voiceCallId],
    enabled: !!orgId,
    queryFn: async (): Promise<VoiceSessionRow[]> => {
      let q = supabase
        .from('voice_call_sessions')
        .select(`
          id, voice_call_id, lead_id, captured_data, ctas_clicked, tags_applied, ai_analysis,
          duration_sec, cost_usd_estimated, cost_usd_reported, provider, voice_id, model,
          outcome, started_at, ended_at, utms, transcript,
          audio_seconds_in, audio_seconds_out, tokens_in, tokens_out, pricing_snapshot,
          voice_calls!inner(name),
          leads(name, created_at)
        `)
        .eq('organization_id', orgId!)
        .gte('started_at', from.toISOString())
        .order('started_at', { ascending: false })
        .limit(500);
      if (voiceCallId) q = q.eq('voice_call_id', voiceCallId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[] ?? []).map((r) => ({
        id: r.id,
        voice_call_id: r.voice_call_id,
        voice_call_name: r.voice_calls?.name || '—',
        lead_id: r.lead_id,
        lead_name: r.leads?.name || null,
        lead_created_at: r.leads?.created_at || null,
        captured_data: r.captured_data || {},
        ctas_clicked: Array.isArray(r.ctas_clicked) ? r.ctas_clicked : [],
        tags_applied: Array.isArray(r.tags_applied) ? r.tags_applied : [],
        ai_analysis: r.ai_analysis || null,
        duration_sec: Number(r.duration_sec || 0),
        cost_usd_estimated: Number(r.cost_usd_estimated || 0),
        cost_usd_reported: r.cost_usd_reported != null ? Number(r.cost_usd_reported) : null,
        provider: r.provider,
        voice_id: r.voice_id,
        model: r.model,
        outcome: r.outcome,
        started_at: r.started_at,
        ended_at: r.ended_at,
        utms: r.utms || {},
        transcript: Array.isArray(r.transcript) ? r.transcript : [],
        audio_seconds_in: Number(r.audio_seconds_in || 0),
        audio_seconds_out: Number(r.audio_seconds_out || 0),
        tokens_in: Number(r.tokens_in || 0),
        tokens_out: Number(r.tokens_out || 0),
        pricing_snapshot: r.pricing_snapshot || null,
      }));
    },
  });
}
