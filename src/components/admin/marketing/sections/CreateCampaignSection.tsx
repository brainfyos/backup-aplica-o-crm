import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Sparkles, Upload, MessageCircle, FileText, ListChecks, Link2, CheckCircle2,
  XCircle, ArrowLeft, ArrowRight, Loader2, Rocket, Wand2, Play,
  Megaphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePlatformName } from '@/hooks/usePlatformName';
import {
  useDraftAI, useValidateCampaign, usePublishCampaign,
  type CampaignDraft, type DestinationRef,
} from '@/hooks/useCampaignCreator';
import { useMetaDirectAction } from '@/hooks/useMarketingAI';
import { DESTINATION_LABEL, UTM_TEMPLATE, type CampaignDestination } from '@/lib/metaObjectiveMap';

const STEPS = ['Descrever', 'Revisar', 'Criativos', 'Destino & CRM', 'Publicar'] as const;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      resolve(s.split(',')[1] ?? s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CreateCampaignSection() {
  const { platformName } = usePlatformName();
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const [params, setParams] = useSearchParams();
  const stepParam = Number(params.get('step') ?? '0');
  const [step, setStep] = useState<number>(isNaN(stepParam) ? 0 : Math.max(0, Math.min(4, stepParam)));

  const storageKey = `mkt-create-draft:${orgId ?? 'none'}`;
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [destRef, setDestRef] = useState<DestinationRef>({});
  const [credentialId, setCredentialId] = useState('');
  const [published, setPublished] = useState<{ campaign_id: string; status: 'PAUSED' | 'ACTIVE' } | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        setDescription(data.description ?? '');
        setDraft(data.draft ?? null);
        setDestRef(data.destRef ?? {});
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (!orgId) return;
    sessionStorage.setItem(storageKey, JSON.stringify({ description, draft, destRef }));
  }, [description, draft, destRef, storageKey, orgId]);

  const goStep = (i: number) => {
    setStep(i);
    const next = new URLSearchParams(params);
    next.set('step', String(i));
    setParams(next, { replace: true });
  };

  const draftAI = useDraftAI();
  const validate = useValidateCampaign();
  const publish = usePublishCampaign();
  const directAction = useMetaDirectAction();
  const metaCredentials = useQuery({
    queryKey: ['mkt-meta-credentials', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('org_marketing_credentials')
        .select('id,ad_account_id,account_name,business_id,is_active')
        .eq('organization_id', orgId!).eq('provider', 'meta').eq('is_active', true)
        .order('account_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!orgId || !(metaCredentials.data?.length)) return;
    const stored = window.localStorage.getItem(`marketing.selectedCredential.${orgId}`);
    const selected = metaCredentials.data.find((item: any) => item.id === stored) ?? metaCredentials.data[0];
    setCredentialId((current) => current && metaCredentials.data.some((item: any) => item.id === current)
      ? current
      : selected.id);
  }, [metaCredentials.data, orgId]);

  const selectedCredential = useMemo(
    () => metaCredentials.data?.find((item: any) => item.id === credentialId) ?? null,
    [metaCredentials.data, credentialId],
  );

  // Loaders para selects
  const forms = useQuery({
    queryKey: ['mkt-forms', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('forms').select('id,name,slug,is_published').eq('organization_id', orgId!).order('name')).data ?? [],
  });
  const quizzes = useQuery({
    queryKey: ['mkt-quiz', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('quiz_templates').select('id,name,slug').eq('organization_id', orgId!).order('name')).data ?? [],
  });
  const evoConns = useQuery({
    queryKey: ['mkt-evo', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('evolution_instances').select('id,name,phone_number,status').eq('organization_id', orgId!)).data ?? [],
  });
  const metaConns = useQuery({
    queryKey: ['mkt-metawa', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('whatsapp_meta_connections').select('id,display_name,phone_number').eq('organization_id', orgId!)).data ?? [],
  });
  const products = useQuery({
    queryKey: ['mkt-products', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('products').select('id,name').eq('organization_id', orgId!).order('name')).data ?? [],
  });
  const stages = useQuery({
    queryKey: ['mkt-stages', destRef.pipeline_id], enabled: !!destRef.pipeline_id,
    queryFn: async () => (await supabase.from('pipeline_stages').select('id,name,position').eq('product_id', destRef.pipeline_id!).order('position')).data ?? [],
  });
  const agents = useQuery({
    queryKey: ['mkt-agents', destRef.pipeline_id], enabled: !!destRef.pipeline_id,
    queryFn: async () => (await supabase.from('product_agents').select('id,name,is_default').eq('product_id', destRef.pipeline_id!).order('is_default', { ascending: false })).data ?? [],
  });
  const facebookPages = useQuery({
    queryKey: ['mkt-facebook-pages', orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('instagram_connections')
        .select('id,fb_page_id,fb_page_name,ig_username,status')
        .eq('organization_id', orgId!).eq('status', 'active').not('fb_page_id', 'is', null)
        .order('fb_page_name');
      return data ?? [];
    },
  });

  useEffect(() => {
    const firstPage = facebookPages.data?.find((page: any) => page.fb_page_id);
    if (draft && step === 3 && !destRef.facebook_page_id && firstPage?.fb_page_id) {
      setDestRef((current) => ({ ...current, facebook_page_id: firstPage.fb_page_id }));
    }
  }, [facebookPages.data, draft, step, destRef.facebook_page_id]);

  const wappConns = useMemo(() => {
    const evo = (evoConns.data ?? []).map((e: any) => ({ id: e.id, label: `Evolution · ${e.name} ${e.phone_number ?? ''}`, provider: 'evolution' }));
    const meta = (metaConns.data ?? []).map((m: any) => ({ id: m.id, label: `Meta Oficial · ${m.display_name ?? m.phone_number}`, provider: 'meta' }));
    return [...meta, ...evo];
  }, [evoConns.data, metaConns.data]);

  async function handleGenerate() {
    if (!credentialId) { toast.error('Selecione a conta de anúncios'); return; }
    if (!description.trim()) { toast.error('Descreva sua campanha primeiro'); return; }
    const result = await draftAI.mutateAsync({ description });
    // normaliza campos que a IA pode omitir
    const normalized: CampaignDraft = {
      nome_sugerido: result.nome_sugerido ?? 'Nova Campanha',
      produto: (result as any).produto,
      oferta: (result as any).oferta,
      publico_texto: (result as any).publico_texto,
      tom: (result as any).tom,
      destino: (result.destino as CampaignDestination) ?? 'whatsapp',
      orcamento_diario_brl: Number(result.orcamento_diario_brl ?? 50),
      localizacao: {
        paises: result.localizacao?.paises?.length ? result.localizacao.paises : ['BR'],
        idade_min: result.localizacao?.idade_min ?? 18,
        idade_max: result.localizacao?.idade_max ?? 65,
        interesses: result.localizacao?.interesses ?? [],
      },
      copies: (result.copies ?? []).slice(0, 3),
      mensagem_inicial_whatsapp: result.mensagem_inicial_whatsapp ?? 'Olá! Vim pelo anúncio.',
      creatives: [],
    };
    if (!normalized.copies.length) normalized.copies = [{ primary_text: '', headline: '', description: '', cta: 'LEARN_MORE' }];
    setDraft(normalized);
    goStep(1);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !draft) return;
    const arr = Array.from(files).slice(0, 4);
    const creatives = [] as CampaignDraft['creatives'];
    let totalSize = 0;
    for (const f of arr) {
      if (f.size > 8 * 1024 * 1024) { toast.error(`${f.name} maior que 8MB`); continue; }
      if (totalSize + f.size > 12 * 1024 * 1024) {
        toast.error('O envio total de criativos não pode ultrapassar 12MB.');
        break;
      }
      totalSize += f.size;
      const b64 = await fileToBase64(f);
      creatives!.push({
        upload_base64: b64,
        upload_type: f.type.startsWith('video') ? 'video' : 'image',
        filename: f.name,
        preview_url: URL.createObjectURL(f),
      });
    }
    setDraft({ ...draft, creatives });
  }

  async function runValidation() {
    if (!draft || !credentialId) return null;
    return await validate.mutateAsync({ credential_id: credentialId, destination_type: draft.destino, destination_ref: destRef });
  }

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [validation, setValidation] = useState<Awaited<ReturnType<typeof runValidation>> | null>(null);

  useEffect(() => {
    if (step === 4 && draft) {
      runValidation().then(setValidation).catch(() => setValidation(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, credentialId]);

  async function handlePublish() {
    if (!draft) return;
    try {
      const res = await publish.mutateAsync({ credential_id: credentialId, draft, destination_ref: destRef });
      setPublished({ campaign_id: res.campaign_id, status: 'PAUSED' });
      setConfirmOpen(false);
      sessionStorage.removeItem(storageKey);
    } catch { /* toast já mostrou */ }
  }

  function resetAll() {
    setDescription(''); setDraft(null); setDestRef({}); setPublished(null); setValidation(null);
    sessionStorage.removeItem(storageKey);
    goStep(0);
  }

  async function activatePublished() {
    if (!published || !draft) return;
    try {
      await directAction.mutateAsync({
        action_type: 'set_status',
        target_type: 'campaign',
        target_ref_id: published.campaign_id,
        target_label: draft.nome_sugerido,
        proposed_state: { status: 'ACTIVE' },
      });
      setPublished({ ...published, status: 'ACTIVE' });
    } catch { /* toast do hook */ }
  }

  if (published) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Campanha publicada com sucesso</h2>
              <p className="text-muted-foreground mt-2">
                {published.status === 'ACTIVE'
                  ? 'Ela já está ativa na Meta e pode ser acompanhada inteiramente pelo Vendus.'
                  : <>Ela foi criada como <b>PAUSADA</b> para você revisar antes de gastar.</>}
              </p>
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={() => { resetAll(); }}>
                Criar outra campanha
              </Button>
              <Button variant="outline" onClick={() => setParams({ tab: 'marketing-meta' })}>
                Ver desempenho no {platformName}
              </Button>
              {published.status === 'PAUSED' && (
                <Button onClick={activatePublished} disabled={directAction.isPending}>
                  {directAction.isPending
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Play className="w-4 h-4 mr-2" />}
                  Ativar na Meta
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" /> Criar Campanha
            </h1>
            <p className="text-sm text-muted-foreground">
              Descreva sua ideia — o {platformName} monta o rascunho, conecta ao CRM e publica.
            </p>
          </div>
          {draft && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={resetAll}>Descartar</Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            {STEPS.map((s, i) => (
              <button key={s} onClick={() => draft && goStep(i)} disabled={!draft && i > 0}
                className={`transition ${i === step ? 'text-primary font-semibold' : ''} ${!draft && i > 0 ? 'opacity-50' : ''}`}>
                {i + 1}. {s}
              </button>
            ))}
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} />
        </div>
      </header>

      {/* STEP 1 */}
      {step === 0 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meta-account" className="text-base">Conta de anúncios</Label>
              <Select
                value={credentialId}
                onValueChange={(value) => {
                  setCredentialId(value);
                  if (orgId) window.localStorage.setItem(`marketing.selectedCredential.${orgId}`, value);
                }}
              >
                <SelectTrigger id="meta-account">
                  <SelectValue placeholder={metaCredentials.isLoading ? 'Carregando contas…' : 'Selecione a conta'} />
                </SelectTrigger>
                <SelectContent>
                  {(metaCredentials.data ?? []).map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.account_name || item.ad_account_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!metaCredentials.isLoading && (metaCredentials.data ?? []).length === 0 && (
                <Alert variant="destructive">
                  <Megaphone className="h-4 w-4" />
                  <AlertTitle>Nenhuma conta Meta Ads conectada</AlertTitle>
                  <AlertDescription>Conecte uma conta em Configurações → Conexões antes de criar a campanha.</AlertDescription>
                </Alert>
              )}
            </div>
            <Label htmlFor="desc" className="text-base">O que você deseja anunciar?</Label>
            <Textarea
              id="desc" rows={8} placeholder="Ex: Quero vender o Vendus White Label para donos de agências, investindo R$ 200 por dia e levando os interessados para o WhatsApp."
              value={description} onChange={(e) => setDescription(e.target.value)}
              className="text-base"
            />
            <Alert>
              <Wand2 className="w-4 h-4" />
              <AlertTitle>A IA vai extrair</AlertTitle>
              <AlertDescription className="text-xs">
                Produto, oferta, público, localização, orçamento, destino e tom da comunicação. Você revisa tudo no próximo passo.
              </AlertDescription>
            </Alert>
            <Button onClick={handleGenerate} disabled={draftAI.isPending || !credentialId} size="lg" className="w-full">
              {draftAI.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando rascunho…</> : <><Sparkles className="w-4 h-4 mr-2" /> Criar campanha com IA</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — Revisar */}
      {step === 1 && draft && (
        <div className="space-y-4">
          <Card><CardContent className="p-6 space-y-4">
            <div>
              <Label>Nome da campanha</Label>
              <Input value={draft.nome_sugerido} onChange={(e) => setDraft({ ...draft, nome_sugerido: e.target.value })} />
            </div>

            <div>
              <Label>Objetivo</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                {(['whatsapp', 'form', 'quiz', 'url'] as CampaignDestination[]).map((d) => {
                  const Icon = d === 'whatsapp' ? MessageCircle : d === 'form' ? FileText : d === 'quiz' ? ListChecks : Link2;
                  return (
                    <button key={d} onClick={() => setDraft({ ...draft, destino: d })}
                      className={`p-3 rounded-lg border-2 transition text-sm flex flex-col items-center gap-1
                        ${draft.destino === d ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                      <Icon className="w-5 h-5" />
                      {DESTINATION_LABEL[d]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Países (códigos ISO, ex: BR)</Label>
                <Input value={draft.localizacao.paises.join(',')}
                  onChange={(e) => setDraft({ ...draft, localizacao: { ...draft.localizacao, paises: e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) } })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Idade mín</Label>
                  <Input type="number" min={13} max={65} value={draft.localizacao.idade_min}
                    onChange={(e) => setDraft({ ...draft, localizacao: { ...draft.localizacao, idade_min: Number(e.target.value) } })} />
                </div>
                <div>
                  <Label>Idade máx</Label>
                  <Input type="number" min={13} max={65} value={draft.localizacao.idade_max}
                    onChange={(e) => setDraft({ ...draft, localizacao: { ...draft.localizacao, idade_max: Number(e.target.value) } })} />
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Orçamento diário (R$)</Label>
                <Input type="number" min={5} value={draft.orcamento_diario_brl}
                  onChange={(e) => setDraft({ ...draft, orcamento_diario_brl: Number(e.target.value) })} />
                <p className="text-xs text-muted-foreground mt-1">Estimativa 30d: R$ {(draft.orcamento_diario_brl * 30).toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <Label>Início (opcional)</Label>
                <Input type="datetime-local" value={draft.data_inicio ?? ''} onChange={(e) => setDraft({ ...draft, data_inicio: e.target.value })} />
              </div>
              <div>
                <Label>Fim (opcional)</Label>
                <Input type="datetime-local" value={draft.data_fim ?? ''} onChange={(e) => setDraft({ ...draft, data_fim: e.target.value })} />
              </div>
            </div>

            {draft.destino === 'whatsapp' && (
              <div>
                <Label>Mensagem inicial do WhatsApp</Label>
                <Textarea value={draft.mensagem_inicial_whatsapp ?? ''} rows={2}
                  onChange={(e) => setDraft({ ...draft, mensagem_inicial_whatsapp: e.target.value })} />
              </div>
            )}
          </CardContent></Card>

          <Card><CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Copies ({draft.copies.length})</Label>
              <Button size="sm" variant="ghost" disabled={draftAI.isPending}
                onClick={async () => {
                  const r = await draftAI.mutateAsync({ mode: 'regenerate_copy', base: draft, style: 'variar' } as any);
                  if ((r as any)?.copies?.length) setDraft({ ...draft, copies: (r as any).copies.slice(0, 3) });
                }}>
                <Wand2 className="w-3 h-3 mr-1" /> Gerar outras versões
              </Button>
            </div>
            {draft.copies.map((c, i) => (
              <div key={i} className="p-3 border rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <Badge variant="outline">Copy {i + 1}</Badge>
                </div>
                <Textarea placeholder="Texto principal" value={c.primary_text} rows={3}
                  onChange={(e) => { const cs = [...draft.copies]; cs[i] = { ...c, primary_text: e.target.value }; setDraft({ ...draft, copies: cs }); }} />
                <div className="grid md:grid-cols-2 gap-2">
                  <Input placeholder="Headline (título)" value={c.headline}
                    onChange={(e) => { const cs = [...draft.copies]; cs[i] = { ...c, headline: e.target.value }; setDraft({ ...draft, copies: cs }); }} />
                  <Input placeholder="Descrição curta" value={c.description}
                    onChange={(e) => { const cs = [...draft.copies]; cs[i] = { ...c, description: e.target.value }; setDraft({ ...draft, copies: cs }); }} />
                </div>
              </div>
            ))}
          </CardContent></Card>
        </div>
      )}

      {/* STEP 3 — Criativos */}
      {step === 2 && draft && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <Label className="text-base">Imagens ou vídeo</Label>
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/40 transition">
              <input type="file" accept="image/*,video/*" multiple id="creative-upload" className="hidden"
                onChange={(e) => handleFiles(e.target.files)} />
              <label htmlFor="creative-upload" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm">Clique para enviar (até 4 arquivos, 8MB cada e 12MB no total)</span>
              </label>
            </div>
            {draft.creatives && draft.creatives.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {draft.creatives.map((c, i) => (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    {c.upload_type === 'video'
                      ? <video src={c.preview_url} controls className="w-full h-40 object-cover bg-black" />
                      : <img src={c.preview_url} alt={c.filename} className="w-full h-40 object-cover" />}
                    <div className="p-2 text-xs truncate">{c.filename}</div>
                  </div>
                ))}
              </div>
            )}
            <Alert>
              <AlertDescription className="text-xs">
                Imagens e vídeos são publicados diretamente na Meta e alternados entre as variações de copy.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 — Destino & CRM */}
      {step === 3 && draft && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <Label>Página do Facebook <span className="text-destructive">*</span></Label>
              {(facebookPages.data ?? []).length > 0 ? (
                <Select
                  value={destRef.facebook_page_id ?? ''}
                  onValueChange={(value) => setDestRef({ ...destRef, facebook_page_id: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha a página conectada" /></SelectTrigger>
                  <SelectContent>
                    {(facebookPages.data ?? []).map((page: any) => (
                      <SelectItem key={page.id} value={page.fb_page_id}>
                        {page.fb_page_name || page.ig_username || page.fb_page_id}
                        {page.ig_username ? ` · @${page.ig_username}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input
                    placeholder="ID numérico da página vinculada ao anúncio"
                    value={destRef.facebook_page_id ?? ''}
                    onChange={(e) => setDestRef({ ...destRef, facebook_page_id: e.target.value.trim() })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Conecte Facebook + Instagram em Conexões para selecionar a página automaticamente.
                  </p>
                </>
              )}
            </div>
            {draft.destino === 'whatsapp' && (
              <>
                <div>
                  <Label>Conexão WhatsApp</Label>
                  <Select value={destRef.whatsapp_connection_id ?? ''} onValueChange={(v) => setDestRef({ ...destRef, whatsapp_connection_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Escolha uma conexão" /></SelectTrigger>
                    <SelectContent>
                      {wappConns.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {draft.destino === 'form' && (
              <div>
                <Label>Formulário</Label>
                <Select value={destRef.form_id ?? ''} onValueChange={(v) => setDestRef({ ...destRef, form_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione um formulário" /></SelectTrigger>
                  <SelectContent>
                    {(forms.data ?? []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name} {f.is_published ? '' : '(rascunho)'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {draft.destino === 'quiz' && (
              <div>
                <Label>Quiz</Label>
                <Select value={destRef.quiz_id ?? ''} onValueChange={(v) => setDestRef({ ...destRef, quiz_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione um quiz" /></SelectTrigger>
                  <SelectContent>
                    {(quizzes.data ?? []).map((q: any) => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {draft.destino === 'url' && (
              <div>
                <Label>URL de destino</Label>
                <Input placeholder="https://…" value={destRef.url ?? ''} onChange={(e) => setDestRef({ ...destRef, url: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1 break-all">UTMs serão adicionadas automaticamente: <code>{UTM_TEMPLATE}</code></p>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <Label>Pipeline (Negócio)</Label>
                <Select value={destRef.pipeline_id ?? ''} onValueChange={(v) => setDestRef({ ...destRef, pipeline_id: v, stage_id: undefined, agent_id: undefined })}>
                  <SelectTrigger><SelectValue placeholder="Escolha o pipeline" /></SelectTrigger>
                  <SelectContent>
                    {(products.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Etapa inicial</Label>
                <Select value={destRef.stage_id ?? ''} onValueChange={(v) => setDestRef({ ...destRef, stage_id: v })} disabled={!destRef.pipeline_id}>
                  <SelectTrigger><SelectValue placeholder={destRef.pipeline_id ? 'Escolha a etapa' : 'Selecione o pipeline primeiro'} /></SelectTrigger>
                  <SelectContent>
                    {(stages.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {draft.destino === 'whatsapp' && (
                <div className="md:col-span-2">
                  <Label>Agente IA responsável</Label>
                  <Select value={destRef.agent_id ?? ''} onValueChange={(v) => setDestRef({ ...destRef, agent_id: v })} disabled={!destRef.pipeline_id}>
                    <SelectTrigger><SelectValue placeholder={destRef.pipeline_id ? 'Escolha o agente' : 'Selecione o pipeline primeiro'} /></SelectTrigger>
                    <SelectContent>
                      {(agents.data ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name} {a.is_default ? '(padrão)' : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5 — Publicar */}
      {step === 4 && draft && (
        <div className="space-y-4">
          <Card><CardContent className="p-6 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Checklist de rastreamento</h3>
            {validate.isPending && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</div>}
            {validation && Object.entries(validation.checks).map(([k, v]) => (
              <div key={k} className="flex items-start gap-2 text-sm">
                {v.ok ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" /> : <XCircle className="w-4 h-4 text-destructive mt-0.5" />}
                <span className={v.ok ? '' : 'text-destructive'}>{v.message}</span>
              </div>
            ))}
          </CardContent></Card>

          <Card><CardContent className="p-6 space-y-2 text-sm">
            <h3 className="font-semibold text-base mb-2">Você está prestes a publicar</h3>
            <div className="grid grid-cols-2 gap-y-1">
              <span className="text-muted-foreground">Campanha</span><span className="font-medium">{draft.nome_sugerido}</span>
              <span className="text-muted-foreground">Conta Meta</span><span>{selectedCredential?.account_name || selectedCredential?.ad_account_id || '—'}</span>
              <span className="text-muted-foreground">Objetivo</span><span>{DESTINATION_LABEL[draft.destino]}</span>
              <span className="text-muted-foreground">Anúncios</span><span>{draft.copies.length}</span>
              <span className="text-muted-foreground">Orçamento/dia</span><span>R$ {draft.orcamento_diario_brl.toLocaleString('pt-BR')}</span>
              <span className="text-muted-foreground">Estimativa 30d</span><span>R$ {(draft.orcamento_diario_brl * 30).toLocaleString('pt-BR')}</span>
              <span className="text-muted-foreground">Criativos</span><span>{draft.creatives?.length ?? 0}</span>
            </div>
            <Alert className="mt-3">
              <AlertDescription className="text-xs">A campanha será criada como <b>PAUSADA</b>. Depois da revisão, você pode ativá-la aqui mesmo no Vendus.</AlertDescription>
            </Alert>
          </CardContent></Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { toast.success('Rascunho salvo nesta sessão'); }}>Salvar rascunho</Button>
            <Button size="lg" onClick={() => setConfirmOpen(true)} disabled={!validation?.all_ok || publish.isPending}>
              <Rocket className="w-4 h-4 mr-2" /> Publicar
            </Button>
          </div>
        </div>
      )}

      {/* Navegação */}
      {draft && !published && (
        <div className="flex justify-between pt-4 border-t">
          <Button variant="ghost" onClick={() => goStep(Math.max(0, step - 1))} disabled={step === 0}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
          {step < 4 && (
            <Button onClick={() => goStep(Math.min(4, step + 1))}>
              Próximo <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar publicação</DialogTitle>
            <DialogDescription>
              Vou criar 1 campanha, 1 conjunto e {draft?.copies.length ?? 0} anúncios em <b>{selectedCredential?.account_name || selectedCredential?.ad_account_id}</b>. Tudo <b>pausado</b>.
              Depois você ativa dentro do Vendus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={handlePublish} disabled={publish.isPending}>
              {publish.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publicando…</> : 'Publicar agora'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
