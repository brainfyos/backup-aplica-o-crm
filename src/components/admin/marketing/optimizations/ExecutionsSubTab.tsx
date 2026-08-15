import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Undo2, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { useMarketingExecutions, useRevertExecution, type MarketingExecution } from '@/hooks/useMarketingAI';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_STYLE: Record<string, string> = {
  success: 'bg-green-500/10 text-green-700 dark:text-green-400',
  failed: 'bg-destructive/10 text-destructive',
  reverted: 'bg-muted text-muted-foreground',
  queued: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

const ACTION_LABEL: Record<string, string> = {
  increase_budget: 'Aumentar verba',
  decrease_budget: 'Reduzir verba',
  pause: 'Pausar',
  activate: 'Ativar',
  swap_creative: 'Trocar criativo',
  duplicate: 'Duplicar',
  move_budget: 'Realocar verba',
};

function labelFor(a: string) {
  if (a.startsWith('revert:')) return `Reverter · ${ACTION_LABEL[a.slice(7)] ?? a.slice(7)}`;
  return ACTION_LABEL[a] ?? a;
}

export function ExecutionsSubTab({ mode = 'recent' as 'recent' | 'history' }) {
  const { data: execs = [], isLoading } = useMarketingExecutions(mode);
  const revert = useRevertExecution();

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (execs.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-muted-foreground">
          Nenhuma execução ainda. Aplique uma recomendação para começar.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {execs.map((e: MarketingExecution) => {
        const Icon = e.status === 'success' ? CheckCircle2 : e.status === 'failed' ? XCircle : RotateCcw;
        const canRevert = e.status === 'success' && !e.reverted_at && !e.action_type.startsWith('revert:');
        return (
          <Card key={e.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Icon className={`h-4 w-4 mt-0.5 ${e.status === 'success' ? 'text-green-600' : e.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <div>
                    <div className="text-sm font-medium">
                      {labelFor(e.action_type)} — {e.target_label ?? e.target_ref_id}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {e.target_type} · {formatDistanceToNow(new Date(e.executed_at), { locale: ptBR, addSuffix: true })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={STATUS_STYLE[e.status]}>{e.status}</Badge>
                  {canRevert && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revert.mutate(e.id)}
                      disabled={revert.isPending}
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-1" /> Reverter
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded border p-2">
                  <div className="text-muted-foreground mb-1">Antes</div>
                  <code className="text-[11px] break-all">{JSON.stringify(e.previous_state)}</code>
                </div>
                <div className="rounded border p-2 bg-primary/5">
                  <div className="text-muted-foreground mb-1">Depois</div>
                  <code className="text-[11px] break-all">{JSON.stringify(e.applied_state)}</code>
                </div>
              </div>

              {e.error && (
                <div className="text-xs text-destructive rounded bg-destructive/5 p-2">
                  Erro Meta: {e.error}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
