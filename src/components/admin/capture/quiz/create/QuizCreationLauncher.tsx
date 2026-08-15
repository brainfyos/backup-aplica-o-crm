import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, Sparkles, LayoutTemplate, ArrowRight } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (mode: 'scratch' | 'ai' | 'template') => void;
}

const OPTIONS = [
  {
    id: 'scratch' as const,
    icon: Pencil,
    title: 'Criar do Zero',
    description: 'Comece com um quiz em branco e monte perguntas, lógica, resultados e ações manualmente.',
    gradient: 'from-slate-500/10 to-slate-500/5',
    iconBg: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
  },
  {
    id: 'ai' as const,
    icon: Sparkles,
    title: 'Criar com IA',
    description: 'Descreva o contexto e a IA cria perguntas, opções, lógica, pontuação, resultados e ações.',
    gradient: 'from-primary/15 to-primary/5',
    iconBg: 'bg-primary/15 text-primary',
    badge: 'IA',
  },
  {
    id: 'template' as const,
    icon: LayoutTemplate,
    title: 'Usar Template',
    description: 'Escolha um modelo pronto de quiz e personalize para sua operação.',
    gradient: 'from-emerald-500/10 to-emerald-500/5',
    iconBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
];

export function QuizCreationLauncher({ open, onOpenChange, onPick }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Como você deseja criar seu quiz?</DialogTitle>
          <DialogDescription>Escolha o ponto de partida ideal para o seu objetivo.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Card
                key={opt.id}
                onClick={() => onPick(opt.id)}
                className={`group relative cursor-pointer overflow-hidden p-6 transition-all hover:border-primary hover:shadow-lg hover:-translate-y-0.5 bg-gradient-to-br ${opt.gradient}`}
              >
                {opt.badge && (
                  <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">{opt.badge}</Badge>
                )}
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-4 ${opt.iconBg}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{opt.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 min-h-[60px]">{opt.description}</p>
                <div className="flex items-center text-sm text-primary font-medium opacity-0 group-hover:opacity-100 transition">
                  Continuar <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
