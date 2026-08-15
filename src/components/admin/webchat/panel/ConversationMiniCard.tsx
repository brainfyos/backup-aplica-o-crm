import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ChannelBadge } from '@/components/seller/inbox/ChannelBadge';
import { cn } from '@/lib/utils';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PanelConversation } from '@/hooks/useAttendancePanel';

interface Props {
  conversation: PanelConversation;
  onClick: (id: string) => void;
}

function timeAgoColor(iso: string | null): string {
  if (!iso) return 'bg-muted text-muted-foreground';
  const diffMin = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diffMin < 5) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  if (diffMin < 30) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  return 'bg-destructive/15 text-destructive';
}

export function ConversationMiniCard({ conversation: c, onClick }: Props) {
  const name = c.lead_name || c.visitor_name || c.visitor_phone || 'Sem nome';
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const timeLabel = c.last_message_at
    ? formatDistanceToNowStrict(new Date(c.last_message_at), { locale: ptBR, addSuffix: false })
    : '—';
  const unread = c.unread_count_agents || 0;

  return (
    <button
      type="button"
      onClick={() => onClick(c.id)}
      className={cn(
        'w-full text-left p-2.5 rounded-lg border border-border bg-card',
        'hover:bg-accent/50 hover:border-primary/30 transition-colors',
        'flex items-center gap-2.5 group',
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={c.visitor_avatar_url || undefined} />
        <AvatarFallback className="text-xs">{initials || '?'}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <ChannelBadge channel={c.channel || 'webchat'} size="sm" />
          <span className="text-sm font-medium truncate flex-1">{name}</span>
          {unread > 0 && (
            <Badge variant="default" className="h-4 px-1.5 text-[10px] shrink-0">
              {unread}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', timeAgoColor(c.last_message_at))}>
            {timeLabel}
          </span>
          {c.sector_name && (
            <span className="text-[10px] text-muted-foreground truncate">{c.sector_name}</span>
          )}
        </div>
      </div>
    </button>
  );
}
