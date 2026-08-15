import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface EvolutionInstance {
  id: string;
  organization_id: string;
  name: string;
  display_name: string | null;
  phone_number: string | null;
  qr_code?: string | null;
  qr_code_updated_at?: string | null;
  status: 'disconnected' | 'qr_pending' | 'connected' | 'paired' | string;
  webhook_subscribed: boolean;
  is_default: boolean;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_super_admin?: boolean;
  cooldown_until?: string | null;
  consecutive_failures?: number | null;
  last_failure_at?: string | null;
  last_failure_reason?: string | null;
}

export interface EvolutionInstanceWithOrg extends EvolutionInstance {
  organization?: { id: string; name: string } | null;
}

/* ─────────────── PLATFORM CONFIG (Super Admin) ─────────────── */

export interface PlatformEvolutionConfig {
  evolution_go_url: string | null;
  evolution_go_global_api_key: string | null;
}

export function usePlatformEvolutionConfig() {
  return useQuery({
    queryKey: ['platform-evolution-config'],
    queryFn: async (): Promise<PlatformEvolutionConfig> => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('evolution_go_url, evolution_go_global_api_key')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        evolution_go_url: (data as any)?.evolution_go_url ?? null,
        evolution_go_global_api_key: (data as any)?.evolution_go_global_api_key ?? null,
      };
    },
  });
}

export function useUpdatePlatformEvolutionConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: PlatformEvolutionConfig) => {
      const { data: existing } = await supabase
        .from('platform_settings')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from('platform_settings')
          .update(cfg as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('platform_settings').insert(cfg as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-evolution-config'] });
      toast.success('Configuração do servidor salva');
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

export function useTestEvolutionConnection() {
  return useMutation({
    mutationFn: async (vars: { url: string; globalApiKey: string }) => {
      const { data, error } = await supabase.functions.invoke('evolution-proxy', {
        body: { action: 'test_connection', url: vars.url, globalApiKey: vars.globalApiKey },
      });
      if (error) throw error;
      return data;
    },
  });
}

/* ─────────────── INSTANCES ─────────────── */

// Org-scoped (admin da empresa)
export function useEvolutionInstances() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['evolution-instances', profile?.organization_id],
    queryFn: async (): Promise<EvolutionInstance[]> => {
      const selectFields: string = 'id, organization_id, name, display_name:metadata->>display_name, phone_number, status, qr_code, qr_code_updated_at, webhook_subscribed, is_default, last_connected_at, created_at, updated_at, created_by_super_admin, cooldown_until, consecutive_failures, last_failure_at, last_failure_reason';
      const { data, error } = await supabase
        .from('evolution_instances')
        .select(selectFields)
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data || []) as unknown) as EvolutionInstance[];
    },
    enabled: !!profile?.organization_id,
  });
}

export interface EvolutionStatusRefreshResult {
  ok: boolean;
  updated: number;
  unchanged: number;
  failed: number;
}

export function useRefreshEvolutionInstanceStatuses() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation<EvolutionStatusRefreshResult, Error>({
    mutationFn: () => proxy({ action: 'refresh_instance_statuses' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
    },
  });
}

// Platform-wide (super admin)
export function useAllEvolutionInstancesAdmin() {
  return useQuery({
    queryKey: ['evolution-instances-all'],
    queryFn: async (): Promise<EvolutionInstanceWithOrg[]> => {
      const selectFields: string = 'id, organization_id, name, display_name:metadata->>display_name, phone_number, status, webhook_subscribed, is_default, last_connected_at, created_at, updated_at, created_by_super_admin, cooldown_until, consecutive_failures, last_failure_at, last_failure_reason, organization:organizations(id, name)';
      const { data, error } = await supabase
        .from('evolution_instances')
        .select(selectFields)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as unknown) as EvolutionInstanceWithOrg[];
    },
  });
}

function useProxyAction() {
  return async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke('evolution-proxy', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };
}

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido';
}

export interface EvolutionInstanceSettings {
  behavior: {
    ai_grouping_enabled: boolean;
    ai_grouping_window_ms: number;
    ai_grouping_max_ms: number;
    presence_enabled: boolean;
  };
  advanced: {
    alwaysOnline: boolean;
    rejectCall: boolean;
    msgRejectCall: string;
    readMessages: boolean;
  };
  proxy: {
    configured: boolean;
    protocol: 'http' | 'https' | 'socks4' | 'socks5' | null;
    host: string | null;
    port: number | null;
    username: string | null;
  };
  webhook: { configured: boolean };
}

export function useEvolutionInstanceSettings(id: string | null) {
  const proxy = useProxyAction();
  return useQuery<EvolutionInstanceSettings>({
    queryKey: ['evolution-instance-settings', id],
    queryFn: () => proxy({ action: 'get_instance_settings', id }),
    enabled: !!id,
  });
}

export function useUpdateEvolutionInstanceSettings() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { id: string; behavior: EvolutionInstanceSettings['behavior']; advanced: EvolutionInstanceSettings['advanced'] }) =>
      proxy({ action: 'update_instance_settings', ...vars }),
    onSuccess: () => {
      toast.success('Configurações da instância salvas');
    },
    onSettled: (_data, _error, vars) => {
      qc.invalidateQueries({ queryKey: ['evolution-instance-settings', vars.id] });
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
    },
    onError: (error: unknown) => toast.error('Erro ao salvar: ' + mutationErrorMessage(error)),
  });
}

export function useSetEvolutionInstanceProxy() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { id: string; proxy: { protocol: 'http' | 'https' | 'socks4' | 'socks5'; host: string; port: number; username: string; password: string } }) =>
      proxy({ action: 'set_instance_proxy', ...vars }),
    onSuccess: () => {
      toast.success('Proxy configurado');
    },
    onSettled: (_data, _error, vars) => {
      qc.invalidateQueries({ queryKey: ['evolution-instance-settings', vars.id] });
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
    },
    onError: (error: unknown) => toast.error('Erro ao configurar proxy: ' + mutationErrorMessage(error)),
  });
}

export function useRemoveEvolutionInstanceProxy() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'remove_instance_proxy', id }),
    onSuccess: () => {
      toast.success('Proxy removido');
    },
    onSettled: (_data, _error, id) => {
      qc.invalidateQueries({ queryKey: ['evolution-instance-settings', id] });
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
    },
    onError: (error: unknown) => toast.error('Erro ao remover proxy: ' + mutationErrorMessage(error)),
  });
}

export function useCreateEvolutionInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { name: string; organization_id: string }) =>
      proxy({ action: 'create_instance', ...vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      toast.success('Instância criada com sucesso');
    },
    onError: (e: any) => toast.error('Erro ao criar instância: ' + e.message),
  });
}

// Self-service: cliente cria a própria instância (limite controlado pelo plano).
export function useCreateEvolutionInstanceSelf() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { name: string }) =>
      proxy({ action: 'create_instance_self', name: vars.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      toast.success('Conexão criada! Escaneie o QR Code para ativar.');
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao criar conexão'),
  });
}

export function useConnectEvolutionInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'connect_instance', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
    },
    onError: (e: any) => toast.error('Erro ao conectar: ' + e.message),
  });
}

export function useSubscribeEvolutionWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('evolution-proxy', {
        body: { action: 'subscribe_webhook', id },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || 'Falha ao configurar webhook');
      return data;
    },
    onSuccess: () => {
      toast.success('Webhook configurado com sucesso');
    },
    onSettled: (_data, _error, id) => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      qc.invalidateQueries({ queryKey: ['evolution-instance-settings', id] });
    },
    onError: (e: any) => toast.error('Erro: ' + (e?.message || 'erro desconhecido')),
  });
}

export function useDeleteEvolutionInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'delete_instance', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      toast.success('Instância removida');
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

// Self-service: org admin/manager pode excluir a própria conexão
export function useDeleteEvolutionInstanceSelf() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'delete_instance_self', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      toast.success('Conexão excluída');
    },
    onError: (e: any) => toast.error('Erro ao excluir: ' + e.message),
  });
}

// Self-service: renomeia (display name) a própria conexão
export function useRenameEvolutionInstanceSelf() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      proxy({ action: 'rename_instance_self', id: vars.id, name: vars.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      toast.success('Conexão renomeada');
    },
    onError: (e: any) => toast.error('Erro ao renomear: ' + e.message),
  });
}

export function useSetDefaultEvolutionInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'set_default', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      toast.success('Instância padrão definida');
    },
    onError: (e: any) => toast.error('Erro: ' + e.message),
  });
}

export function useDisconnectEvolutionInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'disconnect_instance', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      toast.success('Sessão pausada. Reconecte quando quiser — o número fica salvo.');
    },
    onError: (e: any) => toast.error('Erro ao pausar sessão: ' + e.message),
  });
}

export function useLogoutEvolutionInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (id: string) => proxy({ action: 'logout_instance', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      toast.success('WhatsApp desvinculado. Escaneie um novo QR para conectar outro número.');
    },
    onError: (e: any) => toast.error('Erro ao desvincular: ' + e.message),
  });
}

export function useAssignEvolutionInstance() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (vars: { id: string; organization_id: string | null }) =>
      proxy({ action: 'assign_instance', id: vars.id, organization_id: vars.organization_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      toast.success('Instância atrelada à empresa');
    },
    onError: (e: any) => toast.error('Erro ao atrelar: ' + e.message),
  });
}

export function useSyncEvolutionInstances() {
  const qc = useQueryClient();
  const proxy = useProxyAction();
  return useMutation({
    mutationFn: (organization_id?: string) => proxy({ action: 'sync_instances', organization_id }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['evolution-instances'] });
      qc.invalidateQueries({ queryKey: ['evolution-instances-all'] });
      const imported = data?.imported ?? 0;
      const updated = data?.updated ?? 0;
      const total = data?.total ?? 0;
      const whFailed = data?.webhooks?.failed ?? 0;
      if (total === 0) {
        toast.info('Nenhuma instância encontrada no servidor.');
      } else {
        const base = `Sincronização: ${imported} importada(s), ${updated} atualizada(s)`;
        if (whFailed > 0) {
          toast.warning(`${base}. ${whFailed} webhook(s) falharam.`);
        } else {
          toast.success(`${base}. Webhooks configurados.`);
        }
      }
    },
    onError: (e: any) => toast.error('Erro ao sincronizar: ' + e.message),
  });
}
