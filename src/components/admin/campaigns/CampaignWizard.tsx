import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, Plus, Rocket, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LEAD_ORIGINS, LEAD_CHANNELS } from '@/hooks/useLeadTracking';
import { useContextLibrary } from '@/hooks/useCampaignContexts';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useCustomFields, type CustomField } from '@/hooks/useCustomFields';
import { TagFormDialog } from '@/components/admin/tags/TagFormDialog';
import { CadencePicker } from '@/components/admin/cadences/CadencePicker';
import { type VariableMapping } from '@/components/admin/meta/TemplatePicker';
import { MultiTemplatePicker, type CampaignMetaTemplateConfig } from '@/components/admin/meta/MultiTemplatePicker';

function normalizeMetaTemplateConfig(raw: any): CampaignMetaTemplateConfig {
  if (!raw || typeof raw !== 'object') {
    return { templates: [], strategy: 'random', button_actions: {} };
  }
  // Legado: { template_id, variable_mapping }
  if (raw.template_id && !Array.isArray(raw.templates)) {
    return {
      templates: [{ template_id: raw.template_id, variable_mapping: raw.variable_mapping ?? {} }],
      strategy: 'random',
      button_actions: raw.button_actions ?? {},
    };
  }
  return {
    templates: Array.isArray(raw.templates) ? raw.templates : [],
    strategy: 'random',
    button_actions: raw.button_actions ?? {},
  };
}


type CustomFieldFilter = { key: string; op: string; value: any };

type Filters = {
  origins?: string[];
  channels?: string[];
  stage_ids?: string[];
  tag_ids?: string[];
  assigned_to?: string[];
  temperature?: string[];
  custom_fields?: CustomFieldFilter[];
  search?: { name?: string; email?: string; phone?: string };
  created_after?: string;
  created_before?: string;
};

const SPEED_PRESETS = [
  { value: 'safe', label: '🐢 Seguro', desc: '2 a 5 minutos entre envios' },
  { value: 'recommended', label: '🟢 Recomendado', desc: '1 a 3 minutos entre envios' },
  { value: 'fast', label: '🚀 Rápido', desc: '30 segundos a 2 minutos' },
  { value: 'aggressive', label: '⚠️ Agressivo', desc: '10 a 45 segundos' },
];

const FULL_OPERATORS = [
  { value: 'eq', label: 'Igual a' },
  { value: 'neq', label: 'Diferente de' },
  { value: 'contains', label: 'Contém' },
  { value: 'gt', label: 'Maior que (>)' },
  { value: 'gte', label: 'Maior ou igual (≥)' },
  { value: 'lt', label: 'Menor que (<)' },
  { value: 'lte', label: 'Menor ou igual (≤)' },
  { value: 'between', label: 'Entre' },
  { value: 'is_empty', label: 'Está vazio' },
  { value: 'is_filled', label: 'Está preenchido' },
];

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  text: FULL_OPERATORS,
  number: FULL_OPERATORS,
  date: [
    { value: 'eq', label: 'Igual a' },
    { value: 'neq', label: 'Diferente de' },
    { value: 'gt', label: 'Depois de' },
    { value: 'gte', label: 'A partir de' },
    { value: 'lt', label: 'Antes de' },
    { value: 'lte', label: 'Até' },
    { value: 'between', label: 'Entre' },
    { value: 'is_empty', label: 'Está vazio' },
    { value: 'is_filled', label: 'Está preenchido' },
  ],
  select: FULL_OPERATORS,
  boolean: [
    { value: 'eq', label: 'Igual a' },
    { value: 'neq', label: 'Diferente de' },
    { value: 'is_empty', label: 'Está vazio' },
    { value: 'is_filled', label: 'Está preenchido' },
  ],
};

// Considera uma instância pronta para envio respeitando o vocabulário de cada provedor:
// Evolution usa 'connected'; Meta WhatsApp Cloud usa 'active'.
function isInstanceReady(i: { connection_type?: string; status?: string }) {
  if (!i) return false;
  if (i.connection_type === 'meta_whatsapp') return i.status === 'active';
  return i.status === 'connected';
}


export function CampaignWizard({
  orgId,
  campaignId,
  onClose,
}: {
  orgId: string | null;
  campaignId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(!!campaignId);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const { contexts: libraryContexts } = useContextLibrary(orgId);
  const { data: tags = [] } = useLeadTags();
  const { fields: customFields = [] } = useCustomFields();

  const [agents, setAgents] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productId, setProductId] = useState<string>('');
  const [stages, setStages] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [preview, setPreview] = useState<{ total: number; will: number; excluded: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    status: 'draft',
    agent_id: '',
    audience_filters: {} as Filters,
    exclusion_filters: {} as Filters,
    contexts: [] as Array<{ context_id?: string; inline_text?: string; weight: number }>,
    inline_context: '',
    context_distribution: 'random',
    instance_strategy: 'all',
    instance_distribution: [] as Array<{ instance_id: string; connection_type: 'evolution' | 'meta_whatsapp'; weight: number }>,
    speed_preset: 'recommended',
    schedule_type: 'now',
    scheduled_at: '',
    recurrence: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
    post_response_actions: {
      stop: true,
      take_over: false,
      stage_id: '',
      temperature: '',
      note: '',
      tags_add: [] as string[],
      tags_remove: [] as string[],
    },
    post_cadence_id: null as string | null,
    meta_template_config: { templates: [], strategy: 'random', button_actions: {} } as CampaignMetaTemplateConfig,
  });


  // Carregar dados auxiliares (produtos, agentes, instâncias)
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const sb = supabase as any;
      const [a, p, evo, meta] = await Promise.all([
        sb.from('product_agents').select('id, name, product_id, is_active').eq('organization_id', orgId).eq('is_active', true),
        sb.from('products').select('id, name, status').eq('organization_id', orgId).order('name'),
        sb.from('evolution_instances').select('id, name, phone_number, status').eq('organization_id', orgId),
        sb.from('whatsapp_meta_connections').select('id, display_name, phone_number, status').eq('organization_id', orgId),
      ]);
      setAgents(a.data ?? []);
      setProducts(p.data ?? []);
      const unified = [
        ...((evo.data ?? []) as any[]).map((i) => ({
          id: i.id,
          name: i.name,
          phone_number: i.phone_number,
          status: i.status,
          connection_type: 'evolution' as const,
        })),
        ...((meta.data ?? []) as any[]).map((i) => ({
          id: i.id,
          name: i.display_name,
          phone_number: i.phone_number,
          status: i.status,
          connection_type: 'meta_whatsapp' as const,
        })),
      ];
      setInstances(unified);
      if ((p.data ?? []).length && !productId) {
        setProductId(p.data[0].id);
      }
    })();
  }, [orgId]);

  // Carregar etapas do produto selecionado
  useEffect(() => {
    if (!productId) { setStages([]); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from('pipeline_stages')
        .select('id, name, order_index, product_id')
        .eq('product_id', productId)
        .order('order_index');
      setStages(data ?? []);
    })();
  }, [productId]);

  // Carregar campanha existente
  useEffect(() => {
    if (!campaignId) return;
    supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle().then(({ data }) => {
      if (data) {
        setForm({
          name: data.name ?? '',
          description: data.description ?? '',
          status: data.status,
          agent_id: data.agent_id ?? '',
          audience_filters: (data.audience_filters as Filters) ?? {},
          exclusion_filters: (data.exclusion_filters as Filters) ?? {},
          contexts: (data.contexts as any) ?? [],
          inline_context: '',
          context_distribution: data.context_distribution,
          instance_strategy: data.instance_strategy,
          instance_distribution: (data.instance_distribution as any) ?? [],
          speed_preset: data.speed_preset,
          schedule_type: data.schedule_type,
          scheduled_at: data.scheduled_at ?? '',
          recurrence: (data.recurrence as any) ?? { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
          post_response_actions: {
            stop: true,
            take_over: false,
            stage_id: '',
            temperature: '',
            note: '',
            tags_add: (data as any).tags_on_response ?? [],
            tags_remove: [],
            ...((data.post_response_actions as any) ?? {}),
          },
          post_cadence_id: (data as any).post_cadence_id ?? null,
          meta_template_config: normalizeMetaTemplateConfig((data as any).meta_template_config),
        });

      }
      setLoading(false);
    });
  }, [campaignId]);

  // Preview de público (debounced)
  useEffect(() => {
    if (!orgId) return;
    setPreviewLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke('campaign-preview', {
        body: {
          organization_id: orgId,
          audience_filters: form.audience_filters,
          exclusion_filters: form.exclusion_filters,
        },
      });
      if (!error && data) {
        setPreview({ total: data.total_audience, will: data.will_receive, excluded: data.excluded });
      }
      setPreviewLoading(false);
    }, 600);
    return () => clearTimeout(handle);
  }, [orgId, form.audience_filters, form.exclusion_filters]);

  const toggleArr = <K extends keyof Filters>(group: 'audience_filters' | 'exclusion_filters', key: K, value: string) => {
    setForm((f) => {
      const arr = (f[group][key] as string[] | undefined) ?? [];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...f, [group]: { ...f[group], [key]: next.length ? next : undefined } };
    });
  };

  const setSearchField = (key: 'name' | 'email' | 'phone', value: string) => {
    setForm((f) => ({
      ...f,
      audience_filters: {
        ...f.audience_filters,
        search: { ...(f.audience_filters.search ?? {}), [key]: value || undefined },
      },
    }));
  };

  const setDateField = (key: 'created_after' | 'created_before', value: string) => {
    setForm((f) => ({
      ...f,
      audience_filters: { ...f.audience_filters, [key]: value || undefined },
    }));
  };

  const updateCustomFieldFilters = (
    group: 'audience_filters' | 'exclusion_filters',
    updater: (list: CustomFieldFilter[]) => CustomFieldFilter[],
  ) => {
    setForm((f) => {
      const list = updater(f[group].custom_fields ?? []);
      return { ...f, [group]: { ...f[group], custom_fields: list.length ? list : undefined } };
    });
  };

  const buildPayload = () => {
    if (!orgId) throw new Error('Organização não encontrada');
    const contexts = [...form.contexts];
    if (form.inline_context.trim() && !contexts.some((c) => c.inline_text === form.inline_context)) {
      contexts.push({ inline_text: form.inline_context.trim(), weight: 1 });
    }
    return {
      organization_id: orgId,
      name: form.name,
      description: form.description || null,
      channel: 'whatsapp',
      status: form.status,
      agent_id: form.agent_id || null,
      // Mantemos tags_on_response em sincronia com tags_add (compat com campaign-on-response)
      tags_on_response: form.post_response_actions.tags_add ?? [],
      audience_filters: form.audience_filters,
      exclusion_filters: form.exclusion_filters,
      contexts,
      context_distribution: form.context_distribution,
      instance_strategy: form.instance_strategy,
      instance_distribution: form.instance_distribution,
      speed_preset: form.speed_preset,
      schedule_type: form.schedule_type,
      scheduled_at: form.scheduled_at || null,
      recurrence: form.schedule_type === 'recurring' ? form.recurrence : null,
      post_response_actions: form.post_response_actions,
      post_cadence_id: form.post_cadence_id ?? null,
      meta_template_config: (form.meta_template_config?.templates?.length ?? 0) > 0 ? form.meta_template_config : null,
    };

  };

  const saveDraft = async (): Promise<string | null> => {
    if (!form.name.trim()) { toast.error('Nome da campanha é obrigatório'); return null; }
    if (!form.agent_id) { toast.error('Selecione um agente'); return null; }
    setSaving(true);
    try {
      const payload = buildPayload();
      const { data, error } = campaignId
        ? await supabase.from('campaigns').update(payload).eq('id', campaignId).select('id').single()
        : await supabase.from('campaigns').insert(payload).select('id').single();
      if (error) { toast.error(error.message); return null; }
      toast.success('Rascunho salvo');
      return data?.id ?? null;
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    if (!preview?.will) { toast.error('Sem leads no público para enviar'); return; }
    const ready = instances.filter(isInstanceReady);
    if (!ready.length) { toast.error('Nenhum número WhatsApp conectado'); return; }
    const id = await saveDraft();
    if (!id) return;
    setStarting(true);
    const { data, error } = await supabase.functions.invoke('campaign-start', { body: { campaign_id: id } });
    setStarting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Campanha iniciada · ${data?.scheduled ?? 0} envios programados`);
    onClose();
  };

  const selectedContexts = useMemo(() => {
    return form.contexts
      .map((c) => c.context_id ? libraryContexts.find((lc) => lc.id === c.context_id) : null)
      .filter(Boolean) as any[];
  }, [form.contexts, libraryContexts]);

  if (loading) {
    return <div className="p-10 text-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2 sticky top-0 bg-background/80 backdrop-blur z-10 py-2 -mx-4 px-4 border-b">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
        <h1 className="font-semibold flex-1 truncate">
          {campaignId ? 'Editar campanha' : 'Nova campanha inteligente'}
        </h1>
        <Button variant="outline" onClick={saveDraft} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar rascunho
        </Button>
        <Button onClick={start} disabled={starting || saving}>
          {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
          Iniciar campanha
        </Button>
      </div>

      {/* 1. Configuração */}
      <Card>
        <CardHeader><CardTitle className="text-base">1. Configuração</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Nome da campanha *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Reativação Live Vendus" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Produto (define as etapas do pipeline)</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 2. Público */}
      <Card>
        <CardHeader><CardTitle className="text-base">2. Quem deve receber?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FilterBlock
            title="Origens"
            options={LEAD_ORIGINS}
            selected={form.audience_filters.origins ?? []}
            onToggle={(v) => toggleArr('audience_filters', 'origins', v)}
          />
          <FilterBlock
            title="Canais"
            options={LEAD_CHANNELS}
            selected={form.audience_filters.channels ?? []}
            onToggle={(v) => toggleArr('audience_filters', 'channels', v)}
          />
          <FilterBlock
            title="Etapas do Pipeline"
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            selected={form.audience_filters.stage_ids ?? []}
            onToggle={(v) => toggleArr('audience_filters', 'stage_ids', v)}
            emptyHint={productId ? 'Este produto não tem etapas.' : 'Selecione um produto acima.'}
          />
          <TagFilterBlock
            title="Etiquetas (possui ao menos uma)"
            tags={tags}
            selected={form.audience_filters.tag_ids ?? []}
            onToggle={(v) => toggleArr('audience_filters', 'tag_ids', v)}
            onCreateNew={() => setTagDialogOpen(true)}
          />
          <CustomFieldsFilter
            fields={customFields}
            filters={form.audience_filters.custom_fields ?? []}
            onChange={(updater) => updateCustomFieldFilters('audience_filters', updater)}
          />
        </CardContent>
      </Card>

      {/* 2b. Busca específica */}
      <Card>
        <CardHeader><CardTitle className="text-base">Buscar leads específicos</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Nome contém</Label>
            <Input
              value={form.audience_filters.search?.name ?? ''}
              onChange={(e) => setSearchField('name', e.target.value)}
              placeholder="Ex: João"
            />
          </div>
          <div>
            <Label>E-mail contém</Label>
            <Input
              value={form.audience_filters.search?.email ?? ''}
              onChange={(e) => setSearchField('email', e.target.value)}
              placeholder="Ex: @gmail.com"
            />
          </div>
          <div>
            <Label>Telefone contém</Label>
            <Input
              value={form.audience_filters.search?.phone ?? ''}
              onChange={(e) => setSearchField('phone', e.target.value)}
              placeholder="Ex: 5511"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Inscrito a partir de</Label>
              <Input
                type="date"
                value={form.audience_filters.created_after?.slice(0, 10) ?? ''}
                onChange={(e) => setDateField('created_after', e.target.value)}
              />
            </div>
            <div>
              <Label>Até</Label>
              <Input
                type="date"
                value={form.audience_filters.created_before?.slice(0, 10) ?? ''}
                onChange={(e) => setDateField('created_before', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Exclusões */}
      <Card className="border-destructive/30">
        <CardHeader><CardTitle className="text-base">3. Quem NÃO deve receber?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <TagFilterBlock
            title="Sem as etiquetas"
            tags={tags}
            selected={form.exclusion_filters.tag_ids ?? []}
            onToggle={(v) => toggleArr('exclusion_filters', 'tag_ids', v)}
            onCreateNew={() => setTagDialogOpen(true)}
            destructive
          />
          <FilterBlock
            title="Sem origens"
            options={LEAD_ORIGINS}
            selected={form.exclusion_filters.origins ?? []}
            onToggle={(v) => toggleArr('exclusion_filters', 'origins', v)}
            destructive
          />
          <FilterBlock
            title="Sem canais"
            options={LEAD_CHANNELS}
            selected={form.exclusion_filters.channels ?? []}
            onToggle={(v) => toggleArr('exclusion_filters', 'channels', v)}
            destructive
          />
          <CustomFieldsFilter
            fields={customFields}
            filters={form.exclusion_filters.custom_fields ?? []}
            onChange={(updater) => updateCustomFieldFilters('exclusion_filters', updater)}
            destructive
          />
        </CardContent>
      </Card>

      {/* Resumo público */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex flex-wrap items-center gap-6 text-sm">
          {previewLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          <div><span className="text-muted-foreground">Encontrados:</span> <strong>{preview?.total ?? '—'}</strong></div>
          <div><span className="text-muted-foreground">Receberão:</span> <strong className="text-primary text-lg">{preview?.will ?? '—'}</strong></div>
          <div><span className="text-muted-foreground">Excluídos:</span> <strong>{preview?.excluded ?? 0}</strong></div>
        </CardContent>
      </Card>

      {/* 4. Agente e Contexto */}
      <Card>
        <CardHeader><CardTitle className="text-base">4. Agente IA e Contexto</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Agente *</Label>
            <Select value={form.agent_id} onValueChange={(v) => setForm({ ...form, agent_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Contexto inline (opcional)</Label>
            <Textarea
              rows={5}
              value={form.inline_context}
              onChange={(e) => setForm({ ...form, inline_context: e.target.value })}
              placeholder="Ex: Este lead participou da aula ao vivo. Descubra qual foi sua principal objeção. Não envie proposta imediatamente."
            />
          </div>

          {!!libraryContexts.length && (
            <div>
              <Label>Ou selecione contextos da biblioteca</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {libraryContexts.map((c) => {
                  const sel = form.contexts.some((x) => x.context_id === c.id);
                  return (
                    <Badge
                      key={c.id}
                      variant={sel ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => setForm((f) => ({
                        ...f,
                        contexts: sel
                          ? f.contexts.filter((x) => x.context_id !== c.id)
                          : [...f.contexts, { context_id: c.id, weight: 1 }],
                      }))}
                    >{c.name}</Badge>
                  );
                })}
              </div>
            </div>
          )}

          {(selectedContexts.length > 0 || form.contexts.length > 1) && (
            <div>
              <Label>Distribuição entre contextos</Label>
              <RadioGroup value={form.context_distribution} onValueChange={(v) => setForm({ ...form, context_distribution: v })} className="flex gap-4 mt-1">
                <label className="flex items-center gap-2"><RadioGroupItem value="random" />Aleatório</label>
                <label className="flex items-center gap-2"><RadioGroupItem value="sequential" />Sequencial</label>
                <label className="flex items-center gap-2"><RadioGroupItem value="weighted" />Por peso</label>
              </RadioGroup>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Números */}
      <Card>
        <CardHeader><CardTitle className="text-base">5. Números de envio</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <RadioGroup value={form.instance_strategy} onValueChange={(v) => setForm({ ...form, instance_strategy: v })} className="flex gap-4">
            <label className="flex items-center gap-2"><RadioGroupItem value="all" />Todos conectados</label>
            <label className="flex items-center gap-2"><RadioGroupItem value="rotation" />Rodízio automático</label>
            <label className="flex items-center gap-2"><RadioGroupItem value="manual" />Escolha manual</label>
          </RadioGroup>

          <div className="grid gap-2">
            {instances.filter(isInstanceReady).map((i) => {
              const isManual = form.instance_strategy === 'manual';
              const sel = form.instance_distribution.some((x) => x.instance_id === i.id);
              const typeLabel = i.connection_type === 'meta_whatsapp' ? 'API Oficial' : 'Evolution';
              return (
                <div key={i.id} className="flex items-center gap-3 p-2 border rounded">
                  {isManual && (
                    <Checkbox
                      checked={sel}
                      onCheckedChange={(c) => setForm((f) => ({
                        ...f,
                        instance_distribution: c
                          ? [...f.instance_distribution, { instance_id: i.id, connection_type: i.connection_type, weight: 1 }]
                          : f.instance_distribution.filter((x) => x.instance_id !== i.id),
                      }))}
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">{i.phone_number ?? '—'}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{typeLabel}</Badge>
                  <Badge variant="default">{i.status}</Badge>
                </div>
              );
            })}
            {!instances.filter(isInstanceReady).length && (
              <p className="text-xs text-muted-foreground">Nenhum número WhatsApp ativo. Conecte uma instância Evolution ou ative uma conexão Meta API Oficial.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 5b. Template HSM (Meta API Oficial) */}
      {instances.some((i) => i.connection_type === 'meta_whatsapp' && isInstanceReady(i)) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">5b. Template HSM (API Oficial Meta)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Para enviar via conexão Meta API Oficial em uma primeira abordagem (fora da janela de 24h), selecione um template aprovado. A IA preenche as variáveis com dados do lead.
            </p>
            <MultiTemplatePicker
              organizationId={orgId}
              connectionIds={instances.filter((i) => i.connection_type === 'meta_whatsapp').map((i) => i.id)}
              value={form.meta_template_config}
              onChange={(v) => setForm({ ...form, meta_template_config: v })}
            />
          </CardContent>
        </Card>
      )}

      {/* 6. Velocidade */}

      <Card>
        <CardHeader><CardTitle className="text-base">6. Velocidade</CardTitle></CardHeader>
        <CardContent>
          <RadioGroup value={form.speed_preset} onValueChange={(v) => setForm({ ...form, speed_preset: v })} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {SPEED_PRESETS.map((p) => (
              <label key={p.value} className={`p-3 border rounded cursor-pointer ${form.speed_preset === p.value ? 'border-primary bg-primary/5' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <RadioGroupItem value={p.value} />
                  <span className="font-medium text-sm">{p.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* 7. Agenda */}
      <Card>
        <CardHeader><CardTitle className="text-base">7. Quando enviar?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <RadioGroup value={form.schedule_type} onValueChange={(v) => setForm({ ...form, schedule_type: v })} className="flex gap-4">
            <label className="flex items-center gap-2"><RadioGroupItem value="now" />Enviar agora</label>
            <label className="flex items-center gap-2"><RadioGroupItem value="scheduled" />Agendar</label>
            <label className="flex items-center gap-2"><RadioGroupItem value="recurring" />Recorrente</label>
          </RadioGroup>
          {form.schedule_type === 'scheduled' && (
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          )}
          {form.schedule_type === 'recurring' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="time" value={form.recurrence.start} onChange={(e) => setForm({ ...form, recurrence: { ...form.recurrence, start: e.target.value } })} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="time" value={form.recurrence.end} onChange={(e) => setForm({ ...form, recurrence: { ...form.recurrence, end: e.target.value } })} />
              </div>
              <div className="col-span-2">
                <Label>Dias da semana</Label>
                <div className="flex gap-1 flex-wrap mt-1">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, idx) => {
                    const sel = form.recurrence.days?.includes(idx);
                    return (
                      <Badge
                        key={idx}
                        variant={sel ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => setForm((f) => {
                          const days = f.recurrence.days ?? [];
                          return {
                            ...f,
                            recurrence: {
                              ...f.recurrence,
                              days: days.includes(idx) ? days.filter((x: number) => x !== idx) : [...days, idx],
                            },
                          };
                        })}
                      >{d}</Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 8. Pós-resposta */}
      <Card>
        <CardHeader><CardTitle className="text-base">8. Quando o lead responder…</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={form.post_response_actions.stop}
              onCheckedChange={(c) => setForm({ ...form, post_response_actions: { ...form.post_response_actions, stop: !!c } })}
            />
            Parar campanha para este lead
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={form.post_response_actions.take_over}
              onCheckedChange={(c) => setForm({ ...form, post_response_actions: { ...form.post_response_actions, take_over: !!c } })}
            />
            Assumir conversa automaticamente (humano)
          </label>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mover para etapa</Label>
              <Select
                value={form.post_response_actions.stage_id || 'none'}
                onValueChange={(v) => setForm({ ...form, post_response_actions: { ...form.post_response_actions, stage_id: v === 'none' ? '' : v } })}
              >
                <SelectTrigger><SelectValue placeholder="Manter etapa atual" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manter atual</SelectItem>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Definir temperatura</Label>
              <Select
                value={form.post_response_actions.temperature || 'none'}
                onValueChange={(v) => setForm({ ...form, post_response_actions: { ...form.post_response_actions, temperature: v === 'none' ? '' : v } })}
              >
                <SelectTrigger><SelectValue placeholder="Manter" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manter</SelectItem>
                  <SelectItem value="cold">Frio</SelectItem>
                  <SelectItem value="warm">Morno</SelectItem>
                  <SelectItem value="hot">Quente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Separator />
          <div>
            <Label>Etiquetas aplicadas ao responder</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {tags.map((t) => {
                const sel = form.post_response_actions.tags_add?.includes(t.id);
                return (
                  <Badge
                    key={t.id}
                    variant={sel ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setForm((f) => ({
                      ...f,
                      post_response_actions: {
                        ...f.post_response_actions,
                        tags_add: sel
                          ? (f.post_response_actions.tags_add ?? []).filter((x: string) => x !== t.id)
                          : [...(f.post_response_actions.tags_add ?? []), t.id],
                      },
                    }))}
                  >{t.name}</Badge>
                );
              })}
              <Badge variant="outline" className="cursor-pointer border-dashed" onClick={() => setTagDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" />Nova etiqueta
              </Badge>
            </div>
          </div>
          <div>
            <Label>Remover etiquetas ao responder</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {tags.map((t) => {
                const sel = form.post_response_actions.tags_remove?.includes(t.id);
                return (
                  <Badge
                    key={t.id}
                    variant={sel ? 'destructive' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setForm((f) => ({
                      ...f,
                      post_response_actions: {
                        ...f.post_response_actions,
                        tags_remove: sel
                          ? (f.post_response_actions.tags_remove ?? []).filter((x: string) => x !== t.id)
                          : [...(f.post_response_actions.tags_remove ?? []), t.id],
                      },
                    }))}
                  >{t.name}</Badge>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Nota automática no lead (opcional)</Label>
            <Textarea
              rows={2}
              value={form.post_response_actions.note ?? ''}
              onChange={(e) => setForm({ ...form, post_response_actions: { ...form.post_response_actions, note: e.target.value } })}
              placeholder="Ex: Lead respondeu à campanha de reativação — verificar contexto."
            />
          </div>
          <Separator />
          <div>
            <Label>Após o disparo — inserir em cadência</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Cada lead disparado pela campanha é inscrito automaticamente nesta cadência.
            </p>
            <CadencePicker
              value={form.post_cadence_id ?? null}
              onChange={(id) => setForm({ ...form, post_cadence_id: id })}
              placeholder="Não inscrever em cadência"
            />
          </div>
        </CardContent>
      </Card>

      <TagFormDialog open={tagDialogOpen} onOpenChange={setTagDialogOpen} tag={null} />
    </div>
  );
}

function FilterBlock({
  title,
  options,
  selected,
  onToggle,
  destructive,
  emptyHint,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  destructive?: boolean;
  emptyHint?: string;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{title}</Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map((o) => {
          const sel = selected.includes(o.value);
          return (
            <Badge
              key={o.value}
              variant={sel ? (destructive ? 'destructive' : 'default') : 'outline'}
              className="cursor-pointer"
              onClick={() => onToggle(o.value)}
            >{o.label}</Badge>
          );
        })}
        {!options.length && <p className="text-xs text-muted-foreground">{emptyHint ?? '—'}</p>}
      </div>
    </div>
  );
}

function TagFilterBlock({
  title,
  tags,
  selected,
  onToggle,
  onCreateNew,
  destructive,
}: {
  title: string;
  tags: any[];
  selected: string[];
  onToggle: (v: string) => void;
  onCreateNew: () => void;
  destructive?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{title}</Label>
      <div className="flex flex-wrap gap-2 mt-1">
        {tags.map((t) => {
          const sel = selected.includes(t.id);
          return (
            <Badge
              key={t.id}
              variant={sel ? (destructive ? 'destructive' : 'default') : 'outline'}
              className="cursor-pointer"
              onClick={() => onToggle(t.id)}
            >{t.name}</Badge>
          );
        })}
        <Badge variant="outline" className="cursor-pointer border-dashed" onClick={onCreateNew}>
          <Plus className="h-3 w-3 mr-1" />Nova etiqueta
        </Badge>
      </div>
    </div>
  );
}

function CustomFieldsFilter({
  fields,
  filters,
  onChange,
  destructive,
}: {
  fields: CustomField[];
  filters: CustomFieldFilter[];
  onChange: (updater: (list: CustomFieldFilter[]) => CustomFieldFilter[]) => void;
  destructive?: boolean;
}) {
  const add = () => onChange((list) => [...list, { key: '', op: 'eq', value: '' }]);
  const remove = (i: number) => onChange((list) => list.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<CustomFieldFilter>) =>
    onChange((list) => list.map((f, idx) => idx === i ? { ...f, ...patch } : f));

  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Campos personalizados {destructive && '(excluir quando)'}
      </Label>
      <div className="space-y-2 mt-1">
        {filters.map((f, i) => {
          const field = fields.find((cf) => cf.field_key === f.key);
          const operators = OPERATORS_BY_TYPE[field?.field_type ?? 'text'] ?? OPERATORS_BY_TYPE.text;
          const needsValue = !['is_empty', 'is_filled'].includes(f.op);
          const isBetween = f.op === 'between';
          const isSelect = field?.field_type === 'select';
          const isBoolean = field?.field_type === 'boolean';
          const isDate = field?.field_type === 'date';
          const isNumber = field?.field_type === 'number';

          return (
            <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 border rounded">
              <div className="col-span-4">
                <Select value={f.key} onValueChange={(v) => update(i, { key: v, value: '' })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Campo" /></SelectTrigger>
                  <SelectContent>
                    {fields.map((cf) => (
                      <SelectItem key={cf.id} value={cf.field_key}>{cf.name}</SelectItem>
                    ))}
                    {!fields.length && <SelectItem value="__none__" disabled>Nenhum campo cadastrado</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Select value={f.op} onValueChange={(v) => update(i, { op: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {operators.map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-4">
                {needsValue && isSelect && (
                  <Select value={String(f.value ?? '')} onValueChange={(v) => update(i, { value: v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Valor" /></SelectTrigger>
                    <SelectContent>
                      {(field?.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {needsValue && isBoolean && (
                  <Select value={String(f.value ?? '')} onValueChange={(v) => update(i, { value: v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Valor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Sim</SelectItem>
                      <SelectItem value="false">Não</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {needsValue && !isSelect && !isBoolean && !isBetween && (
                  <Input
                    className="h-9"
                    type={isDate ? 'date' : isNumber ? 'number' : 'text'}
                    value={f.value ?? ''}
                    onChange={(e) => update(i, { value: e.target.value })}
                    placeholder="Valor"
                  />
                )}
                {needsValue && isBetween && (
                  <div className="grid grid-cols-2 gap-1">
                    <Input
                      className="h-9"
                      type={isDate ? 'date' : 'number'}
                      value={(f.value?.from ?? '')}
                      onChange={(e) => update(i, { value: { ...(f.value ?? {}), from: e.target.value } })}
                      placeholder="De"
                    />
                    <Input
                      className="h-9"
                      type={isDate ? 'date' : 'number'}
                      value={(f.value?.to ?? '')}
                      onChange={(e) => update(i, { value: { ...(f.value ?? {}), to: e.target.value } })}
                      placeholder="Até"
                    />
                  </div>
                )}
              </div>
              <div className="col-span-1">
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={add} disabled={!fields.length}>
          <Plus className="h-3 w-3 mr-1" />
          {fields.length ? 'Adicionar filtro por campo' : 'Nenhum campo personalizado cadastrado'}
        </Button>
      </div>
    </div>
  );
}
