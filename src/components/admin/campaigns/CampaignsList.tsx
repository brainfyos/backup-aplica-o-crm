import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Plus, Megaphone, Pause, Play, MoreVertical, Trash2,
  Users, Send, MessageCircle, AlertCircle, Calendar, Clock,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Campaign, CampaignPreparation, CampaignStats } from '@/hooks/useCampaigns';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_LABEL: Record<string, { label: string; variant: any }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  preparing: { label: 'Preparando', variant: 'outline' },
  active: { label: 'Ativa', variant: 'default' },
  paused: { label: 'Pausada', variant: 'outline' },
  completed: { label: 'Concluída', variant: 'secondary' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
};

const EMPTY_STATS: CampaignStats = {
  total: 0, queued: 0, sending: 0, sent: 0, responded: 0, failed: 0, skipped: 0, cancelled: 0,
};

export function CampaignsList({
  campaigns,
  stats,
  preparations,
  onNew,
  onOpen,
  onRefresh,
}: {
  campaigns: Campaign[];
  stats: Record<string, CampaignStats>;
  preparations?: Record<string, CampaignPreparation>;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const togglePause = async (c: Campaign) => {
    const next = c.status === 'paused' ? 'active' : 'paused';
    const { error } = await supabase.from('campaigns').update({ status: next }).eq('id', c.id);
    if (error) toast.error(error.message);
    else { toast.success(next === 'active' ? 'Campanha retomada' : 'Campanha pausada'); onRefresh(); }
  };

  const remove = async (c: Campaign) => {
    if (!confirm(`Excluir a campanha "${c.name}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('campaigns').delete().eq('id', c.id);
    if (error) toast.error(error.message);
    else { toast.success('Campanha excluída'); onRefresh(); }
  };

  if (!campaigns.length) {
    return (
      <Card>
        <CardContent className="p-10 flex flex-col items-center text-center gap-4">
          <div className="rounded-full bg-primary/10 p-4">
            <Megaphone className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold">Nenhuma campanha ainda</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Crie sua primeira campanha inteligente. Selecione público, contexto e deixe o agente IA iniciar conversas personalizadas com cada lead.
            </p>
          </div>
          <Button onClick={onNew}><Plus className="h-4 w-4 mr-2" />Nova Campanha</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onNew}><Plus className="h-4 w-4 mr-2" />Nova Campanha</Button>
      </div>
      <div className="grid gap-3">
        {campaigns.map((c) => {
          const status = STATUS_LABEL[c.status] ?? STATUS_LABEL.draft;
          const totals = c.totals ?? {};
          const s = stats[c.id] ?? EMPTY_STATS;
          const prep = preparations?.[c.id];
          const audience = totals.will_receive ?? s.total;
          const dispatched = s.sent + s.responded;
          const inProgress = s.queued + s.sending;
          const progress = s.total > 0 ? Math.round(((s.total - inProgress) / s.total) * 100) : 0;
          const prepProgress = prep && prep.total_contacts > 0
            ? Math.round((prep.processed_contacts / prep.total_contacts) * 100)
            : 0;
          const responseRate = dispatched > 0 ? Math.round((s.responded / dispatched) * 100) : 0;
          const startDate = c.started_at ?? c.scheduled_at;

          return (
            <Card key={c.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <button onClick={() => onOpen(c.id)} className="flex-1 text-left space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium truncate">{c.name}</h3>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    {c.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {(c.status === 'active' || c.status === 'paused') && (
                      <Button variant="ghost" size="icon" onClick={() => togglePause(c)} title={c.status === 'paused' ? 'Retomar' : 'Pausar'}>
                        {c.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpen(c.id)}>Abrir</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => remove(c)}>
                          <Trash2 className="h-4 w-4 mr-2" />Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <button onClick={() => onOpen(c.id)} className="w-full text-left space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Stat icon={<Users className="h-3.5 w-3.5" />} label="Público" value={audience || '—'} />
                    <Stat icon={<Send className="h-3.5 w-3.5" />} label="Disparados" value={`${dispatched}/${s.total || audience || 0}`} />
                    <Stat icon={<MessageCircle className="h-3.5 w-3.5 text-emerald-500" />} label="Respostas" value={`${s.responded}${dispatched ? ` (${responseRate}%)` : ''}`} />
                    <Stat icon={<AlertCircle className="h-3.5 w-3.5 text-destructive" />} label="Falhas" value={s.failed} />
                  </div>

                  {c.status === 'preparing' && prep && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Preparando contatos…</span>
                        <span>{prep.processed_contacts}/{prep.total_contacts} ({prepProgress}%)</span>
                      </div>
                      <Progress value={prepProgress} className="h-1.5" />
                    </div>
                  )}

                  {prep?.status === 'failed' && (
                    <p className="text-[11px] text-destructive">Falha na preparação: {prep.error ?? 'erro desconhecido'}</p>
                  )}

                  {s.total > 0 && (c.status === 'active' || c.status === 'paused' || c.status === 'completed') && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Progresso</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Criada em {format(new Date(c.created_at), "dd 'de' MMM yyyy, HH:mm", { locale: ptBR })}
                    </span>
                    {startDate && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {c.started_at ? 'Iniciada' : 'Agendada para'} {format(new Date(startDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    )}
                    {c.completed_at && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        Concluída {formatDistanceToNow(new Date(c.completed_at), { locale: ptBR, addSuffix: true })}
                      </span>
                    )}
                    {(totals.excluded ?? 0) > 0 && <span>Excluídos: {totals.excluded}</span>}
                  </div>
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide">
        {icon}<span>{label}</span>
      </div>
      <p className="text-sm font-semibold leading-tight mt-0.5">{value}</p>
    </div>
  );
}
