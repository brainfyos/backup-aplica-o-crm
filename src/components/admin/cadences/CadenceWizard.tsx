import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Plus, Trash2, GripVertical, Rocket, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useContextLibrary } from '@/hooks/useCampaignContexts';
import { type VariableMapping } from '@/components/admin/meta/TemplatePicker';
import { TemplateMultiPicker, type TemplateVariant, type TemplateRotation } from '@/components/admin/meta/TemplateMultiPicker';


interface Props {
  orgId: string | null;
  cadenceId: string | null;
  onClose: () => void;
}

type StepDraft = {
  id?: string;
  order_index: number;
  name: string;
  objective: string;
  execute_immediately: boolean;
  schedule_mode: 'delay' | 'fixed_time';
  fixed_time: string;
  fixed_day_offset: number;
  delay_value: number;
  delay_unit: 'minutes' | 'hours' | 'days';
  delay_from: 'previous_step' | 'enrollment';
  context_id: string | null;
  context_inline: string;
  tone: string;
  conditions: {
    audience?: 'all' | 'responded' | 'no_reply';
    reply_since?: 'enrollment' | 'previous_step';
    only_if_no_response?: boolean;
    only_if_no_purchase?: boolean;
    only_if_not_human?: boolean;
  };

  message_mode: 'ai' | 'fixed_text';
  fixed_message: string;
  window_requirement: 'any' | 'open' | 'closed';
  reengagement_template_id: string | null;
  reengagement_variable_mapping: VariableMapping;
  reengagement_templates: TemplateVariant[];
  reengagement_rotation: TemplateRotation;
};

type Audience = 'all' | 'responded' | 'no_reply';

function normalizeConditions(raw: any, windowRequirement?: string | null): StepDraft['conditions'] {
  const c = { ...(raw ?? {}) };
  if (!c.audience) {
    if (windowRequirement === 'open') c.audience = 'responded';
    else if (windowRequirement === 'closed' || c.only_if_no_response) c.audience = 'no_reply';
    else c.audience = 'all';
  }
  if (!c.reply_since) c.reply_since = 'enrollment';
  delete c.only_if_no_response;
  return c;
}

function windowFromAudience(a: Audience): 'any' | 'open' | 'closed' {
  return 'any';
}

type AgentConnectionOption = {

  key: string; // `${type}:${id}`
  type: 'evolution' | 'meta_whatsapp';
  id: string;
  label: string;
};


const OBJECTIVES = ['Pós Live', 'Recuperação', 'Abandono de Checkout', 'Reativação', 'Pós Compra', 'Renovação', 'Personalizado'];
const WEEK_DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Seg' }, { key: 'tue', label: 'Ter' }, { key: 'wed', label: 'Qua' },
  { key: 'thu', label: 'Qui' }, { key: 'fri', label: 'Sex' }, { key: 'sat', label: 'Sáb' }, { key: 'sun', label: 'Dom' },
];
const STOP_OPTIONS: { key: string; label: string }[] = [
  { key: 'responded', label: 'Lead respondeu' },
  { key: 'purchased', label: 'Compra realizada' },
  { key: 'tag_buyer', label: 'Tag Comprador' },
  { key: 'tag_dnd', label: 'Tag Não Perturbe' },
  { key: 'pipeline_closed', label: 'Pipeline Fechado' },
  { key: 'active_customer', label: 'Cliente Ativo' },
  { key: 'meeting_scheduled', label: 'Reunião Agendada' },
  { key: 'human_handover', label: 'Atendimento Humano' },
];

const STEPS_LABELS = [
  '1. Configuração', '2. Entrada', '3. Exclusões', '4. Cronograma',
  '5. Regras de Execução', '6. Horários', '7. Parada', '8. Ações', '9. Revisão',
];

export function CadenceWizard({ orgId, cadenceId, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!cadenceId);

  // Core fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState('Pós Live');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'active' | 'paused'>('draft');

  // Filters (simplified for v1 — can be extended like CampaignWizard)
  const [entryTags, setEntryTags] = useState<string[]>([]);
  const [exclusionTags, setExclusionTags] = useState<string[]>([]);

  // Steps
  const [steps, setSteps] = useState<StepDraft[]>([]);

  // Execution window
  const [days, setDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [randomize, setRandomize] = useState(false);

  // Stop
  const [stopRules, setStopRules] = useState<Record<string, boolean>>({ responded: true, purchased: true });

  // Stop actions
  const [tagsAdd, setTagsAdd] = useState<string[]>([]);
  const [tagsRemove, setTagsRemove] = useState<string[]>([]);
  const [moveStageId, setMoveStageId] = useState<string | null>(null);
  const [internalNote, setInternalNote] = useState('');

  // Helpers
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [agentConnections, setAgentConnections] = useState<string | null>(null);
  const [connOptions, setConnOptions] = useState<AgentConnectionOption[]>([]);
  const [sendConnKey, setSendConnKey] = useState<string>('auto');
  const sendConn = connOptions.find((c) => c.key === sendConnKey) ?? null;
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const { contexts } = useContextLibrary(orgId);

  useEffect(() => {
    if (!orgId) return;
    supabase.from('product_agents').select('id, name').eq('organization_id', orgId).eq('is_active', true).order('name')
      .then(({ data }) => setAgents((data as any) ?? []));
    supabase.from('lead_tags').select('id, name, color').eq('organization_id', orgId).order('name')
      .then(({ data }) => setTags((data as any) ?? []));
  }, [orgId]);

  // Resumo das conexões do agente selecionado
  useEffect(() => {
    if (!agentId) { setAgentConnections(null); setConnOptions([]); return; }
    let cancelled = false;
    (async () => {
      const { data: links } = await supabase
        .from('product_agent_connections')
        .select('connection_type, connection_id')
        .eq('agent_id', agentId);
      const rows = (links ?? []) as Array<{ connection_type: string; connection_id: string }>;
      const wa = rows.filter((r) => r.connection_type === 'evolution' || r.connection_type === 'meta_whatsapp');
      if (!wa.length) {
        if (!cancelled) { setAgentConnections('Este agente não possui número WhatsApp configurado.'); setConnOptions([]); }
        return;
      }
      const evoIds = wa.filter((r) => r.connection_type === 'evolution').map((r) => r.connection_id);
      const metaIds = wa.filter((r) => r.connection_type === 'meta_whatsapp').map((r) => r.connection_id);
      const [{ data: evos }, { data: metas }] = await Promise.all([
        evoIds.length ? supabase.from('evolution_instances').select('id, name, phone_number').in('id', evoIds) : Promise.resolve({ data: [] as any[] }),
        metaIds.length ? supabase.from('whatsapp_meta_connections').select('id, display_name, phone_number').in('id', metaIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const opts: AgentConnectionOption[] = [];
      (evos ?? []).forEach((e: any) => opts.push({
        key: `evolution:${e.id}`, type: 'evolution', id: e.id,
        label: `${e.name}${e.phone_number ? ` (${e.phone_number})` : ''} · Evolution`,
      }));
      (metas ?? []).forEach((m: any) => opts.push({
        key: `meta_whatsapp:${m.id}`, type: 'meta_whatsapp', id: m.id,
        label: `${m.display_name}${m.phone_number ? ` (${m.phone_number})` : ''} · API Oficial`,
      }));
      if (!cancelled) {
        setConnOptions(opts);
        setAgentConnections(opts.length ? `Envio via: ${opts.map((o) => o.label).join(' | ')}` : null);
      }
    })();
    return () => { cancelled = true; };
  }, [agentId]);

  useEffect(() => {
    if (!cadenceId) return;
    setLoading(true);
    (async () => {
      const { data: c } = await supabase.from('cadences' as any).select('*').eq('id', cadenceId).maybeSingle();
      if (c) {
        const cd = c as any;
        setName(cd.name);
        setDescription(cd.description ?? '');
        setObjective(cd.objective ?? 'Pós Live');
        setAgentId(cd.agent_id);
        setStatus(cd.status);
        setEntryTags(cd.entry_filters?.tags ?? []);
        setExclusionTags(cd.exclusion_filters?.tags ?? []);
        const win = cd.execution_window ?? {};
        setDays(win.days ?? ['mon', 'tue', 'wed', 'thu', 'fri']);
        setStartTime(win.start ?? '09:00');
        setEndTime(win.end ?? '18:00');
        setRandomize(!!win.randomize);
        setStopRules(cd.stop_rules ?? {});
        const acts = cd.stop_actions ?? {};
        setTagsAdd(acts.tags_add ?? []);
        setTagsRemove(acts.tags_remove ?? []);
        setMoveStageId(acts.move_stage_id ?? null);
        setInternalNote(acts.internal_note ?? '');
        setSendConnKey(cd.send_connection_id && cd.send_connection_type ? `${cd.send_connection_type}:${cd.send_connection_id}` : 'auto');
      }
      const { data: st } = await supabase.from('cadence_steps' as any).select('*').eq('cadence_id', cadenceId).order('order_index');
      setSteps(((st as any[]) ?? []).map((s) => ({
        id: s.id, order_index: s.order_index, name: s.name, objective: s.objective ?? '',
        execute_immediately: s.execute_immediately,
        schedule_mode: (s.schedule_mode ?? 'delay') as 'delay' | 'fixed_time',
        fixed_time: s.fixed_time ?? '19:00',
        fixed_day_offset: s.fixed_day_offset ?? 0,
        delay_value: s.delay_value, delay_unit: s.delay_unit,
        delay_from: s.delay_from, context_id: s.context_id, context_inline: s.context_inline ?? '',
        tone: s.tone ?? '', conditions: normalizeConditions(s.conditions, s.window_requirement),
        message_mode: (s.message_mode ?? 'ai') as 'ai' | 'fixed_text',
        fixed_message: s.fixed_message ?? '',
        window_requirement: (s.window_requirement ?? 'any') as 'any' | 'open' | 'closed',
        reengagement_template_id: s.reengagement_template_id ?? null,
        reengagement_variable_mapping: s.reengagement_variable_mapping ?? {},
        reengagement_templates: (Array.isArray(s.reengagement_templates) && s.reengagement_templates.length)
          ? (s.reengagement_templates as TemplateVariant[])
          : (s.reengagement_template_id
            ? [{ template_id: s.reengagement_template_id, variable_mapping: s.reengagement_variable_mapping ?? {} }]
            : []),
        reengagement_rotation: (s.reengagement_rotation ?? 'random') as TemplateRotation,
      })));

      setLoading(false);
    })();
  }, [cadenceId]);

  const addStep = () => {
    setSteps((s) => [...s, {
      order_index: s.length,
      name: `Etapa ${s.length + 1}`,
      objective: '',
      execute_immediately: s.length === 0,
      schedule_mode: 'delay',
      fixed_time: '19:00',
      fixed_day_offset: 0,
      delay_value: s.length === 0 ? 0 : 2,
      delay_unit: 'days',
      delay_from: 'previous_step',
      context_id: null,
      context_inline: '',
      tone: '',
      conditions: { audience: 'all', reply_since: 'enrollment' },
      message_mode: 'ai',
      fixed_message: '',
      window_requirement: 'any',
      reengagement_template_id: null,
      reengagement_variable_mapping: {},
      reengagement_templates: [],
      reengagement_rotation: 'random',
    }]);
  };


  const updateStep = (i: number, patch: Partial<StepDraft>) => {
    setSteps((arr) => arr.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const setAudience = (i: number, a: Audience) => {
    setSteps((arr) => arr.map((s, idx) => idx === i ? {
      ...s,
      conditions: { ...s.conditions, audience: a },
      window_requirement: windowFromAudience(a),
    } : s));
  };

  const removeStep = (i: number) => {
    setSteps((arr) => arr.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order_index: idx })));
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((s, idx) => ({ ...s, order_index: idx }));
    });
  };

  // Estimativa conservadora: a decisão final é sempre feita pelo backend no envio.
  // Horário fixo no mesmo dia após um clique inbound continua dentro da janela.
  const stepMayBeOutOfWindow = (s: StepDraft) => {
    if (s.schedule_mode === 'fixed_time') return Number(s.fixed_day_offset ?? 0) >= 1;
    if (s.execute_immediately) return false;
    const v = Number(s.delay_value ?? 0);
    if (s.delay_unit === 'days') return v >= 1;
    if (s.delay_unit === 'hours') return v >= 24;
    return false;
  };

  const save = async (activate = false) => {
    if (!orgId) return;
    if (!name.trim()) { toast.error('Informe o nome da cadência'); setStep(0); return; }
    if (steps.length === 0) { toast.error('Adicione ao menos uma etapa'); setStep(3); return; }
    if (activate) {
      const isMeta = !sendConn || sendConn.type === 'meta_whatsapp';
      const noText = steps.find((s) => s.message_mode === 'fixed_text' && !s.fixed_message.trim());
      if (noText) {
        toast.error(`Etapa "${noText.name}" está como texto exato mas está vazia.`);
        setStep(3); setSaving(false); return;
      }
      const noHsm = steps.find((s) => (s.conditions.audience ?? 'all') === 'no_reply' && !s.reengagement_templates.length);
      if (noHsm) {
        toast.error(`Etapa "${noHsm.name}" atinge somente quem está sem janela aberta e precisa de ao menos um template HSM.`);
        setStep(3); setSaving(false); return;
      }

      const nowParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit',
      }).formatToParts(new Date());
      const nowHour = Number(nowParts.find((p) => p.type === 'hour')?.value ?? 0);
      const nowMinute = Number(nowParts.find((p) => p.type === 'minute')?.value ?? 0);
      const nowTotal = nowHour * 60 + nowMinute;
      const hasFutureStep = steps.some((s) => {
        if (s.schedule_mode !== 'fixed_time') return true;
        if (Number(s.fixed_day_offset ?? 0) > 0) return true;
        const [hour, minute] = s.fixed_time.split(':').map(Number);
        return hour * 60 + (minute || 0) > nowTotal;
      });
      if (!hasFutureStep) {
        toast.error('Todos os horários fixos de hoje já passaram. Escolha um horário futuro ou aumente “Dias após a entrada”.');
        setStep(3);
        setSaving(false);
        return;
      }
    }
    setSaving(true);

    const payload = {
      organization_id: orgId,
      name: name.trim(),
      description: description.trim() || null,
      objective,
      agent_id: agentId,
      status: activate ? 'active' : status,
      entry_filters: { tags: entryTags },
      exclusion_filters: { tags: exclusionTags },
      stop_rules: stopRules,
      stop_actions: { tags_add: tagsAdd, tags_remove: tagsRemove, move_stage_id: moveStageId, internal_note: internalNote || null },
      execution_window: { days, start: startTime, end: endTime, randomize },
      channel: 'whatsapp',
      send_connection_id: sendConn?.id ?? null,
      send_connection_type: sendConn?.type ?? null,
    };

    let id = cadenceId;
    if (id) {
      const { error } = await supabase.from('cadences' as any).update(payload).eq('id', id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      // Replace steps
      await supabase.from('cadence_steps' as any).delete().eq('cadence_id', id);
    } else {
      const { data, error } = await supabase.from('cadences' as any).insert(payload).select('id').single();
      if (error || !data) { toast.error(error?.message ?? 'Falha ao criar'); setSaving(false); return; }
      id = (data as any).id;
    }

    if (steps.length) {
      const rows = steps.map((s, i) => ({
        cadence_id: id,
        order_index: i,
        name: s.name || `Etapa ${i + 1}`,
        objective: s.objective || null,
        execute_immediately: s.schedule_mode === 'fixed_time' ? false : s.execute_immediately,
        schedule_mode: s.schedule_mode,
        fixed_time: s.schedule_mode === 'fixed_time' ? s.fixed_time : null,
        fixed_day_offset: s.schedule_mode === 'fixed_time' ? s.fixed_day_offset : 0,
        delay_value: s.delay_value,
        delay_unit: s.delay_unit,
        delay_from: s.delay_from,
        context_id: s.context_id,
        context_inline: s.context_inline || null,
        tone: s.tone || null,
        conditions: normalizeConditions(s.conditions, s.window_requirement),
        message_mode: s.message_mode,
        fixed_message: s.message_mode === 'fixed_text' ? (s.fixed_message || null) : null,
        window_requirement: windowFromAudience((s.conditions.audience ?? 'all') as Audience),

        reengagement_template_id: s.reengagement_templates[0]?.template_id ?? s.reengagement_template_id,
        reengagement_variable_mapping: s.reengagement_templates[0]?.variable_mapping ?? s.reengagement_variable_mapping ?? {},
        reengagement_templates: s.reengagement_templates ?? [],
        reengagement_rotation: s.reengagement_rotation ?? 'random',
      }));

      const { error } = await supabase.from('cadence_steps' as any).insert(rows);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }

    toast.success(activate ? 'Cadência ativada!' : 'Cadência salva');
    setSaving(false);
    onClose();
  };

  if (loading) return <div className="p-6">Carregando…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => save(false)} disabled={saving}>
            <Save className="h-4 w-4 mr-2" /> Salvar rascunho
          </Button>
          {step === STEPS_LABELS.length - 1 && (
            <Button onClick={() => save(true)} disabled={saving}>
              <Rocket className="h-4 w-4 mr-2" /> Ativar Cadência
            </Button>
          )}
        </div>
      </div>

      <header>
        <h1 className="text-xl font-semibold">{cadenceId ? 'Editar cadência' : 'Nova cadência'}</h1>
        <p className="text-sm text-muted-foreground">{STEPS_LABELS[step]}</p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {STEPS_LABELS.map((l, i) => (
          <button key={l} onClick={() => setStep(i)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${i === step ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}>
            {l}
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card><CardContent className="p-5 space-y-4">
          <Field label="Nome da cadência *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Pós Live Replay Maio" /></Field>
          <Field label="Descrição"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Objetivo">
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{OBJECTIVES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Agente responsável">
            <Select value={agentId ?? ''} onValueChange={(v) => setAgentId(v || null)}>
              <SelectTrigger><SelectValue placeholder="Selecionar agente" /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {agentConnections && (
              <p className="text-xs text-muted-foreground mt-1">{agentConnections}</p>
            )}
          </Field>
          <Field label="Número de envio">
            <Select value={sendConnKey} onValueChange={setSendConnKey}>
              <SelectTrigger><SelectValue placeholder="Automático (segue a conversa do lead)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático (segue a conversa do lead)</SelectItem>
                {connOptions.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              No modo automático a cadência responde pelo mesmo número da conversa que originou a inscrição;
              se não houver conversa, usa a conexão padrão do agente. Para garantir a API Oficial (e a janela de 24h
              aberta pelo template), selecione o número explicitamente.
            </p>
          </Field>

          <Field label="Status">
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </CardContent></Card>
      )}

      {step === 1 && (
        <Card><CardContent className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Selecione tags que filtram quem entra nesta cadência. Filtros avançados (origem, pipeline, campos personalizados) podem ser adicionados depois pelo editor.</p>
          <TagsPicker label="Entrar se tiver QUALQUER destas tags" tags={tags} selected={entryTags} onChange={setEntryTags} />
        </CardContent></Card>
      )}

      {step === 2 && (
        <Card><CardContent className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Leads com qualquer uma destas tags NÃO entram (ou saem) da cadência.</p>
          <TagsPicker label="Excluir se tiver QUALQUER destas tags" tags={tags} selected={exclusionTags} onChange={setExclusionTags} />
        </CardContent></Card>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {steps.map((s, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">Etapa {i + 1}</Badge>
                  <Input value={s.name} onChange={(e) => updateStep(i, { name: e.target.value })} className="flex-1" placeholder="Nome da etapa" />
                  <Button size="icon" variant="ghost" onClick={() => moveStep(i, -1)} disabled={i === 0}>↑</Button>
                  <Button size="icon" variant="ghost" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>↓</Button>
                  <Button size="icon" variant="ghost" onClick={() => removeStep(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
                <Input value={s.objective} onChange={(e) => updateStep(i, { objective: e.target.value })} placeholder="Objetivo (ex: Iniciar conversa)" />

                <div className="space-y-2">
                  <Label className="text-xs">Quando enviar</Label>
                  <Select value={s.schedule_mode} onValueChange={(v: any) => updateStep(i, { schedule_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delay">Após um intervalo</SelectItem>
                      <SelectItem value="fixed_time">Horário fixo do dia (ex: 19:55)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {s.schedule_mode === 'fixed_time' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Horário (Brasília)</Label>
                        <Input type="time" value={s.fixed_time} onChange={(e) => updateStep(i, { fixed_time: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Dias após a entrada</Label>
                        <Input type="number" min={0} value={s.fixed_day_offset} onChange={(e) => updateStep(i, { fixed_day_offset: parseInt(e.target.value) || 0 })} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Esta etapa ignora a janela de horários (passo "Horários") e dispara exatamente às {s.fixed_time} (Brasília).
                      Se o lead entrar depois desse horário, a etapa é pulada — nunca envia atrasado.
                      {(s.fixed_time < startTime || s.fixed_time > endTime) && ' Este horário está fora da janela geral, o que é permitido.'}
                    </p>
                  </div>
                )}


                <div className={`grid grid-cols-2 md:grid-cols-4 gap-2 items-end ${s.schedule_mode === 'fixed_time' ? 'hidden' : ''}`}>
                  <div className="col-span-2 flex items-center gap-2">
                    <Switch checked={s.execute_immediately} onCheckedChange={(v) => updateStep(i, { execute_immediately: v })} />
                    <Label className="text-sm">Executar imediatamente</Label>
                  </div>
                  {!s.execute_immediately && (
                    <>
                      <div>
                        <Label className="text-xs">Após</Label>
                        <Input type="number" min={1} value={s.delay_value} onChange={(e) => updateStep(i, { delay_value: parseInt(e.target.value) || 1 })} />
                      </div>
                      <div>
                        <Label className="text-xs">Unidade</Label>
                        <Select value={s.delay_unit} onValueChange={(v: any) => updateStep(i, { delay_unit: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutos</SelectItem>
                            <SelectItem value="hours">Horas</SelectItem>
                            <SelectItem value="days">Dias</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">A partir de</Label>
                        <Select value={s.delay_from} onValueChange={(v: any) => updateStep(i, { delay_from: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="previous_step">Etapa anterior</SelectItem>
                            <SelectItem value="enrollment">Entrada na cadência</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Contexto da biblioteca (opcional)</Label>
                  <Select value={s.context_id ?? '__none'} onValueChange={(v) => updateStep(i, { context_id: v === '__none' ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar contexto" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Nenhum (usar inline)</SelectItem>
                      {contexts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Como enviar</Label>
                  <Select value={s.message_mode} onValueChange={(v: any) => updateStep(i, { message_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai">Agente IA (gera a mensagem)</SelectItem>
                      <SelectItem value="fixed_text">Texto exato (sem agente)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {s.message_mode === 'fixed_text' ? (
                  <div>
                    <Label className="text-xs">Mensagem fixa</Label>
                    <Textarea rows={4} value={s.fixed_message} onChange={(e) => updateStep(i, { fixed_message: e.target.value })}
                      placeholder={"Estamos ao vivo agora!\nClique e participe: https://..."} />
                    <p className="text-xs text-muted-foreground mt-1">
                      Enviada exatamente como escrita e a conversa permanece sem agente de IA. Variáveis como {'{nome}'} são interpoladas.
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs">Contexto inline (instruções para o agente IA)</Label>
                    <Textarea rows={3} value={s.context_inline} onChange={(e) => updateStep(i, { context_inline: e.target.value })}
                      placeholder="Ex: Esse lead participou da live e ainda não respondeu. Inicie uma conversa leve e descubra seu principal interesse." />
                  </div>
                )}

                {(() => {
                  const aud = (s.conditions.audience ?? 'all') as Audience;
                  const isMeta = !sendConn || sendConn.type === 'meta_whatsapp';
                  const windowClosedOnly = aud === 'no_reply';
                  const needsTemplate = windowClosedOnly || (isMeta && stepMayBeOutOfWindow(s));
                  return (
                    <>
                      <div className="rounded-md border p-3 space-y-2">
                        <Label className="text-xs font-semibold">1. Quem recebe esta etapa</Label>
                        <div className="space-y-1.5">
                          {([
                            ['all', 'Todos os inscritos', 'Recebe quem estiver ativo na cadência. A janela Meta define mensagem livre ou template.'],
                            ['responded', 'Somente quem RESPONDEU', 'Recebe quem enviou uma mensagem após o marco escolhido (sai como mensagem livre).'],
                            ['no_reply', 'Somente quem NÃO respondeu', 'Somente leads SEM janela de 24h aberta. Se a janela estiver aberta, a etapa é ignorada; com a janela fechada, o envio é por template HSM.'],
                          ] as [Audience, string, string][]).map(([val, title, desc]) => (
                            <label key={val} className="flex items-start gap-2 cursor-pointer rounded-md border p-2 hover:bg-muted/40">
                              <input
                                type="radio"
                                className="mt-1 accent-primary"
                                checked={aud === val}
                                onChange={() => setAudience(i, val)}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{title}</p>
                                <p className="text-xs text-muted-foreground">{desc}</p>
                              </div>
                            </label>
                          ))}
                        </div>

                        {aud === 'responded' && (
                          <div>
                            <Label className="text-xs">Considerar resposta</Label>
                            <Select
                              value={s.conditions.reply_since ?? 'enrollment'}
                              onValueChange={(v: any) => updateStep(i, { conditions: { ...s.conditions, reply_since: v } })}
                            >
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="enrollment">Desde que entrou na cadência</SelectItem>
                                <SelectItem value="previous_step">Desde a etapa anterior</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <div className="pt-1 border-t space-y-1">
                          <p className="text-xs text-muted-foreground">Filtros extras (opcionais)</p>
                          <div className="flex flex-wrap gap-3">
                            <CheckBoxItem checked={!!s.conditions.only_if_no_purchase} onChange={(v) => updateStep(i, { conditions: { ...s.conditions, only_if_no_purchase: v } })} label="Não comprou" />
                            <CheckBoxItem checked={!!s.conditions.only_if_not_human} onChange={(v) => updateStep(i, { conditions: { ...s.conditions, only_if_not_human: v } })} label="Não foi assumido por humano" />
                          </div>
                        </div>

                        {sendConn && sendConn.type !== 'meta_whatsapp' && (
                          <p className="text-xs text-muted-foreground">
                            O número selecionado é Evolution: não existe janela de 24h e tudo sai como mensagem livre.
                          </p>
                        )}
                      </div>

                      {needsTemplate && (
                        <div className="rounded-md border p-3 space-y-2">
                          <Label className="text-xs font-semibold">2. Templates HSM</Label>
                          <p className="text-xs text-muted-foreground">
                            {windowClosedOnly
                              ? 'Esta etapa só atinge quem está sem janela aberta, então o envio é obrigatoriamente por template HSM aprovado. Selecione ao menos um.'
                              : 'Esta etapa pode rodar depois das 24h. Dentro da janela envia a mensagem configurada; fora dela usa um destes templates. O fallback é opcional: sem ele, a etapa será pulada se a janela estiver fechada.'}
                          </p>
                          <TemplateMultiPicker
                            organizationId={orgId}
                            value={s.reengagement_templates}
                            rotation={s.reengagement_rotation}
                            onChange={(v) => updateStep(i, { reengagement_templates: v })}
                            onRotationChange={(r) => updateStep(i, { reengagement_rotation: r })}
                            label="Templates HSM (Meta API Oficial)"
                            helperText="Marque uma ou mais variações aprovadas. Com várias marcadas, cada lead recebe uma delas."
                          />
                          {windowClosedOnly && !s.reengagement_templates.length && (
                            <p className="text-xs text-destructive">
                              Selecione pelo menos um template para poder ativar a cadência.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}


              </CardContent>
            </Card>

          ))}
          <Button variant="outline" onClick={addStep} className="w-full"><Plus className="h-4 w-4 mr-2" /> Adicionar etapa</Button>
        </div>
      )}

      {step === 4 && (
        <Card><CardContent className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Resumo das regras de cada etapa (edite no passo anterior, "Cronograma").
          </p>
          {!steps.length && <p className="text-sm text-muted-foreground">Nenhuma etapa criada ainda.</p>}
          <div className="space-y-2">
            {steps.map((s, i) => {
              const aud = (s.conditions.audience ?? 'all') as Audience;
              const publico = aud === 'responded' ? 'somente quem respondeu' : aud === 'no_reply' ? 'somente quem está SEM janela de 24h aberta' : 'todos os inscritos';
              const extras = [
                s.conditions.only_if_no_purchase && 'não comprou',
                s.conditions.only_if_not_human && 'não assumido por humano',
              ].filter(Boolean) as string[];
              return (
                <div key={i} className="rounded-md border p-3 text-sm space-y-1">
                  <p className="font-medium">Etapa {i + 1}{s.objective ? ` — ${s.objective}` : ''}</p>
                  <p className="text-xs text-muted-foreground">
                    Quem recebe: {publico}
                    {aud === 'responded' ? ` (resposta ${s.conditions.reply_since === 'previous_step' ? 'desde a etapa anterior' : 'desde a entrada na cadência'})` : ''}
                    {extras.length ? ` • filtros: ${extras.join(', ')}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {aud === 'no_reply'
                      ? 'Como envia: sempre por template HSM (janela fechada). Com a janela aberta, a etapa é ignorada.'
                      : 'Como envia: mensagem livre dentro das 24h; template HSM fora da janela'}
                    {' • '}{s.message_mode === 'fixed_text' ? 'texto exato (sem agente)' : 'agente IA'}
                    {s.reengagement_templates.length ? ` • ${s.reengagement_templates.length} template(s) HSM em rodízio` : ''}
                    {aud === 'no_reply' && !s.reengagement_templates.length ? ' • ⚠ sem template selecionado' : ''}
                  </p>
                </div>
              );

            })}
          </div>

        </CardContent></Card>
      )}


      {step === 5 && (() => {
        const intervalSteps = steps.filter((s) => s.schedule_mode !== 'fixed_time');
        const windowApplies = intervalSteps.length > 0;
        return (
        <Card><CardContent className="p-5 space-y-4">
          <div className="space-y-1">
            <h3 className="font-semibold">Horários (etapas por intervalo)</h3>
            <p className="text-sm text-muted-foreground">
              Esta janela limita apenas as etapas agendadas <strong>por intervalo</strong>. Etapas com
              horário fixo disparam exatamente no horário definido no Cronograma, mesmo fora desta janela.
            </p>
          </div>

          {!windowApplies && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Nenhuma etapa usa intervalo — a janela não se aplica a esta cadência.
            </div>
          )}

          <div className={windowApplies ? '' : 'opacity-50 pointer-events-none'}>
            <div>
              <Label>Dias permitidos</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {WEEK_DAYS.map((d) => (
                  <button key={d.key} type="button"
                    onClick={() => setDays((arr) => arr.includes(d.key) ? arr.filter((x) => x !== d.key) : [...arr, d.key])}
                    className={`px-3 py-1.5 rounded-md text-sm border ${days.includes(d.key) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <Field label="Horário inicial (Brasília)"><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
              <Field label="Horário final (Brasília)"><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Switch checked={randomize} onCheckedChange={setRandomize} />
              <Label className="text-sm">Aleatorizar horário dentro da janela (até 20 min, envio mais natural)</Label>
            </div>
          </div>

          {steps.some((s) => s.schedule_mode === 'fixed_time') && (
            <p className="text-xs text-muted-foreground">
              Etapas com horário próprio: {steps.filter((s) => s.schedule_mode === 'fixed_time').map((s, i) => `${s.name || `Etapa ${i + 1}`} (${s.fixed_time})`).join(', ')}.
            </p>
          )}
        </CardContent></Card>
        );
      })()}


      {step === 6 && (
        <Card><CardContent className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">Quando interromper a cadência automaticamente?</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {STOP_OPTIONS.map((o) => (
              <CheckBoxItem key={o.key} label={o.label} checked={!!stopRules[o.key]}
                onChange={(v) => setStopRules((r) => ({ ...r, [o.key]: v }))} />
            ))}
          </div>
        </CardContent></Card>
      )}

      {step === 7 && (
        <Card><CardContent className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Ao interromper a cadência:</p>
          <TagsPicker label="Aplicar tags" tags={tags} selected={tagsAdd} onChange={setTagsAdd} />
          <TagsPicker label="Remover tags" tags={tags} selected={tagsRemove} onChange={setTagsRemove} />
          <Field label="Nota interna (adicionada no lead)">
            <Textarea rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="Ex: Encerrou cadência pós-live" />
          </Field>
        </CardContent></Card>
      )}

      {step === 8 && (
        <Card><CardContent className="p-5 space-y-4">
          <div className="space-y-1">
            <h3 className="font-semibold">Revisão</h3>
            <p className="text-sm text-muted-foreground">Confira antes de ativar.</p>
          </div>
          <Row k="Nome" v={name || '—'} />
          <Row k="Objetivo" v={objective} />
          <Row k="Agente" v={agents.find((a) => a.id === agentId)?.name ?? '—'} />
          <Row k="Etapas" v={`${steps.length} etapa(s)`} />
          <Row k="Janela (etapas por intervalo)" v={steps.some((s) => s.schedule_mode !== 'fixed_time') ? `${days.join(', ').toUpperCase()} · ${startTime}–${endTime}${randomize ? ' (aleatorizado)' : ''}` : 'Não se aplica (todas as etapas têm horário fixo)'} />
          <Row k="Etapas com horário próprio" v={steps.filter((s) => s.schedule_mode === 'fixed_time').map((s, i) => `${s.name || `Etapa ${i + 1}`} às ${s.fixed_time}`).join(', ') || 'Nenhuma'} />
          <Row k="Parar se" v={Object.entries(stopRules).filter(([, v]) => v).map(([k]) => STOP_OPTIONS.find((o) => o.key === k)?.label ?? k).join(', ') || 'Nenhuma regra'} />

          <div className="pt-4">
            <h4 className="text-sm font-medium mb-2">Simulação visual</h4>
            <div className="space-y-1">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">{i + 1}</div>
                  <div className="flex-1 border rounded p-2">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.schedule_mode === 'fixed_time' ? `às ${s.fixed_time}${s.fixed_day_offset ? ` (+${s.fixed_day_offset}d)` : ' (mesmo dia)'}` : s.execute_immediately ? 'Imediatamente' : `+${s.delay_value} ${s.delay_unit === 'minutes' ? 'min' : s.delay_unit === 'hours' ? 'h' : 'd'} (${s.delay_from === 'enrollment' ? 'da entrada' : 'da anterior'})`}
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-sm text-muted-foreground pl-10">↓ Encerrar</div>
            </div>
          </div>
        </CardContent></Card>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Anterior
        </Button>
        <Button onClick={() => setStep((s) => Math.min(STEPS_LABELS.length - 1, s + 1))} disabled={step === STEPS_LABELS.length - 1}>
          Próximo <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return <div className="space-y-1.5"><Label className="text-sm">{label}</Label>{children}</div>;
}

function CheckBoxItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span>{label}</span>
    </label>
  );
}

function TagsPicker({ label, tags, selected, onChange }: { label: string; tags: { id: string; name: string; color: string }[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma tag cadastrada.</span>}
        {tags.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button key={t.id} type="button"
              onClick={() => onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
              className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'border-primary' : 'border-border'}`}
              style={on ? { backgroundColor: t.color + '33', color: t.color } : {}}>
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return <div className="flex justify-between text-sm border-b pb-1.5"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v}</span></div>;
}
