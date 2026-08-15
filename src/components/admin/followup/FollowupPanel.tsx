import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFollowupPanelStats, useFollowupActiveLeads, useFollowupRealtime, FollowupFilters, FollowupStatusKey } from '@/hooks/useFollowupPanel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { FollowupKpiCards } from './FollowupKpiCards';
import { FollowupRecoveryByAttempt } from './FollowupRecoveryByAttempt';
import { FollowupSentTrend } from './FollowupSentTrend';
import { FollowupActiveStatusDonut } from './FollowupActiveStatusDonut';
import { FollowupActiveLeadsTable } from './FollowupActiveLeadsTable';
import { FollowupUpcomingWidget } from './FollowupUpcomingWidget';

type RangeKey = 'today' | '7d' | '30d';

function getRange(key: RangeKey): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (key === 'today') from.setHours(0, 0, 0, 0);
  else if (key === '7d') from.setDate(from.getDate() - 7);
  else from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function FollowupPanel() {
  const { user } = useAuth();
  const [range, setRange] = useState<RangeKey>('7d');
  const [agentId, setAgentId] = useState<string | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<FollowupStatusKey | 'all'>('all');

  const { from, to } = useMemo(() => getRange(range), [range]);
  const filters: FollowupFilters = {
    from, to,
    agentId: agentId === 'all' ? null : agentId,
    status: statusFilter,
  };

  useFollowupRealtime();

  const stats = useFollowupPanelStats(filters);
  const leads = useFollowupActiveLeads(filters);

  const agentsQ = useQuery({
    queryKey: ['followup-agents-list', user?.id],
    queryFn: async () => {
      const { data: prof } = await supabase
        .from('profiles').select('organization_id').eq('id', user!.id).maybeSingle();
      const orgId = (prof as { organization_id?: string } | null)?.organization_id;
      if (!orgId) return [];
      const { data } = await supabase
        .from('product_agents')
        .select('id, name')
        .eq('organization_id', orgId)
        .order('name');
      return (data as { id: string; name: string }[]) ?? [];
    },
    enabled: !!user,
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o desempenho dos follow-ups automáticos em tempo real.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todos os agentes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os agentes</SelectItem>
              {(agentsQ.data ?? []).map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <FollowupKpiCards stats={stats.data} loading={stats.isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <FollowupRecoveryByAttempt data={stats.data?.recovery_by_attempt ?? []} />
        <FollowupSentTrend data={stats.data?.sent_trend_7d ?? []} />
        <FollowupActiveStatusDonut data={stats.data?.active_status_breakdown} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FollowupActiveLeadsTable
            rows={leads.data ?? []}
            loading={leads.isLoading}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
        </div>
        <FollowupUpcomingWidget
          data={stats.data?.upcoming_buckets}
          onBucketClick={() => setStatusFilter('waiting_next')}
        />
      </div>
    </div>
  );
}
