import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  icon: ReactNode;
  count: number;
  accent: 'amber' | 'violet' | 'emerald';
  children: ReactNode;
}

const accentTitle: Record<Props['accent'], string> = {
  amber: 'text-amber-700 dark:text-amber-400',
  violet: 'text-violet-700 dark:text-violet-400',
  emerald: 'text-emerald-700 dark:text-emerald-400',
};

const accentDot: Record<Props['accent'], string> = {
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
};

export function PanelSection({ title, icon, count, accent, children }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className={cn('h-2 w-2 rounded-full', accentDot[accent])} />
        <div className={cn('flex items-center gap-2', accentTitle[accent])}>
          {icon}
          <h2 className="text-sm font-bold uppercase tracking-wider">{title}</h2>
        </div>
        <span className="text-xs text-muted-foreground">({count})</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="flex gap-3 overflow-x-auto snap-x pb-2 -mx-1 px-1">{children}</div>
    </section>
  );
}
