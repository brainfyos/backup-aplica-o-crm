import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useAIRouting } from '@/hooks/useAIRouting';
import { useProductCTAs } from '@/hooks/useProductCTAs';
import type { AgentToolConfigs, ProductAgent } from '@/types/agents';
import { BrainCircuit, Coins, Gauge, Link2, ShieldCheck, Sparkles } from 'lucide-react';

interface AgentIntelligenceTabProps {
  formData: Partial<ProductAgent>;
  onChange: (updates: Partial<ProductAgent>) => void;
}

type AISettings = NonNullable<AgentToolConfigs['ai']>;

const OPENAI_MODELS = [
  { value: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', hint: 'menor custo e alta velocidade' },
  { value: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra', hint: 'equilíbrio recomendado' },
  { value: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol', hint: 'máxima capacidade' },
  { value: 'openai/gpt-5.4-mini', label: 'GPT-5.4 Mini', hint: 'econômico e estável' },
  { value: 'openai/gpt-5.4-nano', label: 'GPT-5.4 Nano', hint: 'tarefas simples e volume' },
];

const LOVABLE_MODELS = [
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', hint: 'menor consumo' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'equilíbrio recomendado' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'casos complexos' },
];

const CONTEXT_MODES: Array<{ value: NonNullable<AISettings['context_mode']>; title: string; description: string; badge: string }> = [
  { value: 'economy', title: 'Econômico', description: 'Busca só os trechos mais relevantes. Ideal para grande volume.', badge: 'Menor custo' },
  { value: 'balanced', title: 'Equilibrado', description: 'Boa profundidade sem carregar todo o treinamento a cada mensagem.', badge: 'Recomendado' },
  { value: 'complete', title: 'Completo', description: 'Mais contexto por turno. Use apenas quando a conversa exigir.', badge: 'Maior custo' },
];

function isReasoningModel(model: string) {
  return /(^|\/)gpt-5|(^|\/)o[134]/i.test(model);
}

export function AgentIntelligenceTab({ formData, onChange }: AgentIntelligenceTabProps) {
  const { data: routing } = useAIRouting();
  const productId = formData.product_id || '';
  const { data: ctas = [], isLoading: loadingCTAs } = useProductCTAs(productId);
  const route = routing?.find((item) => item.capability === 'agent_chat');
  const toolConfigs = (formData.tool_configs || {}) as AgentToolConfigs;
  const ai: AISettings = toolConfigs.ai || {};
  const allowedCTAIds = Array.isArray(toolConfigs.allowed_cta_ids) ? toolConfigs.allowed_cta_ids : [];
  const useAllCTAs = allowedCTAIds.length === 0;
  const configuredProvider = route?.provider || 'lovable';
  const configuredModel = route?.model || 'padrão da empresa';
  const selectedModel = ai.model || '__company_default__';
  const effectiveModel = ai.model || route?.model || '';
  const reasoningModel = configuredProvider === 'openai' && isReasoningModel(effectiveModel);

  const configuredChoices = [
    ...(route?.model ? [{ value: route.model, label: route.model, hint: 'modelo configurado na empresa' }] : []),
    ...((route?.fallback_chain || []).map((step) => ({
      value: step.model,
      label: step.model,
      hint: `fallback ${step.provider}`,
    }))),
  ];
  const catalog = configuredProvider === 'openai' ? OPENAI_MODELS : LOVABLE_MODELS;
  const modelOptions = [...configuredChoices, ...catalog].filter(
    (item, index, all) => all.findIndex((candidate) => candidate.value === item.value) === index,
  );

  const patchToolConfigs = (patch: Partial<AgentToolConfigs>) => {
    onChange({ tool_configs: { ...toolConfigs, ...patch } });
  };
  const patchAI = (patch: Partial<AISettings>) => {
    patchToolConfigs({ ai: { ...ai, ...patch } });
  };

  const toggleAllCTAs = (checked: boolean) => {
    patchToolConfigs({
      allowed_cta_ids: checked ? [] : ctas.filter((cta) => cta.is_active).map((cta) => cta.id),
    });
  };

  const toggleCTA = (id: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...allowedCTAIds, id])]
      : allowedCTAIds.filter((ctaId) => ctaId !== id);
    // Um array vazio continua significando "todos" por compatibilidade. Quando o
    // usuário desmarca o último item, mantemos uma seleção explícita impossível.
    patchToolConfigs({ allowed_cta_ids: next.length > 0 ? next : ['__none__'] });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BrainCircuit className="h-4 w-4 text-primary" />
                Motor de inteligência
              </CardTitle>
              <CardDescription className="mt-1">
                Ajuste qualidade e consumo deste agente sem alterar o roteamento global da empresa.
              </CardDescription>
            </div>
            <Badge variant="secondary">{configuredProvider}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Modelo do agente</Label>
            <Select
              value={selectedModel}
              onValueChange={(value) => patchAI({ model: value === '__company_default__' ? undefined : value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__company_default__">Padrão da empresa · {configuredModel}</SelectItem>
                {modelOptions.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label} · {model.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A chave e o provedor continuam sendo os já configurados. Aqui você escolhe apenas o modelo deste agente.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2"><Gauge className="h-4 w-4" />Temperatura</Label>
                <Badge variant="outline">{(ai.temperature ?? 0.3).toFixed(2)}</Badge>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={[ai.temperature ?? 0.3]}
                disabled={reasoningModel}
                onValueChange={([value]) => patchAI({ temperature: value })}
              />
              <p className="text-xs text-muted-foreground">
                {reasoningModel
                  ? 'Modelos GPT-5 usam esforço de raciocínio; a temperatura não é enviada.'
                  : '0,2–0,4 reduz invenções e mantém respostas consistentes.'}
              </p>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <Label className="flex items-center gap-2"><Coins className="h-4 w-4" />Limite de resposta</Label>
              <Select value={String(ai.max_tokens ?? 600)} onValueChange={(value) => patchAI({ max_tokens: Number(value) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="300">Curta · 300 tokens</SelectItem>
                  <SelectItem value="600">Normal · 600 tokens</SelectItem>
                  <SelectItem value="800">Detalhada · 800 tokens</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">O limite evita respostas longas e consumo desnecessário.</p>
            </div>
          </div>

          {reasoningModel && (
            <div className="space-y-2">
              <Label>Esforço de raciocínio</Label>
              <Select value={ai.reasoning_effort || 'minimal'} onValueChange={(value: AISettings['reasoning_effort']) => patchAI({ reasoning_effort: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal">Mínimo · conversas e alto volume</SelectItem>
                  <SelectItem value="low">Baixo · objeções mais difíceis</SelectItem>
                  <SelectItem value="medium">Médio · casos complexos</SelectItem>
                  <SelectItem value="high">Alto · uso excepcional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Contexto por mensagem
          </CardTitle>
          <CardDescription>
            O treinamento continua completo no banco; o agente busca só os trechos úteis para a pergunta atual.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {CONTEXT_MODES.map((mode) => {
            const selected = (ai.context_mode || 'balanced') === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => patchAI({ context_mode: mode.value })}
                className={`rounded-lg border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{mode.title}</span>
                  <Badge variant={selected ? 'default' : 'outline'}>{mode.badge}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{mode.description}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" />
            CTAs permitidos
          </CardTitle>
          <CardDescription>
            O agente só poderá enviar links e botões oficiais configurados para o produto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!productId ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Vincule este agente a um produto para selecionar CTAs.
            </p>
          ) : loadingCTAs ? (
            <p className="text-sm text-muted-foreground">Carregando CTAs…</p>
          ) : ctas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhum CTA foi criado neste produto. Cadastre checkout, WhatsApp, calendário ou link na configuração do produto.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Usar todos os CTAs ativos</Label>
                  <p className="text-xs text-muted-foreground">Mantém o comportamento atual do agente.</p>
                </div>
                <Switch checked={useAllCTAs} onCheckedChange={toggleAllCTAs} />
              </div>
              <div className="space-y-2">
                {ctas.map((cta) => {
                  const checked = useAllCTAs ? cta.is_active : allowedCTAIds.includes(cta.id);
                  return (
                    <label key={cta.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <Checkbox
                        checked={checked}
                        disabled={useAllCTAs || !cta.is_active}
                        onCheckedChange={(value) => toggleCTA(cta.id, value === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{cta.label}</p>
                        <p className="text-xs text-muted-foreground">{cta.cta_type} · intenção {cta.intent_level}</p>
                      </div>
                      <Badge variant={cta.is_active ? 'secondary' : 'outline'}>{cta.is_active ? 'Ativo' : 'Inativo'}</Badge>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <div className="flex gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Links fora da base oficial serão bloqueados antes de chegar ao cliente.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
