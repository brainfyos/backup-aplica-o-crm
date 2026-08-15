import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Play, Pause, Trash2, Bot, Users, TrendingUp, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Cadence, CadenceEnrollmentStats } from '@/hooks/useCadences';

interface Props {
  cadences: Cadence[];
  stats: Record<string, CadenceEnrollmentStats>;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}

const STATUS_LABEL: Record<string, { label: string; variant: any }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativa', variant: 'default' },
  paused: { label: 'Pausada', variant: 'outline' },
  archived: { label: 'Arquivada', variant: 'secondary' },
};

export function CadencesList({ cadences, stats, onNew, onOpen, onRefresh }: Props) {
  const toggleStatus = async (c: Cadence) => {
    const next = c.status === 'active' ? 'paused' : 'active';
    const { error } = await supabase.from('cadences' as any).update({ status: next }).eq('id', c.id);
    if (error) toast.error(error.message); else { toast.success(next === 'active' ? 'Cadência ativada' : 'Cadência pausada'); onRefresh(); }
  };

  const remove = async (c: Cadence) => {
    if (!confirm(`Excluir a cadência "${c.name}"? Esta ação removerá também as inscrições e execuções.`)) return;
    const { error } = await supabase.from('cadences' as any).delete().eq('id', c.id);
    if (error) toast.error(error.message); else { toast.success('Cadência excluída'); onRefresh(); }
  };

  if (!cadences.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-medium">Nenhuma cadência ainda</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Crie sua primeira jornada inteligente. A IA fará tentativas progressivas de contato com cada lead, sempre baseadas em contexto.
            </p>
          </div>
          <Button onClick={onNew}><Plus className="h-4 w-4 mr-2" /> Nova Cadência</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onNew}><Plus className="h-4 w-4 mr-2" /> Nova Cadência</Button>
      </div>

      <div className="grid gap-4">
        {cadences.map((c) => {
          const s = stats[c.id] ?? { active: 0, completed: 0, stopped: 0, paused: 0, total: 0 };
          const sLabel = STATUS_LABEL[c.status] ?? STATUS_LABEL.draft;
          const respondedRate = s.total ? Math.round((s.completed / s.total) * 100) : 0;

          return (
            <Card key={c.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg truncate cursor-pointer hover:text-primary" onClick={() => onOpen(c.id)}>{c.name}</h3>
                      <Badge variant={sLabel.variant}>{sLabel.label}</Badge>
                      {c.objective && <Badge variant="outline" className="text-xs">{c.objective}</Badge>}
                    </div>
                    {c.description && <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => toggleStatus(c)} title={c.status === 'active' ? 'Pausar' : 'Ativar'}>
                      {c.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c)} title="Excluir">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
                  <Stat icon={Users} label="Leads ativos" value={s.active} />
                  <Stat icon={TrendingUp} label="Concluídos" value={s.completed} hint={s.total ? `${respondedRate}%` : undefined} />
                  <Stat icon={Pause} label="Interrompidos" value={s.stopped} />
                  <Stat icon={Clock} label="Última execução" value={c.last_executed_at ? formatDistanceToNow(new Date(c.last_executed_at), { locale: ptBR, addSuffix: true }) : '—'} small />
                </div>

                <div className="flex justify-end pt-1">
                  <Button size="sm" variant="outline" onClick={() => onOpen(c.id)}>Abrir</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, small }: { icon: any; label: string; value: any; hint?: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={small ? 'text-sm font-medium truncate' : 'text-lg font-semibold leading-tight'}>
          {value} {hint && <span className="text-xs text-muted-foreground font-normal">({hint})</span>}
        </div>
      </div>
    </div>
  );
}
