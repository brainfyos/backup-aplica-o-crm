import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useJourneyLeadsInStage } from '@/hooks/useLeadJourney';
import type { JourneyFilters, JourneyCategory } from '@/lib/leadJourney';

interface Props {
  filters: JourneyFilters | null;
  category: JourneyCategory | null;
  onClose: () => void;
  onLeadSelect: (leadId: string, leadName: string) => void;
}

const LABELS: Record<JourneyCategory, string> = {
  origin: 'Origem', contact: 'Primeiro Contato', attendance: 'Atendimento',
  qualification: 'Qualificação', opportunity: 'Oportunidade', meeting: 'Reunião',
  proposal: 'Proposta', negotiation: 'Negociação', sale: 'Venda',
  post_sale: 'Pós-venda', system: 'Sistema',
};

export function JourneyStageDrawer({ filters, category, onClose, onLeadSelect }: Props) {
  const { data, isLoading } = useJourneyLeadsInStage(filters, category);
  const open = !!category;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{category ? LABELS[category] : ''}</SheetTitle>
          <SheetDescription>Leads que passaram por esta etapa</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 mt-4 -mx-6 px-6">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum lead nesta etapa.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((l: any) => (
                <li key={l.id}>
                  <button
                    onClick={() => onLeadSelect(l.id, l.name)}
                    className="w-full text-left py-3 hover:bg-accent -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{l.name}</span>
                      {l.temperature && <Badge variant="outline" className="text-[10px]">{l.temperature}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {l.phone ?? l.email ?? '—'}
                    </div>
                    {l.last_event?.title && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {l.last_event.title}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
