import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiCardLargeProps {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  /** Se true, delta negativo é bom (ex: CPL, CPC). */
  invertDelta?: boolean;
  accent?: 'default' | 'primary' | 'success';
}

export function KpiCardLarge({ label, value, delta, hint, invertDelta, accent = 'default' }: KpiCardLargeProps) {
  let deltaBlock: React.ReactNode = null;
  if (delta != null && isFinite(delta)) {
    const rounded = Math.round(delta * 10) / 10;
    const isFlat = Math.abs(rounded) < 0.1;
    const isUp = rounded > 0;
    // "positivo" para o negócio
    const isGood = isFlat ? true : (invertDelta ? !isUp : isUp);
    const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
    deltaBlock = (
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
          isFlat
            ? 'bg-muted text-muted-foreground'
            : isGood
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
        )}
      >
        <Icon className="h-3 w-3" />
        {isFlat ? '0%' : `${isUp ? '+' : ''}${rounded}%`}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-4 shadow-sm flex flex-col gap-2 min-h-[104px]',
        accent === 'primary' && 'border-primary/30 bg-primary/5',
        accent === 'success' && 'border-emerald-500/30 bg-emerald-500/5',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground truncate">
          {label}
        </p>
        {deltaBlock}
      </div>
      <p className="text-xl font-semibold tabular-nums leading-tight truncate">
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground/80 truncate">{hint}</p>}
    </div>
  );
}
