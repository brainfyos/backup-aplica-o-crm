import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, Sparkles, Calendar } from 'lucide-react';
import type { RealtimeOps } from '@/hooks/useOperationCenter';

interface Props {
  data?: RealtimeOps;
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-32 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums w-10 text-right">{value}</span>
    </div>
  );
}

export function RealtimeOpsCard({ data }: Props) {
  const c = data?.conversations;
  const cad = data?.cadences;
  const ag = data?.agenda;

  const convMax = Math.max(c?.withAI ?? 0, c?.inAttendance ?? 0, c?.humanQueue ?? 0, c?.resolvedToday ?? 0, 1);
  const cadMax = Math.max(cad?.activeEnrollments ?? 0, cad?.executedToday ?? 0, cad?.responded ?? 0, cad?.paused ?? 0, 1);
  const agMax = Math.max(ag?.todayMeetings ?? 0, ag?.confirmed ?? 0, ag?.pending ?? 0, 1);

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Operação em Tempo Real</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="h-4 w-4 text-emerald-600" /> Conversas
          </div>
          <Bar label="Com IA" value={c?.withAI ?? 0} max={convMax} color="bg-emerald-500" />
          <Bar label="Em Atendimento" value={c?.inAttendance ?? 0} max={convMax} color="bg-orange-500" />
          <Bar label="Fila Humana" value={c?.humanQueue ?? 0} max={convMax} color="bg-blue-500" />
          <Bar label="Finalizadas Hoje" value={c?.resolvedToday ?? 0} max={convMax} color="bg-muted-foreground/60" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-violet-600" /> Cadências
          </div>
          <Bar label="Ativas" value={cad?.activeEnrollments ?? 0} max={cadMax} color="bg-violet-500" />
          <Bar label="Executadas Hoje" value={cad?.executedToday ?? 0} max={cadMax} color="bg-indigo-500" />
          <Bar label="Responderam" value={cad?.responded ?? 0} max={cadMax} color="bg-emerald-500" />
          <Bar label="Paradas" value={cad?.paused ?? 0} max={cadMax} color="bg-red-500" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Calendar className="h-4 w-4 text-blue-600" /> Agenda
          </div>
          <Bar label="Reuniões Hoje" value={ag?.todayMeetings ?? 0} max={agMax} color="bg-blue-500" />
          <Bar label="Confirmadas" value={ag?.confirmed ?? 0} max={agMax} color="bg-emerald-500" />
          <Bar label="Pendentes" value={ag?.pending ?? 0} max={agMax} color="bg-orange-500" />
        </div>
      </CardContent>
    </Card>
  );
}
