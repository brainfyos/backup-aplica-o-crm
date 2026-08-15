import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  Mail,
  MessageCircle,
  CalendarDays,
  ListTodo,
  Workflow,
  Plus,
  CheckCircle2,
  Circle,
  Loader2,
  Filter,
  MoreVertical,
  ExternalLink,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';
import { useAuth } from '@/hooks/useAuth';
import {
  useSellerActivities,
  computeCounts,
  filterByTab,
  type Activity,
  type ActivityType,
  type ActivityPriority,
} from '@/hooks/useSellerActivities';
import {
  useCompleteTask,
  useUncompleteTask,
  useCreateTask,
  useDeleteTask,
} from '@/hooks/useTasks';

interface MobileActivityCenterProps {
  userId: string;
  productId: string;
  productName?: string;
}

const TYPE_ICON: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  task: ListTodo,
  followup: ListTodo,
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  meeting: CalendarDays,
  scheduled_message: MessageCircle,
  cadence_action: Workflow,
};

const TYPE_TINT: Record<ActivityType, string> = {
  task: 'bg-primary/10 text-primary',
  followup: 'bg-primary/10 text-primary',
  call: 'bg-red-500/10 text-red-600',
  email: 'bg-amber-500/10 text-amber-600',
  whatsapp: 'bg-emerald-500/10 text-emerald-600',
  meeting: 'bg-emerald-500/10 text-emerald-600',
  scheduled_message: 'bg-sky-500/10 text-sky-600',
  cadence_action: 'bg-violet-500/10 text-violet-600',
};

const TYPE_LABEL: Record<ActivityType, string> = {
  task: 'Tarefa',
  followup: 'Follow-up',
  call: 'Ligação',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  meeting: 'Reunião',
  scheduled_message: 'Msg agendada',
  cadence_action: 'Cadência',
};

const PRIORITY_LABEL: Record<ActivityPriority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const PRIORITY_BADGE: Record<ActivityPriority, string> = {
  urgent: 'bg-destructive/10 text-destructive border-destructive/20',
  high: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  medium: 'bg-primary/10 text-primary border-primary/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const TABS = [
  { id: 'today', label: 'Hoje' },
  { id: 'overdue', label: 'Atrasadas' },
  { id: 'scheduled', label: 'Próximas' },
  { id: 'meetings', label: 'Reuniões' },
  { id: 'cadences', label: 'Cadências' },
  { id: 'done', label: 'Concluídas' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function formatDue(due: string) {
  const date = new Date(due);
  const past = isPast(date);
  const rel = formatDistanceToNow(date, { locale: ptBR, addSuffix: true });
  return {
    rel,
    abs: format(date, "dd/MM 'às' HH:mm", { locale: ptBR }),
    past,
  };
}

export function MobileActivityCenter({ userId, productId, productName }: MobileActivityCenterProps) {
  const navigate = useNavigate();
  const haptics = useHaptics();
  const { profile } = useAuth();
  const { data: activities, isLoading } = useSellerActivities(userId, productId);
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();

  const [tab, setTab] = useState<TabId>('today');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<ActivityPriority | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);

  // form novo
  const [ntTitle, setNtTitle] = useState('');
  const [ntDesc, setNtDesc] = useState('');
  const [ntType, setNtType] = useState<string>('task');
  const [ntPriority, setNtPriority] = useState<string>('medium');
  const [ntDue, setNtDue] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return d.toISOString().slice(0, 16);
  });

  const counts = useMemo(() => computeCounts(activities ?? []), [activities]);

  const filtered = useMemo(() => {
    let list = filterByTab(activities ?? [], tab);
    if (typeFilter !== 'all') list = list.filter((a) => a.type === typeFilter);
    if (priorityFilter !== 'all') list = list.filter((a) => a.priority === priorityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q) ||
          a.lead?.name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [activities, tab, typeFilter, priorityFilter, search]);

  const handleToggle = (a: Activity) => {
    if (a.source !== 'task') {
      toast.info('Conclusão disponível apenas para tarefas.');
      return;
    }
    haptics.selection();
    if (a.status === 'completed') {
      uncompleteTask.mutate(a.source_id);
    } else {
      completeTask.mutate(a.source_id);
    }
  };

  const handleOpenLead = (a: Activity) => {
    if (!a.open_lead_id) {
      toast.info('Atividade sem lead vinculado.');
      return;
    }
    navigate(`/lead/${a.open_lead_id}`);
  };

  const handleDelete = (a: Activity) => {
    if (a.source !== 'task') {
      toast.info('Exclusão disponível apenas para tarefas.');
      return;
    }
    deleteTask.mutate(a.source_id);
  };

  const handleCreate = () => {
    if (!ntTitle.trim()) {
      toast.error('Informe um título.');
      return;
    }
    createTask.mutate(
      {
        title: ntTitle.trim(),
        description: ntDesc.trim() || null,
        type: ntType,
        priority: ntPriority,
        due_date: new Date(ntDue).toISOString(),
        status: 'pending',
        user_id: userId,
        product_id: productId,
        organization_id: profile?.organization_id ?? undefined,
        created_by: userId,
      } as any,
      {
        onSuccess: () => {
          toast.success('Atividade criada.');
          setNewTaskOpen(false);
          setNtTitle('');
          setNtDesc('');
        },
        onError: (e: any) => toast.error(e?.message ?? 'Erro ao criar.'),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabCount = (id: TabId) => {
    switch (id) {
      case 'today':
        return counts.today;
      case 'overdue':
        return counts.overdue;
      case 'scheduled':
        return counts.scheduled;
      case 'meetings':
        return counts.meetings;
      case 'cadences':
        return counts.cadences;
      case 'done':
        return counts.completed;
      default:
        return 0;
    }
  };

  const activeFilters =
    (typeFilter !== 'all' ? 1 : 0) + (priorityFilter !== 'all' ? 1 : 0);

  return (
    <div className="relative pb-24">
      {/* Tabs roláveis */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-none">
          {TABS.map((t) => {
            const active = tab === t.id;
            const n = tabCount(t.id);
            return (
              <button
                key={t.id}
                onClick={() => {
                  haptics.selection();
                  setTab(t.id);
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {t.label}
                {n > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center justify-center text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1',
                      active
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-background text-foreground',
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Busca + filtros */}
        <div className="flex items-center gap-2 px-4 pb-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar atividade ou lead..."
            className="h-9 text-sm"
          />
          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 relative shrink-0">
                <Filter className="h-4 w-4" />
                {activeFilters > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                    {activeFilters}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={typeFilter}
                    onValueChange={(v) => setTypeFilter(v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {(Object.keys(TYPE_LABEL) as ActivityType[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {TYPE_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select
                    value={priorityFilter}
                    onValueChange={(v) => setPriorityFilter(v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {(Object.keys(PRIORITY_LABEL) as ActivityPriority[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {PRIORITY_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <SheetFooter className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setTypeFilter('all');
                    setPriorityFilter('all');
                  }}
                >
                  Limpar
                </Button>
                <Button className="flex-1" onClick={() => setFilterOpen(false)}>
                  Aplicar
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Lista */}
      <div className="px-4 py-3 space-y-2">
        {filtered.length === 0 ? (
          <EmptyTab tab={tab} />
        ) : (
          filtered.map((a) => {
            const Icon = TYPE_ICON[a.type];
            const due = formatDue(a.due_at);
            const isDone = a.status === 'completed';
            const isOverdue = a.status === 'overdue';
            const isTaskSource = a.source === 'task';

            return (
              <Card
                key={a.id}
                className={cn(
                  'p-3 border-border transition-all active:scale-[0.99]',
                  isDone && 'opacity-60',
                  isOverdue && 'border-destructive/30',
                )}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleToggle(a)}
                    disabled={!isTaskSource}
                    className="mt-0.5 shrink-0 touch-target disabled:opacity-50"
                    aria-label={isDone ? 'Reabrir' : 'Concluir'}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : isOverdue ? (
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>

                  <button
                    onClick={() => handleOpenLead(a)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center h-5 w-5 rounded',
                          TYPE_TINT[a.type],
                        )}
                      >
                        <Icon className="h-3 w-3" />
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                        {TYPE_LABEL[a.type]}
                      </span>
                    </div>
                    <p
                      className={cn(
                        'font-medium text-sm text-foreground line-clamp-2',
                        isDone && 'line-through text-muted-foreground',
                      )}
                    >
                      {a.title}
                    </p>
                    {a.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {a.description}
                      </p>
                    )}
                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] h-5 px-1.5', PRIORITY_BADGE[a.priority])}
                      >
                        {PRIORITY_LABEL[a.priority]}
                      </Badge>
                      <span
                        className={cn(
                          'text-[11px] font-medium',
                          isOverdue ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {due.rel}
                      </span>
                      {a.lead?.name && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                          · {a.lead.name}
                        </span>
                      )}
                    </div>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {a.open_lead_id && (
                        <DropdownMenuItem onClick={() => handleOpenLead(a)}>
                          <ExternalLink className="h-4 w-4 mr-2" /> Abrir lead
                        </DropdownMenuItem>
                      )}
                      {isTaskSource && !isDone && (
                        <DropdownMenuItem onClick={() => handleToggle(a)}>
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Concluir
                        </DropdownMenuItem>
                      )}
                      {isTaskSource && isDone && (
                        <DropdownMenuItem onClick={() => handleToggle(a)}>
                          <Circle className="h-4 w-4 mr-2" /> Reabrir
                        </DropdownMenuItem>
                      )}
                      {isTaskSource && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(a)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* FAB criar tarefa */}
      <Sheet open={newTaskOpen} onOpenChange={setNewTaskOpen}>
        <SheetTrigger asChild>
          <Button
            size="icon"
            className="fixed right-4 bottom-24 h-14 w-14 rounded-full shadow-lg z-20"
            onClick={() => haptics.selection()}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nova atividade{productName ? ` · ${productName}` : ''}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="nt-title">Título</Label>
              <Input
                id="nt-title"
                value={ntTitle}
                onChange={(e) => setNtTitle(e.target.value)}
                placeholder="Ex.: Ligar para João"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nt-desc">Descrição (opcional)</Label>
              <Textarea
                id="nt-desc"
                value={ntDesc}
                onChange={(e) => setNtDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={ntType} onValueChange={setNtType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Tarefa</SelectItem>
                    <SelectItem value="followup">Follow-up</SelectItem>
                    <SelectItem value="call">Ligação</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="meeting">Reunião</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={ntPriority} onValueChange={setNtPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgente</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="low">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nt-due">Prazo</Label>
              <Input
                id="nt-due"
                type="datetime-local"
                value={ntDue}
                onChange={(e) => setNtDue(e.target.value)}
              />
            </div>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setNewTaskOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={createTask.isPending}
            >
              {createTask.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Criar'
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function EmptyTab({ tab }: { tab: TabId }) {
  const map: Record<TabId, { title: string; sub: string }> = {
    today: { title: 'Nada para hoje 🎯', sub: 'Aproveite para prospectar novos leads.' },
    overdue: { title: 'Nenhuma atrasada 🎉', sub: 'Você está em dia!' },
    scheduled: { title: 'Sem próximas atividades', sub: 'Agende um follow-up no FAB +.' },
    meetings: { title: 'Sem reuniões', sub: 'Conecte sua agenda para ver eventos.' },
    cadences: { title: 'Sem cadências ativas', sub: 'Inscreva leads em cadências.' },
    done: { title: 'Sem concluídas', sub: 'Atividades concluídas aparecem aqui.' },
  };
  const e = map[tab];
  return (
    <div className="text-center py-12 px-4">
      <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
      <p className="text-foreground font-medium">{e.title}</p>
      <p className="text-sm text-muted-foreground mt-1">{e.sub}</p>
    </div>
  );
}
