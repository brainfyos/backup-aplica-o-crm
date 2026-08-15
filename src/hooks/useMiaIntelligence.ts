import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-tools`;

async function callTool(token: string, tool: string, args: any = {}) {
  try {
    const r = await fetch(FN_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
    });
    const j = await r.json().catch(() => null);
    return j?.data ?? null;
  } catch {
    return null;
  }
}

export interface MiaIntelData {
  summary:      any | null;
  team:         any | null;
  pipeline:     any | null;
  hotLeads:     any | null;
  overdueTasks: any | null;
  unanswered:   any | null;
  knowledge:    any[];
  loading:      boolean;
  lastFetch:    Date | null;
  orgId:        string | null;
}

const EMPTY: MiaIntelData = {
  summary: null, team: null, pipeline: null,
  hotLeads: null, overdueTasks: null, unanswered: null,
  knowledge: [], loading: true, lastFetch: null, orgId: null,
};

export function useMiaIntelligence() {
  const [data, setData] = useState<MiaIntelData>(EMPTY);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token || !mountedRef.current) return;

    setData(prev => ({ ...prev, loading: true }));

    const [summary, team, pipeline, hotLeads, overdueTasks, unanswered] = await Promise.all([
      callTool(token, "get_operation_summary"),
      callTool(token, "get_team_status"),
      callTool(token, "get_pipeline_context"),
      callTool(token, "get_hot_leads"),
      callTool(token, "get_overdue_tasks"),
      callTool(token, "get_unanswered_conversations"),
    ]);

    let knowledge: any[] = [];
    let orgId: string | null = null;
    try {
      const { data: prof } = await supabase
        .from("profiles" as any)
        .select("organization_id")
        .eq("id", session.session.user.id)
        .maybeSingle();
      orgId = (prof as any)?.organization_id ?? null;
      if (orgId) {
        const { data: kn } = await supabase
          .from("mia_business_knowledge" as any)
          .select("*")
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .order("occurrences", { ascending: false })
          .limit(20);
        knowledge = (kn as any[]) ?? [];
      }
    } catch {}

    if (!mountedRef.current) return;
    setData({
      summary, team, pipeline, hotLeads, overdueTasks, unanswered,
      knowledge, loading: false, lastFetch: new Date(), orgId,
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const id = setInterval(refresh, 120_000);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [refresh]);

  return { ...data, refresh };
}
