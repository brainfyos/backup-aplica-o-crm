import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, AlertTriangle, TrendingUp, ImageOff, PauseCircle, DollarSign, Target, Sparkles, CheckCircle2, X } from 'lucide-react';
import { useMarketingFindings, useAnalyzeMarketing, useUpdateFinding } from '@/hooks/useMarketingAI';
import type { MarketingFinding } from '@/hooks/useMarketingAI';

const CATEGORY_ICON: Record<string, any> = {
  roas_high: TrendingUp,
  spend_no_sales: PauseCircle,
  creative_fatigue: ImageOff,
  cpl_high: DollarSign,
  no_conversion_tracking: Target,
};

const SEVERITY_STYLE: Record<string, string> = {
  info: 'bg-muted text-foreground',
  low: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  critical: 'bg-destructive/10 text-destructive',
};

export function DiagnosticSubTab() {
  const [severity, setSeverity] = useState<'all' | MarketingFinding['severity']>('all');
  const [days, setDays] = useState(14);
  const { data: findings = [], isLoading } = useMarketingFindings('open');
  const analyze = useAnalyzeMarketing();
  const update = useUpdateFinding();

  const filtered = severity === 'all' ? findings : findings.filter((f) => f.severity === severity);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Diagnósticos abertos ({filtered.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Severidade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas severidades</SelectItem>
              <SelectItem value="critical">Crítica</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="low">Baixa</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7d</SelectItem>
              <SelectItem value="14">Últimos 14d</SelectItem>
              <SelectItem value="30">Últimos 30d</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => analyze.mutate(days)} disabled={analyze.isPending}>
            {analyze.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Reanalisar agora
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
          Nenhum diagnóstico aberto. Clique em <b>Reanalisar agora</b> para gerar uma nova análise.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((f) => {
            const Icon = CATEGORY_ICON[f.category] ?? AlertTriangle;
            return (
              <Card key={f.id}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <Icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-sm leading-tight">{f.title}</div>
                        {f.scope_ref_label && (
                          <div className="text-xs text-muted-foreground mt-0.5">{f.scope} · {f.scope_ref_label}</div>
                        )}
                      </div>
                    </div>
                    <Badge className={SEVERITY_STYLE[f.severity]} variant="outline">{f.severity}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{f.summary}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: f.id, status: 'dismissed' })}>
                      <X className="h-3.5 w-3.5 mr-1" /> Ignorar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => update.mutate({ id: f.id, status: 'resolved' })}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Marcar como resolvido
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
