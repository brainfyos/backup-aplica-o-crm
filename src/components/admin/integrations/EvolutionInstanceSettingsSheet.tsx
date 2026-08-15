import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RotateCw, ShieldCheck } from 'lucide-react';
import {
  type EvolutionInstance,
  type EvolutionInstanceSettings,
  useEvolutionInstanceSettings,
  useRemoveEvolutionInstanceProxy,
  useSetEvolutionInstanceProxy,
  useSubscribeEvolutionWebhook,
  useUpdateEvolutionInstanceSettings,
} from '@/hooks/useEvolutionInstances';
import { PresenceTestButton } from './PresenceTestButton';

const DEFAULT_SETTINGS: EvolutionInstanceSettings = {
  behavior: {
    ai_grouping_enabled: true,
    ai_grouping_window_ms: 3000,
    ai_grouping_max_ms: 8000,
    presence_enabled: true,
  },
  advanced: {
    alwaysOnline: false,
    rejectCall: false,
    msgRejectCall: '',
    readMessages: false,
  },
  proxy: { configured: false, protocol: null, host: null, port: null, username: null },
  webhook: { configured: false },
};

interface Props {
  instance: EvolutionInstance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EvolutionInstanceSettingsSheet({ instance, open, onOpenChange }: Props) {
  const { data, isLoading, isError, refetch } = useEvolutionInstanceSettings(open ? instance?.id ?? null : null);
  const update = useUpdateEvolutionInstanceSettings();
  const setProxy = useSetEvolutionInstanceProxy();
  const removeProxy = useRemoveEvolutionInstanceProxy();
  const webhook = useSubscribeEvolutionWebhook();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [proxyProtocol, setProxyProtocol] = useState<'http' | 'https' | 'socks4' | 'socks5'>('http');
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');
  const [confirmProxyRemoval, setConfirmProxyRemoval] = useState(false);

  useEffect(() => {
    setProxyPassword('');
    setConfirmProxyRemoval(false);
  }, [instance?.id, open]);

  useEffect(() => {
    if (!data) return;
    setSettings(data);
    setProxyProtocol(data.proxy.protocol ?? 'http');
    setProxyHost(data.proxy.host ?? '');
    setProxyPort(data.proxy.port ? String(data.proxy.port) : '');
    setProxyUsername(data.proxy.username ?? '');
    setProxyPassword('');
  }, [data]);

  const windowValid = Number.isInteger(settings.behavior.ai_grouping_window_ms) &&
    settings.behavior.ai_grouping_window_ms >= 0 && settings.behavior.ai_grouping_window_ms <= 8000;
  const maxValid = Number.isInteger(settings.behavior.ai_grouping_max_ms) &&
    settings.behavior.ai_grouping_max_ms >= settings.behavior.ai_grouping_window_ms &&
    settings.behavior.ai_grouping_max_ms <= 8000;
  const proxyPortNumber = Number(proxyPort);
  const proxyCredentialsValid = Boolean(proxyUsername.trim()) === Boolean(proxyPassword);
  const proxyValid = !!proxyHost.trim() && Number.isInteger(proxyPortNumber) && proxyPortNumber >= 1 && proxyPortNumber <= 65535 && proxyCredentialsValid;

  const saveSettings = () => {
    if (!instance || !windowValid || !maxValid) return;
    update.mutate({ id: instance.id, behavior: settings.behavior, advanced: settings.advanced });
  };

  const saveProxy = () => {
    if (!instance || !proxyValid) return;
    setProxy.mutate({
      id: instance.id,
      proxy: {
        protocol: proxyProtocol,
        host: proxyHost.trim(),
        port: proxyPortNumber,
        username: proxyUsername.trim(),
        password: proxyPassword,
      },
    }, { onSettled: () => setProxyPassword('') });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setProxyPassword('');
      setConfirmProxyRemoval(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full p-0 sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
          <SheetTitle>Configurar {instance?.name ?? 'instância'}</SheetTitle>
          <SheetDescription>Preferências seguras e isoladas desta conexão Evolution.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar as configurações.</p>
            <Button variant="outline" onClick={() => refetch()}><RotateCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
          </div>
        ) : (
          <Tabs defaultValue="behavior" className="flex min-h-0 flex-1 flex-col">
            <div className="overflow-x-auto border-b px-4 py-2">
              <TabsList className="grid min-w-[470px] grid-cols-4">
                <TabsTrigger value="behavior">Comportamento IA</TabsTrigger>
                <TabsTrigger value="advanced">Evolution Go</TabsTrigger>
                <TabsTrigger value="proxy">Proxy</TabsTrigger>
                <TabsTrigger value="webhook">Webhook</TabsTrigger>
              </TabsList>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <TabsContent value="behavior" className="mt-0 space-y-5">
                <SettingSwitch
                  label="Agrupar mensagens consecutivas"
                  description="Espera uma janela curta antes de acionar a IA para combinar mensagens do mesmo envio."
                  checked={settings.behavior.ai_grouping_enabled}
                  onCheckedChange={(checked) => setSettings((current) => ({ ...current, behavior: { ...current.behavior, ai_grouping_enabled: checked } }))}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="group-window">Janela (ms)</Label>
                    <Input id="group-window" type="number" min={0} max={8000} value={settings.behavior.ai_grouping_window_ms}
                      onChange={(event) => setSettings((current) => ({ ...current, behavior: { ...current.behavior, ai_grouping_window_ms: Number(event.target.value) } }))} />
                    {!windowValid && <p className="text-xs text-destructive">Use um valor entre 0 e 8000.</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="group-max">Teto da espera (ms)</Label>
                    <Input id="group-max" type="number" min={0} max={8000} value={settings.behavior.ai_grouping_max_ms}
                      onChange={(event) => setSettings((current) => ({ ...current, behavior: { ...current.behavior, ai_grouping_max_ms: Number(event.target.value) } }))} />
                    {!maxValid && <p className="text-xs text-destructive">Deve ser igual ou maior que a janela e no máximo 8000.</p>}
                  </div>
                </div>
                <SettingSwitch
                  label="Presença no WhatsApp"
                  description="Permite mostrar “digitando” quando o indicador do agente também estiver ativo."
                  checked={settings.behavior.presence_enabled}
                  onCheckedChange={(checked) => setSettings((current) => ({ ...current, behavior: { ...current.behavior, presence_enabled: checked } }))}
                />
                <Button onClick={saveSettings} disabled={!windowValid || !maxValid || update.isPending}>
                  {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar comportamento
                </Button>
              </TabsContent>

              <TabsContent value="advanced" className="mt-0 space-y-5">
                <SettingSwitch label="Sempre online" description="Mantém a instância marcada como disponível no Evolution."
                  checked={settings.advanced.alwaysOnline}
                  onCheckedChange={(checked) => setSettings((current) => ({ ...current, advanced: { ...current.advanced, alwaysOnline: checked } }))} />
                <SettingSwitch label="Recusar chamadas" description="Recusa chamadas recebidas por esta instância."
                  checked={settings.advanced.rejectCall}
                  onCheckedChange={(checked) => setSettings((current) => ({ ...current, advanced: { ...current.advanced, rejectCall: checked } }))} />
                <div className="space-y-2">
                  <Label htmlFor="reject-message">Mensagem ao recusar chamada</Label>
                  <Input id="reject-message" maxLength={500} value={settings.advanced.msgRejectCall}
                    onChange={(event) => setSettings((current) => ({ ...current, advanced: { ...current.advanced, msgRejectCall: event.target.value } }))} />
                </div>
                <SettingSwitch label="Marcar mensagens como lidas" description="Envia confirmação de leitura para mensagens recebidas."
                  checked={settings.advanced.readMessages}
                  onCheckedChange={(checked) => setSettings((current) => ({ ...current, advanced: { ...current.advanced, readMessages: checked } }))} />
                {instance && <PresenceTestButton instanceId={instance.id} instanceName={instance.name} />}
                <Button onClick={saveSettings} disabled={!windowValid || !maxValid || update.isPending}>
                  {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Evolution Go
                </Button>
              </TabsContent>

              <TabsContent value="proxy" className="mt-0 space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Status</span>
                  <Badge variant={settings.proxy.configured ? 'default' : 'outline'}>{settings.proxy.configured ? 'Configurado' : 'Sem proxy'}</Badge>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Protocolo</Label>
                    <Select value={proxyProtocol} onValueChange={(value) => setProxyProtocol(value as typeof proxyProtocol)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http">HTTP</SelectItem><SelectItem value="https">HTTPS</SelectItem>
                        <SelectItem value="socks4">SOCKS4</SelectItem><SelectItem value="socks5">SOCKS5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label htmlFor="proxy-port">Porta</Label><Input id="proxy-port" type="number" min={1} max={65535} value={proxyPort} onChange={(event) => setProxyPort(event.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label htmlFor="proxy-host">Host</Label><Input id="proxy-host" value={proxyHost} onChange={(event) => setProxyHost(event.target.value)} placeholder="proxy.exemplo.com" /></div>
                <div className="space-y-2"><Label htmlFor="proxy-user">Usuário (opcional, junto com senha)</Label><Input id="proxy-user" autoComplete="off" value={proxyUsername} onChange={(event) => setProxyUsername(event.target.value)} /></div>
                <div className="space-y-2">
                  <Label htmlFor="proxy-password">Senha (somente escrita)</Label>
                  <Input id="proxy-password" type="password" autoComplete="new-password" value={proxyPassword} onChange={(event) => setProxyPassword(event.target.value)} />
                  <p className="text-xs text-muted-foreground">A senha é enviada diretamente ao Evolution e nunca é salva nem reexibida pelo Vendus.</p>
                  {!proxyCredentialsValid && <p className="text-xs text-destructive">Informe usuário e senha juntos, ou deixe ambos vazios para usar um proxy sem autenticação.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveProxy} disabled={!proxyValid || setProxy.isPending}>{setProxy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{settings.proxy.configured ? 'Substituir proxy' : 'Configurar proxy'}</Button>
                  {settings.proxy.configured && <Button variant="destructive" onClick={() => setConfirmProxyRemoval(true)} disabled={removeProxy.isPending}>Remover proxy</Button>}
                </div>
              </TabsContent>

              <TabsContent value="webhook" className="mt-0 space-y-5">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /><span className="font-medium">Webhook gerenciado pelo Vendus</span></div>
                  <p className="text-sm text-muted-foreground">A URL e os eventos são definidos automaticamente para preservar segurança e compatibilidade.</p>
                  <Badge variant={settings.webhook.configured ? 'default' : 'destructive'}>{settings.webhook.configured ? 'Configurado' : 'Requer configuração'}</Badge>
                </div>
                <Button variant="outline" onClick={() => instance && webhook.mutate(instance.id)} disabled={webhook.isPending}>
                  {webhook.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}Reconfigurar webhook
                </Button>
              </TabsContent>
            </div>
          </Tabs>
        )}

        <AlertDialog open={confirmProxyRemoval} onOpenChange={setConfirmProxyRemoval}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover o proxy desta instância?</AlertDialogTitle>
              <AlertDialogDescription>
                A conexão voltará a acessar o Evolution sem proxy. As credenciais não são armazenadas pelo Vendus; para restaurar este proxy será necessário informar host, porta, usuário e senha novamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={!instance || removeProxy.isPending}
                onClick={() => {
                  if (!instance) return;
                  removeProxy.mutate(instance.id, {
                    onSettled: () => {
                      setProxyPassword('');
                      setConfirmProxyRemoval(false);
                    },
                  });
                }}
              >
                {removeProxy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Remover proxy
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function SettingSwitch({ label, description, checked, onCheckedChange }: { label: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <div className="flex items-start justify-between gap-4 rounded-lg border p-3"><div className="space-y-1"><Label>{label}</Label><p className="text-xs text-muted-foreground">{description}</p></div><Switch checked={checked} onCheckedChange={onCheckedChange} /></div>;
}
