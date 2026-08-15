import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  Users,
  Flame,
  Calendar,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  Phone,
  ArrowRight,
  CheckSquare,
  FileText,
  TrendingUp,
} from 'lucide-react';
import {
  useSellerOperation,
  type PriorityItem,
  type AIInsight,
  type TimelineItem,
} from '@/hooks/useSellerOperation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface SellerHomeProps {
  onNavigate: (tab: string, payload?: { conversationId?: string; leadId?: string }) => void;
  variant: 'mobile' | 'desktop';
}

const openPriority = (
  p: PriorityItem,
  onNavigate: SellerHomeProps['onNavigate']
) => {
  if (p.kind === 'conversation') {
    onNavigate('inbox', { conversationId: p.payloadId });
  } else if (p.kind === 'meeting') {
    onNavigate('bookings');
  } else {
    onNavigate('leads', { leadId: p.payloadId });
  }
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

const firstName = (full?: string | null) =>
  (full || 'Vendedor').trim().split(/\s+/)[0];

const initials = (n: string) =>
  n
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const insightIcon = (i: AIInsight) => {
  const cls = 'h-4 w-4';
  switch (i.icon) {
    case 'flame':
      return <Flame className={cn(cls, 'text-orange-500')} />;
    case 'alert':
      return <AlertTriangle className={cn(cls, 'text-amber-500')} />;
    case 'calendar':
      return <Calendar className={cn(cls, 'text-violet-500')} />;
    case 'message':
      return <MessageCircle className={cn(cls, 'text-sky-500')} />;
    case 'trend':
      return <TrendingUp className={cn(cls, 'text-emerald-500')} />;
  }
};

const insightTone = (icon: AIInsight['icon']) => {
  switch (icon) {
    case 'flame':
      return 'bg-orange-50 border-orange-100 dark:bg-orange-500/5';
    case 'alert':
      return 'bg-amber-50 border-amber-100 dark:bg-amber-500/5';
    case 'calendar':
      return 'bg-violet-50 border-violet-100 dark:bg-violet-500/5';
    case 'message':
      return 'bg-sky-50 border-sky-100 dark:bg-sky-500/5';
    case 'trend':
      return 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/5';
  }
};

const priorityActionIcon = (p: PriorityItem) => {
  switch (p.actionLabel) {
    case 'Responder':
      return MessageCircle;
    case 'Ligar':
      return Phone;
    case 'Abrir':
      return Calendar;
  }
};

const timelineIcon = (t: TimelineItem) => {
  switch (t.kind) {
    case 'meeting':
      return Calendar;
    case 'task':
      return FileText;
    case 'conversation':
      return MessageCircle;
    case 'lead':
      return AlertTriangle;
  }
};

const toneClasses = (tone: TimelineItem['tone']) => {
  switch (tone) {
    case 'emerald':
      return { bg: 'bg-emerald-100', fg: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' };
    case 'sky':
      return { bg: 'bg-sky-100', fg: 'text-sky-600', badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' };
    case 'amber':
      return { bg: 'bg-amber-100', fg: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' };
    case 'destructive':
      return { bg: 'bg-red-100', fg: 'text-red-600', badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' };
    case 'violet':
      return { bg: 'bg-violet-100', fg: 'text-violet-600', badge: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' };
  }
};

const formatCountdown = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Agora';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `Em ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `Em ${h}h${m.toString().padStart(2, '0')}min` : `Em ${h}h`;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const statusLabel = (status?: string | null) => {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes('propost')) return { label: 'Proposta', cls: 'bg-violet-50 text-violet-700 border-violet-200' };
  if (s.includes('negoc')) return { label: 'Negociação', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  if (s.includes('follow')) return { label: 'Follow-up', cls: 'bg-sky-50 text-sky-700 border-sky-200' };
  if (s.includes('qualif')) return { label: 'Qualificação', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (s.includes('novo') || s.includes('new')) return { label: 'Novo', cls: 'bg-slate-50 text-slate-700 border-slate-200' };
  return { label: status, cls: 'bg-slate-50 text-slate-700 border-slate-200' };
};

export function SellerHome({ onNavigate, variant }: SellerHomeProps) {
  const { profile } = useAuth();
  const { data, isLoading } = useSellerOperation();

  const name = firstName(profile?.full_name);

  // ===================== Header =====================
  const Header = (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold text-foreground">
        {greeting()}, {name}! <span aria-hidden>👋</span>
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Foque no que importa e boa vendas!
      </p>
    </div>
  );

  // ===================== MOBILE (UNCHANGED) =====================
  if (variant === 'mobile') {
    const KpiCards = (
      <div className="grid grid-cols-2 gap-3">
        <Card
          onClick={() => onNavigate('inbox')}
          className="cursor-pointer p-5 rounded-2xl border-border hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="h-11 w-11 rounded-xl bg-destructive/10 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-destructive" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground leading-tight">
            Conversas
            <br />
            sem resposta
          </p>
          <p className="mt-3 text-4xl font-bold text-destructive">
            {isLoading ? '—' : data?.unansweredCount ?? 0}
          </p>
          <p className="text-xs text-destructive/80 mt-2">Aguardando você</p>
        </Card>

        <Card
          onClick={() => onNavigate('leads')}
          className="cursor-pointer p-5 rounded-2xl border-border hover:shadow-md transition-all"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground leading-tight">
            Leads
            <br />
            em atendimento
          </p>
          <p className="mt-3 text-4xl font-bold text-emerald-600">
            {isLoading ? '—' : data?.activeLeadsCount ?? 0}
          </p>
          <p className="text-xs text-emerald-600/80 mt-2">Ativos no pipeline</p>
        </Card>
      </div>
    );

    const Priorities = (
      <Card className="p-5 rounded-2xl border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold text-foreground">Prioridades agora</h3>
          </div>
          <button
            onClick={() => onNavigate('leads')}
            className="text-sm font-medium text-primary flex items-center gap-1 hover:underline"
          >
            Ver todas <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {!data || data.priorities.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Tudo em ordem por enquanto. Nenhuma ação urgente.
          </div>
        ) : (
          <div className="space-y-2">
            {data.priorities.slice(0, 3).map((p) => {
              const ActionIcon = priorityActionIcon(p);
              const tone =
                p.actionLabel === 'Responder'
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
                  : p.actionLabel === 'Ligar'
                  ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15'
                  : 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/15';

              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors"
                >
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarFallback className="text-xs font-semibold bg-sky-100 text-sky-700">
                      {initials(p.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.reason}</p>
                  </div>
                  <button
                    onClick={() => openPriority(p, onNavigate)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      tone
                    )}
                  >
                    <ActionIcon className="h-4 w-4" />
                    {p.actionLabel}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );

    const NextMeeting = (
      <Card className="p-5 rounded-2xl border-border">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-5 w-5 text-emerald-600" />
          <h3 className="font-semibold text-foreground">Próximo compromisso</h3>
        </div>
        {!data?.nextEvent ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Você não possui reuniões agendadas.
            </p>
            <Button variant="outline" size="sm" onClick={() => onNavigate('bookings')} className="rounded-full">
              Abrir agenda
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-3xl font-bold text-foreground">{formatTime(data.nextEvent.startTime)}</p>
              <p className="mt-1 text-sm font-medium text-foreground truncate">
                {data.nextEvent.withName ? `Reunião com ${data.nextEvent.withName}` : data.nextEvent.title}
              </p>
              <p className="text-xs text-emerald-600 font-medium mt-0.5">
                {formatCountdown(data.nextEvent.startTime)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('bookings')} className="rounded-full text-xs h-7 px-3">
              Abrir agenda
            </Button>
          </div>
        )}
      </Card>
    );

    const AIPanel = (
      <Card className="p-5 rounded-2xl border-amber-200/60 bg-amber-50/60 dark:bg-amber-500/5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold text-foreground">IA Assistente</h3>
          </div>
        </div>
        {!data || data.insights.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sem alertas no momento.</p>
        ) : (
          <ul className="space-y-2.5">
            {data.insights.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-background/70 flex items-center justify-center flex-shrink-0">
                  {insightIcon(i)}
                </div>
                <span className="text-sm text-foreground">{i.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );

    const MyDay = (
      <Card className="p-5 rounded-2xl border-border">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-emerald-600" />
          <h3 className="font-semibold text-foreground">Meu Dia</h3>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <button onClick={() => onNavigate('tasks')} className="rounded-xl py-2 hover:bg-muted/40 transition-colors">
            <p className="text-3xl font-bold text-emerald-600">{data?.myDay.tasks ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Tarefas</p>
          </button>
          <button onClick={() => onNavigate('bookings')} className="rounded-xl py-2 hover:bg-muted/40 transition-colors">
            <p className="text-3xl font-bold text-sky-600">{data?.myDay.meetings ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Reuniões</p>
          </button>
          <button onClick={() => onNavigate('leads')} className="rounded-xl py-2 hover:bg-muted/40 transition-colors">
            <p className="text-3xl font-bold text-violet-600">{data?.myDay.activeLeads ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Leads ativos</p>
          </button>
        </div>
      </Card>
    );

    return (
      <div className="p-4 space-y-4 pb-24 animate-fade-in">
        {Header}
        {KpiCards}
        {Priorities}
        {NextMeeting}
        {AIPanel}
        {MyDay}
      </div>
    );
  }

  // ===================== DESKTOP =====================

  // ---- Linha 1: 4 KPIs ----
  type KpiSpec = {
    label: string;
    value: number | string;
    sub: string;
    Icon: typeof MessageCircle;
    tab: string;
    accent: 'destructive' | 'emerald' | 'violet' | 'amber';
  };
  const kpiAccent = (a: KpiSpec['accent']) => {
    switch (a) {
      case 'destructive':
        return { bg: 'bg-red-100', fg: 'text-red-500', num: 'text-red-500', sub: 'text-red-400' };
      case 'emerald':
        return { bg: 'bg-emerald-100', fg: 'text-emerald-600', num: 'text-emerald-600', sub: 'text-emerald-600/70' };
      case 'violet':
        return { bg: 'bg-violet-100', fg: 'text-violet-600', num: 'text-violet-600', sub: 'text-violet-600/70' };
      case 'amber':
        return { bg: 'bg-amber-100', fg: 'text-amber-600', num: 'text-amber-600', sub: 'text-amber-600/70' };
    }
  };

  const kpis: KpiSpec[] = [
    {
      label: 'Conversas sem resposta',
      value: isLoading ? '—' : data?.unansweredCount ?? 0,
      sub: 'Aguardando você',
      Icon: MessageCircle,
      tab: 'inbox',
      accent: 'destructive',
    },
    {
      label: 'Atendimentos ativos',
      value: isLoading ? '—' : data?.activeLeadsCount ?? 0,
      sub: 'Conversas em andamento',
      Icon: Users,
      tab: 'inbox',
      accent: 'emerald',
    },
    {
      label: 'Reuniões hoje',
      value: isLoading ? '—' : data?.todayMeetings ?? 0,
      sub: 'Agendadas para hoje',
      Icon: Calendar,
      tab: 'bookings',
      accent: 'violet',
    },
    {
      label: 'Tarefas pendentes',
      value: isLoading ? '—' : data?.todayPendingTasks ?? 0,
      sub: 'Precisam ser concluídas',
      Icon: CheckSquare,
      tab: 'tasks',
      accent: 'amber',
    },
  ];

  const KpiRow = (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {kpis.map((k) => {
        const a = kpiAccent(k.accent);
        return (
          <Card
            key={k.label}
            onClick={() => onNavigate(k.tab)}
            className="cursor-pointer p-5 rounded-2xl border-border hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center', a.bg)}>
                <k.Icon className={cn('h-5 w-5', a.fg)} />
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground leading-tight">{k.label}</p>
            <p className={cn('mt-2 text-4xl font-bold', a.num)}>{k.value}</p>
            <p className={cn('text-xs mt-1', a.sub)}>{k.sub}</p>
          </Card>
        );
      })}
    </div>
  );

  // ---- Linha 2 esquerda: Meu Dia (timeline) ----
  const MyDayTimeline = (
    <Card className="p-6 rounded-2xl border-border h-full flex flex-col">
      <div className="flex items-start gap-2 mb-5">
        <div className="h-9 w-9 rounded-xl bg-emerald-100 flex items-center justify-center">
          <Calendar className="h-4.5 w-4.5 text-emerald-600" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Meu Dia</h3>
          <p className="text-xs text-muted-foreground">Sua agenda e próximas ações</p>
        </div>
      </div>

      {!data || data.timeline.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-10 text-sm text-muted-foreground text-center">
          Nada agendado para hoje. <br /> Aproveite para prospectar novos leads.
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          {data.timeline.map((t) => {
            const Icon = timelineIcon(t);
            const tc = toneClasses(t.tone);
            return (
              <button
                key={t.id}
                onClick={() => onNavigate(t.kind === 'meeting' ? 'bookings' : 'tasks')}
                className="w-full flex items-center gap-4 text-left rounded-xl px-1 -mx-1 py-1 hover:bg-muted/40 transition-colors"
              >
                <div className="w-14 flex-shrink-0 text-sm font-semibold text-foreground">{t.time}</div>
                <div className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', tc.dot)} />
                <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0', tc.bg)}>
                  <Icon className={cn('h-4.5 w-4.5', tc.fg)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{t.title}</p>
                  {t.description && (
                    <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                  )}
                </div>
                <Badge variant="outline" className={cn('text-xs font-medium border', tc.badge)}>
                  {t.countdown}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      <Button
        onClick={() => onNavigate('bookings')}
        className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11"
      >
        Ver agenda completa <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </Card>
  );

  // ---- Linha 2 direita: Leads Prioritários ----
  const PriorityLeads = (
    <Card className="p-6 rounded-2xl border-border h-full flex flex-col">
      <div className="flex items-start gap-2 mb-5">
        <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center">
          <Sparkles className="h-4.5 w-4.5 text-amber-500" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Leads Prioritários</h3>
          <p className="text-xs text-muted-foreground">Quem precisa da sua atenção agora</p>
        </div>
      </div>

      {!data || data.priorities.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-10 text-sm text-muted-foreground">
          Nenhum lead urgente no momento.
        </div>
      ) : (
        <div className="flex-1 space-y-3">
          {data.priorities.map((p) => {
            const sl = statusLabel(p.status);
            return (
              <div key={p.id} className="flex items-center gap-3">
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarFallback className="text-xs font-semibold bg-sky-100 text-sky-700">
                    {initials(p.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.company || p.reason}
                  </p>
                </div>
                {sl && (
                  <Badge variant="outline" className={cn('text-xs font-medium border hidden xl:inline-flex', sl.cls)}>
                    {sl.label}
                  </Badge>
                )}
                <span className="text-xs text-red-500 font-medium hidden xl:inline whitespace-nowrap">
                  {p.ageMinutes ? `há ${p.ageMinutes >= 60 ? Math.floor(p.ageMinutes / 60) + 'h' : p.ageMinutes + 'min'}` : ''}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openPriority(p, onNavigate)}
                  className="rounded-lg gap-1.5 h-8 text-xs"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                  Abrir conversa
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => onNavigate('leads')}
        className="mt-5 text-sm font-medium text-emerald-600 hover:underline flex items-center justify-center gap-1"
      >
        Ver todos os leads <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </Card>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {Header}
      {KpiRow}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">{MyDayTimeline}</div>
        <div className="lg:col-span-2">{PriorityLeads}</div>
      </div>
    </div>
  );
}
