import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

export function VoicePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="p-10 text-center">
        <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Este módulo entra na próxima fase da implantação.</p>
        <p className="text-xs text-muted-foreground mt-1">A Fase 1 entregou a base (agentes, histórico, dashboard e recebidas). Contextos, Campanhas e Ao Vivo vêm em seguida.</p>
      </Card>
    </div>
  );
}
