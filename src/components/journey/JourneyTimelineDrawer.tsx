import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Phone, Mail, Calendar, User as UserIcon, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useJourneyLeadSummary, useJourneyTimeline } from '@/hooks/useLeadJourney';
import type { JourneyEvent } from '@/lib/leadJourney';

interface Props {
  leadId: string | null;
  leadName?: string;
  onClose: () => void;
}

function humanDelta(sec: number | null) {
  if (sec == null) return '';
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

const CATEGORY_COLOR: Record<string, string> = {
  origin: 'bg-blue-500', contact: 'bg-cyan-500', attendance: 'bg-teal-500',
  qualification: 'bg-violet-500', opportunity: 'bg-amber-500', meeting: 'bg-orange-500',
  proposal: 'bg-pink-500', negotiation: 'bg-rose-500', sale: 'bg-emerald-500',
  post_sale: 'bg-green-600', system: 'bg-muted-foreground',
};

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function JourneyTimelineDrawer({ leadId, leadName, onClose }: Props) {
  const { data, isLoading } = useJourneyTimeline(leadId);
  const { data: summary } = useJourneyLeadSummary(leadId);

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>Jornada — {summary?.name ?? leadName ?? 'Lead'}</SheetTitle>
        </SheetHeader>

        {summary && (
          <div className="mt-3 rounded-lg border border-border p-3 space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {summary.avatar_url && <AvatarImage src={summary.avatar_url} />}
                <AvatarFallback>{(summary.name ?? 'L')[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{summary.name ?? '—'}</div>
                <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                  {summary.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{summary.phone}</span>}
                  {summary.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{summary.email}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.lead_origin && <Badge variant="secondary" className="text-[10px]">Origem: {summary.lead_origin}</Badge>}
              {summary.utm_source && !summary.lead_origin && <Badge variant="secondary" className="text-[10px]">{summary.utm_source}</Badge>}
              {summary.utm_campaign && <Badge variant="outline" className="text-[10px]">Campanha: {summary.utm_campaign}</Badge>}
              {summary.utm_content && <Badge variant="outline" className="text-[10px]">Criativo: {summary.utm_content}</Badge>}
              {summary.temperature && <Badge variant="outline" className="text-[10px]">{summary.temperature}</Badge>}
              {summary.status && <Badge className="text-[10px]">{summary.status}</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              {summary.first_contact_at && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  1º contato: {format(new Date(summary.first_contact_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </div>
              )}
              {summary.assigned_name && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <UserIcon className="h-3 w-3" />
                  {summary.assigned_name}
                </div>
              )}
              {summary.deal_value > 0 && (
                <div className="flex items-center gap-1 text-emerald-500 font-medium col-span-2">
                  <TrendingUp className="h-3 w-3" />
                  {money(summary.deal_value)}
                </div>
              )}
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 mt-4 -mx-6 px-6">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Este lead ainda não tem eventos registrados.
            </p>
          ) : (
            <div className="relative pl-6 border-l border-border space-y-4 pb-6">
              {data.slice().reverse().map((e: JourneyEvent) => (
                <div key={e.id} className="relative">
                  <span
                    className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-2 ring-background ${
                      CATEGORY_COLOR[e.event_category] ?? 'bg-muted'
                    }`}
                  />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(e.occurred_at), "dd MMM 'às' HH:mm", { locale: ptBR })}</span>
                    {e.time_since_previous_seconds != null && (
                      <span className="opacity-70">· Δ {humanDelta(e.time_since_previous_seconds)}</span>
                    )}
                    {e.channel && <Badge variant="outline" className="text-[10px]">{e.channel}</Badge>}
                  </div>
                  <div className="text-sm font-medium mt-0.5">{e.title ?? e.event_type}</div>
                  {e.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{e.description}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
