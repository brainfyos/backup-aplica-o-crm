import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { UserPlus, Wallet, CheckSquare, CalendarPlus } from 'lucide-react';
import { motion } from 'framer-motion';
import { useHaptics } from '@/hooks/useHaptics';

export type QuickAction = 'create-lead' | 'portfolio' | 'new-task' | 'new-event';

interface QuickActionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: QuickAction) => void;
}

const actions: { id: QuickAction; label: string; description: string; icon: any; color: string }[] = [
  { id: 'create-lead', label: 'Cadastrar cliente', description: 'Novo lead na base', icon: UserPlus, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { id: 'portfolio', label: 'Carteira de clientes', description: 'Meus leads', icon: Wallet, color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  { id: 'new-task', label: 'Nova tarefa', description: 'Adicionar à agenda', icon: CheckSquare, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { id: 'new-event', label: 'Novo compromisso', description: 'Agendar reunião', icon: CalendarPlus, color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
];

export function QuickActionsSheet({ open, onOpenChange, onAction }: QuickActionsSheetProps) {
  const haptics = useHaptics();

  const handle = (id: QuickAction) => {
    haptics.selection();
    onOpenChange(false);
    setTimeout(() => onAction(id), 120);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>Atalhos rápidos</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-3">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <motion.button
                key={a.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => handle(a.id)}
                className="flex flex-col items-start gap-2 p-4 rounded-2xl border border-border bg-card hover:bg-accent/40 transition-colors text-left"
              >
                <div className={`p-2.5 rounded-xl ${a.color}`}>
                  <Icon size={22} strokeWidth={2.2} />
                </div>
                <div>
                  <div className="text-sm font-semibold leading-tight">{a.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
