import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, TrendingUp, Sparkles, CheckCircle2, ArrowRight, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { FunnelBlock } from '@/types/funnel';

export interface ResultTier {
  id: string;
  label: string;
  min: number;
  max: number;
  color?: string; // hex
  message?: string;
}

export interface ResultMetric {
  id: string;
  label: string;
  value: number; // 0-100 progress
  display?: string; // texto a exibir (ex: "72%")
  color?: string;
}

export const DEFAULT_TIERS: ResultTier[] = [
  { id: 't1', label: 'Iniciante', min: 0, max: 20, color: '#f97316', message: 'Há muito espaço para crescer.' },
  { id: 't2', label: 'Intermediário', min: 21, max: 50, color: '#3b82f6', message: 'Bom caminho — vamos acelerar.' },
  { id: 't3', label: 'Avançado', min: 51, max: 100, color: '#10b981', message: 'Excelente! Pronto para o próximo nível.' },
];

export function pickTier(score: number, tiers: ResultTier[] = DEFAULT_TIERS): ResultTier {
  return tiers.find(t => score >= t.min && score <= t.max) ||
    tiers[tiers.length - 1] || DEFAULT_TIERS[0];
}

interface QuizResultViewProps {
  block: FunnelBlock;
  scoreTotal: number;
  tags: string[];
  responses: Record<string, string>;
  funnelId: string;
  primaryColor: string;
}

interface AIResult {
  diagnostico?: string;
  oportunidades?: string[];
  proximos_passos?: string[];
  oferta?: string;
}

export function QuizResultView({
  block, scoreTotal, tags, responses, funnelId, primaryColor,
}: QuizResultViewProps) {
  const data: any = block.data || {};
  const tiers: ResultTier[] = (data.result_tiers as ResultTier[]) || DEFAULT_TIERS;
  const metrics: ResultMetric[] = (data.result_metrics as ResultMetric[]) || [];
  const isAI = data.quiz_subtype === 'result_ai' || !!data.result_ai_enabled;

  const tier = pickTier(scoreTotal, tiers);
  const accent = tier.color || primaryColor;

  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAI || aiResult || aiLoading) return;
    let cancelled = false;
    setAiLoading(true);
    setAiError(null);
    supabase.functions.invoke('quiz-ai-result', {
      body: {
        funnel_id: funnelId,
        responses,
        score_total: scoreTotal,
        score_tier: tier.label,
        tags,
        custom_prompt: data.result_ai_prompt || undefined,
      },
    }).then(({ data: out, error }) => {
      if (cancelled) return;
      if (error || (out as any)?.error) {
        setAiError((out as any)?.error || error?.message || 'Falha ao gerar resultado');
      } else {
        setAiResult(out as AIResult);
      }
    }).finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAI, funnelId]);

  const pct = Math.max(0, Math.min(100, scoreTotal));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border bg-card p-5 space-y-5 shadow-sm"
    >
      {/* Gauge / Score */}
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
            <motion.circle
              cx="50" cy="50" r="42" fill="none"
              stroke={accent} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 42}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - pct / 100) }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums" style={{ color: accent }}>{Math.round(scoreTotal)}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">pontos</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${accent}20`, color: accent }}
            >
              {tier.label}
            </span>
          </div>
          <h3 className="text-lg font-bold leading-tight">
            {data.success_message || 'Seu resultado'}
          </h3>
          {tier.message && (
            <p className="text-sm text-muted-foreground mt-1">{tier.message}</p>
          )}
        </div>
      </div>

      {/* Métricas simuladas */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((m) => {
            const v = Math.max(0, Math.min(100, m.value || 0));
            const c = m.color || accent;
            return (
              <div key={m.id} className="rounded-xl border bg-background/50 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground truncate">
                    {m.label}
                  </p>
                  <TrendingUp className="h-3 w-3" style={{ color: c }} />
                </div>
                <p className="text-xl font-bold tabular-nums mb-1.5" style={{ color: c }}>
                  {m.display || `${v}%`}
                </p>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${v}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: c }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tags coletadas */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
            >#{t}</span>
          ))}
        </div>
      )}

      {/* Resultado IA */}
      {isAI && (
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: accent }}>
            <Sparkles className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wider">Análise IA</span>
          </div>

          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Gerando seu diagnóstico...
            </div>
          )}

          {aiError && (
            <p className="text-xs text-destructive">{aiError}</p>
          )}

          {aiResult && (
            <div className="space-y-3 text-sm">
              {aiResult.diagnostico && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    Diagnóstico
                  </p>
                  <p className="text-foreground leading-relaxed">{aiResult.diagnostico}</p>
                </div>
              )}

              {!!aiResult.oportunidades?.length && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                    <Target className="h-3 w-3" /> Oportunidades
                  </p>
                  <ul className="space-y-1">
                    {aiResult.oportunidades.map((o, i) => (
                      <li key={i} className="flex gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: accent }} />
                        <span className="text-foreground">{o}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!!aiResult.proximos_passos?.length && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                    <ArrowRight className="h-3 w-3" /> Próximos passos
                  </p>
                  <ol className="space-y-1 list-decimal list-inside">
                    {aiResult.proximos_passos.map((p, i) => (
                      <li key={i} className="text-foreground">{p}</li>
                    ))}
                  </ol>
                </div>
              )}

              {aiResult.oferta && (
                <div
                  className="rounded-xl p-3 mt-2"
                  style={{ backgroundColor: `${accent}10`, border: `1px solid ${accent}40` }}
                >
                  <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: accent }}>
                    Recomendação
                  </p>
                  <p className="text-sm font-medium text-foreground">{aiResult.oferta}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
