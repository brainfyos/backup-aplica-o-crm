import { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  Send,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Pencil,
  KeyRound,
  CreditCard,
  Bell,
  Megaphone,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlatformEmailSettings, useUpdatePlatformEmailSettings, useCreateAuditLog } from '@/hooks/useSuperAdmin';
import { usePlatformTemplates, type PlatformEmailTemplate } from '@/hooks/usePlatformTemplates';
import { PlatformTemplateEditor } from './PlatformTemplateEditor';
import { EmailSendLogPanel } from './EmailSendLogPanel';

import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  acesso: { label: 'Acesso & Convites', icon: KeyRound, color: 'text-blue-500' },
  cobranca: { label: 'Cobrança', icon: CreditCard, color: 'text-amber-500' },
  sistema: { label: 'Sistema', icon: Bell, color: 'text-primary' },
  mala_direta: { label: 'Mala Direta', icon: Megaphone, color: 'text-purple-500' },
};

export function EmailSettings() {
  const { data: settings, isLoading } = usePlatformEmailSettings();
  const {
    data: templates,
    isLoading: loadingTemplates,
    error: templatesError,
    refetch: refetchTemplates,
  } = usePlatformTemplates();
  const updateSettings = useUpdatePlatformEmailSettings();
  const createAuditLog = useCreateAuditLog();

  const [editing, setEditing] = useState<PlatformEmailTemplate | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testTemplateSlug, setTestTemplateSlug] = useState('');
  const [testing, setTesting] = useState(false);

  const s = settings as Record<string, any> | null | undefined;
  const senderDomain = (s?.sender_domain as string | null) ?? '';
  const validatedAt = (s?.domain_validated_at as string | null) ?? null;
  const domainConfigured = !!senderDomain;

  const [domainForm, setDomainForm] = useState({
    sender_domain: '',
    from_domain: '',
    sender_name: '',
  });

  useEffect(() => {
    if (!s) return;
    setDomainForm({
      sender_domain: (s.sender_domain as string) ?? '',
      from_domain: (s.from_domain as string) ?? '',
      sender_name: (s.sender_name as string) ?? '',
    });
  }, [s?.sender_domain, s?.from_domain, s?.sender_name]);

  const activeTemplates = useMemo(
    () => (templates ?? []).filter((template) => template.is_active),
    [templates],
  );

  useEffect(() => {
    if (activeTemplates.length === 0) {
      setTestTemplateSlug('');
      return;
    }
    if (!activeTemplates.some((template) => template.slug === testTemplateSlug)) {
      setTestTemplateSlug(activeTemplates[0].slug);
    }
  }, [activeTemplates, testTemplateSlug]);

  const normalize = (v: string) =>
    v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^@/, '');

  const saveDomain = async () => {
    const sender = normalize(domainForm.sender_domain);
    if (!sender || !sender.includes('.')) {
      toast.error('Informe um domínio de envio válido');
      return;
    }
    const fromDom =
      normalize(domainForm.from_domain) ||
      (sender.split('.').length > 2 ? sender.split('.').slice(1).join('.') : sender);
    try {
      await updateSettings.mutateAsync({
        sender_domain: sender,
        from_domain: fromDom,
        sender_name: domainForm.sender_name.trim() || null,
      });
      await createAuditLog.mutateAsync({
        action: 'Domínio de e-mail atualizado',
        entity_type: 'platform_email_settings',
      });
      toast.success('Domínio salvo. Envie um e-mail de teste para validar.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao salvar domínio');
    }
  };

  const automation = {
    reminder_days_before: settings?.reminder_days_before ?? 3,
    reminder_on_due_date: settings?.reminder_on_due_date ?? true,
    alert_days_after: settings?.alert_days_after ?? 3,
    suspend_days_after: settings?.suspend_days_after ?? 15,
  };

  const saveAutomation = async (patch: Partial<typeof automation>) => {
    try {
      await updateSettings.mutateAsync({ ...automation, ...patch });
      await createAuditLog.mutateAsync({
        action: 'Automação de e-mail atualizada',
        entity_type: 'platform_email_settings',
      });
      toast.success('Automação salva');
    } catch {
      toast.error('Erro ao salvar');
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast.error('Informe um e-mail válido');
      return;
    }
    if (!testTemplateSlug) {
      toast.error('Selecione um modelo de e-mail');
      return;
    }
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke('test-integration', {
        body: { type: 'email', email: testEmail, templateSlug: testTemplateSlug },
      });
      if (error) throw error;
      if (domainConfigured) {
        await updateSettings.mutateAsync({ domain_validated_at: new Date().toISOString() });
      }
      toast.success(`E-mail de teste enfileirado para ${testEmail}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao enviar e-mail de teste');
    } finally {
      setTesting(false);
    }
  };


  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const templatesByCategory = (templates ?? []).reduce<Record<string, PlatformEmailTemplate[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações de E-mail</h1>
          <p className="text-muted-foreground">Provedor, templates e automações de e-mail da plataforma</p>
        </div>
      </div>

      <Tabs defaultValue="provider" className="space-y-6">
        <TabsList>
          <TabsTrigger value="provider">Provedor</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="automation">Automações</TabsTrigger>
        </TabsList>

        {/* Provider */}
        <TabsContent value="provider" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Lovable Emails
              </CardTitle>
              <CardDescription>
                Envio nativo de e-mails com domínio próprio, sem custo adicional
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {domainConfigured ? (
                <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium text-sm">
                      Domínio configurado: {senderDomain}
                      {validatedAt ? ' — validado' : ' — aguardando teste de envio'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Os e-mails da plataforma (login, convites, cobrança) usam este domínio.
                      {validatedAt
                        ? ` Último envio validado em ${new Date(validatedAt).toLocaleString('pt-BR')}.`
                        : ' Envie um e-mail de teste abaixo para confirmar a entrega.'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium text-sm">Domínio de envio não configurado</p>
                    <p className="text-sm text-muted-foreground">
                      Configure abaixo o domínio verificado desta instalação. Sem isso, e-mails de
                      recuperação de senha e convites podem ser recusados por usarem um remetente
                      de outra instalação.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Domínio de envio (verificado)</label>
                  <Input
                    placeholder="notify.suaempresa.com.br"
                    value={domainForm.sender_domain}
                    onChange={(e) => setDomainForm((p) => ({ ...p, sender_domain: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Subdomínio delegado ao Lovable Cloud, exatamente como aparece no painel de e-mail.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Domínio exibido no remetente</label>
                  <Input
                    placeholder="suaempresa.com.br"
                    value={domainForm.from_domain}
                    onChange={(e) => setDomainForm((p) => ({ ...p, from_domain: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Usado no endereço "De": noreply@{domainForm.from_domain || 'suaempresa.com.br'}
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nome do remetente</label>
                  <Input
                    placeholder="Sua Empresa"
                    value={domainForm.sender_name}
                    onChange={(e) => setDomainForm((p) => ({ ...p, sender_name: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Button onClick={saveDomain} disabled={updateSettings.isPending}>
                  Salvar domínio
                </Button>
              </div>

              <div className="border-t border-border pt-6 space-y-2">
                <p className="text-sm font-medium">Enviar e-mail de teste</p>
                <div className="grid gap-2 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)_auto]">
                  <Select value={testTemplateSlug} onValueChange={setTestTemplateSlug}>
                    <SelectTrigger aria-label="Modelo do e-mail de teste">
                      <SelectValue placeholder="Selecione um modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.slug}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="email"
                    placeholder="seu@email.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                  <Button onClick={handleTestEmail} disabled={testing || !testTemplateSlug}>
                    <Send className="h-4 w-4 mr-2" />
                    {testing ? 'Enviando...' : 'Enviar teste'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  O teste usa o modelo selecionado e passa pela mesma fila dos e-mails reais.
                </p>
              </div>
            </CardContent>
          </Card>

          <EmailSendLogPanel />
        </TabsContent>


        {/* Templates */}
        <TabsContent value="templates" className="space-y-4">
          {loadingTemplates ? (
            <Skeleton className="h-[400px] w-full" />
          ) : templatesError ? (
            <Card>
              <CardContent className="py-10 text-center space-y-3">
                <p className="text-sm text-destructive">Não foi possível carregar os templates.</p>
                <Button variant="outline" onClick={() => refetchTemplates()}>Tentar novamente</Button>
              </CardContent>
            </Card>
          ) : !templates || templates.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum template de plataforma foi instalado neste projeto.
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(CATEGORY_META).map(([cat, meta]) => {
              const items = templatesByCategory[cat] ?? [];
              if (items.length === 0) return null;
              const Icon = meta.icon;
              return (
                <Card key={cat}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                      {meta.label}
                      <Badge variant="outline" className="ml-2">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {items.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{tpl.name}</p>
                                {!tpl.is_active && (
                                  <Badge variant="secondary" className="text-xs">Inativo</Badge>
                                )}
                                {tpl.is_system && (
                                  <Badge variant="outline" className="text-xs">Sistema</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {tpl.description ?? tpl.subject}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(tpl)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Editar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Automation */}
        <TabsContent value="automation">
          <Card>
            <CardHeader>
              <CardTitle>Automações de Cobrança</CardTitle>
              <CardDescription>Quando os e-mails automáticos serão disparados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium">Lembrete antes do vencimento</p>
                    <p className="text-sm text-muted-foreground">
                      Enviar lembrete {automation.reminder_days_before} dias antes
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    defaultValue={automation.reminder_days_before}
                    onBlur={(e) => saveAutomation({ reminder_days_before: parseInt(e.target.value) })}
                    className="w-20"
                    min={1}
                    max={30}
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Cobrança no dia do vencimento</p>
                    <p className="text-sm text-muted-foreground">Enviar e-mail no dia D</p>
                  </div>
                </div>
                <Switch
                  checked={automation.reminder_on_due_date}
                  onCheckedChange={(c) => saveAutomation({ reminder_on_due_date: c })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="font-medium">Alerta de atraso</p>
                    <p className="text-sm text-muted-foreground">
                      Após {automation.alert_days_after} dias de atraso
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    defaultValue={automation.alert_days_after}
                    onBlur={(e) => saveAutomation({ alert_days_after: parseInt(e.target.value) })}
                    className="w-20"
                    min={1}
                    max={30}
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium">Suspensão automática</p>
                    <p className="text-sm text-muted-foreground">
                      Suspender após {automation.suspend_days_after} dias de atraso
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    defaultValue={automation.suspend_days_after}
                    onBlur={(e) => saveAutomation({ suspend_days_after: parseInt(e.target.value) })}
                    className="w-20"
                    min={1}
                    max={90}
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PlatformTemplateEditor
        template={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  );
}
