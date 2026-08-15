import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ExternalLink, CheckCircle2, XCircle, AlertTriangle,
  Eye, EyeOff, ArrowRight, ArrowLeft, RefreshCw, Plug, Trash2, LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';

async function extractFnError(error: any): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      return body?.details || body?.error || error.message;
    } catch {
      try { return await error.context.text(); } catch { /* ignore */ }
    }
  }
  return error?.message ?? String(error);
}

type CheckStatus = 'ok' | 'warn' | 'fail';
interface Check { key: string; label: string; status: CheckStatus; message: string }
interface ValidateResult { ok: boolean; checks: Check[]; account?: any }

type Credential = {
  id: string;
  ad_account_id: string | null;
  business_id: string | null;
  account_name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

function rel(dt: string | null) {
  if (!dt) return 'nunca';
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h atrás`;
  return `${Math.floor(h / 24)} d atrás`;
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Preparar conta', 'Colar credenciais', 'Validar'];
  return (
    <div className="flex items-center gap-2 mb-6">
      {labels.map((l, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = step === n;
        const done = step > n;
        return (
          <div key={l} className="flex items-center gap-2 flex-1">
            <div className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shrink-0 border',
              done && 'bg-emerald-500 border-emerald-500 text-white',
              active && !done && 'bg-primary border-primary text-primary-foreground',
              !active && !done && 'border-border text-muted-foreground',
            )}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : n}
            </div>
            <span className={cn('text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>{l}</span>
            {n < 3 && <div className={cn('flex-1 h-px', done ? 'bg-emerald-500' : 'bg-border')} />}
          </div>
        );
      })}
    </div>
  );
}

function CheckRow({ c, loading }: { c?: Check; loading?: boolean }) {
  if (loading) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-0.5" />
        <div className="text-sm text-muted-foreground">Verificando…</div>
      </div>
    );
  }
  if (!c) return null;
  const cfg = {
    ok: { icon: CheckCircle2, cls: 'text-emerald-500', bg: 'bg-emerald-500/5 border-emerald-500/20' },
    warn: { icon: AlertTriangle, cls: 'text-amber-500', bg: 'bg-amber-500/5 border-amber-500/20' },
    fail: { icon: XCircle, cls: 'text-destructive', bg: 'bg-destructive/5 border-destructive/20' },
  }[c.status];
  const Icon = cfg.icon;
  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg border', cfg.bg)}>
      <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', cfg.cls)} />
      <div className="min-w-0">
        <div className="text-sm font-medium">{c.label}</div>
        <div className="text-xs text-muted-foreground mt-0.5 break-words">{c.message}</div>
      </div>
    </div>
  );
}

export function MetaAdsWizard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const orgId = profile?.organization_id ?? null;

  const [loading, setLoading] = useState(true);
  const [cred, setCred] = useState<Credential | null>(null);
  const [wizardMode, setWizardMode] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [adAccountId, setAdAccountId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadCredential = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from('org_marketing_credentials')
      .select('id, ad_account_id, business_id, account_name, is_active, last_sync_at, last_sync_status, last_sync_error')
      .eq('organization_id', orgId).eq('provider', 'meta').eq('is_active', true)
      .order('account_name');
    const list = (data ?? []) as Credential[];
    const storedId = window.localStorage.getItem(`marketing.selectedCredential.${orgId}`);
    setCred(list.find((item) => item.id === storedId) ?? list[0] ?? null);
    setLoading(false);
  };

  useEffect(() => { loadCredential(); }, [orgId]);

  const resetWizard = () => {
    setStep(1); setAccessToken(''); setAdAccountId(''); setAccountName('');
    setResult(null); setShowToken(false);
  };

  const startWizard = () => { resetWizard(); setWizardMode(true); };

  const handleValidate = async () => {
    if (!accessToken.trim() || !adAccountId.trim()) {
      toast.error('Preencha token e Ad Account ID');
      return;
    }
    setStep(3);
    setValidating(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('meta-ads-validate', {
        body: { access_token: accessToken.trim(), ad_account_id: adAccountId.trim() },
      });
      if (error) throw new Error(await extractFnError(error));
      setResult(data as ValidateResult);
    } catch (e: any) {
      toast.error(`Falha na validação: ${e?.message ?? e}`);
      setStep(2);
    } finally {
      setValidating(false);
    }
  };

  const handleFinish = async () => {
    if (!result?.ok) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('marketing-connect', {
        body: {
          access_token: accessToken.trim(),
          ad_account_id: adAccountId.trim(),
          business_id: result.account?.business_id ?? null,
          account_name: accountName.trim() || result.account?.name || null,
        },
      });
      if (error) throw new Error(await extractFnError(error));
      if ((data as any)?.error) throw new Error((data as any).details || (data as any).error);
      const newCredentialId = (data as any)?.credential?.id;
      if (newCredentialId && orgId) {
        window.localStorage.setItem(`marketing.selectedCredential.${orgId}`, newCredentialId);
      }
      toast.success('Meta Ads conectado — sincronizando em background');
      // dispara sync sem esperar
      supabase.functions.invoke('marketing-sync', {
        body: { organization_id: orgId, credential_id: newCredentialId, provider: 'meta' },
      }).catch(() => {});
      setWizardMode(false);
      await loadCredential();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!orgId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('marketing-sync', {
        body: { organization_id: orgId, credential_id: cred?.id, provider: 'meta' },
      });
      if (error) throw new Error(await extractFnError(error));
      if ((data as any)?.error) throw new Error((data as any).details || (data as any).error);
      toast.success('Sincronização concluída');
      await loadCredential();
    } catch (e: any) {
      toast.error(`Falha no sync: ${e?.message ?? e}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!cred) return;
    if (!confirm('Desconectar Meta Ads? O catálogo permanece salvo mas a sincronização para.')) return;
    const { error } = await supabase.from('org_marketing_credentials').update({ is_active: false }).eq('id', cred.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Meta Ads desconectado');
    setCred(null);
  };

  const checksByKey = useMemo(() => {
    const m: Record<string, Check> = {};
    (result?.checks ?? []).forEach((c) => { m[c.key] = c; });
    return m;
  }, [result]);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…</div>;
  }

  // ============ ESTADO CONECTADO ============
  if (cred && !wizardMode) {
    return (
      <div className="space-y-5">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10">Conectado</Badge>
                  {cred.last_sync_status === 'ok' ? (
                    <span className="text-xs text-muted-foreground">última sync {rel(cred.last_sync_at)}</span>
                  ) : cred.last_sync_status ? (
                    <span className="text-xs text-destructive">falha na última sync</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">aguardando primeira sync</span>
                  )}
                </div>
                <div className="text-lg font-semibold">{cred.account_name || cred.ad_account_id}</div>
                <div className="text-xs text-muted-foreground font-mono">{cred.ad_account_id}</div>
                {cred.last_sync_error && (
                  <div className="text-xs text-destructive mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> {cred.last_sync_error}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sincronizar agora
              </Button>
              <Button size="sm" variant="outline" onClick={startWizard}>
                <Plug className="h-4 w-4 mr-2" /> Trocar conta
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate('/admin?tab=marketing')}>
                <LayoutDashboard className="h-4 w-4 mr-2" /> Ver painel completo
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDisconnect} className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Desconectar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============ WIZARD ============
  return (
    <div className="space-y-4">
      <Stepper step={step} />

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold">Conecte sua conta do Meta Ads</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Trazemos campanhas do Facebook e Instagram Ads para dentro do CRM e ligamos os cliques em anúncios
              (CTWA) aos leads que chegam no WhatsApp.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <div className="text-sm font-medium">Você precisa de:</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="text-primary">1.</span> Uma conta no <strong>Meta Business Manager</strong> com acesso à sua Conta de Anúncios.</li>
              <li className="flex gap-2"><span className="text-primary">2.</span> Um <strong>System User Access Token</strong> gerado em <em>Configurações do Negócio → Usuários do Sistema</em>.</li>
              <li className="flex gap-2"><span className="text-primary">3.</span> Permissões: <code className="text-xs bg-background px-1 py-0.5 rounded">ads_read</code>, <code className="text-xs bg-background px-1 py-0.5 rounded">business_management</code>, <code className="text-xs bg-background px-1 py-0.5 rounded">read_insights</code>.</li>
            </ul>
          </div>

          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">
            💡 Recomendamos <strong>token de longa duração</strong> (não expira). Tokens curtos precisam ser renovados a cada 60 dias.
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" asChild>
              <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer">
                Abrir Meta Business <ExternalLink className="h-3.5 w-3.5 ml-2" />
              </a>
            </Button>
            <Button onClick={() => setStep(2)}>
              Já tenho, continuar <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold">Cole suas credenciais</h3>
            <p className="text-sm text-muted-foreground mt-1">
              O token é criptografado (AES-256-GCM) antes de ser armazenado e nunca fica visível no navegador.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mw-token">Access Token *</Label>
            <div className="relative">
              <Input
                id="mw-token" type={showToken ? 'text' : 'password'}
                value={accessToken} onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAG..." autoComplete="off" className="pr-10 font-mono text-xs"
              />
              <button type="button" onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mw-adacc">Ad Account ID *</Label>
              <Input
                id="mw-adacc" value={adAccountId}
                onChange={(e) => setAdAccountId(e.target.value)}
                placeholder="act_1234567890" className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Se colar sem <code>act_</code>, adicionamos automaticamente.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mw-name">Apelido da conta</Label>
              <Input
                id="mw-name" value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Ex: Conta Principal"
              />
              <p className="text-xs text-muted-foreground">Opcional — usamos o nome real da conta se vazio.</p>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Button>
            <Button onClick={handleValidate} disabled={!accessToken.trim() || !adAccountId.trim()}>
              Validar e conectar <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold">Validando conexão…</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Rodando 3 checks contra a API do Meta antes de salvar.
            </p>
          </div>

          <div className="space-y-2">
            <CheckRow c={checksByKey['token']} loading={validating && !checksByKey['token']} />
            <CheckRow c={checksByKey['permissions']} loading={validating && !!checksByKey['token'] && !checksByKey['permissions']} />
            <CheckRow c={checksByKey['ad_account']} loading={validating && !!checksByKey['permissions'] && !checksByKey['ad_account']} />
          </div>

          {result?.ok && result.account && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="pt-5 space-y-1">
                <div className="text-xs uppercase tracking-wide text-emerald-600 font-semibold">Conta validada</div>
                <div className="text-lg font-semibold">{result.account.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{result.account.id} · {result.account.currency}</div>
                {result.account.business_name && (
                  <div className="text-xs text-muted-foreground">Business: {result.account.business_name}</div>
                )}
              </CardContent>
            </Card>
          )}

          {!validating && (
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar e corrigir
              </Button>
              {result?.ok ? (
                <Button onClick={handleFinish} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Concluir conexão
                </Button>
              ) : (
                <Button onClick={handleValidate} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {cred && wizardMode && (
        <div className="pt-3 border-t">
          <Button variant="ghost" size="sm" onClick={() => { setWizardMode(false); resetWizard(); }}>
            Cancelar e voltar
          </Button>
        </div>
      )}
    </div>
  );
}
