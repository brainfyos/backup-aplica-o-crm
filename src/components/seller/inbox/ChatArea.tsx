import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bot, User, ArrowRightLeft, Plus, StickyNote,
  BarChart3, UserCircle, MoreVertical, X, ChevronLeft, ChevronDown,
  RotateCcw, Play, Undo2, Reply, Layers, Tag, Archive,
  FileText, Lock, Sparkles, Wand2,
} from 'lucide-react';
import { CallWithAIDialog } from '@/components/lead/CallWithAIDialog';
import { FollowupAIDialog } from '@/components/chat/FollowupAIDialog';
import { useConversationStaleness } from '@/hooks/useConversationStaleness';
import { useLeadTagsForLead } from '@/hooks/useLeadTags';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ChannelBadge } from './ChannelBadge';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useMessageReactions } from '@/hooks/useMessageReactions';
import { TypingIndicator } from './TypingIndicator';
import { QuickRepliesPopover } from './QuickRepliesPopover';
import { QuickActionBar } from './QuickActionBar';
import { EmptyInboxState } from './EmptyInboxState';
import { ForwardMessageDialog } from './ForwardMessageDialog';
import { AcceptTicketBar } from '@/components/inbox';
import { SendTemplateDialog } from './SendTemplateDialog';
import { useConversationWAWindow } from '@/hooks/useConversationWAWindow';
import { useAuth } from '@/hooks/useAuth';
import { useCheckWhatsAppNumber } from '@/hooks/useCheckWhatsAppNumber';
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useIsMobile } from '@/hooks/use-mobile';

export interface Message {
  id: string;
  content: string;
  sender_type: 'visitor' | 'agent' | 'bot';
  sender_name: string | null;
  sender_id?: string | null;
  created_at: string;
  is_deleted?: boolean;
  edited_at?: string | null;
  is_starred?: boolean;
  forwarded_from_message_id?: string | null;
  reply_to?: { id: string; content: string; sender_type: string } | null;
  metadata?: any;
  content_type?: string | null;
}

interface ChatAreaProps {
  conversationId: string | null;
  visitorName: string;
  visitorPhone?: string | null;
  visitorAvatarUrl?: string | null;
  channel: string;
  /** Identificadores opcionais para distinguir provedor (Evolution / Meta / Instagram). */
  metaConnectionId?: string | null;
  instagramConnectionId?: string | null;
  evolutionInstanceId?: string | null;
  status: string;
  messages: Message[];
  isLoading?: boolean;
  isSending?: boolean;
  isTyping?: boolean;
  productName?: string;
  currentUserId?: string;
  /** Quando true, exibe a barra "Aceitar Atendimento" no rodapé em vez do composer */
  needsAccept?: boolean;
  /** Callback acionado quando o agente clica em "Aceitar Atendimento" */
  onAcceptTicket?: (squadId?: string) => Promise<void> | void;
  isAccepting?: boolean;
  /** Modo espectador: admin vendo conversa de outro agente. Esconde composer e mostra banner. */
  viewerMode?: boolean;
  /** Nome do agente que está atendendo atualmente — exibido no banner de espectador */
  attendantName?: string | null;
  /** Callback acionado quando admin clica em "Assumir conversa" */
  onTakeover?: () => void;
  /** Identificador curto exibido no header (ex.: #6145) */
  ticketCode?: string;
  /** Nome do setor atribuído — exibido no subtítulo do header */
  sectorName?: string;
  /** Cor do setor — usada como acento no header */
  sectorColor?: string;
  /** Nome do agente IA atual atendendo a conversa (ex.: "Ana") */
  currentAgentName?: string | null;
  /** ID do lead vinculado — usado para carregar etiquetas do lead no header */
  leadId?: string | null;
  onSendMessage: (content: string, replyToMessageId?: string, media?: import('./MediaAttachment').MediaPayload) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onStarMessage?: (messageId: string) => void;
  onForwardMessage?: (messageId: string, targetConversationId: string) => void;
  onResendMessage?: (messageId: string) => void;
  onClose?: () => void;
  onTransfer?: () => void;
  onTogglePanel?: () => void;
  onBack?: () => void;
  onReopen?: () => void;
  onResume?: () => void;
  onReturnToQueue?: () => void;
  onActivateBot?: () => void;
  showBackButton?: boolean;
  isReopening?: boolean;
  isResuming?: boolean;
  isReturning?: boolean;
  isActivatingBot?: boolean;
  onAiSuggest?: () => Promise<string>;
  onScheduleFollowup?: () => void;
  onMarkHot?: () => void;
  onSendFlow?: () => void;
  onSendCadence?: () => void;
  onAnalyze?: () => void;
  onScheduleMessage?: () => void;
  /** Cria um evento de calendário associado à conversa/lead. */
  onCreateEvent?: () => void;
  /** Cria uma oportunidade (deal). Disponível apenas com lead vinculado. */
  onCreateDeal?: () => void;
  /** Abre os "Dados do Contato" (no mobile, abre o drawer). */
  onViewLead?: () => void;
  /** Move o lead para um novo estágio do funil (popover rápido). */
  onMoveStageQuick?: (stageId: string) => void;
  pipelineStages?: { id: string; name: string; color: string | null }[];
  currentStageId?: string | null;
  /** Notifies parent when local agent is typing (so it can broadcast presence). */
  onTyping?: (isTyping: boolean) => void;
  /** Whether the visitor is currently connected/online on the channel. */
  peerOnline?: boolean;
  /** Abre o seletor de catálogo (envia produto rico no chat). */
  onPickCatalog?: () => void;
  /** Abre o dialog de geração de link de pagamento. */
  onSendPaymentLink?: () => void;
}

export function ChatArea({
  conversationId,
  visitorName,
  visitorPhone,
  visitorAvatarUrl,
  channel,
  metaConnectionId,
  instagramConnectionId,
  evolutionInstanceId,
  status,
  messages,
  isLoading,
  isSending,
  isTyping,
  productName,
  currentUserId,
  needsAccept,
  onAcceptTicket,
  isAccepting,
  viewerMode,
  attendantName,
  onTakeover,
  ticketCode,
  sectorName,
  sectorColor,
  currentAgentName,
  leadId,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onStarMessage,
  onForwardMessage,
  onResendMessage,
  onClose,
  onTransfer,
  onTogglePanel,
  onBack,
  onReopen,
  onResume,
  onReturnToQueue,
  onActivateBot,
  showBackButton,
  isReopening,
  isResuming,
  isReturning,
  isActivatingBot,
  onAiSuggest,
  onScheduleFollowup,
  onMarkHot,
  onSendFlow,
  onSendCadence,
  onAnalyze,
  onScheduleMessage,
  onCreateEvent,
  onCreateDeal,
  onViewLead,
  onMoveStageQuick,
  pipelineStages = [],
  currentStageId,
  onTyping,
  peerOnline = false,
  onPickCatalog,
  onSendPaymentLink,
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const isMobile = useIsMobile();
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [isSuggestingReply, setIsSuggestingReply] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [replyToMessage, setReplyToMessage] = useState<{ id: string; content: string; senderType: string } | null>(null);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  const [sendTemplateOpen, setSendTemplateOpen] = useState(false);
  const [callAIOpen, setCallAIOpen] = useState(false);
  const [followupAIOpen, setFollowupAIOpen] = useState(false);
  const { stale: isStale } = useConversationStaleness(messages);


  // Janela 24h Meta API Oficial: bloqueia composer fora dela
  const { profile } = useAuth();
  const isMetaOfficial = !!metaConnectionId;
  const { data: waWindow } = useConversationWAWindow(isMetaOfficial ? conversationId : null);
  const outOfWindow = isMetaOfficial && waWindow && waWindow.hasConversation && !waWindow.withinWindow;

  // Reações por emoji (realtime)
  const { summarize: summarizeReactions, react: reactToMessage } = useMessageReactions(conversationId);

  // Etiquetas do lead (carregadas só quando há lead vinculado)
  const { data: leadTagAssignments = [] } = useLeadTagsForLead(leadId || undefined);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    // Dedup visual: quando a mesma mensagem outbound aparece em duplicidade
    // (ex.: bolha "Agente" + bolha "Agente IA", ou eco "via aparelho"),
    // mantém apenas UMA bolha — a de maior prioridade visual.
    const WINDOW_MS = 5 * 60 * 1000;
    const normalize = (s: string | null | undefined) =>
      (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const isFromDevice = (m: any) =>
      m?.metadata?.source === 'external_device' || m?.metadata?.from_device === true;
    const isOutbound = (m: any) =>
      m?.direction === 'outbound' || m?.sender_type === 'agent' || m?.sender_type === 'bot';

    // Prioridade: 1) agent (verde) 2) plataforma (não-device) 3) device 4) bot/IA
    const priority = (m: any): number => {
      if (m?.sender_type === 'agent' && !isFromDevice(m)) return 4;
      if (m?.sender_type === 'agent' && isFromDevice(m)) return 2;
      if (m?.sender_type === 'bot') return 1;
      // outbound desconhecido — trata como plataforma
      return 3;
    };

    const all = messages as any[];
    const hidden = new Set<string>();

    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (hidden.has(a.id) || !isOutbound(a)) continue;
      const contentA = normalize(a.content);
      if (!contentA) continue;
      const tsA = new Date(a.created_at).getTime();
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        if (hidden.has(b.id) || !isOutbound(b)) continue;
        if (normalize(b.content) !== contentA) continue;
        if (Math.abs(new Date(b.created_at).getTime() - tsA) > WINDOW_MS) continue;
        // duplicata — esconde a de menor prioridade
        const loser = priority(a) >= priority(b) ? b : a;
        hidden.add(loser.id);
        if (loser.id === a.id) break; // a foi escondido, segue p/ próximo i
      }
    }

    const filtered = all.filter((m) => !hidden.has(m.id)) as Message[];

    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';

    filtered.forEach((msg) => {
      const msgDate = format(new Date(msg.created_at), 'yyyy-MM-dd');
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  }, [messages]);

  // Auto-scroll suave: só desce sozinho se o usuário já está próximo do fim
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      if (scrollElement) {
        const distance = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
        if (distance < 200) {
          scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: 'smooth' });
        }
      }
    }
  }, [messages.length, isTyping]);

  // Listener de scroll para exibir a setinha "ir para o fim" (estilo WhatsApp)
  useEffect(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;
    const handleScroll = () => {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setShowScrollDown(distance > 200);
    };
    handleScroll();
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [messages.length]);

  const scrollToBottom = () => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  };


  // Helper: formata o label do separador de dia (Hoje, Ontem, dia da semana, ou data completa)
  const formatDayLabel = (dateStr: string) => {
    // dateStr vem como "yyyy-MM-dd" (horário local). Reparse manual evita
    // que `new Date("2026-06-26")` seja interpretado como UTC meia-noite,
    // o que jogava o dia para "Ontem" no fuso de Brasília (UTC-3).
    const [y, m, day] = dateStr.split('-').map(Number);
    const d = new Date(y, (m || 1) - 1, day || 1);
    if (isToday(d)) return 'Hoje';
    if (isYesterday(d)) return 'Ontem';
    const diff = differenceInDays(new Date(), d);
    if (diff < 7) return format(d, 'EEEE', { locale: ptBR });
    return format(d, "d 'de' MMMM", { locale: ptBR });
  };

  const handleQuickReplySelect = (content: string) => {
    onSendMessage(content);
  };

  const handleAiSuggest = async () => {
    if (!onAiSuggest) return;
    setIsSuggestingReply(true);
    try {
      const suggestion = await onAiSuggest();
      setAiSuggestion(suggestion);
    } catch {
      // handled silently
    } finally {
      setIsSuggestingReply(false);
    }
  };

  const handleReply = (messageId: string, content: string) => {
    const msg = messages.find(m => m.id === messageId);
    setReplyToMessage({
      id: messageId,
      content,
      senderType: msg?.sender_type || 'visitor',
    });
  };

  const handleSendWithReply = (content: string, media?: import('./MediaAttachment').MediaPayload) => {
    onSendMessage(content, replyToMessage?.id, media);
    setReplyToMessage(null);
    setAiSuggestion('');
  };

  const handleForward = (messageId: string) => {
    setForwardMessageId(messageId);
  };

  const { check: checkWhatsAppNumber } = useCheckWhatsAppNumber();
  const handleVerifyNumber = (_messageId: string) => {
    if (!visitorPhone) return;
    checkWhatsAppNumber({
      phone: visitorPhone,
      organization_id: (profile as any)?.organization_id ?? undefined,
      instance_id: evolutionInstanceId ?? undefined,
      conversation_id: conversationId ?? undefined,
      apply: false,
    });
  };

  const handleForwardConfirm = (targetConversationId: string) => {
    if (forwardMessageId && onForwardMessage) {
      onForwardMessage(forwardMessageId, targetConversationId);
    }
    setForwardMessageId(null);
  };

  if (!conversationId) {
    return <EmptyInboxState />;
  }

  const getStatusText = () => {
    switch (status) {
      case 'active': return 'Conversa ativa';
      case 'waiting': return 'Aguardando atendimento';
      case 'bot_active': return 'Atendimento por IA';
      case 'closed': return 'Conversa encerrada';
      default: return status;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'waiting': return 'bg-yellow-500';
      case 'bot_active': return 'bg-blue-500';
      case 'closed': return 'bg-muted';
      default: return 'bg-muted';
    }
  };

  // Acento do setor no header (pequena barra colorida + chip do setor)
  const headerAccent = sectorColor || 'hsl(var(--primary))';

  // Status dinâmico do header mobile (Online / Digitando / Última interação)
  const lastMessageAt = messages.length > 0 ? messages[messages.length - 1].created_at : null;
  const mobileStatusLine = isTyping
    ? 'Digitando…'
    : peerOnline
    ? 'Online'
    : lastMessageAt
    ? `Última interação: ${format(new Date(lastMessageAt), "HH:mm")}`
    : getStatusText();

  return (
    <div className="w-full h-full min-w-0 flex flex-col bg-background overflow-hidden">
      {/* ─────────── Header MOBILE (compacto) ─────────── */}
      {isMobile && (
        <div
          className="flex-shrink-0 sticky top-0 z-30 bg-background border-b border-border min-w-0"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
          data-no-pull-to-refresh
        >
        <div className="h-14 px-2 flex items-center gap-2 min-w-0">
          {showBackButton && (
            <Button variant="ghost" size="icon" className="h-9 w-9 -ml-1 flex-shrink-0" onClick={onBack}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="h-9 w-9 flex-shrink-0">
            {visitorAvatarUrl && (
              <AvatarImage src={visitorAvatarUrl} alt={visitorName || 'Visitante'} />
            )}
            <AvatarFallback
              className="font-semibold text-xs"
              style={{ backgroundColor: `${headerAccent}1a`, color: headerAccent }}
            >
              {visitorName?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'V'}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={onViewLead || onTogglePanel}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-sm truncate">
                {visitorName || 'Visitante'}
              </span>
              {peerOnline && (
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {mobileStatusLine}
              {ticketCode && <span className="ml-1.5 font-mono">· #{ticketCode}</span>}
              {sectorName && <span className="ml-1.5">· {sectorName}</span>}
            </div>
          </button>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            {conversationId && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-9 w-9 relative',
                  isStale && 'text-amber-600 hover:text-amber-700',
                )}
                onClick={() => setFollowupAIOpen(true)}
                aria-label="Follow-up IA"
              >
                <Wand2 className="h-[18px] w-[18px]" />
                {isStale && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                )}
              </Button>
            )}
            {status !== 'closed' && onTransfer && (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onTransfer} aria-label="Atribuir responsável">
                <UserCircle className="h-[18px] w-[18px]" />
              </Button>
            )}
            {status !== 'closed' && onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
                aria-label="Encerrar conversa"
              >
                <X className="h-[18px] w-[18px]" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais">
                  <MoreVertical className="h-[18px] w-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {(status === 'bot_active' || status === 'waiting') && onResume && (
                  <DropdownMenuItem onClick={onResume} disabled={isResuming}>
                    <Play className="h-4 w-4 mr-2" />
                    Retomar atendimento
                  </DropdownMenuItem>
                )}
                {status !== 'closed' && onActivateBot && (
                  <DropdownMenuItem onClick={onActivateBot} disabled={isActivatingBot}>
                    <Bot className="h-4 w-4 mr-2" />
                    Ativar IA (voltar para os agentes)
                  </DropdownMenuItem>
                )}
                {onReturnToQueue && status !== 'closed' && (
                  <DropdownMenuItem onClick={onReturnToQueue} disabled={isReturning}>
                    <Undo2 className="h-4 w-4 mr-2" />
                    Devolver à fila (atendimento humano)
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem>
                  <StickyNote className="h-4 w-4 mr-2" />
                  Notas internas
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Ver métricas
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {status === 'closed' && onReopen && (
                  <DropdownMenuItem onClick={onReopen} disabled={isReopening}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reabrir conversa
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        </div>
      )}

      {/* ─────────── Header DESKTOP (mantém o layout antigo, mais informações) ─────────── */}
      {!isMobile && (
      <div
        className="h-16 min-w-0 flex-shrink-0 px-3 sm:px-4 border-b border-border flex items-center justify-between bg-background relative gap-2 overflow-hidden"
      >
        {/* barra colorida lateral indicando a fila */}
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: headerAccent }}
        />
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {showBackButton && (
            <Button variant="ghost" size="icon" className="h-8 w-8 mr-1" onClick={onBack}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="h-11 w-11 ring-2 ring-background shadow-sm">
            {visitorAvatarUrl && (
              <AvatarImage src={visitorAvatarUrl} alt={visitorName || 'Visitante'} />
            )}
            <AvatarFallback
              className="font-semibold text-sm"
              style={{ backgroundColor: `${headerAccent}1a`, color: headerAccent }}
            >
              {visitorName?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'V'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm truncate">
                {visitorName || 'Visitante'}
              </span>
              {peerOnline && (
                <span className="relative flex h-2 w-2 flex-shrink-0" title="Online agora">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
              )}
              <ChannelBadge
                conversation={{
                  channel,
                  meta_connection_id: metaConnectionId,
                  instagram_connection_id: instagramConnectionId,
                  evolution_instance_id: evolutionInstanceId,
                }}
                size="sm"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0 truncate">
              {ticketCode && (
                <span className="font-mono text-foreground/70">#{ticketCode}</span>
              )}
              {ticketCode && <span>·</span>}
              <div className={cn("h-1.5 w-1.5 rounded-full", getStatusColor())} />
              <span>{getStatusText()}</span>
              {productName && (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[100px]">{productName}</span>
                </>
              )}
            </div>

            {/* Linha de Tags: setor + etiquetas do lead */}
            {(sectorName || currentAgentName || leadTagAssignments.length > 0) && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {sectorName && (
                  <Badge
                    className="h-5 px-1.5 text-[10px] gap-1 border font-medium"
                    style={{
                      backgroundColor: sectorColor ? `${sectorColor}1a` : undefined,
                      color: sectorColor || undefined,
                      borderColor: sectorColor ? `${sectorColor}40` : undefined,
                    }}
                  >
                    <Layers className="h-2.5 w-2.5" />
                    {sectorName}
                  </Badge>
                )}
                {currentAgentName && (
                  <Badge
                    className="h-5 px-1.5 text-[10px] gap-1 font-medium border bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                  >
                    <Bot className="h-2.5 w-2.5" />
                    {currentAgentName} · IA
                  </Badge>
                )}
                {leadTagAssignments.slice(0, 4).map((assignment) => {
                  const tag = (assignment as any).tag;
                  if (!tag) return null;
                  const color = tag.color || 'hsl(var(--muted-foreground))';
                  return (
                    <Badge
                      key={tag.id}
                      className="h-5 px-1.5 text-[10px] gap-1 border font-medium"
                      style={{
                        backgroundColor: `${color}1a`,
                        color: color,
                        borderColor: `${color}40`,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {tag.name}
                    </Badge>
                  );
                })}
                {leadTagAssignments.length > 4 && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
                    +{leadTagAssignments.length - 4}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {status === 'closed' && onReopen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onReopen} disabled={isReopening}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reabrir
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reabrir conversa</TooltipContent>
            </Tooltip>
          )}

          {(status === 'bot_active' || status === 'waiting') && onResume && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onResume} disabled={isResuming}>
                  <Play className="h-3.5 w-3.5" />
                  Retomar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retomar atendimento humano</TooltipContent>
            </Tooltip>
          )}

          {status !== 'closed' && (
            <>
              {leadId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCallAIOpen(true)}
                    >
                      <Sparkles className="h-4 w-4 text-primary" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Chamar IA (follow-up manual)</TooltipContent>
                </Tooltip>
              )}

              {conversationId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-8 w-8 relative',
                        isStale && 'text-amber-600 hover:text-amber-700',
                      )}
                      onClick={() => setFollowupAIOpen(true)}
                    >
                      <Wand2 className="h-4 w-4" />
                      {isStale && (
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-500" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Follow-up IA (envia como você){isStale ? ' · conversa parada' : ''}
                  </TooltipContent>
                </Tooltip>
              )}

              {status === 'human_active' && onActivateBot && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onActivateBot} disabled={isActivatingBot}>
                      <Bot className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ativar Bot (IA assume)</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTransfer}>
                    <ArrowRightLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Transferir</TooltipContent>
              </Tooltip>

              {onReturnToQueue && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onReturnToQueue} disabled={isReturning}>
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Devolver à fila</TooltipContent>
                </Tooltip>
              )}
            </>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTogglePanel}>
                <UserCircle className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dados do Contato</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <StickyNote className="h-4 w-4 mr-2" />
                Notas internas
              </DropdownMenuItem>
              <DropdownMenuItem>
                <BarChart3 className="h-4 w-4 mr-2" />
                Ver métricas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {status !== 'closed' && onClose && (
                <DropdownMenuItem onClick={onClose} className="text-destructive">
                  <X className="h-4 w-4 mr-2" />
                  Encerrar conversa
                </DropdownMenuItem>
              )}
              {status === 'closed' && onReopen && (
                <DropdownMenuItem onClick={onReopen}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reabrir conversa
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      )}

      {/* Messages — fundo sutilmente texturizado para diferenciar a área de chat */}
      <div className="relative flex-1 min-h-0 w-full max-w-full min-w-0">
      <ScrollArea
        className="h-full w-full max-w-full min-w-0 bg-muted/20 [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:!w-full"
        ref={scrollRef}
        style={{
          backgroundImage:
            'radial-gradient(hsl(var(--muted-foreground) / 0.06) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <div className={cn('w-full max-w-full min-w-0 overflow-x-hidden', isMobile ? 'px-3 py-2' : 'p-4')}>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex gap-2">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-16 bg-muted rounded-2xl w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">Nenhuma mensagem ainda</p>
              <p className="text-xs mt-1">Envie uma mensagem para iniciar</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedMessages.map((group) => (
                <div key={group.date}>
                  <div className="flex justify-center mb-4 sticky top-0 z-10 pointer-events-none">
                    <span className="text-[10px] font-medium text-muted-foreground bg-background/90 backdrop-blur border border-border/60 px-3 py-1 rounded-full shadow-sm capitalize">
                      {formatDayLabel(group.date)}
                    </span>
                  </div>

                  <div className="space-y-1 min-w-0">
                    {group.messages.map((msg, idx) => {
                      const prevMsg = group.messages[idx - 1];
                      const nextMsg = group.messages[idx + 1];
                      const isFirstInGroup = !prevMsg || prevMsg.sender_type !== msg.sender_type;
                      const isLastInGroup = !nextMsg || nextMsg.sender_type !== msg.sender_type;

                      return (
                        <MessageBubble
                          key={msg.id}
                          id={msg.id}
                          content={msg.content}
                          senderType={msg.sender_type}
                          senderName={msg.sender_name}
                          createdAt={msg.created_at}
                          isFirstInGroup={isFirstInGroup}
                          isLastInGroup={isLastInGroup}
                          isDeleted={msg.is_deleted}
                          editedAt={msg.edited_at}
                          isStarred={msg.is_starred}
                          forwardedFrom={!!msg.forwarded_from_message_id}
                          replyTo={msg.reply_to}
                          senderId={msg.sender_id}
                          currentUserId={currentUserId}
                          metadata={(msg as any).metadata}
                          showAvatar={!isMobile}
                          onReply={handleReply}
                          onEdit={onEditMessage}
                          onDelete={onDeleteMessage}
                          onStar={onStarMessage}
                          onForward={onForwardMessage ? handleForward : undefined}
                          onResend={onResendMessage}
                          onVerifyNumber={handleVerifyNumber}
                          reactions={summarizeReactions(msg.id)}
                          onReact={reactToMessage}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}

              {isTyping && (
                <TypingIndicator name={visitorName || 'Visitante'} />
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Setinha flutuante estilo WhatsApp: rola até o fim */}
      {showScrollDown && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Ir para a última mensagem"
          className="absolute bottom-3 right-3 z-20 h-9 w-9 rounded-full bg-background border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors animate-in fade-in zoom-in-95"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}
      </div>

      {/* Footer — Aceitar atendimento OU modo espectador OU composer OU encerrada */}
      {needsAccept && onAcceptTicket ? (
        <AcceptTicketBar onAccept={onAcceptTicket} loading={!!isAccepting} />
      ) : viewerMode ? (
            <div className="border-t border-border bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center justify-between gap-3 flex-shrink-0 min-w-0">
          <div className="text-sm">
            <span className="font-medium text-amber-900 dark:text-amber-200">
              Você está visualizando este atendimento{attendantName ? ` de ${attendantName}` : ''}.
            </span>
            <p className="text-xs text-amber-700 dark:text-amber-300">Para responder, assuma a conversa.</p>
          </div>
          {onTakeover && (
            <Button size="sm" variant="default" onClick={onTakeover}>
              Assumir conversa
            </Button>
          )}
        </div>
      ) : status !== 'closed' ? (
        <>
          {/* QuickActionBar só no desktop — mobile ganha mais área útil para mensagens */}
          {!isMobile && (
            <QuickActionBar
              onScheduleFollowup={onScheduleFollowup}
              onSendCadence={onSendCadence}
              onCreateEvent={onCreateEvent}
              onCreateDeal={onCreateDeal}
              onMoveStageQuick={onMoveStageQuick}
              pipelineStages={pipelineStages}
              currentStageId={currentStageId}
              onPickCatalog={onPickCatalog}
              onSendPaymentLink={onSendPaymentLink}
            />
          )}

          {/* Reply preview bar */}
          {replyToMessage && (
            <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center gap-2">
              <div className="w-1 h-8 bg-primary rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium">
                  {replyToMessage.senderType === 'visitor' ? '👤 Visitante' : replyToMessage.senderType === 'bot' ? '🤖 Bot' : '💬 Agente'}
                </p>
                <p className="text-xs text-foreground truncate">{replyToMessage.content}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setReplyToMessage(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {outOfWindow ? (
            <div className="px-4 py-3 border-t border-border bg-amber-500/10">
              <div className="flex items-start gap-2 text-sm">
                <Lock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-amber-900 dark:text-amber-200">Janela de 24h encerrada</p>
                  <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                    Para reabrir esta conversa via WhatsApp Oficial, envie um template HSM aprovado.
                  </p>
                </div>
                <Button size="sm" onClick={() => setSendTemplateOpen(true)}>
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Enviar template
                </Button>
              </div>
            </div>
          ) : (
            <ChatInput
              onSend={(content, media) => {
                handleSendWithReply(content, media);
              }}
              onTyping={onTyping}
              onOpenQuickReplies={() => setQuickRepliesOpen(true)}
              isSending={isSending}
              placeholder={`Mensagem para ${visitorName || 'visitante'}...`}
              aiSuggestion={aiSuggestion}
              onClearSuggestion={() => setAiSuggestion('')}
              onScheduleMessage={onScheduleMessage}
              onCreateDeal={onCreateDeal}
            />

          )}
        </>
      ) : (
        <div className="p-3 border-t border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs text-muted-foreground">Conversa encerrada</span>
            {onReopen && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onReopen} disabled={isReopening}>
                <RotateCcw className="h-3 w-3" />
                Reabrir
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Quick Replies Modal */}
      <QuickRepliesPopover
        open={quickRepliesOpen}
        onOpenChange={setQuickRepliesOpen}
        onSelect={handleQuickReplySelect}
        leadName={visitorName || 'Cliente'}
        productName={productName}
      />

      {/* Forward Message Dialog */}
      <ForwardMessageDialog
        open={!!forwardMessageId}
        onOpenChange={(open) => !open && setForwardMessageId(null)}
        onConfirm={handleForwardConfirm}
        conversationId={conversationId}
      />

      {/* Send Template HSM (Meta Cloud API) */}
      {isMetaOfficial && metaConnectionId && (
        <SendTemplateDialog
          open={sendTemplateOpen}
          onOpenChange={setSendTemplateOpen}
          organizationId={(profile as any)?.organization_id ?? null}
          metaConnectionId={metaConnectionId}
          conversationId={conversationId}
          leadId={leadId ?? null}
          to={visitorPhone || ''}
        />
      )}

      {/* Chamar IA (follow-up manual) — reusa CallWithAIDialog que já trata janela 24h + TemplatePicker */}
      {leadId && (
        <CallWithAIDialog
          open={callAIOpen}
          onOpenChange={setCallAIOpen}
          lead={{ id: leadId, name: visitorName, phone: visitorPhone || null }}
          initialObjective="Retomar a conversa de onde parou, analisando todo o histórico, e dar continuidade ao atendimento."
          source="inbox_manual"
        />
      )}

      {/* Follow-up IA — gera rascunho a partir do histórico real e envia como o vendedor */}
      <FollowupAIDialog
        open={followupAIOpen}
        onOpenChange={setFollowupAIOpen}
        conversationId={conversationId}
        leadName={visitorName}
      />
    </div>
  );
}
