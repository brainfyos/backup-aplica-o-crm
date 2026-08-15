import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Bot, Trash2, Edit3, Loader2, PhoneIncoming, Play, Info, Phone } from 'lucide-react';
import { useVoiceAgents, useSaveVoiceAgent, useDeleteVoiceAgent, type VoiceAgent } from '@/hooks/useVoice';
import { useAllAgents } from '@/hooks/useProductAgents';
import { previewGrokVoice } from '@/hooks/useVoiceClones';
import { GROK_NATIVE_VOICES, DEFAULT_GROK_VOICE_ID, grokVoiceById } from '@/config/grokVoicesCatalog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { ToolsOutcomesEditor, type OutcomeDef, type ToolsConfig } from './ToolsOutcomesEditor';
import { VoiceCallStage } from './call/VoiceCallStage';

export function VoiceAgentsTab() {
  const { data: profiles = [], isLoading } = useVoiceAgents();
  const { data: productAgents = [] } = useAllAgents();
  const del = useDeleteVoiceAgent();
  const [editing, setEditing] = useState<Partial<VoiceAgent> | null>(null);
  const [testCall, setTestCall] = useState<{ id: string; name: string } | null>(null);

  const agentName = (id?: string | null) => productAgents.find((a) => a.id === id)?.name || '(não vinculado)';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Perfis de Voz</h2>
          <p className="text-sm text-muted-foreground">
            Um perfil = um Agente de IA existente + uma voz Grok + contexto opcional para ligações.
          </p>
        </div>
        <Button
          onClick={() =>
            setEditing({
              grok_voice_id: DEFAULT_GROK_VOICE_ID,
              language: 'pt-BR',
              provider: 'xai',
              is_active: true,
            })
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Novo perfil de voz
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Crie e edite o comportamento dos agentes em <b>Agentes de IA</b>. Aqui você só escolhe qual agente atende ligações, com qual voz.
        </AlertDescription>
      </Alert>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : profiles.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Bot className="mx-auto mb-3 h-8 w-8 opacity-50" />
          <p>Nenhum perfil de voz criado ainda.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {profiles.map((p) => {
            const voice = grokVoiceById(p.grok_voice_id || p.voice_option);
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium truncate">{p.name}</h3>
                      {p.is_inbound_default && (
                        <Badge variant="secondary" className="gap-1">
                          <PhoneIncoming className="h-3 w-3" /> Padrão inbound
                        </Badge>
                      )}
                      {!p.is_active && <Badge variant="outline">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Agente IA: <b>{agentName(p.product_agent_id)}</b>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Voz: <b>{voice?.name || p.grok_voice_id || '—'}</b>
                    </p>
                    {p.context_override && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">📌 {p.context_override}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Testar ligação com IA"
                      onClick={() => setTestCall({ id: p.id, name: p.name })}
                      disabled={!p.is_active}
                    >
                      <Phone className="h-4 w-4 text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(p)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => confirm('Remover perfil?') && del.mutate(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <VoiceProfileEditor profile={editing} onClose={() => setEditing(null)} />
      {testCall && (
        <VoiceCallStage
          open={!!testCall}
          onOpenChange={(o) => { if (!o) setTestCall(null); }}
          voiceAgentId={testCall.id}
          agentName={testCall.name}
        />
      )}
    </div>
  );
}

function VoiceProfileEditor({ profile, onClose }: { profile: Partial<VoiceAgent> | null; onClose: () => void }) {
  const save = useSaveVoiceAgent();
  const { data: productAgents = [] } = useAllAgents();
  const [form, setForm] = useState<Partial<VoiceAgent>>(profile || {});
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    setForm(profile || {});
  }, [profile?.id]);

  const handlePreview = async (voiceId: string) => {
    try {
      setPreviewing(voiceId);
      const url = await previewGrokVoice(voiceId);
      const audio = new Audio(url);
      audio.play().catch(() => toast.error('Não foi possível reproduzir o áudio'));
    } catch (e) {
      toast.error(`Preview falhou: ${(e as Error).message}`);
    } finally {
      setPreviewing(null);
    }
  };

  const handleSave = () => {
    if (!form.name?.trim() || !form.product_agent_id) return;
    save.mutate(form as any, { onSuccess: () => onClose() });
  };

  return (
    <Sheet open={!!profile} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" key={profile?.id || 'new'}>
        <SheetHeader>
          <SheetTitle>{profile?.id ? 'Editar perfil de voz' : 'Novo perfil de voz'}</SheetTitle>
          <SheetDescription>
            Vincule um Agente de IA já existente e escolha a voz que ele usará em ligações.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome do perfil</Label>
            <Input
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Ana — SDR Curso Premium"
            />
          </div>

          <div className="space-y-2">
            <Label>Agente de IA</Label>
            <Select
              value={form.product_agent_id || ''}
              onValueChange={(v) => setForm({ ...form, product_agent_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha um agente de IA" />
              </SelectTrigger>
              <SelectContent>
                {productAgents.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground">
                    Nenhum agente encontrado. Crie em Agentes de IA.
                  </div>
                )}
                {productAgents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} {a.product?.name ? `— ${a.product.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O prompt, objetivo e regras vêm do agente selecionado. Editar comportamento é feito na área <b>Agentes de IA</b>.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Voz</Label>
            <div className="grid gap-2 max-h-64 overflow-y-auto rounded-md border p-2">
              {GROK_NATIVE_VOICES.map((v) => (
                <VoiceRow
                  key={v.id}
                  id={v.id}
                  name={v.name}
                  desc={`${v.gender === 'female' ? '♀' : v.gender === 'male' ? '♂' : '◇'} · ${v.language} · ${v.description}`}
                  selected={form.grok_voice_id === v.id}
                  onSelect={() => setForm({ ...form, grok_voice_id: v.id })}
                  onPreview={() => handlePreview(v.id)}
                  loading={previewing === v.id}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contexto extra (opcional)</Label>
            <Textarea
              value={form.context_override || ''}
              onChange={(e) => setForm({ ...form, context_override: e.target.value })}
              rows={4}
              placeholder="Ex: Esta ligação é para confirmar interesse na turma de Janeiro. Ofereça o desconto de lançamento se hesitar."
            />
            <p className="text-xs text-muted-foreground">
              Instrução específica desta persona de voz, somada ao prompt do agente.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Idioma</Label>
              <Select value={form.language || 'pt-BR'} onValueChange={(v) => setForm({ ...form, language: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (BR)</SelectItem>
                  <SelectItem value="en-US">Inglês (US)</SelectItem>
                  <SelectItem value="es-ES">Espanhol</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ID no Voice Builder xAI (opcional)</Label>
              <Input
                value={form.external_agent_id || ''}
                onChange={(e) => setForm({ ...form, external_agent_id: e.target.value })}
                placeholder="deixe vazio"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Padrão para chamadas recebidas</Label>
              <p className="text-xs text-muted-foreground">Atende automaticamente quando alguém liga.</p>
            </div>
            <Switch
              checked={!!form.is_inbound_default}
              onCheckedChange={(v) => setForm({ ...form, is_inbound_default: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Ativo</Label>
              <p className="text-xs text-muted-foreground">Perfis inativos não aparecem para uso.</p>
            </div>
            <Switch checked={form.is_active !== false} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>

          <Accordion type="single" collapsible>
            <AccordionItem value="tools">
              <AccordionTrigger>
                <span className="text-sm font-medium">🛠 Tools & Desfechos da ligação</span>
              </AccordionTrigger>
              <AccordionContent>
                <ToolsOutcomesEditor
                  tools={(form as any).tools_config || {}}
                  outcomes={((form as any).outcomes || []) as OutcomeDef[]}
                  onChange={({ tools_config, outcomes }) => setForm({ ...form, tools_config, outcomes } as any)}
                />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="public">
              <AccordionTrigger>
                <span className="text-sm font-medium">🌐 Página pública /call/:slug</span>
              </AccordionTrigger>
              <AccordionContent>
                <PublicPageEditor form={form} setForm={setForm} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>


          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={save.isPending || !form.name?.trim() || !form.product_agent_id}
            >
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar perfil
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VoiceRow({
  id, name, desc, selected, onSelect, onPreview, loading,
}: {
  id: string; name: string; desc: string; selected: boolean;
  onSelect: () => void; onPreview: () => void; loading: boolean;
}) {
  return (
    <div
      role="button"
      onClick={onSelect}
      className={`flex items-center gap-2 rounded-md border p-2 cursor-pointer transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{desc}</div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      </Button>
      {selected && <Badge variant="secondary" className="text-[10px]">Selecionada</Badge>}
    </div>
  );
}

function PublicPageEditor({
  form,
  setForm,
}: {
  form: Partial<VoiceAgent>;
  setForm: (f: Partial<VoiceAgent>) => void;
}) {
  const cfg: any = (form as any).public_config || {};
  const setCfg = (patch: any) => setForm({ ...form, public_config: { ...cfg, ...patch } } as any);
  const enabled = !!(form as any).public_enabled;
  const slug = ((form as any).public_slug || '') as string;
  const shareUrl = slug ? `${window.location.origin}/call/${slug}` : '';
  const suggest = () =>
    (form.name || 'ligacao')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);

  const photo = ((form as any).photo_url || '') as string;
  const displayName = ((form as any).display_name || '') as string;
  const roleTitle = ((form as any).role_title || '') as string;
  const theme = ((form as any).theme || 'phone') as string;

  return (
    <div className="space-y-4 pt-2">
      {/* Identidade visual do agente na ligação */}
      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Identidade na ligação
        </div>
        <div className="flex items-center gap-3">
          <div className="h-20 w-20 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Foto do agente" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <Bot className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">URL da foto</Label>
              <Input
                value={photo}
                onChange={(e) => setForm({ ...form, photo_url: e.target.value } as any)}
                placeholder="https://..."
              />
              <p className="text-[11px] text-muted-foreground">Cole o link de uma imagem quadrada (ex: 512×512). Aparece na tela de ligação tocando.</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome exibido</Label>
            <Input
              value={displayName}
              onChange={(e) => setForm({ ...form, display_name: e.target.value } as any)}
              placeholder={form.name || 'Ana'}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cargo / descrição</Label>
            <Input
              value={roleTitle}
              onChange={(e) => setForm({ ...form, role_title: e.target.value } as any)}
              placeholder="Consultora Vendus"
            />
          </div>
        </div>
      </div>

      {/* Tema visual da simulação */}
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label>Tema da simulação</Label>
          <Badge variant="outline" className="text-[10px]">v1</Badge>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { id: 'phone', label: 'Ligação', enabled: true, emoji: '📞' },
            { id: 'instagram', label: 'Instagram', enabled: false, emoji: '📷' },
            { id: 'whatsapp', label: 'WhatsApp', enabled: false, emoji: '💬' },
            { id: 'facetime', label: 'FaceTime', enabled: false, emoji: '📹' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!t.enabled}
              onClick={() => setForm({ ...form, theme: t.id } as any)}
              className={`rounded-md border p-2 text-xs flex flex-col items-center gap-1 transition-colors
                ${theme === t.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}
                ${!t.enabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <span className="text-lg">{t.emoji}</span>
              <span>{t.label}</span>
              {!t.enabled && <span className="text-[9px] text-muted-foreground">em breve</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Publicar página pública</Label>
          <p className="text-xs text-muted-foreground">Qualquer pessoa com o link inicia uma ligação com esta IA.</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => setForm({ ...form, public_enabled: v, public_slug: (form as any).public_slug || suggest() } as any)}
        />
      </div>

      <div className="space-y-2">
        <Label>Slug (URL)</Label>
        <div className="flex gap-2">
          <div className="flex items-center rounded-md border bg-muted px-2 text-xs text-muted-foreground shrink-0">
            {typeof window !== 'undefined' ? window.location.origin : ''}/call/
          </div>
          <Input
            value={slug}
            onChange={(e) =>
              setForm({
                ...form,
                public_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
              } as any)
            }
            placeholder={suggest()}
          />
        </div>
        {shareUrl && (
          <div className="flex items-center gap-2 text-xs">
            <code className="flex-1 truncate bg-muted rounded px-2 py-1">{shareUrl}</code>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                toast.success('Link copiado');
              }}
            >
              Copiar
            </Button>
            <Button size="sm" variant="outline" type="button" asChild>
              <a href={shareUrl} target="_blank" rel="noreferrer">Abrir</a>
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Título (headline)</Label>
        <Input value={cfg.headline || ''} onChange={(e) => setCfg({ headline: e.target.value })} placeholder={`Fale com ${form.name || 'a IA'} agora`} />
      </div>
      <div className="space-y-2">
        <Label>Subtítulo</Label>
        <Textarea rows={2} value={cfg.subheadline || ''} onChange={(e) => setCfg({ subheadline: e.target.value })} placeholder="Uma conversa por voz, em tempo real." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Texto do botão</Label>
          <Input value={cfg.cta_label || ''} onChange={(e) => setCfg({ cta_label: e.target.value })} placeholder="Iniciar ligação" />
        </div>
        <div className="space-y-2">
          <Label>Cor de destaque (hex)</Label>
          <Input value={cfg.accent_color || ''} onChange={(e) => setCfg({ accent_color: e.target.value })} placeholder="#7C3AED" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center justify-between rounded-md border p-2">
          <span className="text-xs">Pedir nome</span>
          <Switch checked={cfg.require_name ?? true} onCheckedChange={(v) => setCfg({ require_name: v })} />
        </div>
        <div className="flex items-center justify-between rounded-md border p-2">
          <span className="text-xs">Pedir contato</span>
          <Switch checked={cfg.require_contact ?? true} onCheckedChange={(v) => setCfg({ require_contact: v })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>URL de redirecionamento pós-chamada (opcional)</Label>
        <Input value={cfg.post_redirect_url || ''} onChange={(e) => setCfg({ post_redirect_url: e.target.value })} placeholder="https://seu-site.com/obrigado" />
      </div>
    </div>
  );
}
