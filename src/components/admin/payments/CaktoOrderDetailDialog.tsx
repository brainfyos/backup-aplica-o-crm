import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Copy, ExternalLink, Loader2, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { CaktoOrder } from '@/hooks/useCaktoOrders';
import { PaymentMethodBadge } from './PaymentMethodBadge';

interface Props {
  order: CaktoOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canReprocess?: boolean;
  onReprocessed?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  paid: { label: 'Pago', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  refunded: { label: 'Reembolsado', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  pending: { label: 'Pendente', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  waiting_payment: { label: 'Aguardando', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  chargeback: { label: 'Chargeback', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  cancelled: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
};

const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0));

const fmtDate = (d?: string | null) =>
  d ? format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—';

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono' : ''} break-all`}>{value ?? '—'}</div>
    </div>
  );
}

function ProvisioningRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        {detail && <div className="text-xs text-muted-foreground break-all">{detail}</div>}
      </div>
    </div>
  );
}

export function CaktoOrderDetailDialog({ order, open, onOpenChange, canReprocess, onReprocessed }: Props) {
  const [reprocessing, setReprocessing] = useState(false);

  // Estado de provisionamento (organization + profile + role + billing)
  const { data: prov, refetch: refetchProv } = useQuery({
    queryKey: ['cakto-order-provisioning', order?.id],
    enabled: !!order && !!order.customer_email,
    queryFn: async () => {
      const email = order!.customer_email!.toLowerCase();
      const [orgRes, billRes] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name, plan_id, plan_status, plan_activated_at, cakto_subscription_id, platform_plans:platform_plans!organizations_plan_id_fkey(id,name,slug)')
          .eq('cakto_customer_email', email)
          .maybeSingle(),
        supabase
          .from('billing_history')
          .select('id, amount, status, payment_date')
          .filter('metadata->>cakto_id', 'eq', order!.cakto_id)
          .maybeSingle(),
      ]);

      let userId: string | null = null;
      let role: string | null = null;
      const { data: uid } = await supabase.rpc('get_auth_user_id_by_email' as any, { _email: email });
      if (typeof uid === 'string') {
        userId = uid;
        const { data: r } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', uid)
          .eq('role', 'admin')
          .maybeSingle();
        role = r?.role ?? null;
      }

      return {
        org: orgRes.data,
        billing: billRes.data,
        userId,
        role,
      };
    },
  });

  if (!order) return null;
  const status = STATUS_LABELS[order.status] ?? { label: order.status, className: 'bg-muted text-muted-foreground' };
  const raw = order.raw_payload ?? {};

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('cakto-reprocess-order', {
        body: { order_id: order.id },
      });
      if (error) throw error;
      if (!data?.ok) {
        const skipped = data?.result?.skipped;
        const errs = data?.result?.errors?.join(' · ');
        toast.warning(`Reprocesso com avisos${skipped ? `: ${skipped}` : ''}${errs ? ` — ${errs}` : ''}`);
      } else {
        toast.success('Pedido reprocessado');
      }
      await refetchProv();
      onReprocessed?.();
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao reprocessar');
    } finally {
      setReprocessing(false);
    }
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
    toast.success('JSON copiado');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Pedido {order.cakto_ref_id ?? order.cakto_id}
            <Badge variant="outline" className={status.className}>{status.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            {order.customer_name ?? order.customer_email} · {fmtBRL(order.amount)} ·{' '}
            {fmtDate(order.paid_at ?? order.created_at_cakto)}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="cliente" className="mt-2">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="cliente">Cliente</TabsTrigger>
            <TabsTrigger value="pedido">Pedido</TabsTrigger>
            {canReprocess && <TabsTrigger value="provisionamento">Provisionamento</TabsTrigger>}
            <TabsTrigger value="webhook">Webhook</TabsTrigger>
          </TabsList>

          <TabsContent value="cliente" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome" value={order.customer_name} />
              <Field label="E-mail" value={order.customer_email} mono />
              <Field label="Telefone" value={raw?.customer?.phone ?? order.customer_phone} mono />
              <Field label="Documento" value={raw?.customer?.docNumber ? `${(raw.customer.docType ?? '').toUpperCase()} ${raw.customer.docNumber}` : null} mono />
            </div>
            {prov?.org && (
              <>
                <Separator />
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Organização vinculada</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{prov.org.name}</div>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/super-admin?org=${prov.org.id}`} target="_blank" rel="noreferrer">
                        Abrir <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="pedido" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Produto" value={order.product_name} />
              <Field label="Slug da oferta" value={order.cakto_offer_slug ?? raw?.checkoutUrl?.split('/')?.pop()} mono />
              <Field label="Valor" value={fmtBRL(order.amount)} />
              <Field label="Método" value={<PaymentMethodBadge method={order.payment_method} />} />
              <Field label="Criado em" value={fmtDate(order.created_at_cakto)} />
              <Field label="Pago em" value={fmtDate(order.paid_at)} />
              <Field label="Cakto ID" value={order.cakto_id} mono />
              <Field label="Ref ID" value={order.cakto_ref_id} mono />
              <Field label="Subscription" value={raw?.subscription} mono />
              <Field label="Product Cakto ID" value={order.product_cakto_id} mono />
            </div>
          </TabsContent>

          {canReprocess && (
            <TabsContent value="provisionamento" className="space-y-3 pt-4">
              <div className="rounded-md border p-3 space-y-1">
                <ProvisioningRow
                  ok={!!prov?.org}
                  label="Organização criada"
                  detail={prov?.org ? `${prov.org.name} (${prov.org.id})` : 'Não encontrada para este e-mail'}
                />
                <ProvisioningRow
                  ok={!!prov?.org?.plan_id && prov?.org?.plan_status === 'active'}
                  label="Plano ativado"
                  detail={
                    prov?.org?.platform_plans
                      ? `${(prov.org.platform_plans as any).name} · status=${prov.org.plan_status} · ativado em ${fmtDate(prov.org.plan_activated_at)}`
                      : 'Nenhum plano vinculado'
                  }
                />
                <ProvisioningRow
                  ok={!!prov?.userId}
                  label="Usuário admin criado"
                  detail={prov?.userId ?? undefined}
                />
                <ProvisioningRow
                  ok={prov?.role === 'admin'}
                  label="Role admin atribuída"
                />
                <ProvisioningRow
                  ok={!!prov?.billing}
                  label="Cobrança registrada"
                  detail={prov?.billing ? `${fmtBRL(prov.billing.amount)} · ${prov.billing.status}` : undefined}
                />
              </div>
              <Button onClick={handleReprocess} disabled={reprocessing} className="w-full">
                {reprocessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Reprocessar provisionamento
              </Button>
              <p className="text-xs text-muted-foreground">
                Reprocessar é idempotente: não duplica organização, role, cobrança ou e-mail.
              </p>
            </TabsContent>
          )}

          <TabsContent value="webhook" className="space-y-3 pt-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={copyJson}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Copiar JSON
              </Button>
            </div>
            <pre className="text-xs bg-muted/50 border rounded-md p-3 max-h-[480px] overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(raw, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
