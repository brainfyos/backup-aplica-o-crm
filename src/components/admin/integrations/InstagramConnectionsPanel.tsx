import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, Plus, Pencil, Trash2, Instagram, AlertTriangle, KeyRound, Stethoscope, ShieldAlert, MoreVertical } from 'lucide-react';
import {
  useInstagramConnections, useTestInstagramConnection, useDeleteInstagramConnection,
  useInstagramInvalidSignatureCounts,
  type InstagramConnection,
} from '@/hooks/useInstagramConnections';
import { InstagramWizard } from './InstagramWizard';
import { UpdateAppSecretDialog } from './UpdateAppSecretDialog';
import { InstagramDiagnosticsDialog } from './InstagramDiagnosticsDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function StatusBadge({ c }: { c: InstagramConnection }) {
  if (c.status === 'active') return <Badge className="bg-pink-500/15 text-pink-700 border-pink-500/30">Ativa</Badge>;
  if (c.status === 'partial') return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">Ativa (parcial)</Badge>;
  if (c.status === 'error') return <Badge variant="destructive">Erro</Badge>;
  if (c.status === 'revoked') return <Badge variant="outline">Revogada</Badge>;
  if (c.status === 'draft') return <Badge variant="secondary">Rascunho</Badge>;
  return <Badge variant="secondary">Pendente</Badge>;
}

interface Props {
  hideHeader?: boolean;
  openWizard?: boolean;
  onCloseWizard?: () => void;
}

export function InstagramConnectionsPanel({ hideHeader, openWizard, onCloseWizard }: Props = {}) {
  const { data: conns = [], isLoading } = useInstagramConnections();
  const { data: invalidCounts = {} } = useInstagramInvalidSignatureCounts();
  const test = useTestInstagramConnection();
  const del = useDeleteInstagramConnection();
  const [internalOpen, setInternalOpen] = useState(false);
  const wizardOpen = internalOpen || !!openWizard;
  const close = () => { setInternalOpen(false); setEditing(null); onCloseWizard?.(); };
  const [editing, setEditing] = useState<InstagramConnection | null>(null);
  const [toDelete, setToDelete] = useState<InstagramConnection | null>(null);
  const [secretFor, setSecretFor] = useState<InstagramConnection | null>(null);
  const [diagFor, setDiagFor] = useState<InstagramConnection | null>(null);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        {!hideHeader && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Instagram className="h-5 w-5 text-pink-500" />
              <div>
                <h3 className="font-medium">Instagram Direct (Meta)</h3>
                <p className="text-xs text-muted-foreground">Receba e responda DMs do Instagram dentro da Inbox.</p>
              </div>
            </div>
            <Button onClick={() => { setEditing(null); setInternalOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />Nova conexão
            </Button>
          </div>
        )}

        {conns.length === 0 ? null : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {conns.map((c) => {
              const invalidCount = invalidCounts[c.id] ?? 0;
              return (
                <Card key={c.id} className="flex h-full flex-col p-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Instagram className="h-4 w-4 text-pink-500" />
                        <span className="font-medium">{c.display_name}</span>
                        <StatusBadge c={c} />
                        {invalidCount > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="destructive" className="gap-1 cursor-help">
                                <ShieldAlert className="h-3 w-3" />
                                Assinatura inválida ({invalidCount})
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              A Meta enviou {invalidCount} evento(s) único(s) nos últimos 10 min com assinatura de outro App.
                              Eles foram ignorados sem afetar a conexão ativa. Revise inscrições antigas no painel da Meta.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.ig_username ? `@${c.ig_username}` : c.ig_business_account_id}
                        {c.fb_page_name && <> · Página: {c.fb_page_name}</>}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] text-muted-foreground">
                          Sem fluxo: caixa de entrada · A IA só responde após um bloco “IA assume”.
                        </span>
                      </div>
                      {c.status === 'error' && c.last_error && (
                        <div className="flex items-start gap-1.5 text-xs text-destructive mt-1">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="break-all">{c.last_error}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => test.mutate(c.id)} disabled={test.isPending}>
                        {test.isPending && test.variables === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Testar'}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="h-4 w-4" /><span className="sr-only">Mais ações</span></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDiagFor(c)}><Stethoscope className="mr-2 h-4 w-4" />Diagnóstico do webhook</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSecretFor(c)} className={invalidCount > 0 ? 'text-destructive' : undefined}><KeyRound className="mr-2 h-4 w-4" />Atualizar App Secret</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setEditing(c); setInternalOpen(true); }}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setToDelete(c)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Remover</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                </Card>
              );
            })}
          </div>
        )}

        <InstagramWizard open={wizardOpen} onClose={close} editing={editing} />
        <UpdateAppSecretDialog connection={secretFor} open={!!secretFor} onOpenChange={(v) => !v && setSecretFor(null)} />
        <InstagramDiagnosticsDialog connection={diagFor} open={!!diagFor} onOpenChange={(v) => !v && setDiagFor(null)} />

        <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover conexão Instagram?</AlertDialogTitle>
              <AlertDialogDescription>
                Remove "{toDelete?.display_name}". Conversas e mensagens já recebidas continuam preservadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => { if (toDelete) del.mutate(toDelete.id); setToDelete(null); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >Remover</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

