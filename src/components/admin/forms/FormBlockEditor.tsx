import { useState, useEffect, useRef } from 'react';
import { FormBlock, FormBlockType, getBlockConfig, SelectOption, ScaleOptions, LogicRule, isMediaBlock, toEmbedUrl, Form, FormBlockAutomation, FormBlockCrmSettings, LeadTemperature, AutomationOperator } from '@/types/forms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, X, GripVertical, Upload, Loader2, Tag as TagIcon, Target, Flame, Database, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useProductPipelineStages } from '@/hooks/useProductPipelineStages';
import { OptionActionsEditor } from './OptionActionsEditor';

const LEAD_FIELD_MAPPINGS = [
  { value: 'name', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'company', label: 'Empresa' },
  { value: 'position', label: 'Cargo' },
  { value: 'notes', label: 'Observações' },
  { value: 'custom', label: 'Campo personalizado' },
];

const CATEGORY_COLORS: Record<string, string> = {
  screen: 'bg-purple-500',
  input: 'bg-blue-500',
  selection: 'bg-green-500',
  logic: 'bg-orange-500',
  advanced: 'bg-pink-500',
  media: 'bg-cyan-500',
};

const TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  cold: 'Frio',
  warm: 'Morno',
  hot: 'Quente',
};

const OPERATOR_LABELS: Record<AutomationOperator, string> = {
  any: 'Qualquer resposta',
  equals: 'Igual a',
  contains: 'Contém',
  gte: 'Maior ou igual',
  lte: 'Menor ou igual',
};

const INPUT_BLOCK_TYPES: FormBlockType[] = [
  'text', 'email', 'phone', 'number', 'textarea',
  'select', 'multi_select', 'yes_no', 'scale',
];

interface FormBlockEditorProps {
  block: FormBlock | null;
  allBlocks: FormBlock[];
  form?: Form;
  onUpdate: (block: FormBlock) => void;
  onClose: () => void;
}

export function FormBlockEditor({
  block,
  allBlocks,
  form,
  onUpdate,
  onClose,
}: FormBlockEditorProps) {

  const [localBlock, setLocalBlock] = useState<FormBlock | null>(block);
  const { profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const carouselInputRef = useRef<HTMLInputElement>(null);
  const { data: leadTags } = useLeadTags();
  const { data: pipelineStages } = useProductPipelineStages(form?.product_id);

  useEffect(() => {
    setLocalBlock(block);
  }, [block]);

  if (!localBlock) {
    return (
      <div className="w-full md:w-80 bg-card md:border-l flex items-center justify-center text-muted-foreground p-4 text-center">
        <p>Selecione um bloco para editar suas propriedades</p>
      </div>
    );
  }

  const config = getBlockConfig(localBlock.block_type);
  const categoryColor = config ? CATEGORY_COLORS[config.category] : 'bg-muted';
  
  const handleChange = <K extends keyof FormBlock>(key: K, value: FormBlock[K]) => {
    const updated = { ...localBlock, [key]: value };
    setLocalBlock(updated);
    onUpdate(updated);
  };

  const handleOptionsChange = (options: SelectOption[] | ScaleOptions) => {
    handleChange('options', options);
  };

  // Select options management
  const addOption = () => {
    const currentOptions = (localBlock.options as SelectOption[]) || [];
    const newOption: SelectOption = {
      value: `option_${currentOptions.length + 1}`,
      label: `Opção ${currentOptions.length + 1}`,
    };
    handleOptionsChange([...currentOptions, newOption]);
  };

  const updateOption = (index: number, updates: Partial<SelectOption>) => {
    const currentOptions = [...(localBlock.options as SelectOption[])];
    currentOptions[index] = { ...currentOptions[index], ...updates };
    handleOptionsChange(currentOptions);
  };

  const removeOption = (index: number) => {
    const currentOptions = [...(localBlock.options as SelectOption[])];
    currentOptions.splice(index, 1);
    handleOptionsChange(currentOptions);
  };

  // Tags management
  const addTag = (tag: string) => {
    if (tag && !localBlock.apply_tags.includes(tag)) {
      handleChange('apply_tags', [...localBlock.apply_tags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    handleChange('apply_tags', localBlock.apply_tags.filter(t => t !== tag));
  };

  // Media helpers


  const updateSettings = (patch: Record<string, unknown>) => {
    handleChange('block_settings', { ...(localBlock.block_settings || {}), ...patch });
  };

  const uploadToBucket = async (file: File): Promise<string | null> => {
    if (!profile?.organization_id) {
      toast.error('Organização não encontrada');
      return null;
    }
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${profile.organization_id}/${localBlock.form_id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('form-media').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) {
      toast.error('Falha no upload: ' + error.message);
      return null;
    }
    const { data } = supabase.storage.from('form-media').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSingleUpload = async (file: File) => {
    setUploading(true);
    const url = await uploadToBucket(file);
    setUploading(false);
    if (url) updateSettings({ url });
  };

  const handleCarouselUpload = async (files: FileList) => {
    setUploading(true);
    const current = ((localBlock.block_settings as any)?.images as string[]) || [];
    const uploaded: string[] = [];
    for (const f of Array.from(files)) {
      const url = await uploadToBucket(f);
      if (url) uploaded.push(url);
    }
    setUploading(false);
    if (uploaded.length) updateSettings({ images: [...current, ...uploaded] });
  };

  const removeCarouselImage = (idx: number) => {
    const current = ((localBlock.block_settings as any)?.images as string[]) || [];
    updateSettings({ images: current.filter((_, i) => i !== idx) });
  };

  // ---------- CRM Automations (Phase 2) ----------


  const crm: FormBlockCrmSettings = (localBlock.block_settings as any)?.crm || {};
  const updateCrm = (patch: Partial<FormBlockCrmSettings>) => {
    const next: FormBlockCrmSettings = { ...crm, ...patch };
    updateSettings({ crm: next });
  };

  const toggleCrmTag = (tagId: string) => {
    const current = crm.add_tag_ids || [];
    const next = current.includes(tagId)
      ? current.filter((t) => t !== tagId)
      : [...current, tagId];
    updateCrm({ add_tag_ids: next });
  };

  const addAutomation = () => {
    const list = crm.automations || [];
    updateCrm({
      automations: [
        ...list,
        { id: crypto.randomUUID(), when: { operator: 'equals', value: '' }, add_tag_ids: [], add_score: 0 },
      ],
    });
  };

  const updateAutomation = (idx: number, patch: Partial<FormBlockAutomation>) => {
    const list = [...(crm.automations || [])];
    list[idx] = { ...list[idx], ...patch };
    updateCrm({ automations: list });
  };

  const removeAutomation = (idx: number) => {
    const list = [...(crm.automations || [])];
    list.splice(idx, 1);
    updateCrm({ automations: list });
  };

  const toggleAutomationTag = (idx: number, tagId: string) => {
    const rule = (crm.automations || [])[idx];
    const current = rule?.add_tag_ids || [];
    const next = current.includes(tagId)
      ? current.filter((t) => t !== tagId)
      : [...current, tagId];
    updateAutomation(idx, { add_tag_ids: next });
  };

  const showCrmSection = INPUT_BLOCK_TYPES.includes(localBlock.block_type);

  return (
    <div className="w-full md:w-80 bg-card md:border-l flex flex-col h-full">

      {/* Header */}
      <div className={cn("p-4 flex items-center justify-between", categoryColor)}>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">{config?.label || 'Bloco'}</h3>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-white/80 hover:text-white hover:bg-white/20" 
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Common fields */}
          <div className="space-y-2">
            <Label>Pergunta / Título</Label>
            <Textarea
              value={localBlock.label}
              onChange={(e) => handleChange('label', e.target.value)}
              placeholder="Digite a pergunta..."
              rows={2}
            />
          </div>
          
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={localBlock.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Texto de ajuda ou contexto..."
              rows={2}
            />
          </div>
          
          {/* Placeholder for input types */}
          {['text', 'email', 'phone', 'number', 'textarea'].includes(localBlock.block_type) && (
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                value={localBlock.placeholder || ''}
                onChange={(e) => handleChange('placeholder', e.target.value)}
                placeholder="Texto de exemplo..."
              />
            </div>
          )}
          
          {/* Required toggle for inputs */}
          {!['welcome_screen', 'end_screen', 'conditional', 'score', 'tag', 'hidden_field'].includes(localBlock.block_type) && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Obrigatório</Label>
                  <p className="text-xs text-muted-foreground">O usuário deve responder</p>
                </div>
                <Switch
                  checked={localBlock.required}
                  onCheckedChange={(checked) => handleChange('required', checked)}
                />
              </div>
            </>
          )}
          
          {/* Select/Multi-select options */}
          {['select', 'multi_select'].includes(localBlock.block_type) && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Opções</Label>
                  <Button variant="outline" size="sm" onClick={addOption}>
                    <Plus className="w-3 h-3 mr-1" />
                    Adicionar
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {((localBlock.options as SelectOption[]) || []).map((option, index) => (
                    <div key={index} className="flex items-center gap-1.5 bg-muted rounded-lg p-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
                      <Input
                        value={option.label}
                        onChange={(e) => updateOption(index, {
                          label: e.target.value,
                          value: e.target.value.toLowerCase().replace(/\s+/g, '_')
                        })}
                        placeholder="Texto da opção"
                        className="flex-1 h-8"
                      />
                      <div className="flex items-center gap-1 shrink-0" title="Pontos somados ao score do lead">
                        <Target className="w-3 h-3 text-muted-foreground" />
                        <Input
                          type="number"
                          value={option.score ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateOption(index, { score: raw === '' ? undefined : (parseInt(raw, 10) || 0) });
                          }}
                          placeholder="0"
                          className="h-8 w-14 text-xs text-center px-1"
                        />
                        <span className="text-[10px] text-muted-foreground">pts</span>
                      </div>
                      <OptionActionsEditor
                        actions={option.actions || []}
                        onChange={(actions) => updateOption(index, { actions })}
                        allBlocks={allBlocks}
                        currentBlockId={localBlock.id}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                        onClick={() => removeOption(index)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Use o ícone ⚡ ao lado de cada opção para configurar ações como redirecionar para pagamento, abrir o calendário, atribuir setor/agente, ou adicionar etiquetas. O campo <strong>pts</strong> soma pontos ao score do lead quando a opção é escolhida (classifica em frio/morno/quente).
                </p>
              </div>
            </>
          )}

          {/* Yes/No scoring */}
          {localBlock.block_type === 'yes_no' && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Pontuação por resposta</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Pontos se "Sim"</Label>
                    <Input
                      type="number"
                      value={(localBlock.block_settings as any)?.score_yes ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === '' ? undefined : (parseInt(raw, 10) || 0);
                        handleChange('block_settings', { ...(localBlock.block_settings || {}), score_yes: v });
                      }}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Pontos se "Não"</Label>
                    <Input
                      type="number"
                      value={(localBlock.block_settings as any)?.score_no ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const v = raw === '' ? undefined : (parseInt(raw, 10) || 0);
                        handleChange('block_settings', { ...(localBlock.block_settings || {}), score_no: v });
                      }}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          
          {/* Scale options */}
          {localBlock.block_type === 'scale' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Configuração da Escala</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Valor Mínimo</Label>
                    <Input
                      type="number"
                      value={(localBlock.options as ScaleOptions)?.min || 1}
                      onChange={(e) => handleOptionsChange({
                        ...(localBlock.options as ScaleOptions),
                        min: parseInt(e.target.value) || 1,
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Valor Máximo</Label>
                    <Input
                      type="number"
                      value={(localBlock.options as ScaleOptions)?.max || 10}
                      onChange={(e) => handleOptionsChange({
                        ...(localBlock.options as ScaleOptions),
                        max: parseInt(e.target.value) || 10,
                      })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Label Mínimo</Label>
                    <Input
                      value={(localBlock.options as ScaleOptions)?.min_label || ''}
                      onChange={(e) => handleOptionsChange({
                        ...(localBlock.options as ScaleOptions),
                        min_label: e.target.value,
                      })}
                      placeholder="Ruim"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Label Máximo</Label>
                    <Input
                      value={(localBlock.options as ScaleOptions)?.max_label || ''}
                      onChange={(e) => handleOptionsChange({
                        ...(localBlock.options as ScaleOptions),
                        max_label: e.target.value,
                      })}
                      placeholder="Excelente"
                    />
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" /> Pontos por ponto da escala
                  </Label>
                  <Input
                    type="number"
                    value={(localBlock.block_settings as any)?.score_per_point ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const v = raw === '' ? undefined : (parseInt(raw, 10) || 0);
                      handleChange('block_settings', { ...(localBlock.block_settings || {}), score_per_point: v });
                    }}
                    placeholder="0"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Multiplica pelo valor escolhido. Ex.: 2 pts × resposta 7 = 14 pontos.
                  </p>
                </div>
              </div>
            </>
          )}
          
          {/* Score block */}
          {localBlock.block_type === 'score' && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Pontuação</Label>
                <Input
                  type="number"
                  value={localBlock.score_value}
                  onChange={(e) => handleChange('score_value', parseInt(e.target.value) || 0)}
                  placeholder="10"
                />
                <p className="text-xs text-muted-foreground">
                  Pontos adicionados ao score do lead
                </p>
              </div>
            </>
          )}
          
          {/* Tag block */}
          {localBlock.block_type === 'tag' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Tags a Aplicar</Label>
                <div className="flex flex-wrap gap-1.5">
                  {localBlock.apply_tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova etiqueta..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addTag((e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                </div>
              </div>
            </>
          )}
          
          {/* Hidden field */}
          {localBlock.block_type === 'hidden_field' && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Mapear para</Label>
                  <Select
                    value={localBlock.maps_to || 'custom'}
                    onValueChange={(value) => handleChange('maps_to', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utm_source">UTM Source</SelectItem>
                      <SelectItem value="utm_medium">UTM Medium</SelectItem>
                      <SelectItem value="utm_campaign">UTM Campaign</SelectItem>
                      <SelectItem value="utm_content">UTM Content</SelectItem>
                      <SelectItem value="utm_term">UTM Term</SelectItem>
                      <SelectItem value="referrer">Referrer URL</SelectItem>
                      <SelectItem value="landing_page">Landing Page</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
          
          {/* Field mapping for inputs */}
          {['text', 'email', 'phone', 'number', 'textarea'].includes(localBlock.block_type) && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>Mapear para campo do Lead</Label>
                <Select
                  value={localBlock.maps_to || 'none'}
                  onValueChange={(value) => handleChange('maps_to', value === 'none' ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {LEAD_FIELD_MAPPINGS.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A resposta será salva neste campo do lead
                </p>
              </div>
            </>
          )}

          {/* ===== CRM Automations (Phase 2) ===== */}
          {showCrmSection && (
            <>
              <Separator />
              <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold">Automações no CRM</Label>
                </div>

                {/* Tags sempre que responder */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <TagIcon className="w-3 h-3" /> Tags ao responder
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-start h-8">
                        <Plus className="w-3 h-3 mr-1" />
                        {crm.add_tag_ids?.length ? `${crm.add_tag_ids.length} tag(s)` : 'Selecionar tags'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2 max-h-64 overflow-auto">
                      {(leadTags || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground p-2">Nenhuma tag criada ainda.</p>
                      ) : (
                        <div className="space-y-1">
                          {(leadTags || []).map((t) => {
                            const checked = (crm.add_tag_ids || []).includes(t.id);
                            return (
                              <button
                                key={t.id}
                                onClick={() => toggleCrmTag(t.id)}
                                className={cn(
                                  'w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted',
                                  checked && 'bg-primary/10'
                                )}
                              >
                                <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                                <span className="flex-1 truncate">{t.name}</span>
                                {checked && <span className="text-xs text-primary">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  {!!crm.add_tag_ids?.length && (
                    <div className="flex flex-wrap gap-1">
                      {crm.add_tag_ids.map((id) => {
                        const t = leadTags?.find((x) => x.id === id);
                        if (!t) return null;
                        return (
                          <Badge key={id} variant="secondary" className="gap-1" style={{ background: `${t.color}22`, color: t.color }}>
                            {t.name}
                            <button onClick={() => toggleCrmTag(id)}><X className="w-3 h-3" /></button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Estágio do pipeline */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Target className="w-3 h-3" /> Mover para estágio
                  </Label>
                  <Select
                    value={crm.set_stage_id || 'none'}
                    onValueChange={(v) => updateCrm({ set_stage_id: v === 'none' ? null : v })}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não alterar</SelectItem>
                      {(pipelineStages || []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Temperatura */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Flame className="w-3 h-3" /> Temperatura
                  </Label>
                  <Select
                    value={crm.set_temperature || 'none'}
                    onValueChange={(v) => updateCrm({ set_temperature: v === 'none' ? null : (v as LeadTemperature) })}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="Não alterar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não alterar</SelectItem>
                      {(['cold','warm','hot'] as LeadTemperature[]).map((t) => (
                        <SelectItem key={t} value={t}>{TEMPERATURE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Campo personalizado */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Database className="w-3 h-3" /> Campo personalizado
                  </Label>
                  <Input
                    value={crm.custom_field_key || ''}
                    onChange={(e) => updateCrm({ custom_field_key: e.target.value || null })}
                    placeholder="ex.: faturamento_mensal"
                    className="h-8"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Resposta gravada em <code>metadata.custom_fields.{`{chave}`}</code> do lead.
                  </p>
                </div>

                {/* Regras condicionais */}
                <div className="space-y-2 pt-2 border-t border-primary/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Regras condicionais</Label>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addAutomation}>
                      <Plus className="w-3 h-3 mr-1" /> Adicionar
                    </Button>
                  </div>
                  {(crm.automations || []).length === 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Aplique tags/estágio/temperatura apenas quando a resposta atender uma condição.
                    </p>
                  )}
                  {(crm.automations || []).map((rule, idx) => (
                    <div key={rule.id || idx} className="rounded border bg-background p-2 space-y-2">
                      <div className="flex items-start gap-1.5">
                        <div className="flex-1 grid grid-cols-2 gap-1.5">
                          <Select
                            value={rule.when?.operator || 'equals'}
                            onValueChange={(v) => updateAutomation(idx, { when: { ...(rule.when || { operator: 'equals' }), operator: v as AutomationOperator } })}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(OPERATOR_LABELS) as AutomationOperator[]).map((op) => (
                                <SelectItem key={op} value={op}>{OPERATOR_LABELS[op]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {rule.when?.operator !== 'any' && (
                            <Input
                              value={String(rule.when?.value ?? '')}
                              onChange={(e) => updateAutomation(idx, { when: { ...(rule.when || { operator: 'equals' }), value: e.target.value } })}
                              placeholder="Valor"
                              className="h-7 text-xs"
                            />
                          )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAutomation(idx)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {(rule.add_tag_ids || []).map((id) => {
                          const t = leadTags?.find((x) => x.id === id);
                          if (!t) return null;
                          return (
                            <Badge key={id} variant="secondary" className="gap-1 text-[10px]" style={{ background: `${t.color}22`, color: t.color }}>
                              {t.name}
                              <button onClick={() => toggleAutomationTag(idx, id)}><X className="w-2.5 h-2.5" /></button>
                            </Badge>
                          );
                        })}
                      </div>

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full h-7 text-xs">
                            <TagIcon className="w-3 h-3 mr-1" /> Tags
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2 max-h-56 overflow-auto">
                          {(leadTags || []).map((t) => {
                            const checked = (rule.add_tag_ids || []).includes(t.id);
                            return (
                              <button
                                key={t.id}
                                onClick={() => toggleAutomationTag(idx, t.id)}
                                className={cn('w-full text-left flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-muted', checked && 'bg-primary/10')}
                              >
                                <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                                <span className="flex-1 truncate">{t.name}</span>
                                {checked && <span className="text-primary">✓</span>}
                              </button>
                            );
                          })}
                        </PopoverContent>
                      </Popover>

                      <div className="grid grid-cols-3 gap-1.5">
                        <Select
                          value={rule.set_stage_id || 'none'}
                          onValueChange={(v) => updateAutomation(idx, { set_stage_id: v === 'none' ? null : v })}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Estágio" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Estágio</SelectItem>
                            {(pipelineStages || []).map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={rule.set_temperature || 'none'}
                          onValueChange={(v) => updateAutomation(idx, { set_temperature: v === 'none' ? null : (v as LeadTemperature) })}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Temp" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Temp</SelectItem>
                            {(['cold','warm','hot'] as LeadTemperature[]).map((t) => (
                              <SelectItem key={t} value={t}>{TEMPERATURE_LABELS[t]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={rule.add_score ?? 0}
                          onChange={(e) => updateAutomation(idx, { add_score: parseInt(e.target.value) || 0 })}
                          placeholder="Score"
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}


          
          {/* End screen CTA */}
          {localBlock.block_type === 'end_screen' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Configuração da Tela Final</Label>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Texto do Botão</Label>
                  <Input
                    value={localBlock.block_settings?.cta_text as string || 'Concluir'}
                    onChange={(e) => handleChange('block_settings', {
                      ...localBlock.block_settings,
                      cta_text: e.target.value,
                    })}
                    placeholder="Concluir"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">URL de Redirecionamento</Label>
                  <Input
                    value={localBlock.block_settings?.redirect_url as string || ''}
                    onChange={(e) => handleChange('block_settings', {
                      ...localBlock.block_settings,
                      redirect_url: e.target.value,
                    })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </>
          )}
          
          {/* Media: Image */}
          {localBlock.block_type === 'image' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Imagem</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleSingleUpload(e.target.files[0])}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Upload className="w-3 h-3 mr-2" />}
                  {uploading ? 'Enviando...' : 'Fazer upload'}
                </Button>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ou cole uma URL</Label>
                  <Input
                    value={(localBlock.block_settings as any)?.url || ''}
                    onChange={(e) => updateSettings({ url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                {(localBlock.block_settings as any)?.url && (
                  <img
                    src={(localBlock.block_settings as any).url}
                    alt="preview"
                    className="w-full h-32 object-cover rounded border"
                  />
                )}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Texto alternativo (alt)</Label>
                  <Input
                    value={(localBlock.block_settings as any)?.alt || ''}
                    onChange={(e) => updateSettings({ alt: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Link ao clicar (opcional)</Label>
                  <Input
                    value={(localBlock.block_settings as any)?.link || ''}
                    onChange={(e) => updateSettings({ link: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </>
          )}

          {/* Media: Video upload */}
          {localBlock.block_type === 'video_upload' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>Vídeo</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleSingleUpload(e.target.files[0])}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Upload className="w-3 h-3 mr-2" />}
                  {uploading ? 'Enviando...' : 'Fazer upload (MP4)'}
                </Button>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ou cole uma URL de vídeo</Label>
                  <Input
                    value={(localBlock.block_settings as any)?.url || ''}
                    onChange={(e) => updateSettings({ url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                {(localBlock.block_settings as any)?.url && (
                  <video src={(localBlock.block_settings as any).url} controls className="w-full rounded border" />
                )}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <label className="flex items-center gap-1 text-xs">
                    <Switch
                      checked={!!(localBlock.block_settings as any)?.autoplay}
                      onCheckedChange={(c) => updateSettings({ autoplay: c })}
                    />
                    Autoplay
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <Switch
                      checked={(localBlock.block_settings as any)?.controls !== false}
                      onCheckedChange={(c) => updateSettings({ controls: c })}
                    />
                    Controles
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <Switch
                      checked={!!(localBlock.block_settings as any)?.loop}
                      onCheckedChange={(c) => updateSettings({ loop: c })}
                    />
                    Loop
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Media: Video embed */}
          {localBlock.block_type === 'video_embed' && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label>URL do vídeo (YouTube / Vimeo / Loom)</Label>
                <Input
                  value={(localBlock.block_settings as any)?.url || ''}
                  onChange={(e) => updateSettings({ url: e.target.value })}
                  placeholder="https://youtube.com/watch?v=..."
                />
                {(localBlock.block_settings as any)?.url && (
                  toEmbedUrl((localBlock.block_settings as any).url)
                    ? <p className="text-xs text-emerald-600">✓ URL reconhecida</p>
                    : <p className="text-xs text-destructive">URL não reconhecida</p>
                )}
                <div className="space-y-2">
                  <Label className="text-xs">Orientação</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['horizontal', 'vertical'] as const).map((opt) => {
                      const current = ((localBlock.block_settings as any)?.orientation as string) || 'horizontal';
                      const active = current === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => updateSettings({ orientation: opt })}
                          className={`px-3 py-2 rounded-md border text-sm capitalize transition ${
                            active ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                          }`}
                        >
                          {opt === 'horizontal' ? 'Horizontal (16:9)' : 'Vertical (9:16)'}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Vertical é ideal para Shorts/Reels e ocupa a tela inteira em altura.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={!!(localBlock.block_settings as any)?.autoplay}
                    onCheckedChange={(c) => updateSettings({ autoplay: c })}
                  />
                  Autoplay (mutado)
                </label>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Botão (CTA) abaixo do vídeo</Label>
                    <Switch
                      checked={!!(localBlock.block_settings as any)?.cta_enabled}
                      onCheckedChange={(c) => updateSettings({ cta_enabled: c })}
                    />
                  </div>
                  {!!(localBlock.block_settings as any)?.cta_enabled && (
                    <div className="space-y-2 pl-1">
                      <div className="space-y-1">
                        <Label className="text-xs">Texto do botão</Label>
                        <Input
                          value={(localBlock.block_settings as any)?.cta_label || ''}
                          onChange={(e) => updateSettings({ cta_label: e.target.value })}
                          placeholder="Quero saber mais"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">URL de destino</Label>
                        <Input
                          value={(localBlock.block_settings as any)?.cta_url || ''}
                          onChange={(e) => updateSettings({ cta_url: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={((localBlock.block_settings as any)?.cta_target || '_blank') === '_blank'}
                          onCheckedChange={(c) => updateSettings({ cta_target: c ? '_blank' : '_self' })}
                        />
                        Abrir em nova aba
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Media: Carousel */}
          {localBlock.block_type === 'carousel' && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Imagens do carrossel</Label>
                  <input
                    ref={carouselInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleCarouselUpload(e.target.files)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => carouselInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                    Adicionar
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(((localBlock.block_settings as any)?.images as string[]) || []).map((url, idx) => (
                    <div key={idx} className="relative group">
                      <img src={url} alt="" className="w-full h-16 object-cover rounded border" />
                      <button
                        onClick={() => removeCarouselImage(idx)}
                        className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Media: Divider */}
          {localBlock.block_type === 'divider' && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground">Divisor visual entre seções. Sem configuração.</p>
            </>
          )}

          {/* AI blocks info */}
          {['ai_question', 'ai_followup'].includes(localBlock.block_type) && (
            <>
              <Separator />
              <div className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-lg">
                <p className="text-sm text-pink-700 dark:text-pink-300">
                  <strong>Pergunta com IA</strong>
                </p>
                <p className="text-xs text-pink-600 dark:text-pink-400 mt-1">
                  Esta pergunta será gerada dinamicamente com base no contexto do produto e nas respostas anteriores do usuário.
                </p>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
