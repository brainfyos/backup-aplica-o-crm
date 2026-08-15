import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Server, Smartphone, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle, Loader2, Plus, Trash2, RefreshCw, Star, Monitor, Pencil, AlertCircle, Pause, LogOut,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  usePlatformEvolutionConfig,
  useUpdatePlatformEvolutionConfig,
  useTestEvolutionConnection,
  useAllEvolutionInstancesAdmin,
  useCreateEvolutionInstance,
  useDeleteEvolutionInstance,
  useSyncEvolutionInstances,
  useSetDefaultEvolutionInstance,
  useAssignEvolutionInstance,
  useDisconnectEvolutionInstance,
  useLogoutEvolutionInstance,
  type EvolutionInstanceWithOrg,
} from '@/hooks/useEvolutionInstances';
import { useQuery } from '@tanstack/react-query';

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

function useOrganizations() {
  return useQuery({
    queryKey: ['superadmin-organizations-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

export function EvolutionManager() {
  const { data: config, isLoading: cfgLoading } = usePlatformEvolutionConfig();
  const updateCfg = useUpdatePlatformEvolutionConfig();
  const testMut = useTestEvolutionConnection();

  const [url, setUrl] = useState('');
  const [globalApiKey, setGlobalApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (config) {
      setUrl(config.evolution_go_url || '');
      setGlobalApiKey(config.evolution_go_global_api_key || '');
    }
  }, [config]);

  const cleanUrl = url.replace(/\/$/, '');
  const isConfigured = !!(config?.evolution_go_url && config?.evolution_go_global_api_key);

  const handleTest = () => {
    setTestResult(null);
    testMut.mutate({ url: cleanUrl, globalApiKey }, {
      onSuccess: (data: any) => setTestResult({ ok: !!data?.ok, msg: data?.message || 'OK' }),
      onError: (e: any) => setTestResult({ ok: false, msg: e.message }),
    });
  };

  const handleSave = () => {
    updateCfg.mutate({ evolution_go_url: cleanUrl, evolution_go_global_api_key: globalApiKey });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">WhatsApp / Evolution Go</h1>
        <p className="text-muted-foreground mt-1">
          Configure o servidor global e gerencie as instâncias de cada empresa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Server className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Servidor Evolution Go</CardTitle>
                <CardDescription>Configuração global usada por todas as empresas</CardDescription>
              </div>
            </div>
            <Badge variant={isConfigured ? 'default' : 'outline'}>
              {isConfigured ? 'Configurado' : 'Não configurado'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="server">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="server" className="gap-2"><Server className="h-4 w-4" /> Servidor</TabsTrigger>
              <TabsTrigger value="instances" className="gap-2" disabled={!isConfigured}>
                <Smartphone className="h-4 w-4" /> Instâncias
              </TabsTrigger>
              <TabsTrigger value="manager" className="gap-2" disabled={!isConfigured}>
                <Monitor className="h-4 w-4" /> Manager
              </TabsTrigger>
            </TabsList>

            <TabsContent value="server" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="evo-url">URL do Evolution Go</Label>
                <Input
                  id="evo-url"
                  placeholder="https://chatwoot-evogo.cftoys.easypanel.host"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={cfgLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="evo-key">Global API Key</Label>
                <div className="relative">
                  <Input
                    id="evo-key"
                    type={showKey ? 'text' : 'password'}
                    value={globalApiKey}
                    onChange={(e) => setGlobalApiKey(e.target.value)}
                    disabled={cfgLoading}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                    onClick={() => setShowKey((s) => !s)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {testResult && (
                <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                  testResult.ok
                    ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                }`}>
                  {testResult.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                  <span className="break-all">{testResult.msg}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleTest} disabled={testMut.isPending || !cleanUrl || !globalApiKey}>
                  {testMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Testar Conexão
                </Button>
                <Button onClick={handleSave} disabled={updateCfg.isPending || !cleanUrl || !globalApiKey}>
                  {updateCfg.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Salvar Configuração
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="instances" className="mt-4">
              <InstancesTable />
            </TabsContent>

            <TabsContent value="manager" className="mt-4 space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm flex items-start justify-between gap-3">
                <p className="text-muted-foreground">
                  Manager nativo do Evolution Go para gestão técnica avançada.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a href={`${cleanUrl}/manager`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir em nova aba
                  </a>
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden bg-background" style={{ height: '70vh' }}>
                <iframe
                  src={`${cleanUrl}/manager`}
                  title="Evolution Go Manager"
                  className="w-full h-full"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function InstancesTable() {
  const { data: instances, isLoading, isError, error, refetch } = useAllEvolutionInstancesAdmin();
  const { data: orgs } = useOrganizations();
  const createMut = useCreateEvolutionInstance();
  const deleteMut = useDeleteEvolutionInstance();
  const syncMut = useSyncEvolutionInstances();
  const setDefaultMut = useSetDefaultEvolutionInstance();
  const disconnectMut = useDisconnectEvolutionInstance();
  const logoutMut = useLogoutEvolutionInstance();

  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOrgId, setNewOrgId] = useState('');
  const [filterOrgId, setFilterOrgId] = useState<string>('all');
  const [editing, setEditing] = useState<EvolutionInstanceWithOrg | null>(null);
  const [pausing, setPausing] = useState<EvolutionInstanceWithOrg | null>(null);
  const [unlinking, setUnlinking] = useState<EvolutionInstanceWithOrg | null>(null);

  const isLinked = (s: string) => s === 'connected' || s === 'paired';

  const filtered = instances?.filter((i) => {
    if (filterOrgId === 'all') return true;
    if (filterOrgId === 'orphan') return !i.organization_id;
    return i.organization_id === filterOrgId;
  }) || [];

  const orphanCount = instances?.filter((i) => !i.organization_id).length || 0;

  const handleCreate = () => {
    if (!newName.trim() || !newOrgId) return;
    createMut.mutate({ name: newName.trim(), organization_id: newOrgId }, {
      onSuccess: () => {
        setOpenCreate(false);
        setNewName('');
        setNewOrgId('');
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm">Filtrar:</Label>
          <Select value={filterOrgId} onValueChange={setFilterOrgId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Todas as empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              <SelectItem value="orphan">
                Sem empresa{orphanCount > 0 ? ` (${orphanCount})` : ''}
              </SelectItem>
              {orgs?.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => syncMut.mutate(undefined)}
            disabled={syncMut.isPending}
            title="Importa instâncias do servidor Evolution Go. Novas chegam sem empresa atrelada — atribua manualmente depois."
          >
            {syncMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizar do Servidor
          </Button>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Nova Instância</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar nova instância</DialogTitle>
                <DialogDescription>
                  A instância será criada no servidor Evolution Go e atrelada à empresa escolhida.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da instância</Label>
                  <Input
                    placeholder="ex: empresa-x-vendas"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Apenas letras, números e hífens. Sem espaços.</p>
                </div>
                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Select value={newOrgId} onValueChange={setNewOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs?.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={createMut.isPending || !newName.trim() || !newOrgId}>
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {orphanCount > 0 && filterOrgId === 'all' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-amber-700 dark:text-amber-400">
            <strong>{orphanCount}</strong> instância(s) sem empresa atrelada. Clique no ícone de editar para atribuir.
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
              <p className="font-medium">Não foi possível carregar as instâncias Evolution Go.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tente novamente. Se o erro persistir, contate o suporte.
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma instância encontrada.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em <strong>Nova Instância</strong> para criar uma.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Webhook</TableHead>
                <TableHead>Padrão</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inst) => (
                <TableRow key={inst.id} className={!inst.organization_id ? 'bg-amber-500/5' : ''}>
                  <TableCell className="font-medium">{inst.name}</TableCell>
                  <TableCell className="text-sm">
                    {inst.organization?.name ? (
                      inst.organization.name
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/40 gap-1">
                        <AlertCircle className="h-3 w-3" /> Sem empresa
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{inst.phone_number ? `+${inst.phone_number}` : '—'}</TableCell>
                  <TableCell><StatusBadge status={inst.status} /></TableCell>
                  <TableCell>
                    {inst.webhook_subscribed ? (
                      <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/40">Pendente</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {inst.is_default ? (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ) : inst.organization_id ? (
                      <Button variant="ghost" size="sm" onClick={() => setDefaultMut.mutate(inst.id)}>
                        <Star className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isLinked(inst.status) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPausing(inst)}
                            title="Pausar sessão (mantém pareamento)"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUnlinking(inst)}
                            title="Desvincular número (exige novo QR)"
                          >
                            <LogOut className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(inst)}
                        title="Editar empresa"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Remover instância "${inst.name}"?\n\nIsso apaga no servidor Evolution Go E no CRM.`)) {
                            deleteMut.mutate(inst.id);
                          }
                        }}
                        disabled={deleteMut.isPending}
                        title="Remover instância"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <AssignDialog
          instance={editing}
          orgs={orgs || []}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Pausar sessão */}
      <AlertDialog open={!!pausing} onOpenChange={(o) => !o && setPausing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar a sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              O pareamento com o número{' '}
              <strong>{pausing?.phone_number ? `+${pausing.phone_number}` : 'atual'}</strong>{' '}
              é mantido. Ao reconectar, a sessão volta automaticamente sem precisar de novo QR Code.
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
    </div>
  );
}

function AssignDialog({
  instance,
  orgs,
  onClose,
}: {
  instance: EvolutionInstanceWithOrg;
  orgs: { id: string; name: string }[];
  onClose: () => void;
}) {
  const assignMut = useAssignEvolutionInstance();
  const [orgId, setOrgId] = useState<string>(instance.organization_id || 'none');

  const handleSave = () => {
    assignMut.mutate(
      { id: instance.id, organization_id: orgId === 'none' ? null : orgId },
      { onSuccess: () => onClose() }
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar instância</DialogTitle>
          <DialogDescription>
            Atribua <strong>{instance.name}</strong> a uma empresa. A empresa passará a ver e gerenciar essa instância no painel dela.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem empresa (órfã)</SelectItem>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {orgId === 'none' && (
              <p className="text-xs text-muted-foreground">
                A instância ficará invisível para qualquer empresa até ser atribuída.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={assignMut.isPending}>
            {assignMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
