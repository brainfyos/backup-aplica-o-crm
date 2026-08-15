import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, Plus, RefreshCw, Pencil, Trash2, ShieldCheck, AlertTriangle, FileText, MoreVertical } from 'lucide-react';
import {
  useMetaWAConnections, useTestMetaWAConnection, useSyncMetaWATemplates, useDeleteMetaWAConnection,
  type MetaWAConnection,
} from '@/hooks/useMetaWhatsApp';
import { MetaWhatsAppWizard } from './MetaWhatsAppWizard';
import { MetaWhatsAppTemplatesPanel } from './MetaWhatsAppTemplatesPanel';
import { ProviderCooldownBadge } from './ProviderCooldownBadge';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function StatusBadge({ c }: { c: MetaWAConnection }) {
  if (c.status === 'active') return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Ativa</Badge>;
  if (c.status === 'error') return <Badge variant="destructive">Erro</Badge>;
  if (c.status === 'revoked') return <Badge variant="outline">Revogada</Badge>;
  if (c.status === 'draft') return <Badge variant="outline" className="border-amber-500/40 text-amber-700">Rascunho</Badge>;
  return <Badge variant="secondary">Pendente</Badge>;
}

interface MetaWhatsAppConnectionsPanelProps {
  hideHeader?: boolean;
  openWizard?: boolean;
  onCloseWizard?: () => void;
}

export function MetaWhatsAppConnectionsPanel({ hideHeader, openWizard, onCloseWizard }: MetaWhatsAppConnectionsPanelProps = {}) {
  const { data: conns = [], isLoading } = useMetaWAConnections();
  const { isSuperAdmin } = useAuth();
  const canResetCooldown = isSuperAdmin();
  const test = useTestMetaWAConnection();
  const sync = useSyncMetaWATemplates();
  const del = useDeleteMetaWAConnection();
  const [wizardInternal, setWizardInternal] = useState(false);
  const wizardOpen = wizardInternal || !!openWizard;
  const closeWizard = () => { setWizardInternal(false); setEditing(null); onCloseWizard?.(); };
  const [editing, setEditing] = useState<MetaWAConnection | null>(null);
  const [toDelete, setToDelete] = useState<MetaWAConnection | null>(null);
  const [templatesFor, setTemplatesFor] = useState<MetaWAConnection | null>(null);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-medium">Conexões oficiais (Meta Cloud API)</h3>
              <p className="text-xs text-muted-foreground">Suas credenciais ficam criptografadas e nunca saem desta empresa.</p>
            </div>
          </div>
          <Button onClick={() => { setEditing(null); setWizardInternal(true); }}>
            <Plus className="h-4 w-4 mr-2" />Nova conexão
          </Button>
        </div>
      )}

      {conns.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma conexão oficial ainda. Clique em "Nova conexão" para configurar.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {conns.map((c) => (
            <Card key={c.id} className="flex h-full flex-col p-4">
              <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.display_name}</span>
                    <StatusBadge c={c} />
                    {c.quality_rating && <Badge variant="outline" className="text-xs">Qualidade: {c.quality_rating}</Badge>}
                    {c.messaging_limit_tier && <Badge variant="outline" className="text-xs">Tier: {c.messaging_limit_tier}</Badge>}
                    <ProviderCooldownBadge
                      provider="meta_whatsapp"
                      connectionId={c.id}
                      cooldownUntil={c.cooldown_until}
                      lastFailureReason={c.last_failure_reason}
                      canReset={canResetCooldown}
                      queryKeyToInvalidate={['meta-wa-connections']}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.phone_number ?? c.phone_number_id} · WABA {c.waba_id}
                    {c.business_account_name && <> · {c.business_account_name}</>}
                  </div>
                  {c.status === 'error' && c.last_error && (
                    <div className="flex items-start gap-1.5 text-xs text-destructive mt-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="break-all">{c.last_error}</span>
                    </div>
                  )}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => test.mutate(c.id)} disabled={test.isPending}>
                    {test.isPending && test.variables === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Testar'}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost"><MoreVertical className="h-4 w-4" /><span className="sr-only">Mais ações</span></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => sync.mutate(c.id)} disabled={sync.isPending}><RefreshCw className="mr-2 h-4 w-4" />Sincronizar templates</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setTemplatesFor(c)}><FileText className="mr-2 h-4 w-4" />Ver templates</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditing(c); setWizardInternal(true); }}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setToDelete(c)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Remover</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <MetaWhatsAppWizard open={wizardOpen} onClose={closeWizard} editing={editing} />

      {templatesFor && (
        <MetaWhatsAppTemplatesPanel
          connection={templatesFor}
          onClose={() => setTemplatesFor(null)}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão Meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove "{toDelete?.display_name}" e todos os templates sincronizados. Mensagens já recebidas continuam preservadas.
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
  );
}
