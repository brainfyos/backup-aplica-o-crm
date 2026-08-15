import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, MessageSquare, Instagram, Facebook, FileText, ListChecks } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ChannelStatRow } from '@/hooks/useAttendanceReports';
import { channelLabel } from '@/hooks/useAttendanceReports';
import { cn } from '@/lib/utils';

const channelIcons: Record<string, { icon: LucideIcon; tint: string }> = {
  whatsapp: { icon: MessageCircle, tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  web_chat: { icon: MessageSquare, tint: 'bg-primary/10 text-primary' },
  instagram: { icon: Instagram, tint: 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400' },
  facebook: { icon: Facebook, tint: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  form: { icon: FileText, tint: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400' },
  quiz: { icon: ListChecks, tint: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
};

interface Props {
  channels: ChannelStatRow[];
}

export function ChannelGrid({ channels }: Props) {
  const visible = channels.filter(c => c.conversations > 0 || ['whatsapp', 'web_chat', 'instagram', 'facebook'].includes(c.channel));
  return (
    <Card className="rounded-2xl border bg-card shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Conversas por Canal</CardTitle>
        <p className="text-sm text-muted-foreground">De onde vêm as conversas e quais convertem</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map(c => {
            const meta = channelIcons[c.channel] ?? { icon: MessageSquare, tint: 'bg-muted text-muted-foreground' };
            const Icon = meta.icon;
            return (
              <div key={c.channel} className="rounded-xl border bg-background/40 p-4">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', meta.tint)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{channelLabel(c.channel)}</p>
                    <p className="text-xs text-muted-foreground">{c.pct}% do total</p>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{c.conversations}</p>
                    <p className="text-xs text-muted-foreground">conversas</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums text-primary">{c.conversions}</p>
                    <p className="text-xs text-muted-foreground">conversões</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
