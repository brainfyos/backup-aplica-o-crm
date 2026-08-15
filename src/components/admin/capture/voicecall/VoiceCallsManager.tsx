import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, Search, MoreVertical, FileEdit, Eye, Copy, Trash2,
  Play, Pause, Archive, ExternalLink, Code, PhoneCall,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useVoiceCalls, useCreateVoiceCall, useDeleteVoiceCall,
  useDuplicateVoiceCall, useToggleVoiceCallStatus,
  type VoiceCall, type VoiceCallStatus,
} from '@/hooks/useVoiceCalls';
import { useProducts } from '@/hooks/useProducts';
import { useAllAgents } from '@/hooks/useProductAgents';
import { usePublicAppUrl } from '@/lib/publicUrl';
import { VoiceCallEditor } from './VoiceCallEditor';
import { toast } from 'sonner';

const statusConfig: Record<VoiceCallStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

export function VoiceCallsManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<VoiceCallStatus | 'all'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newProductId, setNewProductId] = useState<string>('');
  const [newAgentId, setNewAgentId] = useState<string>('');

  const { data: calls, isLoading } = useVoiceCalls();
  const { data: products } = useProducts();
  const { data: agents } = useAllAgents();
  const create = useCreateVoiceCall();
  const del = useDeleteVoiceCall();
  const duplicate = useDuplicateVoiceCall();
  const toggle = useToggleVoiceCallStatus();
  const { data: publicAppUrl } = usePublicAppUrl();

  const filtered = (calls ?? []).filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchProduct = productFilter === 'all' || c.product_id === productFilter;
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchProduct && matchStatus;
  });

  const publicUrl = (c: VoiceCall) => `${publicAppUrl}/call/${c.slug}`;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const created = await create.mutateAsync({
      name: newName.trim(),
      product_id: newProductId || null,
      product_agent_id: newAgentId || null,
    });
    setNewName(''); setNewProductId(''); setNewAgentId('');
    setIsCreateOpen(false);
    setEditingId(created.id);
  };

  const conversion = (c: VoiceCall) => {
    const views = c.stats?.views ?? 0;
    const conv = c.stats?.conversions ?? 0;
    if (!views) return '0%';
    return `${((conv / views) * 100).toFixed(1)}%`;
  };

  if (editingId) {
    return <VoiceCallEditor callId={editingId} onClose={() => setEditingId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ligação Web</h1>
          <p className="text-muted-foreground">Capture leads em uma ligação simulada com IA de voz</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Ligação
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ligações..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Produto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {products?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="draft">Rascunhos</SelectItem>
            <SelectItem value="paused">Pausados</SelectItem>
            <SelectItem value="archived">Arquivados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-5 bg-muted rounded w-3/4" /></CardHeader>
              <CardContent><div className="h-20 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <PhoneCall className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhuma ligação encontrada</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crie sua primeira ligação para começar a captar leads por voz
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nova Ligação
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Card key={c.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{c.name}</CardTitle>
                    <CardDescription className="truncate">
                      {c.products?.name || 'Sem produto'} · {c.product_agent?.name || 'Sem agente'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusConfig[c.status].variant}>{statusConfig[c.status].label}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingId(c.id)}>
                          <FileEdit className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(publicUrl(c), '_blank')}>
                          <Eye className="h-4 w-4 mr-2" /> Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate.mutate(c.id)}>
                          <Copy className="h-4 w-4 mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(publicUrl(c)); toast.success('Link copiado'); }}>
                          <ExternalLink className="h-4 w-4 mr-2" /> Copiar Link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          navigator.clipboard.writeText(`<iframe src="${publicUrl(c)}" width="380" height="760" frameborder="0"></iframe>`);
                          toast.success('Embed copiado');
                        }}>
                          <Code className="h-4 w-4 mr-2" /> Copiar Embed
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {c.status === 'active' ? (
                          <DropdownMenuItem onClick={() => toggle.mutate({ id: c.id, status: 'paused' })}>
                            <Pause className="h-4 w-4 mr-2" /> Pausar
                          </DropdownMenuItem>
                        ) : c.status !== 'archived' ? (
                          <DropdownMenuItem onClick={() => toggle.mutate({ id: c.id, status: 'active' })}>
                            <Play className="h-4 w-4 mr-2" /> Ativar
                          </DropdownMenuItem>
                        ) : null}
                        {c.status !== 'archived' && (
                          <DropdownMenuItem onClick={() => toggle.mutate({ id: c.id, status: 'archived' })}>
                            <Archive className="h-4 w-4 mr-2" /> Arquivar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => { if (confirm('Excluir esta ligação?')) del.mutate(c.id); }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center py-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-lg font-semibold">{c.stats?.views ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Visualizações</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{c.stats?.calls ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Atendidas</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{conversion(c)}</p>
                    <p className="text-xs text-muted-foreground">Conversão</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Atualizado {format(new Date(c.updated_at), "d 'de' MMM", { locale: ptBR })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Nova Ligação</DialogTitle>
            <DialogDescription>Uma campanha de ligação com IA para uma oferta ou público específico</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da ligação *</Label>
              <Input
                placeholder="Ex.: Black Friday, Remarketing Aula X..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Produto</Label>
              <Select value={newProductId} onValueChange={setNewProductId}>
                <SelectTrigger><SelectValue placeholder="Selecione um produto (opcional)" /></SelectTrigger>
                <SelectContent>
                  {products?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agente de IA</Label>
              <Select value={newAgentId} onValueChange={setNewAgentId}>
                <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
                <SelectContent>
                  {agents?.filter((a: any) => a.is_active).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{a.product?.name ? ` — ${a.product.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">O agente entra na ligação com toda sua inteligência (persona, tom, sotaque, gírias, can/cannot_do). Você define voz e contexto no editor.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || create.isPending}>
              {create.isPending ? 'Criando...' : 'Criar e editar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
