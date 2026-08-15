import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Filter, Globe, MessageCircle, Instagram, Mail, Phone, Plus, User, Bot, BadgeCheck, Loader2, ListChecks, X as XIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { NotificationSoundPopover } from './NotificationSoundPopover';
import type { NotificationSoundControls } from '@/hooks/useNotificationSound';
import { resolveProvider, PROVIDER_LABEL, type ConvProvider } from '@/lib/conversationProvider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { previewWithMedia } from '@/lib/messageFormat';
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface Conversation {
  id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  visitor_avatar_url?: string | null;
  channel: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  last_message?: string;
  last_message_metadata?: any;
  lead_id: string | null;
  product_id?: string | null;
  product_name?: string;
  assigned_user_id?: string | null;
  assigned_user_name?: string;
  assigned_user_avatar?: string | null;
  sector_id?: string | null;
  sector_name?: string;
  sector_color?: string;
  tag_ids?: string[];
  current_agent_name?: string | null;
  evolution_instance_id?: string | null;
  meta_connection_id?: string | null;
  instagram_connection_id?: string | null;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  isLoading?: boolean;
  externalSearch?: string;
  externalShowResolved?: boolean;
  onOpenFilters?: () => void;
  activeFilterCount?: number;
  onNewConversation?: () => void;
  soundControls?: NotificationSoundControls;
  /** Mostra o nome do atendente em cada card (modo Admin). */
  showAssignedUser?: boolean;
  headerLabel?: string;
  /** Substitui o botão de filtro padrão (usado para ancorar popover). */
  filtersSlot?: React.ReactNode;
  /** Aba ativa controlada (backend filtra por status). */
  activeTab?: StatusTab;
  onTabChange?: (tab: StatusTab) => void;
  /** Contadores totais por aba vindos do backend. */
  tabCounts?: { attending: number; agents: number; waiting: number; resolved: number };
  isLoadingCounts?: boolean;
  isFetching?: boolean;
  /** Mostra a aba "Agentes" (somente quando o usuário tem permissão). */
  showAgentsTab?: boolean;
  /** Paginação infinita (cursor). */
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  /** Encerra em lote as conversas selecionadas (id[]). */
  onBulkClose?: (ids: string[]) => Promise<void> | void;
}

type StatusTab = 'attending' | 'agents' | 'waiting' | 'resolved';

const providerIcon: Record<ConvProvider, React.ReactNode> = {
  webchat: <Globe className="h-2.5 w-2.5" />,
  whatsapp_evolution: <Phone className="h-2.5 w-2.5" />,
  whatsapp_meta: <Phone className="h-2.5 w-2.5" />,
  instagram: <Instagram className="h-2.5 w-2.5" />,
  email: <Mail className="h-2.5 w-2.5" />,
  sms: <Phone className="h-2.5 w-2.5" />,
  unknown: <Globe className="h-2.5 w-2.5" />,
};

const providerAvatarBadgeClass: Record<ConvProvider, string> = {
  webchat: 'bg-primary text-primary-foreground',
  whatsapp_evolution: 'bg-emerald-500 text-white',
  whatsapp_meta: 'bg-[#0866FF] text-white',
  instagram: 'bg-gradient-to-tr from-purple-500 to-pink-500 text-white',
  email: 'bg-sky-500 text-white',
  sms: 'bg-purple-500 text-white',
  unknown: 'bg-muted text-muted-foreground',
};


export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
  externalSearch,
  externalShowResolved,
  onOpenFilters,
  activeFilterCount = 0,
  onNewConversation,
  soundControls,
  showAssignedUser = false,
  filtersSlot,
  activeTab: activeTabProp,
  onTabChange,
  tabCounts,
  isLoadingCounts = false,
  isFetching = false,
  showAgentsTab = false,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  onBulkClose,
}: ConversationListProps) {
  const [internalSearch, setInternalSearch] = useState('');
  const [internalTab, setInternalTab] = useState<StatusTab>('attending');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkClosing, setBulkClosing] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = (t: StatusTab) => {
    if (onTabChange) onTabChange(t);
    else setInternalTab(t);
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Scroll infinito: dispara onLoadMore quando o sentinel entra no viewport
  useEffect(() => {
    if (!onLoadMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
            onLoadMore();
          }
        }
      },
      { root: el.closest('[data-radix-scroll-area-viewport]') as Element | null, rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);


  // Usa busca externa apenas se houver valor; caso contrário, usa a interna (digitada na toolbar)
  const search = (externalSearch && externalSearch.length > 0) ? externalSearch : internalSearch;
  const showResolved = externalShowResolved ?? false;

  // Deduplicate: 1 card per contact (lead_id > phone > email > visitor_id).
  // Picks the most relevant conversation per contact:
  //   1) prefer non-closed (active/waiting) over closed
  //   2) then most recent by last_message_at (fallback created_at via id sort)
  const dedupedConversations = useMemo(() => {
    const STATUS_RANK: Record<string, number> = {
      human_active: 0,
      bot_active: 0,
      waiting_human: 1,
      closed: 2,
    };
    const keyOf = (c: Conversation) =>
      c.lead_id ||
      (c.visitor_phone ? `phone:${c.visitor_phone}` : null) ||
      (c.visitor_email ? `email:${c.visitor_email.toLowerCase()}` : null) ||
      `conv:${c.id}`;

    const map = new Map<string, Conversation>();
    for (const conv of conversations) {
      const key = keyOf(conv);
      const current = map.get(key);
      if (!current) {
        map.set(key, conv);
        continue;
      }
      const rankNew = STATUS_RANK[conv.status] ?? 3;
      const rankCur = STATUS_RANK[current.status] ?? 3;
      if (rankNew < rankCur) {
        map.set(key, conv);
        continue;
      }
      if (rankNew === rankCur) {
        const tNew = conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
        const tCur = current.last_message_at ? new Date(current.last_message_at).getTime() : 0;
        const winner = tNew >= tCur ? conv : current;
        // Sum unread counts so the surviving card reflects the contact's full backlog
        map.set(key, {
          ...winner,
          unread_count: (current.unread_count || 0) + (conv.unread_count || 0),
        });
      }
    }
    return Array.from(map.values());
  }, [conversations]);

  // Contadores: usar os do backend (totais reais por aba) quando vierem; caso
  // contrário, calcular a partir do que está em tela.
  // "Atendendo" = humano. "Aguardando" inclui IA atendendo (bot_active) +
  // sem ninguém (waiting_human) — em ambos os casos, ainda não há humano.
  const counts = useMemo(() => {
    if (tabCounts) return tabCounts;
    return {
      attending: dedupedConversations.filter((c) => c.status === 'human_active').length,
      agents: dedupedConversations.filter(
        (c) => c.status === 'bot_active' || (c.status === 'waiting_human' && !!c.current_agent_name),
      ).length,
      waiting: dedupedConversations.filter(
        (c) => c.status === 'waiting_human' && !c.current_agent_name,
      ).length,
      resolved: dedupedConversations.filter((c) => c.status === 'closed').length,
    };
  }, [dedupedConversations, tabCounts]);

  // O backend já filtra por status conforme a aba selecionada. Aqui só aplicamos
  // a busca local opcional (digitada na toolbar deste componente).
  const filteredConversations = useMemo(() => {
    let filtered = dedupedConversations;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.visitor_name?.toLowerCase().includes(s) ||
          c.visitor_email?.toLowerCase().includes(s) ||
          c.visitor_phone?.includes(search) ||
          c.last_message?.toLowerCase().includes(s),
      );
    }

    return [...filtered].sort((a, b) => {
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (a.unread_count === 0 && b.unread_count > 0) return 1;
      const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [dedupedConversations, search]);

  const currentTabCount = activeTab === 'attending'
    ? counts.attending
    : activeTab === 'agents'
      ? counts.agents
      : activeTab === 'waiting'
        ? counts.waiting
        : counts.resolved;
  const shouldShowListSkeleton = !!isLoading || (isFetching && filteredConversations.length === 0 && currentTabCount > 0);

  const getInitials = (name: string | null, phone: string | null) => {
    if (name) return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
    if (phone) return phone.slice(-2);
    return 'V';
  };

  // Data BR como na referência: hoje → "HH:mm", ontem → "Ontem",
  // mesma semana → "EEE HH:mm", mais antigo → "dd/MM/yyyy".
  const formatDate = (date: string | null) => {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Ontem';
    const diff = Math.abs(differenceInDays(new Date(), d));
    if (diff < 7) return format(d, 'EEE HH:mm', { locale: ptBR });
    return format(d, 'dd/MM/yyyy');
  };

  // Encurta nomes muito longos preservando o início + sufixo entre parênteses
  // ex.: "Allan Savaris - Agência Tabuleiro (LGND)" → "Allan Savaris - Agência..."
  const shortenName = (name: string, max = 32) => {
    if (name.length <= max) return name;
    return name.slice(0, max - 1).trimEnd() + '…';
  };

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Top toolbar */}
      <div className="px-3 py-2.5 border-b flex items-center gap-2 bg-card">
        {filtersSlot ?? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 relative"
                onClick={onOpenFilters}
              >
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filtros</TooltipContent>
          </Tooltip>
        )}

        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={internalSearch}
            onChange={(e) => setInternalSearch(e.target.value)}
            className="pl-8 h-9 bg-muted/40 border-0"
            data-inbox-search
          />
        </div>

        {soundControls && <NotificationSoundPopover controls={soundControls} />}

        {onBulkClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={selectionMode ? 'secondary' : 'ghost'}
                size="icon"
                className="h-9 w-9"
                onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
                aria-label={selectionMode ? 'Cancelar seleção' : 'Selecionar múltiplas'}
              >
                <ListChecks className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{selectionMode ? 'Cancelar seleção' : 'Selecionar múltiplas'}</TooltipContent>
          </Tooltip>
        )}

        {onNewConversation && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" className="h-9 w-9" onClick={onNewConversation}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Nova conversa</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Barra de ações em lote */}
      {selectionMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-primary/5">
          <span className="text-xs font-medium text-foreground">
            {selectedIds.size} selecionada{selectedIds.size === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => {
              if (selectedIds.size === filteredConversations.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(filteredConversations.map((c) => c.id)));
              }
            }}
          >
            {selectedIds.size === filteredConversations.length && filteredConversations.length > 0
              ? 'Limpar'
              : 'Selecionar todas visíveis'}
          </button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="destructive"
            className="h-8"
            disabled={selectedIds.size === 0 || bulkClosing}
            onClick={async () => {
              if (!onBulkClose || selectedIds.size === 0) return;
              setBulkClosing(true);
              try {
                await onBulkClose(Array.from(selectedIds));
                exitSelection();
              } finally {
                setBulkClosing(false);
              }
            }}
          >
            {bulkClosing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Encerrar ({selectedIds.size})
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={exitSelection} disabled={bulkClosing}>
            <XIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Tabs pílula — limpas, sem barra verde sólida */}
      <div className="px-2 py-2 border-b bg-background">
        <div className={cn('grid gap-1 p-1 bg-muted/40 rounded-lg', showAgentsTab ? 'grid-cols-3' : 'grid-cols-2')}>
          <TabButton
            label="Atendendo"
            count={counts.attending}
            isLoadingCount={isLoadingCounts && !tabCounts}
            active={activeTab === 'attending'}
            onClick={() => setActiveTab('attending')}
            badgeVariant="success"
          />
          {showAgentsTab && (
            <TabButton
              label="Agentes"
              count={counts.agents}
              isLoadingCount={isLoadingCounts && !tabCounts}
              active={activeTab === 'agents'}
              onClick={() => setActiveTab('agents')}
              badgeVariant="muted"
            />
          )}
          <TabButton
            label="Em Fila"
            count={counts.waiting}
            isLoadingCount={isLoadingCounts && !tabCounts}
            active={activeTab === 'waiting'}
            onClick={() => setActiveTab('waiting')}
            badgeVariant="danger"
          />
        </div>
      </div>


      {/* Lista de conversas */}
      <ScrollArea className="flex-1 bg-muted/20">
        {shouldShowListSkeleton ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse flex gap-3 p-3 bg-background rounded-lg">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma conversa</p>
            <p className="text-xs mt-1">
              {activeTab === 'waiting'
                ? 'Não há conversas aguardando atendimento'
                : activeTab === 'agents'
                ? 'Nenhuma conversa com agente IA'
                : activeTab === 'resolved'
                ? 'Nenhum atendimento resolvido'
                : 'Sem conversas nesta aba'}
            </p>
          </div>
        ) : (
          <div className="bg-background">
            {filteredConversations.map((conv) => {
              const provider = resolveProvider(conv);
              const channelLabel = PROVIDER_LABEL[provider] ?? conv.channel;
              const channelClass =
                provider === 'whatsapp_evolution'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                  : provider === 'whatsapp_meta'
                  ? 'bg-[#0866FF]/10 text-[#0866FF] dark:text-[#4d94ff] border-[#0866FF]/40'
                  : provider === 'instagram'
                  ? 'bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/30'
                  : provider === 'email'
                  ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30'
                  : 'bg-primary/10 text-primary border-primary/30';
              const preview = previewWithMedia(conv.last_message, conv.last_message_metadata, 60);
              const isSelected = selectedIds.has(conv.id);
              const startLongPress = () => {
                if (!onBulkClose) return;
                if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
                longPressTimer.current = window.setTimeout(() => {
                  setSelectionMode(true);
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.add(conv.id);
                    return next;
                  });
                }, 400);
              };
              const cancelLongPress = () => {
                if (longPressTimer.current) {
                  window.clearTimeout(longPressTimer.current);
                  longPressTimer.current = null;
                }
              };
              return (
              <button
                key={conv.id}
                onClick={() => {
                  if (selectionMode) toggleSelected(conv.id);
                  else onSelect(conv);
                }}
                onPointerDown={startLongPress}
                onPointerUp={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerMove={cancelLongPress}
                className={cn(
                  'w-full text-left px-3 py-3 transition-all border-b border-border/30 relative',
                  'hover:bg-accent/40 group',
                  !selectionMode && selectedId === conv.id && 'bg-accent/40 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-emerald-500 before:rounded-r',
                  selectionMode && isSelected && 'bg-primary/10',
                )}
              >
                <div className="@container flex gap-3 items-start">
                  {selectionMode && (
                    <div className="flex items-center pt-2 flex-shrink-0">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelected(conv.id)} />
                    </div>
                  )}
                  {/* Avatar — usa foto real se disponível */}
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-11 w-11">
                      {conv.visitor_avatar_url && (
                        <AvatarImage src={conv.visitor_avatar_url} alt={conv.visitor_name || 'Visitante'} />
                      )}
                      <AvatarFallback
                        className={cn(
                          'text-sm font-semibold',
                          conv.unread_count > 0 ? 'bg-primary/10 text-primary' : 'bg-muted',
                        )}
                      >
                        {getInitials(conv.visitor_name, conv.visitor_phone)}
                      </AvatarFallback>
                    </Avatar>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center border-2 border-background',
                            providerAvatarBadgeClass[provider],
                          )}
                        >
                          {providerIcon[provider]}
                          {provider === 'whatsapp_meta' && (
                            <BadgeCheck className="absolute -top-1 -right-1 h-3 w-3 text-[#0866FF] fill-background" strokeWidth={2.5} />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">{channelLabel}</TooltipContent>
                    </Tooltip>
                  </div>


                  {/* Conteúdo (linhas: nome / preview / tags) */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {/* Linha 1: nome (encurtado para sempre caber) */}
                    <div className="min-w-0">
                      <span
                        className={cn(
                          'block font-semibold text-[14px] leading-tight truncate',
                          conv.unread_count > 0 ? 'text-foreground' : 'text-foreground/90',
                        )}
                        title={conv.visitor_name || conv.visitor_phone || 'Visitante'}
                      >
                        {shortenName(conv.visitor_name || conv.visitor_phone || 'Visitante')}
                      </span>
                    </div>

                    {/* Linha 2: preview da última mensagem real */}
                    <p
                      className={cn(
                        'text-[13px] truncate mt-1 min-w-0 w-full overflow-hidden',
                        conv.unread_count > 0
                          ? 'text-foreground font-medium'
                          : 'text-muted-foreground',
                      )}
                      title={typeof preview === 'string' ? preview : undefined}
                    >
                      {preview || (
                        <span className="italic opacity-70">
                          {conv.last_message_at ? 'Mensagem indisponível' : 'Sem mensagens ainda'}
                        </span>
                      )}
                    </p>

                    {/* Linha 3: tags (setor + produto + atendente) */}
                    {(conv.sector_name || conv.product_name || (showAssignedUser && conv.assigned_user_name) || conv.current_agent_name) && (
                      <div className="flex items-center gap-1 flex-nowrap overflow-hidden mt-1.5 min-w-0">
                        {conv.sector_name && (
                          <Badge
                            className="h-4 px-1.5 text-[10px] border font-medium max-w-[90px] truncate flex-shrink-0"
                            style={{
                              backgroundColor: conv.sector_color ? `${conv.sector_color}1a` : undefined,
                              color: conv.sector_color || undefined,
                              borderColor: conv.sector_color ? `${conv.sector_color}40` : undefined,
                            }}
                            title={conv.sector_name}
                          >
                            {conv.sector_name}
                          </Badge>
                        )}
                        {conv.product_name && (
                          <Badge
                            variant="outline"
                            className="hidden @[240px]:inline-flex h-4 px-1.5 text-[10px] font-medium max-w-[110px] truncate bg-muted/40 min-w-0"
                            title={conv.product_name}
                          >
                            <span className="truncate">{conv.product_name}</span>
                          </Badge>
                        )}
                        {showAssignedUser && conv.assigned_user_name ? (
                          <Badge
                            variant="secondary"
                            className="h-5 px-1 pr-1.5 text-[10px] flex items-center gap-1 max-w-[140px] flex-shrink-0"
                            title={`Atendente: ${conv.assigned_user_name}`}
                          >
                            <Avatar className="h-3.5 w-3.5 flex-shrink-0">
                              {conv.assigned_user_avatar && (
                                <AvatarImage src={conv.assigned_user_avatar} alt={conv.assigned_user_name} />
                              )}
                              <AvatarFallback className="text-[8px] bg-primary/15 text-primary font-semibold">
                                {conv.assigned_user_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate">{conv.assigned_user_name}</span>
                          </Badge>
                        ) : conv.current_agent_name ? (
                          <Badge
                            className="h-4 px-1.5 text-[10px] flex items-center gap-1 border bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 max-w-[130px] flex-shrink-0"
                            title={`${conv.current_agent_name} · IA`}
                          >
                            <Bot className="h-2.5 w-2.5 flex-shrink-0" />
                            <span className="truncate">{conv.current_agent_name} · IA</span>
                          </Badge>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Coluna direita fixa: data + canal + badge de não-lidas */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 pl-1 max-w-[72px]">
                    <span
                      className={cn(
                        'text-[11px] whitespace-nowrap font-medium leading-none',
                        conv.unread_count > 0 ? 'text-emerald-600' : 'text-muted-foreground',
                      )}
                    >
                      {formatDate(conv.last_message_at)}
                    </span>
                    {conv.unread_count > 0 && (
                      <Badge className="h-5 min-w-[22px] px-1.5 text-[11px] rounded-full bg-emerald-500 hover:bg-emerald-500 text-white">
                        {conv.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
              );
            })}
            {/* Sentinel para scroll infinito */}
            <div ref={sentinelRef} aria-hidden className="h-1" />
            {isFetchingNextPage && (
              <div className="py-3 text-center text-xs text-muted-foreground">
                Carregando mais…
              </div>
            )}
            {!hasNextPage && filteredConversations.length > 20 && (
              <div className="py-3 text-center text-[11px] text-muted-foreground/70">
                Fim da lista
              </div>
            )}
          </div>

        )}
      </ScrollArea>
    </div>
  );
}

function TabButton({
  label,
  count,
  isLoadingCount = false,
  active,
  onClick,
  badgeVariant,
}: {
  label: string;
  count: number;
  isLoadingCount?: boolean;
  active: boolean;
  onClick: () => void;
  badgeVariant: 'success' | 'danger' | 'muted';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-all',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-background/40',
      )}
    >
      <span className="truncate">{label}</span>
      {(isLoadingCount || count > 0) && (
        <span
          className={cn(
            'inline-flex items-center justify-center h-4 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold',
            badgeVariant === 'success' && 'bg-emerald-500 text-white',
            badgeVariant === 'danger' && 'bg-red-500 text-white',
            badgeVariant === 'muted' && 'bg-muted text-muted-foreground',
          )}
        >
          {isLoadingCount ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : count}
        </span>
      )}
    </button>
  );
}
