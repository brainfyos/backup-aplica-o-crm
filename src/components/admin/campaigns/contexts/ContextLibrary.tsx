import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Edit, Trash2, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useContextLibrary, type CampaignContext } from '@/hooks/useCampaignContexts';

export function ContextLibrary({ orgId }: { orgId: string | null }) {
  const { contexts, refresh, loading } = useContextLibrary(orgId);
  const [editing, setEditing] = useState<Partial<CampaignContext> | null>(null);

  const save = async () => {
    if (!orgId || !editing?.name?.trim() || !editing.instructions?.trim()) {
      toast.error('Nome e instruções são obrigatórios');
      return;
    }
    const payload = {
      organization_id: orgId,
      name: editing.name,
      description: editing.description ?? null,
      objective: editing.objective ?? null,
      tone: editing.tone ?? null,
      cta: editing.cta ?? null,
      instructions: editing.instructions,
    };
    const { error } = editing.id
      ? await supabase.from('campaign_contexts').update(payload).eq('id', editing.id)
      : await supabase.from('campaign_contexts').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Contexto salvo');
    setEditing(null);
    refresh();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este contexto?')) return;
    const { error } = await supabase.from('campaign_contexts').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Excluído');
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Briefings estratégicos reutilizáveis. O agente IA recebe o contexto antes de criar a primeira mensagem.
        </p>
        <Button onClick={() => setEditing({})}>
          <Plus className="h-4 w-4 mr-2" />Novo Contexto
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !contexts.length ? (
        <Card>
          <CardContent className="p-10 flex flex-col items-center text-center gap-3">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum contexto na biblioteca ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {contexts.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{c.name}</h3>
                    {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(c)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{c.instructions}</p>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  {c.objective && <span>🎯 {c.objective}</span>}
                  <span className="ml-auto">Usado {c.usage_count}×</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar contexto' : 'Novo contexto'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex: Participou da Live" />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Para qual público este contexto serve" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Objetivo</Label>
                  <Input value={editing.objective ?? ''} onChange={(e) => setEditing({ ...editing, objective: e.target.value })} placeholder="Ex: Descobrir objeção" />
                </div>
                <div>
                  <Label>Tom</Label>
                  <Input value={editing.tone ?? ''} onChange={(e) => setEditing({ ...editing, tone: e.target.value })} placeholder="Ex: Consultivo" />
                </div>
              </div>
              <div>
                <Label>CTA principal</Label>
                <Input value={editing.cta ?? ''} onChange={(e) => setEditing({ ...editing, cta: e.target.value })} placeholder="Ex: Agendar conversa" />
              </div>
              <div>
                <Label>Instruções para o agente *</Label>
                <Textarea
                  rows={6}
                  value={editing.instructions ?? ''}
                  onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                  placeholder="Este lead participou da aula ao vivo do Vendus.&#10;Demonstrou interesse em código-fonte liberado.&#10;Ainda não comprou.&#10;Descubra qual foi sua principal objeção.&#10;Não envie proposta imediatamente."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
