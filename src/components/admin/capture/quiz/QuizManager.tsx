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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Search, MoreVertical, Edit, Copy, Archive, Trash2, ListChecks,
  Eye, Users, Loader2, TrendingUp, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useFunnels, useDeleteFunnel, useDuplicateFunnel, useUpdateFunnelStatus,
} from '@/hooks/useFunnels';
import { useProducts } from '@/hooks/useProducts';
import { Funnel, FunnelStatus } from '@/types/funnel';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { QuizBuilder } from './QuizBuilder';
import { QuizCreationLauncher } from './create/QuizCreationLauncher';
import { QuizCreateFromScratch } from './create/QuizCreateFromScratch';
import { QuizCreateWithAI } from './create/QuizCreateWithAI';
import { QuizTemplateLibrary } from './create/QuizTemplateLibrary';


const statusConfig: Record<FunnelStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

export function QuizManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: funnels, isLoading } = useFunnels({ channelType: 'quiz' });
  const { data: products } = useProducts();
  const deleteFunnel = useDeleteFunnel();
  const duplicateFunnel = useDuplicateFunnel();
  const updateStatus = useUpdateFunnelStatus();

  const filtered = (funnels || []).filter(f => {
    const ms = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const mst = statusFilter === 'all' || f.status === statusFilter;
    const mp = productFilter === 'all' || f.product_id === productFilter;
    return ms && mst && mp;
  });

  const openLauncher = () => {
    if (!products?.length) { toast.error('Crie um produto primeiro'); return; }
    setLauncherOpen(true);
  };

  const formatViews = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  const rate = (f: Funnel) => f.total_views === 0 ? '--' : `${((f.total_leads / f.total_views) * 100).toFixed(1)}%`;

  if (selectedId) {
    return <QuizBuilder funnelId={selectedId} onBack={() => setSelectedId(null)} />;
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary" />
            Quiz
          </h1>
          <p className="text-muted-foreground mt-1">
            Quizzes públicos com pontuação, segmentação e resultado personalizado.
          </p>
        </div>
        <Button onClick={openLauncher} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Quiz
        </Button>

      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar quizzes..." value={searchQuery}
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

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <ListChecks className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum Quiz encontrado</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              {searchQuery || statusFilter !== 'all' || productFilter !== 'all'
                ? 'Nenhum quiz corresponde aos filtros.'
                : 'Crie seu primeiro quiz para segmentar e qualificar leads com perguntas pontuadas.'}
            </p>
            {!searchQuery && statusFilter === 'all' && productFilter === 'all' && (
              <Button onClick={openLauncher} className="gap-2">
                <Plus className="h-4 w-4" /> Criar primeiro Quiz
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map(f => (
            <Card key={f.id} className="hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => setSelectedId(f.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-foreground truncate">{f.name}</h3>
                      <Badge variant={statusConfig[f.status].variant}>{statusConfig[f.status].label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {f.products?.name || 'Produto não definido'}
                    </p>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Eye className="h-4 w-4" /><span>{formatViews(f.total_views)} sessões</span>
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
                      {f.status !== 'archived' && (
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          updateStatus.mutate({ id: f.id, status: 'archived' });
                        }}>
                          <Archive className="h-4 w-4 mr-2" /> Arquivar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteId(f.id); }}>
                        <Trash2 className="h-4 w-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Creation Flow */}
      <QuizCreationLauncher
        open={launcherOpen}
        onOpenChange={setLauncherOpen}
        onPick={(mode) => {
          setLauncherOpen(false);
          if (mode === 'scratch') setScratchOpen(true);
          if (mode === 'ai') setAiOpen(true);
          if (mode === 'template') setTemplateOpen(true);
        }}
      />
      <QuizCreateFromScratch
        open={scratchOpen}
        onOpenChange={setScratchOpen}
        onCreated={(id) => setSelectedId(id)}
      />
      <QuizCreateWithAI
        open={aiOpen}
        onOpenChange={setAiOpen}
        onCreated={(id) => setSelectedId(id)}
      />
      <QuizTemplateLibrary
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onCreated={(id) => setSelectedId(id)}
      />



      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados do quiz serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteFunnel.mutate(deleteId); setDeleteId(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
