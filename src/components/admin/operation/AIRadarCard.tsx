import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Flame, AlertTriangle, DollarSign, Calendar, Users, ChevronRight } from 'lucide-react';
import type { RadarInsight } from '@/hooks/useOperationCenter';

interface Props {
  items?: RadarInsight[];
  onNavigate: (section: string) => void;
}

const iconMap = {
  fire: { Icon: Flame, bg: 'bg-orange-50 text-orange-600' },
  warn: { Icon: AlertTriangle, bg: 'bg-red-50 text-red-600' },
  money: { Icon: DollarSign, bg: 'bg-emerald-50 text-emerald-600' },
  calendar: { Icon: Calendar, bg: 'bg-blue-50 text-blue-600' },
  users: { Icon: Users, bg: 'bg-violet-50 text-violet-600' },
};

export function AIRadarCard({ items, onNavigate }: Props) {
  const data = items ?? [];
  return (
    <Card className="border-border h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Radar IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Sem alertas no momento.
          </div>
        ) : (
          data.map((i) => {
            const { Icon, bg } = iconMap[i.icon];
            return (
              <button
                key={i.id}
                onClick={() => i.navigateTo && onNavigate(i.navigateTo)}
                className="w-full flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors text-left"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground leading-tight">{i.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{i.hint}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
