import { useState, useMemo } from 'react';
import { ContactCardBubble } from '@/components/chat/ContactCardBubble';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import {
  Bot, User, Check, CheckCheck, Clock, AlertCircle,
  MoreHorizontal, Pencil, Trash2, Reply, Forward, Star, X,
  Ban, RefreshCw, ShieldCheck
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatWhatsAppText, formatMessageTime, formatSenderLabel } from '@/lib/messageFormat';
import { extractMedia } from '@/lib/messageMedia';
import { MediaAttachment } from '@/components/seller/inbox/MediaAttachment';
import { ReactionPicker, ReactionList } from '@/components/seller/inbox/MessageReactions';
import type { ReactionSummary } from '@/hooks/useMessageReactions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { metaErrorFromMetadata } from '@/lib/metaErrors';

export interface MessageBubbleProps {
  id: string;
  content: string;
  senderType: 'visitor' | 'agent' | 'bot';
  senderName: string | null;
  createdAt: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  showAvatar?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  isDeleted?: boolean;
  editedAt?: string | null;
  isStarred?: boolean;
  forwardedFrom?: boolean;
  replyTo?: { id: string; content: string; sender_type: string } | null;
  onReply?: (messageId: string, content: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete?: (messageId: string) => void;
  onStar?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  currentUserId?: string;
  senderId?: string | null;
  metadata?: any;
  reactions?: ReactionSummary[];
  onReact?: (messageId: string, emoji: string) => void;
  onResend?: (messageId: string) => void;
  onVerifyNumber?: (messageId: string) => void;
}

export function MessageBubble({
  id,
  content,
  senderType,
  senderName,
  createdAt,
  status = 'sent',
  showAvatar = true,
  isFirstInGroup = true,
  isLastInGroup = true,
  isDeleted = false,
  editedAt,
  isStarred = false,
  forwardedFrom = false,
  replyTo,
  onReply,
  onEdit,
  onDelete,
  onStar,
  onForward,
  currentUserId,
  senderId,
  metadata,
  reactions = [],
  onReact,
  onResend,
  onVerifyNumber,
}: MessageBubbleProps) {
  const isVisitor = senderType === 'visitor';
  const isBot = senderType === 'bot';
  const isOwnMessage = senderType === 'agent' && senderId === currentUserId;
  const media = useMemo(() => extractMedia(metadata), [metadata]);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [showActions, setShowActions] = useState(false);

  // Deriva status real considerando metadata.delivery_status.
  // Suporta os 4 estados do WhatsApp: sent (1 ✓), delivered (2 ✓ cinza),
  // read (2 ✓ azul) e failed. Nunca rebaixa o status: se já está 'read',
  // não volta para 'delivered' por causa de um evento fora de ordem.
  const deliveryStatus = (metadata as any)?.delivery_status as string | undefined;
  const deliveryError = metaErrorFromMetadata(metadata, (metadata as any)?.error ?? null);
  const effectiveStatus = (() => {
    if (deliveryStatus === 'failed') return 'failed' as const;
    const rank: Record<string, number> = { sending: 0, sent: 1, delivered: 2, read: 3 };
    const metaState =
      deliveryStatus === 'delivered' || deliveryStatus === 'read' || deliveryStatus === 'sent'
        ? deliveryStatus
        : null;
    if (!metaState) return status;
    const propRank = rank[status] ?? 1;
    const metaRank = rank[metaState] ?? 1;
    return (metaRank >= propRank ? metaState : status) as typeof status;
  })();

  const StatusIcon = () => {
    if (isVisitor) return null;

    if (effectiveStatus === 'failed') {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex"><AlertCircle className="h-3.5 w-3.5 text-destructive" /></span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs font-medium">Falha ao enviar</p>
              {deliveryError && <p className="text-xs opacity-80 mt-1">{deliveryError}</p>}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    switch (effectiveStatus) {
      case 'sending':
        return <Clock className="h-3 w-3 opacity-50 animate-pulse" />;
      case 'sent':
        return <Check className="h-3 w-3 opacity-60" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 opacity-60" />;
      case 'read':
        // Azul "lido" estilo WhatsApp — usa azul fixo para diferenciar do verde do sistema
        return <CheckCheck className="h-3 w-3 text-sky-500" />;
      default:
        return null;
    }
  };

  const handleEditSave = () => {
    if (editContent.trim() && editContent !== content) {
      onEdit?.(id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditContent(content);
    setIsEditing(false);
  };

  const hasActions = onReply || onEdit || onDelete || onStar || onForward || onReact;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        "flex w-full max-w-full min-w-0 gap-2 group relative",
        isVisitor ? "justify-start" : "justify-end",
        !isLastInGroup && "mb-0.5",
        isLastInGroup && "mb-3"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Visitor Avatar */}
      {isVisitor && showAvatar && (
        <div className="w-8 flex-shrink-0">
          {isLastInGroup && (
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      {/* Action buttons - absolutely positioned so they don't add width to the row */}
      {hasActions && !isDeleted && !isEditing && (
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 transition-opacity duration-150",
          showActions ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
          isVisitor ? "right-2" : "left-2"
        )}>
          {onReact && (
            <ReactionPicker
              align={isVisitor ? 'start' : 'end'}
              onPick={(emoji) => onReact(id, emoji)}
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full bg-background border border-border shadow-sm">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isVisitor ? "start" : "end"} className="w-44">
              {!isVisitor && effectiveStatus === 'failed' && (onResend || onVerifyNumber) && (
                <>
                  {onVerifyNumber && (
                    <DropdownMenuItem onClick={() => onVerifyNumber(id)}>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Verificar número
                    </DropdownMenuItem>
                  )}
                  {onResend && (
                    <DropdownMenuItem onClick={() => onResend(id)}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reenviar
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
              {onReply && (
                <DropdownMenuItem onClick={() => onReply(id, content)}>
                  <Reply className="h-4 w-4 mr-2" />
                  Responder
                </DropdownMenuItem>
              )}
              {onForward && (
                <DropdownMenuItem onClick={() => onForward(id)}>
                  <Forward className="h-4 w-4 mr-2" />
                  Encaminhar
                </DropdownMenuItem>
              )}
              {onStar && (
                <DropdownMenuItem onClick={() => onStar(id)}>
                  <Star className={cn("h-4 w-4 mr-2", isStarred && "fill-yellow-400 text-yellow-400")} />
                  {isStarred ? 'Desfavoritar' : 'Favoritar'}
                </DropdownMenuItem>
              )}
              {isOwnMessage && onEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setIsEditing(true); setEditContent(content); }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </DropdownMenuItem>
                </>
              )}
              {!isVisitor && onDelete && (
                <DropdownMenuItem onClick={() => onDelete(id)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Apagar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Message Content */}
      <div
        className={cn(
          "max-w-[78%] sm:max-w-[72%] md:max-w-[36rem] min-w-0 px-3.5 py-2 transition-all relative overflow-hidden break-words [overflow-wrap:anywhere]",

          isVisitor
            ? cn(
                "bg-card text-foreground border border-border/60",
                isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-bl-md",
                isFirstInGroup && !isLastInGroup && "rounded-[18px] rounded-bl-md rounded-br-[18px]",
                !isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-tl-md rounded-bl-md",
                !isFirstInGroup && !isLastInGroup && "rounded-2xl"
              )
            : isBot
            ? cn(
                "bg-secondary text-secondary-foreground",
                isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-br-md",
                isFirstInGroup && !isLastInGroup && "rounded-[18px] rounded-br-md rounded-bl-[18px]",
                !isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-tr-md rounded-br-md",
                !isFirstInGroup && !isLastInGroup && "rounded-2xl"
              )
            : cn(
                // Verde claro (respeita white-label via --primary)
                "bg-primary/10 text-foreground",
                isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-br-md",
                isFirstInGroup && !isLastInGroup && "rounded-[18px] rounded-br-md rounded-bl-[18px]",
                !isFirstInGroup && isLastInGroup && "rounded-[18px] rounded-tr-md rounded-br-md",
                !isFirstInGroup && !isLastInGroup && "rounded-2xl"
              )
        )}
      >
        {/* Star indicator */}
        {isStarred && (
          <Star className="absolute -top-1 -right-1 h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
        )}

        {/* Forwarded label */}
        {forwardedFrom && !isDeleted && (
          <p className="text-[10px] opacity-60 mb-1 flex items-center gap-1">
            <Forward className="h-3 w-3" />
            Encaminhada
          </p>
        )}

        {/* Sender name (oculto quando for a própria mensagem do agente — reduz ruído visual) */}
        {!isVisitor && isFirstInGroup && !isDeleted && !isOwnMessage && (
          <p className="text-[10px] opacity-70 mb-1 font-medium">
            {formatSenderLabel({
              senderType,
              senderName,
              isOwnMessage,
              agentName: senderName,
            })}
          </p>
        )}

        {/* Reply preview */}
        {replyTo && !isDeleted && (
          <div className={cn(
            "text-[11px] mb-1.5 px-2 py-1 rounded border-l-2 truncate",
            isVisitor
              ? "bg-muted/60 border-muted-foreground/30 text-muted-foreground"
              : "bg-primary/10 border-primary/40 text-foreground/80"
          )}>
            <span className="font-medium block text-[10px]">
              {replyTo.sender_type === 'visitor' ? '👤 Visitante' : replyTo.sender_type === 'bot' ? '🤖 Bot' : '💬 Agente'}
            </span>
            <span className="line-clamp-1">{replyTo.content}</span>
          </div>
        )}

        {/* Message text or deleted state */}
        {isDeleted ? (
          <p className="text-sm italic opacity-60 flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5" />
            Mensagem apagada
          </p>
        ) : isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px] text-sm bg-background text-foreground resize-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleEditSave();
                }
                if (e.key === 'Escape') handleEditCancel();
              }}
            />
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={handleEditCancel}>
                <X className="h-3 w-3 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" className="h-6 text-xs px-2" onClick={handleEditSave}>
                <Check className="h-3 w-3 mr-1" />
                Salvar
              </Button>
            </div>
          </div>
        ) : (
          <>
            {Array.isArray((metadata as any)?.contacts) && (metadata as any).contacts.length > 0 && (
              <div className="mb-1">
                <ContactCardBubble contacts={(metadata as any).contacts} />
              </div>
            )}
            {media && (
              <div className={cn(content && content.trim() ? 'mb-2' : '')}>
                <MediaAttachment media={media} isOwn={!isVisitor && !isBot} messageId={id} />
              </div>
            )}
            {content && content.trim() && !(media && media.caption === content) && !(Array.isArray((metadata as any)?.contacts) && (metadata as any).contacts.length > 0) && (
              <MessageMarkdown content={content} isVisitor={isVisitor} />
            )}
          </>
        )}

        {/* Time and status */}
        {!isEditing && (
          <div
            className={cn(
              "flex items-center gap-1 mt-1",
              isVisitor ? "justify-start" : "justify-end"
            )}
          >
            <span className="text-[10px] text-muted-foreground/80">
              {formatMessageTime(createdAt, 'bubble')}
            </span>
            {editedAt && !isDeleted && (
              <span className="text-[10px] text-muted-foreground/70">
                (editada)
              </span>
            )}
            <StatusIcon />
          </div>
        )}

        {/* Reactions */}
        {!isDeleted && reactions.length > 0 && onReact && (
          <ReactionList
            reactions={reactions}
            onToggle={(emoji) => onReact(id, emoji)}
            isVisitor={isVisitor}
          />
        )}
      </div>

      {/* Agent/Bot Avatar */}
      {!isVisitor && showAvatar && (
        <div className="w-8 flex-shrink-0">
          {isLastInGroup && (
            <Avatar className="h-8 w-8">
              <AvatarFallback
                className={cn(
                  "text-xs",
                  isBot ? "bg-secondary" : "bg-primary text-primary-foreground"
                )}
              >
                {isBot ? <Bot className="h-4 w-4" /> : senderName?.charAt(0) || 'A'}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}
    </motion.div>
  );
}

/**
 * Renderiza conteúdo da mensagem com formatação WhatsApp -> Markdown.
 * Restringe os elementos permitidos para evitar HTML arbitrário.
 */
function MessageMarkdown({ content, isVisitor }: { content: string; isVisitor: boolean }) {
  const formatted = useMemo(() => formatWhatsAppText(content), [content]);
  const linkClass = 'underline decoration-primary/50 hover:decoration-primary text-primary';

  return (
    <div className="text-sm leading-relaxed break-words [overflow-wrap:anywhere]">
      <ReactMarkdown
        allowedElements={['p', 'strong', 'em', 'del', 'code', 'a', 'ul', 'ol', 'li', 'br', 'pre']}
        unwrapDisallowed
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('break-all', linkClass)}
              onClick={(e) => e.stopPropagation()}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded text-[12px] font-mono bg-foreground/10">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="p-2 rounded my-1 text-[12px] font-mono overflow-x-auto whitespace-pre-wrap bg-foreground/10">
              {children}
            </pre>
          ),
        }}
      >
        {formatted}
      </ReactMarkdown>
    </div>
  );
}
