import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type MiaActionStatus =
  | "draft" | "waiting_confirmation" | "approved"
  | "executed" | "cancelled" | "failed" | "revertida";

export interface MiaAction {
  id:              string;
  organization_id: string;
  user_id:         string;
  action_type:     string;
  payload:         any;
  preview:         string;
  status:          MiaActionStatus;
  risk_level?:     string;
  result:          any;
  error_message:   string | null;
  created_at:      string;
  updated_at:      string;
  executed_at:     string | null;
  cancelled_at:    string | null;
  // Fase 0: governança
  autonomy_level:    string | null;
  requires_approval: boolean;
  approved_by:       string | null;
  approved_at:       string | null;
  undo_payload:      any | null;
  target_type:       string | null;
  target_id:         string | null;
}

export function useMiaActions(enabled = true) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [actions, setActions] = useState<MiaAction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!orgId || !enabled) {
      setActions([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("mia_actions" as any)
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    setActions((data as any) ?? []);
    setLoading(false);
  }, [orgId, enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime
  useEffect(() => {
    if (!orgId || !enabled) return;
    const channel = supabase
      .channel(`mia-actions-${orgId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "mia_actions", filter: `organization_id=eq.${orgId}` },
        () => { refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, enabled, refresh]);

  const pending = useMemo(
    () => actions.filter(a => a.status === "waiting_confirmation" || a.status === "draft" || a.status === "approved"),
    [actions],
  );
  const recent = useMemo(
    () => actions.filter(a => ["executed","failed","cancelled","revertida"].includes(a.status)).slice(0, 20),
    [actions],
  );
  // Alias para compatibilidade com Central de Decisões
  const history = recent;

  const confirm = useCallback(async (id: string) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mia-execute-action`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action_id: id }),
    });
    const j = await r.json();
    if (!r.ok || !j?.ok) {
      toast.error(j?.error || j?.message || "Falha ao executar");
      return false;
    }
    toast.success("Ação executada");
    return true;
  }, []);

  const cancel = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("mia_actions" as any)
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Ação cancelada");
    return true;
  }, []);

  return { actions, pending, recent, history, loading, refresh, confirm, cancel };
}
