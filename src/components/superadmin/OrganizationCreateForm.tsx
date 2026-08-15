import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, Check, KeyRound, RefreshCw, Eye, EyeOff, Mail } from 'lucide-react';
import {
  useCreateOrganization,
  useCreateSubscription,
  useCreateAuditLog,
} from '@/hooks/useSuperAdmin';
import { supabase } from '@/integrations/supabase/client';
import { useActivePlans, PlatformPlan } from '@/hooks/usePlatformPlans';
import { getPublicAppUrl } from '@/lib/publicUrl';
import { generateProvisionalPassword } from '@/lib/generatePassword';

interface Props {
  onCreated?: (org: any) => void;
  onCancel?: () => void;
  hideStatusField?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
}

export function OrganizationCreateForm({
  onCreated,
  onCancel,
  hideStatusField,
  submitLabel = 'Criar Empresa',
  cancelLabel = 'Cancelar',
}: Props) {
  const { data: activePlans } = useActivePlans();
  const createOrganization = useCreateOrganization();
  const createSubscription = useCreateSubscription();
  const createAuditLog = useCreateAuditLog();

  const [newOrg, setNewOrg] = useState({
    name: '',
    email: '',
    cnpj: '',
    phone: '',
    max_users: 10,
    max_products: 5,
    status: 'active',
    plan_id: '' as string,
    customize: false,
  });
  const [password, setPassword] = useState(() => generateProvisionalPassword());
  const [showPassword, setShowPassword] = useState(false);

  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    password: string;
    loginUrl: string;
    nextPath?: string;
    org: any;
    emailSent: boolean;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copy = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success('Copiado!');
    setTimeout(() => setCopiedField(null), 1500);
  };

  const selectedPlan: PlatformPlan | undefined = activePlans?.find(
    (p) => p.id === newOrg.plan_id
  );

  const handleSelectPlan = (planId: string) => {
    const plan = activePlans?.find((p) => p.id === planId);
    setNewOrg((prev) => ({
      ...prev,
      plan_id: planId,
      customize: false,
      max_users: plan?.max_users ?? prev.max_users,
      max_products: plan?.max_products ?? prev.max_products,
    }));
  };

  const handleCreate = async () => {
    if (!newOrg.name.trim() || !newOrg.email.trim()) {
      toast.error('Preencha nome e e-mail da empresa');
      return;
    }
    if (!password || password.length < 10) {
      toast.error('A senha provisória precisa ter pelo menos 10 caracteres.');
      return;
    }

    try {
      const isCustom = newOrg.customize || !newOrg.plan_id;
      const features =
        !isCustom && selectedPlan
          ? {
              whatsapp: selectedPlan.feature_whatsapp,
              facebook: selectedPlan.feature_facebook,
              instagram: selectedPlan.feature_instagram,
              campaigns: selectedPlan.feature_campaigns,
              scheduling: selectedPlan.feature_scheduling,
              internal_chat: selectedPlan.feature_internal_chat,
              external_api: selectedPlan.feature_external_api,
              kanban: selectedPlan.feature_kanban,
              pipeline: selectedPlan.feature_pipeline,
              integrations: selectedPlan.feature_integrations,
              audio_transcription_ai: selectedPlan.feature_audio_transcription_ai,
              text_correction_ai: selectedPlan.feature_text_correction_ai,
              ai_agents: selectedPlan.feature_ai_agents,
              voice_agents: selectedPlan.feature_voice_agents,
              outreach: selectedPlan.feature_outreach,
              capture_funnels: selectedPlan.feature_capture_funnels,
              forms: selectedPlan.feature_forms,
              webhooks: selectedPlan.feature_webhooks,
            }
          : undefined;

      const org = await createOrganization.mutateAsync({
        name: newOrg.name.trim(),
        email: newOrg.email.trim(),
        cnpj: newOrg.cnpj.trim() || null,
        phone: newOrg.phone.trim() || null,
        max_users: newOrg.max_users,
        max_products: newOrg.max_products,
        status: newOrg.status,
        plan_id: newOrg.plan_id || null,
        ...(features ? { features } : {}),
      });

      if (newOrg.plan_id && selectedPlan) {
        await createSubscription.mutateAsync({
          organization_id: org.id,
          plan_type: selectedPlan.slug,
          plan_id: selectedPlan.id,
          price_monthly: Number(selectedPlan.price_monthly),
        });
      }

      await createAuditLog.mutateAsync({
        action: `Nova empresa criada: ${newOrg.name}`,
        entity_type: 'organization',
        entity_id: org.id,
      });

      const { data: adminResult, error: adminError } = await supabase.functions.invoke(
        'create-organization-admin',
        {
          body: {
            organization_id: org.id,
            email: newOrg.email.trim(),
            full_name: newOrg.name.trim(),
            password,
            public_app_url: getPublicAppUrl(),
          },
        }
      );

      if (adminError || (adminResult && adminResult.ok === false)) {
        const msg = adminError?.message || adminResult?.error || 'Erro ao criar admin';
        toast.warning(`Empresa criada, mas falhou ao provisionar admin: ${msg}`);
        onCreated?.(org);
        return;
      }

      setCreatedCredentials({
        email: adminResult.login_email || newOrg.email.trim(),
        password,
        loginUrl: adminResult.login_url,
        nextPath: adminResult.next_path,
        org,
        emailSent: !!adminResult.email_sent,
      });
      toast.success('Empresa criada e admin provisionado!');
    } catch (error) {
      console.error('Error creating organization:', error);
      toast.error('Erro ao criar empresa');
    }
  };

  if (createdCredentials) {
    const c = createdCredentials;
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4 text-primary" />
            Credenciais provisórias criadas
          </div>
          <p className="text-xs text-muted-foreground">
            {c.emailSent
              ? 'Enviamos por e-mail para o admin. Copie também abaixo por segurança.'
              : 'Não conseguimos enviar o e-mail automaticamente — copie e envie manualmente.'}
            {' '}No primeiro acesso ele será obrigado a trocar a senha.
          </p>

          <div className="space-y-2">
            <Label className="text-xs">E-mail</Label>
            <div className="flex items-center gap-2">
              <Input value={c.email} readOnly className="font-mono text-xs" />
              <Button type="button" size="icon" variant="outline" onClick={() => copy(c.email, 'email')}>
                {copiedField === 'email' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Senha provisória</Label>
            <div className="flex items-center gap-2">
              <Input value={c.password} readOnly className="font-mono text-xs" />
              <Button type="button" size="icon" variant="outline" onClick={() => copy(c.password, 'password')}>
                {copiedField === 'password' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Link de acesso</Label>
            <div className="flex items-center gap-2">
              <Input value={c.loginUrl} readOnly className="font-mono text-xs" />
              <Button type="button" size="icon" variant="outline" onClick={() => copy(c.loginUrl, 'url')}>
                {copiedField === 'url' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onCreated?.(c.org)}>Concluir</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nome da empresa *</Label>
        <Input
          value={newOrg.name}
          onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
          placeholder="Ex: Acme Ltda"
        />
      </div>

      <div className="space-y-2">
        <Label>E-mail do Admin *</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="email"
            value={newOrg.email}
            onChange={(e) => setNewOrg({ ...newOrg, email: e.target.value })}
            placeholder="admin@empresa.com"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Senha provisória *</Label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 10 caracteres"
              className="pl-9 pr-9 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Gerar nova"
            onClick={() => setPassword(generateProvisionalPassword())}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O admin receberá esta senha por e-mail e será obrigado a trocá-la no primeiro acesso.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>CNPJ</Label>
          <Input
            value={newOrg.cnpj}
            onChange={(e) => setNewOrg({ ...newOrg, cnpj: e.target.value })}
            placeholder="00.000.000/0000-00"
          />
        </div>
        <div className="space-y-2">
          <Label>Telefone</Label>
          <Input
            value={newOrg.phone}
            onChange={(e) => setNewOrg({ ...newOrg, phone: e.target.value })}
            placeholder="(11) 99999-9999"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Plano</Label>
        <Select
          value={newOrg.plan_id || 'none'}
          onValueChange={(value) => {
            if (value === 'none') {
              setNewOrg({ ...newOrg, plan_id: '', customize: true });
            } else {
              handleSelectPlan(value);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione um plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem plano (personalizado)</SelectItem>
            {activePlans?.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.name} — {plan.max_users} usuários · {plan.max_products} produtos
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {newOrg.plan_id && (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-sm font-medium">Personalizar limites</Label>
            <p className="text-xs text-muted-foreground">
              Sobrescrever os valores padrão do plano selecionado
            </p>
          </div>
          <Switch
            checked={newOrg.customize}
            onCheckedChange={(checked) => setNewOrg({ ...newOrg, customize: checked })}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Máx. Usuários</Label>
          <Input
            type="number"
            min={1}
            value={newOrg.max_users}
            disabled={!!newOrg.plan_id && !newOrg.customize}
            onChange={(e) =>
              setNewOrg({ ...newOrg, max_users: parseInt(e.target.value) || 1 })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Máx. Produtos</Label>
          <Input
            type="number"
            min={1}
            value={newOrg.max_products}
            disabled={!!newOrg.plan_id && !newOrg.customize}
            onChange={(e) =>
              setNewOrg({ ...newOrg, max_products: parseInt(e.target.value) || 1 })
            }
          />
        </div>
      </div>

      {!hideStatusField && (
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={newOrg.status}
            onValueChange={(value) => setNewOrg({ ...newOrg, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="suspended">Suspenso</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button onClick={handleCreate} disabled={createOrganization.isPending}>
          {createOrganization.isPending ? 'Criando...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
