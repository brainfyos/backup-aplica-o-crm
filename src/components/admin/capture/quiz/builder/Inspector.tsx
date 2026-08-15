import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MousePointerClick } from 'lucide-react';
import type { FunnelBlock } from '@/types/funnel';
import { QuizBlockInspector } from '../QuizBlockInspector';
import { AppearanceTab } from './inspector/AppearanceTab';
import { DisplayTab } from './inspector/DisplayTab';
import { StepTab } from './inspector/StepTab';

interface Props {
  block: FunnelBlock | null;
  blocks: FunnelBlock[];
  startBlockId: string | null;
  onUpdate: (blockId: string, updates: Partial<FunnelBlock>) => void;
  onConnect: (sourceId: string, targetId: string | null) => void;
}

/** Container das abas do inspector — 3 abas com bloco, 1 aba sem bloco. */
export function Inspector({ block, blocks, startBlockId, onUpdate, onConnect }: Props) {
  if (!block) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-4 text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <MousePointerClick className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground max-w-[220px]">
          Selecione uma etapa na sidebar ou clique em um elemento do preview para editar.
        </p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="component" className="h-full flex flex-col">
      <TabsList className="w-full grid grid-cols-3 h-9 shrink-0 rounded-none bg-transparent border-b p-0">
        <TabsTrigger
          value="component"
          className="text-xs rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
        >
          Componente
        </TabsTrigger>
        <TabsTrigger
          value="appearance"
          className="text-xs rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
        >
          Aparência
        </TabsTrigger>
        <TabsTrigger
          value="display"
          className="text-xs rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
        >
          Exibição
        </TabsTrigger>
      </TabsList>

      <div className="flex-1 min-h-0 overflow-auto p-3">
        <TabsContent value="component" className="m-0 space-y-4">
          <StepTab block={block} onUpdate={(u) => onUpdate(block.id, u)} />
          <div className="border-t pt-3">
            <QuizBlockInspector
              block={block}
              blocks={blocks}
              startBlockId={startBlockId}
              onUpdate={(u) => onUpdate(block.id, u)}
              onConnect={(t) => onConnect(block.id, t)}
            />
          </div>
        </TabsContent>

        <TabsContent value="appearance" className="m-0">
          <AppearanceTab block={block} onUpdate={(u) => onUpdate(block.id, u)} />
        </TabsContent>

        <TabsContent value="display" className="m-0">
          <DisplayTab block={block} blocks={blocks} onUpdate={(u) => onUpdate(block.id, u)} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
