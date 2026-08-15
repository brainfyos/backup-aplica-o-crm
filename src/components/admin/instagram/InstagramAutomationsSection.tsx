import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Instagram, Plus, MessageCircle, MessageSquare, AtSign, Image, Heart, Loader2, Trash2, Play, Pause, Plug, Sparkles, RefreshCcw,
} from 'lucide-react';
import { useInstagramFlows, useCreateInstagramFlow, useDeleteInstagramFlow, useUpdateInstagramFlow, type IGTriggerType, type InstagramFlow } from '@/hooks/useInstagramFlows';
import { useInstagramConnections } from '@/hooks/useInstagramConnections';
import { useReSubscribeInstagram } from '@/hooks/useInstagramFlowAI';
import { InstagramFlowBuilder } from './InstagramFlowBuilder';
import { NewInstagramFlowDialog } from './NewInstagramFlowDialog';
import { AIFlowGeneratorDialog } from './AIFlowGeneratorDialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { firstPublishError, validateInstagramFlowForPublish } from './flowValidation';

const triggerLabels: Record<IGTriggerType, { label: string; icon: any; color: string }> = {
  comment_keyword: { label: 'Comentário → DM', icon: MessageCircle, color: 'text-pink-500' },
  dm_keyword:      { label: 'Palavra-chave no Direct', icon: MessageSquare, color: 'text-purple-500' },
  story_reply:     { label: 'Resposta ao Story', icon: Image, color: 'text-orange-500' },
  message_reaction:{ label: 'Reação a mensagem', icon: Heart, color: 'text-red-500' },
  mention:         { label: 'Menção', icon: AtSign, color: 'text-blue-500' },
  manual:          { label: 'Manual', icon: Play, color: 'text-muted-foreground' },
  new_follower:    { label: 'Novo seguidor', icon: Plus, color: 'text-emerald-500' },
};

export function InstagramAutomationsSection() {
  const navigate = useNavigate();
  const { data: flows, isLoading } = useInstagramFlows();
  const { data: connections } = useInstagramConnections();
  const createFlow = useCreateInstagramFlow();
  const updateFlow = useUpdateInstagramFlow();
  const deleteFlow = useDeleteInstagramFlow();
  const reSubscribe = useReSubscribeInstagram();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InstagramFlow | null>(null);
  const [accountFilter, setAccountFilter] = useState('all');

  const activeConnections = (connections ?? []).filter(c => ['active', 'partial'].includes(c.status));
  const filteredFlows = (flows ?? []).filter((flow) => (
    accountFilter === 'all'
    || (accountFilter === 'unassigned' && !flow.connection_id)
    || flow.connection_id === accountFilter
  ));
  const hasConnection = activeConnections.length > 0;
  const needsResubscribe = activeConnections.filter(c => {
    const fields = ((c as any).subscribed_fields ?? []) as string[];
    return !fields.includes('feed') || !fields.includes('messages');
  });
  const goToConnections = () => navigate('/admin?tab=connections');
  const activateFlow = (flow: InstagramFlow) => {
    const connection = activeConnections.find((item) => item.id === flow.connection_id);
    const issue = firstPublishError(validateInstagramFlowForPublish({
      triggerType: flow.trigger_type,
      connectionId: flow.connection_id,
      connectionStatus: connection?.status,
      blocks: flow.flow_blocks ?? [],
      startBlockId: flow.start_block_id,
    }));
    if (issue) {
      toast.error(issue.message, { duration: 7000 });
      setSelectedFlowId(flow.id);
      return;
    }
    updateFlow.mutate({ id: flow.id, status: 'active' });
  };

  if (selectedFlowId) {
    return <InstagramFlowBuilder flowId={selectedFlowId} onBack={() => setSelectedFlowId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600">
            <Instagram className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Automações do Instagram</h1>
            <p className="text-sm text-muted-foreground">
              Builder visual para DMs, comentários e stories — estilo ManyChat
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeConnections.length > 1 && (
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Filtrar por conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas</SelectItem>
                {activeConnections.map((connection) => (
                  <SelectItem key={connection.id} value={connection.id}>
                    @{connection.ig_username ?? connection.display_name}
                  </SelectItem>
                ))}
                {(flows ?? []).some((flow) => !flow.connection_id) && (
                  <SelectItem value="unassigned">Sem conta definida</SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={() => setAiOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" /> Gerar com IA
          </Button>
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova automação
          </Button>
        </div>
      </div>

      {!hasConnection && (
        <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between gap-4 p-4 flex-wrap">
            <div className="flex items-start gap-3">
              <Plug className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-200">Conecte uma conta do Instagram para ativar</p>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Você pode montar, gerar com IA e testar fluxos sem conexão — mas eles só começam a disparar quando uma conta IG estiver vinculada em Integrações.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={goToConnections} className="gap-2 shrink-0">
              <Plug className="h-4 w-4" /> Ir para Integrações
            </Button>
          </CardContent>
        </Card>
      )}

      {hasConnection && needsResubscribe.length > 0 && (
        <Card className="border-orange-500/40 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="flex items-center justify-between gap-4 p-4 flex-wrap">
            <div className="flex items-start gap-3">
              <RefreshCcw className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <p className="font-medium text-orange-900 dark:text-orange-200">Reassine os campos do webhook</p>
                <p className="text-sm text-orange-800 dark:text-orange-300">
                  Suas conexões IG ainda não recebem todos os eventos de <strong>comentários</strong> e <strong>mensagens</strong>. Reassine agora — se o token não tiver escopos suficientes, você será orientado a reconectar.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {needsResubscribe.map(c => (
                <div key={c.id} className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={reSubscribe.isPending} onClick={() => reSubscribe.mutate(c.id)} className="gap-2">
                    {reSubscribe.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                    Reassinar @{c.ig_username ?? c.display_name}
                  </Button>
                  <Button
                    size="sm"
                    variant={reSubscribe.data && !reSubscribe.data.ok && (reSubscribe.data.missing_scopes?.length ?? 0) > 0 ? 'destructive' : 'ghost'}
                    onClick={goToConnections}
                  >
                    Reconectar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !flows || flows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <Instagram className="h-12 w-12 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Nenhuma automação ainda</p>
              <p className="text-sm text-muted-foreground">Descreva o que você quer e a IA monta o fluxo — ou crie manualmente.</p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button onClick={() => setAiOpen(true)} className="gap-2">
                <Sparkles className="h-4 w-4" /> Gerar com IA
              </Button>
              <Button variant="outline" onClick={() => setNewOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Criar manualmente
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : filteredFlows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">Nenhuma automação para esta conta</p>
            <p className="text-sm text-muted-foreground">Troque o filtro ou crie um novo fluxo já vinculado a ela.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFlows.map(flow => {
            const tt = triggerLabels[flow.trigger_type];
            const conn = activeConnections.find(c => c.id === flow.connection_id);
            const Icon = tt.icon;
            return (
              <Card key={flow.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setSelectedFlowId(flow.id)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Icon className={`h-4 w-4 shrink-0 ${tt.color}`} />
                      <CardTitle className="text-base truncate">{flow.name}</CardTitle>
                    </div>
                    <Badge variant={flow.status === 'active' ? 'default' : flow.status === 'paused' ? 'outline' : 'secondary'}>
                      {flow.status === 'active' ? 'Ativo' : flow.status === 'paused' ? 'Pausado' : 'Rascunho'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Gatilho: <span className="text-foreground">{tt.label}</span></div>
                    {conn ? (
                      <div>Conta: <span className="text-foreground">@{conn.ig_username ?? conn.display_name}</span></div>
                    ) : (
                      <div className="text-amber-600">Conta: não definida — escolha antes de publicar</div>
                    )}
                    <div>Atualizado {formatDistanceToNow(new Date(flow.updated_at), { addSuffix: true, locale: ptBR })}</div>
                  </div>
                  <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    {flow.status === 'active' ? (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => updateFlow.mutate({ id: flow.id, status: 'paused' })}>
                        <Pause className="h-3.5 w-3.5" /> Pausar
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => activateFlow(flow)}>
                        <Play className="h-3.5 w-3.5" /> Ativar
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-destructive gap-1 ml-auto" onClick={() => setDeleteTarget(flow)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewInstagramFlowDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        connections={activeConnections}
        onCreated={(id) => { setNewOpen(false); setSelectedFlowId(id); }}
      />

      <AIFlowGeneratorDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        connections={activeConnections}
        onGenerated={(id) => { setAiOpen(false); setSelectedFlowId(id); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover automação?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" será removida permanentemente junto com seu histórico de execuções.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { deleteFlow.mutate(deleteTarget.id); setDeleteTarget(null); } }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
