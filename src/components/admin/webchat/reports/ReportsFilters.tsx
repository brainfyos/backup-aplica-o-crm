import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProducts } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeam';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CalendarDays, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ReportsFilters, ReportsPeriod, ReportsChannel } from '@/hooks/useAttendanceReports';
import { useIsMobile } from '@/hooks/use-mobile';

const PERIOD_LABEL: Record<ReportsPeriod, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  custom: 'Personalizado',
};

interface Props {
  filters: ReportsFilters;
  onChange: (next: ReportsFilters) => void;
}

function FiltersBody({ filters, onChange }: Props) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id as string | undefined;
  const { data: products = [] } = useProducts();
  const { data: team = [] } = useTeamMembers(orgId);

  const { data: agents = [] } = useQuery({
    queryKey: ['attendance-reports-agents', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('product_agents')
        .select('id,name,is_active')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const [customOpen, setCustomOpen] = useState(false);

  const setPeriod = (period: ReportsPeriod) => {
    onChange({ ...filters, period });
    if (period === 'custom') setCustomOpen(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.period} onValueChange={(v) => setPeriod(v as ReportsPeriod)}>
        <SelectTrigger className="h-9 w-[170px] gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PERIOD_LABEL).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.period === 'custom' && (
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <CalendarDays className="h-4 w-4" />
              {filters.customFrom && filters.customTo
                ? `${format(new Date(filters.customFrom), 'dd/MM', { locale: ptBR })} – ${format(new Date(filters.customTo), 'dd/MM', { locale: ptBR })}`
                : 'Selecionar datas'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{
                from: filters.customFrom ? new Date(filters.customFrom) : undefined,
                to: filters.customTo ? new Date(filters.customTo) : undefined,
              }}
              onSelect={(r) => {
                onChange({
                  ...filters,
                  customFrom: r?.from ? r.from.toISOString() : undefined,
                  customTo: r?.to ? r.to.toISOString() : undefined,
                });
              }}
              numberOfMonths={2}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
      )}

      <Select
        value={filters.productId ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, productId: v === 'all' ? null : v })}
      >
        <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Produto" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os produtos</SelectItem>
          {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={filters.channel ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, channel: v as ReportsChannel })}
      >
        <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Canal" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os canais</SelectItem>
          <SelectItem value="whatsapp">WhatsApp</SelectItem>
          <SelectItem value="web_chat">Chat do Site</SelectItem>
          <SelectItem value="instagram">Instagram</SelectItem>
          <SelectItem value="facebook">Facebook</SelectItem>
          <SelectItem value="form">Formulário</SelectItem>
          <SelectItem value="quiz">Quiz</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.userId ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, userId: v === 'all' ? null : v })}
      >
        <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Equipe" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toda a equipe</SelectItem>
          {team.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select
        value={filters.agentId ?? 'all'}
        onValueChange={(v) => onChange({ ...filters, agentId: v === 'all' ? null : v })}
      >
        <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Agente IA" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os agentes</SelectItem>
          {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ReportsFilters(props: Props) {
  const isMobile = useIsMobile();
  if (!isMobile) return <FiltersBody {...props} />;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Filter className="h-4 w-4" /> Filtros
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
        <div className="mt-4 flex flex-col gap-3 [&_button]:w-full [&_>div>div]:w-full">
          <FiltersBody {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
