import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useLeads } from '@/hooks/useLeads';
import { useCompleteTask, useUncompleteTask, useCreateTask, useDeleteTask } from '@/hooks/useTasks';
import {
  useSellerActivities,
  computeCounts,
  filterByTab,
  type Activity,
} from '@/hooks/useSellerActivities';
import { useOperationPriorities } from '@/hooks/useOperationCenter';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Phone,
  Mail,
  MessageCircle,
  CalendarDays,
  ListTodo,
  Workflow,
  Plus,
  AlertTriangle,
  Zap,
  Activity as ActivityIcon,
  CalendarCheck,
  Sparkles,
  Filter,
  MoreVertical,
  ArrowRight,
  Check,
  Trash2,
  Eye,
  CalendarClock,
  Ban,
  Loader2,
} from 'lucide-react';

interface ActivityCenterProps {
  userId: string;
  productId?: string;
  productName?: string;
}

const TYPE_LABEL: Record<string, string> = {
  task: 'Tarefa',
  followup: 'Follow-up',
  call: 'Ligação',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  meeting: 'Reunião',
  scheduled_message: 'Mensagem agendada',
  cadence_action: 'Cadência',
};

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  task: ListTodo,
  followup: ListTodo,
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  meeting: CalendarDays,
  scheduled_message: MessageCircle,
  cadence_action: Workflow,
};

const TYPE_TINT: Record<string, string> = {
  task: 'bg-primary/10 text-primary',
  followup: 'bg-primary/10 text-primary',
  call: 'bg-red-500/10 text-red-600',
  email: 'bg-amber-500/10 text-amber-600',
  whatsapp: 'bg-emerald-500/10 text-emerald-600',
  meeting: 'bg-emerald-500/10 text-emerald-600',
  scheduled_message: 'bg-sky-500/10 text-sky-600',
  cadence_action: 'bg-violet-500/10 text-violet-600',
};

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-destructive/10 text-destructive border-destructive/20',
  high: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  medium: 'bg-primary/10 text-primary border-primary/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

type TabKey = 'today' | 'overdue' | 'scheduled' | 'meetings' | 'cadences' | 'done';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'scheduled', label: 'Agendadas' },
  { key: 'meetings', label: 'Reuniões' },
  { key: 'cadences', label: 'Cadências' },
  { key: 'done', label: 'Concluídas' },
];

const EMPTY_COPY: Record<TabKey, { title: string; subtitle: string }> = {
  today: { title: 'Tudo em dia por aqui.', subtitle: 'Nenhuma atividade pendente para hoje.' },
  overdue: { title: 'Nenhuma atividade atrasada.', subtitle: 'Ótimo trabalho.' },
  scheduled: { title: 'Sem atividades agendadas.', subtitle: 'Aproveite para criar a próxima.' },
  meetings: { title: 'Nenhuma reunião agendada para hoje.', subtitle: '' },
  cadences: { title: 'Nenhuma ação de cadência pendente.', subtitle: '' },
  done: { title: 'Nenhuma atividade concluída ainda.', subtitle: '' },
};

function formatWhen(due: string) {
  const d = new Date(due);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return { primary: format(d, 'HH:mm'), secondary: 'Hoje' };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString())
    return { primary: format(d, 'HH:mm'), secondary: 'Amanhã' };
  return {
    primary: format(d, 'dd/MM', { locale: ptBR }),
    secondary: format(d, 'HH:mm'),
  };
}

export function ActivityCenter({ userId, productId, productName }: ActivityCenterProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { data: activities = [], isLoading } = useSellerActivities(userId, productId);
  const { data: leads = [] } = useLeads(productId);
  const { data: priorities } = useOperationPriorities();
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const deleteTask = useDeleteTask();

  const [tab, setTab] = useState<TabKey>('today');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [openCreate, setOpenCreate] = useState(false);
  const [detailsActivity, setDetailsActivity] = useState<Activity | null>(null);
  const [rescheduleActivity, setRescheduleActivity] = useState<Activity | null>(null);
  const [openFilters, setOpenFilters] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [filters, setFilters] = useState<{
    types: string[];
    priorities: string[];
    channels: string[];
    dateFrom: string;
    dateTo: string;
  }>({ types: [], priorities: [], channels: [], dateFrom: '', dateTo: '' });

  const counts = useMemo(() => computeCounts(activities), [activities]);

  const filtered = useMemo(() => {
    let list = filterByTab(activities, tab);
    if (filters.types.length) list = list.filter((a) => filters.types.includes(a.type));
    if (filters.priorities.length) list = list.filter((a) => filters.priorities.includes(a.priority));
    if (filters.channels.length) list = list.filter((a) => a.channel && filters.channels.includes(a.channel));
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom + 'T00:00:00').getTime();
      list = list.filter((a) => new Date(a.due_at).getTime() >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo + 'T23:59:59').getTime();
      list = list.filter((a) => new Date(a.due_at).getTime() <= to);
    }
    // Mais recentes primeiro
    return [...list].sort((a, b) => new Date(b.due_at).getTime() - new Date(a.due_at).getTime());
  }, [activities, tab, filters]);

  const todaysMeetings = useMemo(() => {
    const t0 = new Date();
    t0.setHours(0, 0, 0, 0);
    const t1 = new Date();
    t1.setHours(23, 59, 59, 999);
    return activities
      .filter(
        (a) =>
          a.type === 'meeting' &&
          new Date(a.due_at) >= t0 &&
          new Date(a.due_at) <= t1,
      )
      .slice(0, 5);
  }, [activities]);

  const navigate = (tab: string, params?: Record<string, string>) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleOpenLead = (a: Activity) => {
    if (a.open_lead_id) navigate('leads', { leadId: a.open_lead_id });
    else navigate('leads');
  };

  const handleToggleComplete = async (a: Activity) => {
    try {
      if (a.source === 'task') {
        if (a.status === 'completed') {
          await uncompleteTask.mutateAsync(a.source_id);
          toast.success('Atividade reaberta');
        } else {
          await completeTask.mutateAsync(a.source_id);
          toast.success('Atividade concluída');
        }
      } else if (a.source === 'calendar_event') {
        const newStatus = a.status === 'completed' ? 'scheduled' : 'completed';
        const { error } = await supabase
          .from('calendar_events')
          .update({ status: newStatus })
          .eq('id', a.source_id);
        if (error) throw error;
        toast.success(newStatus === 'completed' ? 'Reunião concluída' : 'Reunião reaberta');
      } else {
        toast.info('Esta atividade não pode ser concluída manualmente');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['seller-activities'] });
    } catch {
      toast.error('Erro ao atualizar atividade');
    }
  };

  const handleDelete = async (a: Activity) => {
    const labels: Record<string, { confirm: string; success: string }> = {
      task: { confirm: 'Excluir esta tarefa?', success: 'Tarefa excluída' },
      scheduled_message: { confirm: 'Cancelar o envio desta mensagem agendada?', success: 'Mensagem cancelada' },
      calendar_event: { confirm: 'Cancelar esta reunião?', success: 'Reunião cancelada' },
      cadence_step: { confirm: 'Cancelar este passo da cadência?', success: 'Passo da cadência cancelado' },
    };
    const cfg = labels[a.source];
    if (!cfg) return;
    if (!confirm(cfg.confirm)) return;
    try {
      if (a.source === 'task') {
        await deleteTask.mutateAsync(a.source_id);
      } else if (a.source === 'scheduled_message') {
        const { error } = await supabase
          .from('scheduled_messages')
          .update({ status: 'cancelled' })
          .eq('id', a.source_id);
        if (error) throw error;
      } else if (a.source === 'calendar_event') {
        const { error } = await supabase
          .from('calendar_events')
          .update({ status: 'cancelled' })
          .eq('id', a.source_id);
        if (error) throw error;
      } else if (a.source === 'cadence_step') {
        const { error } = await supabase
          .from('cadence_step_runs')
          .update({ status: 'cancelled' })
          .eq('id', a.source_id);
        if (error) throw error;
      }
      toast.success(cfg.success);
      queryClient.invalidateQueries({ queryKey: ['seller-activities'] });
    } catch {
      toast.error('Erro ao cancelar atividade');
    }
  };

  const handleReschedule = (a: Activity) => setRescheduleActivity(a);

  const handleOpenDetails = (a: Activity) => setDetailsActivity(a);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const count =
              t.key === 'today'
                ? counts.today
                : t.key === 'overdue'
                  ? counts.overdue
                  : t.key === 'scheduled'
                    ? counts.scheduled
                    : t.key === 'meetings'
                      ? counts.meetings
                      : t.key === 'cadences'
                        ? counts.cadences
                        : counts.completed;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all',
                  isActive
                    ? 'border-primary/40 bg-primary/5 text-foreground shadow-sm'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                {t.label}
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-5 min-w-5 px-1.5 text-[11px]',
                    t.key === 'overdue' && count > 0 && 'bg-destructive/15 text-destructive',
                    t.key === 'today' && isActive && 'bg-primary/15 text-primary',
                  )}
                >
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Sheet open={openFilters} onOpenChange={setOpenFilters}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <FilterGroup
                  title="Tipo"
                  options={Object.entries(TYPE_LABEL)}
                  selected={filters.types}
                  onToggle={(v) =>
                    setFilters((f) => ({
                      ...f,
                      types: f.types.includes(v) ? f.types.filter((x) => x !== v) : [...f.types, v],
                    }))
                  }
                />
                <FilterGroup
                  title="Prioridade"
                  options={Object.entries(PRIORITY_LABEL)}
                  selected={filters.priorities}
                  onToggle={(v) =>
                    setFilters((f) => ({
                      ...f,
                      priorities: f.priorities.includes(v)
                        ? f.priorities.filter((x) => x !== v)
                        : [...f.priorities, v],
                    }))
                  }
                />
                <FilterGroup
                  title="Canal"
                  options={[
                    ['whatsapp', 'WhatsApp'],
                    ['email', 'E-mail'],
                    ['call', 'Ligação'],
                    ['meeting', 'Reunião'],
                  ]}
                  selected={filters.channels}
                  onToggle={(v) =>
                    setFilters((f) => ({
                      ...f,
                      channels: f.channels.includes(v)
                        ? f.channels.filter((x) => x !== v)
                        : [...f.channels, v],
                    }))
                  }
                />
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Período</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">De</Label>
                      <Input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Até</Label>
                      <Input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                      />
                    </div>
                  </div>
                  {(filters.dateFrom || filters.dateTo) && (
                    <button
                      onClick={() => setFilters((f) => ({ ...f, dateFrom: '', dateTo: '' }))}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      Limpar período
                    </button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setFilters({ types: [], priorities: [], channels: [], dateFrom: '', dateTo: '' })}
                >
                  Limpar filtros
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Nova Atividade
              </Button>
            </DialogTrigger>
            <NewActivityDialog
              userId={userId}
              productId={productId}
              leads={leads as any}
              orgId={profile?.organization_id ?? ''}
              onClose={() => setOpenCreate(false)}
              onCreated={() =>
                queryClient.invalidateQueries({ queryKey: ['seller-activities'] })
              }
            />
          </Dialog>
        </div>
      </div>

      <ActivityDetailsDialog
        activity={detailsActivity}
        onClose={() => setDetailsActivity(null)}
        onOpenLead={(a) => {
          setDetailsActivity(null);
          handleOpenLead(a);
        }}
        onToggleComplete={async (a) => {
          await handleToggleComplete(a);
          setDetailsActivity(null);
        }}
        onDelete={async (a) => {
          await handleDelete(a);
          setDetailsActivity(null);
        }}
        onReschedule={(a) => {
          setDetailsActivity(null);
          handleReschedule(a);
        }}
      />

      <RescheduleDialog
        activity={rescheduleActivity}
        onClose={() => setRescheduleActivity(null)}
        onDone={() => queryClient.invalidateQueries({ queryKey: ['seller-activities'] })}
      />




      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={<ActivityIcon className="h-5 w-5" />}
              tint="bg-primary/10 text-primary"
              value={counts.today}
              label="Atividades Hoje"
              hint={`${counts.todayDeltaPct > 0 ? '↑' : counts.todayDeltaPct < 0 ? '↓' : ''} ${Math.abs(
                counts.todayDeltaPct,
              )}% vs ontem`}
            />
            <KpiCard
              icon={<Zap className="h-5 w-5" />}
              tint="bg-amber-500/10 text-amber-600"
              value={counts.urgentNext2h}
              label="Urgentes"
              hint="Próximas 2 horas"
            />
            <KpiCard
              icon={<AlertTriangle className="h-5 w-5" />}
              tint="bg-destructive/10 text-destructive"
              value={counts.overdue}
              label="Atrasadas"
              hint="Precisam ação"
            />
            <KpiCard
              icon={<CalendarCheck className="h-5 w-5" />}
              tint="bg-sky-500/10 text-sky-600"
              value={counts.meetingsToday}
              label="Reuniões Hoje"
              hint="Agendadas"
            />
          </div>

          {/* Main block */}
          <div className="rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Minha Agenda Operacional</h2>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
                <button
                  onClick={() => setView('list')}
                  className={cn(
                    'px-3 py-1 text-xs rounded-md transition-all',
                    view === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Lista
                </button>
                <button
                  onClick={() => setView('calendar')}
                  className={cn(
                    'px-3 py-1 text-xs rounded-md transition-all',
                    view === 'calendar' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Calendário
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : view === 'list' ? (
              <ActivityList
                activities={filtered}
                emptyCopy={EMPTY_COPY[tab]}
                onOpenLead={handleOpenLead}
                onToggleComplete={handleToggleComplete}
                onDelete={handleDelete}
                onOpenDetails={handleOpenDetails}
                onReschedule={handleReschedule}
              />
            ) : (
              <CalendarView
                activities={filtered}
                selectedDay={selectedDay}
                onSelectDay={setSelectedDay}
                onOpenDetails={handleOpenDetails}
              />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <h3 className="font-semibold text-foreground">Sugestões da IA</h3>
              </div>
              <button
                onClick={() => navigate('ai')}
                className="text-xs text-primary hover:underline"
              >
                Ver todas
              </button>
            </div>
            <div className="p-3 space-y-2">
              {(priorities?.unansweredConversations ?? 0) > 0 && (
                <SuggestionItem
                  icon={<MessageCircle className="h-4 w-4 text-red-500" />}
                  title={`${priorities!.unansweredConversations} conversa(s) sem retorno há mais de 15min`}
                  action="Abrir conversa"
                  onAction={() => navigate('inbox')}
                />
              )}
              {(priorities?.hotLeadsUnassigned ?? 0) > 0 && (
                <SuggestionItem
                  icon={<Zap className="h-4 w-4 text-amber-500" />}
                  title={`${priorities!.hotLeadsUnassigned} lead(s) quente(s) sem atendimento`}
                  action="Ver leads"
                  onAction={() => navigate('leads')}
                />
              )}
              {(priorities?.pendingMeetings ?? 0) > 0 && (
                <SuggestionItem
                  icon={<CalendarDays className="h-4 w-4 text-sky-500" />}
                  title={`Você tem ${priorities!.pendingMeetings} reunião(ões) agendada(s) hoje`}
                  action="Ver agenda"
                  onAction={() => navigate('bookings')}
                />
              )}
              {(priorities?.overdueTasks ?? 0) > 0 && (
                <SuggestionItem
                  icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                  title={`${priorities!.overdueTasks} atividade(s) atrasada(s)`}
                  action="Resolver agora"
                  onAction={() => setTab('overdue')}
                />
              )}
              {!priorities ||
              (priorities.unansweredConversations === 0 &&
                priorities.hotLeadsUnassigned === 0 &&
                priorities.pendingMeetings === 0 &&
                priorities.overdueTasks === 0) ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Nada urgente no momento.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-emerald-500" />
                <h3 className="font-semibold text-foreground">Próximas Reuniões</h3>
              </div>
              <button
                onClick={() => navigate('bookings')}
                className="text-xs text-primary hover:underline"
              >
                Ver agenda
              </button>
            </div>
            <div className="p-3 space-y-2">
              {todaysMeetings.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Nenhuma reunião hoje.
                </p>
              ) : (
                todaysMeetings.map((m) => {
                  const when = formatWhen(m.due_at);
                  return (
                    <div
                      key={m.id}
                      className="flex items-start gap-3 rounded-lg p-3 hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => handleOpenLead(m)}
                    >
                      <div className="text-xs font-semibold text-foreground w-12 shrink-0">
                        {when.primary}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {m.lead?.name ?? m.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{m.title}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {when.secondary}
                      </Badge>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- subcomponents ---------- */

function KpiCard({
  icon,
  tint,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  tint: string;
  value: number | string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center', tint)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-3xl font-bold text-foreground leading-none">{value}</p>
          <p className="mt-2 text-sm font-medium text-foreground">{label}</p>
          {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

function ActivityList({
  activities,
  emptyCopy,
  onOpenLead,
  onToggleComplete,
  onDelete,
  onOpenDetails,
  onReschedule,
}: {
  activities: Activity[];
  emptyCopy: { title: string; subtitle: string };
  onOpenLead: (a: Activity) => void;
  onToggleComplete: (a: Activity) => void;
  onDelete: (a: Activity) => void;
  onOpenDetails: (a: Activity) => void;
  onReschedule: (a: Activity) => void;
}) {
  if (activities.length === 0) {
    return (
      <div className="px-6 py-14 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <ListTodo className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="font-medium text-foreground">{emptyCopy.title}</p>
        {emptyCopy.subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{emptyCopy.subtitle}</p>
        )}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {activities.map((a) => (
        <ActivityRow
          key={a.id}
          a={a}
          onOpenLead={onOpenLead}
          onToggleComplete={onToggleComplete}
          onDelete={onDelete}
          onOpenDetails={onOpenDetails}
          onReschedule={onReschedule}
        />
      ))}
    </ul>
  );
}

function ActivityRow({
  a,
  onOpenLead,
  onToggleComplete,
  onDelete,
  onOpenDetails,
  onReschedule,
}: {
  a: Activity;
  onOpenLead: (a: Activity) => void;
  onToggleComplete: (a: Activity) => void;
  onDelete: (a: Activity) => void;
  onOpenDetails: (a: Activity) => void;
  onReschedule: (a: Activity) => void;
}) {
  const Icon = TYPE_ICON[a.type] ?? ListTodo;
  const when = formatWhen(a.due_at);

  const canComplete = a.source === 'task' || a.source === 'calendar_event';
  const canReschedule = a.status !== 'completed';
  const deleteLabel =
    a.source === 'task'
      ? 'Excluir'
      : a.source === 'scheduled_message'
        ? 'Cancelar envio'
        : 'Cancelar';
  const canDelete = a.status !== 'completed';

  return (
    <li
      className={cn(
        'group flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors',
        a.status === 'overdue' && 'bg-destructive/[0.03]',
      )}
    >
      <div className="w-16 shrink-0">
        <div
          className={cn(
            'text-sm font-semibold leading-tight',
            a.status === 'overdue' ? 'text-destructive' : 'text-foreground',
          )}
        >
          {when.primary}
        </div>
        <div
          className={cn(
            'text-[11px] leading-tight',
            a.status === 'overdue' ? 'text-destructive/80' : 'text-muted-foreground',
          )}
        >
          {a.status === 'overdue' ? 'Atrasada' : when.secondary}
        </div>
      </div>

      <div
        className={cn(
          'h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
          TYPE_TINT[a.type] ?? 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              'font-medium text-foreground truncate',
              (a.status === 'completed' || a.status === 'cancelled') && 'line-through text-muted-foreground',
            )}
          >
            {a.title}
          </p>
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0', PRIORITY_BADGE[a.priority])}
          >
            {PRIORITY_LABEL[a.priority]}
          </Badge>
          {a.status === 'overdue' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-destructive/10 text-destructive border-destructive/20">
              Atrasada há {formatDistanceToNow(new Date(a.due_at), { locale: ptBR })}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {TYPE_LABEL[a.type]}
          {a.lead?.name && <> · Lead: <span className="text-foreground">{a.lead.name}</span></>}
          {a.cadence_name && <> · Cadência: {a.cadence_name}</>}
        </div>
      </div>

      <div className="hidden md:flex items-center">
        <Badge
          variant="secondary"
          className={cn(
            'text-[10px]',
            a.status === 'cancelled' && 'bg-muted text-muted-foreground line-through',
            a.status === 'failed' && 'bg-destructive/10 text-destructive',
          )}
        >
          {a.status === 'completed'
            ? 'Concluída'
            : a.status === 'cancelled'
              ? 'Cancelada'
              : a.status === 'failed'
                ? 'Falhou'
                : a.status === 'overdue'
                  ? 'Atrasada'
                  : when.secondary}
        </Badge>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => onOpenLead(a)}
        disabled={!a.open_lead_id}
      >
        Abrir Lead
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onOpenDetails(a)}>
            <Eye className="h-4 w-4 mr-2" />
            Abrir detalhes
          </DropdownMenuItem>
          {canComplete && (
            <DropdownMenuItem onClick={() => onToggleComplete(a)}>
              <Check className="h-4 w-4 mr-2" />
              {a.status === 'completed' ? 'Reabrir' : 'Concluir'}
            </DropdownMenuItem>
          )}
          {canReschedule && (
            <DropdownMenuItem onClick={() => onReschedule(a)}>
              <CalendarClock className="h-4 w-4 mr-2" />
              Reagendar
            </DropdownMenuItem>
          )}
          {a.open_lead_id && (
            <DropdownMenuItem onClick={() => onOpenLead(a)}>
              <ArrowRight className="h-4 w-4 mr-2" />
              Abrir lead
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              onClick={() => onDelete(a)}
              className="text-destructive focus:text-destructive"
            >
              {a.source === 'task' ? (
                <Trash2 className="h-4 w-4 mr-2" />
              ) : (
                <Ban className="h-4 w-4 mr-2" />
              )}
              {deleteLabel}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

const PRIORITY_RANK: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

function dayKey(d: Date | string) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function CalendarView({
  activities,
  selectedDay,
  onSelectDay,
  onOpenDetails,
}: {
  activities: Activity[];
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
  onOpenDetails: (a: Activity) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities) {
      const k = dayKey(a.due_at);
      const arr = map.get(k) ?? [];
      arr.push(a);
      map.set(k, arr);
    }
    for (const arr of map.values()) {
      arr.sort((x, y) => new Date(x.due_at).getTime() - new Date(y.due_at).getTime());
    }
    return map;
  }, [activities]);

  const modifiers = useMemo(() => {
    const urgent: Date[] = [];
    const high: Date[] = [];
    const medium: Date[] = [];
    const low: Date[] = [];
    for (const [k, list] of byDay.entries()) {
      const top = list.reduce(
        (acc, a) => (PRIORITY_RANK[a.priority] > PRIORITY_RANK[acc] ? a.priority : acc),
        'low',
      );
      const [y, m, d] = k.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (top === 'urgent') urgent.push(dt);
      else if (top === 'high') high.push(dt);
      else if (top === 'medium') medium.push(dt);
      else low.push(dt);
    }
    return { urgent, high, medium, low };
  }, [byDay]);

  const dayList = byDay.get(dayKey(selectedDay)) ?? [];

  return (
    <div className="p-4 grid gap-4 md:grid-cols-[auto_1fr]">
      <div className="flex justify-center">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selectedDay}
          onSelect={(d) => d && onSelectDay(d)}
          modifiers={modifiers}
          modifiersClassNames={{
            urgent: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-destructive',
            high: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-amber-500',
            medium: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary',
            low: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-muted-foreground',
          }}
          className="rounded-lg border border-border bg-card pointer-events-auto"
        />
      </div>
      <div className="rounded-xl border border-border bg-muted/20 p-3 min-h-[280px]">
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-sm font-semibold text-foreground">
            {format(selectedDay, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
          <Badge variant="secondary" className="text-[10px]">{dayList.length}</Badge>
        </div>
        {dayList.length === 0 ? (
          <p className="text-xs text-muted-foreground/70 text-center py-10">
            Nenhuma atividade neste dia.
          </p>
        ) : (
          <div className="space-y-2">
            {dayList.map((a) => {
              const Icon = TYPE_ICON[a.type] ?? ListTodo;
              return (
                <button
                  key={a.id}
                  onClick={() => onOpenDetails(a)}
                  className="w-full text-left rounded-lg bg-background border border-border p-3 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('h-9 w-9 rounded-md flex items-center justify-center shrink-0', TYPE_TINT[a.type])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          'text-sm font-medium text-foreground truncate',
                          (a.status === 'completed' || a.status === 'cancelled') && 'line-through text-muted-foreground',
                        )}>
                          {a.title}
                        </p>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {format(new Date(a.due_at), 'HH:mm')}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {TYPE_LABEL[a.type]}
                        {a.lead?.name && <> · {a.lead.name}</>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionItem({
  icon,
  title,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-lg p-3 hover:bg-muted/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-snug">{title}</p>
          <button
            onClick={onAction}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {action} <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: [string, string][];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([value, label]) => {
          const isOn = selected.includes(value);
          return (
            <button
              key={value}
              onClick={() => onToggle(value)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                isOn
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- New Activity Dialog ---------- */

const ACTIVITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'task', label: 'Tarefa' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'scheduled_message', label: 'Mensagem agendada' },
  { value: 'call', label: 'Ligação' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'cadence_action', label: 'Ação de cadência' },
];

function NewActivityDialog({
  userId,
  productId,
  leads,
  orgId,
  onClose,
  onCreated,
}: {
  userId: string;
  productId?: string;
  leads: { id: string; name: string; company?: string | null }[];
  orgId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createTask = useCreateTask();
  const [type, setType] = useState<string>('task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [leadId, setLeadId] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 60 * 60_000), "yyyy-MM-dd'T'HH:mm"));
  const [channel, setChannel] = useState<string>('');
  const [messageBody, setMessageBody] = useState('');
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [status, setStatus] = useState<'pending' | 'scheduled' | 'in_progress'>('pending');
  const [createCalendarEvent, setCreateCalendarEvent] = useState(true);
  const [saving, setSaving] = useState(false);

  const showChannel = ['call', 'email', 'whatsapp', 'meeting', 'scheduled_message'].includes(type);
  const isScheduled = type === 'scheduled_message';
  const isMeeting = type === 'meeting';

  const submit = async () => {
    if (!title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const dueIso = new Date(dueDate).toISOString();
      const descParts: string[] = [];
      if (description.trim()) descParts.push(description.trim());
      if (isScheduled && messageBody.trim())
        descParts.push(`\nMensagem: ${messageBody.trim()}`);
      if (repeat !== 'none') descParts.push(`\n[Repetir: ${repeat}]`);

      // 1) tasks
      await createTask.mutateAsync({
        title: title.trim(),
        description: descParts.join('\n') || null,
        priority,
        due_date: dueIso,
        lead_id: leadId || null,
        product_id: productId || null,
        user_id: userId,
        created_by: userId,
        status: (status === 'scheduled' ? 'pending' : status) as 'pending' | 'in_progress',
        type,
      });

      // 2) reunião → também cria calendar_event
      if (isMeeting && createCalendarEvent && orgId) {
        const end = new Date(new Date(dueDate).getTime() + 60 * 60_000).toISOString();
        await supabase.from('calendar_events').insert({
          title: title.trim(),
          description: description.trim() || null,
          start_time: dueIso,
          end_time: end,
          lead_id: leadId || null,
          product_id: productId || null,
          user_id: userId,
          created_by: userId,
          organization_id: orgId,
          status: 'scheduled',
          event_type: 'meeting',
        });
      }

      toast.success('Atividade criada');
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro ao criar atividade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Criar Nova Atividade</DialogTitle>
      </DialogHeader>

      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label>Tipo de atividade</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Título *</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Retornar ligação João Silva"
          />
        </div>

        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalhes da atividade..."
            rows={3}
          />
        </div>

        {leads && leads.length > 0 && (
          <div className="space-y-2">
            <Label>Lead vinculado</Label>
            <Select value={leadId || 'none'} onValueChange={(v) => setLeadId(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar lead..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                    {l.company ? ` — ${l.company}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Prioridade</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data e hora *</Label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        {showChannel && (
          <div className="space-y-2">
            <Label>Canal</Label>
            <Select value={channel || 'auto'} onValueChange={(v) => setChannel(v === 'auto' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Automático pelo tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático pelo tipo</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="call">Ligação</SelectItem>
                <SelectItem value="meeting">Reunião</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {isScheduled && (
          <div className="space-y-2">
            <Label>Mensagem que será enviada</Label>
            <Textarea
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Conteúdo da mensagem..."
              rows={3}
            />
          </div>
        )}

        {isMeeting && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={createCalendarEvent}
              onChange={(e) => setCreateCalendarEvent(e.target.checked)}
              className="h-4 w-4"
            />
            Criar também na agenda
          </label>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Repetir</Label>
            <Select value={repeat} onValueChange={(v) => setRepeat(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não repetir</SelectItem>
                <SelectItem value="daily">Diariamente</SelectItem>
                <SelectItem value="weekly">Semanalmente</SelectItem>
                <SelectItem value="monthly">Mensalmente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status inicial</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="scheduled">Agendada</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button className="w-full" onClick={submit} disabled={saving}>
          {saving ? 'Criando...' : 'Criar Atividade'}
        </Button>
      </div>
    </DialogContent>
  );
}

/* ---------- Activity Details Dialog ---------- */

function ActivityDetailsDialog({
  activity,
  onClose,
  onOpenLead,
  onToggleComplete,
  onDelete,
  onReschedule,
}: {
  activity: Activity | null;
  onClose: () => void;
  onOpenLead: (a: Activity) => void;
  onToggleComplete: (a: Activity) => void;
  onDelete: (a: Activity) => void;
  onReschedule: (a: Activity) => void;
}) {
  if (!activity) return null;
  const a = activity;
  const Icon = TYPE_ICON[a.type] ?? ListTodo;
  const due = new Date(a.due_at);
  const canComplete = a.source === 'task' || a.source === 'calendar_event';
  const canDelete = a.status !== 'completed';
  const canReschedule = a.status !== 'completed';
  const deleteLabel =
    a.source === 'task'
      ? 'Excluir'
      : a.source === 'scheduled_message'
        ? 'Cancelar envio'
        : 'Cancelar';
  return (
    <Dialog open={!!activity} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', TYPE_TINT[a.type] ?? 'bg-muted')}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="truncate">{a.title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn('text-[10px]', PRIORITY_BADGE[a.priority])}>
              {PRIORITY_LABEL[a.priority]}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {TYPE_LABEL[a.type]}
            </Badge>
            {a.status === 'overdue' && (
              <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">
                Atrasada
              </Badge>
            )}
            {a.status === 'completed' && (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                Concluída
              </Badge>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Vencimento</p>
            <p className="font-medium text-foreground">
              {format(due, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>

          {a.lead?.name && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Lead</p>
              <p className="font-medium text-foreground">{a.lead.name}</p>
            </div>
          )}

          {a.description && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-1">Descrição</p>
              <p className="text-foreground whitespace-pre-wrap">{a.description}</p>
            </div>
          )}

          {a.cadence_name && (
            <p className="text-xs text-muted-foreground">Cadência: {a.cadence_name}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {canDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(a)}
            >
              {a.source === 'task' ? (
                <Trash2 className="h-4 w-4 mr-1" />
              ) : (
                <Ban className="h-4 w-4 mr-1" />
              )}
              {deleteLabel}
            </Button>
          ) : <div />}

          <div className="flex items-center gap-2">
            {a.open_lead_id && (
              <Button variant="outline" size="sm" onClick={() => onOpenLead(a)}>
                Abrir lead
              </Button>
            )}
            {canReschedule && (
              <Button variant="outline" size="sm" onClick={() => onReschedule(a)}>
                <CalendarClock className="h-4 w-4 mr-1" />
                Reagendar
              </Button>
            )}
            {canComplete && (
              <Button size="sm" onClick={() => onToggleComplete(a)}>
                <Check className="h-4 w-4 mr-1" />
                {a.status === 'completed' ? 'Reabrir' : 'Concluir'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Reschedule Dialog ---------- */

function RescheduleDialog({
  activity,
  onClose,
  onDone,
}: {
  activity: Activity | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activity) {
      setValue(format(new Date(activity.due_at), "yyyy-MM-dd'T'HH:mm"));
    }
  }, [activity?.id]);

  if (!activity) return null;
  const a = activity;

  const submit = async () => {
    if (!value) return;
    const iso = new Date(value).toISOString();
    setSaving(true);
    try {
      if (a.source === 'task') {
        const { error } = await supabase
          .from('tasks')
          .update({ due_date: iso, status: a.status === 'completed' ? 'pending' : (a.status === 'overdue' ? 'pending' : undefined) } as any)
          .eq('id', a.source_id);
        if (error) throw error;
      } else if (a.source === 'scheduled_message') {
        const { error } = await supabase
          .from('scheduled_messages')
          .update({ scheduled_at: iso, status: 'pending', sent_at: null } as any)
          .eq('id', a.source_id);
        if (error) throw error;
      } else if (a.source === 'calendar_event') {
        // Preserve duration if end_time exists
        const { data: ev } = await supabase
          .from('calendar_events')
          .select('start_time, end_time')
          .eq('id', a.source_id)
          .maybeSingle();
        const updates: any = { start_time: iso, status: 'scheduled' };
        if (ev?.end_time && ev?.start_time) {
          const delta = new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime();
          updates.end_time = new Date(new Date(iso).getTime() + delta).toISOString();
        }
        const { error } = await supabase
          .from('calendar_events')
          .update(updates)
          .eq('id', a.source_id);
        if (error) throw error;
      } else if (a.source === 'cadence_step') {
        const { error } = await supabase
          .from('cadence_step_runs')
          .update({ scheduled_at: iso, status: 'pending' } as any)
          .eq('id', a.source_id);
        if (error) throw error;
      }
      toast.success(`Reagendada para ${format(new Date(value), "dd/MM 'às' HH:mm", { locale: ptBR })}`);
      onDone();
      onClose();
    } catch (e) {
      toast.error('Erro ao reagendar atividade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!activity} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Reagendar atividade
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reschedule-at">Nova data e horário</Label>
          <Input
            id="reschedule-at"
            type="datetime-local"
            value={value}
            min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground truncate">{a.title}</p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !value}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
