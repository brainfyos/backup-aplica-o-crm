import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  ArrowLeft, Save, Eye, Smartphone, Monitor, Moon, Sun, Inbox,
  PanelLeft, Settings2, Palette,
} from 'lucide-react';
import { useForm, useFormBlocks, useSaveFormBlocks, useUpdateForm } from '@/hooks/useForms';
import { FormBlock, FormBlockType, FormTheme, createFormBlock } from '@/types/forms';
import { toast } from 'sonner';
import { FormBlockPalette } from './FormBlockPalette';
import { FormCanvas } from './FormCanvas';
import { FormBlockEditor } from './FormBlockEditor';
import { FormLivePreview } from './FormLivePreview';
import { FormSettings } from './FormSettings';
import { FormPublish } from './FormPublish';
import { FormResponses } from './FormResponses';
import { FormDesignPanel } from './FormDesignPanel';
import { FormThemeWrapper } from './FormThemeWrapper';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface FormBuilderProps {
  formId: string;
  onClose: () => void;
}

export function FormBuilder({ formId, onClose }: FormBuilderProps) {
  const { data: form, isLoading: isLoadingForm } = useForm(formId);
  const { data: existingBlocks, isLoading: isLoadingBlocks } = useFormBlocks(formId);
  const saveBlocks = useSaveFormBlocks();
  const updateForm = useUpdateForm();
  
  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('build');
  const [hasChanges, setHasChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const isMobile = useIsMobile();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);

  // Auto-open editor sheet on mobile when a block is selected
  useEffect(() => {
    if (isMobile && selectedBlockId) setEditorOpen(true);
  }, [isMobile, selectedBlockId]);
  
  // Initialize blocks from existing data
  useEffect(() => {
    if (existingBlocks && existingBlocks.length > 0 && blocks.length === 0) {
      setBlocks(existingBlocks);
    }
  }, [existingBlocks, blocks.length]);
  
  const selectedBlock = blocks.find(b => b.id === selectedBlockId);
  
  const handleAddBlock = useCallback((type: FormBlockType) => {
    const newBlock = createFormBlock(type, formId, blocks.length);
    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
    setHasChanges(true);
  }, [formId, blocks.length]);
  
  const handleDeleteBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
    setHasChanges(true);
  }, [selectedBlockId]);
  
  const handleUpdateBlocks = useCallback((newBlocks: FormBlock[]) => {
    setBlocks(newBlocks);
    setHasChanges(true);
  }, []);

  const handleUpdateBlock = useCallback((updatedBlock: FormBlock) => {
    setBlocks(prev => prev.map(b => 
      b.id === updatedBlock.id ? updatedBlock : b
    ));
    setHasChanges(true);
  }, []);
  
  const handleUpdateTheme = useCallback((patch: Partial<FormTheme>) => {
    if (!form) return;
    const nextTheme = { ...(form.theme || {}), ...patch } as FormTheme;
    updateForm.mutate({ formId, updates: { theme: nextTheme as any } });
  }, [form, formId, updateForm]);

  const handleSave = async () => {
    try {
      await saveBlocks.mutateAsync({
        formId,
        blocks: blocks.map((b, i) => ({ ...b, order_index: i })),
      });
      setHasChanges(false);
      toast.success('Formulário salvo!');
    } catch (error) {
      toast.error('Erro ao salvar formulário');
    }
  };
  
  const handlePublish = async () => {
    await handleSave();
    await updateForm.mutateAsync({
      formId,
      updates: { status: 'active' },
    });
    toast.success('Formulário publicado!');
  };
  
  if (isLoadingForm || isLoadingBlocks) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  
  if (!form) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Formulário não encontrado</p>
        <Button variant="link" onClick={onClose}>Voltar</Button>
      </div>
    );
  }
  
  return (
    <div className="h-full min-h-0 flex flex-col bg-background rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 md:px-4 py-2 md:py-3 border-b bg-card">
        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm md:text-lg font-bold truncate">{form.name}</h1>
            <p className="text-xs md:text-sm text-muted-foreground truncate hidden md:block">
              {form.products?.name} • {blocks.length} {blocks.length === 1 ? 'bloco' : 'blocos'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate md:hidden">
              {blocks.length} {blocks.length === 1 ? 'bloco' : 'blocos'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
          {hasChanges && (
            <Badge variant="secondary" className="animate-pulse hidden sm:inline-flex">
              Não salvo
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saveBlocks.isPending || !hasChanges}
            className="h-9 px-2 md:px-3"
          >
            <Save className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{saveBlocks.isPending ? 'Salvando...' : 'Salvar'}</span>
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={form.status === 'active' || saveBlocks.isPending}
            className="h-9 px-2 md:px-3"
          >
            <Eye className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{form.status === 'active' ? 'Publicado' : 'Publicar'}</span>
          </Button>
        </div>
      </div>

      {/* Mobile action bar — drawers for palette/editor/design */}
      {isMobile && (activeTab === 'build' || activeTab === 'preview') && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
          {activeTab === 'build' && (
            <>
              <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setPaletteOpen(true)}>
                <PanelLeft className="h-4 w-4 mr-2" /> Blocos
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9"
                onClick={() => setEditorOpen(true)}
                disabled={!selectedBlock}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                {selectedBlock ? 'Editar' : 'Selecione'}
              </Button>
            </>
          )}
          {activeTab === 'preview' && (
            <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setDesignOpen(true)}>
              <Palette className="h-4 w-4 mr-2" /> Personalizar
            </Button>
          )}
        </div>
      )}

      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 md:px-4 border-b bg-card overflow-x-auto">
          <TabsList className="h-12 bg-transparent p-0 gap-4 md:gap-6 w-max">

            <TabsTrigger 
              value="build" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Construir
            </TabsTrigger>
            <TabsTrigger 
              value="preview" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Design
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Configurar
            </TabsTrigger>
            <TabsTrigger 
              value="share" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Publicar
            </TabsTrigger>
            <TabsTrigger 
              value="responses" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0 gap-2"
            >
              <Inbox className="h-4 w-4" />
              Respostas
              {(form.submissions_count || 0) > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {form.submissions_count}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>
        
        {/* Build Tab */}
        <TabsContent value="build" className="flex-1 min-h-0 flex overflow-hidden m-0 data-[state=inactive]:hidden">
          <div className="hidden md:flex">
            <FormBlockPalette
              onDragStart={() => {}}
              onBlockClick={handleAddBlock}
            />
          </div>

          <FormCanvas
            formId={formId}
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            onSelectBlock={setSelectedBlockId}
            onUpdateBlocks={handleUpdateBlocks}
            onAddBlock={handleAddBlock}
            onDeleteBlock={handleDeleteBlock}
            finalBlockId={(form.settings as any)?.final_block_id || null}
          />

          <div className="hidden md:flex">
            <FormBlockEditor
              block={selectedBlock || null}
              allBlocks={blocks}
              form={form}
              onUpdate={handleUpdateBlock}
              onClose={() => setSelectedBlockId(null)}
            />
          </div>

        </TabsContent>

        
        {/* Design Tab — Live preview + visual controls */}
        <TabsContent value="preview" className="flex-1 flex flex-col md:flex-row overflow-hidden m-0 data-[state=inactive]:hidden">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center gap-4 py-3 border-b bg-muted/30">
              {/* Device Toggle */}
              <div className="flex items-center gap-1 bg-card rounded-lg p-1 border">
                <Button
                  variant={previewMode === 'desktop' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewMode('desktop')}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  variant={previewMode === 'mobile' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewMode('mobile')}
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>
              {/* Theme Toggle */}
              <div className="flex items-center gap-1 bg-card rounded-lg p-1 border">
                <Button
                  variant={previewTheme === 'light' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewTheme('light')}
                >
                  <Sun className="h-4 w-4" />
                </Button>
                <Button
                  variant={previewTheme === 'dark' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewTheme('dark')}
                >
                  <Moon className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-muted/50 flex items-start justify-center p-3 md:p-6">
              <div className={cn(
                "bg-card rounded-xl shadow-2xl overflow-hidden transition-all w-full",
                previewMode === 'mobile' ? 'md:w-[375px] max-w-[375px]' : 'max-w-2xl',
                'min-h-[500px]',
                previewTheme === 'dark' && 'dark'
              )}>

                <FormThemeWrapper theme={form.theme}>
                  <FormLivePreview 
                    key={blocks.map(b => b.id).join('-')}
                    form={form} 
                    blocks={blocks} 
                    theme={previewTheme}
                  />
                </FormThemeWrapper>
              </div>
            </div>
          </div>
          <div className="hidden md:flex">
            <FormDesignPanel form={form} onUpdateTheme={handleUpdateTheme} />
          </div>
        </TabsContent>

        
        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden">
          <FormSettings form={form} blocks={blocks} onUpdate={(updates) => {
            updateForm.mutate({ formId, updates });
          }} />
        </TabsContent>
        
        {/* Share Tab */}
        <TabsContent value="share" className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden">
          <FormPublish form={form} />
        </TabsContent>

        {/* Responses Tab */}
        <TabsContent value="responses" className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden">
          <FormResponses formId={formId} />
        </TabsContent>
      </Tabs>

      {/* Mobile Drawers */}
      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="left" className="p-0 w-[88vw] max-w-sm flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Blocos</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FormBlockPalette
              onDragStart={() => {}}
              onBlockClick={(t) => {
                handleAddBlock(t);
                setPaletteOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="p-0 w-[92vw] max-w-md flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Editar bloco</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FormBlockEditor
              block={selectedBlock || null}
              allBlocks={blocks}
              form={form}
              onUpdate={handleUpdateBlock}
              onClose={() => {
                setSelectedBlockId(null);
                setEditorOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={designOpen} onOpenChange={setDesignOpen}>
        <SheetContent side="right" className="p-0 w-[92vw] max-w-md flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Personalizar</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FormDesignPanel form={form} onUpdateTheme={handleUpdateTheme} />
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
