import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Save, Eye, Plus, Trash2, Copy, ExternalLink, Download, QrCode, AlertTriangle, Link as LinkIcon, CalendarClock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useVoiceCall, useUpdateVoiceCall, type CallCta, type CallCtaLink, type CaptureField, type VoiceCall } from '@/hooks/useVoiceCalls';
import { useProducts } from '@/hooks/useProducts';
import { useAllAgents } from '@/hooks/useProductAgents';
import { useVoiceClones, previewGrokVoice, previewOpenAIVoice } from '@/hooks/useVoiceClones';
import { GROK_NATIVE_VOICES } from '@/config/grokVoicesCatalog';
import { DEFAULT_OPENAI_VOICE_ID, OPENAI_REALTIME_VOICES } from '@/config/openaiRealtimeVoices';
import { useCadences } from '@/hooks/useCadences';
import { usePublicAppUrl } from '@/lib/publicUrl';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VoiceCallResponsesTab } from './VoiceCallResponsesTab';
import { VoiceCallAutomationsTab } from './VoiceCallAutomationsTab';
import { VoiceAgentDesignEditor } from '@/components/admin/voice/design/VoiceAgentDesignEditor';

interface Props { callId: string; onClose: () => void; }

const DEFAULT_FIELDS: CaptureField[] = [
  { key: 'name', label: 'Nome', type: 'text', required: true },
  { key: 'whatsapp', label: 'WhatsApp', type: 'phone', required: true },
];

const CTA_KINDS: { value: CallCta['kind']; label: string; hint: string }[] = [
  { value: 'link', label: 'Botão / Link externo', hint: 'Abre um link em nova aba' },
  { value: 'schedule', label: 'Agendar reunião', hint: 'Abre o calendário do Vendus' },
  { value: 'whatsapp', label: 'Enviar no WhatsApp', hint: 'IA dispara mensagem via WhatsApp' },
  { value: 'interest', label: 'Registrar interesse', hint: 'Aplica tag + score no lead' },
];

export function VoiceCallEditor({ callId, onClose }: Props) {
  const { data: call, isLoading } = useVoiceCall(callId);
  const update = useUpdateVoiceCall();
  const { data: products } = useProducts();
  const { data: agents } = useAllAgents();
  const { data: clones = [] } = useVoiceClones();
  const { cadences = [] } = useCadences();
  const { data: publicAppUrl } = usePublicAppUrl();
  const { profile } = useAuth();

  // Agendas (event types) da organização — usado por CTA schedule e Agenda padrão
  const { data: orgEventTypes = [] } = useQuery({
    queryKey: ['org-booking-event-types', profile?.organization_id],
    enabled: !!profile?.organization_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_event_types')
        .select('id, name, duration_minutes, is_active')
        .eq('organization_id', profile!.organization_id!)
        .order('name');
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; duration_minutes: number; is_active: boolean }>;
    },
  });

  // Verifica se a org tem chave OpenAI cadastrada (afeta o aviso ao escolher openai)
  const { data: hasOpenAIKey } = useQuery({
    queryKey: ['org-openai-key', profile?.organization_id],
    enabled: !!profile?.organization_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('org_ai_credentials')
        .select('id')
        .eq('organization_id', profile!.organization_id!)
        .eq('provider', 'openai')
        .maybeSingle();
      return !!data;
    },
  });

  const [draft, setDraft] = useState<VoiceCall | null>(null);
  const [embedW, setEmbedW] = useState(380);
  const [embedH, setEmbedH] = useState(760);
  const [embedResponsive, setEmbedResponsive] = useState(false);
  useEffect(() => {
    if (call && !draft) {
      // Migração leve: CTAs kind=link com url legada viram cta.links[]
      const migratedCtas = (call.ctas ?? []).map((c) => {
        if (c.kind === 'link' && (!c.links || c.links.length === 0) && c.url) {
          return { ...c, links: [{ id: crypto.randomUUID(), label: c.label || 'Abrir', url: c.url }] };
        }
        return c;
      });
      setDraft({
        ...call,
        capture_fields: call.capture_fields?.length ? call.capture_fields : DEFAULT_FIELDS,
        ctas: migratedCtas,
        tracking: call.tracking ?? {},
        appearance: call.appearance ?? {},
        post_call_automations: call.post_call_automations ?? { rules: [] },
        post_cadence_id: (call as any).post_cadence_id ?? null,
      });
    }
  }, [call, draft]);

  if (isLoading || !draft) {
    return <div className="p-6 text-muted-foreground">Carregando...</div>;
  }

  const patch = (p: Partial<VoiceCall>) => setDraft({ ...draft, ...p });
  const publicUrl = `${publicAppUrl}/call/${draft.slug}`;
  const selectedAgent = agents?.find((a: any) => a.id === draft.product_agent_id) as any;
  const selectedProvider = (draft.voice_provider || selectedAgent?.voice_provider || 'grok') as 'grok' | 'openai' | 'auto';
  const selectedOpenAIVoice = draft.openai_voice_id || selectedAgent?.openai_voice_id || DEFAULT_OPENAI_VOICE_ID;
  const selectedGrokVoice = draft.grok_voice_id || selectedAgent?.default_grok_voice_id || '';
  const isOpenAIProvider = selectedProvider === 'openai' || selectedProvider === 'auto';
  const openaiKeyMissing = isOpenAIProvider && hasOpenAIKey === false;


  const save = async () => {
    await update.mutateAsync({
      id: draft.id,
      patch: {
        name: draft.name,
        slug: draft.slug,
        product_id: draft.product_id,
        product_agent_id: draft.product_agent_id,
        voice_provider: draft.voice_provider ?? null,
        openai_voice_id: draft.openai_voice_id ?? null,
        grok_voice_id: draft.grok_voice_id,
        voice_settings: draft.voice_settings,
        language: draft.language,
        context: draft.context,
        status: draft.status,
        capture_fields: draft.capture_fields,
        ctas: draft.ctas,
        tracking: draft.tracking,
        appearance: draft.appearance,
        post_call_automations: draft.post_call_automations,
        post_cadence_id: draft.post_cadence_id ?? null,
      } as any,
    });
    toast.success('Salvo');
  };

  const publish = async () => {
    await update.mutateAsync({ id: draft.id, patch: { status: 'active' } as any });
    patch({ status: 'active' });
    toast.success('Ligação publicada');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{draft.name}</h1>
            <p className="text-sm text-muted-foreground truncate">
              /call/{draft.slug} · {draft.status === 'active' ? 'Publicada' : 'Rascunho'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.open(publicUrl, '_blank')}>
            <Eye className="h-4 w-4 mr-2" /> Visualizar
          </Button>
          <Button variant="outline" onClick={save} disabled={update.isPending}>
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
          {draft.status !== 'active' && (
            <Button onClick={publish} disabled={update.isPending}>Publicar</Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="build" className="w-full">
        <TabsList>
          <TabsTrigger value="build">Construir</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="config">Configurar</TabsTrigger>
          <TabsTrigger value="automations">Automações</TabsTrigger>
          <TabsTrigger value="publish">Publicar</TabsTrigger>
          <TabsTrigger value="responses">Respostas</TabsTrigger>
        </TabsList>

        {/* Construir */}
        <TabsContent value="build" className="space-y-6 pt-4">
          <Card><CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome interno</Label>
                <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select value={draft.product_id ?? ''} onValueChange={(v) => patch({ product_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Sem produto" /></SelectTrigger>
                  <SelectContent>
                    {products?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Agente de IA</Label>
                <Select value={draft.product_agent_id ?? ''} onValueChange={(v) => {
                  const nextAgent = agents?.find((a: any) => a.id === v) as any;
                  patch({
                    product_agent_id: v || null,
                    voice_provider: nextAgent?.voice_provider ?? null,
                    openai_voice_id: nextAgent?.openai_voice_id ?? null,
                    grok_voice_id: draft.grok_voice_id || nextAgent?.default_grok_voice_id || null,
                  } as any);
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
                  <SelectContent>
                    {agents?.filter((a: any) => a.is_active).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}{a.product?.name ? ` — ${a.product.name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Entra na ligação com toda a inteligência: persona, tom, sotaque, gírias, can/cannot_do, frases obrigatórias/proibidas.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Provedor de voz</Label>
                <Select
                  value={draft.voice_provider ?? '__agent__'}
                  onValueChange={(v) => patch({
                    voice_provider: v === '__agent__' ? null : v as any,
                    openai_voice_id: v === 'openai' || v === 'auto'
                      ? (draft.openai_voice_id || selectedAgent?.openai_voice_id || DEFAULT_OPENAI_VOICE_ID)
                      : draft.openai_voice_id,
                  } as any)}
                >
                  <SelectTrigger><SelectValue placeholder="Usar configuração do agente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__agent__">Usar configuração do agente ({selectedAgent?.voice_provider || 'Grok'})</SelectItem>
                    <SelectItem value="openai">OpenAI Realtime — mais humano</SelectItem>
                    <SelectItem value="grok">Grok (xAI) — fallback</SelectItem>
                    <SelectItem value="auto">Auto — OpenAI se disponível</SelectItem>
                  </SelectContent>
                </Select>
                {openaiKeyMissing && (
                  <div className="flex gap-2 items-start rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>
                      Nenhuma chave OpenAI cadastrada para esta empresa. Cadastre em
                      <strong> Integrações → IA</strong> antes de publicar, ou a ligação vai falhar
                      ao tentar iniciar.
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Voz</Label>
                <div className="flex gap-2">
                  {isOpenAIProvider ? (
                    <Select value={selectedOpenAIVoice} onValueChange={(v) => patch({ openai_voice_id: v } as any)}>
                      <SelectTrigger><SelectValue placeholder="Voz OpenAI" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__openai__" disabled>— OpenAI Realtime —</SelectItem>
                        {OPENAI_REALTIME_VOICES.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name} · {v.gender}{v.recommended ? ' · recomendada' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                  <Select value={selectedGrokVoice} onValueChange={(v) => patch({ grok_voice_id: v || null } as any)}>
                    <SelectTrigger><SelectValue placeholder="Voz padrão do agente" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__" disabled>— Nativas Grok —</SelectItem>
                      {GROK_NATIVE_VOICES.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name} · {v.gender} · {v.language}</SelectItem>
                      ))}
                      {clones.filter((c) => c.status === 'ready' && c.grok_voice_id).length > 0 && (
                        <SelectItem value="__clones__" disabled>— Suas clonadas —</SelectItem>
                      )}
                      {clones.filter((c) => c.status === 'ready' && c.grok_voice_id).map((c) => (
                        <SelectItem key={c.id} value={c.grok_voice_id!}>{c.name} (clone)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Ouvir amostra"
                    disabled={isOpenAIProvider ? !selectedOpenAIVoice : !selectedGrokVoice}
                    onClick={async () => {
                      try {
                        const url = isOpenAIProvider
                          ? await previewOpenAIVoice(selectedOpenAIVoice)
                          : await previewGrokVoice(selectedGrokVoice);
                        new Audio(url).play().catch(() => {});
                      } catch (e: any) { toast.error(e?.message || 'Falha na prévia'); }
                    }}
                  >▶</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Slug público</Label>
                <Input value={draft.slug} onChange={(e) => patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contexto desta ligação</Label>
              <Textarea
                rows={4}
                placeholder="Ex.: Black Friday — foco em conversão rápida, oferta 40% OFF válida até dia X..."
                value={draft.context}
                onChange={(e) => patch({ context: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">A IA usa este contexto junto do prompt base do agente.</p>
            </div>
          </CardContent></Card>

          {/* Campos a capturar */}
          <Card><CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Dados que a IA deve capturar</h3>
                <p className="text-sm text-muted-foreground">
                  A IA vai pedir <strong>no meio natural da conversa</strong> — nunca no início ou no fim.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => patch({
                capture_fields: [...draft.capture_fields, { key: `campo_${Date.now().toString(36)}`, label: 'Novo campo', type: 'text' }],
              })}>
                <Plus className="h-4 w-4 mr-2" /> Adicionar campo
              </Button>
            </div>
            <div className="space-y-2">
              {draft.capture_fields.map((f, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center border rounded-lg p-2">
                  <Input className="col-span-3" placeholder="chave" value={f.key}
                    onChange={(e) => {
                      const next = [...draft.capture_fields]; next[idx] = { ...f, key: e.target.value }; patch({ capture_fields: next });
                    }} />
                  <Input className="col-span-4" placeholder="Rótulo" value={f.label}
                    onChange={(e) => {
                      const next = [...draft.capture_fields]; next[idx] = { ...f, label: e.target.value }; patch({ capture_fields: next });
                    }} />
                  <Select value={f.type} onValueChange={(v) => {
                    const next = [...draft.capture_fields]; next[idx] = { ...f, type: v as any }; patch({ capture_fields: next });
                  }}>
                    <SelectTrigger className="col-span-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="phone">Telefone</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <Switch checked={!!f.required} onCheckedChange={(v) => {
                      const next = [...draft.capture_fields]; next[idx] = { ...f, required: v }; patch({ capture_fields: next });
                    }} />
                    Obrigatório
                  </label>
                  <Button variant="ghost" size="icon" className="col-span-1"
                    onClick={() => patch({ capture_fields: draft.capture_fields.filter((_, i) => i !== idx) })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent></Card>

          {/* CTAs */}
          <Card><CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Objetivos / CTAs</h3>
                <p className="text-sm text-muted-foreground">
                  Cada CTA vira uma ação que a IA pode disparar durante a ligação.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => patch({
                ctas: [...draft.ctas, { id: crypto.randomUUID(), kind: 'link', label: 'Novo CTA', track_click: true }],
              })}>
                <Plus className="h-4 w-4 mr-2" /> Adicionar CTA
              </Button>
            </div>
            <div className="space-y-3">
              {draft.ctas.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Nenhum CTA configurado. A IA só conversa, sem ações.</p>
              )}
              {draft.ctas.map((cta, idx) => (
                <div key={cta.id} className="border rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-12 gap-2">
                    <Select value={cta.kind} onValueChange={(v) => {
                      const next = [...draft.ctas]; next[idx] = { ...cta, kind: v as any }; patch({ ctas: next });
                    }}>
                      <SelectTrigger className="col-span-4"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CTA_KINDS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Input className="col-span-7" placeholder="Rótulo do botão" value={cta.label}
                      onChange={(e) => {
                        const next = [...draft.ctas]; next[idx] = { ...cta, label: e.target.value }; patch({ ctas: next });
                      }} />
                    <Button variant="ghost" size="icon" className="col-span-1"
                      onClick={() => patch({ ctas: draft.ctas.filter((_, i) => i !== idx) })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {cta.kind === 'link' && (
                    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs flex items-center gap-1">
                          <LinkIcon className="h-3 w-3" /> Links deste CTA
                        </Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const links: CallCtaLink[] = cta.links ?? [];
                            const next = [...draft.ctas];
                            next[idx] = {
                              ...cta,
                              links: [...links, { id: crypto.randomUUID(), label: 'Novo link', url: '' }],
                            };
                            patch({ ctas: next });
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Adicionar link
                        </Button>
                      </div>
                      {(cta.links ?? []).length === 0 && (
                        <p className="text-[11px] text-muted-foreground italic">
                          Nenhum link. A IA vai poder oferecer múltiplos links (checkout, materiais, formulários...) durante a conversa.
                        </p>
                      )}
                      {(cta.links ?? []).map((lnk, lidx) => (
                        <div key={lnk.id} className="grid grid-cols-12 gap-2">
                          <Input
                            className="col-span-4"
                            placeholder="Rótulo (ex.: Checkout)"
                            value={lnk.label}
                            onChange={(e) => {
                              const links = [...(cta.links ?? [])];
                              links[lidx] = { ...lnk, label: e.target.value };
                              const next = [...draft.ctas];
                              next[idx] = { ...cta, links };
                              patch({ ctas: next });
                            }}
                          />
                          <Input
                            className="col-span-7"
                            placeholder="https://..."
                            value={lnk.url}
                            onChange={(e) => {
                              const links = [...(cta.links ?? [])];
                              links[lidx] = { ...lnk, url: e.target.value };
                              const next = [...draft.ctas];
                              next[idx] = { ...cta, links };
                              patch({ ctas: next });
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="col-span-1"
                            onClick={() => {
                              const links = (cta.links ?? []).filter((_, i) => i !== lidx);
                              const next = [...draft.ctas];
                              next[idx] = { ...cta, links };
                              patch({ ctas: next });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {cta.kind === 'schedule' && (
                    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2">
                      <Label className="text-xs flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> Agenda a usar
                      </Label>
                      <Select
                        value={cta.event_type_id ?? ''}
                        onValueChange={(v) => {
                          const next = [...draft.ctas];
                          next[idx] = { ...cta, event_type_id: v || undefined };
                          patch({ ctas: next });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={orgEventTypes.length ? 'Selecione uma agenda' : 'Nenhuma agenda cadastrada'} />
                        </SelectTrigger>
                        <SelectContent>
                          {orgEventTypes.filter((e) => e.is_active).map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name} · {e.duration_minutes}min
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!cta.event_type_id && (
                        <p className="text-[11px] text-amber-600">
                          Selecione uma agenda para a IA poder oferecer horários reais durante a ligação.
                        </p>
                      )}
                    </div>
                  )}
                  {cta.kind === 'whatsapp' && (
                    <Input placeholder="Número destino (com DDI 55...) — opcional, padrão = do lead" value={cta.whatsapp_target ?? ''}
                      onChange={(e) => {
                        const next = [...draft.ctas]; next[idx] = { ...cta, whatsapp_target: e.target.value }; patch({ ctas: next });
                      }} />
                  )}
                  {cta.kind === 'interest' && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="ID da tag" value={cta.tag_id ?? ''}
                        onChange={(e) => {
                          const next = [...draft.ctas]; next[idx] = { ...cta, tag_id: e.target.value }; patch({ ctas: next });
                        }} />
                      <Input type="number" placeholder="Score (0-100)" value={cta.score ?? ''}
                        onChange={(e) => {
                          const next = [...draft.ctas]; next[idx] = { ...cta, score: Number(e.target.value) || 0 }; patch({ ctas: next });
                        }} />
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={cta.track_click !== false} onCheckedChange={(v) => {
                      const next = [...draft.ctas]; next[idx] = { ...cta, track_click: v }; patch({ ctas: next });
                    }} />
                    Trackear clique (dispara pixel/evento)
                  </label>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Design */}
        <TabsContent value="design" className="pt-4">
          <Card><CardContent className="pt-6">
            {(() => {
              const agent: any = agents?.find((a: any) => a.id === draft.product_agent_id);
              const agentName = agent?.name || draft.name || 'Agente';
              return (
                <VoiceAgentDesignEditor
                  appearance={draft.appearance as any}
                  onChange={(a) => patch({ appearance: a as any })}
                  agentName={agentName}
                  agentRole={agent?.agent_type || null}
                  agentPhoto={agent?.avatar_url || null}
                  headline={agentName}
                  subheadline={draft.context || 'Fale agora com nosso especialista por voz.'}
                  ctaLabel="Falar agora"
                />
              );
            })()}
          </CardContent></Card>
        </TabsContent>

        {/* Configurar (Tracking) */}
        <TabsContent value="config" className="pt-4 space-y-4">
          <Card><CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              <h3 className="font-medium">Agenda padrão (fallback)</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              A IA vai oferecer horários desta agenda quando nenhum CTA de agendamento estiver configurado.
              Se você já tem um CTA "Agendar reunião" com agenda selecionada, ele tem prioridade.
            </p>
            <Select
              value={(draft.appearance as any)?.default_event_type_id ?? 'none'}
              onValueChange={(v) => patch({
                appearance: { ...(draft.appearance as any), default_event_type_id: v === 'none' ? null : v } as any,
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder={orgEventTypes.length ? 'Nenhuma' : 'Nenhuma agenda cadastrada'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {orgEventTypes.filter((e) => e.is_active).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name} · {e.duration_minutes}min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent></Card>

          <Card><CardContent className="pt-6 space-y-4">
            <h3 className="font-medium">Cadência pós-ligação (padrão)</h3>
            <p className="text-xs text-muted-foreground">
              Inscreve automaticamente o lead nesta cadência ao final de qualquer chamada, mesmo sem uma regra por outcome configurada em Automações.
            </p>
            <Select
              value={draft.post_cadence_id ?? 'none'}
              onValueChange={(v) => patch({ post_cadence_id: v === 'none' ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                {cadences.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent></Card>

          <Card><CardContent className="pt-6 space-y-4">
            <h3 className="font-medium">Meta Pixel / Conversions API</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Pixel ID</Label>
                <Input placeholder="1234567890" value={draft.tracking.meta_pixel_id ?? ''}
                  onChange={(e) => patch({ tracking: { ...draft.tracking, meta_pixel_id: e.target.value } })} />
              </div>
              <div className="space-y-2">
                <Label>Access Token (CAPI)</Label>
                <Input type="password" value={draft.tracking.meta_access_token ?? ''}
                  onChange={(e) => patch({ tracking: { ...draft.tracking, meta_access_token: e.target.value } })} />
              </div>
            </div>
            <Separator />
            <h3 className="font-medium">Google Analytics 4</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Measurement ID</Label>
                <Input placeholder="G-XXXXXXXXXX" value={draft.tracking.ga4_id ?? ''}
                  onChange={(e) => patch({ tracking: { ...draft.tracking, ga4_id: e.target.value } })} />
              </div>
              <div className="space-y-2">
                <Label>API Secret (Measurement Protocol — opcional)</Label>
                <Input type="password" value={(draft.tracking as any).ga4_api_secret ?? ''}
                  onChange={(e) => patch({ tracking: { ...draft.tracking, ga4_api_secret: e.target.value } as any })} />
              </div>
            </div>
            <Separator />
            <h3 className="font-medium">Webhook pós-ligação</h3>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input placeholder="https://..." value={draft.tracking.webhook_url ?? ''}
                onChange={(e) => patch({ tracking: { ...draft.tracking, webhook_url: e.target.value } })} />
              <p className="text-xs text-muted-foreground">
                Receberá POST com resumo, transcrição, dados capturados, CTAs clicados e UTMs.
              </p>
            </div>
            <Separator />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Eventos disparados automaticamente:</strong></p>
              <p>· <code>PageView</code> ao abrir · <code>InitiateCheckout</code> ao iniciar ligação</p>
              <p>· <code>Lead</code> quando IA captura dados · <code>Schedule</code> ao agendar</p>
              <p>· <code>CustomEvent</code> para cada CTA clicado</p>
              <p>· UTMs (<code>utm_source/medium/campaign/term/content</code>) são capturados automaticamente da URL.</p>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Automações pós-chamada (Fase 8) */}
        <TabsContent value="automations" className="pt-4">
          <Card><CardContent className="pt-6">
            <VoiceCallAutomationsTab
              rules={draft.post_call_automations?.rules ?? []}
              onChange={(rules) => patch({ post_call_automations: { rules } })}
            />
          </CardContent></Card>
        </TabsContent>


        {/* Publicar */}
        <TabsContent value="publish" className="pt-4 space-y-4">
          <Card><CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Status</h3>
                <p className="text-sm text-muted-foreground">Ligações em rascunho não abrem publicamente.</p>
              </div>
              <Badge variant={draft.status === 'active' ? 'default' : 'secondary'}>
                {draft.status === 'active' ? 'Publicada' : 'Rascunho'}
              </Badge>
            </div>
            <div className="space-y-2">
              <Label>Link público</Label>
              <div className="flex gap-2">
                <Input readOnly value={publicUrl} />
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Copiado'); }}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => window.open(publicUrl, '_blank')}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Embed (iframe)</Label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Largura</Label>
                  <Input type="number" className="w-24" value={embedW}
                    disabled={embedResponsive}
                    onChange={(e) => setEmbedW(Number(e.target.value) || 380)} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Altura</Label>
                  <Input type="number" className="w-24" value={embedH}
                    onChange={(e) => setEmbedH(Number(e.target.value) || 760)} />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={embedResponsive} onCheckedChange={setEmbedResponsive} />
                  Responsivo (100% da largura)
                </label>
              </div>
              {(() => {
                const snippet = embedResponsive
                  ? `<div style="position:relative;width:100%;max-width:480px;margin:0 auto;">\n  <iframe src="${publicUrl}" style="width:100%;height:${embedH}px;border:0;display:block;" allow="microphone; autoplay" loading="lazy"></iframe>\n</div>`
                  : `<iframe src="${publicUrl}" width="${embedW}" height="${embedH}" frameborder="0" allow="microphone; autoplay" loading="lazy"></iframe>`;
                return (
                  <div className="space-y-2">
                    <Textarea readOnly rows={embedResponsive ? 4 : 2} value={snippet} className="font-mono text-xs" />
                    <Button variant="outline" size="sm"
                      onClick={() => { navigator.clipboard.writeText(snippet); toast.success('Snippet copiado'); }}>
                      <Copy className="h-4 w-4 mr-2" /> Copiar snippet
                    </Button>
                  </div>
                );
              })()}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4" />
                <Label>QR Code</Label>
              </div>
              {draft.status === 'active' ? (
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="p-3 bg-white rounded-lg border" id={`voice-call-qr-${draft.id}`}>
                    <QRCodeSVG value={publicUrl} size={180} level="H" includeMargin={false} />
                  </div>
                  <div className="space-y-2 flex-1">
                    <p className="text-sm text-muted-foreground">
                      Imprima ou exiba para acesso rápido pelo celular.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => {
                      const container = document.getElementById(`voice-call-qr-${draft.id}`);
                      const svg = container?.querySelector('svg');
                      if (!svg) return;
                      const svgData = new XMLSerializer().serializeToString(svg);
                      const canvas = document.createElement('canvas');
                      const size = 512;
                      canvas.width = size; canvas.height = size;
                      const ctx = canvas.getContext('2d');
                      const img = new Image();
                      img.onload = () => {
                        if (!ctx) return;
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(0, 0, size, size);
                        ctx.drawImage(img, 0, 0, size, size);
                        const url = canvas.toDataURL('image/png');
                        const a = document.createElement('a');
                        a.href = url; a.download = `qrcode-${draft.slug}.png`;
                        a.click();
                      };
                      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                    }}>
                      <Download className="h-4 w-4 mr-2" /> Baixar PNG
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground border rounded-md p-3 bg-muted/30">
                  Publique a ligação para gerar o QR Code.
                </p>
              )}
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* Respostas */}
        <TabsContent value="responses" className="pt-4">
          <VoiceCallResponsesTab voiceCallId={draft.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
