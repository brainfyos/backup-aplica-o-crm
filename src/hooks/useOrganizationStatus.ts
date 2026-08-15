import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOrganizationStatus() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const [status, setStatus] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!orgId) {
      setStatus(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("status")
        .eq("id", orgId)
        .maybeSingle();
      if (!cancelled) {
        setStatus((data as any)?.status ?? "active");
        setLoaded(true);
      }
    };
    load();

    const channel = supabase
      .channel(`org-status-${orgId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "organizations", filter: `id=eq.${orgId}` },
        (payload) => {
          const next = (payload.new as any)?.status;
          if (next) setStatus(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  return { status, isSuspended: loaded && status !== null && status !== "active", loaded };
}
