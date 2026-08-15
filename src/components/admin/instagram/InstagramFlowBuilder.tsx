import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Loader2, Save, Rocket, Pause, Workflow, Zap, Activity, Settings as SettingsIcon,
  MessageCircle, MessageSquare, Heart, Reply, Sparkles, Trash2, ChevronUp, ChevronDown,
  Bot, Clock, Tag, GitBranch, Play, Wand2, PlayCircle, Repeat, UserPlus, RefreshCcw, AlertTriangle,
  Search, Copy, Plus, SlidersHorizontal, MousePointer2,
} from 'lucide-react';
import { useInstagramFlow, useUpdateInstagramFlow, useInstagramFlowRuns, type IGFlowBlock } from '@/hooks/useInstagramFlows';
import { useDryRunInstagramFlow, useGenerateInstagramTextVariationsAI, type FlowDryRunPlan } from '@/hooks/useInstagramFlowAI';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useCadences } from '@/hooks/useCadences';
import { useSectors } from '@/hooks/useSectors';
import { useAllAgents } from '@/hooks/useProductAgents';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AIFlowGeneratorDialog } from './AIFlowGeneratorDialog';
import { InstagramPostPicker } from './InstagramPostPicker';
import { useInstagramConnections } from '@/hooks/useInstagramConnections';
import { firstPublishError, validateInstagramFlowForPublish } from './flowValidation';

interface Props {
  flowId: string;
  onBack: () => void;
}

const RUN_STALE_AFTER_MINUTES = 10;

const TRIGGER_LABELS: Record<string, { label: string; help: string }> = {
  comment_keyword: { label: 'Comentário em publicação', help: 'Dispara em qualquer comentário ou somente nas palavras e publicações escolhidas.' },
  dm_keyword: { label: 'Palavra-chave no Direct', help: 'Dispara somente quando alguém envia uma mensagem privada no Direct.' },
  story_reply: { label: 'Resposta ou menção no Story', help: 'Dispara quando alguém responde ao seu Story ou menciona sua conta em um Story.' },
  message_reaction: { label: 'Reação a uma mensagem', help: 'Dispara quando alguém reage a uma mensagem enviada pela sua conta.' },
  mention: { label: 'Menção no Instagram', help: 'Dispara quando sua conta é mencionada.' },
  manual: { label: 'Disparo manual', help: 'Executado apenas por teste ou por outra automação.' },
};
const SOURCE_LABELS: Record<string, string> = { comment: 'Comentário', dm: 'Direct', story_reply: 'Story', message_reaction: 'Reação', mention: 'Menção', manual: 'Manual', manual_test: 'Teste' };
const STATUS_LABELS: Record<string, string> = { running: 'Em andamento', completed: 'Concluída', partial: 'Concluída com falhas', failed: 'Falhou', skipped: 'Ignorada' };

type BlockCategory = 'Mensagens' | 'Engajamento' | 'CRM' | 'Lógica';
type BlockCatalogItem = {
  type: string;
  label: string;
  icon: any;
  color: string;
  accent: string;
  description: string;
  category: BlockCategory;
};

const BLOCK_CATALOG: BlockCatalogItem[] = [
  { type: 'ig_reply_comment', label: 'Responder comentário', icon: Reply, color: 'text-pink-500', accent: 'from-pink-500 to-rose-500', description: 'Resposta pública no comentário.', category: 'Mensagens' },
  { type: 'ig_private_reply', label: 'Opening DM', icon: MessageCircle, color: 'text-purple-500', accent: 'from-violet-500 to-fuchsia-500', description: 'Primeira DM permitida após o comentário.', category: 'Mensagens' },
  { type: 'ig_send_dm', label: 'Mensagem no Direct', icon: MessageSquare, color: 'text-blue-500', accent: 'from-blue-500 to-cyan-500', description: 'Continua uma conversa já aberta.', category: 'Mensagens' },
  { type: 'ai_takeover', label: 'IA assume', icon: Bot, color: 'text-emerald-500', accent: 'from-emerald-500 to-teal-500', description: 'Passa a conversa para um agente de IA.', category: 'Mensagens' },
  { type: 'ig_like_comment', label: 'Curtir comentário', icon: Heart, color: 'text-red-500', accent: 'from-red-500 to-pink-500', description: 'Curte o comentário que iniciou o fluxo.', category: 'Engajamento' },
  { type: 'apply_tag', label: 'Aplicar etiqueta', icon: Tag, color: 'text-teal-500', accent: 'from-teal-500 to-cyan-500', description: 'Organiza o lead no CRM.', category: 'CRM' },
  { type: 'enroll_cadence', label: 'Inscrever em cadência', icon: Repeat, color: 'text-cyan-500', accent: 'from-cyan-500 to-sky-500', description: 'Inicia uma cadência de follow-up.', category: 'CRM' },
  { type: 'assign_lead', label: 'Atribuir lead', icon: UserPlus, color: 'text-orange-500', accent: 'from-orange-500 to-amber-500', description: 'Envia o lead a um setor ou vendedor.', category: 'CRM' },
  { type: 'wait', label: 'Aguardar', icon: Clock, color: 'text-amber-500', accent: 'from-amber-500 to-yellow-500', description: 'Pausa antes da próxima etapa.', category: 'Lógica' },
  { type: 'condition_text', label: 'Condição por texto', icon: GitBranch, color: 'text-indigo-500', accent: 'from-indigo-500 to-violet-500', description: 'Define o caminho conforme a mensagem.', category: 'Lógica' },
];

const BLOCK_CATEGORIES: BlockCategory[] = ['Mensagens', 'Engajamento', 'CRM', 'Lógica'];

function KeywordTagInput({
  value,
  onChange,
  placeholder = 'Digite uma palavra ou frase e pressione Enter',
}: {
  value: string[];
  onChange: (keywords: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  const addKeywords = (raw: string) => {
    const additions = raw
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (additions.length === 0) return;
    const next = [...value];
    for (const addition of additions) {
      if (!next.some((item) => item.toLocaleLowerCase('pt-BR') === addition.toLocaleLowerCase('pt-BR'))) {
        next.push(addition);
      }
    }
    onChange(next);
    setDraft('');
  };

  const removeKeyword = (index: number) => {
    onChange(value.filter((_, current) => current !== index));
  };

  return (
    <div className="rounded-md border border-input bg-background px-2.5 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((keyword, index) => (
            <Badge key={`${keyword}-${index}`} variant="secondary" className="gap-1 py-1 pl-2 pr-1 text-xs">
              {keyword}
              <button
                type="button"
                className="rounded-sm px-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => removeKeyword(index)}
                aria-label={`Remover ${keyword}`}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      <input
        className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          if (/[,;\n]/.test(next)) addKeywords(next);
          else setDraft(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            addKeywords(draft);
          } else if (event.key === 'Backspace' && !draft && value.length > 0) {
            removeKeyword(value.length - 1);
          }
        }}
        onBlur={() => addKeywords(draft)}
        placeholder={value.length === 0 ? placeholder : 'Adicionar outra…'}
      />
    </div>
  );
}

function blockSummary(block: IGFlowBlock): string {
  const data = block.data ?? {};
  if (block.type === 'ai_takeover') return data.agent_name ? `Agente: ${data.agent_name}` : 'Escolha um agente de IA';
  const text = String(data.text ?? data.prompt ?? '').trim();
  if (text) return text;
  if (block.type === 'wait') return `Aguardar ${data.seconds ?? 3} segundos`;
  if (block.type === 'apply_tag') return data.tag_name ? `Etiqueta: ${data.tag_name}` : 'Escolha uma etiqueta';
  if (block.type === 'enroll_cadence') return data.cadence_name ? `Cadência: ${data.cadence_name}` : 'Escolha uma cadência';
  if (block.type === 'assign_lead') return 'Defina o responsável pelo lead';
  if (block.type === 'condition_text') {
    const keywords = Array.isArray(data.keywords) ? data.keywords : [];
    return keywords.length ? `Se contiver: ${keywords.join(', ')}` : 'Defina as condições';
  }
  if (block.type === 'ig_like_comment') return 'Curtir o comentário recebido';
  return 'Configure esta etapa';
}

function newBlock(type: string): IGFlowBlock {
  const base: any = {
    id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    position: { x: 0, y: 0 },
    next_block_id: null,
  };
  if (type === 'wait') base.data = { seconds: 3 };
  else if (type === 'apply_tag') base.data = { tag_id: '' };
  else if (type === 'enroll_cadence') base.data = { cadence_id: '' };
  else if (type === 'assign_lead') base.data = { sector_id: '', user_id: '' };
  else if (type === 'condition_text') base.data = { keywords: [], match: 'any' };
  else if (type === 'ig_like_comment') base.data = {};
  else if (type === 'ig_private_reply') base.data = { text: '', buttons: [], quick_replies: [] };
  else if (type === 'ai_takeover') base.data = { agent_id: '', agent_name: '', prompt: '' };
  else base.data = { text: '' };
  return base as IGFlowBlock;
}

export function InstagramFlowBuilder({ flowId, onBack }: Props) {
  const { data: flow, isLoading, refetch } = useInstagramFlow(flowId);
  const update = useUpdateInstagramFlow();
  const qc = useQueryClient();

  const { data: runs } = useInstagramFlowRuns(flowId);
  const { data: connections = [] } = useInstagramConnections();
  const { data: tags } = useLeadTags();
  const { cadences } = useCadences();
  const { data: sectors } = useSectors();
  const { data: agents } = useAllAgents();
  const dryRun = useDryRunInstagramFlow();
  const [testing, setTesting] = useState(false);
  const [repairingRuns, setRepairingRuns] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerConfig, setTriggerConfig] = useState<any>({});
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<IGFlowBlock[]>([]);
  const [startBlockId, setStartBlockId] = useState<string | null>(null);
  const [throttleHours, setThrottleHours] = useState(24);
  const [dirty, setDirty] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [preview, setPreview] = useState<FlowDryRunPlan[] | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [blockSearch, setBlockSearch] = useState('');

  const failedRunCount = (runs ?? []).filter((run) => {
    const repairStatus = run.payload?.bulk_retry?.status;
    if (['waiting_interaction', 'resumed', 'resolved_warning'].includes(repairStatus)) return false;
    if (run.status === 'failed' || run.status === 'partial') return true;
    return run.status === 'running'
      && Date.now() - new Date(run.started_at).getTime() > RUN_STALE_AFTER_MINUTES * 60 * 1000;
  }).length;

  const repairFailedRuns = async () => {
    setRepairingRuns(true);
    try {
      const { data, error } = await supabase.functions.invoke('ig-flow-executor', {
        body: { action: 'repair_failed_runs', flow_id: flowId, limit: 100 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const waiting = Number(data?.waiting_interaction ?? 0);
      const resumed = Number(data?.resumed ?? 0);
      const resolved = Number(data?.resolved_warning ?? 0);
      const skipped = Number(data?.skipped ?? 0);
      const errors = Array.isArray(data?.errors) ? data.errors.length : 0;
      toast.success(
        `${waiting + resumed + resolved} execução(ões) tratada(s): ${resumed} retomada(s), ${waiting} aguardando resposta${resolved ? `, ${resolved} aviso(s) normalizado(s)` : ''}.`,
      );
      if (skipped || errors) {
        toast.info(`${skipped} sem reprocessamento seguro${errors ? ` e ${errors} com erro` : ''}.`);
      }
      await qc.invalidateQueries({ queryKey: ['instagram-flow-runs', flowId] });
    } catch (repairError: any) {
      toast.error(repairError?.message ?? 'Não foi possível reprocessar as execuções.');
    } finally {
      setRepairingRuns(false);
    }
  };

  useEffect(() => {
    if (!flow) return;
    setName(flow.name);
    setDescription(flow.description ?? '');
    setTriggerConfig(flow.trigger_config ?? {});
    setConnectionId(flow.connection_id ?? null);
    setBlocks(flow.flow_blocks ?? []);
    setStartBlockId(flow.start_block_id);
    setThrottleHours(flow.throttle_per_sender_hours);
    setSelectedBlockId((current) => (
      current && flow.flow_blocks?.some((block) => block.id === current)
        ? current
        : flow.flow_blocks?.[0]?.id ?? null
    ));
    setDirty(false);
  }, [flow?.id, flow?.updated_at]);

  const rewireChain = (list: IGFlowBlock[]): IGFlowBlock[] =>
    list.map((b, i) => ({ ...b, next_block_id: list[i + 1]?.id ?? null }));

  const addBlock = (type: string) => {
    if (flow?.trigger_type === 'comment_keyword' && ['ig_send_dm', 'message', 'text'].includes(type)) {
      const openingDm = blocks.find((block) => block.type === 'ig_private_reply');
      if (openingDm) {
        const legacyButton = Array.isArray(openingDm.data?.buttons) ? openingDm.data.buttons[0] : null;
        const legacyUrl = String(legacyButton?.url ?? '').trim();
        const continuationPayload = `VENDUS_CONTINUE:${flow.id}:${openingDm.id}`;
        const directMessage = newBlock(type);
        directMessage.data = {
          ...directMessage.data,
          text: legacyUrl ? `Aqui está o link que você pediu 👇\n${legacyUrl}` : '',
        };
        const next = blocks.map((block) => block.id === openingDm.id ? {
          ...block,
          data: {
            ...(block.data ?? {}),
            buttons: [],
            quick_replies: [{
              title: String(legacyButton?.title ?? 'Quero receber').slice(0, 20),
              payload: continuationPayload,
            }],
          },
        } : block);
        const rewired = rewireChain([...next, directMessage]);
        setBlocks(rewired);
        setSelectedBlockId(directMessage.id);
        setDirty(true);
        toast.success(legacyUrl
          ? 'Link movido para a próxima DM. Ela será enviada quando a pessoa tocar no botão.'
          : 'Continuação criada. Preencha a mensagem que será enviada após o clique.');
        return;
      }
      const opening = newBlock('ig_private_reply');
      opening.data = {
        ...opening.data,
        text: 'Posso te enviar o conteúdo por aqui?',
        quick_replies: [{
          title: 'Quero receber',
          payload: `VENDUS_CONTINUE:${flow.id}:${opening.id}`,
        }],
      };
      const directMessage = newBlock(type);
      const rewired = rewireChain([...blocks, opening, directMessage]);
      setBlocks(rewired);
      if (blocks.length === 0) setStartBlockId(opening.id);
      setSelectedBlockId(directMessage.id);
      setDirty(true);
      toast.success('Opening DM e continuação criadas. A próxima mensagem sairá após a pessoa interagir.');
      return;
    }
    const nb = newBlock(type);
    setBlocks(prev => rewireChain([...prev, nb]));
    if (blocks.length === 0) setStartBlockId(nb.id);
    setSelectedBlockId(nb.id);
    setDirty(true);
  };

  const fixCommentFollowup = () => {
    const blockedTypes = new Set(['ig_send_dm', 'message', 'text']);
    const followups = blocks.filter((block) => blockedTypes.has(block.type));
    if (followups.length === 0) return;

    const currentOpening = blocks.find((block) => block.type === 'ig_private_reply');
    const opening = currentOpening ?? newBlock('ig_private_reply');
    const openingText = String(opening.data?.text ?? '').trim();
    const followupTexts = followups
      .map((block) => String(block.data?.text ?? block.data?.content ?? '').trim())
      .filter(Boolean);
    const firstUrl = followupTexts
      .map((text) => text.match(/https:\/\/[^\s]+/i)?.[0]?.replace(/[),.;!?]+$/, '') ?? '')
      .find(Boolean) ?? '';
    const extraCopy = followupTexts
      .map((text) => text.replace(/https:\/\/[^\s]+/ig, '').trim())
      .filter((text) => text && text !== openingText);
    const mergedText = [openingText, ...extraCopy].filter(Boolean).join('\n\n');
    const existingButtons = Array.isArray(opening.data?.buttons) ? opening.data.buttons : [];
    const mergedOpening: IGFlowBlock = {
      ...opening,
      data: {
        ...(opening.data ?? {}),
        text: mergedText,
        buttons: existingButtons.length > 0 || !firstUrl
          ? existingButtons
          : [{ type: 'web_url', title: 'Acessar link', url: firstUrl }],
      },
    };

    let next = blocks.filter((block) => !blockedTypes.has(block.type));
    if (currentOpening) {
      next = next.map((block) => block.id === currentOpening.id ? mergedOpening : block);
    } else {
      const firstFollowupIndex = blocks.findIndex((block) => blockedTypes.has(block.type));
      next.splice(Math.max(0, firstFollowupIndex), 0, mergedOpening);
    }
    const rewired = rewireChain(next);
    setBlocks(rewired);
    setStartBlockId(rewired[0]?.id ?? null);
    setSelectedBlockId(mergedOpening.id);
    setDirty(true);
    toast.success(firstUrl
      ? 'Link movido para o botão da Opening DM.'
      : 'Mensagem movida para a Opening DM. Agora cole a URL no campo do botão.');
  };
  const removeBlock = (id: string) => {
    setBlocks(prev => {
      const next = rewireChain(prev.filter(b => b.id !== id));
      if (startBlockId === id) setStartBlockId(next[0]?.id ?? null);
      return next;
    });
    setSelectedBlockId((current) => {
      if (current !== id) return current;
      const index = blocks.findIndex((block) => block.id === id);
      return blocks[index + 1]?.id ?? blocks[index - 1]?.id ?? null;
    });
    setDirty(true);
  };
  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      const rewired = rewireChain(copy);
      setStartBlockId(rewired[0]?.id ?? null);
      return rewired;
    });
    setDirty(true);
  };
  const duplicateBlock = (id: string) => {
    setBlocks(prev => {
      const index = prev.findIndex((block) => block.id === id);
      if (index < 0) return prev;
      const copy: IGFlowBlock = {
        ...prev[index],
        id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        data: { ...(prev[index].data ?? {}) },
        next_block_id: null,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      setSelectedBlockId(copy.id);
      return rewireChain(next);
    });
    setDirty(true);
  };
  const updateBlockData = (id: string, data: any) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, data: { ...b.data, ...data } } : b));
    setDirty(true);
  };

  const handleSave = async () => {
    if (flow?.status === 'active') {
      const selectedConnection = connections.find((connection) => connection.id === connectionId);
      const issue = firstPublishError(validateInstagramFlowForPublish({
        triggerType: flow.trigger_type,
        connectionId,
        connectionStatus: selectedConnection?.status,
        blocks,
        startBlockId: startBlockId ?? blocks[0]?.id ?? null,
      }));
      if (issue) {
        toast.error(`Fluxo ativo não salvo: ${issue.message}`, { duration: 7000 });
        return;
      }
    }
    await update.mutateAsync({
      id: flowId,
      name, description: description || null,
      connection_id: connectionId,
      trigger_config: triggerConfig,
      flow_blocks: blocks,
      start_block_id: startBlockId ?? blocks[0]?.id ?? null,
      throttle_per_sender_hours: throttleHours,
    } as any);
    setDirty(false);
    toast.success('Fluxo salvo');
  };

  const handlePublish = async () => {
    const selectedConnection = connections.find((connection) => connection.id === connectionId);
    const issues = validateInstagramFlowForPublish({
      triggerType: flow.trigger_type,
      connectionId,
      connectionStatus: selectedConnection?.status,
      blocks,
      startBlockId: startBlockId ?? blocks[0]?.id ?? null,
    });
    const error = firstPublishError(issues);
    if (error) {
      toast.error(error.message, { duration: 7000 });
      return;
    }
    if (dirty) await handleSave();
    await update.mutateAsync({ id: flowId, status: 'active' } as any);
    toast.success('Automação publicada!');
  };
  const handlePause = async () => {
    await update.mutateAsync({ id: flowId, status: 'paused' } as any);
  };

  const runPreview = async () => {
    if (dirty) { await handleSave(); }
    const res = await dryRun.mutateAsync({ flow_id: flowId, trigger_text: previewText });
    setPreview(res.plan ?? []);
  };

  if (isLoading || !flow) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const selectedConnection = connections.find((connection) => connection.id === connectionId);
  const publishIssues = validateInstagramFlowForPublish({
    triggerType: flow.trigger_type,
    connectionId,
    connectionStatus: selectedConnection?.status,
    blocks,
    startBlockId: startBlockId ?? blocks[0]?.id ?? null,
  });
  const publishErrors = publishIssues.filter((issue) => issue.severity === 'error');
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;
  const selectedBlockIndex = selectedBlock ? blocks.findIndex((block) => block.id === selectedBlock.id) : -1;
  const normalizedBlockSearch = blockSearch.trim().toLocaleLowerCase('pt-BR');
  const visibleCatalog = normalizedBlockSearch
    ? BLOCK_CATALOG.filter((item) => (
        item.label.toLocaleLowerCase('pt-BR').includes(normalizedBlockSearch)
        || item.description.toLocaleLowerCase('pt-BR').includes(normalizedBlockSearch)
      ))
    : BLOCK_CATALOG;

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col gap-3 border-b pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold truncate">{name || 'Sem nome'}</h1>
              <Badge variant={flow.status === 'active' ? 'default' : 'secondary'}>
                {flow.status === 'active' ? 'Ativo' : flow.status === 'paused' ? 'Pausado' : 'Rascunho'}
              </Badge>
              {selectedConnection && (
                <Badge variant="outline">@{selectedConnection.ig_username ?? selectedConnection.display_name}</Badge>
              )}
              {dirty && <Badge variant="outline" className="text-amber-600 border-amber-500">Não salvo</Badge>}
            </div>
            <p className="text-sm text-muted-foreground truncate">{description || 'Automação do Instagram'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Button variant="outline" onClick={() => setAiOpen(true)} className="gap-2">
            <Wand2 className="h-4 w-4 text-purple-500" /> <span className="hidden sm:inline">Refinar com IA</span><span className="sm:hidden">IA</span>
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={!dirty || update.isPending} className="gap-2">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
          {flow.status === 'active' ? (
            <Button variant="outline" onClick={handlePause} className="gap-2"><Pause className="h-4 w-4" /> Pausar</Button>
          ) : (
            <Button onClick={handlePublish} className="gap-2"><Rocket className="h-4 w-4" /> Publicar</Button>
          )}
        </div>
      </div>

      {publishErrors.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Revise {publishErrors.length} item{publishErrors.length === 1 ? '' : 'ns'} antes de publicar
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800 dark:text-amber-200">
                {publishErrors.slice(0, 3).map((issue) => (
                  <li key={`${issue.code}-${issue.blockId ?? ''}`}>• {issue.message}</li>
                ))}
              </ul>
              {publishErrors.some((issue) => issue.code === 'followup_before_optin') && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-8 border-amber-500/50 bg-background text-xs"
                  onClick={fixCommentFollowup}
                >
                  Corrigir e entregar o link na Opening DM
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="flow" className="flex-1 flex flex-col mt-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="flow" className="gap-2"><Workflow className="h-4 w-4" /><span className="hidden sm:inline">Fluxo</span></TabsTrigger>
          <TabsTrigger value="trigger" className="gap-2"><Zap className="h-4 w-4" /><span className="hidden sm:inline">Gatilho</span></TabsTrigger>
          <TabsTrigger value="preview" className="gap-2"><PlayCircle className="h-4 w-4" /><span className="hidden sm:inline">Preview</span></TabsTrigger>
          <TabsTrigger value="runs" className="gap-2"><Activity className="h-4 w-4" /><span className="hidden sm:inline">Execuções</span></TabsTrigger>
          <TabsTrigger value="settings" className="gap-2"><SettingsIcon className="h-4 w-4" /><span className="hidden sm:inline">Config</span></TabsTrigger>
        </TabsList>

        {/* FLUXO */}
        <TabsContent value="flow" className="flex-1 mt-4">
          {flow.trigger_type !== 'comment_keyword' && blocks.some(b => ['ig_like_comment', 'ig_reply_comment', 'ig_private_reply'].includes(b.type)) && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Este fluxo usa ações de comentário, mas escuta o Direct. Use o gatilho <strong>Palavra-chave em comentário</strong> para poder publicá-lo.</span>
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="grid min-h-[660px] lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(430px,1fr)_360px]">
              {/* Biblioteca de blocos */}
              <aside className="border-b bg-muted/20 lg:border-b-0 lg:border-r">
                <div className="sticky top-0 space-y-4 p-4">
                  <div>
                    <p className="text-sm font-semibold">Blocos</p>
                    <p className="text-xs text-muted-foreground">Clique para adicionar ao final do fluxo.</p>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={blockSearch}
                      onChange={(event) => setBlockSearch(event.target.value)}
                      placeholder="Buscar bloco..."
                      className="h-9 bg-background pl-9 text-sm"
                    />
                  </div>

                  <div className="max-h-[545px] space-y-5 overflow-y-auto pr-1">
                    {BLOCK_CATEGORIES.map((category) => {
                      const items = visibleCatalog.filter((item) => item.category === category);
                      if (items.length === 0) return null;
                      return (
                        <div key={category} className="space-y-1.5">
                          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {category}
                          </p>
                          {items.map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.type}
                                type="button"
                                onClick={() => addBlock(item.type)}
                                className="group flex w-full items-start gap-2.5 rounded-xl border border-transparent bg-background/60 p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-background hover:shadow-sm"
                              >
                                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.accent} text-white shadow-sm`}>
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-xs font-semibold">{item.label}</span>
                                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{item.description}</span>
                                </span>
                                <Plus className="ml-auto mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                    {visibleCatalog.length === 0 && (
                      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Nenhum bloco encontrado.
                      </p>
                    )}
                  </div>
                </div>
              </aside>

              {/* Canvas */}
              <section className="relative min-h-[660px] overflow-hidden bg-slate-50/80 dark:bg-slate-950/50">
                <div
                  className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-25"
                  style={{
                    backgroundImage: 'radial-gradient(circle, hsl(var(--muted-foreground) / 0.35) 1px, transparent 1px)',
                    backgroundSize: '22px 22px',
                  }}
                />
                <div className="relative flex items-center justify-between gap-3 border-b bg-background/85 px-4 py-3 backdrop-blur">
                  <div>
                    <p className="text-sm font-semibold">Canvas do fluxo</p>
                    <p className="text-xs text-muted-foreground">
                      {blocks.length} etapa{blocks.length === 1 ? '' : 's'} · execução de cima para baixo
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1.5 bg-background">
                      <Zap className="h-3 w-3 text-amber-500" />
                      {TRIGGER_LABELS[flow.trigger_type]?.label ?? flow.trigger_type}
                    </Badge>
                    <Button variant="outline" size="sm" className="hidden gap-2 sm:flex" onClick={() => setAiOpen(true)}>
                      <Sparkles className="h-3.5 w-3.5 text-purple-500" /> Montar com IA
                    </Button>
                  </div>
                </div>

                <div className="relative max-h-[600px] overflow-y-auto px-4 py-8 sm:px-8">
                  {blocks.length === 0 ? (
                    <div className="mx-auto mt-20 max-w-sm rounded-2xl border border-dashed bg-background/90 p-8 text-center shadow-sm">
                      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Workflow className="h-6 w-6" />
                      </span>
                      <p className="mt-4 font-semibold">Seu canvas está vazio</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Adicione um bloco pela biblioteca ou deixe a IA montar a primeira versão.
                      </p>
                      <Button onClick={() => setAiOpen(true)} className="mt-5 gap-2">
                        <Sparkles className="h-4 w-4" /> Gerar fluxo com IA
                      </Button>
                    </div>
                  ) : (
                    <ol className="mx-auto max-w-xl">
                      {blocks.map((block, index) => {
                        const meta = BLOCK_CATALOG.find((item) => item.type === block.type);
                        const Icon = meta?.icon ?? MessageSquare;
                        const selected = selectedBlockId === block.id;
                        const blockIssues = publishIssues.filter((issue) => issue.blockId === block.id && issue.severity === 'error');
                        return (
                          <li key={block.id} className="relative flex justify-center pb-10 last:pb-2">
                            {index < blocks.length - 1 && (
                              <div className="absolute bottom-0 left-1/2 top-[72px] w-px -translate-x-1/2 bg-gradient-to-b from-primary/60 to-border" />
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedBlockId(block.id)}
                              className={`group relative z-10 w-full max-w-md overflow-hidden rounded-2xl border bg-background text-left shadow-sm transition-all ${
                                selected
                                  ? 'border-primary ring-4 ring-primary/10 shadow-lg'
                                  : 'hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md'
                              }`}
                            >
                              <span className={`absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b ${meta?.accent ?? 'from-slate-500 to-slate-600'}`} />
                              <span className="flex items-center gap-3 px-4 py-3.5 pl-5">
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${meta?.accent ?? 'from-slate-500 to-slate-600'} text-white shadow-sm`}>
                                  <Icon className="h-5 w-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Etapa {index + 1}</span>
                                    {index === 0 && <Badge className="h-4 px-1.5 text-[9px]">Início</Badge>}
                                    {blockIssues.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                                  </span>
                                  <span className="mt-0.5 block text-sm font-semibold">{meta?.label ?? block.type}</span>
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{blockSummary(block)}</span>
                                </span>
                                <SlidersHorizontal className={`h-4 w-4 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground opacity-0 group-hover:opacity-100'}`} />
                              </span>
                            </button>
                            {index < blocks.length - 1 && (
                              <span className="absolute bottom-[18px] left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm">
                                <ChevronDown className="h-3 w-3" />
                              </span>
                            )}
                          </li>
                        );
                      })}
                      <li className="flex justify-center pt-2">
                        <span className="flex items-center gap-2 rounded-full border border-dashed bg-background/80 px-4 py-2 text-xs font-medium text-muted-foreground">
                          <Plus className="h-3.5 w-3.5" /> Continue pela biblioteca de blocos
                        </span>
                      </li>
                    </ol>
                  )}
                </div>
              </section>

              {/* Propriedades */}
              <aside className="border-t bg-background lg:col-span-2 xl:col-span-1 xl:border-l xl:border-t-0">
                <div className="sticky top-0">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold">Propriedades</p>
                      <p className="text-xs text-muted-foreground">Configure a etapa selecionada.</p>
                    </div>
                    <MousePointer2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {selectedBlock ? (
                    <div className="max-h-[600px] overflow-y-auto">
                      <div className="border-b bg-muted/15 px-4 py-3">
                        <div className="flex items-center gap-3">
                          {(() => {
                            const meta = BLOCK_CATALOG.find((item) => item.type === selectedBlock.type);
                            const Icon = meta?.icon ?? MessageSquare;
                            return (
                              <>
                                <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${meta?.accent ?? 'from-slate-500 to-slate-600'} text-white`}>
                                  <Icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">{meta?.label ?? selectedBlock.type}</p>
                                  <p className="text-xs text-muted-foreground">Etapa {selectedBlockIndex + 1} de {blocks.length}</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        <div className="mt-3 flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-8 flex-1 gap-1.5 text-xs" disabled={selectedBlockIndex === 0} onClick={() => moveBlock(selectedBlock.id, -1)}>
                            <ChevronUp className="h-3.5 w-3.5" /> Subir
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 flex-1 gap-1.5 text-xs" disabled={selectedBlockIndex === blocks.length - 1} onClick={() => moveBlock(selectedBlock.id, 1)}>
                            <ChevronDown className="h-3.5 w-3.5" /> Descer
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => duplicateBlock(selectedBlock.id)} title="Duplicar">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeBlock(selectedBlock.id)} title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-4">
                        <BlockEditor
                          flowId={flow.id}
                          block={selectedBlock}
                          tags={tags ?? []}
                          cadences={cadences ?? []}
                          sectors={sectors ?? []}
                          agents={agents ?? []}
                          onChange={(data) => updateBlockData(selectedBlock.id, data)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center text-muted-foreground">
                      <MousePointer2 className="h-8 w-8" />
                      <p className="mt-3 text-sm font-medium text-foreground">Selecione uma etapa</p>
                      <p className="mt-1 text-xs">Clique em um bloco no canvas para editar sua mensagem e configurações.</p>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </TabsContent>

        {/* GATILHO */}
        <TabsContent value="trigger" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4 max-w-3xl">
              <div className="space-y-1.5">
                <Label>Conta do Instagram</Label>
                <Select
                  value={connectionId ?? ''}
                  onValueChange={(value) => {
                    setConnectionId(value);
                    setTriggerConfig({ ...triggerConfig, post_ids: [] });
                    setDirty(true);
                  }}
                >
                  <SelectTrigger className="max-w-md"><SelectValue placeholder="Escolha uma conta" /></SelectTrigger>
                  <SelectContent>
                    {connections.filter((connection) => ['active', 'partial'].includes(connection.status)).map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        @{connection.ig_username ?? connection.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ao trocar a conta, os posts selecionados são limpos para evitar IDs de outro perfil.
                </p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Tipo do gatilho</p>
                <p className="font-medium">{TRIGGER_LABELS[flow.trigger_type]?.label ?? flow.trigger_type}</p>
                <p className="mt-1 text-xs text-muted-foreground">{TRIGGER_LABELS[flow.trigger_type]?.help}</p>
              </div>

              {(flow.trigger_type === 'comment_keyword' || flow.trigger_type === 'dm_keyword' || flow.trigger_type === 'story_reply') && (
                <>
                  <div className="space-y-1.5">
                    <Label>Palavras ou frases que iniciam o fluxo</Label>
                    <KeywordTagInput
                      value={triggerConfig.keywords ?? []}
                      onChange={(keywords) => {
                        setTriggerConfig({ ...triggerConfig, keywords });
                        setDirty(true);
                      }}
                      placeholder="Ex.: código, quero saber mais, me envia"
                    />
                    <p className="text-xs text-muted-foreground">Digite uma palavra ou frase e pressione Enter ou vírgula. Você pode adicionar quantas precisar.</p>
                    <p className="text-xs text-muted-foreground">
                      Vazio + modo <em>"Contém alguma"</em> = qualquer comentário/DM dispara.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Modo de correspondência</Label>
                    <Select value={triggerConfig.match ?? 'any'} onValueChange={(v) => { setTriggerConfig({ ...triggerConfig, match: v }); setDirty(true); }}>
                      <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Contém alguma palavra (recomendado, estilo ManyChat)</SelectItem>
                        <SelectItem value="all">Contém todas as palavras</SelectItem>
                        <SelectItem value="exact">Texto exato (raramente dispara)</SelectItem>
                        <SelectItem value="regex">Expressão regular (avançado)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {((triggerConfig.keywords ?? []).length === 0 && (triggerConfig.match ?? 'any') === 'exact') && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
                      <Zap className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        <strong>Este fluxo nunca vai disparar:</strong> não há palavras-chave e o modo é <em>Texto exato</em>. Adicione palavras ou mude para <em>"Contém alguma"</em>.
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Switch id="cs" checked={!!triggerConfig.case_sensitive} onCheckedChange={(v) => { setTriggerConfig({ ...triggerConfig, case_sensitive: v }); setDirty(true); }} />
                    <Label htmlFor="cs">Diferenciar maiúsculas/minúsculas</Label>
                  </div>
                </>
              )}

              {flow.trigger_type === 'comment_keyword' && (
                <div className="space-y-2">
                  <Label>Posts alvo (opcional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Vazio = responde em <strong>qualquer post/reel</strong>. Selecione posts específicos para restringir (estilo ManyChat).
                  </p>
                  <InstagramPostPicker
                    connectionId={connectionId}
                    selectedIds={triggerConfig.post_ids ?? []}
                    onChange={(ids) => { setTriggerConfig({ ...triggerConfig, post_ids: ids }); setDirty(true); }}
                  />
                </div>
              )}
              {flow.trigger_type === 'message_reaction' && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <div className="space-y-1.5">
                    <Label>Quando disparar</Label>
                    <Select
                      value={triggerConfig.reaction_action ?? 'react'}
                      onValueChange={(value) => {
                        setTriggerConfig({ ...triggerConfig, reaction_action: value });
                        setDirty(true);
                      }}
                    >
                      <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="react">Quando adicionar uma reação</SelectItem>
                        <SelectItem value="unreact">Quando remover uma reação</SelectItem>
                        <SelectItem value="any">Adicionar ou remover</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Emoji (opcional)</Label>
                    <Input
                      className="max-w-md"
                      value={triggerConfig.emoji ?? ''}
                      onChange={(event) => {
                        setTriggerConfig({ ...triggerConfig, emoji: event.target.value.trim() });
                        setDirty(true);
                      }}
                      placeholder="Ex: ❤️ — vazio aceita qualquer reação"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A Meta informa a reação e a mensagem reagida. O Vendus registra esses dados no histórico da execução.
                  </p>
                </div>
              )}
              {flow.trigger_type === 'manual' && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm font-medium">Disparo manual</p>
                  <p className="text-xs text-muted-foreground">Este fluxo só roda quando você clicar em testar aqui ou for chamado por outra automação.</p>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={testing || blocks.length === 0}
                    onClick={async () => {
                      if (dirty) await handleSave();
                      setTesting(true);
                      try {
                        const { data, error } = await supabase.functions.invoke('ig-flow-executor', {
                          body: { flow_id: flowId, trigger_source: 'manual_test', dry_run: false },
                        });
                        if (error) throw error;
                        toast.success(`Executado: ${(data as any)?.executed?.length ?? 0} bloco(s)`);
                      } catch (e: any) {
                        toast.error(e?.message ?? 'Erro ao testar');
                      } finally { setTesting(false); }
                    }}
                  >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Testar agora
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        {/* PREVIEW */}
        <TabsContent value="preview" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4 max-w-3xl">
              <div>
                <p className="text-sm font-medium">Simule o gatilho</p>
                <p className="text-xs text-muted-foreground">Digite o comentário/DM/reply de teste. Nenhuma mensagem é enviada de verdade.</p>
              </div>
              <div className="flex items-center gap-2">
                <Input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Ex: quero saber o preço" />
                <Button onClick={runPreview} disabled={dryRun.isPending} className="gap-2 shrink-0">
                  {dryRun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Executar
                </Button>
              </div>

              {preview && (
                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground uppercase font-medium">Plano de execução</p>
                  {preview.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum bloco seria executado.</p>
                  ) : (
                    <ol className="space-y-2">
                      {preview.map((p, i) => {
                        const meta = BLOCK_CATALOG.find(c => c.type === p.type);
                        const Icon = meta?.icon ?? MessageSquare;
                        return (
                          <li key={p.block_id} className="rounded-lg border bg-card p-3 flex items-start gap-3">
                            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</div>
                            <Icon className={`h-4 w-4 mt-0.5 ${meta?.color}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{p.action}</p>
                              {p.preview && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.preview}</p>}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXECUÇÕES */}
        <TabsContent value="runs" className="mt-4">
          <Card>
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-medium">Histórico de execuções</p>
                <p className="text-xs text-muted-foreground">Veja cada ação executada e onde uma falha ocorreu.</p>
              </div>
              <div className="flex items-center gap-2">
                {failedRunCount > 0 && (
                  <Button size="sm" className="gap-2" onClick={repairFailedRuns} disabled={repairingRuns}>
                    {repairingRuns
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCcw className="h-3.5 w-3.5" />}
                    Reprocessar falhas ({failedRunCount})
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-2" onClick={() => qc.invalidateQueries({ queryKey: ['instagram-flow-runs', flowId] })}>
                  <RefreshCcw className="h-3.5 w-3.5" /> Atualizar
                </Button>
              </div>
            </div>
            <CardContent className="p-0">
              {!runs || runs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2" />
                  <p>Nenhuma execução ainda.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {runs.map(r => {
                    const payload: any = r.payload ?? {};
                    const steps: any[] = Array.isArray(payload.step_results) ? payload.step_results : [];
                    const isSkipped = (r.status as string) === 'skipped';
                    const isRunning = (r.status as string) === 'running';
                    const isStaleRunning = isRunning && !r.finished_at && Date.now() - new Date(r.started_at).getTime() > RUN_STALE_AFTER_MINUTES * 60 * 1000;
                    const repairStatus = payload.bulk_retry?.status;
                    const statusVariant = r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : (r.status as string) === 'partial' ? 'secondary' : 'outline';
                    const statusLabel = repairStatus === 'waiting_interaction'
                      ? 'Aguardando resposta'
                      : repairStatus === 'resumed'
                        ? 'Reprocessada'
                        : repairStatus === 'resolved_warning'
                          ? 'Concluída'
                          : isStaleRunning ? 'Interrompida' : (STATUS_LABELS[r.status] ?? r.status);
                    const skipMsg = isSkipped && payload.skip_reason === 'throttled_by_sender'
                      ? `Ignorado por throttle interno: este usuário já disparou o fluxo nas últimas ${payload.throttle_hours ?? '?'}h.`
                      : null;
                    const nextAllowedAt: string | null = payload.next_allowed_at ?? null;
                    const senderId: string | null = r.sender_ig_id ?? null;
                    const releaseSender = async () => {
                      if (!senderId) return;
                      const { error } = await supabase
                        .from('instagram_flow_runs')
                        .delete()
                        .eq('flow_id', flowId)
                        .eq('sender_ig_id', senderId)
                        .in('status', ['completed', 'partial', 'running', 'skipped']);
                      if (error) { toast.error(error.message); return; }
                      toast.success('Remetente liberado. Ele poderá disparar o fluxo de novo.');
                      qc.invalidateQueries({ queryKey: ['instagram-flow-runs', flowId] });
                    };

                    return (
                      <details key={r.id} className="group p-3 text-sm">
                        <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                          <div className="flex items-center gap-3 min-w-0">
                            <Badge variant={statusVariant as any}>{statusLabel}</Badge>
                            <span className="text-muted-foreground shrink-0">{SOURCE_LABELS[r.trigger_source] ?? r.trigger_source}</span>
                            <span className="truncate">{payload.trigger_text ?? r.source_id ?? '—'}</span>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </summary>
                        {(steps.length > 0 || r.error || skipMsg || isStaleRunning) && (
                          <div className="mt-3 space-y-1.5 pl-2 border-l-2 border-muted">
                            {isStaleRunning && (
                              <div className="text-xs text-amber-600">Execução antiga sem conclusão registrada. Um bloco travou ou a função foi interrompida antes de finalizar.</div>
                            )}
                            {skipMsg && (
                              <div className="text-xs space-y-1.5">
                                <p className="text-muted-foreground">{skipMsg}</p>
                                {nextAllowedAt && (
                                  <p className="text-muted-foreground">
                                    Próximo disparo liberado {formatDistanceToNow(new Date(nextAllowedAt), { addSuffix: true, locale: ptBR })}.
                                  </p>
                                )}
                                {senderId && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={releaseSender}>
                                    Liberar este remetente agora
                                  </Button>
                                )}
                              </div>
                            )}
                            {r.error && !isSkipped && (
                              <div className="text-xs text-destructive"><b>Erro geral:</b> {r.error}</div>
                            )}
                            {repairStatus === 'waiting_interaction' && (
                              <div className="text-xs text-amber-600">
                                Continuação preparada. A próxima mensagem será enviada quando o lead responder ou tocar no botão da Opening DM.
                              </div>
                            )}
                            {repairStatus === 'resumed' && (
                              <div className="text-xs text-emerald-600">Execução retomada em segurança a partir da etapa que falhou.</div>
                            )}
                            {r.finished_at && (
                              <div className="text-xs text-muted-foreground">Duração total: {Math.max(0, Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000))}s</div>
                            )}

                            {steps.map((s, i) => {
                              const meta = BLOCK_CATALOG.find(c => c.type === s.type);
                              return (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <span className={s.ok ? 'text-emerald-500' : 'text-destructive'}>
                                  {s.ok ? '✓' : '✗'}
                                </span>
                                <span className="text-muted-foreground shrink-0">{meta?.label ?? s.type}</span>
                                {typeof s.duration_ms === 'number' && <span className="text-muted-foreground">({Math.round(s.duration_ms / 1000)}s)</span>}
                                {s.error && <span className="text-destructive break-all">— {s.error}</span>}
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </details>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONFIG */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4 max-w-2xl">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea rows={3} value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Throttle por remetente — proteção anti-spam interna</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} max={720} value={throttleHours}
                    onChange={(e) => { setThrottleHours(Number(e.target.value) || 0); setDirty(true); }} className="max-w-[120px]" />
                  <span className="text-xs text-muted-foreground">horas</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Impede que o <strong>mesmo usuário do Instagram</strong> dispare este fluxo repetidas vezes dentro do intervalo.
                  Isso <strong>não é uma regra da Meta</strong>, é uma trava nossa. Use <code>0</code> para desativar.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-xs">
                <p className="font-semibold text-sm">O que a Meta realmente restringe</p>
                <ul className="space-y-1 text-muted-foreground list-disc pl-4">
                  <li><strong>Private reply</strong> a comentário: só 1× por comentário, dentro de 7 dias. <em>(Instagram Platform → Send a Private Reply to a Commenter)</em></li>
                  <li><strong>Responder comentário público</strong> (<code>POST /&lt;IG_COMMENT_ID&gt;/replies</code>): sem janela de 24h, só rate limits normais da Graph API.</li>
                  <li><strong>DM padrão fora de private reply</strong>: janela de 24h de mensageria — só vale para responder um DM que o usuário enviou primeiro.</li>
                  <li><strong>Curtir comentário</strong> (<code>POST /&lt;IG_USER_ID&gt;/likes?comment_id=…</code>): sem janela; exige permissão <code>instagram_manage_engagement</code>.</li>
                </ul>
                <p className="text-muted-foreground pt-1">Nenhuma dessas APIs impõe "1 automação por usuário a cada 24h" — esse limite é 100% nosso.</p>
              </div>

            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AIFlowGeneratorDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        connectionId={connectionId}
        connections={connections}
        existingFlowId={flowId}
        onGenerated={() => { setAiOpen(false); refetch(); toast.success('Fluxo atualizado pela IA!'); }}
      />
    </div>
  );
}

function BlockEditor({ flowId, block, tags, cadences, sectors, agents, onChange }: { flowId: string; block: IGFlowBlock; tags: any[]; cadences: any[]; sectors: any[]; agents: any[]; onChange: (d: any) => void }) {
  const d = block.data ?? {};
  const generateVariations = useGenerateInstagramTextVariationsAI();
  if (block.type === 'ig_reply_comment') {
    const variations: string[] = Array.isArray(d.variations) ? d.variations.map(String) : [];
    const addVariation = () => {
      if (variations.length >= 9) return;
      onChange({ variations: [...variations, ''] });
    };
    const updateVariation = (index: number, text: string) => {
      const next = [...variations];
      next[index] = text;
      onChange({ variations: next });
    };
    const removeVariation = (index: number) => {
      onChange({ variations: variations.filter((_, current) => current !== index) });
    };
    const varyWithAI = async () => {
      const baseText = String(d.text ?? '').trim();
      if (!baseText) {
        toast.error('Escreva a resposta principal antes de criar variações.');
        return;
      }
      try {
        const result = await generateVariations.mutateAsync({
          base_text: baseText,
          count: 3,
          context: 'public_comment',
        });
        const unique = Array.from(new Set([
          ...variations.map((item) => item.trim()).filter(Boolean),
          ...(result.variations ?? []).map((item) => item.trim()).filter(Boolean),
        ])).filter((item) => item !== baseText).slice(0, 9);
        onChange({ variations: unique });
        toast.success(`${unique.length} variações prontas para alternar.`);
      } catch {
        // O hook apresenta a mensagem detalhada retornada pela Edge Function.
      }
    };
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Resposta principal</Label>
            <Badge variant="secondary" className="text-[10px]">
              {1 + variations.filter((item) => item.trim()).length} texto(s) ativos
            </Badge>
          </div>
          <Textarea
            rows={3}
            value={d.text ?? ''}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Ex: Te chamei no direct 👉"
          />
        </div>

        {variations.map((variation, index) => (
          <div key={index} className="rounded-lg border bg-muted/20 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="text-[11px]">Variação {index + 2}</Label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeVariation(index)}
                title="Remover variação"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              rows={2}
              value={variation}
              onChange={(e) => updateVariation(index, e.target.value)}
              placeholder="Escreva outra forma de responder..."
            />
          </div>
        ))}

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addVariation} disabled={variations.length >= 9}>
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 border-violet-500/30 text-violet-600"
            onClick={varyWithAI}
            disabled={generateVariations.isPending}
          >
            {generateVariations.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Variar com IA
          </Button>
        </div>
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5">
          <p className="text-[11px] font-medium text-sky-700 dark:text-sky-300">Alternância automática</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            A cada comentário, o Vendus escolhe aleatoriamente uma resposta válida e registra no histórico qual foi enviada.
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground">Use {'{{trigger_text}}'} ou {'{{sender}}'} para inserir dados do gatilho.</p>
      </div>
    );
  }
  if (block.type === 'ig_private_reply') {
    const button = Array.isArray(d.buttons) ? d.buttons[0] : null;
    const buttonTitle = String(button?.title ?? '');
    const buttonUrl = String(button?.url ?? '');
    const quickReply = Array.isArray(d.quick_replies) ? d.quick_replies[0] : null;
    const continuationTitle = String(quickReply?.title ?? '');
    const updateButton = (patch: { title?: string; url?: string }) => {
      const next = {
        type: 'web_url',
        title: patch.title ?? buttonTitle,
        url: patch.url ?? buttonUrl,
      };
      onChange({ buttons: next.title || next.url ? [next] : [] });
    };
    const updateContinuation = (title: string) => {
      const cleanTitle = title.slice(0, 20);
      onChange({
        buttons: [],
        quick_replies: cleanTitle ? [{
          title: cleanTitle,
          payload: String(quickReply?.payload ?? `VENDUS_CONTINUE:${flowId}:${block.id}`),
        }] : [],
      });
    };
    return (
      <div className="pl-6 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Mensagem da Opening DM</Label>
          <Textarea
            rows={3}
            value={d.text ?? ''}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Ex: Aqui está o material que você pediu 👇"
          />
        </div>
        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
          <div>
            <p className="text-xs font-medium">Como a pessoa continuará?</p>
            <p className="text-[10px] text-muted-foreground">
              Para enviar outra mensagem, use um botão de confirmação. O clique abre a conversa e libera a próxima etapa.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">Botão para continuar a conversa</Label>
            <Input
              value={continuationTitle}
              maxLength={20}
              onChange={(e) => updateContinuation(e.target.value)}
              placeholder="Ex: Quero receber"
            />
            <p className="text-[10px] text-muted-foreground">
              Depois, adicione “Mensagem no Direct” ao fluxo e coloque o link nela.
            </p>
          </div>
          <div className="border-t pt-3 space-y-2">
            <div>
              <p className="text-[11px] font-medium">Ou entregue um link já na Opening DM</p>
              <p className="text-[10px] text-muted-foreground">
                Neste modo o link abre fora do Instagram e não dispara automaticamente uma próxima mensagem.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,180px)_1fr]">
              <Input
                value={buttonTitle}
                maxLength={20}
                onChange={(e) => updateButton({ title: e.target.value })}
                placeholder="Texto do botão"
                disabled={!!continuationTitle}
              />
              <Input
                value={buttonUrl}
                onChange={(e) => updateButton({
                  url: e.target.value,
                  title: buttonTitle || (e.target.value ? 'Acessar link' : ''),
                })}
                placeholder="https://seu-link.com"
                disabled={!!continuationTitle}
              />
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">Use {'{{trigger_text}}'} ou {'{{sender}}'} para personalizar o texto.</p>
      </div>
    );
  }
  if (block.type === 'wait') {
    return (
      <div className="pl-6 flex items-center gap-2">
        <Label className="text-xs">Segundos</Label>
        <Input type="number" min={1} max={30} className="w-24" value={d.seconds ?? 3} onChange={(e) => onChange({ seconds: Number(e.target.value) || 1 })} />
      </div>
    );
  }
  if (block.type === 'ig_like_comment') {
    return <p className="pl-6 text-xs text-muted-foreground">Curte automaticamente via API oficial <code>POST /&lt;IG_USER_ID&gt;/likes</code>. Exige <code>instagram_manage_engagement</code> no token.</p>;
  }
  if (block.type === 'ai_takeover') {
    const activeAgents = agents.filter((agent: any) => agent.is_active !== false);
    return (
      <div className="pl-6 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Agente do Vendus</Label>
          <Select
            value={d.agent_id ?? ''}
            onValueChange={(value) => {
              const agent = activeAgents.find((item: any) => item.id === value);
              onChange({ agent_id: value, agent_name: agent?.name ?? '' });
            }}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder={activeAgents.length === 0 ? 'Nenhum agente ativo cadastrado' : 'Selecione o agente que atenderá'} />
            </SelectTrigger>
            <SelectContent>
              {activeAgents.map((agent: any) => (
                <SelectItem key={agent.id} value={agent.id}>
                  <span className="inline-flex items-center gap-2">
                    <Bot className="h-3.5 w-3.5 text-emerald-500" />
                    {agent.name}
                    {agent.product?.name ? <span className="text-muted-foreground">· {agent.product.name}</span> : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            O agente usará o prompt, tom, ferramentas e regras definidos em Agentes de IA.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Contexto desta automação (opcional)</Label>
          <Textarea rows={2} value={d.prompt ?? ''} onChange={(e) => onChange({ prompt: e.target.value })} placeholder="Ex: O contato veio do comentário CÓDIGO. Ajude-o com essa oferta." />
        </div>
      </div>
    );
  }
  if (block.type === 'apply_tag') {
    return (
      <div className="pl-6 space-y-1.5">
        <Label className="text-xs">Etiqueta</Label>
        <Select value={d.tag_id ?? ''} onValueChange={(v) => onChange({ tag_id: v, tag_name: tags.find(t => t.id === v)?.name })}>
          <SelectTrigger className="max-w-sm"><SelectValue placeholder={tags.length === 0 ? 'Nenhuma etiqueta cadastrada' : 'Selecione uma etiqueta'} /></SelectTrigger>
          <SelectContent>
            {tags.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {d.tag_id_pending && !d.tag_id && (
          <p className="text-xs text-amber-600">IA sugeriu a etiqueta "{d.tag_id_pending}" — crie no CRM ou escolha outra.</p>
        )}
      </div>
    );
  }
  if (block.type === 'enroll_cadence') {
    const active = (cadences ?? []).filter((c: any) => c.status === 'active');
    return (
      <div className="pl-6 space-y-1.5">
        <Label className="text-xs">Cadência ativa</Label>
        <Select value={d.cadence_id ?? ''} onValueChange={(v) => onChange({ cadence_id: v, cadence_name: active.find((c: any) => c.id === v)?.name })}>
          <SelectTrigger className="max-w-sm"><SelectValue placeholder={active.length === 0 ? 'Nenhuma cadência ativa' : 'Selecione uma cadência'} /></SelectTrigger>
          <SelectContent>
            {active.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {d.cadence_id_pending && !d.cadence_id && (
          <p className="text-xs text-amber-600">IA sugeriu "{d.cadence_id_pending}" — crie ou ative essa cadência.</p>
        )}
      </div>
    );
  }
  if (block.type === 'assign_lead') {
    return (
      <div className="pl-6 space-y-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Setor (opcional)</Label>
          <Select value={d.sector_id ?? ''} onValueChange={(v) => onChange({ sector_id: v, sector_name: sectors.find((s: any) => s.id === v)?.name })}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder={sectors.length === 0 ? 'Nenhum setor cadastrado' : 'Selecione um setor'} /></SelectTrigger>
            <SelectContent>
              {sectors.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[10px] text-muted-foreground">O setor distribui o lead entre seus membros conforme a estratégia configurada.</p>
        {(d.sector_id_pending || d.user_id_pending) && (
          <p className="text-xs text-amber-600">IA sugeriu "{d.sector_id_pending ?? d.user_id_pending}" — ajuste manualmente.</p>
        )}
      </div>
    );
  }
  if (block.type === 'condition_text') {
    return (
      <div className="pl-6 space-y-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Palavras-chave (separadas por vírgula)</Label>
          <Input
            value={(d.keywords ?? []).join(', ')}
            onChange={(e) => onChange({ keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="quero, sim, tenho interesse"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0">Modo</Label>
          <Select value={d.match ?? 'any'} onValueChange={(v) => onChange({ match: v })}>
            <SelectTrigger className="max-w-[180px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Qualquer palavra</SelectItem>
              <SelectItem value="all">Todas as palavras</SelectItem>
              <SelectItem value="exact">Texto exato</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Se bater, continua no próximo bloco; se não bater, o fluxo termina aqui.</p>
      </div>
    );
  }
  return (
    <div className="pl-6 space-y-1.5">
      <Label className="text-xs">Texto</Label>
      <Textarea
        rows={2}
        value={d.text ?? ''}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder={block.type === 'ig_reply_comment' ? 'Ex: Te chamei no direct 👉' : 'Escreva a mensagem...'}
      />
      <p className="text-[10px] text-muted-foreground">Use {'{{trigger_text}}'} ou {'{{sender}}'} para inserir dados do gatilho.</p>
    </div>
  );
}
