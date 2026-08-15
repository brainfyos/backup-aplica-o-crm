import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type MiaOpportunityCategory =
  | 'ready_to_close'
  | 'high_potential'
  | 'needs_human'
  | 'at_risk'
  | 'nurture'
  | 'unqualified';

export interface MiaEvidence {
  quote: string;
  meaning: string;
  speaker?: string;
}

export interface MiaOpenConversationAssessment {
  conversation_id: string;
  organization_id: string;
  lead_id: string | null;
  visitor_name: string | null;
  channel: string | null;
  conversation_status: string | null;
  owner_id: string | null;
  owner_name: string | null;
  product_id: string | null;
  product_name: string | null;
  deal_id: string | null;
  deal_value: number | null;
  category: MiaOpportunityCategory;
  intent_score: number;
  close_probability: number;
  urgency_score: number;
  confidence: number;
  sentiment: 'positivo' | 'neutro' | 'negativo' | 'misto';
  summary: string;
  purchase_signals: string[];
  objections: string[];
  risks: string[];
  missing_information: string[];
  next_best_action: string;
  suggested_reply: string | null;
  evidence: MiaEvidence[];
  source_last_message_at: string | null;
  source_message_count: number;
  messages_analyzed: number;
  transcript_truncated: boolean;
  analysis_version: string;
  model_used: string | null;
  analyzed_at: string;
}

export interface MiaOpenReportRun {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  open_total: number;
  queued_total: number;
  processed_total: number;
  failed_total: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface MiaOpenConversationsReport {
  generated_at: string | null;
  coverage: {
    open_total: number;
    analyzed_fresh: number;
    pending_or_stale: number;
    percent: number;
  };
  summary: Record<MiaOpportunityCategory, number> & {
    potential_pipeline_value: number;
  };
  run: MiaOpenReportRun | null;
  conversations: MiaOpenConversationAssessment[];
}

const EMPTY_REPORT: MiaOpenConversationsReport = {
  generated_at: null,
  coverage: { open_total: 0, analyzed_fresh: 0, pending_or_stale: 0, percent: 0 },
  summary: {
    ready_to_close: 0,
    high_potential: 0,
    needs_human: 0,
    at_risk: 0,
    nurture: 0,
    unqualified: 0,
    potential_pipeline_value: 0,
  },
  run: null,
  conversations: [],
};

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_CYCLES = 120;

function messageFromError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Não foi possível carregar o relatório da Mia.';
}

function isActive(run: MiaOpenReportRun | null | undefined): boolean {
  return run?.status === 'queued' || run?.status === 'running';
}

async function invoke(
  action: 'latest' | 'start' | 'process',
  runId?: string,
  maxConversations?: number,
  conversationIds?: string[],
) {
  const { data, error } = await supabase.functions.invoke('mia-open-conversations-report', {
    body: {
      action,
      ...(runId ? { run_id: runId } : {}),
      ...(maxConversations ? { max_conversations: maxConversations } : {}),
      ...(conversationIds?.length ? { conversation_ids: conversationIds } : {}),
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as { report?: MiaOpenConversationsReport; run?: MiaOpenReportRun };
}

export function useMiaOpenConversationsReport(enabled = true) {
  const [report, setReport] = useState<MiaOpenConversationsReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(enabled);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const executionRef = useRef(0);
  const analyzingRef = useRef(false);

  const loadLatest = useCallback(async (quiet = false) => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    if (!quiet) setLoading(true);
    try {
      const result = await invoke('latest');
      if (mountedRef.current && result.report) {
        setReport(result.report);
        setError(null);
      }
      return result.report ?? null;
    } catch (loadError) {
      if (mountedRef.current) setError(messageFromError(loadError));
      return null;
    } finally {
      if (mountedRef.current && !quiet) setLoading(false);
    }
  }, [enabled]);

  const processRun = useCallback(async (runId: string, execution: number) => {
    let current: MiaOpenConversationsReport | null = null;
    for (let cycle = 0; cycle < MAX_POLL_CYCLES; cycle += 1) {
      if (!mountedRef.current || executionRef.current !== execution) return current;
      if (document.visibilityState === 'hidden') {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      const result = await invoke('process', runId);
      current = result.report ?? null;
      if (current && mountedRef.current) setReport(current);
      if (!isActive(current?.run)) return current;
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error('A análise continua em segundo plano. Atualize o relatório em alguns minutos.');
  }, []);

  const runAnalysis = useCallback(async (maxConversations?: number, conversationIds?: string[]) => {
    if (!enabled || analyzingRef.current) return;
    analyzingRef.current = true;
    const execution = executionRef.current + 1;
    executionRef.current = execution;
    setAnalyzing(true);
    setError(null);
    try {
      const started = await invoke('start', undefined, maxConversations, conversationIds);
      if (started.report && mountedRef.current) setReport(started.report);
      const run = started.run ?? started.report?.run;
      if (run && isActive(run)) await processRun(run.id, execution);
      else await loadLatest(true);
    } catch (analysisError) {
      if (mountedRef.current && executionRef.current === execution) {
        setError(messageFromError(analysisError));
        await loadLatest(true);
      }
    } finally {
      analyzingRef.current = false;
      if (mountedRef.current && executionRef.current === execution) setAnalyzing(false);
    }
  }, [enabled, loadLatest, processRun]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setLoading(false);
      return () => { mountedRef.current = false; };
    }
    void (async () => {
      const latest = await loadLatest();
      if (!latest?.run || !isActive(latest.run) || !mountedRef.current) return;
      const execution = executionRef.current + 1;
      executionRef.current = execution;
      analyzingRef.current = true;
      setAnalyzing(true);
      try {
        await processRun(latest.run.id, execution);
      } catch (resumeError) {
        if (mountedRef.current && executionRef.current === execution) setError(messageFromError(resumeError));
      } finally {
        analyzingRef.current = false;
        if (mountedRef.current && executionRef.current === execution) setAnalyzing(false);
      }
    })();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !analyzingRef.current) void loadLatest(true);
    }, 60_000);
    return () => {
      mountedRef.current = false;
      executionRef.current += 1;
      analyzingRef.current = false;
      window.clearInterval(interval);
    };
  }, [enabled, loadLatest, processRun]);

  const assessmentMap = useMemo(
    () => new Map(report.conversations.map((assessment) => [assessment.conversation_id, assessment])),
    [report.conversations],
  );
  const progress = report.run?.queued_total
    ? Math.min(100, Math.round(((report.run.processed_total + report.run.failed_total) / report.run.queued_total) * 100))
    : report.coverage.percent;

  return {
    report,
    assessmentMap,
    loading,
    analyzing: analyzing || isActive(report.run),
    error,
    progress,
    refresh: loadLatest,
    runAnalysis,
  };
}
