import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ConversationMiniCard } from './ConversationMiniCard';
import type { PanelConversation } from '@/hooks/useAttendancePanel';

interface Props {
  title: string;
  subtitle?: string;
  count: number;
  color?: string | null;
  avatarUrl?: string | null;
  initials?: string;
  icon?: ReactNode;
  items: PanelConversation[];
  onCardClick: (id: string) => void;
  accent?: 'primary' | 'amber' | 'emerald' | 'violet';
}

const accentBg: Record<NonNullable<Props['accent']>, string> = {
  primary: 'bg-primary/10 text-primary',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
};

export function PanelColumn({ title, subtitle, count, color, avatarUrl, initials, icon, items, onCardClick, accent = 'primary' }: Props) {
  return (
    <div className="w-72 shrink-0 rounded-xl border border-border bg-muted/30 flex flex-col snap-start">
      <div className="p-3 border-b border-border flex items-center gap-2.5">
        {icon ? (
          <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', accentBg[accent])} style={color ? { backgroundColor: `${color}20`, color } : undefined}>
            {icon}
          </div>
        ) : (
          <Avatar className="h-9 w-9">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback className={cn('text-xs', accentBg[accent])}>{initials || '?'}</AvatarFallback>
          </Avatar>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate">{title}</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] shrink-0">
              {count}
            </Badge>
          </div>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>

      <ScrollArea className="h-[420px]">
        <div className="p-2 space-y-1.5">
          {items.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">Nenhuma conversa</div>
          ) : (
            items.map((c) => <ConversationMiniCard key={c.id} conversation={c} onClick={onCardClick} />)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
