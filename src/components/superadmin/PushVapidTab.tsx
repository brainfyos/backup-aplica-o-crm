import { useEffect, useState, useCallback } from 'react';
import { Bell, Copy, RefreshCw, Shield, Check, AlertCircle, Loader2, Smartphone, Trash2, Power, PowerOff, XCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  isPushSupported, isStandalone, isIOS, getCurrentSubscription,
  subscribeUser, unsubscribeUser,
} from '@/lib/push';

interface VapidStatus {
  configured: boolean;
  public_key: string;
  subject: string;
  generated_at: string | null;
}

interface DeviceState {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  hasSW: boolean;
  hasBrowserSub: boolean;
  browserEndpoint: string | null;
  registeredInBackend: boolean;
  standalone: boolean;
  ios: boolean;
}

interface SubRow {
  id: string;
  endpoint: string;
  user_agent: string | null;
  platform: string | null;
  is_standalone: boolean | null;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

interface TestDetail { endpoint: string; user_id: string; ok: boolean; status: number; error?: string }

function mask(endpoint: string) {
  if (!endpoint) return '';
  try {
    const u = new URL(endpoint);
    const tail = endpoint.slice(-12);
    return `${u.host}/…${tail}`;
  } catch {
    return endpoint.slice(0, 24) + '…' + endpoint.slice(-8);
  }
}

export function PushVapidTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [status, setStatus] = useState<VapidStatus | null>(null);
  const [subject, setSubject] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importPub, setImportPub] = useState('');
  const [importPriv, setImportPriv] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ sent: number; failed: number; skipped: number; details: TestDetail[] } | null>(null);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function callAction(action: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await supabase.functions.invoke('vapid-admin', {
      body: { action, ...extra },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  }

  const loadDevice = useCallback(async () => {
    if (!isPushSupported()) {
      setDevice({
        supported: false, permission: 'unsupported', hasSW: false,
        hasBrowserSub: false, browserEndpoint: null, registeredInBackend: false,
        standalone: false, ios: isIOS(),
      });
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    let registered = false;
    if (sub) {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', sub.endpoint)
        .is('revoked_at', null)
        .maybeSingle();
      registered = !!data?.id;
    }
    setDevice({
      supported: true,
      permission: Notification.permission,
      hasSW: !!reg,
      hasBrowserSub: !!sub,
      browserEndpoint: sub?.endpoint || null,
      registeredInBackend: registered,
      standalone: isStandalone(),
      ios: isIOS(),
    });
  }, []);

  const loadSubs = useCallback(async () => {
    try {
      const r: any = await callAction('list_my_subscriptions');
      setSubs(r?.subscriptions || []);
    } catch (e: any) {
      console.warn('list_my_subscriptions', e?.message);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vapid-admin', { method: 'GET' });
      if (error) throw error;
      const s = data as VapidStatus;
      setStatus(s);
      setSubject(s.subject || 'mailto:noreply@vendus.com.br');
      await Promise.all([loadDevice(), loadSubs()]);
    } catch (e: any) {
      toast.error('Falha ao carregar: ' + (e?.message || 'erro'));
    } finally {
      setLoading(false);
    }
  }, [loadDevice, loadSubs]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    setSaving(true);
    try { await callAction('generate'); toast.success('Par gerado'); await load(); }
    catch (e: any) { toast.error('Erro: ' + (e?.message || 'falha')); }
    finally { setSaving(false); }
  }
  async function handleRotate() {
    setConfirmRotate(false); setRotating(true);
    try { await callAction('rotate'); toast.success('Chaves rotacionadas. Dispositivos precisam reinscrever.'); await load(); }
    catch (e: any) { toast.error('Erro: ' + (e?.message || 'falha')); }
    finally { setRotating(false); }
  }
  async function handleImportManual() {
    setSaving(true);
    try {
      await callAction('import_manual', { public_key: importPub.trim(), private_key: importPriv.trim(), subject });
      toast.success('Par importado'); setShowImport(false); setImportPub(''); setImportPriv(''); await load();
    } catch (e: any) { toast.error('Erro: ' + (e?.message || 'falha')); }
    finally { setSaving(false); }
  }
  async function handleSaveSubject() {
    setSaving(true);
    try { await callAction('update_subject', { subject }); toast.success('Subject atualizado'); await load(); }
    catch (e: any) { toast.error('Erro: ' + (e?.message || 'falha')); }
    finally { setSaving(false); }
  }
  function copyPublic() {
    if (!status?.public_key) return;
    navigator.clipboard.writeText(status.public_key);
    toast.success('Chave pública copiada');
  }

  async function handleEnableDevice() {
    setBusyAction('enable');
    try {
      const r = await subscribeUser();
      if (r.ok) toast.success('Notificações ativadas neste dispositivo');
      else {
        const map: Record<string, string> = {
          unsupported: 'Navegador não suporta push',
          ios_needs_install: 'No iOS, instale o app na tela inicial primeiro',
          denied: 'Permissão negada — habilite nas configurações do navegador',
          no_sw: 'Service Worker não pôde ser registrado',
          vapid_unavailable: 'Chave pública VAPID indisponível',
        };
        toast.error(map[r.reason || ''] || `Falha: ${r.reason}`);
      }
      await Promise.all([loadDevice(), loadSubs()]);
    } finally { setBusyAction(null); }
  }
  async function handleDisableDevice() {
    setBusyAction('disable');
    try {
      await unsubscribeUser();
      toast.success('Notificações desativadas neste dispositivo');
      await Promise.all([loadDevice(), loadSubs()]);
    } finally { setBusyAction(null); }
  }

  async function handleSendTest() {
    setSendingTest(true); setTestResult(null);
    try {
      const r: any = await callAction('send_test');
      setTestResult({ sent: r.sent || 0, failed: r.failed || 0, skipped: r.skipped || 0, details: r.details || [] });
      if (r.sent > 0) toast.success(`Push enviado para ${r.sent} dispositivo(s)`);
      else if ((r.details || []).length === 0) toast.warning('Nenhuma inscrição ativa. Ative as notificações neste dispositivo.');
      else toast.warning('Nenhum push entregue. Veja os detalhes abaixo.');
      await loadSubs();
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message || 'falha'));
    } finally { setSendingTest(false); }
  }

  async function handleCleanup() {
    setBusyAction('cleanup');
    try {
      const r: any = await callAction('cleanup_invalid');
      toast.success(`${r.removed || 0} inscrição(ões) inválida(s) removida(s)`);
      await loadSubs();
    } catch (e: any) { toast.error('Erro: ' + (e?.message || 'falha')); }
    finally { setBusyAction(null); }
  }
  async function handleDeleteSub(id: string) {
    setBusyAction('del-' + id);
    try {
      await callAction('delete_subscription', { id });
      toast.success('Inscrição removida');
      await Promise.all([loadDevice(), loadSubs()]);
    } catch (e: any) { toast.error('Erro: ' + (e?.message || 'falha')); }
    finally { setBusyAction(null); }
  }

  const permBadge = (p: string) => {
    if (p === 'granted') return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">granted</Badge>;
    if (p === 'denied') return <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30">denied</Badge>;
    if (p === 'default') return <Badge variant="outline" className="text-amber-500 border-amber-500/50">default</Badge>;
    return <Badge variant="outline">indisponível</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" /> Push Notifications (VAPID)
          </CardTitle>
          <CardDescription>
            Par de chaves usado pelo servidor para assinar notificações Web Push do PWA.
            Único por deployment. A chave privada nunca sai do backend (armazenada criptografada).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Status:</span>
                {status?.configured ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                    <Check className="h-3 w-3 mr-1" /> Configurado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-500 border-amber-500/50">
                    <AlertCircle className="h-3 w-3 mr-1" /> Não configurado
                  </Badge>
                )}
                {status?.generated_at && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Gerado em {new Date(status.generated_at).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>

              {status?.configured && (
                <div className="space-y-2">
                  <Label>Chave pública</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={status.public_key} className="font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={copyPublic}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Chave privada criptografada no banco e nunca exibida.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Subject (contato do responsável)</Label>
                <div className="flex gap-2">
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="mailto:noreply@vendus.com.br" />
                  <Button variant="outline" onClick={handleSaveSubject} disabled={saving}>Salvar</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Usado pelo protocolo Web Push para contato em caso de abuso. Aceita <code>mailto:</code> ou URL https.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {!status?.configured ? (
                  <>
                    <Button onClick={handleGenerate} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2" />}
                      Gerar par de chaves
                    </Button>
                    <Button variant="outline" onClick={() => setShowImport((v) => !v)} disabled={saving}>
                      {showImport ? 'Cancelar importação' : 'Importar par existente'}
                    </Button>
                  </>
                ) : (
                  <Button variant="destructive" onClick={() => setConfirmRotate(true)} disabled={rotating}>
                    {rotating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Rotacionar chaves
                  </Button>
                )}
              </div>

              {showImport && !status?.configured && (
                <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                  <Label>Chave pública (base64url)</Label>
                  <Input value={importPub} onChange={(e) => setImportPub(e.target.value)} className="font-mono text-xs" />
                  <Label>Chave privada (base64url)</Label>
                  <Input value={importPriv} onChange={(e) => setImportPriv(e.target.value)} className="font-mono text-xs" />
                  <Button onClick={handleImportManual} disabled={saving || !importPub || !importPriv} size="sm">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Importar
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {status?.configured && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" /> Diagnóstico deste dispositivo
            </CardTitle>
            <CardDescription>Verifique e ative o push neste navegador para testar de ponta a ponta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {device && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span>Suporte do navegador</span>
                  {device.supported
                    ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">sim</Badge>
                    : <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30">não</Badge>}
                </div>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span>Permissão</span>{permBadge(device.permission)}
                </div>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span>Service Worker</span>
                  {device.hasSW
                    ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">registrado</Badge>
                    : <Badge variant="outline">ausente</Badge>}
                </div>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span>Inscrição no navegador</span>
                  {device.hasBrowserSub
                    ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">ativa</Badge>
                    : <Badge variant="outline">nenhuma</Badge>}
                </div>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span>Vinculada ao backend</span>
                  {device.registeredInBackend
                    ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">sim</Badge>
                    : <Badge variant="outline" className="text-amber-500 border-amber-500/50">não</Badge>}
                </div>
                <div className="flex items-center justify-between border rounded-md px-3 py-2">
                  <span>Standalone (PWA instalado)</span>
                  <Badge variant="outline">{device.standalone ? 'sim' : 'não'}</Badge>
                </div>
              </div>
            )}

            {device?.browserEndpoint && (
              <div className="text-xs text-muted-foreground font-mono truncate">
                Endpoint: {mask(device.browserEndpoint)}
              </div>
            )}
            {device?.ios && !device?.standalone && (
              <div className="text-xs rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/30 px-3 py-2">
                No iOS o push só funciona depois de "Adicionar à tela inicial" e abrir pelo ícone.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {device?.registeredInBackend ? (
                <Button variant="outline" onClick={handleDisableDevice} disabled={busyAction === 'disable'}>
                  {busyAction === 'disable' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PowerOff className="h-4 w-4 mr-2" />}
                  Desativar neste dispositivo
                </Button>
              ) : (
                <Button onClick={handleEnableDevice} disabled={busyAction === 'enable' || !device?.supported}>
                  {busyAction === 'enable' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
                  Ativar notificações neste dispositivo
                </Button>
              )}
              <Button variant="outline" onClick={handleSendTest} disabled={sendingTest}>
                {sendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2" />}
                Enviar push de teste
              </Button>
              <Button variant="ghost" onClick={loadDevice}>
                <RefreshCw className="h-4 w-4 mr-2" /> Atualizar status
              </Button>
            </div>

            {testResult && (
              <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                <div className="text-sm flex flex-wrap gap-3">
                  <span>Enviados: <b className="text-emerald-600">{testResult.sent}</b></span>
                  <span>Falharam: <b className="text-rose-600">{testResult.failed}</b></span>
                  <span>Ignorados por preferência: <b>{testResult.skipped}</b></span>
                </div>
                {testResult.details.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma inscrição ativa encontrada para o seu usuário. Ative as notificações neste dispositivo acima.
                  </p>
                )}
                {testResult.details.map((d, i) => (
                  <div key={i} className="text-xs flex items-start gap-2 border-t pt-2 first:border-0 first:pt-0">
                    {d.ok
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      : <XCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono truncate">{mask(d.endpoint)}</div>
                      <div className="text-muted-foreground">
                        status {d.status || '-'} {d.error ? `— ${d.error}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {status?.configured && (
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Minhas inscrições</CardTitle>
              <CardDescription>Todos os dispositivos onde você ativou notificações.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleCleanup} disabled={busyAction === 'cleanup'}>
              {busyAction === 'cleanup' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Limpar inválidas
            </Button>
          </CardHeader>
          <CardContent>
            {subs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma inscrição registrada.</p>
            ) : (
              <div className="space-y-2">
                {subs.map((s) => (
                  <div key={s.id} className="border rounded-md p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0 text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{s.platform || 'desktop'}</Badge>
                        {s.is_standalone && <Badge variant="outline">PWA</Badge>}
                        {s.revoked_at
                          ? <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30">revogada</Badge>
                          : <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">ativa</Badge>}
                      </div>
                      <div className="font-mono truncate text-muted-foreground">{mask(s.endpoint)}</div>
                      {s.user_agent && <div className="text-muted-foreground truncate">{s.user_agent}</div>}
                      <div className="text-muted-foreground">
                        Criada em {new Date(s.created_at).toLocaleString('pt-BR')}
                        {s.last_seen_at ? ` · último envio ${new Date(s.last_seen_at).toLocaleString('pt-BR')}` : ''}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteSub(s.id)} disabled={busyAction === 'del-' + s.id}>
                      {busyAction === 'del-' + s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotacionar chaves VAPID?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dispositivos precisarão reinscrever para voltar a receber push.
              Inscrições atuais deixarão de funcionar imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotate}>Rotacionar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
