import { useMemo, useState } from 'react';
import {
  MessageSquare, Clock, Bot, AlertTriangle, Target, Activity,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from './KpiCard';
import { StatusBars } from './StatusBars';
import { TeamRanking } from './TeamRanking';
import { ChannelGrid } from './ChannelGrid';
import { SmartAlerts } from './SmartAlerts';
import { RisksTable } from './RisksTable';
import { ReportsFilters } from './ReportsFilters';
import { useAttendanceReports, formatDuration, type ReportsFilters as Filters } from '@/hooks/useAttendanceReports';
import { buildInsights } from '@/lib/attendanceInsights';

export function AttendanceReports() {
  const [filters, setFilters] = useState<Filters>({
    period: '30d',
    productId: null,
    channel: 'all',
    userId: null,
    agentId: null,
  });

  const data = useAttendanceReports(filters);
  const insights = useMemo(() => buildInsights(data), [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Atendimentos</h1>
          <p className="text-sm text-muted-foreground">Visão geral da operação de atendimento e conversão.</p>
        </div>
        <ReportsFilters filters={filters} onChange={setFilters} />
      </div>

      {data.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Conversas Ativas"
            value={data.activeConversations.current.toLocaleString('pt-BR')}
            delta={data.activeConversations.pct}
            hint="vs período anterior"
            icon={Activity}
            tone="neutral"
          />
          <KpiCard
            label="Aguardando Atendimento"
            value={data.waiting.current.toLocaleString('pt-BR')}
            hint="Necessitam ação humana"
            icon={Clock}
            tone="amber"
          />
          <KpiCard
            label="Tempo Médio de Resposta"
            value={formatDuration(data.avgResponseMs.current)}
            delta={data.avgResponseMs.pct}
            invertDelta
            icon={MessageSquare}
            tone="neutral"
          />
          <KpiCard
            label="Resolvido pela IA"
            value={`${data.aiResolutionPct.current}%`}
            hint="Sem intervenção humana"
            icon={Bot}
            tone="primary"
          />
          <KpiCard
            label="Leads em Risco"
            value={data.risks.current.toLocaleString('pt-BR')}
            hint="Sem resposta há +30min"
            icon={AlertTriangle}
            tone="destructive"
          />
          <KpiCard
            label="Conversões"
            value={data.conversions.current.toLocaleString('pt-BR')}
            delta={data.conversions.pct}
            hint="Geradas via atendimento"
            icon={Target}
            tone="success"
          />
        </div>
      )}

      {/* Linha 2: Status + Ranking */}
      <div className="grid gap-4 lg:grid-cols-2">
        <StatusBars data={data.statusBreakdown} />
        <TeamRanking rows={data.team} />
      </div>

      {/* Linha 3: Canais */}
      <ChannelGrid channels={data.channels} />

      {/* Linha 4: Alertas */}
      <SmartAlerts insights={insights} />

      {/* Linha 5: Leads em Risco */}
      <RisksTable rows={data.riskList} />
    </div>
  );
}
