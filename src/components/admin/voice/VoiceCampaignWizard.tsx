import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, ArrowRight, Loader2, X, Check, Users, PhoneCall, Zap, Target, Tag as TagIcon } from 'lucide-react';
import {
  useSaveVoiceCampaign, useVoiceAgents, useVoiceContexts, useVoiceAudienceCount,
  type VoiceCampaign, type VoiceAudienceFilters, type VoicePostCallRule,
} from '@/hooks/useVoice';
import { useProducts } from '@/hooks/useProducts';
import { useLeadTags } from '@/hooks/useLeadTags';
import { toast } from 'sonner';

interface Props {
  campaign?: Partial<VoiceCampaign> | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

const STEPS = [
  { id: 1, label: 'Básico', icon: Target },
  { id: 2, label: 'Agente & Voz', icon: Zap },
  { id: 3, label: 'Público', icon: Users },
  { id: 4, label: 'Discagem', icon: PhoneCall },
  { id: 5, label: 'Pós-call', icon: TagIcon },
];

export function VoiceCampaignWizard({ campaign, onClose, onSaved }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Partial<VoiceCampaign>>({
    max_concurrent: 3,
    max_attempts: 2,
    retry_interval_minutes: 60,
    dial_strategy: 'round_robin',
    timezone: 'America/Sao_Paulo',
    audience_filters: {},
    exclusion_filters: {},
    dial_numbers: [],
    post_call_actions: { rules: [] },
    status: 'draft',
    ...(campaign || {}),
  });

  const save = useSaveVoiceCampaign();
  const { data: agents = [] } = useVoiceAgents();
  const { data: contexts = [] } = useVoiceContexts();
  const { data: products = [] } = useProducts();
  const { data: tags = [] } = useLeadTags();
  const audience = useVoiceAudienceCount(form.audience_filters || {}, form.exclusion_filters || {});

  const canNext = () => {
    if (step === 1) return !!form.name?.trim();
    if (step === 2) return !!form.voice_agent_id;
    return true;
  };

  const handleSave = async (statusAfter: VoiceCampaign['status'] = 'draft') => {
    if (!form.name?.trim() || !form.voice_agent_id) {
      toast.error('Preencha nome e agente/perfil de voz');
      return;
    }
    save.mutate(
      {
        ...form,
        status: statusAfter,
        totals: audience.data,
      } as any,
      {
        onSuccess: (res: any) => {
          onSaved?.(res?.id);
          onClose();
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="border-b p-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{campaign?.id ? 'Editar campanha' : 'Nova campanha de voz'}</h1>
          <p className="text-xs text-muted-foreground">Passo {step} de {STEPS.length} — {STEPS[step - 1].label}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
      </header>

      <div className="border-b px-4 py-2 flex gap-1 overflow-x-auto">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const active = s.id === step;
          const done = s.id < step;
          return (
            <button
              key={s.id}
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition ${
                active ? 'bg-primary text-primary-foreground' : done ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Nome da campanha</Label>
                <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Reativação Q1 2026" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea rows={3} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Objetivo, público, resultado esperado…" />
              </div>
              <div className="space-y-2">
                <Label>Produto / negócio</Label>
                <Select value={form.product_id || 'none'} onValueChange={(v) => setForm({ ...form, product_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="— sem produto —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— sem produto —</SelectItem>
                    {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>Perfil de voz (agente + voz)</Label>
                <Select value={form.voice_agent_id || ''} onValueChange={(v) => setForm({ ...form, voice_agent_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o perfil de voz" /></SelectTrigger>
                  <SelectContent>
                    {agents.filter((a) => a.is_active).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">O prompt e o objetivo vêm do agente de IA vinculado ao perfil.</p>
              </div>
              <div className="space-y-2">
                <Label>Contexto reutilizável (biblioteca)</Label>
                <Select value={form.context_id || 'none'} onValueChange={(v) => setForm({ ...form, context_id: v === 'none' ? null : v, voice_context_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— sem contexto —</SelectItem>
                    {contexts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contexto extra desta campanha (opcional)</Label>
                <Textarea rows={4} value={(form.audience_filters as any)?.__campaign_context || ''}
                  onChange={(e) => setForm({ ...form, audience_filters: { ...(form.audience_filters || {}), __campaign_context: e.target.value } as any })}
                  placeholder="Ex: 'Reativação de leads abandonados no checkout do curso X — foco em oferta de bônus.'" />
                <p className="text-xs text-muted-foreground">Injetado no prompt junto com o contexto do perfil.</p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Card className="p-4 bg-muted/30">
                <div className="text-xs text-muted-foreground">Leads elegíveis</div>
                <div className="text-2xl font-semibold">{audience.data?.will_receive ?? '—'}</div>
                <div className="text-xs text-muted-foreground">
                  {audience.data?.audience ?? 0} no filtro · {audience.data?.excluded ?? 0} excluídos
                </div>
              </Card>

              <div className="space-y-2">
                <Label>Etiquetas exigidas</Label>
                <TagPicker
                  tags={tags}
                  selected={form.audience_filters?.tag_ids || []}
                  onChange={(ids) => setForm({ ...form, audience_filters: { ...form.audience_filters, tag_ids: ids } })}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Etiquetas para EXCLUIR</Label>
                <TagPicker
                  tags={tags}
                  selected={form.exclusion_filters?.tag_ids || []}
                  onChange={(ids) => setForm({ ...form, exclusion_filters: { ...form.exclusion_filters, tag_ids: ids } })}
                />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="space-y-2">
                <Label>Números de origem (um por linha)</Label>
                <Textarea rows={3} value={(form.dial_numbers || []).join('\n')}
                  onChange={(e) => setForm({ ...form, dial_numbers: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="+551140028922&#10;+551140028923" />
              </div>
              <div className="space-y-2">
                <Label>Estratégia de discagem</Label>
                <Select value={form.dial_strategy || 'round_robin'} onValueChange={(v: any) => setForm({ ...form, dial_strategy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round_robin">Round-robin</SelectItem>
                    <SelectItem value="random">Aleatória</SelectItem>
                    <SelectItem value="weighted">Peso (avançado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Simultâneas</Label>
                  <Input type="number" min={1} max={20} value={form.max_concurrent ?? 3} onChange={(e) => setForm({ ...form, max_concurrent: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Tentativas</Label>
                  <Input type="number" min={1} max={10} value={form.max_attempts ?? 2} onChange={(e) => setForm({ ...form, max_attempts: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Retry (min)</Label>
                  <Input type="number" min={5} value={form.retry_interval_minutes ?? 60} onChange={(e) => setForm({ ...form, retry_interval_minutes: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border">
                <div>
                  <Label>Apenas horário comercial</Label>
                  <p className="text-xs text-muted-foreground">Seg-Sex, 09h-18h no fuso da campanha.</p>
                </div>
                <Switch checked={!!form.business_hours_only} onCheckedChange={(v) => setForm({ ...form, business_hours_only: v })} />
              </div>
              <div className="space-y-2">
                <Label>Agendar início (opcional)</Label>
                <Input type="datetime-local" value={form.scheduled_at ? form.scheduled_at.slice(0, 16) : ''} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
            </>
          )}

          {step === 5 && (
            <PostCallRulesEditor
              tags={tags}
              rules={form.post_call_actions?.rules || []}
              onChange={(rules) => setForm({ ...form, post_call_actions: { rules } })}
            />
          )}
        </div>
      </div>

      <footer className="border-t p-4 flex items-center justify-between gap-2 bg-background">
        <Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div className="flex gap-2">
          {step < STEPS.length ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Continuar <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleSave('draft')} disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar rascunho
              </Button>
              <Button onClick={() => handleSave('running')} disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar & iniciar
              </Button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

function TagPicker({ tags, selected, onChange }: { tags: any[]; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => {
        const active = selected.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(active ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
            className={`px-2.5 py-1 rounded-full text-xs border transition ${
              active ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            {t.name}
          </button>
        );
      })}
      {tags.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>}
    </div>
  );
}

const OUTCOMES = [
  { key: 'answered', label: 'Atendeu' },
  { key: 'no_answer', label: 'Não atendeu' },
  { key: 'chose_meeting', label: 'Agendou reunião' },
  { key: 'chose_whatsapp', label: 'Recebeu link (WhatsApp)' },
  { key: 'chose_checkout', label: 'Iniciou checkout' },
  { key: 'lost', label: 'Sem interesse' },
];

function PostCallRulesEditor({ rules, tags, onChange }: { rules: VoicePostCallRule[]; tags: any[]; onChange: (r: VoicePostCallRule[]) => void }) {
  const updateFor = (outcome: string, patch: Partial<VoicePostCallRule>) => {
    const existing = rules.find((r) => r.outcome === outcome);
    if (existing) {
      onChange(rules.map((r) => (r.outcome === outcome ? { ...r, ...patch } : r)));
    } else {
      onChange([...rules, { outcome, ...patch }]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Configure o que acontece automaticamente para cada resultado da ligação.</p>
      {OUTCOMES.map((o) => {
        const rule = rules.find((r) => r.outcome === o.key) || { outcome: o.key };
        return (
          <Card key={o.key} className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline">{o.label}</Badge>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adicionar etiquetas</Label>
              <TagPicker
                tags={tags}
                selected={rule.add_tag_ids || []}
                onChange={(ids) => updateFor(o.key, { add_tag_ids: ids })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Criar tarefa (título)</Label>
              <Input placeholder="Ex: Retornar em 24h" value={rule.create_task_title || ''}
                onChange={(e) => updateFor(o.key, { create_task_title: e.target.value })} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
