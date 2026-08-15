import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LayoutGrid, Sparkles, Clock, ListChecks, Rocket, Loader2 } from 'lucide-react';
import { QUIZ_TEMPLATES, CATEGORY_LABELS, type QuizTemplate } from '@/data/quizTemplates';
import { useCreateFunnel } from '@/hooks/useFunnels';
import { useProducts } from '@/hooks/useProducts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CATEGORIES = ['todos', ...Object.keys(CATEGORY_LABELS)] as const;

export function CaptureTemplatesSection() {
  const [filter, setFilter] = useState<string>('todos');
  const [selected, setSelected] = useState<QuizTemplate | null>(null);
  const [productId, setProductId] = useState<string>('');
  const [name, setName] = useState('');
  const createFunnel = useCreateFunnel();
  const { data: products } = useProducts();

  const filtered = filter === 'todos'
    ? QUIZ_TEMPLATES
    : QUIZ_TEMPLATES.filter(t => t.category === filter);

  const openTemplate = (t: QuizTemplate) => {
    setSelected(t);
    setName(t.name);
    setProductId(products?.[0]?.id || '');
  };

  const handleClone = async () => {
    if (!selected || !productId) {
      toast.error('Selecione um produto');
      return;
    }
    try {
      await createFunnel.mutateAsync({
        product_id: productId,
        name,
        description: selected.description,
        channel_type: 'quiz',
        flow_blocks: selected.flow_blocks,
        start_block_id: selected.flow_blocks[0]?.id,
      });
      toast.success(`Quiz "${name}" criado a partir do template`);
      setSelected(null);
    } catch (e: any) {
      toast.error('Erro ao clonar template: ' + e.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <LayoutGrid className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Templates de Quiz</h1>
          <p className="text-sm text-muted-foreground">
            Comece em 1 clique. Quizzes prontos com perguntas, scoring, ramificação e resultado já configurados.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(c => (
          <Button
            key={c}
            variant={filter === c ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(c)}
            className="capitalize"
          >
            {c === 'todos' ? 'Todos' : CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS]}
          </Button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(t => (
          <Card
            key={t.id}
            className="overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
            onClick={() => openTemplate(t)}
          >
            <div className={cn(
              'h-32 bg-gradient-to-br flex items-center justify-center text-6xl',
              t.cover_gradient,
            )}>
              {t.icon}
            </div>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge variant="secondary" className="text-[10px] mb-1">
                    {CATEGORY_LABELS[t.category]}
                  </Badge>
                  <h3 className="font-semibold text-base leading-tight">{t.name}</h3>
                </div>
                <Sparkles className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {t.estimated_time}</span>
                <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" /> {t.question_count} perguntas</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <div className={cn(
                  'h-24 -mx-6 -mt-6 mb-2 bg-gradient-to-br flex items-center justify-center text-5xl',
                  selected.cover_gradient,
                )}>
                  {selected.icon}
                </div>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Nome do seu quiz</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Produto vinculado</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(products || []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
                <Button onClick={handleClone} disabled={createFunnel.isPending || !productId} className="gap-2">
                  {createFunnel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  Usar este template
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
