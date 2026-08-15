import { Card, CardContent } from '@/components/ui/card';
import { Lock } from 'lucide-react';

export function ComingSoonSubTab({ phase, title }: { phase: string; title: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center space-y-2">
        <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-muted-foreground">
          Disponível na <b>{phase}</b>. A Fase 4.1 (Copiloto e Diagnósticos) já está ativa — teste as abas Diagnóstico e Recomendações.
        </p>
      </CardContent>
    </Card>
  );
}
