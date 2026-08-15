import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useTeamMembers } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';
import { useCreateTask } from '@/hooks/useTasks';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: { id: string; name: string };
  defaultTitle?: string;
  defaultDescription?: string;
}

export function CreateRadarTaskDialog({
  open,
  onOpenChange,
  lead,
  defaultTitle,
  defaultDescription,
}: Props) {
  const { profile, user } = useAuth();
  const orgId = profile?.organization_id;
  const { data: members } = useTeamMembers(orgId);
  const createTask = useCreateTask();

  const [title, setTitle] = useState(defaultTitle || '');
  const [description, setDescription] = useState(defaultDescription || '');
  const [assignee, setAssignee] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('high');
  const [dueIn, setDueIn] = useState<string>('4');

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle || `Follow-up com ${lead.name}`);
      setDescription(defaultDescription || '');
      setAssignee(user?.id || '');
      setPriority('high');
      setDueIn('4');
    }
  }, [open, defaultTitle, defaultDescription, lead.name, user?.id]);

  async function handleSubmit() {
    if (!orgId || !assignee) {
      toast.error('Selecione um responsável.');
      return;
    }
    if (!title.trim()) {
      toast.error('Defina um título.');
      return;
    }
    const due = new Date(Date.now() + Number(dueIn) * 3600 * 1000).toISOString();
    try {
      await createTask.mutateAsync({
        organization_id: orgId,
        user_id: assignee,
        lead_id: lead.id,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status: 'pending',
        due_date: due,
        created_by: user?.id || null,
      } as any);
      toast.success('Tarefa criada');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao criar tarefa');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar tarefa</DialogTitle>
          <DialogDescription>Atribua um follow-up para a equipe sobre {lead.name}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Contexto da análise do Radar..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Responsável</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {(members || []).map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Prazo</Label>
            <Select value={dueIn} onValueChange={setDueIn}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Em 1 hora</SelectItem>
                <SelectItem value="4">Em 4 horas</SelectItem>
                <SelectItem value="24">Amanhã</SelectItem>
                <SelectItem value="72">Em 3 dias</SelectItem>
                <SelectItem value="168">Em 1 semana</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createTask.isPending}>
            {createTask.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
