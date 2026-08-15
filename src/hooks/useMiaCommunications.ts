import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface MiaCommunication {
  id: string;
  organization_id: string;
  requested_by: string;
  action_id: string | null;
  channel: string;
  recipient_type: string | null;
  recipient_id: string | null;
  recipient_label: string | null;
  draft: any;
  final_message: any;
  risk_level: string;
  status: string;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
  delivered_at: string | null;
}

export function useMiaCommunications(limit = 50) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const [items, setItems] = useState<MiaCommunication[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from("mia_communications")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);
    setItems((data ?? []) as MiaCommunication[]);
    setLoading(false);
  }, [orgId, limit]);

  useEffect(() => {
    load();
    if (!orgId) return;
    const ch = supabase
      .channel(`mia_comm_${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mia_communications", filter: `organization_id=eq.${orgId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, load]);

  return { items, loading, reload: load };
}
