import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Info, Sparkles, Loader2, AlertTriangle, PlayCircle } from 'lucide-react';
import {
  CAPABILITY_LABELS,
  DEFAULT_FALLBACK_TRIGGERS,
  useAICredentials,
  useAIRouting,
  useSaveAIRouting,
  useTestAIRouting,
  type AICapability,
  type AIProvider,
  type FallbackStep,
  type FallbackTriggers,
} from '@/hooks/useAIRouting';
import {
  getModelsForCapability,
  getDefaultModel,
  TAG_LABELS,
} from '@/config/aiModelsCatalog';
import { useAITokenStatus } from '@/hooks/useAITokenStatus';
import { FallbackChainEditor } from './FallbackChainEditor';

const PROVIDER_LABELS: Record<AIProvider, string> = {
  lovable: 'Lovable AI (padrão)',
  openai: 'OpenAI (ChatGPT)',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google Gemini',
  xai: 'xAI (Grok)',
};

// Provedores ainda não implementados diretamente no roteador (edge _shared/ai-router.ts).
// Cadastro da chave funciona, mas roteamento cai no Lovable — desabilitamos até implementar.
const PROVIDERS_NOT_IMPLEMENTED: AIProvider[] = ['anthropic', 'gemini'];

// Algumas capacidades só funcionam em provedores específicos
const CAPABILITY_RESTRICTIONS: Partial<Record<AICapability, AIProvider[]>> = {
  audio_transcription: ['openai'], // só OpenAI Whisper/GPT-4o Transcribe hoje
  embeddings: ['openai', 'gemini'],
  voice_call: ['xai'], // por ora só xAI (OpenAI Realtime entra depois)
};

export function AIRoutingPanel() {
  const { data: credentials = [], isLoading: loadingCreds } = useAICredentials();
  const { data: routing = [], isLoading: loadingRouting } = useAIRouting();
  const { data: tokenStatus } = useAITokenStatus();
  const save = useSaveAIRouting();
  const test = useTestAIRouting();
  const platformAllowed = tokenStatus?.allow_platform_ai !== false;

  const configuredProviders = new Set<AIProvider>();
  if (platformAllowed) configuredProviders.add('lovable');
  credentials.forEach((c) => configuredProviders.add(c.provider as AIProvider));

  const getRow = (cap: AICapability) => {
    const existing = routing.find((r) => r.capability === cap);
    if (existing) return existing;
    const provider: AIProvider = 'lovable';
    return {
      capability: cap,
      provider,
      model: getDefaultModel(provider, cap) ?? null,
      fallback_to_lovable: true,
      fallback_chain: [] as FallbackStep[],
      fallback_triggers: { ...DEFAULT_FALLBACK_TRIGGERS },
    };
  };

  const handleProviderChange = (cap: AICapability, provider: AIProvider) => {
    const current = getRow(cap);
    save.mutate({
      ...current,
      provider,
      model: getDefaultModel(provider, cap) ?? null,
    });
  };

  const handleModelChange = (cap: AICapability, model: string) => {
    const current = getRow(cap);
    save.mutate({ ...current, model });
  };

  const handleFallbackChange = (cap: AICapability, fallback: boolean) => {
    const current = getRow(cap);
    save.mutate({ ...current, fallback_to_lovable: fallback });
  };

  const handleChainChange = (cap: AICapability, next: { chain: FallbackStep[]; triggers: FallbackTriggers }) => {
    const current = getRow(cap);
    save.mutate({ ...current, fallback_chain: next.chain, fallback_triggers: next.triggers });
  };


  if (loadingCreds || loadingRouting) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {platformAllowed && tokenStatus && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">IA da Plataforma — Tokens do mês</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Seu plano inclui {tokenStatus.included.toLocaleString('pt-BR')} tokens
                  {tokenStatus.bonus > 0 && ` + ${tokenStatus.bonus.toLocaleString('pt-BR')} bônus`}.
                </p>
              </div>
              <Badge variant={tokenStatus.percent_used >= 90 ? 'destructive' : 'secondary'}>
                {tokenStatus.percent_used}%
              </Badge>
            </div>
            <Progress value={tokenStatus.percent_used} className="h-2" />
            <p className="text-[11px] text-muted-foreground mt-2">
              {tokenStatus.used.toLocaleString('pt-BR')} usados de {tokenStatus.total.toLocaleString('pt-BR')} •{' '}
              {tokenStatus.remaining.toLocaleString('pt-BR')} restantes
            </p>
          </CardContent>
        </Card>
      )}

      {!platformAllowed && (
        <Alert variant="destructive" className="border-amber-500/40 bg-amber-500/5 text-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription>
            <strong>Seu plano não inclui IA da plataforma.</strong> Para ativar agentes, copiloto e
            demais recursos com IA, cadastre sua própria chave (OpenAI, Anthropic ou Gemini) abaixo
            em <strong>Provedores</strong>.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Escolha qual IA atende cada parte da plataforma e qual modelo usar.
          {platformAllowed ? (
            <> <strong>Lovable AI</strong> é o padrão. Para usar OpenAI, Claude ou Gemini, configure a chave correspondente.</>
          ) : (
            <> Configure pelo menos uma chave externa (OpenAI, Claude ou Gemini) para começar.</>
          )}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-violet-500" />
            Roteamento de IA por capacidade
          </CardTitle>
          <CardDescription>
            Cada capacidade pode usar um provedor e modelo diferente. Os badges indicam o
            modelo recomendado, mais barato ou mais potente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(CAPABILITY_LABELS) as AICapability[]).map((cap) => {
            const row = getRow(cap);
            const restriction = CAPABILITY_RESTRICTIONS[cap];
            const providers: AIProvider[] = restriction ?? ['lovable', 'openai', 'anthropic', 'gemini'];
            const meta = CAPABILITY_LABELS[cap];
            const availableModels = getModelsForCapability(row.provider, cap);
            const selectedModel = availableModels.find((m) => m.id === row.model) ?? availableModels[0];

            return (
              <div
                key={cap}
                className="flex flex-col gap-3 rounded-lg border bg-card p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{meta.title}</span>
                      {restriction && (
                        <Badge variant="outline" className="text-[10px]">
                          {restriction.length === 1
                            ? `Só ${PROVIDER_LABELS[restriction[0]].split(' ')[0]}`
                            : 'Limitado'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{meta.desc}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {/* Provedor */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Provedor</label>
                    <Select
                      value={row.provider}
                      onValueChange={(v) => handleProviderChange(cap, v as AIProvider)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => {
                          const enabled = configuredProviders.has(p);
                          const notImplemented = PROVIDERS_NOT_IMPLEMENTED.includes(p);
                          const isLovableBlocked = p === 'lovable' && !platformAllowed;
                          const suffix = isLovableBlocked
                            ? ' — bloqueado no seu plano'
                            : notImplemented
                              ? ' — em breve'
                              : !enabled
                                ? ' — sem chave'
                                : '';
                          return (
                            <SelectItem key={p} value={p} disabled={!enabled || notImplemented}>
                              {PROVIDER_LABELS[p]}
                              {suffix}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>


                  {/* Modelo */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Modelo</label>
                    <Select
                      value={selectedModel?.id ?? ''}
                      onValueChange={(v) => handleModelChange(cap, v)}
                      disabled={availableModels.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um modelo" />
                      </SelectTrigger>
                      <SelectContent className="max-w-[420px]">
                        {availableModels.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex flex-col gap-1 py-0.5">
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="font-medium">{m.label}</span>
                                {m.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className={`inline-flex items-center rounded border px-1.5 py-0 text-[9px] font-medium ${TAG_LABELS[tag].className}`}
                                  >
                                    {TAG_LABELS[tag].label}
                                  </span>
                                ))}
                              </div>
                              <span className="text-[11px] text-muted-foreground">{m.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedModel && (
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <span>Em uso:</span>
                    <span className="font-mono text-foreground">{selectedModel.id}</span>
                    {selectedModel.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center rounded border px-1.5 py-0 text-[9px] font-medium ${TAG_LABELS[tag].className}`}
                      >
                        {TAG_LABELS[tag].label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Fallback toggle + botão Testar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`fb-${cap}`}
                      checked={!!row.fallback_to_lovable}
                      onCheckedChange={(v) => handleFallbackChange(cap, v)}
                      disabled={row.provider === 'lovable'}
                    />
                    <label htmlFor={`fb-${cap}`} className="text-xs text-muted-foreground cursor-pointer">
                      Cair no Lovable AI se o provedor externo falhar
                    </label>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => test.mutate(cap)}
                    disabled={test.isPending}
                  >
                    {test.isPending && test.variables === cap ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlayCircle className="h-3.5 w-3.5" />
                    )}
                    Testar
                  </Button>
                </div>

                <FallbackChainEditor
                  capability={cap}
                  primaryProvider={row.provider}
                  primaryModel={row.model}
                  chain={row.fallback_chain ?? []}
                  triggers={row.fallback_triggers ?? DEFAULT_FALLBACK_TRIGGERS}
                  onChange={(next) => handleChainChange(cap, next)}
                />

              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
