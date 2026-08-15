import { useState, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  GripVertical, Copy, Trash2, Plus, Flag, MoreHorizontal,
  Image as ImageIcon, Video,
  GitBranch, Trophy, TrendingUp, Tag as TagIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FunnelBlock } from '@/types/funnel';

interface Props {
  blocks: FunnelBlock[];
  selectedBlockId: string | null;
  startBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onDuplicateBlock: (id: string) => void;
  onReorder: (sourceIndex: number, targetIndex: number) => void;
  onInsertAt: (index: number) => void;
  onSetStart: (id: string) => void;
  onPaletteDrop: (item: any, index: number) => void;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  condition: GitBranch,
  end: Trophy,
  score: TrendingUp,
  tag: TagIcon,
};

function blockTitle(b: FunnelBlock): string {
  const d: any = b.data || {};
  return (
    d.content ||
    d.label ||
    d.placeholder ||
    d.success_message ||
    d.video_url ||
    d.image_alt ||
    d.link_title ||
    (b.type === 'buttons' ? 'Pergunta de escolha' :
     b.type === 'input' ? 'Pergunta aberta' :
     b.type === 'end' ? 'Final' :
     b.type === 'score' ? 'Adicionar pontuação' :
     b.type === 'tag' ? 'Aplicar etiqueta' :
     b.type === 'condition' ? 'Condição lógica' :
     b.type)
  );
}

function blockKindLabel(b: FunnelBlock): string {
  const sub = (b.data as any)?.quiz_subtype as string | undefined;
  if (sub) {
    const map: Record<string, string> = {
      single: 'Escolha única', multiple: 'Múltipla escolha', yesno: 'Sim/Não',
      scale: 'Escala 1-10', nps: 'NPS', ranking: 'Ranking',
      date: 'Data', upload: 'Upload', audio: 'Áudio',
      result: 'Resultado', redirect: 'Redirecionamento', goto: 'Ir para',
    };
    if (map[sub]) return map[sub];
  }
  if (b.type === 'input') {
    const t = (b.data as any)?.input_type;
    return ({ text: 'Texto curto', textarea: 'Texto longo', email: 'Email', phone: 'Telefone',
      number: 'Número', cpf: 'CPF/CNPJ', name: 'Nome' } as Record<string, string>)[t] || 'Pergunta';
  }
  return ({
    buttons: 'Escolha', message: 'Mensagem', image: 'Imagem', video: 'Vídeo',
    end: 'Final', score: 'Score', tag: 'Tag', condition: 'Condição', link: 'Link',
  } as Record<string, string>)[b.type] || b.type;
}

export function QuizVisualCanvas({
  blocks, selectedBlockId, startBlockId,
  onSelectBlock, onDeleteBlock, onDuplicateBlock, onReorder,
  onInsertAt, onSetStart, onPaletteDrop,
}: Props) {
  // Ordena blocos: start primeiro, depois seguindo next_block_id, depois resto em ordem original
  const ordered = useMemo(() => {
    if (blocks.length === 0) return [];
    const byId = new Map(blocks.map(b => [b.id, b]));
    const visited = new Set<string>();
    const result: FunnelBlock[] = [];
    let cur = startBlockId ? byId.get(startBlockId) : blocks[0];
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id);
      result.push(cur);
      const nextId = cur.next_block_id || (cur.data as any)?.true_next_block_id;
      cur = nextId ? byId.get(nextId) : undefined;
    }
    blocks.forEach(b => { if (!visited.has(b.id)) result.push(b); });
    return result;
  }, [blocks, startBlockId]);

  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dragKind, setDragKind] = useState<'reorder' | 'palette' | null>(null);

  const handleDropZoneDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragKind === 'palette' ? 'copy' : 'move';
    setOverIndex(idx);
  };

  const handleDropZoneDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const palette = e.dataTransfer.getData('quiz-palette-item');
    if (palette) {
      try { onPaletteDrop(JSON.parse(palette), idx); } catch {}
    } else if (dragIndex.current !== null) {
      onReorder(dragIndex.current, idx);
    }
    dragIndex.current = null;
    setOverIndex(null);
    setDragKind(null);
  };

  if (ordered.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center"
        onDragOver={(e) => { e.preventDefault(); setDragKind('palette'); }}
        onDrop={(e) => handleDropZoneDrop(e, 0)}
      >
        <div className="text-center max-w-sm p-8 rounded-2xl border-2 border-dashed border-border bg-card/50">
          <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <Plus className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-semibold mb-1">Comece seu quiz</h3>
          <p className="text-sm text-muted-foreground">
            Arraste um bloco da paleta à esquerda, ou clique em qualquer item para inserir aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-muted/20">
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-1">
        {/* Topo: chip Início */}
        <div className="flex justify-center mb-2">
          <Badge variant="outline" className="rounded-full text-[10px] tracking-wider uppercase bg-card">
            <Flag className="h-3 w-3 mr-1" /> Início
          </Badge>
        </div>

        {ordered.map((block, idx) => {
          const isStart = block.id === startBlockId;
          const isSelected = block.id === selectedBlockId;
          const Icon = TYPE_ICONS[block.type];
          const opts = (block.data as any)?.options as Array<any> | undefined;

          return (
            <div key={block.id}>
              {/* Drop zone acima */}
              <DropZone
                active={overIndex === idx}
                onDragOver={(e) => handleDropZoneDragOver(e, idx)}
                onDragLeave={() => setOverIndex(null)}
                onDrop={(e) => handleDropZoneDrop(e, idx)}
                onClick={() => onInsertAt(idx)}
              />

              {/* Card do bloco */}
              <div
                draggable
                onDragStart={() => { dragIndex.current = idx; setDragKind('reorder'); }}
                onDragEnd={() => { dragIndex.current = null; setOverIndex(null); setDragKind(null); }}
                onClick={() => onSelectBlock(block.id)}
                className={cn(
                  'group relative rounded-xl border bg-card p-4 cursor-pointer transition-all',
                  'hover:shadow-md hover:border-primary/40',
                  isSelected && 'ring-2 ring-primary shadow-md border-primary',
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Drag handle + número */}
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground" />
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                      isStart ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}>
                      {idx + 1}
                    </div>
                  </div>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        {blockKindLabel(block)}
                      </span>
                      {isStart && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">INÍCIO</Badge>
                      )}
                      {(block.data as any)?.variable_name && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono">
                          {`{{${(block.data as any).variable_name}}}`}
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm font-medium text-foreground line-clamp-2 mb-2">
                      {blockTitle(block)}
                    </p>

                    {/* Mídia thumb */}
                    {(block.data as any)?.image_url && (
                      <div className="mb-2 rounded-lg overflow-hidden border bg-muted aspect-[3/1] max-h-24">
                        <img
                          src={(block.data as any).image_url}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}

                    {/* Opções (preview) */}
                    {opts && opts.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {opts.slice(0, 5).map((opt, i) => (
                          <div
                            key={opt.id || i}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-background text-xs"
                          >
                            <span className="w-5 h-5 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {opt.letter || String.fromCharCode(65 + i)}
                            </span>
                            {opt.emoji && <span>{opt.emoji}</span>}
                            <span className="flex-1 truncate text-foreground">{opt.label || `Opção ${i + 1}`}</span>
                            {typeof opt.score === 'number' && opt.score !== 0 && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1">+{opt.score}</Badge>
                            )}
                            {opt.tag && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 border-cyan-400/40 text-cyan-700 dark:text-cyan-300">#{opt.tag}</Badge>
                            )}
                            {opt.next_block_id && (() => {
                              const tIdx = ordered.findIndex(b => b.id === opt.next_block_id);
                              return tIdx >= 0 ? (
                                <Badge variant="default" className="text-[9px] h-4 px-1">→ #{tIdx + 1}</Badge>
                              ) : (
                                <span className="text-[9px] text-muted-foreground">→</span>
                              );
                            })()}
                          </div>
                        ))}
                        {opts.length > 5 && (
                          <p className="text-[10px] text-muted-foreground pl-2">+{opts.length - 5} opções</p>
                        )}
                      </div>
                    )}

                    {/* Condição: 2 caminhos */}
                    {block.type === 'condition' && (() => {
                      const cond = (block.data as any)?.condition;
                      const tId = (block.data as any)?.true_next_block_id;
                      const fId = (block.data as any)?.false_next_block_id;
                      const tIdx = tId ? ordered.findIndex(b => b.id === tId) + 1 : 0;
                      const fIdx = fId ? ordered.findIndex(b => b.id === fId) + 1 : 0;
                      return (
                        <div className="space-y-1 mt-2">
                          {cond?.variable && (
                            <div className="text-[10px] font-mono text-muted-foreground px-2.5 py-1 rounded-md bg-muted">
                              se <span className="text-foreground">{cond.variable}</span>{' '}
                              {({equals:'=',not_equals:'≠',contains:'contém',greater_than:'>',less_than:'<'} as any)[cond.operator] || cond.operator}{' '}
                              <span className="text-foreground">{String(cond.value ?? '')}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border bg-emerald-500/5 border-emerald-500/20 text-xs">
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">Verdadeiro</span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-400/50 text-emerald-700 dark:text-emerald-400">
                              {tIdx ? `→ #${tIdx}` : '→ sequência'}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border bg-rose-500/5 border-rose-500/20 text-xs">
                            <span className="text-rose-700 dark:text-rose-400 font-medium">Falso</span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-rose-400/50 text-rose-700 dark:text-rose-400">
                              {fIdx ? `→ #${fIdx}` : '→ sequência'}
                            </Badge>
                          </div>
                        </div>
                      );
                    })()}
                  </div>


                  {/* Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicateBlock(block.id); }}>
                        <Copy className="h-4 w-4 mr-2" /> Duplicar
                      </DropdownMenuItem>
                      {!isStart && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSetStart(block.id); }}>
                          <Flag className="h-4 w-4 mr-2" /> Definir como início
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDeleteBlock(block.id); }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Linha conectora */}
              {idx < ordered.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="w-px h-4 bg-border" />
                </div>
              )}
            </div>
          );
        })}

        {/* Drop zone final */}
        <DropZone
          active={overIndex === ordered.length}
          onDragOver={(e) => handleDropZoneDragOver(e, ordered.length)}
          onDragLeave={() => setOverIndex(null)}
          onDrop={(e) => handleDropZoneDrop(e, ordered.length)}
          onClick={() => onInsertAt(ordered.length)}
          large
        />
      </div>
    </div>
  );
}

function DropZone({
  active, large, onDragOver, onDragLeave, onDrop, onClick,
}: {
  active: boolean; large?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      className={cn(
        'group flex items-center justify-center cursor-pointer transition-all',
        large ? 'h-16 mt-2' : 'h-6 -my-1',
        active && 'h-12',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border-2 border-dashed transition-all',
          'text-xs text-muted-foreground',
          active
            ? 'border-primary bg-primary/10 px-4 py-2 text-primary'
            : large
              ? 'border-border/60 bg-card px-4 py-2 group-hover:border-primary/60 group-hover:text-primary'
              : 'opacity-0 group-hover:opacity-100 border-primary/40 bg-card px-3 py-1',
        )}
      >
        <Plus className="h-3 w-3" />
        <span>{active ? 'Soltar aqui' : large ? 'Adicionar bloco' : 'Inserir'}</span>
      </div>
    </div>
  );
}
