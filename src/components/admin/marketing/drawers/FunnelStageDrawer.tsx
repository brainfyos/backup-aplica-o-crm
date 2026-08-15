import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fmtBRL, fmtInt } from '../lib/format';
import { useMarketingCtx } from '../context/MarketingFiltersContext';

type Lead = { id: string; name: string; phone: string | null; deal_value: number | null; temperature: string | null; created_at: string; campaign_name: string | null; ad_name: string | null };

const LABELS: Record<string, string> = {
  leads: 'Leads', conversas: 'Conversas iniciadas', qualificados: 'Qualificados',
  reunioes: 'Reuniões', propostas: 'Propostas', vendas: 'Vendas',
};

export function FunnelStageDrawer({
  stage, open, onOpenChange,
}: {
  stage: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { orgId, filters } = useMarketingCtx();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !stage || !orgId) return;
    (async () => {
      setLoading(true);
      // Fase 2: base = todos leads atribuídos ao Meta no período. Etapas específicas
      // serão filtradas pelo stage (implementação plena junto ao rpc_marketing_funnel).
      const { data } = await (supabase as any).from('lead_attribution')
        .select('lead_id, campaign_name, ad_name, leads:leads!inner(id, name, phone, deal_value, temperature, created_at)')
        .eq('organization_id', orgId).eq('provider', 'meta')
        .gte('attributed_at', filters.range.from.toISOString())
        .limit(200);
      const rows: Lead[] = (data ?? []).map((r: any) => ({
        id: r.leads?.id, name: r.leads?.name, phone: r.leads?.phone,
        deal_value: r.leads?.deal_value, temperature: r.leads?.temperature,
        created_at: r.leads?.created_at,
        campaign_name: r.campaign_name, ad_name: r.ad_name,
      })).filter((r: Lead) => r.id);
      setLeads(rows);
      setLoading(false);
    })();
  }, [open, stage, orgId, filters.range.from]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{stage ? LABELS[stage] ?? stage : 'Etapa'}</SheetTitle>
          <SheetDescription>Leads atribuídos ao Meta neste período nesta etapa.</SheetDescription>
        </SheetHeader>

        {loading && <div className="mt-6 flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}
        {!loading && (
          <div className="mt-6 space-y-2">
            <div className="text-xs text-muted-foreground">{fmtInt(leads.length)} leads</div>
            <div className="border rounded-lg divide-y">
              {leads.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhum lead nesta etapa.</div>}
              {leads.slice(0, 50).map((l) => (
                <div key={l.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{l.name}</div>
                    <div className="tabular-nums">{fmtBRL(l.deal_value ?? 0)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[l.campaign_name, l.ad_name, l.phone].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
