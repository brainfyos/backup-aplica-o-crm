import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, ExternalLink, Copy, CheckCircle2, AlertTriangle, Info, Instagram, ShieldAlert } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import {
  useDraftInstagramConnection,
  useSaveInstagramConnection,
  type InstagramConnection,
} from '@/hooks/useInstagramConnections';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: InstagramConnection | null;
}

type AuthStyle = 'ig_user_token' | 'page_token';
const TOTAL_STEPS = 5;

export function InstagramWizard({ open, onClose, editing }: Props) {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [authStyle, setAuthStyle] = useState<AuthStyle>('ig_user_token');
  const [form, setForm] = useState({
    display_name: '',
    app_id: '',
    app_secret: '',
    fb_page_id: '',
    ig_business_account_id: '',
    page_access_token: '',
    ig_user_access_token: '',
  });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [webhookOk, setWebhookOk] = useState(false);

  const draft = useDraftInstagramConnection();
  const save = useSaveInstagramConnection();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setAuthStyle((editing.ig_auth_style as AuthStyle) ?? 'page_token');
      setForm({
        display_name: editing.display_name ?? '',
        app_id: editing.app_id ?? '',
        app_secret: '',
        fb_page_id: editing.fb_page_id ?? '',
        ig_business_account_id: editing.ig_business_account_id ?? '',
        page_access_token: '',
        ig_user_access_token: '',
      });
      setDraftId(editing.id);
      setVerifyToken(editing.webhook_verify_token ?? '');
      setWebhookUrl(
        editing.id
          ? `${(import.meta.env.VITE_SUPABASE_URL as string) ?? ''}/functions/v1/instagram-webhook/${editing.id}`
          : ''
      );
      setWebhookOk(!!editing.webhook_subscribed_at);
      setStep(editing.status === 'draft' ? 3 : 4);
    } else {
      setStep(1);
      setAuthStyle('page_token');
      setDraftId(null);
      setWebhookUrl('');
      setVerifyToken('');
      setWebhookOk(false);
      setForm({
        display_name: '', app_id: '', app_secret: '',
        fb_page_id: '', ig_business_account_id: '',
        page_access_token: '', ig_user_access_token: '',
      });
    }
  }, [editing, open]);

  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (step !== 3 || !draftId || webhookOk) return;
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase
        .from('instagram_connections' as any)
        .select('webhook_subscribed_at')
        .eq('id', draftId)
        .maybeSingle();
      if ((data as any)?.webhook_subscribed_at) {
        setWebhookOk(true);
        if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, 3000);
    return () => { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step, draftId, webhookOk]);

  const handleCreateDraft = async () => {
    if (!profile?.organization_id) return;
    if (!form.display_name.trim()) { toast.error('Dê um nome para esta conexão'); return; }
    const res = await draft.mutateAsync({
      organization_id: profile.organization_id,
      display_name: form.display_name.trim(),
      connection_id: draftId ?? undefined,
    });
    setDraftId(res.connection_id);
    setWebhookUrl(res.webhook_url);
    setVerifyToken(res.verify_token);
    setWebhookOk(!!res.webhook_subscribed_at);
    setStep(3);
  };

  const handleActivate = async () => {
    if (!profile?.organization_id || !draftId) return;

    if (authStyle === 'ig_user_token') {
      if (!form.app_id || !form.ig_business_account_id || !form.ig_user_access_token) {
        toast.error('Preencha App ID, Instagram Business Account ID e IG User Access Token'); return;
      }
    } else {
      if (!form.app_id || !form.ig_business_account_id || !form.page_access_token) {
        toast.error('Preencha App ID, IG Business Account ID e Page Access Token (User Token também é aceito).'); return;
      }
    }

    const res: any = await save.mutateAsync({
      connection_id: draftId,
      organization_id: profile.organization_id,
      display_name: form.display_name,
      app_id: form.app_id,
      app_secret: form.app_secret || undefined,
      ig_business_account_id: form.ig_business_account_id,
      ig_auth_style: authStyle,
      ...(authStyle === 'page_token'
        ? { fb_page_id: form.fb_page_id || undefined, page_access_token: form.page_access_token }
        : { ig_user_access_token: form.ig_user_access_token }),
    });
    if (res?.ok) onClose();
  };

  const copy = (s: string) => { navigator.clipboard.writeText(s); toast.success('Copiado'); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-pink-500" />
            Instagram Direct (Meta) — Passo {step} de {TOTAL_STEPS}
          </DialogTitle>
          <DialogDescription>
            Conexão BYO: você usa seu próprio Meta App e a sua conta Instagram profissional.
            Credenciais ficam criptografadas e só esta empresa as enxerga.
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1 — Escolha do modo + pré-requisitos */}
        {step === 1 && (
          <div className="space-y-4">
            <Alert className="border-pink-500/40">
              <ShieldAlert className="h-4 w-4 text-pink-600" />
              <AlertTitle>Esta conexão é SEPARADA do WhatsApp Oficial</AlertTitle>
              <AlertDescription className="text-sm">
                Use credenciais, webhook e Verify Token <strong>exclusivos do Instagram</strong>.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>Como você quer conectar?</Label>
              <RadioGroup value={authStyle} onValueChange={(v) => setAuthStyle(v as AuthStyle)} className="grid gap-2">
                <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="page_token" className="mt-1" />
                  <div className="space-y-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      Página do Facebook
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        Recomendado
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Compatível com <strong>todos os recursos</strong>: responder e curtir comentários, resposta privada
                      e DMs. Requer Página do Facebook vinculada ao Instagram Business e Page Access Token com os escopos{' '}
                      <code>pages_manage_metadata</code>, <code>pages_messaging</code>, <code>instagram_manage_messages</code>,{' '}
                      <code>instagram_manage_comments</code>.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-dashed p-3 opacity-60 cursor-not-allowed">
                  <RadioGroupItem value="ig_user_token" className="mt-1" disabled />
                  <div className="space-y-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      Instagram Business Login
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        Em breve
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Novo padrão da Meta (App "API do Instagram com Login do Instagram"). Ainda não suporta curtir
                      comentários no nosso app — em validação. Conexões já ativas nesse modo continuam funcionando
                      normalmente.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Pré-requisitos</AlertTitle>
              <AlertDescription className="space-y-1.5 mt-2 text-sm">
                <p>• Conta Instagram convertida em <strong>Business ou Creator</strong>.</p>
                <p>• Conta Meta Business + Meta App próprio (não use o do WhatsApp).</p>
                {authStyle === 'ig_user_token' ? (
                  <p>• Escopos concedidos: <code>instagram_business_basic</code>, <code>instagram_business_manage_messages</code>, <code>instagram_business_manage_comments</code>, <code>instagram_manage_engagement</code>, <code>instagram_business_content_publish</code>.</p>
                ) : (
                  <>
                    <p>• <strong>Página do Facebook</strong> vinculada à conta IG.</p>
                    <p>• Escopos: <code>instagram_basic</code>, <code>instagram_manage_messages</code>, <code>instagram_manage_comments</code>, <code>pages_manage_metadata</code>, <code>pages_messaging</code>, <code>pages_show_list</code>.</p>
                  </>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* STEP 2 — Criar Meta App */}
        {step === 2 && (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Configure seu Meta App</AlertTitle>
              <AlertDescription className="space-y-1.5 mt-2 text-sm">
                {authStyle === 'ig_user_token' ? (
                  <>
                    <p>1. Em <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-primary underline">Meta for Developers</a>, no seu App, adicione o produto <strong>API do Instagram com Login do Instagram</strong>.</p>
                    <p>2. Em Configurações → Básico anote <strong>App ID</strong> e <strong>App Secret</strong>.</p>
                    <p>3. No Business Manager, vincule sua conta <strong>Instagram Business</strong> ao Business.</p>
                    <p>4. Crie um <strong>System User</strong> (Business Manager → Usuários do Sistema), dê acesso Completo à conta IG e gere um <strong>Token permanente</strong> com todos os escopos <code>instagram_business_*</code> que aparecem no seu App, incluindo <code>instagram_manage_engagement</code> para curtir comentários.</p>
                  </>
                ) : (
                  <>
                    <p>1. Em <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-primary underline">Meta for Developers</a>, crie/edite um App tipo <strong>Business</strong>.</p>
                    <p>2. Adicione o produto <strong>Messenger</strong> (ou Instagram Messaging via Facebook Login for Business).</p>
                    <p>3. Vincule sua <strong>Página do Facebook</strong> e a conta <strong>Instagram Business</strong>.</p>
                    <p>4. Em Configurações → Básico anote <strong>App ID</strong> e <strong>App Secret</strong>.</p>
                  </>
                )}
              </AlertDescription>
            </Alert>
            <Button asChild variant="outline" className="w-full">
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />Abrir Meta for Developers
              </a>
            </Button>
            <div className="space-y-2">
              <Label>Nome da conexão</Label>
              <Input
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Ex.: Instagram @minhamarca"
              />
              <p className="text-xs text-muted-foreground">Usado só internamente para identificar essa conexão.</p>
            </div>
          </div>
        )}

        {/* STEP 3 — Webhook */}
        {step === 3 && (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>URL exclusiva desta conexão Instagram</AlertTitle>
              <AlertDescription className="text-sm">
                Não use a URL do WhatsApp aqui. Cada conexão tem URL e Verify Token próprios.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label>URL de callback</Label>
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copy(webhookUrl)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Verify Token</Label>
              <div className="flex gap-2">
                <Input readOnly value={verifyToken} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copy(verifyToken)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>No painel do seu Meta App</AlertTitle>
              <AlertDescription className="space-y-1.5 mt-2 text-sm">
                {authStyle === 'ig_user_token' ? (
                  <>
                    <p>1. Vá em <strong>API do Instagram com Login do Instagram → Configurar webhooks</strong>.</p>
                    <p>2. Cole a <strong>URL de callback</strong> e o <strong>Verify Token</strong> acima.</p>
                    <p>3. Clique em <strong>Verificar e salvar</strong>.</p>
                    <p>4. Assine os campos: <code>messages</code>, <code>messaging_postbacks</code>, <code>message_reactions</code>, <code>comments</code>, <code>mentions</code>.</p>
                  </>
                ) : (
                  <>
                    <p>1. Vá em <strong>Messenger</strong> (ou Webhooks) → <strong>Configurar webhooks</strong>.</p>
                    <p>2. Cole a <strong>URL de callback</strong> e o <strong>Verify Token</strong> acima.</p>
                    <p>3. Clique em <strong>Verificar e salvar</strong>.</p>
                    <p>4. Assine o campo <strong>messages</strong> (opcional: <code>messaging_postbacks</code>, <code>message_reactions</code>).</p>
                  </>
                )}
              </AlertDescription>
            </Alert>

            {webhookOk ? (
              <Alert className="border-green-500/40 bg-green-50 dark:bg-green-950/30">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle>Webhook verificado pela Meta ✅</AlertTitle>
                <AlertDescription>Pode avançar para colar suas credenciais.</AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Aguardando a Meta validar...</AlertTitle>
                <AlertDescription className="text-sm">
                  Quando você clicar em "Verificar e salvar" no Meta, a confirmação aparece aqui automaticamente.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* STEP 4 — Credenciais */}
        {step === 4 && (
          <div className="space-y-3">
            {authStyle === 'ig_user_token' ? (
              <>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Como pegar cada dado (Instagram Business Login)</AlertTitle>
                  <AlertDescription className="text-sm mt-1">Todos os links abrem em nova aba.</AlertDescription>
                </Alert>

                <Accordion type="single" collapsible className="border rounded-lg px-3">
                  <AccordionItem value="1">
                    <AccordionTrigger className="text-sm">1. App ID + App Secret</AccordionTrigger>
                    <AccordionContent className="text-sm space-y-2">
                      <p>No seu Meta App: <strong>Configurações → Básico</strong>. Copie o App ID e clique em Mostrar ao lado do App Secret.</p>
                      <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Abrir Meta for Developers <ExternalLink className="h-3 w-3" />
                      </a>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="2">
                    <AccordionTrigger className="text-sm">2. Instagram Business Account ID</AccordionTrigger>
                    <AccordionContent className="text-sm space-y-2">
                      <p>No <strong>Business Manager → Contas → Contas do Instagram</strong>, clique na conta @minhamarca. O ID aparece na URL e nos detalhes da conta.</p>
                      <a href="https://business.facebook.com/settings/instagram-accounts" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Abrir Business → Contas do Instagram <ExternalLink className="h-3 w-3" />
                      </a>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="3">
                    <AccordionTrigger className="text-sm font-semibold text-primary">3. IG User Access Token (System User — não expira) ⭐</AccordionTrigger>
                    <AccordionContent className="text-sm space-y-3">
                      <ol className="list-decimal ml-5 space-y-1">
                        <li>Business Manager → <strong>Usuários do Sistema</strong>. Crie ou reaproveite um System User com função <strong>Admin</strong>.</li>
                        <li>Em <strong>Adicionar ativos</strong>, dê a esse System User acesso <strong>Total</strong> à conta do Instagram (@minhamarca) e ao seu App.</li>
                        <li>Clique em <strong>Gerar token</strong>. Selecione o seu App. Em <strong>Duração do token</strong> escolha <strong>Nunca</strong>.</li>
                        <li>Marque TODOS os escopos <code>instagram_business_*</code> disponíveis e também <code>instagram_manage_engagement</code> quando aparecer, especialmente <code>instagram_business_manage_messages</code> e <code>instagram_business_manage_comments</code>.</li>
                        <li>Copie o token gerado — ele é <strong>permanente</strong>.</li>
                      </ol>
                      <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Abrir Business → System Users <ExternalLink className="h-3 w-3" />
                      </a>
                      <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/30">
                        <CheckCircle2 className="h-4 w-4 text-amber-600" />
                        <AlertTitle className="text-sm">Valide no Debugger</AlertTitle>
                        <AlertDescription className="text-xs">
                          Cole em <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noreferrer" className="underline">Access Token Debugger</a>: <strong>Expires = Never</strong>, escopos incluem <code>instagram_business_manage_messages</code>, <code>instagram_business_manage_comments</code> e <code>instagram_manage_engagement</code>.
                        </AlertDescription>
                      </Alert>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>App ID</Label>
                    <Input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} />
                  </div>
                  <div>
                    <Label>App Secret {editing && <span className="text-xs text-muted-foreground">(em branco mantém)</span>}</Label>
                    <Input type="password" value={form.app_secret} onChange={(e) => setForm({ ...form, app_secret: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Instagram Business Account ID</Label>
                  <Input value={form.ig_business_account_id} onChange={(e) => setForm({ ...form, ig_business_account_id: e.target.value })} />
                </div>
                <div>
                  <Label>IG User Access Token (System User — permanente)</Label>
                  <Input type="password" value={form.ig_user_access_token} onChange={(e) => setForm({ ...form, ig_user_access_token: e.target.value })} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Deve começar com <code>IGAA...</code> ou <code>EAAG...</code> e ter escopos <code>instagram_business_*</code>. Para curtir comentário, precisa de <code>instagram_manage_engagement</code>.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Credenciais — modo Página do Facebook</AlertTitle>
                </Alert>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>App ID</Label>
                    <Input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} />
                  </div>
                  <div>
                    <Label>App Secret {editing && <span className="text-xs text-muted-foreground">(em branco mantém)</span>}</Label>
                    <Input type="password" value={form.app_secret} onChange={(e) => setForm({ ...form, app_secret: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Facebook Page ID <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                    <Input value={form.fb_page_id} onChange={(e) => setForm({ ...form, fb_page_id: e.target.value })} />
                  </div>
                  <div>
                    <Label>Instagram Business Account ID</Label>
                    <Input value={form.ig_business_account_id} onChange={(e) => setForm({ ...form, ig_business_account_id: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Page Access Token (ou User Token — convertemos automaticamente)</Label>
                  <Input type="password" value={form.page_access_token} onChange={(e) => setForm({ ...form, page_access_token: e.target.value })} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Aceitamos Page Access Token ou User Access Token com <code>pages_show_list</code> — nesse caso descobrimos a Página automaticamente e descartamos o User Token. Escopos ideais: <code>pages_manage_metadata</code>, <code>pages_messaging</code>, <code>instagram_manage_messages</code>, <code>instagram_manage_comments</code>, <code>pages_read_engagement</code>.
                </p>
              </>
            )}
          </div>
        )}

        {/* STEP 5 — Resumo */}
        {step === 5 && (
          <div className="space-y-4">
            <Alert className="border-green-500/40 bg-green-50 dark:bg-green-950/30">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Pronto para ativar</AlertTitle>
              <AlertDescription className="text-sm">
                Vamos validar suas credenciais na Graph API, criptografá-las e inscrever sua conta no app.
              </AlertDescription>
            </Alert>

            <div className="rounded-md border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Modo</span>
                <Badge variant="outline">{authStyle === 'ig_user_token' ? 'Instagram Business Login' : 'Página do Facebook'}</Badge>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Webhook</span>
                {webhookOk ? <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Verificado pela Meta</Badge>
                : <Badge variant="secondary">Pendente</Badge>}
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">App ID</span><span className="font-mono text-xs">{form.app_id}</span></div>
              {authStyle === 'page_token' && (
                <div className="flex justify-between"><span className="text-muted-foreground">Page ID</span><span className="font-mono text-xs">{form.fb_page_id}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">IG Account ID</span><span className="font-mono text-xs">{form.ig_business_account_id}</span></div>
            </div>

            {!webhookOk && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  O webhook ainda não foi verificado pela Meta. Você pode ativar mesmo assim, mas só receberá mensagens depois que ele for validado.
                </AlertDescription>
              </Alert>
            )}

            {save.error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Falha ao ativar</AlertTitle>
                <AlertDescription className="text-sm break-words">
                  {(save.error as Error)?.message ?? 'Erro desconhecido'}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && step < 5 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>Voltar</Button>
          )}
          {step === 1 && <Button onClick={() => setStep(2)}>Avançar</Button>}
          {step === 2 && (
            <Button onClick={handleCreateDraft} disabled={draft.isPending || !form.display_name.trim()}>
              {draft.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar URL e Verify Token
            </Button>
          )}
          {step === 3 && <Button onClick={() => setStep(4)}>Avançar para credenciais</Button>}
          {step === 4 && <Button onClick={() => setStep(5)}>Revisar e ativar</Button>}
          {step === 5 && (
            <Button onClick={handleActivate} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Validar e ativar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
