import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, TrendingUp, PauseCircle, ImageOff, Wallet, AlertTriangle, DollarSign } from 'lucide-react';

const ITEMS = [
  { icon: TrendingUp, title: 'Campanhas para escalar', desc: 'ROAS alto e CPA em queda — sugestão de aumento de verba.' },
  { icon: PauseCircle, title: 'Campanhas para pausar', desc: 'Gasto sem retorno consistente nos últimos 7 dias.' },
  { icon: ImageOff, title: 'Criativos para trocar', desc: 'CTR em queda ou frequência elevada.' },
  { icon: Wallet, title: 'Orçamento sugerido', desc: 'Redistribuição de verba entre campanhas ativas.' },
  { icon: AlertTriangle, title: 'Frequência alta', desc: 'Anúncios saturando o mesmo público.' },
  { icon: DollarSign, title: 'CPA elevado', desc: 'Custo por venda acima da média do produto.' },
];

export function OptimizationsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-muted-foreground">Sugestões automáticas por IA — </span>
        <Badge variant="outline">Disponível ao ativar IA de Marketing</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ITEMS.map((it) => (
          <Card key={it.title} className="opacity-70">
            <CardContent className="p-5 space-y-2">
              <it.icon className="h-5 w-5 text-muted-foreground" />
              <div className="font-semibold">{it.title}</div>
              <p className="text-sm text-muted-foreground">{it.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
