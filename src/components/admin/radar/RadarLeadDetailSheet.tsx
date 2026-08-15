import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Copy, Flame, Snowflake, Skull, CloudSun, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RadarLeadActions } from './RadarLeadActions';
import type { ScanItem } from '@/hooks/useOpportunityScan';

const COLORS = { hot: '#ef4444', warm: '#f97316', cold: '#3b82f6', lost: '#71717a' };
const ICONS = { hot: Flame, warm: CloudSun, cold: Snowflake, lost: Skull };
const LABELS = { hot: 'HOT', warm: 'WARM', cold: 'COLD', lost: 'LOST' };

interface Props {
  item: ScanItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenConversation?: (id: string) => void;
}

export function RadarLeadDetailSheet({ item, open, onOpenChange, onOpenConversation }: Props) {
  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: ['radar-conv-preview', item?.conversation_id],
    queryFn: async () => {
      if (!item?.conversation_id) return [];
      const { data } = await supabase
        .from('webchat_messages')
        .select('id, direction, content, created_at')
        .eq('conversation_id', item.conversation_id)
        .order('created_at', { ascending: false })
        .limit(10);
      return (data || []).reverse();
    },
    enabled: !!item?.conversation_id && open,
  });

  const { data: lead } = useQuery({
    queryKey: ['radar-lead-extra', item?.lead_id],
    queryFn: async () => {
      if (!item?.lead_id) return null;
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, temperature, deal_value, assigned_to, sector_id, product_id, created_at')
        .eq('id', item.lead_id)
        .maybeSingle();
      return data;
    },
    enabled: !!item?.lead_id && open,
  });

  if (!item) return null;
  const Icon = ICONS[item.classification];
  const color = COLORS[item.classification];
  const snap = item.lead_snapshot || {};
  const name = snap.name || lead?.name || 'Sem nome';

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success('Copiado');
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" style={{ color }} />
                <span className="truncate">{name}</span>
              </SheetTitle>
              <SheetDescription className="truncate">
                {snap.phone || lead?.phone || snap.email || lead?.email || '—'}
              </SheetDescription>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge style={{ backgroundColor: color, borderColor: color }}>
                {LABELS[item.classification]}
              </Badge>
              <span className="text-xs text-muted-foreground">Score {item.score}</span>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Análise da IA */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Análise da IA</h3>
              {item.reason && <p className="text-sm text-muted-foreground">{item.reason}</p>}

              {item.signals?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.signals.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
              )}

              {item.suggested_action && (
                <div className="rounded-md bg-muted/50 p-2 text-sm">
                  <span className="font-medium">💡 Sugestão: </span>
                  <span className="text-muted-foreground">{item.suggested_action}</span>
                </div>
              )}

              {item.followup_message && (
                <div className="rounded-md border p-2 text-sm space-y-2">
                  <div className="text-xs text-muted-foreground font-medium">Mensagem sugerida</div>
                  <p className="italic">"{item.followup_message}"</p>
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => copy(item.followup_message!)}>
                    <Copy className="h-3 w-3" /> Copiar
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            {/* Snapshot */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Dados do lead</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <Info label="Canal" value={snap.channel} />
                <Info label="Produto" value={snap.product_name || snap.product_id} />
                <Info label="Setor" value={snap.sector_name} />
                <Info label="Atendente" value={snap.assigned_name} />
                <Info label="Temperatura" value={lead?.temperature || snap.temperature} />
                <Info
                  label="Valor"
                  value={lead?.deal_value ? `R$ ${Number(lead.deal_value).toLocaleString('pt-BR')}` : snap.deal_value}
                />
                <Info label="Última msg" value={snap.last_message_at ? formatDistanceToNow(new Date(snap.last_message_at), { addSuffix: true, locale: ptBR }) : null} />
                <Info label="Mensagens" value={snap.message_count} />
              </div>
              {snap.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {snap.tags.map((t: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px]" style={t.color ? { borderColor: t.color, color: t.color } : undefined}>
                      {t.name || t}
                    </Badge>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* Timeline */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Últimas mensagens</h3>
              {loadingMsgs && <Loader2 className="h-4 w-4 animate-spin" />}
              {!loadingMsgs && (!messages || messages.length === 0) && (
                <p className="text-xs text-muted-foreground">Nenhuma mensagem disponível.</p>
              )}
              <div className="space-y-2">
                {(messages || []).map((m: any) => (
                  <div
                    key={m.id}
                    className={`rounded-md p-2 text-xs ${m.direction === 'inbound' ? 'bg-muted/40' : 'bg-primary/5 border border-primary/10'}`}
                  >
                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">
                      {m.direction === 'inbound' ? 'Cliente' : 'Atendente'} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                    </div>
                    <div className="line-clamp-4">{m.content}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>

        <div className="border-t p-3 bg-background">
          <RadarLeadActions item={item} onOpenConversation={onOpenConversation} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium truncate">{String(value)}</span>
    </>
  );
}
