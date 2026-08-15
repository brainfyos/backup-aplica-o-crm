import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, Flame, Calendar, AlertTriangle, Send, Users } from 'lucide-react';
import type { HealthKpis } from '@/hooks/useOperationCenter';

interface Props {
  kpis?: HealthKpis;
  onNavigate: (section: string) => void;
}

export function HealthKpiRow({ kpis, onNavigate }: Props) {
  const cards = [
    {
      label: 'Conversas Abertas',
      value: kpis?.openConversations ?? 0,
      hint: kpis?.unanswered ? `${kpis.unanswered} sem resposta` : 'Todas em dia',
      hintClass: kpis?.unanswered ? 'text-red-600' : 'text-emerald-600',
      icon: MessageCircle,
      iconBg: 'bg-emerald-50 text-emerald-600',
      onClick: () => onNavigate('inbox-chat'),
    },
    {
      label: 'Leads Quentes',
      value: kpis?.hotLeads ?? 0,
      hint: kpis?.hotNeedAction ? `${kpis.hotNeedAction} precisam ação` : 'Todos com responsável',
      hintClass: kpis?.hotNeedAction ? 'text-orange-600' : 'text-muted-foreground',
      icon: Flame,
      iconBg: 'bg-orange-50 text-orange-600',
      onClick: () => onNavigate('leads'),
    },
    {
      label: 'Agenda Hoje',
      value: kpis?.todayAgenda ?? 0,
      hint: 'Reuniões + tarefas',
      hintClass: 'text-muted-foreground',
      icon: Calendar,
      iconBg: 'bg-blue-50 text-blue-600',
      onClick: () => onNavigate('calendar'),
    },
    {
      label: 'Atividades Atrasadas',
      value: kpis?.overdueActivities ?? 0,
      hint: 'Follow-ups pendentes',
      hintClass: kpis?.overdueActivities ? 'text-red-600' : 'text-muted-foreground',
      icon: AlertTriangle,
      iconBg: 'bg-red-50 text-red-600',
      onClick: () => onNavigate('leads'),
    },
    {
      label: 'Mensagens Agendadas',
      value: kpis?.scheduledMessagesToday ?? 0,
      hint: 'Hoje',
      hintClass: 'text-muted-foreground',
      icon: Send,
      iconBg: 'bg-violet-50 text-violet-600',
      onClick: () => onNavigate('inbox-chat'),
    },
    {
      label: 'Atendentes Online',
      value: kpis?.onlineAttendants ?? 0,
      hint: `${kpis?.attendingNow ?? 0} em atendimento`,
      hintClass: 'text-muted-foreground',
      icon: Users,
      iconBg: 'bg-cyan-50 text-cyan-600',
      onClick: () => onNavigate('team'),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card
            key={c.label}
            onClick={c.onClick}
            className="cursor-pointer hover:shadow-md transition-shadow border-border"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{c.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{c.value}</p>
                  <p className={`text-[11px] mt-1 truncate ${c.hintClass}`}>{c.hint}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.iconBg}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
