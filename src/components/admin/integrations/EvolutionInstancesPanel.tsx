import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Smartphone, Star, Loader2, Info, QrCode, CheckCircle2, Pause, LogOut, Plus, Sparkles, Pencil, Trash2, MoreVertical, Settings, AlertCircle, RotateCw } from 'lucide-react';
import {
  useEvolutionInstances,
  useRefreshEvolutionInstanceStatuses,
  useSetDefaultEvolutionInstance,
  useConnectEvolutionInstance,
  useDisconnectEvolutionInstance,
  useLogoutEvolutionInstance,
  useCreateEvolutionInstanceSelf,
  useDeleteEvolutionInstanceSelf,
  useRenameEvolutionInstanceSelf,
  type EvolutionInstance,
} from '@/hooks/useEvolutionInstances';
import { ProviderCooldownBadge } from './ProviderCooldownBadge';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationEffectivePlan } from '@/hooks/useOrganizationPlan';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EvolutionInstanceSettingsSheet } from './EvolutionInstanceSettingsSheet';


function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    connected: { label: 'Conectado', variant: 'default' },
    qr_pending: { label: 'Aguardando QR', variant: 'secondary' },
    paired: { label: 'Pareado', variant: 'default' },
    disconnected: { label: 'Desconectado', variant: 'outline' },
  };
  const cfg = map[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function ConnectDialog({ instance, onClose }: { instance: EvolutionInstance; onClose: () => void }) {
  const connectMut = useConnectEvolutionInstance();
  const [qr, setQr] = useState<string | null>(instance.qr_code ?? null);
  const [status, setStatus] = useState(instance.status);
  const [elapsed, setElapsed] = useState(0);

  const triggerConnect = () => {
    setQr(null);
    setElapsed(0);
    connectMut.mutate(instance.id, {
      onSuccess: (data: any) => {
        if (data?.already_connected) {
          setStatus('connected');
          toast.success('Já conectado!');
          setTimeout(onClose, 1200);
          return;
        }
        if (data?.qr_code) setQr(data.qr_code);
      },
    });
  };

  useEffect(() => {
    triggerConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll DB for QR/status updates pushed by webhook
  useEffect(() => {
    if (status === 'connected') return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('evolution_instances')
        .select('status, qr_code')
        .eq('id', instance.id)
        .maybeSingle();
      if (data) {
        if (data.qr_code && data.qr_code !== qr) setQr(data.qr_code);
        if (data.status !== status) {
          setStatus(data.status);
          if (data.status === 'connected') {
            toast.success('WhatsApp conectado com sucesso!');
            setTimeout(onClose, 1500);
          }
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [status, qr, instance.id, onClose]);

  // Elapsed timer (used to decide "loading" vs "error" state)
  useEffect(() => {
    if (qr || status === 'connected') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [qr, status]);

  const isQrBase64 = qr?.startsWith('data:image') || qr?.startsWith('iVBOR');
  const showError = !qr && status !== 'connected' && elapsed >= 45;
  const showLoading = !qr && status !== 'connected' && !showError;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar {instance.name}</DialogTitle>
          <DialogDescription>
            Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar aparelho → escaneie o código abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6 min-h-[280px]">
          {status === 'connected' ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              <p className="font-medium">Conectado!</p>
            </div>
          ) : qr ? (
            <div className="bg-white p-3 rounded-lg">
              <img
                src={isQrBase64 ? (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`) : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qr)}`}
                alt="QR Code"
                className="w-60 h-60"
              />
            </div>
          ) : showLoading ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                {elapsed < 10 ? 'Gerando QR Code…' : 'Ainda aguardando o servidor gerar o QR…'}
              </p>
              <p className="text-xs text-muted-foreground">
                Isso pode levar até 45 segundos. Mantenha esta janela aberta.
              </p>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <QrCode className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Não foi possível gerar o QR Code.</p>
              <Button size="sm" variant="outline" onClick={triggerConnect} disabled={connectMut.isPending}>
                {connectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tentar novamente'}
              </Button>
            </div>
          )}
        </div>

        <div className="text-xs text-center text-muted-foreground">
          Status: <StatusBadge status={status} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateInstanceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const createMut = useCreateEvolutionInstanceSelf();

  const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const valid = /^[a-z0-9-]{3,40}$/.test(sanitized);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    createMut.mutate({ name: sanitized }, { onSuccess: () => { setName(''); onClose(); } });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setName(''); onClose(); } }}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova conexão de WhatsApp</DialogTitle>
            <DialogDescription>
              Dê um nome simples para identificar essa conexão (ex: <code>vendas</code>, <code>atendimento</code>).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="instance-name">Nome da conexão</Label>
            <Input
              id="instance-name"
              autoFocus
              placeholder="ex: vendas-01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={createMut.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Apenas letras minúsculas, números e hífens. Mínimo 3 caracteres.
            </p>
            {name && !valid && (
              <p className="text-xs text-destructive">
                Nome inválido. Use apenas letras minúsculas, números e hífens (3 a 40 caracteres).
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={createMut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar conexão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ instance, onClose }: { instance: EvolutionInstance; onClose: () => void }) {
  const initial = instance.display_name || instance.name;
  const [name, setName] = useState<string>(initial);
  const renameMut = useRenameEvolutionInstanceSelf();

  const valid = name.trim().length >= 2 && name.trim().length <= 60;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    renameMut.mutate({ id: instance.id, name: name.trim() }, { onSuccess: () => onClose() });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Renomear conexão</DialogTitle>
            <DialogDescription>
              Atualize o nome de exibição desta conexão. O identificador interno permanece o mesmo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="rename-instance">Nome de exibição</Label>
            <Input
              id="rename-instance"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={renameMut.isPending}
            />
            <p className="text-xs text-muted-foreground">Entre 2 e 60 caracteres.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={renameMut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valid || renameMut.isPending}>
              {renameMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EvolutionInstancesPanelProps {
  /** Esconde o cabeçalho interno (título + botão "Nova conexão"). Quando true, controle de criação fica externo. */
  hideHeader?: boolean;
  /** Quando hideHeader=true, controla a abertura do dialog de criação externamente. */
  openCreate?: boolean;
  /** Callback para fechar o dialog de criação quando controlado externamente. */
  onCloseCreate?: () => void;
}

export function EvolutionInstancesPanel({ hideHeader, openCreate, onCloseCreate }: EvolutionInstancesPanelProps = {}) {
  const navigate = useNavigate();
  const { profile, isSuperAdmin } = useAuth();
  const canResetCooldown = isSuperAdmin();
  const { data: instances, isLoading, isError, error, refetch } = useEvolutionInstances();
  const { mutate: refreshInstanceStatuses, isPending: isRefreshingStatuses } = useRefreshEvolutionInstanceStatuses();
  const refreshedOrganizationRef = useRef<string | null>(null);
  const { data: effectivePlan } = useOrganizationEffectivePlan(profile?.organization_id);
  const setDefaultMut = useSetDefaultEvolutionInstance();
  const disconnectMut = useDisconnectEvolutionInstance();
  const logoutMut = useLogoutEvolutionInstance();
  const deleteMut = useDeleteEvolutionInstanceSelf();
  const [connecting, setConnecting] = useState<EvolutionInstance | null>(null);
  const [pausing, setPausing] = useState<EvolutionInstance | null>(null);
  const [unlinking, setUnlinking] = useState<EvolutionInstance | null>(null);
  const [renaming, setRenaming] = useState<EvolutionInstance | null>(null);
  const [deleting, setDeleting] = useState<EvolutionInstance | null>(null);
  const [configuring, setConfiguring] = useState<EvolutionInstance | null>(null);
  const [creatingInternal, setCreatingInternal] = useState(false);
  const creating = hideHeader ? !!openCreate : creatingInternal;
  const closeCreate = () => { if (hideHeader) { onCloseCreate?.(); } else { setCreatingInternal(false); } };

  const displayName = (inst: EvolutionInstance) =>
    inst.display_name || inst.name;

  const isLinked = (s: string) => s === 'connected' || s === 'paired';

  const used = instances?.length ?? 0;
  const limit = effectivePlan?.limits?.max_connections ?? 1;
  const limitReached = used >= limit;

  const handleUpgrade = () => navigate('/admin?tab=plan');

  useEffect(() => {
    const organizationId = profile?.organization_id;
    if (!organizationId || refreshedOrganizationRef.current === organizationId) return;
    refreshedOrganizationRef.current = organizationId;
    refreshInstanceStatuses();
  }, [profile?.organization_id, refreshInstanceStatuses]);

  const handleRefreshStatuses = () => {
    refreshInstanceStatuses(undefined, {
      onSuccess: (result) => {
        if (result.failed > 0) {
          toast.warning(`Status atualizado parcialmente: ${result.failed} conexao(oes) indisponivel(is).`);
        } else {
          toast.success('Status das conexoes atualizado.');
        }
      },
      onError: (refreshError) => {
        toast.error(`Nao foi possivel atualizar os status: ${refreshError.message}`);
      },
    });
  };

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold">Suas Instâncias de WhatsApp</h3>
            <p className="text-sm text-muted-foreground">
              Conecte seus números de WhatsApp escaneando o QR Code com o aparelho.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={limitReached ? 'destructive' : 'secondary'} className="text-sm">
              {used} / {limit} usadas
            </Badge>
            {limitReached ? (
              <Button onClick={handleUpgrade} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Fazer upgrade
              </Button>
            ) : (
              <Button onClick={() => setCreatingInternal(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Nova conexão
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleRefreshStatuses}
          disabled={isRefreshingStatuses || !profile?.organization_id}
        >
          <RotateCw className={`mr-2 h-4 w-4 ${isRefreshingStatuses ? 'animate-spin' : ''}`} />
          Atualizar status
        </Button>
      </div>

      {limitReached && !hideHeader && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-foreground">
            Você atingiu o limite de <strong>{limit}</strong> conexão(ões) do seu plano. Faça upgrade para criar mais conexões de WhatsApp.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !!error ? (
        <Card>
          <CardContent role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div>
              <p className="font-medium">Não foi possível carregar suas conexões.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tente novamente. Se o erro persistir, contate o suporte.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              <RotateCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : !instances?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma conexão criada ainda.</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Clique em <strong>Nova conexão</strong> para criar sua primeira instância de WhatsApp.
            </p>
          </CardContent>
        </Card>

      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {instances.map((inst) => (
            <Card key={inst.id} className="h-full">
              <CardContent className="flex h-full flex-col gap-5 pt-6">
                <div className="flex flex-1 flex-col gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                      <Smartphone className="h-5 w-5 text-green-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{displayName(inst)}</p>
                        {inst.is_default && (
                          <Badge variant="outline" className="gap-1">
                            <Star className="h-3 w-3" /> Padrão
                          </Badge>
                        )}
                        <StatusBadge status={inst.status} />
                        <ProviderCooldownBadge
                          provider="evolution"
                          connectionId={inst.id}
                          cooldownUntil={inst.cooldown_until}
                          lastFailureReason={inst.last_failure_reason}
                          canReset={canResetCooldown}
                          queryKeyToInvalidate={['evolution-instances']}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {inst.phone_number ? `+${inst.phone_number}` : 'Não conectado ainda'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    {!isLinked(inst.status) && (
                      <Button size="sm" className="flex-1" onClick={() => setConnecting(inst)}>
                        <QrCode className="h-4 w-4 mr-2" />
                        Conectar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfiguring(inst)}>
                      <Settings className="mr-2 h-4 w-4" />Configurar
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /><span className="sr-only">Mais ações</span></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isLinked(inst.status) && <DropdownMenuItem onClick={() => setPausing(inst)}><Pause className="mr-2 h-4 w-4" />Pausar</DropdownMenuItem>}
                        {isLinked(inst.status) && <DropdownMenuItem onClick={() => setUnlinking(inst)} className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Desvincular</DropdownMenuItem>}
                        {!inst.is_default && <DropdownMenuItem onClick={() => setDefaultMut.mutate(inst.id)} disabled={setDefaultMut.isPending}><Star className="mr-2 h-4 w-4" />Definir como padrão</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => setRenaming(inst)}><Pencil className="mr-2 h-4 w-4" />Editar nome</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeleting(inst)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Excluir conexão</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {connecting && (
        <ConnectDialog instance={connecting} onClose={() => setConnecting(null)} />
      )}

      <EvolutionInstanceSettingsSheet
        instance={configuring}
        open={!!configuring}
        onOpenChange={(open) => !open && setConfiguring(null)}
      />

      {/* Pausar sessão */}
      <AlertDialog open={!!pausing} onOpenChange={(o) => !o && setPausing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar a sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              O pareamento com o número{' '}
              <strong>{pausing?.phone_number ? `+${pausing.phone_number}` : 'atual'}</strong>{' '}
              é mantido. Ao clicar em <strong>Conectar</strong> novamente, a sessão volta automaticamente
              sem precisar de novo QR Code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pausing) disconnectMut.mutate(pausing.id);
                setPausing(null);
              }}
              disabled={disconnectMut.isPending}
            >
              {disconnectMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Pausar sessão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Desvincular número */}
      <AlertDialog open={!!unlinking} onOpenChange={(o) => !o && setUnlinking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular este WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              O número{' '}
              <strong>{unlinking?.phone_number ? `+${unlinking.phone_number}` : 'atual'}</strong>{' '}
              será removido desta instância e desaparecerá da lista de "Aparelhos conectados" no celular.
              Para reconectar (este ou outro número) será necessário escanear um novo QR Code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unlinking) logoutMut.mutate(unlinking.id);
                setUnlinking(null);
              }}
              disabled={logoutMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {logoutMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desvincular número
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir conexão (apaga local + Evolution Go) */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              A conexão <strong>{deleting ? displayName(deleting) : ''}</strong> será removida
              permanentemente, junto com a instância no servidor Evolution Go. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) deleteMut.mutate(deleting.id);
                setDeleting(null);
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir conexão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {renaming && <RenameDialog instance={renaming} onClose={() => setRenaming(null)} />}

      <CreateInstanceDialog open={creating} onClose={closeCreate} />
    </div>
  );
}
