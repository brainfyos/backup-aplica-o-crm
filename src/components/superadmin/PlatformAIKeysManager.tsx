import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { usePlatformAIValidation } from '@/hooks/usePlatformAIValidation';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, RefreshCw, AlertCircle, CheckCircle2, Power, Sparkles, BrainCircuit, ShieldCheck } from 'lucide-react';
import {
  PoolProvider,
  PlatformAIKeyPurpose,
  PlatformAIKey,
  usePlatformAIKeys,
  useSavePlatformAIKey,
  usePlatformAIKeyAction,
} from '@/hooks/usePlatformAIKeys';
import { MODELS_BY_PROVIDER, TAG_LABELS, getDefaultModel } from '@/config/aiModelsCatalog';
import { cn } from '@/lib/utils';

// Provedores externos cadastráveis (Lovable não entra: é automática)
const EXTERNAL_PROVIDERS: { value: Exclude<PoolProvider, 'lovable'>; label: string; help: string; placeholder: string }[] = [
  { value: 'openai',    label: 'OpenAI',         help: 'sk-... — consumo direto na sua conta OpenAI.',         placeholder: 'sk-...' },
  { value: 'anthropic', label: 'Anthropic',      help: 'sk-ant-... — consumo direto na sua conta Anthropic.', placeholder: 'sk-ant-...' },
  { value: 'gemini',    label: 'Google Gemini',  help: 'AIza... — consumo direto no Google AI Studio.',        placeholder: 'AIza...' },
];

const CUSTOM_MODEL_VALUE = '__custom__';

export function PlatformAIKeysManager() {
  const { data: keys = [], isLoading } = usePlatformAIKeys();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformAIKey | null>(null);
  const [activeProvider, setActiveProvider] = useState<Exclude<PoolProvider, 'lovable'>>('openai');
  const [activePurpose, setActivePurpose] = useState<PlatformAIKeyPurpose>('platform');
  const ai = usePlatformAIValidation();

  const handleTestAI = async () => {
    try {
      const res = await ai.test(undefined);
      if (res?.ok) {
        toast.success(`IA respondeu via ${res.provider} em ${res.latency_ms} ms`);
      } else {
        toast.error('Falha no teste de IA', { description: res?.error ?? undefined });
      }
    } catch (e: any) {
      toast.error('Falha no teste de IA', { description: e?.message });
    }
  };

  const byProvider = useMemo(() => {
    const m = new Map<PoolProvider, PlatformAIKey[]>();
    m.set('lovable', []);
    for (const p of EXTERNAL_PROVIDERS) m.set(p.value, []);
    for (const k of keys.filter((key) => key.purpose !== 'mia')) {
      if (!m.has(k.provider)) m.set(k.provider, []);
      m.get(k.provider)!.push(k);
    }
    return m;
  }, [keys]);
  const miaKeys = useMemo(() => keys.filter((key) => key.purpose === 'mia'), [keys]);
  const generalOpenAIKeys = useMemo(
    () => keys.filter((key) => key.purpose !== 'mia' && key.provider === 'openai' && key.is_active),
    [keys],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">IA da Plataforma</h2>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Cadastre as chaves de IA que serão compartilhadas entre as empresas com plano "IA da plataforma" ativado.
            Você pode cadastrar várias chaves do mesmo provedor — o roteador distribui as chamadas por estratégia
            (aleatório ponderado ou round-robin) conforme o plano escolher.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleTestAI} disabled={ai.isTesting}>
            {ai.isTesting ? 'Testando...' : 'Testar IA'}
          </Button>
          <Button onClick={() => { setEditing(null); setActivePurpose('platform'); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova chave
          </Button>
        </div>
      </div>

      <div
        className={`rounded-md border p-3 text-sm ${
          ai.isValidated
            ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
        }`}
      >
        {ai.isValidated
          ? `IA validada${ai.validatedProvider ? ` via ${ai.validatedProvider}` : ''}. Empresas podem ser cadastradas.`
          : 'IA ainda não validada. Rode o teste para liberar o cadastro de empresas.'}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {/* Card Lovable: informativo, sem cadastro manual */}
      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Lovable AI
            <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30">
              Ativa automaticamente
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            A Lovable não usa chave manual — o consumo vai direto para a sua workspace Lovable
            via <code className="text-[11px] bg-muted px-1 rounded">LOVABLE_API_KEY</code>.
            Para acompanhar quanto está sendo gasto, acesse <strong>Consumo de IA</strong> no menu.
          </p>
        </CardHeader>
      </Card>

      <Card className="border-fuchsia-500/35 bg-gradient-to-br from-fuchsia-500/8 via-violet-500/5 to-transparent">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-fuchsia-500" />
              Chave exclusiva da Mia
              <Badge variant={miaKeys.some((key) => key.is_active) ? 'default' : 'outline'}>
                {miaKeys.some((key) => key.is_active) ? 'Pronta para uso' : 'Usando fallback'}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              A Mia usa OpenAI no servidor para analisar conversas e gerar relatórios comerciais. A chave é
              criptografada antes de ser salva e nunca é enviada ao navegador do cliente.
            </p>
            {!miaKeys.some((key) => key.is_active) && generalOpenAIKeys.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Enquanto não houver uma chave dedicada, a Mia usa a chave OpenAI geral ativa como contingência.
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setActiveProvider('openai');
              setActivePurpose('mia');
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar chave da Mia
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {miaKeys.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nenhuma chave exclusiva cadastrada.</p>
          )}
          {miaKeys.map((key) => (
            <KeyRow key={key.id} k={key} onEdit={() => { setEditing(key); setActivePurpose('mia'); setDialogOpen(true); }} />
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {EXTERNAL_PROVIDERS.map((p) => {
          const list = byProvider.get(p.value) ?? [];
          const activeCount = list.filter((k) => k.is_active).length;
          return (
            <Card key={p.value}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {p.label}
                    <Badge variant={activeCount > 0 ? 'default' : 'outline'}>
                      {activeCount} ativa{activeCount === 1 ? '' : 's'}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{p.help}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setActiveProvider(p.value);
                    setActivePurpose('platform');
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {list.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">Nenhuma chave cadastrada.</p>
                )}
                {list.map((k) => (
                  <KeyRow key={k.id} k={k} onEdit={() => { setEditing(k); setDialogOpen(true); }} />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <KeyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultProvider={activeProvider}
        defaultPurpose={activePurpose}
      />
    </div>
  );
}

function KeyRow({ k, onEdit }: { k: PlatformAIKey; onEdit: () => void }) {
  const action = usePlatformAIKeyAction();
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-md border bg-card">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{k.label}</span>
          {k.last_error ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          ) : k.last_verified_at ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground font-mono">{k.api_key_masked}</p>
        <p className="text-[11px] text-muted-foreground">
          {k.model_default && <>modelo <span className="font-mono">{k.model_default}</span> · </>}
          prioridade {k.priority} · peso {k.weight} · {k.usage_count.toLocaleString('pt-BR')} chamadas
          {k.last_used_at ? ` · último uso ${new Date(k.last_used_at).toLocaleString('pt-BR')}` : ''}
        </p>
        {k.last_error && <p className="text-[11px] text-destructive truncate">{k.last_error}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          title={k.is_active ? 'Desativar' : 'Ativar'}
          onClick={() => action.mutate({ id: k.id, action: 'toggle', is_active: !k.is_active })}
        >
          <Power className={`h-4 w-4 ${k.is_active ? 'text-green-600' : 'text-muted-foreground'}`} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Testar"
          onClick={() => action.mutate({ id: k.id, action: 'test' })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit}>Editar</Button>
        <Button
          size="icon"
          variant="ghost"
          title="Excluir"
          onClick={() => {
            if (confirm(`Excluir chave "${k.label}"?`)) action.mutate({ id: k.id, action: 'delete' });
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function KeyDialog({
  open,
  onOpenChange,
  editing,
  defaultProvider,
  defaultPurpose,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PlatformAIKey | null;
  defaultProvider: Exclude<PoolProvider, 'lovable'>;
  defaultPurpose: PlatformAIKeyPurpose;
}) {
  const save = useSavePlatformAIKey();
  const initialProvider = (editing?.provider && editing.provider !== 'lovable')
    ? (editing.provider as Exclude<PoolProvider, 'lovable'>)
    : defaultProvider;
  const [provider, setProvider] = useState<Exclude<PoolProvider, 'lovable'>>(initialProvider);
  const [purpose, setPurpose] = useState<PlatformAIKeyPurpose>(editing?.purpose ?? defaultPurpose);
  const [label, setLabel] = useState(editing?.label ?? '');
  const [apiKey, setApiKey] = useState('');
  const [modelDefault, setModelDefault] = useState(
    editing?.model_default ?? getDefaultModel(initialProvider, 'agent_chat') ?? ''
  );
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [priority, setPriority] = useState(editing?.priority ?? 100);
  const [weight, setWeight] = useState(editing?.weight ?? 1);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);

  // sync state when reopening
  useMemo(() => {
    if (open) {
      const p = (editing?.provider && editing.provider !== 'lovable')
        ? (editing.provider as Exclude<PoolProvider, 'lovable'>)
        : defaultPurpose === 'mia' ? 'openai' : defaultProvider;
      setProvider(p);
      setPurpose(editing?.purpose ?? defaultPurpose);
      setLabel(editing?.label ?? '');
      setApiKey('');
      const models = MODELS_BY_PROVIDER[p] ?? [];
      const fromEditing = editing?.model_default ?? '';
      const isKnown = !!models.find((m) => m.id === fromEditing);
      setUseCustomModel(!!fromEditing && !isKnown);
      setModelDefault(fromEditing || getDefaultModel(p, 'agent_chat') || '');
      setPriority(editing?.priority ?? 100);
      setWeight(editing?.weight ?? 1);
      setIsActive(editing?.is_active ?? true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultPurpose]);

  const handleProviderChange = (v: string) => {
    const next = v as Exclude<PoolProvider, 'lovable'>;
    setProvider(next);
    setUseCustomModel(false);
    setModelDefault(getDefaultModel(next, 'agent_chat') ?? '');
  };

  const models = MODELS_BY_PROVIDER[provider] ?? [];
  const providerCfg = EXTERNAL_PROVIDERS.find((p) => p.value === provider)!;

  const submit = async () => {
    if (!label.trim()) return;
    if (!editing && apiKey.trim().length < 8) return;
    await save.mutateAsync({
      id: editing?.id,
      provider,
      purpose,
      label: label.trim(),
      api_key: apiKey.trim() || undefined,
      model_default: modelDefault.trim() || undefined,
      priority,
      weight,
      is_active: isActive,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar chave' : purpose === 'mia' ? 'Nova chave da Mia' : 'Nova chave de IA'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Provedor</Label>
            <Select value={provider} onValueChange={handleProviderChange} disabled={!!editing || purpose === 'mia'}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXTERNAL_PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Apelido</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={purpose === 'mia' ? 'Mia Principal' : `${providerCfg.label} Conta Principal`} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {editing ? 'Chave (deixe em branco para manter)' : 'Chave de API'}
            </Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editing ? '••••••••' : providerCfg.placeholder}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Modelo padrão</Label>
            {!useCustomModel ? (
              <Select
                value={modelDefault}
                onValueChange={(v) => {
                  if (v === CUSTOM_MODEL_VALUE) {
                    setUseCustomModel(true);
                    setModelDefault('');
                  } else {
                    setModelDefault(v);
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar modelo..." /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <div className="flex flex-col py-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">{m.label}</span>
                          {m.tags.slice(0, 2).map((t) => (
                            <span key={t} className={cn('text-[9px] px-1.5 py-0 rounded border', TAG_LABELS[t].className)}>
                              {TAG_LABELS[t].label}
                            </span>
                          ))}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{m.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_MODEL_VALUE}>
                    <span className="italic text-muted-foreground">Outro modelo... (digitar)</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="space-y-1">
                <Input
                  value={modelDefault}
                  onChange={(e) => setModelDefault(e.target.value)}
                  placeholder="ex: gpt-5-mini"
                />
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => {
                    setUseCustomModel(false);
                    setModelDefault(getDefaultModel(provider, 'agent_chat') ?? '');
                  }}
                >
                  ← Voltar para lista
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Prioridade (round-robin)</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Peso (random)</Label>
              <Input type="number" value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label className="text-sm">Ativa</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Salvando...' : 'Salvar e verificar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
