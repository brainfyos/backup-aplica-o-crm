import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Save, Loader2, Instagram, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

async function fnError(e: any): Promise<string> {
  if (e instanceof FunctionsHttpError) {
    try { const b = await e.context.json(); return b?.error || b?.details || e.message; } catch {}
  }
  return e?.message ?? String(e);
}

export function MetaOAuthSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState({
    app_id: '',
    app_secret: '',
    graph_version: 'v21.0',
    enabled: false,
    has_secret: false,
    callback_url: '',
    scopes_override: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-oauth-admin', { method: 'GET' as any });
      if (error) throw error;
      setState((s) => ({ ...s, ...data, app_secret: '' }));
    } catch (e) {
      toast.error(await fnError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {
        app_id: state.app_id,
        graph_version: state.graph_version,
        enabled: state.enabled,
        scopes_override: state.scopes_override,
      };
      if (state.app_secret) payload.app_secret = state.app_secret;
      const { error } = await supabase.functions.invoke('meta-oauth-admin', { body: payload });
      if (error) throw error;
      toast.success('Credenciais Meta salvas.');
      await load();
    } catch (e) {
      toast.error(await fnError(e));
    } finally {
      setSaving(false);
    }
  };

  const copyCallback = () => {
    navigator.clipboard.writeText(state.callback_url);
    toast.success('URL copiada');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Instagram className="h-6 w-6" /> Meta OAuth (Instagram + Ads)
        </h1>
        <p className="text-muted-foreground">
          Registre um único Meta App aqui e todas as empresas conseguem conectar Instagram e Meta Ads em 1 clique.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credenciais do Meta App</CardTitle>
          <CardDescription>
            Crie um app em <a className="underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a>{' '}
            e adicione os produtos <b>Facebook Login</b>, <b>Instagram Graph API</b> e <b>Marketing API</b>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL de callback (cole em Facebook Login → Valid OAuth Redirect URIs)</Label>
            <div className="flex gap-2">
              <Input value={state.callback_url} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copyCallback}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>App ID</Label>
              <Input
                value={state.app_id}
                onChange={(e) => setState((s) => ({ ...s, app_id: e.target.value }))}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label>Graph API Version</Label>
              <Input
                value={state.graph_version}
                onChange={(e) => setState((s) => ({ ...s, graph_version: e.target.value }))}
                placeholder="v21.0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>App Secret {state.has_secret && <Badge variant="secondary" className="ml-2">Salvo</Badge>}</Label>
            <Input
              type="password"
              value={state.app_secret}
              onChange={(e) => setState((s) => ({ ...s, app_secret: e.target.value }))}
              placeholder={state.has_secret ? '•••••••• (deixe em branco para manter)' : 'Cole o App Secret'}
            />
            <p className="text-xs text-muted-foreground">Criptografado com AES-256-GCM. Nunca fica exposto ao browser.</p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch checked={state.enabled} onCheckedChange={(v) => setState((s) => ({ ...s, enabled: v }))} />
            <div>
              <div className="font-medium">Habilitar OAuth para clientes</div>
              <div className="text-xs text-muted-foreground">
                Quando ligado, o botão "Conectar com Facebook" aparece nas empresas.
              </div>
            </div>
          </div>

          <Button onClick={save} disabled={saving || loading} size="lg">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permissões (scopes)</CardTitle>
          <CardDescription>
            No Meta App Dashboard, vá em <b>App Review → Permissions and Features</b> e clique em{' '}
            <b>Request</b> nas permissões abaixo. O acesso de teste funciona apenas para administradores,
            desenvolvedores e testadores do app; para conectar clientes reais, a Meta exige Acesso Avançado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm">
                <div className="font-semibold">Publicação e permissões são etapas diferentes</div>
                <p className="mt-1 text-muted-foreground">
                  Mesmo com o app publicado, permissões marcadas como "Pronto para teste" ainda não atendem
                  contas de clientes. Solicite Acesso Avançado somente para os escopos usados pelo Vendus.
                </p>
              </div>
              {state.app_id && (
                <Button variant="outline" size="sm" asChild className="shrink-0">
                  <a
                    href={`https://developers.facebook.com/apps/${state.app_id}/app-review/permissions/`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Revisar na Meta <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <b>Erro "Invalid Scopes"?</b> Significa que essas permissões ainda não foram adicionadas no seu App. Adicione todas do bloco Instagram (para Direct) e/ou Ads (para Meta Ads) — só depois habilite o OAuth.
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Instagram Direct</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {['pages_show_list','instagram_basic','instagram_manage_messages','pages_messaging','pages_manage_metadata'].map((s) => (
                <Badge key={s} variant="outline">{s}</Badge>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Meta Ads</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {['ads_read','ads_management','business_management'].map((s) => (
                <Badge key={s} variant="outline">{s}</Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <Label>Override manual de escopos (opcional)</Label>
            <Textarea
              value={state.scopes_override}
              onChange={(e) => setState((s) => ({ ...s, scopes_override: e.target.value }))}
              placeholder="Deixe em branco para usar os presets acima. Ex.: pages_show_list,instagram_basic"
              className="font-mono text-xs"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Liste APENAS as permissões que você já adicionou no App Dashboard, separadas por vírgula. Se estiver testando com um subconjunto, coloque aqui para o OAuth parar de pedir as demais.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
