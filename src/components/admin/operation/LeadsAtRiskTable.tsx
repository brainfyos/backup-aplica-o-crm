import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { LeadAtRisk } from '@/hooks/useOperationCenter';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  rows?: LeadAtRisk[];
  onResolve: (leadId: string) => void;
}

export function LeadsAtRiskTable({ rows, onResolve }: Props) {
  const data = rows ?? [];
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Leads em Risco</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum lead em risco no momento. ✅
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left font-medium px-4 py-2">Lead</th>
                  <th className="text-left font-medium px-2 py-2">Responsável</th>
                  <th className="text-left font-medium px-2 py-2">Motivo</th>
                  <th className="text-left font-medium px-2 py-2">Última ação</th>
                  <th className="text-right font-medium px-4 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-2 py-2.5 text-muted-foreground">{r.assignedName ?? '—'}</td>
                    <td className="px-2 py-2.5">{r.reason}</td>
                    <td className="px-2 py-2.5 text-muted-foreground text-xs">
                      {r.lastActionAt
                        ? formatDistanceToNow(new Date(r.lastActionAt), { addSuffix: true, locale: ptBR })
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => onResolve(r.id)}>
                        Resolver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
