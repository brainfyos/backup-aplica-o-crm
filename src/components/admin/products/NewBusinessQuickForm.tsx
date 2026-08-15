import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCreateProduct } from '@/hooks/useProducts';
import { DEFAULT_PIPELINE_STAGES } from '@/hooks/usePipelineMutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (productId: string) => void;
}

/**
 * Diálogo curto para criar um Negócio: apenas Nome + Categoria + Descrição curta.
 * Semeia os estágios padrão do funil e devolve o id para o chamador levar o
 * usuário para o editor completo (SettingsTab + BrainTab).
 */
export function NewBusinessQuickForm({ open, onOpenChange, onCreated }: Props) {
  const { profile } = useAuth();
  const createProduct = useCreateProduct();

  const [form, setForm] = useState({
    name: '',
    category: '',
    short_description: '',
  });
  const [saving, setSaving] = useState(false);

  const reset = () => setForm({ name: '', category: '', short_description: '' });

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Nome do negócio é obrigatório');
      return;
    }
    if (!profile?.organization_id) {
      toast.error('Organização não encontrada');
      return;
    }

    setSaving(true);
    try {
      const product = await createProduct.mutateAsync({
        name: form.name.trim(),
        category: form.category.trim() || null,
        short_description: form.short_description.trim() || null,
        status: 'draft',
        organization_id: profile.organization_id,
      });

      if (product?.id) {
        // Semear estágios padrão do funil (mesmo comportamento do onboarding legado).
        const stages = DEFAULT_PIPELINE_STAGES.map(s => ({ ...s, product_id: product.id }));
        const { error: stagesError } = await supabase.from('pipeline_stages').insert(stages);
        if (stagesError) console.error('[NewBusinessQuickForm] pipeline_stages error', stagesError);

        toast.success('Negócio criado!');
        reset();
        onOpenChange(false);
        onCreated(product.id);
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao criar negócio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Novo Negócio
          </DialogTitle>
          <DialogDescription>
            Comece com o essencial. Depois você complementa dados, cérebro, cadência e mais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-biz-name">Nome do Negócio *</Label>
            <Input
              id="new-biz-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Consultoria Financeira, Curso de Marketing…"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-biz-category">Categoria</Label>
            <Input
              id="new-biz-category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ex: SaaS, Consultoria, Infoproduto…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-biz-short">Descrição curta</Label>
            <Textarea
              id="new-biz-short"
              value={form.short_description}
              onChange={(e) => setForm({ ...form, short_description: e.target.value })}
              placeholder="Uma frase resumindo o que é este negócio"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar Negócio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
