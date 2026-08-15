import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Save, Loader2, Bot, Repeat, Tag as TagIcon, Flame, Bell, Briefcase,
  Sparkles, X, Webhook, ExternalLink,
} from 'lucide-react';
import { Funnel } from '@/types/funnel';
import { useUpdateFunnel } from '@/hooks/useFunnels';
import { useAllAgents } from '@/hooks/useProductAgents';
import { useCadences } from '@/hooks/useCadences';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useWebhooks } from '@/hooks/useWebhooks';
import { useQuizWebhookDelivery, useSaveQuizWebhookDelivery } from '@/hooks/useQuizWebhookDelivery';
import { toast } from 'sonner';

interface Props { funnel: Funnel; }

interface PostQuizActions {
  apply_tag_ids: string[];
  hot_threshold: number;
  warm_threshold: number;
  create_deal: boolean;
  notify_owner: boolean;
}

const DEFAULT_ACTIONS: PostQuizActions = {
  apply_tag_ids: [],
  hot_threshold: 70,
  warm_threshold: 40,
  create_deal: false,
  notify_owner: false,
};

export function QuizIntegrationsTab({ funnel }: Props) {
  const updateFunnel = useUpdateFunnel();
  const { data: agents } = useAllAgents();
  const { cadences } = useCadences();
  const { data: tags } = useLeadTags();
  const { data: webhooks = [] } = useWebhooks();
  const { data: savedDelivery, isLoading: deliveryLoading } = useQuizWebhookDelivery(funnel.id);
  const saveDelivery = useSaveQuizWebhookDelivery(funnel.id);

  const initialActions: PostQuizActions = {
    ...DEFAULT_ACTIONS,
    ...((funnel as any).post_quiz_actions || {}),
  };

  const [agentId, setAgentId] = useState<string>((funnel as any).post_quiz_agent_id || '');
  const [cadenceId, setCadenceId] = useState<string>((funnel as any).post_quiz_cadence_id || '');
  const [actions, setActions] = useState<PostQuizActions>(initialActions);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<'internal' | 'external'>('internal');
  const [internalWebhookId, setInternalWebhookId] = useState('');
  const [externalWebhookUrl, setExternalWebhookUrl] = useState('');

  useEffect(() => {
    if (!savedDelivery) return;
    setDeliveryEnabled(savedDelivery.enabled);
    setDeliveryMode(savedDelivery.mode);
    setInternalWebhookId(savedDelivery.internal_webhook_id || '');
    setExternalWebhookUrl(savedDelivery.external_url || '');
  }, [savedDelivery]);

  const activeAgents = (agents || []).filter((a: any) => a.is_active !== false);
  const activeCadences = (cadences || []).filter((c: any) => c.status === 'active');

  const toggleTag = (tagId: string) => {
    setActions(prev => ({
      ...prev,
      apply_tag_ids: prev.apply_tag_ids.includes(tagId)
        ? prev.apply_tag_ids.filter(id => id !== tagId)
        : [...prev.apply_tag_ids, tagId],
    }));
  };

  const handleSave = async () => {
    await Promise.all([
      updateFunnel.mutateAsync({
        id: funnel.id,
        post_quiz_agent_id: agentId || null,
        post_quiz_cadence_id: cadenceId || null,
        post_quiz_actions: actions,
      } as any),
      saveDelivery.mutateAsync({
        enabled: deliveryEnabled,
        mode: deliveryMode,
        internal_webhook_id: internalWebhookId || null,
        external_url: externalWebhookUrl || null,
      }),
    ]);
    toast.success('Integrações pós-quiz salvas');
  };

  const selectedTags = (tags || []).filter(t => actions.apply_tag_ids.includes(t.id));

  return (
    <div className="space-y-6 max-w-3xl pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Integrações Inteligentes
          </h2>
          <p className="text-muted-foreground text-sm">
            Conecte o quiz ao CRM: vincule um Agente IA, dispare cadências e qualifique automaticamente.
          </p>
        </div>
        <Button onClick={handleSave} disabled={updateFunnel.isPending || saveDelivery.isPending || deliveryLoading} className="gap-2">
          {updateFunnel.isPending || saveDelivery.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>

      {/* AGENTE IA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Agente IA pós-quiz
          </CardTitle>
          <CardDescription>
            Vincule um agente para continuar a conversa, qualificar e agendar reuniões logo após o quiz.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Agente vinculado</Label>
          <Select value={agentId || 'none'} onValueChange={(v) => setAgentId(v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Nenhum agente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {activeAgents.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} {a.agent_type ? `· ${a.agent_type}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {agentId && (
            <p className="text-xs text-muted-foreground">
              O agente receberá o contexto completo do quiz (respostas, score, tags) na primeira interação inbound do lead.
            </p>
          )}
        </CardContent>
      </Card>

      {/* CADÊNCIA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" /> Cadência Inteligente
          </CardTitle>
          <CardDescription>
            Inscreve automaticamente todo lead que concluir o quiz numa sequência de mensagens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>Cadência</Label>
          <Select value={cadenceId || 'none'} onValueChange={(v) => setCadenceId(v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Nenhuma cadência" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {activeCadences.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* WEBHOOK DE SAÍDA */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="h-4 w-4 text-primary" /> Enviar respostas para webhook
              </CardTitle>
              <CardDescription className="mt-1">
                Dispara uma vez após o lead ser salvo, com respostas, score, tags, UTMs e identificação do lead.
              </CardDescription>
            </div>
            <Switch checked={deliveryEnabled} onCheckedChange={setDeliveryEnabled} />
          </div>
        </CardHeader>
        {deliveryEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Destino</Label>
              <Select value={deliveryMode} onValueChange={(value) => setDeliveryMode(value as 'internal' | 'external')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Webhook já criado no Vendus</SelectItem>
                  <SelectItem value="external">Webhook externo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {deliveryMode === 'internal' ? (
              <div className="space-y-2">
                <Label>Webhook interno</Label>
                <Select value={internalWebhookId || 'none'} onValueChange={(value) => setInternalWebhookId(value === 'none' ? '' : value)}>
                  <SelectTrigger><SelectValue placeholder="Selecione um webhook" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione…</SelectItem>
                    {webhooks.map((webhook) => (
                      <SelectItem key={webhook.id} value={webhook.id}>
                        {webhook.name}{webhook.is_active ? '' : ' · inativo'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {webhooks.length === 0 && (
                  <p className="text-xs text-muted-foreground">Crie primeiro uma integração em Automação & IA → Webhooks.</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><ExternalLink className="h-3.5 w-3.5" /> URL externa</Label>
                <Input
                  type="url"
                  value={externalWebhookUrl}
                  onChange={(event) => setExternalWebhookUrl(event.target.value)}
                  placeholder="https://seu-sistema.com/webhooks/quiz"
                />
                <p className="text-xs text-muted-foreground">A URL fica protegida no servidor e precisa usar HTTPS.</p>
              </div>
            )}

            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Payload: <code>event</code>, <code>funnel</code>, <code>lead</code>, <code>responses</code>, <code>score</code>, <code>tags</code> e <code>tracking</code>.
            </div>
          </CardContent>
        )}
      </Card>

      {/* QUALIFICAÇÃO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" /> Qualificação Automática
          </CardTitle>
          <CardDescription>
            Define a temperatura do lead com base no score do quiz.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Score mínimo "Morno"</Label>
              <Input
                type="number"
                value={actions.warm_threshold}
                onChange={(e) => setActions(p => ({ ...p, warm_threshold: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Score mínimo "Quente"</Label>
              <Input
                type="number"
                value={actions.hot_threshold}
                onChange={(e) => setActions(p => ({ ...p, hot_threshold: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Lead com score abaixo de {actions.warm_threshold} = frio · entre {actions.warm_threshold} e {actions.hot_threshold - 1} = morno · ≥ {actions.hot_threshold} = quente.
          </div>
        </CardContent>
      </Card>

      {/* TAGS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-primary" /> Tags fixas
          </CardTitle>
          <CardDescription>
            Tags aplicadas a todo lead que concluir o quiz (além das tags dinâmicas das respostas).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map(t => (
                <Badge key={t.id} variant="secondary" className="gap-1" style={{ backgroundColor: t.color + '33', color: t.color }}>
                  {t.name}
                  <button onClick={() => toggleTag(t.id)} className="hover:opacity-70">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <Select value="" onValueChange={(v) => v && toggleTag(v)}>
            <SelectTrigger><SelectValue placeholder="+ Adicionar tag" /></SelectTrigger>
            <SelectContent>
              {(tags || []).filter(t => !actions.apply_tag_ids.includes(t.id)).map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* EXTRAS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Ações adicionais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Criar oportunidade no pipeline</Label>
              <p className="text-xs text-muted-foreground">Move o lead diretamente para o primeiro estágio com um deal aberto.</p>
            </div>
            <Switch
              checked={actions.create_deal}
              onCheckedChange={(v) => setActions(p => ({ ...p, create_deal: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm flex items-center gap-1"><Bell className="h-3 w-3" /> Notificar dono do lead</Label>
              <p className="text-xs text-muted-foreground">Envia notificação interna quando um novo lead conclui o quiz.</p>
            </div>
            <Switch
              checked={actions.notify_owner}
              onCheckedChange={(v) => setActions(p => ({ ...p, notify_owner: v }))}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
