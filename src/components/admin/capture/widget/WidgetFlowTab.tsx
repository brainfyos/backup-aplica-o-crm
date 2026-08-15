import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MousePointerClick, CheckCircle2, Loader2 } from 'lucide-react';
import { Funnel, FunnelBlock, FunnelBlockType, createDefaultBlock } from '@/types/funnel';
import { useSaveFlowBlocks } from '@/hooks/useFunnels';
import { FunnelBlockEditor } from '../FunnelBlockEditor';
import { FlowCanvas } from '../FlowCanvas';
import { WidgetBlockPalette } from './WidgetBlockPalette';

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
  const sorted = [...pool].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  return sorted[0]?.id || null;
}

export function WidgetFlowTab({ funnel }: Props) {
  const [blocks, setBlocks] = useState<FunnelBlock[]>(funnel.flow_blocks || []);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [startBlockId, setStartBlockId] = useState<string | null>(
    () => findBestStartBlock(funnel.flow_blocks || [], funnel.start_block_id || null)
  );
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveFlowBlocks = useSaveFlowBlocks();
  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

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
      } catch { /* hook trata toast */ }
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [blocks, startBlockId, isDirty, funnel.id, saveFlowBlocks]);

  const handleAddBlock = useCallback((type: FunnelBlockType, position?: { x: number; y: number }) => {
    const pos = position || { x: 100 + (blocks.length % 3) * 280, y: 100 + Math.floor(blocks.length / 3) * 150 };
    const newBlock = createDefaultBlock(type, pos);
    setBlocks(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        const last = updated[updated.length - 1];
        if (!last.next_block_id) updated[updated.length - 1] = { ...last, next_block_id: newBlock.id };
      }
      return [...updated, newBlock];
    });
    setSelectedBlockId(newBlock.id);
    setIsDirty(true);
    if (blocks.length === 0) setStartBlockId(newBlock.id);
  }, [blocks.length]);

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
    const nb = createDefaultBlock(block.type, { x: block.position.x + 30, y: block.position.y + 30 });
    nb.data = { ...block.data };
    setBlocks(prev => [...prev, nb]);
    setSelectedBlockId(nb.id);
    setIsDirty(true);
  }, [blocks]);

  const handleSetStartBlock = useCallback((blockId: string) => {
    setStartBlockId(blockId);
    setIsDirty(true);
  }, []);

  const handleConnectBlocks = useCallback((sourceId: string, targetId: string | null) => {
    setBlocks(prev => prev.map(b => b.id === sourceId ? { ...b, next_block_id: targetId } : b));
    setIsDirty(true);
  }, []);

  const handleDeleteConnection = useCallback((
    sourceId: string,
    connectionType: 'normal' | 'condition_true' | 'condition_false' | 'option',
    optionIndex?: number,
  ) => {
    setBlocks(prev => prev.map(block => {
      if (block.id !== sourceId) return block;
      switch (connectionType) {
        case 'normal': return { ...block, next_block_id: null };
        case 'condition_true': return { ...block, data: { ...block.data, true_next_block_id: null } };
        case 'condition_false': return { ...block, data: { ...block.data, false_next_block_id: null } };
        case 'option':
          if (block.type === 'buttons' && block.data.options && optionIndex !== undefined) {
            const opts = [...block.data.options];
            opts[optionIndex] = { ...opts[optionIndex], next_block_id: null };
            return { ...block, data: { ...block.data, options: opts } };
          }
          if (block.type === 'ai_decide' && block.data.ai_outputs && optionIndex !== undefined) {
            const outs = [...block.data.ai_outputs];
            outs[optionIndex] = { ...outs[optionIndex], next_block_id: null };
            return { ...block, data: { ...block.data, ai_outputs: outs } };
          }
          return block;
        default: return block;
      }
    }));
    setIsDirty(true);
  }, []);

  const handleAutoDetectStart = useCallback(() => {
    const detected = findBestStartBlock(blocks, null);
    if (detected && detected !== startBlockId) {
      setStartBlockId(detected);
      setIsDirty(true);
      return true;
    }
    return false;
  }, [blocks, startBlockId]);

  const handleSave = async () => {
    let validStart = startBlockId;
    if (!validStart || !blocks.some(b => b.id === validStart)) {
      validStart = findBestStartBlock(blocks, null);
      if (validStart) setStartBlockId(validStart);
    }
    await saveFlowBlocks.mutateAsync({ id: funnel.id, flow_blocks: blocks, start_block_id: validStart });
    setIsDirty(false);
    setLastSavedAt(new Date());
  };

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground h-5">
        {saveFlowBlocks.isPending ? (
          <><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</>
        ) : isDirty ? (
          <span className="text-amber-600 dark:text-amber-400">Alterações pendentes — auto-save em 1.5s</span>
        ) : lastSavedAt ? (
          <><CheckCircle2 className="h-3 w-3 text-green-600" /> Salvo automaticamente</>
        ) : null}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <Card className="w-56 flex-shrink-0 overflow-hidden">
          <WidgetBlockPalette onAddBlock={handleAddBlock} />
        </Card>

        <Card className="flex-1 relative overflow-hidden">
          <CardContent className="p-0 h-full">
            <FlowCanvas
              blocks={blocks}
              selectedBlockId={selectedBlockId}
              startBlockId={startBlockId}
              isDirty={isDirty}
              isSaving={saveFlowBlocks.isPending}
              onSelectBlock={setSelectedBlockId}
              onAddBlock={handleAddBlock}
              onUpdateBlock={handleUpdateBlock}
              onDeleteBlock={handleDeleteBlock}
              onDuplicateBlock={handleDuplicateBlock}
              onSetStartBlock={handleSetStartBlock}
              onDeleteConnection={handleDeleteConnection}
              onSave={handleSave}
              onAutoDetectStart={handleAutoDetectStart}
            />
          </CardContent>
        </Card>

        <Card className="w-72 flex-shrink-0">
          <CardContent className="p-4 h-full">
            {selectedBlock ? (
              <FunnelBlockEditor
                block={selectedBlock}
                blocks={blocks}
                productId={funnel.product_id}
                onUpdate={(updates) => handleUpdateBlock(selectedBlock.id, updates)}
                onConnect={(targetId) => handleConnectBlocks(selectedBlock.id, targetId)}
                chatOnly
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <MousePointerClick className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Selecione um bloco para editar suas propriedades
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
