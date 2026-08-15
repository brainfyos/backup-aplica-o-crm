import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import {
  Route, Target, Zap, Code2, Settings2, ChevronRight,
} from 'lucide-react';

const ITEMS = [
  { id: 'marketing-journey',       label: 'Jornada do Lead',   desc: 'Rastreamento ponta a ponta',    icon: Route },
  { id: 'marketing-attribution',   label: 'Atribuição',        desc: 'Origem real dos leads',         icon: Target,    adminOnly: true },
  { id: 'marketing-conversions',   label: 'Conversões',        desc: 'Eventos personalizados',        icon: Zap,       adminOnly: true },
  { id: 'marketing-optimizations', label: 'Otimizações com IA', desc: 'Regras e execuções',           icon: Settings2 },
  { id: 'marketing-tracking',      label: 'Rastreamento',       desc: 'Pixel & CAPI',                 icon: Code2,     adminOnly: true },
];

export function MaisScreen() {
  const navigate = useNavigate();
  return (
    <div className="px-4 pt-3 pb-24 space-y-2">
      <p className="text-xs text-muted-foreground px-1 mb-1">
        Ferramentas avançadas de Marketing
      </p>
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => navigate(`/admin?tab=${item.id}`)}
            className="w-full text-left"
          >
            <Card className="p-4 flex items-center gap-3 hover:bg-accent/40 active:bg-accent transition-colors">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Card>
          </button>
        );
      })}
    </div>
  );
}
