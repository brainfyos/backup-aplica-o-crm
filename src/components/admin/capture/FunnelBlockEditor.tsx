import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Plus, 
  Trash2,
  ArrowRight,
  MessageSquare,
  Monitor,
  Smartphone,
  Bot,
  Percent,
  Settings2,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { 
  FunnelBlock, 
  FunnelBlockData, 
  FunnelInputType, 
  FunnelBlockOption,
  FunnelChannel,
  AIObjective,
  AIDecideOutput,
  ABTestVariant,
  AutoSwitchAgentConfig,
  generateBlockId,
  FUNNEL_BLOCK_PALETTE,
  getBlockCategoryColor,
} from '@/types/funnel';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentSwitchEditor } from './AgentSwitchEditor';
import { AutoSwitchConfig } from './AutoSwitchConfig';
import { useProductAgents } from '@/hooks/useProductAgents';

interface FunnelBlockEditorProps {
  block: FunnelBlock;
  blocks: FunnelBlock[];
  productId: string;
  onUpdate: (updates: Partial<FunnelBlock>) => void;
  onConnect: (targetBlockId: string | null) => void;
  /** Quando true: oculta o seletor "Exibir em" (canais) e usa terminologia "Etiqueta" no lugar de "Tag". */
  chatOnly?: boolean;
}

// Ícones de canal
const CHANNEL_CONFIG: { key: FunnelChannel; label: string; icon: React.ReactNode }[] = [
  { key: 'chat', label: 'Chat', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { key: 'form', label: 'Form', icon: <Monitor className="h-3.5 w-3.5" /> },
  { key: 'widget', label: 'Widget', icon: <Smartphone className="h-3.5 w-3.5" /> },
];

// Objetivos da IA
const AI_OBJECTIVES: { value: AIObjective; label: string; description: string }[] = [
  { value: 'qualify', label: 'Qualificar', description: 'Avaliar interesse e fit do lead' },
  { value: 'sell', label: 'Vender', description: 'Conduzir para fechamento' },
  { value: 'schedule', label: 'Agendar', description: 'Marcar reunião ou demo' },
  { value: 'support', label: 'Suporte', description: 'Tirar dúvidas e ajudar' },
  { value: 'custom', label: 'Personalizado', description: 'Definir objetivo próprio' },
];

export function FunnelBlockEditor({ block, blocks, productId, onUpdate, onConnect, chatOnly = false }: FunnelBlockEditorProps) {
  const paletteItem = FUNNEL_BLOCK_PALETTE.find(p => p.type === block.type);
  const categoryColors = getBlockCategoryColor(block.type);
  const variableTokens = ['nome', 'email', 'phone', 'lead_id', 'funnel_name', 'utm_source', 'utm_campaign'];
  
  // Fetch agents for this product
  const { data: agents } = useProductAgents(productId);
  const activeAgents = agents?.filter(a => a.is_active) || [];
  
  const updateData = (key: keyof FunnelBlockData, value: any) => {
    onUpdate({
      data: { ...block.data, [key]: value },
    });
  };

  const updateWebhookConfig = (updates: Partial<NonNullable<FunnelBlockData['webhook_config']>>) => {
    updateData('webhook_config', {
      ...(block.data.webhook_config || { url: '', method: 'POST' }),
      ...updates,
    });
  };

  const appendWebhookVariable = (variable: string) => {
    const current = block.data.webhook_config?.body_template || '';
    const token = `{{${variable}}}`;
    const separator = current && !/[\s{[(:,]$/.test(current) ? ' ' : '';
    updateWebhookConfig({ body_template: `${current}${separator}${token}` });
  };
  
  // Helper to manage array fields (override permissions)
  const addToArray = (field: 'override_can_do' | 'override_cannot_do' | 'override_handoff_triggers', value: string) => {
    const current = block.data[field] || [];
    if (value.trim() && !current.includes(value.trim())) {
      updateData(field, [...current, value.trim()]);
    }
  };
  
  const removeFromArray = (field: 'override_can_do' | 'override_cannot_do' | 'override_handoff_triggers', index: number) => {
    const current = block.data[field] || [];
    updateData(field, current.filter((_, i) => i !== index));
  };

  const toggleChannel = (channel: FunnelChannel) => {
    const current = block.data.channels || ['chat', 'form', 'widget'];
    if (current.includes(channel)) {
      updateData('channels', current.filter(c => c !== channel));
    } else {
      updateData('channels', [...current, channel]);
    }
  };

  const addOption = () => {
    const options = block.data.options || [];
    const newOption: FunnelBlockOption = {
      id: generateBlockId(),
      label: `Opção ${options.length + 1}`,
    };
    updateData('options', [...options, newOption]);
  };

  const updateOption = (optionId: string, updates: Partial<FunnelBlockOption>) => {
    const options = block.data.options || [];
    updateData('options', options.map(opt => 
      opt.id === optionId ? { ...opt, ...updates } : opt
    ));
  };

  const removeOption = (optionId: string) => {
    const options = block.data.options || [];
    updateData('options', options.filter(opt => opt.id !== optionId));
  };

  // AI Decide outputs
  const addAIOutput = () => {
    const outputs = block.data.ai_outputs || [];
    const newOutput: AIDecideOutput = {
      id: generateBlockId(),
      label: `Saída ${outputs.length + 1}`,
      next_block_id: null,
    };
    updateData('ai_outputs', [...outputs, newOutput]);
  };

  const updateAIOutput = (outputId: string, updates: Partial<AIDecideOutput>) => {
    const outputs = block.data.ai_outputs || [];
    updateData('ai_outputs', outputs.map(out => 
      out.id === outputId ? { ...out, ...updates } : out
    ));
  };

  const removeAIOutput = (outputId: string) => {
    const outputs = block.data.ai_outputs || [];
    updateData('ai_outputs', outputs.filter(out => out.id !== outputId));
  };

  // A/B Test variants
  const addABVariant = () => {
    const variants = block.data.ab_variants || [];
    const newVariant: ABTestVariant = {
      id: generateBlockId(),
      name: `Variante ${String.fromCharCode(65 + variants.length)}`,
      weight: 50,
      next_block_id: null,
    };
    updateData('ab_variants', [...variants, newVariant]);
  };

  const updateABVariant = (variantId: string, updates: Partial<ABTestVariant>) => {
    const variants = block.data.ab_variants || [];
    updateData('ab_variants', variants.map(v => 
      v.id === variantId ? { ...v, ...updates } : v
    ));
  };

  const removeABVariant = (variantId: string) => {
    const variants = block.data.ab_variants || [];
    updateData('ab_variants', variants.filter(v => v.id !== variantId));
  };

  const otherBlocks = blocks.filter(b => b.id !== block.id);
  const activeChannels = block.data.channels || ['chat', 'form', 'widget'];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-1">
        {/* Header */}
        <div className={cn(
          'flex items-center gap-3 p-3 rounded-lg',
          categoryColors.bg
        )}>
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center text-lg',
            paletteItem?.color || 'bg-muted',
            'text-white'
          )}>
            {paletteItem?.icon}
          </div>
          <div>
            <h3 className={cn('font-semibold text-sm', categoryColors.text)}>
              {paletteItem?.label}
            </h3>
            <p className="text-xs text-muted-foreground">
              {paletteItem?.description}
            </p>
          </div>
        </div>

        {/* Canais — oculto no modo ChatBot (canal único) */}
        {!chatOnly && (
          <>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Exibir em</Label>
              <div className="flex gap-2">
                {CHANNEL_CONFIG.map(({ key, label, icon }) => (
                  <Button
                    key={key}
                    variant={activeChannels.includes(key) ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => toggleChannel(key)}
                  >
                    {icon}
                    <span className="text-xs">{label}</span>
                  </Button>
                ))}
              </div>
            </div>

            <Separator />
          </>
        )}

        {/* Message Block */}
        {block.type === 'message' && (
          <>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Digite a mensagem..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Delay (ms)</Label>
              <Input
                type="number"
                value={block.data.delay_ms || 500}
                onChange={(e) => updateData('delay_ms', parseInt(e.target.value))}
              />
            </div>
          </>
        )}

        {/* Input Block */}
        {block.type === 'input' && (
          <>
            <div className="space-y-2">
              <Label>Pergunta</Label>
              <Textarea
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Qual sua pergunta?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Input</Label>
              <Select
                value={block.data.input_type || 'text'}
                onValueChange={(v) => updateData('input_type', v as FunnelInputType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="text">Texto livre</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="textarea">Texto longo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome da Variável</Label>
              <Input
                value={block.data.variable_name || ''}
                onChange={(e) => updateData('variable_name', e.target.value)}
                placeholder="nome, email, telefone..."
              />
              <p className="text-xs text-muted-foreground">
                Usado para mapear ao campo do lead
              </p>
            </div>
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                value={block.data.placeholder || ''}
                onChange={(e) => updateData('placeholder', e.target.value)}
                placeholder="Digite aqui..."
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={block.data.required !== false}
                onCheckedChange={(v) => updateData('required', v)}
              />
              <Label>Obrigatório</Label>
            </div>
          </>
        )}

        {/* Buttons Block */}
        {block.type === 'buttons' && (
          <>
            <div className="space-y-2">
              <Label>Mensagem (opcional)</Label>
              <Textarea
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Texto antes dos botões..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Opções</Label>
                <Button size="sm" variant="ghost" onClick={addOption}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {(block.data.options || []).map((option, idx) => (
                  <div key={option.id} className="flex gap-2">
                    <Input
                      value={option.label}
                      onChange={(e) => updateOption(option.id, { label: e.target.value })}
                      placeholder={`Opção ${idx + 1}`}
                      className="flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 text-destructive"
                      onClick={() => removeOption(option.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Delay Block */}
        {block.type === 'delay' && (
          <div className="space-y-2">
            <Label>Tempo de espera (ms)</Label>
            <Input
              type="number"
              value={block.data.delay_ms || 1000}
              onChange={(e) => updateData('delay_ms', parseInt(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              1000ms = 1 segundo
            </p>
          </div>
        )}

        {/* Score Block */}
        {block.type === 'score' && (
          <div className="space-y-2">
            <Label>Pontuação a adicionar</Label>
            <Input
              type="number"
              value={block.data.score_value || 0}
              onChange={(e) => updateData('score_value', parseInt(e.target.value))}
            />
          </div>
        )}

        {/* Etiqueta Block (interno: type='tag') */}
        {block.type === 'tag' && (
          <div className="space-y-2">
            <Label>{chatOnly ? 'Etiquetas (separadas por vírgula)' : 'Tags (separadas por vírgula)'}</Label>
            <Input
              value={(block.data.apply_tags || []).join(', ')}
              onChange={(e) => updateData('apply_tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
              placeholder={chatOnly ? 'vip, qualificado, quente' : 'tag1, tag2, tag3'}
            />
            {chatOnly && (
              <p className="text-xs text-muted-foreground">
                Aplica etiquetas ao lead capturado por este ChatBot.
              </p>
            )}
          </div>
        )}

        {/* AI Takeover Block - Expanded */}
        {block.type === 'ai_takeover' && (
          <div className="space-y-6">
            {/* Seção 1: Seleção de Agente */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Agente que Assume
              </Label>
              <AgentSwitchEditor 
                productId={productId}
                agentId={block.data.agent_id}
                onAgentChange={(id) => updateData('agent_id', id)}
              />
            </div>
            
            <Separator />
            
            {/* Seção 2: Contexto Adicional */}
            <div className="space-y-2">
              <Label>Contexto Específico para este Ponto</Label>
              <Textarea
                value={block.data.ai_context_prompt || ''}
                onChange={(e) => updateData('ai_context_prompt', e.target.value)}
                placeholder="Instruções adicionais além das regras do agente..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                A IA usará as informações do Cérebro do Produto + Agente + este contexto
              </p>
            </div>
            
            <Separator />
            
            {/* Seção 3: Permissões Override (Collapsible) */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <Settings2 className="h-4 w-4" />
                <span className="flex-1 text-left font-medium text-sm">Ajustar Permissões</span>
                <Badge variant="outline" className="text-[10px]">Avançado</Badge>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                {/* Pode fazer (adicional) */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">✅ Pode fazer (adicional)</Label>
                  <div className="space-y-1">
                    {(block.data.override_can_do || []).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Badge variant="secondary" className="flex-1 justify-start text-xs">
                          {item}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeFromArray('override_can_do', idx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: Falar de promoção especial"
                      className="text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addToArray('override_can_do', e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        const input = e.currentTarget.previousSibling as HTMLInputElement;
                        addToArray('override_can_do', input.value);
                        input.value = '';
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                
                {/* NÃO pode fazer (adicional) */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">❌ NÃO pode fazer (adicional)</Label>
                  <div className="space-y-1">
                    {(block.data.override_cannot_do || []).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Badge variant="destructive" className="flex-1 justify-start text-xs bg-destructive/10 text-destructive border-destructive/30">
                          {item}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeFromArray('override_cannot_do', idx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: Mencionar concorrentes"
                      className="text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addToArray('override_cannot_do', e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        const input = e.currentTarget.previousSibling as HTMLInputElement;
                        addToArray('override_cannot_do', input.value);
                        input.value = '';
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
            
            <Separator />
            
            {/* Seção 4: Auto-Switch de Agente */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-orange-500" />
                    Troca Automática de Agente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Permite que a IA troque para outro agente durante a conversa
                  </p>
                </div>
                <Switch
                  checked={block.data.auto_switch_enabled || false}
                  onCheckedChange={(v) => updateData('auto_switch_enabled', v)}
                />
              </div>
              
              {block.data.auto_switch_enabled && (
                <AutoSwitchConfig
                  agents={activeAgents}
                  config={block.data.auto_switch_agents || []}
                  onUpdate={(config) => updateData('auto_switch_agents', config)}
                />
              )}
            </div>
          </div>
        )}

        {/* Agent Switch Block */}
        {block.type === 'agent_switch' && (
          <AgentSwitchEditor 
            productId={productId}
            agentId={block.data.agent_id}
            onAgentChange={(id) => updateData('agent_id', id)}
          />
        )}

        {/* AI Decide Block */}
        {block.type === 'ai_decide' && (
          <>
            <div className="space-y-2">
              <Label>Objetivo</Label>
              <Select
                value={block.data.ai_objective || 'qualify'}
                onValueChange={(v) => updateData('ai_objective', v as AIObjective)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_OBJECTIVES.map(obj => (
                    <SelectItem key={obj.value} value={obj.value}>
                      <div>
                        <span>{obj.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {obj.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {block.data.ai_objective === 'custom' && (
              <div className="space-y-2">
                <Label>Prompt Personalizado</Label>
                <Textarea
                  value={block.data.ai_custom_prompt || ''}
                  onChange={(e) => updateData('ai_custom_prompt', e.target.value)}
                  placeholder="Descreva o que a IA deve avaliar..."
                  rows={3}
                />
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Saídas Possíveis</Label>
                <Button size="sm" variant="ghost" onClick={addAIOutput}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {(block.data.ai_outputs || []).map((output) => (
                  <div key={output.id} className="flex gap-2 items-center">
                    <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500/30">
                      <Bot className="h-3 w-3 mr-1" />
                    </Badge>
                    <Input
                      value={output.label}
                      onChange={(e) => updateAIOutput(output.id, { label: e.target.value })}
                      placeholder="Nome da saída"
                      className="flex-1"
                    />
                    <Select
                      value={output.next_block_id || 'none'}
                      onValueChange={(v) => updateAIOutput(output.id, { next_block_id: v === 'none' ? null : v })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="→" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Fim</SelectItem>
                        {otherBlocks.map(b => (
                          <SelectItem key={b.id} value={b.id}>
                            {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeAIOutput(output.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* AI Qualify Block */}
        {block.type === 'ai_qualify' && (
          <div className="space-y-2">
            <Label>Critérios de Qualificação</Label>
            <Textarea
              value={(block.data.ai_qualification_criteria || []).join('\n')}
              onChange={(e) => updateData('ai_qualification_criteria', e.target.value.split('\n').filter(Boolean))}
              placeholder="Um critério por linha:&#10;Tem orçamento acima de R$5.000&#10;Precisa da solução em até 30 dias&#10;É decisor ou influenciador"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              A IA avaliará cada critério e classificará o lead
            </p>
          </div>
        )}

        {/* AI Summarize Block */}
        {block.type === 'ai_summarize' && (
          <div className="space-y-2">
            <Label>O que resumir</Label>
            <Textarea
              value={block.data.ai_context_prompt || ''}
              onChange={(e) => updateData('ai_context_prompt', e.target.value)}
              placeholder="Resuma os principais pontos da conversa, incluindo: necessidade do cliente, objeções levantadas, próximos passos..."
              rows={4}
            />
          </div>
        )}

        {/* A/B Test Block */}
        {block.type === 'ab_test' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Variantes</Label>
              <Button size="sm" variant="ghost" onClick={addABVariant}>
                <Plus className="h-3 w-3 mr-1" />
                Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {(block.data.ab_variants || []).map((variant) => (
                <div key={variant.id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      value={variant.name}
                      onChange={(e) => updateABVariant(variant.id, { name: e.target.value })}
                      placeholder="Nome da variante"
                      className="flex-1"
                    />
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={variant.weight}
                        onChange={(e) => updateABVariant(variant.id, { weight: parseInt(e.target.value) || 0 })}
                        className="w-16 text-center"
                        min={0}
                        max={100}
                      />
                      <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeABVariant(variant.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Select
                    value={variant.next_block_id || 'none'}
                    onValueChange={(v) => updateABVariant(variant.id, { next_block_id: v === 'none' ? null : v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Próximo bloco →" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Fim do fluxo</SelectItem>
                      {otherBlocks.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label}: {b.data.content?.slice(0, 20) || '...'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Os pesos definem a probabilidade de cada caminho
            </p>
          </div>
        )}

        {/* Condition Block */}
        {block.type === 'condition' && (
          <>
            <div className="space-y-2">
              <Label>Variável a avaliar</Label>
              <Input
                value={block.data.condition?.variable || ''}
                onChange={(e) => updateData('condition', { ...block.data.condition, variable: e.target.value })}
                placeholder="nome_variavel"
              />
            </div>
            <div className="space-y-2">
              <Label>Operador</Label>
              <Select
                value={block.data.condition?.operator || 'equals'}
                onValueChange={(v) => updateData('condition', { ...block.data.condition, operator: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Igual a</SelectItem>
                  <SelectItem value="not_equals">Diferente de</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="greater_than">Maior que</SelectItem>
                  <SelectItem value="less_than">Menor que</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={block.data.condition?.value || ''}
                onChange={(e) => updateData('condition', { ...block.data.condition, value: e.target.value })}
                placeholder="valor"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-green-600">
                <ArrowRight className="h-4 w-4" />
                Se verdadeiro →
              </Label>
              <Select
                value={block.data.true_next_block_id || 'none'}
                onValueChange={(v) => updateData('true_next_block_id', v === 'none' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Fim</SelectItem>
                  {otherBlocks.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-red-600">
                <ArrowRight className="h-4 w-4" />
                Se falso →
              </Label>
              <Select
                value={block.data.false_next_block_id || 'none'}
                onValueChange={(v) => updateData('false_next_block_id', v === 'none' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Fim</SelectItem>
                  {otherBlocks.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Handoff Block */}
        {block.type === 'handoff' && (
          <>
            <div className="space-y-2">
              <Label>Mensagem de Transferência</Label>
              <Textarea
                value={block.data.handoff_message || ''}
                onChange={(e) => updateData('handoff_message', e.target.value)}
                placeholder="Um atendente irá continuar..."
                rows={2}
              />
            </div>
          </>
        )}

        {/* Schedule Block */}
        {block.type === 'schedule' && (
          <>
            <div className="space-y-2">
              <Label>Mensagem de Introdução</Label>
              <Textarea
                value={block.data.schedule_message || 'Escolha o melhor horário para nossa conversa:'}
                onChange={(e) => updateData('schedule_message', e.target.value)}
                placeholder="Escolha o melhor horário..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Evento</Label>
              <Input
                value={block.data.schedule_event_type_id || ''}
                onChange={(e) => updateData('schedule_event_type_id', e.target.value)}
                placeholder="ID do tipo de evento"
              />
              <p className="text-xs text-muted-foreground">
                Configure tipos de evento em Agendamentos → Tipos de Evento.
                Cole aqui o ID do evento desejado.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={block.data.schedule_use_lead_owner || false}
                onCheckedChange={(v) => updateData('schedule_use_lead_owner', v)}
              />
              <Label className="text-sm">Agendar com dono do lead</Label>
            </div>
            <div className="space-y-2">
              <Label>Mensagem de Sucesso</Label>
              <Textarea
                value={block.data.schedule_success_message || 'Perfeito! Seu horário foi reservado. Você receberá uma confirmação por e-mail.'}
                onChange={(e) => updateData('schedule_success_message', e.target.value)}
                placeholder="Mensagem após agendar..."
                rows={2}
              />
            </div>
          </>
        )}

        {/* End Block */}
        {block.type === 'end' && (
          <>
            <div className="space-y-2">
              <Label>Mensagem de Sucesso</Label>
              <Textarea
                value={block.data.success_message || ''}
                onChange={(e) => updateData('success_message', e.target.value)}
                placeholder="Obrigado! Entraremos em contato."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>URL de Redirecionamento (opcional)</Label>
              <Input
                value={block.data.redirect_url || ''}
                onChange={(e) => updateData('redirect_url', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </>
        )}

        {/* Video Block */}
        {block.type === 'video' && (
          <>
            <div className="space-y-2">
              <Label>Título (opcional)</Label>
              <Input
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Assista ao vídeo"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Incorporação</Label>
              <Select
                value={block.data.video_type || 'youtube'}
                onValueChange={(v) => updateData('video_type', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="vimeo">Vimeo</SelectItem>
                  <SelectItem value="embed">Incorporação (iframe URL)</SelectItem>
                  <SelectItem value="custom_html">HTML / JavaScript</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(block.data.video_type === 'youtube' || block.data.video_type === 'vimeo' || !block.data.video_type) && (
              <div className="space-y-2">
                <Label>URL do Vídeo</Label>
                <Input
                  value={block.data.video_url || ''}
                  onChange={(e) => updateData('video_url', e.target.value)}
                  placeholder={block.data.video_type === 'vimeo' ? 'https://vimeo.com/...' : 'https://youtube.com/watch?v=...'}
                />
              </div>
            )}
            {block.data.video_type === 'embed' && (
              <div className="space-y-2">
                <Label>URL do Embed</Label>
                <Input
                  value={block.data.video_url || ''}
                  onChange={(e) => updateData('video_url', e.target.value)}
                  placeholder="https://player.exemplo.com/embed/..."
                />
                <p className="text-xs text-muted-foreground">URL direta do iframe/player</p>
              </div>
            )}
            {block.data.video_type === 'custom_html' && (
              <div className="space-y-2">
                <Label>Código HTML / JavaScript</Label>
                <Textarea
                  value={block.data.embed_code || ''}
                  onChange={(e) => updateData('embed_code', e.target.value)}
                  placeholder='<iframe src="..." width="100%" height="400"></iframe>'
                  rows={6}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">Cole o código de incorporação completo</p>
              </div>
            )}
          </>
        )}

        {/* Image Block */}
        {block.type === 'image' && (
          <>
            <div className="space-y-2">
              <Label>URL da Imagem</Label>
              <Input
                value={block.data.image_url || ''}
                onChange={(e) => updateData('image_url', e.target.value)}
                placeholder="https://exemplo.com/imagem.jpg"
              />
            </div>
            <div className="space-y-2">
              <Label>Texto Alternativo (alt)</Label>
              <Input
                value={block.data.image_alt || ''}
                onChange={(e) => updateData('image_alt', e.target.value)}
                placeholder="Descrição da imagem"
              />
            </div>
            <div className="space-y-2">
              <Label>Legenda (opcional)</Label>
              <Input
                value={block.data.content || ''}
                onChange={(e) => updateData('content', e.target.value)}
                placeholder="Legenda ou título da imagem"
              />
            </div>
          </>
        )}

        {/* Link Block */}
        {block.type === 'link' && (
          <>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={block.data.link_url || ''}
                onChange={(e) => updateData('link_url', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Título do Link</Label>
              <Input
                value={block.data.link_title || ''}
                onChange={(e) => updateData('link_title', e.target.value)}
                placeholder="Clique aqui para saber mais"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={block.data.link_description || ''}
                onChange={(e) => updateData('link_description', e.target.value)}
                placeholder="Breve descrição do link..."
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={block.data.link_open_new_tab !== false}
                onCheckedChange={(v) => updateData('link_open_new_tab', v)}
              />
              <Label>Abrir em nova aba</Label>
            </div>
          </>
        )}

        {/* Create Task Block */}
        {block.type === 'create_task' && (
          <>
            <div className="space-y-2">
              <Label>Título da Tarefa</Label>
              <Input
                value={block.data.task_config?.title_template || ''}
                onChange={(e) => updateData('task_config', { 
                  ...block.data.task_config, 
                  title_template: e.target.value 
                })}
                placeholder="Follow-up: {{lead_name}}"
              />
              <p className="text-xs text-muted-foreground">
                Use {'{{variavel}}'} para dados dinâmicos
              </p>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={block.data.task_config?.description_template || ''}
                onChange={(e) => updateData('task_config', { 
                  ...block.data.task_config, 
                  description_template: e.target.value 
                })}
                placeholder="Entrar em contato com o lead..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Prazo (dias)</Label>
              <Input
                type="number"
                value={block.data.task_config?.due_in_days || 1}
                onChange={(e) => updateData('task_config', { 
                  ...block.data.task_config, 
                  due_in_days: parseInt(e.target.value) 
                })}
              />
            </div>
          </>
        )}

        {/* Webhook Block */}
        {block.type === 'webhook' && (
          <>
            <div className="space-y-2">
              <Label>URL do Webhook</Label>
              <Input
                value={block.data.webhook_config?.url || ''}
                onChange={(e) => updateWebhookConfig({ url: e.target.value })}
                placeholder="https://api.exemplo.com/webhook"
              />
              <p className="text-xs text-muted-foreground">
                Suporta variáveis: <code className="text-[10px] bg-muted px-1 rounded">{'{{nome}}'}</code>, <code className="text-[10px] bg-muted px-1 rounded">{'{{email}}'}</code>, <code className="text-[10px] bg-muted px-1 rounded">{'{{phone}}'}</code>
              </p>
            </div>
            <div className="space-y-2">
              <Label>Método</Label>
              <Select
                value={block.data.webhook_config?.method || 'POST'}
                onValueChange={(v) => updateWebhookConfig({ method: v as NonNullable<FunnelBlockData['webhook_config']>['method'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Body (JSON)</Label>
              <Textarea
                value={block.data.webhook_config?.body_template || ''}
                onChange={(e) => updateWebhookConfig({ body_template: e.target.value })}
                placeholder={`{\n  "nome": "{{nome}}",\n  "email": "{{email}}",\n  "telefone": "{{phone}}"\n}`}
                rows={6}
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1">
                {variableTokens.map((v) => (
                  <Badge
                    key={v}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted text-[10px]"
                    onClick={() => appendWebhookVariable(v)}
                  >
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Se ficar vazio, envia automaticamente todos os dados coletados.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Quando disparar</Label>
              <Select
                value={block.data.webhook_config?.trigger || 'on_block'}
                onValueChange={(v) => updateWebhookConfig({ trigger: v as 'on_block' | 'on_complete' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_block">Durante o fluxo (ao chegar no bloco)</SelectItem>
                  <SelectItem value="on_complete">Ao concluir o funil (com lead criado)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                "Ao concluir" garante que o webhook recebe o lead_id já criado.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={block.data.webhook_config?.wait_for_response === true}
                onCheckedChange={(v) => updateWebhookConfig({ wait_for_response: v })}
              />
              <Label className="text-sm">Aguardar resposta antes de avançar</Label>
            </div>

            <div className="space-y-2">
              <Label>Timeout (ms)</Label>
              <Input
                type="number"
                value={block.data.webhook_config?.timeout_ms || 10000}
                onChange={(e) => updateWebhookConfig({ timeout_ms: parseInt(e.target.value) || 10000 })}
              />
            </div>
          </>
        )}

        <Separator />

        {/* Connection - para blocos que não têm saídas múltiplas */}
        {!['end', 'buttons', 'ai_decide', 'ab_test', 'condition', 'handoff', 'ai_takeover'].includes(block.type) && (
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Próximo Bloco
            </Label>
            <Select
              value={block.next_block_id || 'none'}
              onValueChange={(v) => onConnect(v === 'none' ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (fim do fluxo)</SelectItem>
                {otherBlocks.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {FUNNEL_BLOCK_PALETTE.find(p => p.type === b.type)?.label}: {b.data.content?.slice(0, 20) || '...'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
