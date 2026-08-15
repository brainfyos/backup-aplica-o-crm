import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Search, MoreVertical, Edit, Copy, Archive, Trash2, MessageSquare,
  Users, Loader2, TrendingUp, Clock, Play, Pause,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useFunnels, useCreateFunnel, useDeleteFunnel, useDuplicateFunnel, useUpdateFunnelStatus,
} from '@/hooks/useFunnels';
import { useProducts } from '@/hooks/useProducts';
import { Funnel, FunnelStatus } from '@/types/funnel';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { WhatsAppBuilder } from './WhatsAppBuilder';

const statusConfig: Record<FunnelStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

export function WhatsAppManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [productId, setProductId] = useState('');

  const { data: funnels, isLoading } = useFunnels({ channelType: 'whatsapp' });
  const { data: products } = useProducts();
  const createFunnel = useCreateFunnel();
  const deleteFunnel = useDeleteFunnel();
  const duplicateFunnel = useDuplicateFunnel();
  const updateStatus = useUpdateFunnelStatus();

  const filtered = (funnels || []).filter(f => {
    const ms = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const mst = statusFilter === 'all' || f.status === statusFilter;
    const mp = productFilter === 'all' || f.product_id === productFilter;
    return ms && mst && mp;
  });

  const handleCreate = async () => {
    if (!name.trim() || !productId) return;
    const result = await createFunnel.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      product_id: productId,
      channel_type: 'whatsapp',
    });
    setIsCreateOpen(false);
    setName(''); setDescription(''); setProductId('');
    setSelectedId(result.id);
  };

  const rate = (f: Funnel) => f.total_views === 0 ? '--' : `${((f.total_leads / f.total_views) * 100).toFixed(1)}%`;

  if (selectedId) {
    return <WhatsAppBuilder funnelId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-emerald-600" />
            WhatsApp
          </h1>
          <p className="text-muted-foreground mt-1">
            Fluxos disparados quando o lead envia a primeira mensagem para sua instância Evolution.
          </p>
        </div>
        <Button onClick={() => {
          if (!products?.length) { toast.error('Crie um produto primeiro'); return; }
          setIsCreateOpen(true);
        }} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Fluxo
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar fluxos..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Produto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="archived">Arquivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <MessageSquare className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum fluxo WhatsApp</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              {searchQuery || statusFilter !== 'all' || productFilter !== 'all'
                ? 'Nenhum fluxo corresponde aos filtros.'
                : 'Crie um fluxo automático para qualificar leads e agendar reuniões assim que chegarem pelo WhatsApp.'}
            </p>
            {!searchQuery && statusFilter === 'all' && productFilter === 'all' && (
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Criar primeiro fluxo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map(f => {
            const wa = (f.channels as any)?.whatsapp;
            return (
              <Card key={f.id} className="hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedId(f.id)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-foreground truncate">{f.name}</h3>
                        <Badge variant={statusConfig[f.status].variant}>{statusConfig[f.status].label}</Badge>
                        {wa?.enabled === false && (
                          <Badge variant="outline" className="text-amber-600 border-amber-500">Canal desabilitado</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {f.products?.name || 'Produto não definido'}
                        {wa?.evolution_instance_id ? ' · Instância específica' : ' · Qualquer instância'}
                      </p>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MessageSquare className="h-4 w-4" /><span>{f.total_views} conversas</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="h-4 w-4" /><span>{f.total_leads} leads</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <TrendingUp className="h-4 w-4" /><span>{rate(f)} conversão</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{formatDistanceToNow(new Date(f.updated_at), { addSuffix: true, locale: ptBR })}</span>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedId(f.id); }}>
                          <Edit className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateFunnel.mutate(f.id); }}>
                          <Copy className="h-4 w-4 mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {f.status === 'active' ? (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            updateStatus.mutate({ id: f.id, status: 'paused' });
                          }}>
                            <Pause className="h-4 w-4 mr-2" /> Pausar
                          </DropdownMenuItem>
                        ) : f.status !== 'archived' && (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            updateStatus.mutate({ id: f.id, status: 'active' });
                          }}>
                            <Play className="h-4 w-4 mr-2" /> Ativar
                          </DropdownMenuItem>
                        )}
                        {f.status !== 'archived' && (
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            updateStatus.mutate({ id: f.id, status: 'archived' });
                          }}>
                            <Archive className="h-4 w-4 mr-2" /> Arquivar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDeleteId(f.id); }}
                          className="text-destructive focus:text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo fluxo WhatsApp</DialogTitle>
            <DialogDescription>
              Dispara automaticamente na primeira mensagem do lead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome interno</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Atendimento Pré-Venda" />
            </div>
            <div className="space-y-2">
              <Label>Produto</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || !productId || createFunnel.isPending}>
              {createFunnel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As conversas existentes não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteId) deleteFunnel.mutate(deleteId); setDeleteId(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
