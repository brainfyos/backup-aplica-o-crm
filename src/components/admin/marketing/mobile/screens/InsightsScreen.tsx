import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Sparkles, Loader2, ChevronRight } from 'lucide-react';
import {
  useMarketingFindings,
  useMarketingRecommendations,
  useAnalyzeMarketing,
} from '@/hooks/useMarketingAI';
import { useNavigate } from 'react-router-dom';

const SEV: Record<string, { label: string; className: string }> = {
  critical: { label: 'Crítico', className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' },
  high:     { label: 'Alto',    className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30' },
  medium:   { label: 'Médio',   className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  low:      { label: 'Baixo',   className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30' },
  info:     { label: 'Info',    className: 'bg-muted text-muted-foreground border-transparent' },
};

export function InsightsScreen() {
  const navigate = useNavigate();
  const { data: findings = [], isLoading: loadingF } = useMarketingFindings('open');
  const { data: recs = [], isLoading: loadingR } = useMarketingRecommendations('pending');
  const analyze = useAnalyzeMarketing();

  return (
    <div className="px-4 pt-3 pb-24 space-y-4">
      <Card className="p-4 flex items-center gap-3 border-primary/30 bg-primary/5">
        <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Rodar análise agora</p>
          <p className="text-xs text-muted-foreground">
            IA analisa suas campanhas dos últimos 14 dias
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => analyze.mutate(14)}
          disabled={analyze.isPending}
        >
          {analyze.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analisar'}
        </Button>
      </Card>

      {/* Diagnósticos */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">Diagnósticos ({findings.length})</h2>
        </div>
        {loadingF && (
          <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>
        )}
        {!loadingF && findings.length === 0 && (
          <Card className="p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum diagnóstico aberto. Rode uma análise para gerar insights.
            </p>
          </Card>
        )}
        {findings.slice(0, 10).map((f) => {
          const sev = SEV[f.severity] ?? SEV.info;
          return (
            <Card key={f.id} className="p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium leading-snug">{f.title}</p>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${sev.className}`}>
                  {sev.label}
                </Badge>
              </div>
              {f.summary && (
                <p className="text-xs text-muted-foreground line-clamp-3">{f.summary}</p>
              )}
              {f.scope_ref_label && (
                <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                  {f.scope}: {f.scope_ref_label}
                </p>
              )}
            </Card>
          );
        })}
      </section>

      {/* Recomendações */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">Recomendações ({recs.length})</h2>
          {recs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => navigate('/admin?tab=marketing-optimizations&view=recommendations')}
            >
              Ver todas <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          )}
        </div>
        {loadingR && (
          <p className="text-xs text-muted-foreground text-center py-4">Carregando…</p>
        )}
        {!loadingR && recs.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma recomendação pendente.
            </p>
          </Card>
        )}
        {recs.slice(0, 8).map((r) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">
                  {r.action_type.replace(/_/g, ' ')}
                </p>
                {r.target_label && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    {r.target_type}: {r.target_label}
                  </p>
                )}
              </div>
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 ${
                  r.risk === 'high'
                    ? 'border-rose-500/30 text-rose-600 dark:text-rose-400'
                    : r.risk === 'medium'
                      ? 'border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                Risco {r.risk}
              </Badge>
            </div>
            {r.rationale && (
              <p className="text-xs text-muted-foreground line-clamp-3 mt-1">{r.rationale}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-8 w-full text-xs"
              onClick={() => navigate('/admin?tab=marketing-optimizations&view=recommendations')}
            >
              Revisar e aplicar
            </Button>
          </Card>
        ))}
      </section>
    </div>
  );
}
