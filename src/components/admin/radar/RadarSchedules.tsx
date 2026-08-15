import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useOpportunitySchedules, useUpsertSchedule, useDeleteSchedule, type ScanFilters, type ActionsConfig } from '@/hooks/useOpportunityScan';
import { Plus, Trash2, Edit2, CalendarClock } from 'lucide-react';

const FREQ_OPTIONS = [
  { id: '0 8 * * *', label: 'Diariamente às 8h' },
  { id: '0 8,14 * * *', label: '2x ao dia (8h e 14h)' },
  { id: '0 9 * * 1', label: 'Toda segunda às 9h' },
  { id: '0 */6 * * *', label: 'A cada 6 horas' },
];

export function RadarSchedules({ defaultFilters, defaultActions }: { defaultFilters: ScanFilters; defaultActions: ActionsConfig }) {
  const { data: schedules } = useOpportunitySchedules();
  const upsert = useUpsertSchedule();
  const del = useDeleteSchedule();
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  function openNew() {
    setEditing({
      name: 'Novo agendamento',
      cron_expression: '0 8 * * *',
      is_active: true,
      filters: defaultFilters,
      actions_config: defaultActions,
    });
    setOpen(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setOpen(true);
  }

  async function save() {
    await upsert.mutateAsync(editing);
    setOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Agendamentos automáticos</CardTitle>
            <CardDescription>Configure o radar para rodar automaticamente</CardDescription>
          </div>
          <Button onClick={openNew} size="sm" className="gap-1"><Plus className="h-4 w-4" />Novo</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!schedules?.length && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-30" />
            Nenhum agendamento configurado
          </div>
        )}
        {schedules?.map((s: any) => (
          <div key={s.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{s.name}</span>
                {s.is_active ? <Badge variant="default" className="text-[10px]">Ativo</Badge> : <Badge variant="outline" className="text-[10px]">Pausado</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {FREQ_OPTIONS.find((f) => f.id === s.cron_expression)?.label || s.cron_expression}
                {s.last_run_at && ` • Última: ${new Date(s.last_run_at).toLocaleString('pt-BR')}`}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Edit2 className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar' : 'Novo'} agendamento</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>Frequência</Label>
                <Select value={editing.cron_expression} onValueChange={(v) => setEditing({ ...editing, cron_expression: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQ_OPTIONS.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                Os filtros e ações usados serão os configurados na aba <strong>Rodar Análise</strong> no momento da criação.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={upsert.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
