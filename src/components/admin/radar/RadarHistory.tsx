import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOpportunityScans } from '@/hooks/useOpportunityScan';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Eye, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export function RadarHistory({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: scans, isLoading } = useOpportunityScans();

  if (isLoading) {
    return (
      <Card><CardContent className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>
    );
  }

  if (!scans?.length) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma análise realizada ainda</CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de análises</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {scans.map((s) => {
          const Icon = s.status === 'completed' ? CheckCircle2 : s.status === 'error' ? XCircle : Clock;
          const iconColor = s.status === 'completed' ? 'text-green-500' : s.status === 'error' ? 'text-destructive' : 'text-orange-500';
          return (
            <div key={s.id} className="border rounded-lg p-3 flex items-center justify-between hover:bg-muted/30 transition-colors gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Icon className={`h-4 w-4 ${iconColor} shrink-0`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ptBR })}
                    <Badge variant="outline" className="ml-2 text-[10px]">{s.trigger_type}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                    <span>🔥 {s.hot_count}</span>
                    <span>🌤️ {s.warm_count}</span>
                    <span>❄️ {s.cold_count}</span>
                    <span>💀 {s.lost_count}</span>
                    <span>•</span>
                    <span>R$ {Number(s.potential_revenue || 0).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onSelect(s.id)}>
                <Eye className="h-3 w-3" /> Ver
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
