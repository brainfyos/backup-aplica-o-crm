import { LayoutDashboard, Kanban, MessageSquare, Menu, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHaptics } from '@/hooks/useHaptics';
import { motion } from 'framer-motion';
import { prefetchIndexTab } from '@/pages/Index';

interface MobileBottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onMoreClick: () => void;
  onPlusClick: () => void;
  hasProduct: boolean;
}

const leftItems = [
  { id: 'product-dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'inbox', label: 'Conversas', icon: MessageSquare },
];
const rightItems = [
  { id: 'leads', label: 'Pipeline', icon: Kanban },
  { id: 'more', label: 'Mais', icon: Menu },
];

const MORE_TABS = ['ai', 'tasks', 'cadence', 'playbook', 'objections', 'materials', 'financial', 'goals', 'bookings'];

export function MobileBottomNav({ activeTab, onTabChange, onMoreClick, onPlusClick, hasProduct }: MobileBottomNavProps) {
  const haptics = useHaptics();

  const handleClick = (id: string) => {
    haptics.selection();
    if (id === 'more') onMoreClick();
    else if (hasProduct) onTabChange(id);
  };

  const renderItem = (item: { id: string; label: string; icon: any }) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id || (item.id === 'more' && MORE_TABS.includes(activeTab));
    const isDisabled = !hasProduct && item.id !== 'more';

    return (
      <motion.button
        key={item.id}
        onClick={() => handleClick(item.id)}
        onTouchStart={() => item.id !== 'more' && prefetchIndexTab(item.id)}
        onMouseEnter={() => item.id !== 'more' && prefetchIndexTab(item.id)}
        disabled={isDisabled}
        whileTap={{ scale: 0.9 }}
        className={cn(
          'relative flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-xl transition-all duration-200 min-w-[56px]',
          isActive ? 'text-primary' : 'text-muted-foreground',
          isDisabled && 'opacity-40 pointer-events-none'
        )}
      >
        {isActive && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-primary/10 rounded-xl"
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        )}
        <div className="relative z-10">
          <Icon
            size={22}
            strokeWidth={isActive ? 2.5 : 2}
            className={cn('transition-transform duration-200', isActive && 'scale-110')}
          />
        </div>
        <span className={cn('relative z-10 text-[10px] font-medium leading-none', isActive && 'font-semibold')}>
          {item.label}
        </span>
      </motion.button>
    );
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border safe-area-bottom"
      style={{ right: 'var(--removed-body-scroll-bar-size, 0px)' }}
    >
      <div className="relative flex items-center h-16 px-2">
        <div className="flex-1 flex items-center justify-around">{leftItems.map(renderItem)}</div>

        {/* FAB central */}
        <div className="w-16 flex items-center justify-center">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              haptics.selection();
              onPlusClick();
            }}
            className="absolute -top-6 left-[calc(50%_-_1.75rem)] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center ring-4 ring-background"
            aria-label="Ações rápidas"
          >
            <Plus size={26} strokeWidth={2.5} />
          </motion.button>
        </div>

        <div className="flex-1 flex items-center justify-around">{rightItems.map(renderItem)}</div>
      </div>
    </nav>
  );
}
