import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateTask } from '@/hooks/useTasks';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface QuickTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickTaskDialog({ open, onOpenChange }: QuickTaskDialogProps) {
  const { user } = useAuth();
  const createTask = useCreateTask();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  const reset = () => {
    setTitle('');
    setDescription('');
    setDueDate(new Date().toISOString().slice(0, 10));
    setPriority('medium');
  };

  const handleSubmit = async () => {
    if (!title.trim() || !user?.id) return;
    try {
      await createTask.mutateAsync({
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        priority,
        status: 'pending',
      } as any);
      toast({ title: 'Tarefa criada', description: 'Sua tarefa foi adicionada.' });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Não foi possível criar a tarefa', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qt-title">Título</Label>
            <Input id="qt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Ligar para cliente" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qt-desc">Descrição</Label>
            <Textarea id="qt-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes (opcional)" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qt-date">Vencimento</Label>
              <Input id="qt-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createTask.isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || createTask.isPending}>
            {createTask.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar tarefa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
