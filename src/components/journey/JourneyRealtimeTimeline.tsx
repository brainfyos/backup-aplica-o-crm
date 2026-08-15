import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useJourneyRealtimeFeed } from '@/hooks/useLeadJourney';
import type { JourneyCategory, JourneyFilters } from '@/lib/leadJourney';
import {
  Users, MessageSquare, Target, Briefcase, Calendar, FileText,
  Handshake, TrendingUp, Star, Zap, Radio,
} from 'lucide-react';

interface Props {
  filters: JourneyFilters | null;
  onLeadClick?: (leadId: string, leadName: string) => void;
}

const ICON: Record<JourneyCategory, any> = {
  origin: Users, contact: MessageSquare, attendance: Users, qualification: Target,
  opportunity: Briefcase, meeting: Calendar, proposal: FileText, negotiation: Handshake,
  sale: TrendingUp, post_sale: Star, system: Zap,
};
const TINT: Record<JourneyCategory, { chip: string; icon: string; badge: string }> = {
  origin:        { chip: 'bg-blue-500/10',    icon: 'text-blue-500',    badge: 'border-blue-500/30 text-blue-600 dark:text-blue-400' },
  contact:       { chip: 'bg-cyan-500/10',    icon: 'text-cyan-500',    badge: 'border-cyan-500/30 text-cyan-600 dark:text-cyan-400' },
  attendance:    { chip: 'bg-teal-500/10',    icon: 'text-teal-500',    badge: 'border-teal-500/30 text-teal-600 dark:text-teal-400' },
  qualification: { chip: 'bg-violet-500/10',  icon: 'text-violet-500',  badge: 'border-violet-500/30 text-violet-600 dark:text-violet-400' },
  opportunity:   { chip: 'bg-amber-500/10',   icon: 'text-amber-500',   badge: 'border-amber-500/30 text-amber-600 dark:text-amber-400' },
  meeting:       { chip: 'bg-orange-500/10',  icon: 'text-orange-500',  badge: 'border-orange-500/30 text-orange-600 dark:text-orange-400' },
  proposal:      { chip: 'bg-pink-500/10',    icon: 'text-pink-500',    badge: 'border-pink-500/30 text-pink-600 dark:text-pink-400' },
  negotiation:   { chip: 'bg-rose-500/10',    icon: 'text-rose-500',    badge: 'border-rose-500/30 text-rose-600 dark:text-rose-400' },
  sale:          { chip: 'bg-emerald-500/10', icon: 'text-emerald-500', badge: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' },
  post_sale:     { chip: 'bg-green-500/10',   icon: 'text-green-500',   badge: 'border-green-500/30 text-green-600 dark:text-green-400' },
  system:        { chip: 'bg-muted',          icon: 'text-muted-foreground', badge: '' },
};

export function JourneyRealtimeTimeline({ filters, onLeadClick }: Props) {
  const { data, isLoading } = useJourneyRealtimeFeed(filters);
  const qc = useQueryClient();

  useEffect(() => {
    if (!filters?.organizationId) return;
    const channel = supabase
      .channel(`journey-events-org-${filters.organizationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'journey_events', filter: `organization_id=eq.${filters.organizationId}` },
        () => qc.invalidateQueries({ queryKey: ['journey', 'realtime-feed'] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filters?.organizationId, qc]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          Timeline em Tempo Real
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">Tudo que aconteceu recentemente.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum evento recente. Assim que houver atividade, aparecerá aqui em tempo real.
          </p>
        ) : (
          <ScrollArea className="h-[460px] pr-3">
            <ol className="relative space-y-4">
              {/* trilho vertical */}
              <span className="absolute left-[74px] top-2 bottom-2 w-px bg-gradient-to-b from-border via-border to-transparent" aria-hidden />
              {data.map((e: any) => {
                const cat = (e.event_category as JourneyCategory) ?? 'system';
                const Icon = ICON[cat] ?? Radio;
                const t = TINT[cat] ?? TINT.system;
                return (
                  <li key={e.id} className="relative flex gap-4 items-start">
                    <div className="w-[60px] text-[11px] text-muted-foreground text-right tabular-nums pt-2 font-medium">
                      {formatDistanceToNow(new Date(e.occurred_at), { locale: ptBR, addSuffix: false })}
                    </div>
                    <div className={`relative z-10 flex-shrink-0 h-9 w-9 rounded-full grid place-items-center ${t.chip} ring-4 ring-background`}>
                      <Icon className={`h-4 w-4 ${t.icon}`} />
                    </div>
                    <div className="flex-1 min-w-0 rounded-xl border border-border/60 bg-card/60 p-3 hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-2 flex-wrap">
                        {e.channel && <Badge variant="outline" className={`text-[10px] ${t.badge}`}>{e.channel}</Badge>}
                        <span className="text-sm font-semibold truncate">{e.title ?? e.event_type}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {e.lead_name && (
                          <button onClick={() => e.lead_id && onLeadClick?.(e.lead_id, e.lead_name!)} className="hover:underline hover:text-foreground truncate font-medium">
                            {e.lead_name}
                          </button>
                        )}
                        {e.user_name && (
                          <>
                            <span>·</span>
                            <Avatar className="h-4 w-4">
                              {e.user_avatar && <AvatarImage src={e.user_avatar} />}
                              <AvatarFallback className="text-[8px]">{e.user_name[0]}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{e.user_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default JourneyRealtimeTimeline;
