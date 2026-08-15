import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Copy, RefreshCw, CheckCircle2, XCircle, PlayCircle, Loader2 } from 'lucide-react';
import {
  useTrackingOrg,
  useTrackingStatus,
  useRegenerateTrackingKey,
  useUpdateTrackingSettings,
  TrackingSettings,
} from '@/hooks/useTrackingSDK';

function buildSnippet(pubKey: string) {
  const src = `${window.location.origin}/tracking/latest.js`;
  return `<script\n  src="${src}"\n  data-vendus-key="${pubKey}"\n  async\n  defer\n></script>`;
}

export function TrackingScriptTab() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const { data: org, isLoading } = useTrackingOrg(orgId);
  const { data: status } = useTrackingStatus(orgId);
  const regen = useRegenerateTrackingKey();
  const updateSettings = useUpdateTrackingSettings();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [domainsInput, setDomainsInput] = useState<string>('');

  const settings: TrackingSettings = org?.tracking_settings ?? { enabled: true, allowed_domains: [], allow_localhost: false };
  const pubKey = org?.tracking_public_key ?? '';
  const snippet = useMemo(() => (pubKey ? buildSnippet(pubKey) : ''), [pubKey]);

  const domainsValue = domainsInput || (settings.allowed_domains || []).join('\n');

  const persistSettings = async (patch: Partial<TrackingSettings>) => {
    if (!orgId) return;
    const next: TrackingSettings = { ...settings, ...patch };
    await updateSettings.mutateAsync({ organizationId: orgId, settings: next });
    toast.success('Configurações atualizadas');
  };

  const saveDomains = async () => {
    const list = domainsValue.split(/[\n,]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    await persistSettings({ allowed_domains: list });
    setDomainsInput('');
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copiado'); } catch { /* noop */ }
  };

  const runTest = async () => {
    if (!orgId || !pubKey) {
      setTestResult({ ok: false, msg: 'Chave pública ausente. Regenere a chave e tente novamente.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const started = Date.now();
    const { supabase } = await import('@/integrations/supabase/client');

    try {
      // 1) Ping direto ao endpoint com a chave pública desta empresa — prova que endpoint/chave/CORS funcionam.
      const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://syvhrtaksjcvhrzhbltt.supabase.co';
      const pingId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let pingOk = false;
      let pingErr = '';
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error('sessão administrativa ausente');
        const res = await fetch(`${SUPABASE_URL}/functions/v1/tracking-collect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            type: 'event',
            organization_key: pubKey,
            visitor_id: 'vnd_test_' + pingId,
            session_id: 'vnd_test_' + pingId,
            event_id: pingId,
            event_name: 'TestInstall',
            event_time: Math.floor(Date.now() / 1000),
            url: window.location.href,
            hostname: window.location.hostname,
            page: { url: window.location.href, title: 'Vendus · Teste', hostname: window.location.hostname },
            first_touch: { landing_page: window.location.href, hostname: window.location.hostname },
            last_touch: { landing_page: window.location.href, hostname: window.location.hostname },
            properties: { source: 'admin_test_button' },
          }),
        });
        const body = await res.json().catch(() => ({}));
        pingOk = res.ok && !body?.ignored;
        if (!pingOk) {
          const blockedHost = body?.host ? ` (${body.host})` : '';
          pingErr = body?.ignored ? `endpoint respondeu: ${body.ignored}${blockedHost}` : `HTTP ${res.status}`;
        }
      } catch (e: any) {
        pingErr = e?.message || 'falha de rede';
      }

      if (!pingOk) {
        setTestResult({ ok: false, msg: `Endpoint de coleta não aceitou o teste (${pingErr}). Verifique a chave pública e as configurações.` });
        return;
      }

      // 2) Aguarda até 30s por QUALQUER evento externo (do site do cliente) chegar depois do clique.
      const deadline = started + 30000;
      while (Date.now() < deadline) {
        const { data } = await supabase
          .from('tracking_events')
          .select('id, created_at, hostname, event_name, properties')
          .eq('organization_id', orgId)
          .gte('created_at', new Date(started).toISOString())
          .order('created_at', { ascending: false })
          .limit(5);
        const external = (data || []).find((e: any) => (e.properties?.source ?? null) !== 'admin_test_button');
        if (external) {
          setTestResult({ ok: true, msg: `Script instalado! Evento "${(external as any).event_name}" recebido de ${(external as any).hostname || 'origem desconhecida'}.` });
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      // Endpoint OK, mas nenhum evento externo chegou.
      setTestResult({
        ok: false,
        msg: 'Endpoint, chave e acesso administrativo estão funcionando, mas nenhum evento externo chegou em 30s. Abra ou atualize a página publicada onde o script está instalado para gerar um PageView.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) return <Skeleton className="h-96" />;
  if (!org) return <div className="text-muted-foreground">Organização não encontrada.</div>;

  const lastEvent = status?.recent_events?.[0];

  return (
    <div className="space-y-6">
      {/* Bloco 1 — Instalação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Código de instalação</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => copy(snippet)}>
                <Copy className="w-4 h-4 mr-2" /> Copiar código
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!confirm('Regenerar a chave invalida o script instalado. Continuar?')) return;
                  await regen.mutateAsync(orgId!);
                  toast.success('Nova chave gerada');
                }}
                disabled={regen.isPending}
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Regenerar chave
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Chave pública</Label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={pubKey} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copy(pubKey)}><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cole antes de <code>&lt;/head&gt;</code> do seu site</Label>
            <pre className="mt-1 p-3 rounded-md bg-muted text-xs overflow-x-auto whitespace-pre">{snippet}</pre>
          </div>
        </CardContent>
      </Card>

      {/* Bloco 2 — Status */}
      <Card>
        <CardHeader><CardTitle>Status do rastreamento</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Script detectado</div>
            <div className="mt-1 flex items-center gap-2">
              {status && status.visitors_24h > 0 ? (
                <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Sim</>
              ) : (
                <><XCircle className="w-4 h-4 text-muted-foreground" /> Ainda não</>
              )}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Eventos 24h</div>
            <div className="mt-1 font-medium">{status?.events_24h ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Visitantes 24h</div>
            <div className="mt-1 font-medium">{status?.visitors_24h ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Último evento</div>
            <div className="mt-1 text-xs">
              {lastEvent ? (
                <>
                  <Badge variant="secondary">{(lastEvent as any).event_name}</Badge>
                  <div className="text-muted-foreground mt-0.5">{new Date((lastEvent as any).created_at).toLocaleString('pt-BR')}</div>
                </>
              ) : '—'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bloco 3 — Teste */}
      <Card>
        <CardHeader><CardTitle>Testar instalação</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Instale o script no seu site, abra qualquer página e clique abaixo. Se o Vendus receber um evento em até 15 segundos, a instalação está OK.
          </p>
          <Button onClick={runTest} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            {testing ? 'Aguardando evento…' : 'Testar agora'}
          </Button>
          {testResult && (
            <div className={`flex items-center gap-2 text-sm ${testResult.ok ? 'text-emerald-500' : 'text-destructive'}`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResult.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco 4 — Configurações */}
      <Card>
        <CardHeader><CardTitle>Configurações</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Rastreamento ativo</Label>
              <p className="text-xs text-muted-foreground">Se desativado, o endpoint ignora eventos desta empresa.</p>
            </div>
            <Switch checked={!!settings.enabled} onCheckedChange={(v) => persistSettings({ enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Permitir localhost / 127.0.0.1</Label>
              <p className="text-xs text-muted-foreground">Habilite apenas em ambiente de desenvolvimento.</p>
            </div>
            <Switch checked={!!settings.allow_localhost} onCheckedChange={(v) => persistSettings({ allow_localhost: v })} />
          </div>
          <div>
            <Label>Domínios permitidos</Label>
            <p className="text-xs text-muted-foreground mb-2">Um por linha. Vazio = aceita qualquer domínio.</p>
            <Textarea
              value={domainsValue}
              onChange={(e) => setDomainsInput(e.target.value)}
              placeholder={'siteempresa.com.br\ncheckout.siteempresa.com.br'}
              rows={4}
              className="font-mono text-xs"
            />
            <Button className="mt-2" size="sm" onClick={saveDomains} disabled={updateSettings.isPending}>Salvar domínios</Button>
          </div>
        </CardContent>
      </Card>

      {/* Bloco 5 — Eventos por nome (24h) */}
      <Card>
        <CardHeader><CardTitle>Eventos recebidos (24h)</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const recent = (status?.recent_events || []) as any[];
            if (!recent.length) return <p className="text-sm text-muted-foreground">Nenhum evento nas últimas 24h.</p>;
            const counts: Record<string, { total: number; bridged: number }> = {};
            for (const e of recent) {
              const name = e.event_name || 'unknown';
              const src = e?.properties?.source;
              counts[name] = counts[name] || { total: 0, bridged: 0 };
              counts[name].total++;
              if (src === 'pixel_bridge') counts[name].bridged++;
            }
            const rows = Object.entries(counts).sort((a, b) => b[1].total - a[1].total);
            return (
              <div className="space-y-1 text-sm">
                {rows.map(([name, c]) => (
                  <div key={name} className="flex items-center justify-between border-b last:border-0 py-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{name}</Badge>
                      {c.bridged > 0 && <Badge variant="outline" className="text-[10px]">via Pixel</Badge>}
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{c.total}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-2">Amostra das últimas 10 ocorrências. Para série histórica completa use a aba <strong>Atribuição</strong>.</p>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Bloco 6 — Diagnóstico */}
      <Card>
        <CardHeader><CardTitle>Diagnóstico do último evento</CardTitle></CardHeader>
        <CardContent>
          {!lastEvent ? (
            <p className="text-sm text-muted-foreground">Nenhum evento recebido ainda.</p>
          ) : (
            <div className="text-xs space-y-1 font-mono">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Evento:</span>
                <Badge variant="secondary">{(lastEvent as any).event_name}</Badge>
                {(lastEvent as any)?.properties?.source === 'pixel_bridge' && (
                  <Badge variant="outline" className="text-[10px]">via Pixel</Badge>
                )}
                <span className="text-muted-foreground">· {new Date((lastEvent as any).created_at).toLocaleString('pt-BR')}</span>
              </div>
              <div><span className="text-muted-foreground">Domínio:</span> {(lastEvent as any).hostname || '—'}</div>
              <div><span className="text-muted-foreground">Página:</span> {(lastEvent as any).page_url || '—'}</div>
              <div><span className="text-muted-foreground">Visitor:</span> {(lastEvent as any).visitor_id}</div>
              <div><span className="text-muted-foreground">Lead vinculado:</span> {(lastEvent as any).lead_id ? '✅ ' + (lastEvent as any).lead_id : '— (ainda não identificado)'}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div>
                  <div className="text-muted-foreground mb-1">First touch (origem do visitante)</div>
                  <pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto">{JSON.stringify((lastEvent as any).first_touch || {}, null, 2)}</pre>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Last touch (última atribuição)</div>
                  <pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto">{JSON.stringify((lastEvent as any).last_touch || {}, null, 2)}</pre>
                </div>
              </div>
              {(lastEvent as any)?.properties && Object.keys((lastEvent as any).properties).length > 0 && (
                <>
                  <div className="mt-2 text-muted-foreground">Propriedades do evento:</div>
                  <pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto">{JSON.stringify((lastEvent as any).properties, null, 2)}</pre>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bloco 7 — Como identificar leads */}
      <Card>
        <CardHeader><CardTitle>Como identificar leads e disparar eventos personalizados</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-2">
              <strong>Ponte automática com o Meta Pixel:</strong> se o seu site já dispara <code>fbq('track', ...)</code>,
              o SDK Vendus captura automaticamente esses eventos (Lead, CompleteRegistration, JoinedWhatsAppGroup, etc.) e os envia para cá com deduplicação via <code>event_id</code>. Nada a fazer.
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Opção 1 — Marcar o formulário</Label>
            <pre className="mt-1 p-3 rounded-md bg-muted text-xs overflow-x-auto whitespace-pre">{`<form data-vendus-form>
  <input name="name" />
  <input name="email" type="email" />
  <input name="phone" />
  <button type="submit">Enviar</button>
</form>`}</pre>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Opção 2 — Chamada JS explícita</Label>
            <pre className="mt-1 p-3 rounded-md bg-muted text-xs overflow-x-auto whitespace-pre">{`// Um ID canônico para navegador + servidor
const eventId = 'vendus-' + crypto.randomUUID();

VendusTracking.identify({
  email: 'lead@empresa.com',
  phone: '+5511999999999',
  name: 'Nome do Lead',
}, {
  event_name: 'Lead-Vendus',
  event_id: eventId,
});

fbq('trackCustom', 'Lead-Vendus', {}, { eventID: eventId });

// Em integrações próprias, envie também o visitor_id ao seu backend
const visitorId = VendusTracking.getVisitorId();`}</pre>
          </div>
          <p className="text-xs text-muted-foreground">
            Uma vez identificado, o visitor fica vinculado ao lead no CRM e todos os eventos anteriores/futuros passam a alimentar a atribuição.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
