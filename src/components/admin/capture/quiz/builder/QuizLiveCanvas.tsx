import { useMemo, useState } from 'react';
import { Smartphone, Monitor, Trash2, Copy, RotateCcw, ChevronRight, ChevronLeft } from 'lucide-react';
import {
  FunnelBlock, type Funnel,
  getChannelAppearance, defaultChannelAppearance, type QuizChannelOptions,
} from '@/types/funnel';
import { shadowToCss } from '@/lib/funnelAppearance';
import { pickContrast } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { QuizPaletteItem } from '../QuizCategorizedPalette';

interface Props {
  funnel: Funnel;
  blocks: FunnelBlock[];
  selectedBlockId: string | null;
  startBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onDuplicateBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onDropPaletteItem?: (item: QuizPaletteItem) => void;
}

function isColorDark(hex: string): boolean {
  const c = (hex || '').replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.5;
}

/**
 * Canvas central — preview editável ao vivo.
 * Renderiza UMA etapa por vez no padrão inlead, com click-to-select e toolbar flutuante.
 */
export function QuizLiveCanvas({
  funnel, blocks, selectedBlockId, startBlockId,
  onSelectBlock, onDuplicateBlock, onDeleteBlock, onDropPaletteItem,
}: Props) {
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    if (!onDropPaletteItem) return;
    if (!Array.from(e.dataTransfer.types).includes('quiz-palette-item')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false);
    const raw = e.dataTransfer.getData('quiz-palette-item');
    if (!raw || !onDropPaletteItem) return;
    e.preventDefault();
    try {
      const item = JSON.parse(raw) as QuizPaletteItem;
      onDropPaletteItem(item);
    } catch { /* ignore */ }
  };

  const ordered = useMemo(() => {
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const visited = new Set<string>();
    const out: FunnelBlock[] = [];
    let cur = startBlockId ? byId.get(startBlockId) : blocks[0];
    while (cur && !visited.has(cur.id)) {
      visited.add(cur.id); out.push(cur);
      cur = cur.next_block_id ? byId.get(cur.next_block_id) : undefined;
    }
    blocks.forEach((b) => { if (!visited.has(b.id)) out.push(b); });
    return out;
  }, [blocks, startBlockId]);

  const currentBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) || ordered[0],
    [blocks, selectedBlockId, ordered],
  );

  const currentIndex = currentBlock ? ordered.findIndex((b) => b.id === currentBlock.id) : -1;
  const totalSteps = ordered.filter((b) =>
    ['message', 'buttons', 'input', 'end'].includes(b.type as any),
  ).length || 1;
  const stepNumber = currentBlock
    ? ordered.slice(0, currentIndex + 1)
        .filter((b) => ['message', 'buttons', 'input', 'end'].includes(b.type as any))
        .length
    : 1;
  const progressPct = Math.min(100, Math.round((stepNumber / totalSteps) * 100));

  const a = useMemo(
    () => getChannelAppearance(funnel as any, 'quiz') || defaultChannelAppearance('quiz'),
    [funnel],
  );
  const opts = a.channel_options as QuizChannelOptions;

  const isDarkBg = isColorDark(a.background_color);
  const subtleBg = isDarkBg ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)';
  const subtleBorder = isDarkBg ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
  const trackBg = isDarkBg ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';
  const mutedText = isDarkBg ? 'rgba(255,255,255,0.65)' : 'rgba(15,23,42,0.55)';
  const primaryFg = pickContrast(a.primary_color);

  // ───── Toolbar do canvas (flutuante no rodapé) ─────
  const toolbar = (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 z-20">
      <div className="flex gap-0.5 bg-background/95 backdrop-blur border rounded-md p-0.5 shadow-md">
        <button
          type="button"
          onClick={() => setDevice('mobile')}
          className={cn(
            'p-1.5 rounded transition',
            device === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          title="Mobile"
        >
          <Smartphone className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setDevice('desktop')}
          className={cn(
            'p-1.5 rounded transition',
            device === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          title="Desktop"
        >
          <Monitor className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        title="Reiniciar do início"
        onClick={() => {
          if (ordered[0]) onSelectBlock(ordered[0].id);
        }}
        className="p-2 rounded-md bg-background/95 backdrop-blur border text-muted-foreground hover:text-foreground shadow-md"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  // ───── Render do bloco atual ─────
  if (!currentBlock) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 p-6">
        <div className="text-center max-w-[300px]">
          <p className="text-sm text-muted-foreground">
            Adicione a primeira etapa clicando em <span className="font-semibold text-foreground">+ Etapa</span> ou escolhendo um bloco na paleta.
          </p>
        </div>
      </div>
    );
  }

  const showLogo = opts.show_logo !== false && a.logo_url && (currentBlock.data.show_logo !== false);
  const ctaLabel = currentBlock.data.cta_label || 'Continuar';
  const ctaEmoji = currentBlock.data.cta_emoji || '👉';
  const widthPct = currentBlock.data.block_appearance?.width_pct ?? 100;

  const stepContent = (
    <div
      className="w-full min-h-full flex flex-col"
      style={{
        backgroundColor: a.background_color,
        color: a.text_color,
        fontFamily: `${a.font_family}, Inter, system-ui, sans-serif`,
        fontSize: a.font_size_base,
      }}
    >
      <div className={cn(
        'flex-1 w-full flex justify-center px-5 sm:px-6 py-6',
        (opts.vertical_alignment ?? 'center') === 'center' ? 'items-center' : 'items-start',
      )}>
        <div
          className={cn(
            'mx-auto flex flex-col',
            opts.surface === 'card' && 'p-5 sm:p-8 border',
            (opts.content_alignment ?? 'left') === 'center' && 'text-center',
          )}
          style={{
            width: `${Math.max(40, Math.min(100, widthPct))}%`,
            maxWidth: opts.max_width ?? 560,
            background: opts.surface === 'card' ? a.background_color : 'transparent',
            borderColor: opts.surface === 'card' ? subtleBorder : undefined,
            borderRadius: opts.surface === 'card' ? a.border_radius : undefined,
            boxShadow: opts.surface === 'card' ? shadowToCss(a.shadow) : undefined,
          }}
        >
          {(showLogo || (opts.show_back_button !== false && stepNumber > 1)) && (
            <div className="grid grid-cols-[40px_1fr_40px] items-center mb-5">
              <div>
                {opts.show_back_button !== false && stepNumber > 1 && (
                  <div className="h-9 w-9 rounded-full grid place-items-center">
                    <ChevronLeft className="h-5 w-5" />
                  </div>
                )}
              </div>
              {showLogo ? (
                <img
                  src={a.logo_url!}
                  alt=""
                  className="max-h-20 object-contain mx-auto"
                  style={{ width: opts.logo_width ?? 128 }}
                />
              ) : <span />}
              <span />
            </div>
          )}

          {opts.show_progress !== false && (
            <div className="w-full h-1.5 rounded-full overflow-hidden mb-7" style={{ background: trackBg }}>
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%`, background: a.primary_color }}
              />
            </div>
          )}

          {/* TÍTULO + SUBTÍTULO selecionável */}
          {currentBlock.type !== 'end' && (
            <EditableArea
              isSelected={selectedBlockId === currentBlock.id}
              onSelect={() => onSelectBlock(currentBlock.id)}
              onDuplicate={() => onDuplicateBlock(currentBlock.id)}
              onDelete={() => onDeleteBlock(currentBlock.id)}
            >
              {opts.show_counter && (
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: mutedText }}>
                  Pergunta {stepNumber} de {totalSteps}
                </p>
              )}
              <h1
                className="font-bold leading-[1.15] mb-2"
                style={{
                  fontSize: `clamp(${a.font_size_base * 1.6}px, 6vw, ${a.font_size_base * 2.2}px)`,
                  letterSpacing: '-0.02em',
                }}
              >
                {currentBlock.data.content || 'Pergunta'}
              </h1>
              {currentBlock.data.subtitle && (
                <p className="mb-3 leading-snug" style={{ color: mutedText, fontSize: a.font_size_base * 1.05 }}>
                  {currentBlock.data.subtitle}
                </p>
              )}
              {currentBlock.data.show_duration && (
                <p className="mb-5 text-xs font-medium" style={{ color: mutedText }}>
                  ⏳ {currentBlock.data.duration_label || 'Duração de 2min para responder'}
                </p>
              )}
            </EditableArea>
          )}

          {currentBlock.data.image_url && currentBlock.type !== 'end' && (
            <img
              src={currentBlock.data.image_url}
              alt=""
              className="w-full mb-5 object-cover max-h-[240px]"
              style={{ borderRadius: a.border_radius }}
            />
          )}

          {/* OPÇÕES */}
          {currentBlock.type === 'buttons' && (
            <div
              className={cn(
                'mb-2',
                (currentBlock.data.block_appearance?.layout === 'grid-2')
                  ? 'grid grid-cols-2 gap-2.5'
                  : 'space-y-3',
              )}
            >
              {(currentBlock.data.options || []).map((opt) => (
                <div
                  key={opt.id}
                  className="w-full text-left px-4 py-4 sm:py-[18px] flex items-center gap-3 cursor-default"
                  style={{
                    background: subtleBg,
                    color: a.text_color,
                    borderRadius: a.border_radius,
                    border: `1.5px solid ${subtleBorder}`,
                  }}
                >
                  <span
                    className="h-6 w-6 rounded-full flex items-center justify-center shrink-0"
                    style={{ border: `2px solid ${subtleBorder}` }}
                  />
                  {opt.emoji && <span className="text-lg">{opt.emoji}</span>}
                  <span className="text-[15px] sm:text-base font-medium flex-1">{opt.label}</span>
                </div>
              ))}
              {(currentBlock.data.options || []).length === 0 && (
                <div className="text-xs text-center py-6 rounded-lg border border-dashed" style={{ color: mutedText, borderColor: subtleBorder }}>
                  Adicione opções no painel direito →
                </div>
              )}
            </div>
          )}

          {/* INPUT */}
          {currentBlock.type === 'input' && (
            <div className="mb-2">
              <div
                className="w-full px-4 py-4 text-base"
                style={{
                  background: subtleBg,
                  color: mutedText,
                  border: `1.5px solid ${subtleBorder}`,
                  borderRadius: a.border_radius,
                }}
              >
                {currentBlock.data.placeholder || 'Sua resposta...'}
              </div>
            </div>
          )}

          {/* END */}
          {currentBlock.type === 'end' && (
            <EditableArea
              isSelected={selectedBlockId === currentBlock.id}
              onSelect={() => onSelectBlock(currentBlock.id)}
              onDuplicate={() => onDuplicateBlock(currentBlock.id)}
              onDelete={() => onDeleteBlock(currentBlock.id)}
            >
              <div className="text-center py-6">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: a.primary_color }}
                />
                <h2 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.01em' }}>
                  {currentBlock.data.content || 'Obrigado!'}
                </h2>
                {currentBlock.data.success_message && (
                  <p className="text-sm" style={{ color: mutedText }}>{currentBlock.data.success_message}</p>
                )}
              </div>
            </EditableArea>
          )}

          {/* CTA */}
          {currentBlock.type !== 'end' && (
            <EditableArea
              isSelected={selectedBlockId === currentBlock.id}
              onSelect={() => onSelectBlock(currentBlock.id)}
              onDuplicate={() => onDuplicateBlock(currentBlock.id)}
              onDelete={() => onDeleteBlock(currentBlock.id)}
            >
              <div
                className="w-full py-4 mt-5 font-semibold text-base flex items-center justify-center gap-2"
                style={{
                  background: a.primary_color,
                  color: primaryFg,
                  borderRadius: a.border_radius,
                  boxShadow: shadowToCss(a.shadow),
                }}
              >
                <span>{ctaLabel}</span>
                {ctaEmoji ? <span>{ctaEmoji}</span> : <ChevronRight className="h-4 w-4" />}
              </div>
            </EditableArea>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative h-full flex flex-col bg-muted/30">
      <div
        className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 flex flex-col items-center justify-center"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {device === 'mobile' ? (
          <div
            className={cn(
              'relative bg-foreground/90 rounded-[40px] p-1.5 shadow-2xl mx-auto transition-shadow',
              isDragOver && 'ring-4 ring-primary/60 ring-offset-2 ring-offset-muted/30',
            )}
            style={{ width: 'min(390px, 100%)' }}
          >
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 h-5 w-24 bg-foreground/90 rounded-b-2xl z-10" />
            <div
              className="rounded-[34px] overflow-hidden relative"
              style={{ height: 'min(820px, calc(100vh - 170px))', background: a.background_color }}
              onClick={(e) => {
                if (e.target === e.currentTarget) onSelectBlock(null);
              }}
            >
              <div className="h-full overflow-auto">{stepContent}</div>
              {isDragOver && (
                <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-[34px] flex items-center justify-center pointer-events-none">
                  <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow">
                    Soltar para adicionar etapa
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'w-full max-w-[960px] mx-auto rounded-xl border bg-background shadow-lg overflow-hidden relative transition-shadow',
              isDragOver && 'ring-4 ring-primary/60',
            )}
            style={{ height: 'min(820px, calc(100vh - 170px))' }}
          >
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/60 border-b">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <div className="h-[calc(100%-33px)] overflow-auto" onClick={() => onSelectBlock(null)}>
              {stepContent}
            </div>
            {isDragOver && (
              <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
                <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow">
                  Soltar para adicionar etapa
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      {toolbar}
    </div>
  );
}

/** Wrapper de área editável dentro do canvas. */
function EditableArea({
  isSelected, onSelect, onDuplicate, onDelete, children,
}: {
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      className={cn(
        'relative rounded-lg transition-all cursor-pointer p-1 -m-1',
        isSelected
          ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
          : 'hover:ring-1 hover:ring-primary/40 hover:ring-offset-1 hover:ring-offset-background',
      )}
    >
      {isSelected && (
        <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-primary text-primary-foreground rounded-md shadow-lg z-30 overflow-hidden">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="h-7 w-7 flex items-center justify-center hover:bg-black/10"
            title="Duplicar"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="h-7 w-7 flex items-center justify-center hover:bg-black/10"
            title="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
