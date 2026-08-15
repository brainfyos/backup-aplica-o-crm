import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MousePointerClick, CheckCircle2, Loader2, Blocks, Workflow, SlidersHorizontal, Eye, Pencil, Smartphone } from 'lucide-react';
import { Funnel, FunnelBlock, FunnelBlockType, createDefaultBlock } from '@/types/funnel';
import { useSaveFlowBlocks } from '@/hooks/useFunnels';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  QuizCategorizedPalette,
  applyPresetToBlockData,
  type QuizPaletteItem,
} from './QuizCategorizedPalette';
import { QuizVisualCanvas } from './QuizVisualCanvas';
import { QuizBlockInspector } from './QuizBlockInspector';
import { QuizInlinePreview } from './QuizInlinePreview';

interface Props { funnel: Funnel; }

function findBestStartBlock(blocks: FunnelBlock[], currentStartId: string | null): string | null {
  if (currentStartId && blocks.some(b => b.id === currentStartId)) return currentStartId;
  if (blocks.length === 0) return null;
  const targetedIds = new Set(
    blocks.flatMap(b => [
      b.next_block_id,
      b.data.true_next_block_id,
      b.data.false_next_block_id,
      ...(b.data.options?.map(o => o.next_block_id) || []),
      ...(b.data.ai_outputs?.map(o => o.next_block_id) || []),
    ].filter(Boolean))
  );
  const orphans = blocks.filter(b => !targetedIds.has(b.id));
  const pool = orphans.length > 0 ? orphans : blocks;
  return pool[0]?.id || null;
}

/** Reconecta a sequência seguindo `ordered`. */
function relinkSequence(ordered: FunnelBlock[], all: FunnelBlock[]): FunnelBlock[] {
  const orderedIds = new Set(ordered.map(b => b.id));
  const patched = all.map(b => {
    const idx = ordered.findIndex(o => o.id === b.id);
    if (idx === -1) return b; // bloco fora da cadeia principal — preserva
    const next = ordered[idx + 1];
    // Só sobrescreve next_block_id se NÃO há ramificações de opção definidas
    const hasBranching = (b.data.options || []).some(o => o.next_block_id);
    if (hasBranching) return b;
    return { ...b, next_block_id: next?.id || null };
  });
  return patched;
}

export function QuizFlowTab({ funnel }: Props) {
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<'palette' | 'canvas' | 'inspector' | 'preview'>('canvas');
  const [rightPanelMode, setRightPanelMode] = useState<'inspector' | 'preview'>('inspector');
  const [blocks, setBlocks] = useState<FunnelBlock[]>(funnel.flow_blocks || []);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [startBlockId, setStartBlockId] = useState<string | null>(
    () => findBestStartBlock(funnel.flow_blocks || [], funnel.start_block_id || null)
  );
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveFlowBlocks = useSaveFlowBlocks();
  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  // Auto-switch para inspector quando o usuário clica em um bloco
  useEffect(() => {
    if (!selectedBlockId) return;
    setRightPanelMode('inspector');
    if (isMobile) setMobileTab('inspector');
  }, [isMobile, selectedBlockId]);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      let validStart = startBlockId;
      if (!validStart || !blocks.some(b => b.id === validStart)) {
        validStart = findBestStartBlock(blocks, null);
      }
      try {
        await saveFlowBlocks.mutateAsync({ id: funnel.id, flow_blocks: blocks, start_block_id: validStart });
        setIsDirty(false);
        setLastSavedAt(new Date());
      } catch { /* hook trata */ }
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [blocks, startBlockId, isDirty, funnel.id, saveFlowBlocks]);

  /** Cria um novo bloco a partir de um item da paleta visual. */
  const createFromPalette = useCallback((item: QuizPaletteItem): FunnelBlock => {
    const base = createDefaultBlock(item.blockType as FunnelBlockType, { x: 0, y: 0 });
    base.data = applyPresetToBlockData(item.preset, base.data) as any;
    return base;
  }, []);

  /** Insere bloco em uma posição (sequência visual). */
  const insertAt = useCallback((newBlock: FunnelBlock, index: number) => {
    setBlocks(prev => {
      // Pegamos a ordem visual atual
      const byId = new Map(prev.map(b => [b.id, b]));
      const visited = new Set<string>();
      const ordered: FunnelBlock[] = [];
      let cur = startBlockId ? byId.get(startBlockId) : prev[0];
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        ordered.push(cur);
        const n = cur.next_block_id;
        cur = n ? byId.get(n) : undefined;
      }
      prev.forEach(b => { if (!visited.has(b.id)) ordered.push(b); });

      const safeIdx = Math.max(0, Math.min(index, ordered.length));
      const nextOrdered = [...ordered.slice(0, safeIdx), newBlock, ...ordered.slice(safeIdx)];
      return relinkSequence(nextOrdered, [...prev, newBlock]);
    });
    setSelectedBlockId(newBlock.id);
    setIsDirty(true);
    if (blocks.length === 0) setStartBlockId(newBlock.id);
  }, [blocks.length, startBlockId]);

  const handleAddFromPalette = useCallback((item: QuizPaletteItem) => {
    const nb = createFromPalette(item);
    insertAt(nb, blocks.length);
    if (isMobile) setMobileTab('canvas');
  }, [blocks.length, createFromPalette, insertAt, isMobile]);

  const handlePaletteDrop = useCallback((item: QuizPaletteItem, index: number) => {
    const nb = createFromPalette(item);
    insertAt(nb, index);
  }, [createFromPalette, insertAt]);

  const handleInsertAt = useCallback((index: number) => {
    // Inserção rápida via "+": cria uma pergunta de texto curto
    const nb = createFromPalette({ blockType: 'input', preset: 'text', label: 'Texto curto', icon: () => null as any } as any);
    insertAt(nb, index);
  }, [createFromPalette, insertAt]);

  const handleReorder = useCallback((sourceIndex: number, targetIndex: number) => {
    setBlocks(prev => {
      const byId = new Map(prev.map(b => [b.id, b]));
      const visited = new Set<string>();
      const ordered: FunnelBlock[] = [];
      let cur = startBlockId ? byId.get(startBlockId) : prev[0];
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        ordered.push(cur);
        const n = cur.next_block_id;
        cur = n ? byId.get(n) : undefined;
      }
      prev.forEach(b => { if (!visited.has(b.id)) ordered.push(b); });

      const [moved] = ordered.splice(sourceIndex, 1);
      const adjusted = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
      ordered.splice(adjusted, 0, moved);
      return relinkSequence(ordered, prev);
    });
    setIsDirty(true);
  }, [startBlockId]);

  const handleUpdateBlock = useCallback((blockId: string, updates: Partial<FunnelBlock>) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...updates } : b));
    setIsDirty(true);
  }, []);

  const handleDeleteBlock = useCallback((blockId: string) => {
    setBlocks(prev => {
      const deleted = prev.find(b => b.id === blockId);
      return prev.filter(b => b.id !== blockId).map(b =>
        b.next_block_id === blockId ? { ...b, next_block_id: deleted?.next_block_id || null } : b
      );
    });
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    if (startBlockId === blockId) {
      const remaining = blocks.filter(b => b.id !== blockId);
      setStartBlockId(findBestStartBlock(remaining, null));
    }
    setIsDirty(true);
  }, [selectedBlockId, startBlockId, blocks]);

  const handleDuplicateBlock = useCallback((blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const nb = createDefaultBlock(block.type, { x: 0, y: 0 });
    nb.data = { ...block.data };
    setBlocks(prev => [...prev, nb]);
    setSelectedBlockId(nb.id);
    setIsDirty(true);
  }, [blocks]);

  const handleSetStart = useCallback((blockId: string) => {
    setStartBlockId(blockId);
    setIsDirty(true);
  }, []);

  const handleConnectBlocks = useCallback((sourceId: string, targetId: string | null) => {
    setBlocks(prev => prev.map(b => b.id === sourceId ? { ...b, next_block_id: targetId } : b));
    setIsDirty(true);
  }, []);

  const paletteNode = (
    <QuizCategorizedPalette onAddBlock={handleAddFromPalette} />
  );

  const canvasNode = (
    <QuizVisualCanvas
      blocks={blocks}
      selectedBlockId={selectedBlockId}
      startBlockId={startBlockId}
      onSelectBlock={setSelectedBlockId}
      onDeleteBlock={handleDeleteBlock}
      onDuplicateBlock={handleDuplicateBlock}
      onReorder={handleReorder}
      onInsertAt={handleInsertAt}
      onSetStart={handleSetStart}
      onPaletteDrop={handlePaletteDrop}
    />
  );

  const inspectorNode = selectedBlock ? (
    <QuizBlockInspector
      block={selectedBlock}
      blocks={blocks}
      startBlockId={startBlockId}
      onUpdate={(updates) => handleUpdateBlock(selectedBlock.id, updates)}
      onConnect={(targetId) => handleConnectBlocks(selectedBlock.id, targetId)}
    />
  ) : (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center px-4 gap-3">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <MousePointerClick className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        Selecione um bloco no fluxo para editar suas propriedades
      </p>
      <p className="text-xs text-muted-foreground">
        ou clique em <span className="font-medium text-foreground">Ver preview</span> acima
      </p>
    </div>
  );

  const previewNode = (
    <QuizInlinePreview funnel={funnel} refreshKey={lastSavedAt?.getTime() || 0} />
  );

  /** Toggle Editar / Preview do painel direito (desktop). */
  const rightPanelToggle = (
    <div className="flex gap-0.5 bg-muted/60 rounded-md p-0.5">
      <button
        type="button"
        onClick={() => setRightPanelMode('inspector')}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition ${
          rightPanelMode === 'inspector'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Pencil className="h-3 w-3" /> Editar
      </button>
      <button
        type="button"
        onClick={() => setRightPanelMode('preview')}
        className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded transition ${
          rightPanelMode === 'preview'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Eye className="h-3 w-3" /> Ver preview
      </button>
    </div>
  );

  const savedIndicator = (
    <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground h-5">
      {saveFlowBlocks.isPending ? (
        <><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</>
      ) : isDirty ? (
        <span className="text-amber-600 dark:text-amber-400">Auto-save em 1.5s</span>
      ) : lastSavedAt ? (
        <><CheckCircle2 className="h-3 w-3 text-green-600" /> Salvo</>
      ) : null}
    </div>
  );

  if (isMobile) {
    return (
      <div className="h-[calc(100vh-220px)] min-h-[500px] flex flex-col gap-2">
        {savedIndicator}
        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as any)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-4 w-full flex-shrink-0">
            <TabsTrigger value="palette" className="gap-1 text-xs">
              <Blocks className="h-4 w-4" /> Blocos
            </TabsTrigger>
            <TabsTrigger value="canvas" className="gap-1 text-xs">
              <Workflow className="h-4 w-4" /> Fluxo
            </TabsTrigger>
            <TabsTrigger value="inspector" className="gap-1 text-xs">
              <SlidersHorizontal className="h-4 w-4" /> Editar
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1 text-xs">
              <Smartphone className="h-4 w-4" /> Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="palette" className="flex-1 min-h-0 mt-2">
            <Card className="h-full overflow-hidden">{paletteNode}</Card>
          </TabsContent>
          <TabsContent value="canvas" className="flex-1 min-h-0 mt-2">
            <Card className="h-full overflow-hidden">
              <CardContent className="p-0 h-full">{canvasNode}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="inspector" className="flex-1 min-h-0 mt-2">
            <Card className="h-full overflow-hidden">
              <CardContent className="p-4 h-full overflow-auto">{inspectorNode}</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="preview" className="flex-1 min-h-0 mt-2">
            <Card className="h-full overflow-hidden">
              <CardContent className="p-3 h-full">{previewNode}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Desktop: novo Builder estilo Inlead (4 colunas — etapas, paleta, canvas ao vivo, inspector)
  return <QuizBuilderShellDesktop funnel={funnel} />;
}

// Import dinâmico via wrapper para manter compat com mobile tabs acima.
import { QuizBuilderShell as QuizBuilderShellDesktop } from './builder/QuizBuilderShell';
