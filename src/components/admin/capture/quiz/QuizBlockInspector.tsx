import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Plus, Trash2, ArrowRight, GitBranch, TrendingUp, Tag as TagIcon,
  Hash, Image as ImageIcon, ChevronUp, ChevronDown,
} from 'lucide-react';
import {
  FunnelBlock, FunnelBlockData, FunnelBlockOption, generateBlockId,
} from '@/types/funnel';
import { cn } from '@/lib/utils';

interface Props {
  block: FunnelBlock;
  blocks: FunnelBlock[];
  startBlockId: string | null;
  onUpdate: (updates: Partial<FunnelBlock>) => void;
  onConnect: (targetId: string | null) => void;
}

const OPERATORS: { value: string; label: string }[] = [
  { value: 'equals', label: 'é igual a' },
  { value: 'not_equals', label: 'é diferente de' },
  { value: 'contains', label: 'contém' },
  { value: 'greater_than', label: 'é maior que' },
  { value: 'less_than', label: 'é menor que' },
];

function shortLabel(b: FunnelBlock): string {
  const d: any = b.data || {};
  return (
    d.content || d.placeholder || d.success_message ||
    d.link_title || d.image_alt || b.type
  ).toString().slice(0, 40);
}

export function QuizBlockInspector({
  block, blocks, startBlockId, onUpdate, onConnect,
}: Props) {
  const ordered = useMemo(() => {
    const byId = new Map(blocks.map(b => [b.id, b]));
    const visited = new Set<string>();
    const result: FunnelBlock[] = [];
    let cur = startBlockId ? byId.get(startBlockId) : blocks[0];
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      result.push(cur);
      cur = cur.next_block_id ? byId.get(cur.next_block_id) : undefined;
    }
    blocks.forEach(b => { if (!visited.has(b.id)) result.push(b); });
    return result;
  }, [blocks, startBlockId]);

  const numberOf = (id: string | null | undefined) =>
    id ? ordered.findIndex(b => b.id === id) + 1 : 0;

  const others = ordered.filter(b => b.id !== block.id);

  const update = <K extends keyof FunnelBlockData>(key: K, value: FunnelBlockData[K]) =>
    onUpdate({ data: { ...block.data, [key]: value } });

  const updateOption = (optId: string, patch: Partial<FunnelBlockOption>) => {
    const opts = block.data.options || [];
    update('options', opts.map(o => o.id === optId ? { ...o, ...patch } : o));
  };

  const addOption = () => {
    const opts = block.data.options || [];
    const letter = String.fromCharCode(65 + opts.length);
    update('options', [...opts, {
      id: generateBlockId(),
      label: `Opção ${opts.length + 1}`,
      letter,
    }]);
  };

  const removeOption = (id: string) =>
    update('options', (block.data.options || []).filter(o => o.id !== id));

  const moveOption = (id: string, dir: -1 | 1) => {
    const opts = [...(block.data.options || [])];
    const i = opts.findIndex(o => o.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= opts.length) return;
    [opts[i], opts[j]] = [opts[j], opts[i]];
    update('options', opts);
  };

  const isChoice = block.type === 'buttons';
  const isCondition = block.type === 'condition';
  const isScore = block.type === 'score';
  const isTag = block.type === 'tag';
  const isEnd = block.type === 'end';
  const hasOptions = isChoice && (block.data.options?.length ?? 0) > 0;

  // ─── Fase 3: helpers para Resultado (tiers / metrics) ───
  type Tier = { id: string; label: string; min: number; max: number; color?: string; message?: string };
  type Metric = { id: string; label: string; value: number; display?: string; color?: string };
  const tiers: Tier[] = ((block.data as any).result_tiers as Tier[]) || [
    { id: 't1', label: 'Iniciante', min: 0, max: 20, color: '#f97316', message: 'Há muito espaço para crescer.' },
    { id: 't2', label: 'Intermediário', min: 21, max: 50, color: '#3b82f6', message: 'Bom caminho — vamos acelerar.' },
    { id: 't3', label: 'Avançado', min: 51, max: 100, color: '#10b981', message: 'Excelente! Pronto para o próximo nível.' },
  ];
  const metrics: Metric[] = ((block.data as any).result_metrics as Metric[]) || [];
  const updateAny = (key: string, value: any) =>
    onUpdate({ data: { ...block.data, [key]: value } as any });
  const setTiers = (next: Tier[]) => updateAny('result_tiers', next);
  const setMetrics = (next: Metric[]) => updateAny('result_metrics', next);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">#{numberOf(block.id) || '?'}</Badge>
        <h3 className="font-semibold text-sm truncate">{shortLabel(block)}</h3>
      </div>

      <Tabs defaultValue={isEnd ? 'result' : 'content'}>
        <TabsList className={cn('w-full grid h-8', isEnd ? 'grid-cols-3' : 'grid-cols-2')}>
          <TabsTrigger value="content" className="text-xs">Conteúdo</TabsTrigger>
          <TabsTrigger value="logic" className="text-xs">
            <GitBranch className="h-3 w-3 mr-1" /> Lógica
          </TabsTrigger>
          {isEnd && (
            <TabsTrigger value="result" className="text-xs">🎯 Resultado</TabsTrigger>
          )}
        </TabsList>

        {/* ───────── CONTEÚDO ───────── */}
        <TabsContent value="content" className="space-y-3 pt-3">
          {!isCondition && !isScore && !isTag && (
            <>
              <div>
                <Label className="text-xs">Pergunta / Mensagem</Label>
                <Textarea
                  rows={2}
                  className="text-sm"
                  value={block.data.content || ''}
                  onChange={(e) => update('content', e.target.value)}
                  placeholder="Texto exibido para o lead..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs flex items-center gap-1">
                    <Hash className="h-3 w-3" /> Variável
                  </Label>
                  <Input
                    className="text-xs font-mono h-8"
                    value={block.data.variable_name || ''}
                    onChange={(e) => update('variable_name', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    placeholder="ex: faturamento"
                  />
                </div>
                <div className="flex items-end justify-between gap-2 pb-1">
                  <Label className="text-xs">Obrigatória</Label>
                  <Switch
                    checked={!!block.data.required}
                    onCheckedChange={(v) => update('required', v)}
                  />
                </div>
              </div>

              {block.type === 'input' && (
                <div>
                  <Label className="text-xs">Placeholder</Label>
                  <Input
                    className="text-xs h-8"
                    value={block.data.placeholder || ''}
                    onChange={(e) => update('placeholder', e.target.value)}
                  />
                </div>
              )}

              <div>
                <Label className="text-xs">Subtítulo (opcional)</Label>
                <Input
                  className="text-xs h-8"
                  value={block.data.subtitle || ''}
                  onChange={(e) => update('subtitle', e.target.value)}
                  placeholder="Ex: Selecione a opção que mais combina"
                />
              </div>

              <div className="grid grid-cols-[1fr_88px] gap-2">
                <div>
                  <Label className="text-xs">Texto do botão</Label>
                  <Input
                    className="text-xs h-8"
                    value={block.data.cta_label || ''}
                    onChange={(e) => update('cta_label', e.target.value)}
                    placeholder="Continuar"
                  />
                </div>
                <div>
                  <Label className="text-xs">Emoji</Label>
                  <Input
                    className="text-xs h-8"
                    value={block.data.cta_emoji || ''}
                    onChange={(e) => update('cta_emoji', e.target.value)}
                    placeholder="👉"
                    maxLength={4}
                  />
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mostrar logo no topo</Label>
                  <Switch
                    checked={block.data.show_logo !== false}
                    onCheckedChange={(v) => update('show_logo', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mostrar duração estimada</Label>
                  <Switch
                    checked={!!block.data.show_duration}
                    onCheckedChange={(v) => update('show_duration', v)}
                  />
                </div>
                {block.data.show_duration && (
                  <Input
                    className="text-xs h-8"
                    value={block.data.duration_label || ''}
                    onChange={(e) => update('duration_label', e.target.value)}
                    placeholder="2min para responder"
                  />
                )}
              </div>

              <div>
                <Label className="text-xs flex items-center gap-1">
                  <ImageIcon className="h-3 w-3" /> Imagem (opcional)
                </Label>
                <Input
                  className="text-xs h-8"
                  value={block.data.image_url || ''}
                  onChange={(e) => update('image_url', e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </>
          )}

          {isChoice && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Opções</Label>
                <Button size="sm" variant="ghost" onClick={addOption} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> Opção
                </Button>
              </div>

              <div className="space-y-2">
                {(block.data.options || []).map((opt, idx) => (
                  <div key={opt.id} className="rounded-lg border bg-card p-2 space-y-2">
                    <div className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded-md bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground">
                        {opt.letter || String.fromCharCode(65 + idx)}
                      </span>
                      <Input
                        className="text-xs h-7 flex-1"
                        value={opt.label}
                        onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                        placeholder={`Opção ${idx + 1}`}
                      />
                      <Button size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => moveOption(opt.id, -1)} disabled={idx === 0}>
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6"
                        onClick={() => moveOption(opt.id, 1)}
                        disabled={idx === (block.data.options?.length ?? 0) - 1}>
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                        onClick={() => removeOption(opt.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-1">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Emoji</Label>
                        <Input
                          className="text-xs h-7"
                          value={opt.emoji || ''}
                          onChange={(e) => updateOption(opt.id, { emoji: e.target.value })}
                          placeholder="🚀"
                          maxLength={2}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="h-2.5 w-2.5" /> Score
                        </Label>
                        <Input
                          type="number"
                          className="text-xs h-7"
                          value={opt.score ?? ''}
                          onChange={(e) => updateOption(opt.id, {
                            score: e.target.value === '' ? undefined : Number(e.target.value),
                          })}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <TagIcon className="h-2.5 w-2.5" /> Tag
                        </Label>
                        <Input
                          className="text-xs h-7"
                          value={opt.tag || ''}
                          onChange={(e) => updateOption(opt.id, { tag: e.target.value })}
                          placeholder="quente"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <ArrowRight className="h-2.5 w-2.5" /> Ir para
                      </Label>
                      <Select
                        value={opt.next_block_id || 'sequential'}
                        onValueChange={(v) => updateOption(opt.id, {
                          next_block_id: v === 'sequential' ? null : v,
                        })}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sequential" className="text-xs">
                            Próximo na sequência
                          </SelectItem>
                          {others.map(b => (
                            <SelectItem key={b.id} value={b.id} className="text-xs">
                              #{numberOf(b.id)} — {shortLabel(b)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}

                {!hasOptions && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Adicione opções para o lead escolher
                  </p>
                )}
              </div>
            </>
          )}

          {isScore && (
            <>
              <div>
                <Label className="text-xs">Variável (opcional)</Label>
                <Input
                  className="text-xs font-mono h-8"
                  value={block.data.variable_name || ''}
                  onChange={(e) => update('variable_name', e.target.value)}
                  placeholder="score_total"
                />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Pontos a somar
                </Label>
                <Input
                  type="number"
                  className="text-xs h-8"
                  value={block.data.score_value ?? 0}
                  onChange={(e) => update('score_value', Number(e.target.value))}
                />
              </div>
            </>
          )}

          {isTag && (
            <div>
              <Label className="text-xs flex items-center gap-1">
                <TagIcon className="h-3 w-3" /> Tags a aplicar (separadas por vírgula)
              </Label>
              <Input
                className="text-xs h-8"
                value={(block.data.apply_tags || []).join(', ')}
                onChange={(e) => update('apply_tags',
                  e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                )}
                placeholder="quente, interessado"
              />
            </div>
          )}
        </TabsContent>

        {/* ───────── LÓGICA ───────── */}
        <TabsContent value="logic" className="space-y-3 pt-3">
          {isCondition ? (
            <>
              <div className="rounded-lg border bg-amber-500/5 border-amber-500/20 p-2.5 space-y-2">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <GitBranch className="h-3 w-3" /> Se
                </p>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    className="text-xs h-8 font-mono"
                    placeholder="variável"
                    value={block.data.condition?.variable || ''}
                    onChange={(e) => update('condition', {
                      ...(block.data.condition || { operator: 'equals', value: '' }),
                      variable: e.target.value,
                    })}
                  />
                </div>
                <Select
                  value={block.data.condition?.operator || 'equals'}
                  onValueChange={(v: any) => update('condition', {
                    ...(block.data.condition || { variable: '', value: '' }),
                    operator: v,
                  })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map(op => (
                      <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="text-xs h-8"
                  placeholder="valor"
                  value={String(block.data.condition?.value ?? '')}
                  onChange={(e) => update('condition', {
                    ...(block.data.condition || { variable: '', operator: 'equals' }),
                    value: e.target.value,
                  })}
                />
              </div>

              <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-2.5 space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400">
                  Então (verdadeiro) → Ir para
                </p>
                <Select
                  value={block.data.true_next_block_id || 'sequential'}
                  onValueChange={(v) => update('true_next_block_id', v === 'sequential' ? undefined : v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential" className="text-xs">Próximo na sequência</SelectItem>
                    {others.map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        #{numberOf(b.id)} — {shortLabel(b)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border bg-rose-500/5 border-rose-500/20 p-2.5 space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-rose-700 dark:text-rose-400">
                  Senão (falso) → Ir para
                </p>
                <Select
                  value={block.data.false_next_block_id || 'sequential'}
                  onValueChange={(v) => update('false_next_block_id', v === 'sequential' ? undefined : v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential" className="text-xs">Próximo na sequência</SelectItem>
                    {others.map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        #{numberOf(b.id)} — {shortLabel(b)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" /> Avançar para
                </Label>
                <Select
                  value={block.next_block_id || 'sequential'}
                  onValueChange={(v) => onConnect(v === 'sequential' ? null : v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential" className="text-xs">Próximo na sequência</SelectItem>
                    {others.map(b => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">
                        #{numberOf(b.id)} — {shortLabel(b)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Por padrão segue a ordem visual. Escolha um destino para criar ramificação.
                </p>
              </div>

              {isChoice && hasOptions && (
                <div className={cn(
                  'rounded-lg border bg-muted/30 p-2.5 space-y-1.5',
                )}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Ramificações por opção
                  </p>
                  {(block.data.options || []).map((opt, idx) => {
                    const target = opt.next_block_id;
                    return (
                      <div key={opt.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate flex-1">
                          <span className="font-mono text-[10px] mr-1 text-muted-foreground">
                            {opt.letter || String.fromCharCode(65 + idx)}
                          </span>
                          {opt.label}
                        </span>
                        <Badge variant={target ? 'default' : 'outline'} className="text-[10px] h-5">
                          {target ? `→ #${numberOf(target)}` : 'sequência'}
                        </Badge>
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Edite o destino de cada opção na aba <strong>Conteúdo</strong>.
                  </p>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ───────── RESULTADO (apenas para blocos end) ───────── */}
        {isEnd && (
          <TabsContent value="result" className="space-y-4 pt-3">
            <div>
              <Label className="text-xs">Mensagem do resultado</Label>
              <Input
                className="text-xs h-8"
                value={block.data.success_message || ''}
                onChange={(e) => update('success_message', e.target.value)}
                placeholder="Seu resultado:"
              />
            </div>

            {/* Toggle Resultado IA */}
            <div className="rounded-lg border bg-violet-500/5 border-violet-500/20 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1 text-violet-700 dark:text-violet-400">
                  ✨ Análise com IA
                </Label>
                <Switch
                  checked={!!(block.data as any).result_ai_enabled || (block.data as any).quiz_subtype === 'result_ai'}
                  onCheckedChange={(v) => {
                    updateAny('result_ai_enabled', v);
                    updateAny('quiz_subtype', v ? 'result_ai' : 'result');
                  }}
                />
              </div>
              {((block.data as any).result_ai_enabled || (block.data as any).quiz_subtype === 'result_ai') && (
                <Textarea
                  rows={3}
                  className="text-xs"
                  value={(block.data as any).result_ai_prompt || ''}
                  onChange={(e) => updateAny('result_ai_prompt', e.target.value)}
                  placeholder="Prompt personalizado (opcional). Ex: Você é um consultor de marketing digital. Gere um diagnóstico..."
                />
              )}
              <p className="text-[10px] text-muted-foreground">
                Gera diagnóstico, oportunidades, próximos passos e oferta com base nas respostas e score.
              </p>
            </div>

            {/* Faixas de pontuação */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Faixas de pontuação</Label>
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => setTiers([...tiers, {
                    id: generateBlockId(), label: 'Nova faixa', min: 0, max: 100, color: '#8b5cf6',
                  }])}>
                  <Plus className="h-3 w-3 mr-1" /> Faixa
                </Button>
              </div>
              {tiers.map((t, i) => (
                <div key={t.id} className="rounded-lg border bg-card p-2 space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Input
                      className="text-xs h-7 flex-1"
                      value={t.label}
                      onChange={(e) => setTiers(tiers.map(x => x.id === t.id ? { ...x, label: e.target.value } : x))}
                      placeholder="Iniciante"
                    />
                    <input
                      type="color"
                      value={t.color || '#8b5cf6'}
                      onChange={(e) => setTiers(tiers.map(x => x.id === t.id ? { ...x, color: e.target.value } : x))}
                      className="h-7 w-8 rounded border cursor-pointer"
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                      onClick={() => setTiers(tiers.filter(x => x.id !== t.id))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Input
                      type="number" className="text-xs h-7"
                      value={t.min}
                      onChange={(e) => setTiers(tiers.map(x => x.id === t.id ? { ...x, min: Number(e.target.value) } : x))}
                      placeholder="min"
                    />
                    <Input
                      type="number" className="text-xs h-7"
                      value={t.max}
                      onChange={(e) => setTiers(tiers.map(x => x.id === t.id ? { ...x, max: Number(e.target.value) } : x))}
                      placeholder="max"
                    />
                  </div>
                  <Input
                    className="text-xs h-7"
                    value={t.message || ''}
                    onChange={(e) => setTiers(tiers.map(x => x.id === t.id ? { ...x, message: e.target.value } : x))}
                    placeholder="Mensagem desta faixa"
                  />
                </div>
              ))}
            </div>

            {/* Métricas simuladas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Métricas visuais</Label>
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => setMetrics([...metrics, {
                    id: generateBlockId(), label: 'Métrica', value: 70,
                  }])}>
                  <Plus className="h-3 w-3 mr-1" /> Métrica
                </Button>
              </div>
              {metrics.map((m) => (
                <div key={m.id} className="rounded-lg border bg-card p-2 space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Input
                      className="text-xs h-7 flex-1"
                      value={m.label}
                      onChange={(e) => setMetrics(metrics.map(x => x.id === m.id ? { ...x, label: e.target.value } : x))}
                      placeholder="Taxa de conversão"
                    />
                    <input
                      type="color"
                      value={m.color || '#3b82f6'}
                      onChange={(e) => setMetrics(metrics.map(x => x.id === m.id ? { ...x, color: e.target.value } : x))}
                      className="h-7 w-8 rounded border cursor-pointer"
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                      onClick={() => setMetrics(metrics.filter(x => x.id !== m.id))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Input
                      type="number" min={0} max={100}
                      className="text-xs h-7"
                      value={m.value}
                      onChange={(e) => setMetrics(metrics.map(x => x.id === m.id ? { ...x, value: Number(e.target.value) } : x))}
                      placeholder="0-100"
                    />
                    <Input
                      className="text-xs h-7"
                      value={m.display || ''}
                      onChange={(e) => setMetrics(metrics.map(x => x.id === m.id ? { ...x, display: e.target.value } : x))}
                      placeholder="72%"
                    />
                  </div>
                </div>
              ))}
              {metrics.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-2">
                  Adicione cards visuais para impressionar o respondente.
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">Redirect URL (após exibir resultado)</Label>
              <Input
                className="text-xs h-8"
                value={block.data.redirect_url || ''}
                onChange={(e) => update('redirect_url', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
