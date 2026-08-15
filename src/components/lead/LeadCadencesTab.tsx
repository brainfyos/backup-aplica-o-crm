import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, StopCircle, CalendarClock, CheckCircle2, XCircle } from 'lucide-react';
import { CadencePicker } from '@/components/admin/cadences/CadencePicker';
import { toast } from 'sonner';

interface Enrollment {
  id: string;
  cadence_id: string;
  status: 'active' | 'completed' | 'stopped' | 'paused';
  current_step_index: number;
  enrolled_at: string;
  completed_at: string | null;
  stopped_at: string | null;
  stop_reason: string | null;
  source: string | null;
  cadence_name?: string;
  next_run_at?: string | null;
  last_message?: string | null;
}

const statusMeta: Record<string, { label: string; variant: any; icon: any }> = {
  active: { label: 'Ativo', variant: 'default', icon: CalendarClock },
  completed: { label: 'Concluído', variant: 'secondary', icon: CheckCircle2 },
  stopped: { label: 'Parado', variant: 'destructive', icon: StopCircle },
  paused: { label: 'Pausado', variant: 'outline', icon: XCircle },
};

interface LeadCadencesTabProps {
  leadId: string;
  organizationId: string;
}

export function LeadCadencesTab({ leadId, organizationId }: LeadCadencesTabProps) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('cadence_enrollments' as any)
      .select('*, cadences(name)')
      .eq('lead_id', leadId)
      .order('enrolled_at', { ascending: false });

    const rows = ((data as any[]) ?? []).map((r) => ({ ...r, cadence_name: r.cadences?.name }));

    // Próxima execução + última mensagem (para enrollments ativos)
    const activeIds = rows.filter((r) => r.status === 'active').map((r) => r.id);
    if (activeIds.length) {
      const { data: runs } = await supabase
        .from('cadence_step_runs' as any)
        .select('enrollment_id, scheduled_at, status, agent_message, executed_at')
        .in('enrollment_id', activeIds);
      const next: Record<string, string> = {};
      const last: Record<string, string> = {};
      ((runs as any[]) ?? []).forEach((r) => {
        if (r.status === 'scheduled' && (!next[r.enrollment_id] || r.scheduled_at < next[r.enrollment_id])) {
          next[r.enrollment_id] = r.scheduled_at;
        }
        if (r.status === 'sent' && r.agent_message) {
          if (!last[r.enrollment_id] || (r.executed_at && r.executed_at > last[r.enrollment_id])) {
            last[r.enrollment_id] = r.agent_message;
          }
        }
      });
      rows.forEach((r) => {
        r.next_run_at = next[r.id] ?? null;
        r.last_message = last[r.id] ?? null;
      });
    }
    setEnrollments(rows as Enrollment[]);
    setLoading(false);
  }, [leadId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAdd = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('cadence-enroll', {
        body: { cadence_id: picked, lead_ids: [leadId], source: 'manual' },
      });
      if (error) throw error;
      if ((data as any)?.enrolled > 0) toast.success('Lead inscrito na cadência');
      else if ((data as any)?.skipped_existing > 0) toast.info('Lead já estava nesta cadência');
      else toast.warning('Não foi possível inscrever (verifique filtros de exclusão)');
      setAddOpen(false);
      setPicked(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao inscrever');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async (enrollmentId: string) => {
    if (!confirm('Remover lead desta cadência?')) return;
    try {
      await supabase.functions.invoke('cadence-stop', {
        body: { enrollment_id: enrollmentId, reason: 'manual_lead_detail' },
      });
      toast.success('Lead removido da cadência');
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao remover');
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Cadências do Lead</h3>
          <p className="text-xs text-muted-foreground">Jornadas automatizadas inscritas ou já encerradas.</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Adicionar
        </Button>
      </div>

      {enrollments.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Lead não está em nenhuma cadência.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {enrollments.map((e) => {
            const meta = statusMeta[e.status] ?? statusMeta.active;
            const Icon = meta.icon;
            return (
              <Card key={e.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{e.cadence_name ?? 'Cadência'}</p>
                        <Badge variant={meta.variant} className="gap-1"><Icon className="h-3 w-3" />{meta.label}</Badge>
                        {e.source && <Badge variant="outline" className="text-xs">via {e.source}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Etapa atual: {e.current_step_index + 1} · Inscrito em {new Date(e.enrolled_at).toLocaleString('pt-BR')}
                      </p>
                      {e.status === 'active' && e.next_run_at && (
                        <p className="text-xs text-muted-foreground">
                          Próxima execução: {new Date(e.next_run_at).toLocaleString('pt-BR')}
                        </p>
                      )}
                      {e.status === 'stopped' && e.stop_reason && (
                        <p className="text-xs text-destructive mt-1">Motivo: {e.stop_reason}</p>
                      )}
                      {e.last_message && (
                        <p className="text-xs italic text-muted-foreground mt-2 line-clamp-2 border-l-2 border-primary/30 pl-2">
                          "{e.last_message}"
                        </p>
                      )}
                    </div>
                    {e.status === 'active' && (
                      <Button size="sm" variant="ghost" onClick={() => handleStop(e.id)}>
                        <StopCircle className="h-4 w-4 mr-1" />Remover
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Inscrever em uma cadência</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Selecione uma cadência ativa para inscrever este lead.</p>
            <CadencePicker value={picked} onChange={setPicked} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!picked || busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Inscrever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
