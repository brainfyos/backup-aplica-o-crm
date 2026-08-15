import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useCreateFunnel } from '@/hooks/useFunnels';
import { useProducts } from '@/hooks/useProducts';
import { generateBlockId, FunnelBlock } from '@/types/funnel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (funnelId: string) => void;
}

export function QuizCreateFromScratch({ open, onOpenChange, onCreated }: Props) {
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const { data: products } = useProducts();
  const createFunnel = useCreateFunnel();

  const handleSubmit = async () => {
    if (!productId || !name.trim()) return;
    const welcome: FunnelBlock = {
      id: generateBlockId(),
      type: 'message' as any,
      position: { x: 0, y: 0 },
      next_block_id: null,
      data: { content: '👋 Bem-vindo ao quiz!' },
    };
    const end: FunnelBlock = {
      id: generateBlockId(),
      type: 'end' as any,
      position: { x: 0, y: 0 },
      next_block_id: null,
      data: { content: 'Obrigado por participar!' },
    };
    welcome.next_block_id = end.id;
    const res = await createFunnel.mutateAsync({
      product_id: productId,
      name: name.trim(),
      description: objective.trim() || undefined,
      channel_type: 'quiz',
      flow_blocks: [welcome, end],
      start_block_id: welcome.id,
    });
    onOpenChange(false);
    setName(''); setObjective(''); setProductId('');
    onCreated(res.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Quiz do Zero</DialogTitle>
          <DialogDescription>Configure o básico e abra o builder visual.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Produto relacionado *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nome do Quiz *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Qual seu perfil ideal?" />
          </div>
          <div className="space-y-2">
            <Label>Objetivo do Quiz</Label>
            <Textarea rows={3} value={objective} onChange={(e) => setObjective(e.target.value)}
              placeholder="Ex: Qualificar leads do evento por nível de maturidade comercial." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!productId || !name.trim() || createFunnel.isPending}>
            {createFunnel.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</> : 'Criar e abrir builder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
