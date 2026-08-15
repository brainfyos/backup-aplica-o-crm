import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw, Save, Eye, EyeOff, Copy } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useMarketingCtx } from '../context/MarketingFiltersContext';

// ============ CAPI CONFIG SUB-TAB ============
function CapiConfigSubTab({ orgId, credentialId }: { orgId: string | null; credentialId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [state, setState] = useState({
    meta_pixel_id: '',
    meta_capi_access_token: '',
    meta_capi_test_event_code: '',
    capi_enabled: false,
    has_token: false,
    token_mask: '',
  });

  const load = async () => {
    if (!orgId || !credentialId) return;
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const jwt = session.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-capi-credentials?organization_id=${orgId}&credential_id=${credentialId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } });
      if (!res.ok) throw new Error(await res.text());
      const cfg = await res.json();
      setState((s) => ({
        ...s,
        meta_pixel_id: cfg?.meta_pixel_id ?? '',
        meta_capi_test_event_code: cfg?.meta_capi_test_event_code ?? '',
        capi_enabled: !!cfg?.capi_enabled,
        has_token: !!cfg?.has_token,
        token_mask: cfg?.token_mask ?? '',
      }));
    } catch (e) {
      toast.error(`Erro ao carregar: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [orgId, credentialId]);

  const save = async () => {
    if (!orgId || !credentialId) return;
    const pixel = state.meta_pixel_id.trim();
    if (pixel && !/^\d{7,20}$/.test(pixel)) {
      toast.error('Pixel ID inválido', {
        description: 'Deve ser numérico (7 a 20 dígitos). Ex.: 1200998365220349. Não use e-mail.',
      });
      return;
    }
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const jwt = session.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-capi-credentials?organization_id=${orgId}&credential_id=${credentialId}`;
      const body: any = {
        meta_pixel_id: pixel,
        meta_capi_test_event_code: state.meta_capi_test_event_code,
        capi_enabled: state.capi_enabled,
      };
      if (state.meta_capi_access_token.trim().length > 0) {
        body.meta_capi_access_token = state.meta_capi_access_token.trim();
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
      if (!res.ok) {
        const msg = parsed?.error || raw || `HTTP ${res.status}`;
        const details = parsed?.details || parsed?.hint || undefined;
        toast.error(msg, details ? { description: details } : undefined);
        return;
      }
      toast.success('Credenciais salvas');
      setState((s) => ({ ...s, meta_capi_access_token: '' }));
      load();
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meta Conversions API</CardTitle>
        <p className="text-xs text-muted-foreground">
          Pixel ID + Access Token da Meta. Token é criptografado (AES-256-GCM) antes de persistir.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : (
          <>
            <div className="grid gap-2">
              <Label>Meta Pixel ID</Label>
              <Input value={state.meta_pixel_id} onChange={(e) => setState({ ...state, meta_pixel_id: e.target.value })} placeholder="123456789012345" />
            </div>
            <div className="grid gap-2">
              <Label>Access Token CAPI</Label>
              <div className="flex gap-2">
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={state.meta_capi_access_token}
                  onChange={(e) => setState({ ...state, meta_capi_access_token: e.target.value })}
                  placeholder={state.has_token ? `Salvo: ${state.token_mask} (deixe vazio para manter)` : 'Cole o token da Meta'}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowToken((v) => !v)}>
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Gere em Business Manager → Gerenciador de Eventos → Configurações → API de Conversões.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Test Event Code (opcional)</Label>
              <Input
                value={state.meta_capi_test_event_code}
                onChange={(e) => setState({ ...state, meta_capi_test_event_code: e.target.value })}
                placeholder="TEST12345"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Envio de eventos habilitado</p>
                <p className="text-xs text-muted-foreground">Desligue para pausar o envio sem apagar as credenciais.</p>
              </div>
              <Switch checked={state.capi_enabled} onCheckedChange={(v) => setState({ ...state, capi_enabled: v })} />
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============ PARAMS SUB-TAB ============
function ParamsSubTab({ orgId }: { orgId: string | null }) {
  const [stats, setStats] = useState<{ total: number; withFbc: number; withFbp: number; withCtwa: number; withFbclid: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await (supabase as any).from('leads')
      .select('id, fbc, fbp, ctwa_clid, fbclid')
      .eq('organization_id', orgId)
      .gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString())
      .limit(5000);
    const rows = (data as any[]) ?? [];
    setStats({
      total: rows.length,
      withFbc: rows.filter((r) => !!r.fbc).length,
      withFbp: rows.filter((r) => !!r.fbp).length,
      withCtwa: rows.filter((r) => !!r.ctwa_clid).length,
      withFbclid: rows.filter((r) => !!r.fbclid).length,
    });
    setLoading(false);
  };
  useEffect(() => { load(); }, [orgId]);

  const pct = (n: number) => stats && stats.total ? Math.round((n / stats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <UrlParamsCard />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobertura de parâmetros de rastreamento (últimos 30 dias)</CardTitle>
          <p className="text-xs text-muted-foreground">
            Quanto maior a cobertura, maior o event match quality na Meta. `fbc`/`fbp` vêm do Meta Pixel; `ctwa_clid` vem do Click-to-WhatsApp.
          </p>
        </CardHeader>
        <CardContent>
          {loading || !stats ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MetricBox label="Leads no período" value={stats.total} pct={null} />
              <MetricBox label="Com fbc" value={stats.withFbc} pct={pct(stats.withFbc)} />
              <MetricBox label="Com fbp" value={stats.withFbp} pct={pct(stats.withFbp)} />
              <MetricBox label="Com fbclid" value={stats.withFbclid} pct={pct(stats.withFbclid)} />
              <MetricBox label="Com ctwa_clid" value={stats.withCtwa} pct={pct(stats.withCtwa)} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const URL_PARAMS_TEMPLATE = 'utm_source=FB&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_medium={{adset.name}}|{{adset.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}';

function UrlParamsCard() {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(URL_PARAMS_TEMPLATE);
      toast.success('Parâmetros copiados');
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parâmetros de URL para o Facebook</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cole este bloco no Gerenciador de Anúncios → Anúncio → Editar → Rastreamento → <b>Parâmetros de URL</b>. Sem <code>?</code> no início. Configure no nível do <b>anúncio</b>, não da campanha nem do conjunto.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea readOnly value={URL_PARAMS_TEMPLATE} className="font-mono text-xs h-24" onFocus={(e) => e.currentTarget.select()} />
        <div className="flex justify-end">
          <Button size="sm" onClick={copy}><Copy className="h-3.5 w-3.5 mr-2" /> Copiar parâmetros</Button>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <p><b>Quando usar:</b> anúncios que direcionam para página de vendas, formulário Vendus, quiz, funil, landing externa ou webchat.</p>
          <p><b>Click-to-WhatsApp:</b> não depende destes parâmetros — a atribuição usa <code>ctwa_clid</code>/<code>referral</code> entregues pelo webhook automaticamente.</p>
          <p>A Meta substitui <code>{'{{campaign.name}}'}</code>, <code>{'{{ad.id}}'}</code> etc. pelos valores reais no momento do clique. O Vendus interpreta o formato <code>Nome|ID</code> ao receber o lead.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricBox({ label, value, pct }: { label: string; value: number; pct: number | null }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value.toLocaleString('pt-BR')}</div>
      {pct !== null && <div className="text-xs text-muted-foreground mt-1">{pct}% dos leads</div>}
    </div>
  );
}

// ============ CAPI EVENTS SUB-TAB (mantém a tabela original) ============
type Row = {
  id: string; event_type: string; status: string;
  dedup_key: string; sent_at: string | null; created_at: string;
  error_message: string | null; retry_count: number;
  lead_id: string | null;
  payload: { custom_data?: Record<string, unknown> } | null;
};

function CapiEventsSubTab({ orgId }: { orgId: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('marketing_conversion_events')
      .select('id, event_type, status, dedup_key, sent_at, created_at, error_message, retry_count, lead_id, payload')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200);
    setRows((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [orgId]);

  const reprocess = async (r: Row) => {
    const t = toast.loading('Reenviando…');
    const customData = r.payload?.custom_data ?? {};
    const { error } = await supabase.functions.invoke('meta-capi-dispatcher', {
      body: {
        organization_id: orgId,
        event_type: r.event_type,
        event_id: r.dedup_key,
        lead_id: r.lead_id,
        value: typeof customData.value === 'number' ? customData.value : null,
        currency: typeof customData.currency === 'string' ? customData.currency : 'BRL',
        order_id: typeof customData.order_id === 'string' ? customData.order_id : null,
        custom_data: customData,
        force_retry: true,
      },
    });
    if (error) toast.error(error.message, { id: t });
    else { toast.success('Enfileirado', { id: t }); load(); }
  };

  const badge = (s: string) => {
    if (s === 'sent') return <Badge>Enviado</Badge>;
    if (s === 'failed') return <Badge variant="destructive">Falhou</Badge>;
    if (s === 'skipped') return <Badge variant="outline">Ignorado</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <div className="p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Eventos enviados para a Meta (Conversions API)</h3>
            <p className="text-xs text-muted-foreground">200 mais recentes. Dedup pelo event_id canônico ou pela chave estável do CRM.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Atualizar
          </Button>
        </div>
        {loading && <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}
        {!loading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dedup</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead>Enviado</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum evento CAPI ainda.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.event_type}</TableCell>
                  <TableCell>{badge(r.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[220px]">{r.dedup_key}</TableCell>
                  <TableCell className="text-xs">{r.retry_count ?? 0}</TableCell>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="text-xs">{r.sent_at ? new Date(r.sent_at).toLocaleString('pt-BR') : '—'}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-[220px] truncate">{r.error_message ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => reprocess(r)}
                      disabled={r.status !== 'failed' && r.status !== 'skipped'}
                    >
                      Reprocessar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============ DIAGNOSTICS SUB-TAB (Evolution logs) ============
type EvoLog = {
  id: string; event_type: string | null; remote_jid: string | null;
  has_external_ad_reply: boolean; ctwa_clid: string | null; ad_source_id: string | null;
  created_at: string;
};

function DiagnosticsSubTab({ orgId }: { orgId: string | null }) {
  const [rows, setRows] = useState<EvoLog[]>([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('evolution_webhook_logs')
      .select('id, event_type, remote_jid, has_external_ad_reply, ctwa_clid, ad_source_id, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100);
    setRows((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [orgId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Diagnóstico Evolution — Click-to-WhatsApp</CardTitle>
        <p className="text-xs text-muted-foreground">
          Últimos 100 payloads recebidos com externalAdReply / ctwa_clid. Se estiver vazio, os anúncios de CTWA podem não estar chegando pela sua conexão Evolution.
        </p>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <div className="p-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Atualizar
          </Button>
        </div>
        {loading && <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}
        {!loading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Remote JID</TableHead>
                <TableHead>externalAdReply</TableHead>
                <TableHead>ctwa_clid</TableHead>
                <TableHead>Ad ID</TableHead>
                <TableHead>Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum log capturado ainda.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.event_type ?? '—'}</TableCell>
                  <TableCell className="text-xs">{r.remote_jid ?? '—'}</TableCell>
                  <TableCell>{r.has_external_ad_reply ? <Badge>sim</Badge> : <Badge variant="outline">não</Badge>}</TableCell>
                  <TableCell className="text-xs">{r.ctwa_clid ?? '—'}</TableCell>
                  <TableCell className="text-xs">{r.ad_source_id ?? '—'}</TableCell>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString('pt-BR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============ SHELL ============
export function TechnicalTab() {
  const { orgId, metaCredentialId } = useMarketingCtx();

  return (
    <Tabs defaultValue="config" className="mt-2">
      <TabsList>
        <TabsTrigger value="config">Configuração</TabsTrigger>
        <TabsTrigger value="params">Parâmetros</TabsTrigger>
        <TabsTrigger value="capi">Eventos CAPI</TabsTrigger>
        <TabsTrigger value="diag">Diagnóstico</TabsTrigger>
      </TabsList>
      <TabsContent value="config" className="mt-4"><CapiConfigSubTab orgId={orgId} credentialId={metaCredentialId} /></TabsContent>
      <TabsContent value="params" className="mt-4"><ParamsSubTab orgId={orgId} /></TabsContent>
      <TabsContent value="capi" className="mt-4"><CapiEventsSubTab orgId={orgId} /></TabsContent>
      <TabsContent value="diag" className="mt-4"><DiagnosticsSubTab orgId={orgId} /></TabsContent>
    </Tabs>
  );
}
