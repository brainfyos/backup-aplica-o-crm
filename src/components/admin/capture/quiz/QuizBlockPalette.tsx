import { memo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FunnelBlockType,
  FUNNEL_BLOCK_PALETTE,
  BlockPaletteItem,
  BlockCategory,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
} from '@/types/funnel';
import { cn } from '@/lib/utils';
import {
  ListChecks, MessageSquare, FormInput, Brain, GitBranch, Zap, Link,
  Video, ImageIcon, ExternalLink, Clock, ClipboardList, Bot, FileText, Dices,
  TrendingUp, Tag, UserPlus, Pencil, CheckSquare, Calendar, UserCheck, Flag,
  Webhook, RefreshCw, LayoutGrid, UserCog,
} from 'lucide-react';

interface Props {
  onAddBlock: (type: FunnelBlockType, position?: { x: number; y: number }) => void;
}

// Whitelist do Quiz — perguntas + scoring + captura final. SEM IA conversacional e SEM agendamento.
const QUIZ_BLOCKS: FunnelBlockType[] = [
  'message', 'buttons', 'video', 'image', 'delay',
  'input', 'quick_form',
  'condition', 'ab_test',
  'score', 'tag', 'create_lead', 'update_lead', 'end',
  'webhook',
];

const BLOCK_ICONS: Record<FunnelBlockType, React.ComponentType<{ className?: string }>> = {
  message: MessageSquare, buttons: LayoutGrid, video: Video, image: ImageIcon,
  link: ExternalLink, delay: Clock, input: FormInput, quick_form: ClipboardList,
  ai_takeover: Bot, ai_decide: Brain, ai_qualify: Brain, ai_summarize: FileText,
  agent_switch: UserCog, condition: GitBranch, ab_test: Dices, score: TrendingUp,
  tag: Tag, create_lead: UserPlus, update_lead: Pencil, create_task: CheckSquare,
  schedule: Calendar, handoff: UserCheck, end: Flag, webhook: Webhook, crm_sync: RefreshCw,
};

const CATEGORY_ICONS: Record<BlockCategory, React.ComponentType<{ className?: string }>> = {
  experience: MessageSquare, capture: FormInput, ai: Brain,
  logic: GitBranch, action: Zap, integration: Link,
};

const PaletteItem = memo(function PaletteItem({
  item, onDragStart, onClick,
}: {
  item: BlockPaletteItem;
  onDragStart: (e: React.DragEvent, type: FunnelBlockType) => void;
  onClick: () => void;
}) {
  const colors = CATEGORY_COLORS[item.category];
  const Icon = BLOCK_ICONS[item.type];
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item.type)}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-grab active:cursor-grabbing',
        'transition-all duration-150 border hover:scale-[1.02] active:scale-[0.98] hover:shadow-sm',
        colors.bg, colors.border,
      )}
    >
      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-white shadow-sm', item.color)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <span className={cn('font-medium text-xs', colors.text)}>{item.label}</span>
        <p className="text-[10px] text-muted-foreground truncate leading-tight">{item.description}</p>
      </div>
    </div>
  );
});

export const QuizBlockPalette = memo(function QuizBlockPalette({ onAddBlock }: Props) {
  const allowed = FUNNEL_BLOCK_PALETTE.filter(b => QUIZ_BLOCKS.includes(b.type));
  const categories: { key: BlockCategory; items: BlockPaletteItem[] }[] = ([
    { key: 'experience', items: allowed.filter(b => b.category === 'experience') },
    { key: 'capture', items: allowed.filter(b => b.category === 'capture') },
    { key: 'logic', items: allowed.filter(b => b.category === 'logic') },
    { key: 'action', items: allowed.filter(b => b.category === 'action') },
    { key: 'integration', items: allowed.filter(b => b.category === 'integration') },
  ] as { key: BlockCategory; items: BlockPaletteItem[] }[]).filter(c => c.items.length > 0);

  const handleDragStart = (e: React.DragEvent, type: FunnelBlockType) => {
    e.dataTransfer.setData('block-type', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-3 border-b bg-gradient-to-r from-primary/5 to-transparent shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <ListChecks className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Blocos do Quiz</h3>
            <p className="text-[10px] text-muted-foreground">Perguntas + pontuação</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {categories.map(({ key, items }) => {
            const colors = CATEGORY_COLORS[key];
            const labels = CATEGORY_LABELS[key];
            const Icon = CATEGORY_ICONS[key];
            return (
              <div key={key} className="space-y-1.5">
                <div className={cn('flex items-center gap-2 px-2 py-1.5 rounded-md', colors.bg)}>
                  <Icon className={cn('h-3.5 w-3.5', colors.text)} />
                  <span className={cn('text-[11px] font-semibold uppercase tracking-wider', colors.text)}>
                    {labels.label}
                  </span>
                </div>
                <div className="space-y-1 pl-1">
                  {items.map(item => (
                    <PaletteItem key={item.type} item={item} onDragStart={handleDragStart} onClick={() => onAddBlock(item.type)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="px-3 py-2 border-t bg-muted/30 shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">
          Use "Botões" para perguntas e "Pontuar" para classificar
        </p>
      </div>
    </div>
  );
});
