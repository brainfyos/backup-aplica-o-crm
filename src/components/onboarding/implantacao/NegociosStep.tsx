import { forwardRef, useImperativeHandle, useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Plus, ChevronLeft, Loader2, Info } from 'lucide-react';
import { SettingsTab } from '@/components/admin/products/tabs/SettingsTab';
import { BrainTab } from '@/components/admin/products/tabs/BrainTab';
import { NewBusinessQuickForm } from '@/components/admin/products/NewBusinessQuickForm';

export type NegociosStepHandle = {
  /** Tenta avançar internamente (settings→brain ou brain→lista). Retorna true se avançou. */
  tryInternalNext: () => boolean;
  /** Tenta voltar internamente (brain→settings ou settings→lista). Retorna true se voltou. */
  tryInternalBack: () => boolean;
};

export const NegociosStep = forwardRef<NegociosStepHandle>((_props, ref) => {
  const { data: products, isLoading } = useProducts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'settings' | 'brain'>('settings');
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  useImperativeHandle(ref, () => ({
    tryInternalNext: () => {
      if (selectedId && subTab === 'settings') {
        setSubTab('brain');
        return true;
      }
      if (selectedId && subTab === 'brain') {
        setSelectedId(null);
        setSubTab('settings');
        return true;
      }
      return false;
    },
    tryInternalBack: () => {
      if (selectedId && subTab === 'brain') {
        setSubTab('settings');
        return true;
      }
      if (selectedId && subTab === 'settings') {
        setSelectedId(null);
        return true;
      }
      return false;
    },
  }), [selectedId, subTab]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const selected = products?.find(p => p.id === selectedId);

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedId(null); setSubTab('settings'); }}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar aos negócios
          </Button>
          <div className="text-sm text-muted-foreground">
            Editando: <span className="font-medium text-foreground">{selected.name}</span>
          </div>
        </div>

        <Tabs value={subTab} onValueChange={(v) => setSubTab(v as 'settings' | 'brain')} className="w-full">
          <TabsList>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
            <TabsTrigger value="brain">Cérebro (Treinamento)</TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="mt-4 space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>
                Depois de salvar as configurações, clique em <strong>Próximo</strong> para preencher a aba{' '}
                <strong>Cérebro (Treinamento)</strong> — arquivos, sites, FAQ e vídeos que alimentam a IA deste negócio.
              </span>
            </div>
            <SettingsTab productId={selected.id} />
          </TabsContent>
          <TabsContent value="brain" className="mt-4">
            <BrainTab productId={selected.id} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Seus Negócios</h3>
          <p className="text-sm text-muted-foreground">
            Cadastre pelo menos um negócio. Depois abra para preencher dados e Cérebro (arquivos, sites, FAQ, vídeos).
          </p>
        </div>
        <Button onClick={() => setShowQuickCreate(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Negócio
        </Button>
      </div>

      {(!products || products.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <h4 className="font-medium mb-1">Nenhum negócio ainda</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Crie seu primeiro negócio para começar a implantação.
            </p>
            <Button onClick={() => setShowQuickCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> Criar Negócio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {products.map(p => (
            <Card
              key={p.id}
              className="cursor-pointer hover:border-primary/50 transition"
              onClick={() => { setSelectedId(p.id); setSubTab('settings'); }}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.short_description || p.description || 'Clique para preencher dados e Cérebro'}
                  </div>
                </div>
                <Button variant="outline" size="sm">Abrir</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewBusinessQuickForm
        open={showQuickCreate}
        onOpenChange={setShowQuickCreate}
        onCreated={(id) => { setSelectedId(id); setSubTab('settings'); }}
      />
    </div>
  );
});

NegociosStep.displayName = 'NegociosStep';
