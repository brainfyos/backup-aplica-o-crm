import { Card } from '@/components/ui/card';
import { Users, MessageSquare, Target, Briefcase, TrendingUp, DollarSign, Loader2 } from 'lucide-react';
import type { JourneyMetrics } from '@/lib/leadJourney';

interface Props {
  metrics?: JourneyMetrics;
  isLoading?: boolean;
}

const items = [
  { key: 'leadsCaptured' as const, label: 'Leads Captados',  icon: Users,        tint: 'blue' },
  { key: 'conversations' as const, label: 'Conversas',       icon: MessageSquare, tint: 'cyan' },
  { key: 'qualified' as const,     label: 'Qualificados',    icon: Target,       tint: 'violet' },
  { key: 'opportunities' as const, label: 'Oportunidades',   icon: Briefcase,    tint: 'amber' },
  { key: 'sales' as const,         label: 'Vendas',          icon: TrendingUp,   tint: 'emerald' },
  { key: 'revenue' as const,       label: 'Receita',         icon: DollarSign,   tint: 'green', money: true },
];

const TINTS: Record<string, { chip: string; icon: string; ring: string; glow: string }> = {
  blue:    { chip: 'bg-blue-500/10',    icon: 'text-blue-500',    ring: 'ring-blue-500/20',    glow: 'from-blue-500/10' },
  cyan:    { chip: 'bg-cyan-500/10',    icon: 'text-cyan-500',    ring: 'ring-cyan-500/20',    glow: 'from-cyan-500/10' },
  violet:  { chip: 'bg-violet-500/10',  icon: 'text-violet-500',  ring: 'ring-violet-500/20',  glow: 'from-violet-500/10' },
  amber:   { chip: 'bg-amber-500/10',   icon: 'text-amber-500',   ring: 'ring-amber-500/20',   glow: 'from-amber-500/10' },
  emerald: { chip: 'bg-emerald-500/10', icon: 'text-emerald-500', ring: 'ring-emerald-500/20', glow: 'from-emerald-500/10' },
  green:   { chip: 'bg-green-500/10',   icon: 'text-green-500',   ring: 'ring-green-500/20',   glow: 'from-green-500/10' },
};

function fmt(n: number, money = false) {
  if (money) {
    if (n >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  return n.toLocaleString('pt-BR');
}

export function JourneyDashboard({ metrics, isLoading }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        const value = metrics?.[it.key] ?? 0;
        const t = TINTS[it.tint];
        return (
          <Card
            key={it.key}
            className={`relative overflow-hidden p-5 border-border/60 hover:border-border transition-all hover:shadow-md ring-1 ${t.ring}`}
          >
            <div className={`pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br ${t.glow} to-transparent blur-2xl`} />
            <div className="flex items-start justify-between">
              <span className="text-[11px] text-muted-foreground uppercase tracking-[0.08em] font-semibold">
                {it.label}
              </span>
              <div className={`h-9 w-9 rounded-xl grid place-items-center ${t.chip}`}>
                <Icon className={`h-[18px] w-[18px] ${t.icon}`} />
              </div>
            </div>
            <div className="text-[28px] font-bold tracking-tight mt-3 leading-none">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : fmt(value, it.money)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
