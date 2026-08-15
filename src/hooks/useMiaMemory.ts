import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface MiaFact { key: string; value: string; source?: string; created_at?: string }
export interface MiaMemory {
  id?: string;
  display_name: string | null;
  role_label: string | null;
  timezone: string | null;
  locale: string | null;
  preferences: Record<string, any>;
  facts: MiaFact[];
  updated_at?: string;
}

const DEFAULT: MiaMemory = {
  display_name: null, role_label: null, timezone: "America/Sao_Paulo", locale: "pt-BR",
  preferences: {}, facts: [],
};

export function useMiaMemory() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const userId = profile?.id;
  const [memory, setMemory] = useState<MiaMemory>(DEFAULT);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!orgId || !userId) return;
    setLoading(true);
    const { data } = await supabase.from("mia_user_memory" as any)
      .select("*").eq("user_id", userId).eq("organization_id", orgId).maybeSingle();
    setMemory(data ? { ...DEFAULT, ...(data as any), preferences: (data as any).preferences ?? {}, facts: (data as any).facts ?? [] } : DEFAULT);
    setLoading(false);
  }, [orgId, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsert = useCallback(async (patch: Partial<MiaMemory>) => {
    if (!orgId || !userId) return;
    const next = { ...memory, ...patch };
    const { data } = await supabase.from("mia_user_memory" as any)
      .upsert({ user_id: userId, organization_id: orgId, ...next }, { onConflict: "user_id,organization_id" })
      .select("*").maybeSingle();
    if (data) setMemory({ ...DEFAULT, ...(data as any), preferences: (data as any).preferences ?? {}, facts: (data as any).facts ?? [] });
  }, [memory, orgId, userId]);

  const addFact = useCallback(async (key: string, value: string) => {
    const k = key.trim().toLowerCase(); const v = value.trim();
    if (!k || !v) return;
    const facts = (memory.facts ?? []).filter((f) => f.key !== k);
    facts.push({ key: k, value: v, source: "manual", created_at: new Date().toISOString() });
    await upsert({ facts });
  }, [memory.facts, upsert]);

  const removeFact = useCallback(async (key: string) => {
    const facts = (memory.facts ?? []).filter((f) => f.key !== key);
    await upsert({ facts });
  }, [memory.facts, upsert]);

  const setPreference = useCallback(async (key: string, value: any) => {
    await upsert({ preferences: { ...(memory.preferences ?? {}), [key]: value } });
  }, [memory.preferences, upsert]);

  const removePreference = useCallback(async (key: string) => {
    const p = { ...(memory.preferences ?? {}) }; delete p[key];
    await upsert({ preferences: p });
  }, [memory.preferences, upsert]);

  return { memory, loading, refresh, upsert, addFact, removeFact, setPreference, removePreference };
}
