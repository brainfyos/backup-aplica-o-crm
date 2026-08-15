import { cn } from '@/lib/utils';
import { LayoutDashboard, Megaphone, PlusCircle, Sparkles, MoreHorizontal } from 'lucide-react';

export type MobileTab = 'resumo' | 'campanhas' | 'criar' | 'insights' | 'mais';

const ITEMS: { key: MobileTab; label: string; icon: any }[] = [
  { key: 'resumo',    label: 'Resumo',    icon: LayoutDashboard },
  { key: 'campanhas', label: 'Campanhas', icon: Megaphone },
  { key: 'criar',     label: 'Criar',     icon: PlusCircle },
  { key: 'insights',  label: 'Insights',  icon: Sparkles },
  { key: 'mais',      label: 'Mais',      icon: MoreHorizontal },
];

interface Props {
  active: MobileTab;
  onChange: (t: MobileTab) => void;
}

export function MobileBottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          const isCriar = item.key === 'criar';
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onChange(item.key)}
                className={cn(
                  'w-full flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center rounded-full transition-all',
                    isCriar
                      ? 'h-9 w-9 bg-primary text-primary-foreground shadow-md -mt-1'
                      : 'h-6 w-6',
                  )}
                >
                  <Icon className={cn(isCriar ? 'h-5 w-5' : 'h-5 w-5')} />
                </span>
                <span className={cn(isCriar && 'mt-0.5')}>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
