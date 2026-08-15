import { useMemo, useState } from 'react';
import { Plus, Trash2, Copy, Flag, GripVertical } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { FunnelBlock } from '@/types/funnel';

interface Props {
  blocks: FunnelBlock[];
  startBlockId: string | null;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  onAddStep: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onSetStart: (id: string) => void;
  onReorder: (sourceIndex: number, targetIndex: number) => void;
}

function stepLabel(b: FunnelBlock, fallback: number): string {
  const d: any = b.data || {};
  return (d.step_label || d.content || d.placeholder || d.success_message || `Etapa ${fallback}`)
    .toString()
    .slice(0, 28);
}

/**
 * Sidebar esquerda — lista de etapas (1 FunnelBlock = 1 etapa visível).
 * Inspirada no padrão Inlead.
 */
export function StepsSidebar({
  blocks, startBlockId, selectedBlockId,
  onSelect, onAddStep, onDelete, onDuplicate, onSetStart, onReorder,
}: Props) {
  // Ordena pela cadeia next_block_id (a partir do start)
  const ordered = useMemo(() => {
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const visited = new Set<string>();
    const out: FunnelBlock[] = [];
    let cur = startBlockId ? byId.get(startBlockId) : blocks[0];
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      out.push(cur);
      cur = cur.next_block_id ? byId.get(cur.next_block_id) : undefined;
    }
    blocks.forEach((b) => { if (!visited.has(b.id)) out.push(b); });
    return out;
  }, [blocks, startBlockId]);

  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.setData('quiz-step-index', String(idx));
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    if (!Array.from(e.dataTransfer.types).includes('quiz-step-index')) return;
    e.preventDefault();
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };
  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    const src = parseInt(e.dataTransfer.getData('quiz-step-index') || '-1', 10);
    if (src >= 0 && src !== targetIdx) onReorder(src, targetIdx);
  };

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          Etapas
        </p>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onAddStep} title="Nova etapa">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {ordered.map((b, idx) => {
            const isSelected = b.id === selectedBlockId;
            const isStart = b.id === startBlockId;
            return (
              <div
                key={b.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={() => setDragOverIdx((cur) => (cur === idx ? null : cur))}
                onDrop={(e) => handleDrop(e, idx)}
                className={cn(
                  'group flex items-center gap-1.5 pl-1.5 pr-1 py-1.5 rounded-md cursor-pointer transition-colors',
                  isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/60',
                  dragOverIdx === idx && 'ring-2 ring-primary/60 bg-primary/5',
                )}
                onClick={() => onSelect(b.id)}
              >
                <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0 cursor-grab" />
                <span className={cn(
                  'text-[10px] font-mono w-5 text-center shrink-0',
                  isSelected ? 'text-primary font-bold' : 'text-muted-foreground',
                )}>
                  {idx + 1}
                </span>
                <span className={cn(
                  'flex-1 text-xs truncate',
                  isSelected ? 'text-foreground font-medium' : 'text-foreground/80',
                )}>
                  {stepLabel(b, idx + 1)}
                </span>
                {isStart && (
                  <Flag className="h-3 w-3 text-primary shrink-0" />
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button
                      className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded hover:bg-background/70 flex items-center justify-center transition-opacity"
                      aria-label="Ações da etapa"
                    >
                      <span className="text-base leading-none text-muted-foreground">⋯</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSetStart(b.id); }}>
                      <Flag className="h-3.5 w-3.5 mr-2" /> Definir como início
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(b.id); }}>
                      <Copy className="h-3.5 w-3.5 mr-2" /> Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}

          {ordered.length === 0 && (
            <button
              type="button"
              onClick={onAddStep}
              className="w-full mt-2 py-6 text-xs text-muted-foreground border border-dashed border-border rounded-md hover:bg-muted/40"
            >
              <Plus className="h-3.5 w-3.5 mx-auto mb-1" />
              Adicionar primeira etapa
            </button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
