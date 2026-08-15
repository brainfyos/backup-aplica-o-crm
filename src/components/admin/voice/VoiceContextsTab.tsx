import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Plus, Trash2, Edit3, Loader2, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useVoiceContexts, useSaveVoiceContext, useDeleteVoiceContext, type VoiceContext } from '@/hooks/useVoice';

export function VoiceContextsTab() {
  const { data: items = [], isLoading } = useVoiceContexts();
  const del = useDeleteVoiceContext();
  const [editing, setEditing] = useState<Partial<VoiceContext> | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Contextos de Voz</h2>
          <p className="text-sm text-muted-foreground">Scripts, produtos, objeções — anexe ao iniciar uma ligação ou campanha.</p>
        </div>
        <Button onClick={() => setEditing({ tags: [] })}>
          <Plus className="mr-2 h-4 w-4" /> Novo contexto
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <FileText className="mx-auto mb-3 h-8 w-8 opacity-50" />
          <p>Nenhum contexto criado.</p>
          <p className="text-xs mt-1">Contextos ajudam a IA a falar sobre produtos, promoções ou responder objeções.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{c.name}</h3>
                  {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">{c.content}</p>
                  {c.tags?.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {c.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(c)}><Edit3 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm('Remover contexto?') && del.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ContextEditor item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ContextEditor({ item, onClose }: { item: Partial<VoiceContext> | null; onClose: () => void }) {
  const save = useSaveVoiceContext();
  const [form, setForm] = useState<Partial<VoiceContext>>(item || {});
  const [tagsText, setTagsText] = useState((item?.tags || []).join(', '));

  const handleSave = () => {
    if (!form.name?.trim() || !form.content?.trim()) return;
    save.mutate(
      { ...form, tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean) },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" key={item?.id || 'new'}>
        <SheetHeader>
          <SheetTitle>{item?.id ? 'Editar contexto' : 'Novo contexto'}</SheetTitle>
          <SheetDescription>Texto injetado no prompt do agente durante a ligação.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Objeções do Plano Pro" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" />
          </div>
          <div className="space-y-2">
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="promo, plano-pro, objeção" />
          </div>
          <div className="space-y-2">
            <Label>Conteúdo</Label>
            <Textarea
              value={form.content || ''}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={14}
              className="font-mono text-xs"
              placeholder={'Ex:\nPreço do Plano Pro: R$ 297/mês\nGarantia: 7 dias\nSe perguntar sobre desconto: oferecer 10% na anual...'}
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={save.isPending || !form.name?.trim() || !form.content?.trim()}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
