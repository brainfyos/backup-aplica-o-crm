import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { SellerPerformance } from '@/hooks/useOperationCenter';

interface Props {
  rows?: SellerPerformance[];
  onNavigate: (section: string) => void;
}

const statusLabel: Record<SellerPerformance['status'], { dot: string; text: string; label: string }> = {
  healthy: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'Ótimo' },
  attention: { dot: 'bg-orange-500', text: 'text-orange-600', label: 'Atenção' },
  critical: { dot: 'bg-red-500', text: 'text-red-600', label: 'Crítico' },
};

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
}

export function TeamPerformanceTable({ rows, onNavigate }: Props) {
  const data = rows ?? [];
  return (
    <Card className="border-border h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Performance da Equipe</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Sem vendedores ativos no momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left font-medium px-4 py-2">Vendedor</th>
                  <th className="text-right font-medium px-2 py-2">Conversas</th>
                  <th className="text-right font-medium px-2 py-2">Leads</th>
                  <th className="text-right font-medium px-2 py-2">Atrasadas</th>
                  <th className="text-right font-medium px-2 py-2">Reuniões Hoje</th>
                  <th className="text-right font-medium px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 6).map((r) => {
                  const s = statusLabel[r.status];
                  return (
                    <tr key={r.userId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7">
                            {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt={r.name} />}
                            <AvatarFallback className="text-[10px]">{initials(r.name)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium truncate">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.conversations}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.leads}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${r.overdue > 0 ? 'text-red-600 font-medium' : ''}`}>
                        {r.overdue}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.meetingsToday}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data.length > 6 && (
          <button
            onClick={() => onNavigate('team')}
            className="w-full px-4 py-2.5 border-t text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
          >
            Ver todos os vendedores →
          </button>
        )}
      </CardContent>
    </Card>
  );
}
