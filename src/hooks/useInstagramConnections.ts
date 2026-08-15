import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface InstagramConnection {
  id: string;
  organization_id: string;
  display_name: string;
  status: 'draft' | 'active' | 'partial' | 'error' | 'revoked';
  app_id: string | null;
  ig_business_account_id: string | null;
  ig_username: string | null;
  fb_page_id: string | null;
  fb_page_name: string | null;
  ig_auth_style: 'page_token' | 'ig_user_token' | null;
  webhook_verify_token: string;
  webhook_subscribed_at: string | null;
  last_inbound_at: string | null;
  last_error: string | null;
  fallback_mode: 'ai' | 'inbox_only';
  capabilities?: Record<string, boolean>;
  subscribed_fields?: string[];
  data_access_expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftInstagramResponse {
  connection_id: string;
  verify_token: string;
  webhook_url: string;
  webhook_subscribed_at: string | null;
  status: string;
}

export function useInstagramConnections() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['instagram-connections', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('instagram_connections' as any)
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InstagramConnection[];
    },
    enabled: !!orgId,
  });
}

export function useDraftInstagramConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { organization_id: string; display_name: string; connection_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('instagram-draft', { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as DraftInstagramResponse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instagram-connections'] }),
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao criar rascunho'),
  });
}

async function extractFnError(e: any): Promise<string> {
  try {
    const ctx = e?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      const msg = body?.error || body?.message;
      const detail = body?.detail ? ` — ${typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)}` : '';
      if (msg) return `${msg}${detail}`;
    }
    if (ctx && typeof ctx.text === 'function') {
      const t = await ctx.text();
      if (t) return t;
    }
  } catch { /* ignore */ }
  return e?.message ?? 'Erro desconhecido';
}

export function useSaveInstagramConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.functions.invoke('instagram-connect', { body: payload });
      if (error) throw new Error(await extractFnError(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['instagram-connections'] });
      const status = data?.status;
      if (status === 'partial') {
        const failed = Array.isArray(data?.failed) ? data.failed.map((f: any) => f.field).join(', ') : '';
        const missing = Array.isArray(data?.missing_scopes) && data.missing_scopes.length
          ? ` Faltam escopos: ${data.missing_scopes.join(', ')}.` : '';
        toast.warning(`Conexão ativa parcialmente${failed ? ` (falharam: ${failed})` : ''}.${missing}`, { duration: 12000 });
        return;
      }
      if (data?.subscribed === false) {
        const missing = Array.isArray(data?.missing_scopes) && data.missing_scopes.length
          ? ` Token sem: ${data.missing_scopes.join(', ')}.`
          : '';
        toast.warning(`Conexão salva, mas a Meta recusou a assinatura dos webhooks.${missing}`, { duration: 10000 });
        return;
      }
      const tt = data?.token_type;
      if (tt === 'USER_CONVERTED') {
        toast.success('Conexão Instagram ativa — User Token convertido automaticamente para Page Token.', { duration: 8000 });
      } else {
        toast.success('Conexão Instagram ativa');
      }
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao ativar'),
  });
}

export function useTestInstagramConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connection_id: string) => {
      const { data, error } = await supabase.functions.invoke('instagram-test', { body: { connection_id } });
      if (error) throw new Error(await extractFnError(error));
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['instagram-connections'] });
      if (data?.ok) toast.success(`Conectado como @${data?.ig?.username ?? 'instagram'}`);
      else toast.error(data?.error ?? 'Falha no teste');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha no teste'),
  });
}

export function useDeleteInstagramConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('instagram_connections' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instagram-connections'] });
      toast.success('Conexão removida');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao remover'),
  });
}

export function useUpdateInstagramFallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fallback_mode }: { id: string; fallback_mode: 'ai' | 'inbox_only' }) => {
      const { error } = await supabase
        .from('instagram_connections' as any)
        .update({ fallback_mode } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instagram-connections'] });
      toast.success('Comportamento de fallback atualizado');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao atualizar o fallback'),
  });
}

export function useUpdateInstagramAppSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { connection_id: string; app_secret: string }) => {
      const { data, error } = await supabase.functions.invoke('instagram-update-secret', { body: payload });
      if (error) throw new Error(await extractFnError(error));
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instagram-connections'] });
      qc.invalidateQueries({ queryKey: ['instagram-invalid-signatures'] });
      qc.invalidateQueries({ queryKey: ['instagram-webhook-logs'] });
      toast.success('App Secret atualizado. Faça um novo teste comentando no post.');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Falha ao atualizar App Secret'),
  });
}

/** Retorna { [connection_id]: count } de eventos únicos com assinatura inválida nos últimos 10 minutos. */
export function useInstagramInvalidSignatureCounts() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['instagram-invalid-signatures', orgId],
    queryFn: async () => {
      if (!orgId) return {} as Record<string, number>;
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('instagram_webhook_logs' as any)
        .select('connection_id, payload, payload_summary')
        .eq('organization_id', orgId)
        .eq('event_type', 'invalid_signature')
        .gte('created_at', since);
      if (error) return {} as Record<string, number>;
      const map: Record<string, number> = {};
      const seen = new Set<string>();
      for (const row of (data ?? []) as any[]) {
        const cid = row.connection_id as string;
        const fingerprint = invalidSignatureFingerprint(row);
        const uniqueKey = `${cid}:${fingerprint}`;
        if (seen.has(uniqueKey)) continue;
        seen.add(uniqueKey);
        map[cid] = (map[cid] ?? 0) + 1;
      }
      return map;
    },
    enabled: !!orgId,
    refetchInterval: 180000,
    refetchIntervalInBackground: false,
  });
}

function invalidSignatureFingerprint(row: any): string {
  if (row?.payload_summary?.event_fingerprint) return String(row.payload_summary.event_fingerprint);
  const entry = row?.payload ?? {};
  const messagingIds = (Array.isArray(entry?.messaging) ? entry.messaging : [])
    .map((evt: any) => evt?.message?.mid ?? evt?.postback?.mid ?? evt?.timestamp ?? '')
    .filter(Boolean);
  const changeIds = (Array.isArray(entry?.changes) ? entry.changes : [])
    .map((change: any) => change?.value?.id ?? change?.value?.comment_id ?? change?.value?.message_id ?? change?.value?.media?.id ?? '')
    .filter(Boolean);
  return JSON.stringify([entry?.id ?? '', messagingIds, changeIds]);
}

export interface InstagramWebhookLog {
  id: string;
  created_at: string;
  event_type: string;
  signature_valid: boolean | null;
  error: string | null;
  payload: any;
  payload_summary: any;
}

export function useInstagramWebhookLogs(connectionId: string | null, limit = 30) {
  return useQuery({
    queryKey: ['instagram-webhook-logs', connectionId, limit],
    queryFn: async () => {
      if (!connectionId) return [] as InstagramWebhookLog[];
      const { data, error } = await supabase
        .from('instagram_webhook_logs' as any)
        .select('id, created_at, event_type, signature_valid, error, payload, payload_summary')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as InstagramWebhookLog[];
    },
    enabled: !!connectionId,
    refetchInterval: 20000,
    refetchIntervalInBackground: false,
  });
}

