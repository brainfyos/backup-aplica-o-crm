import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Instagram, Globe, FileText, LayoutGrid, Code2, Zap, Megaphone, TrendingUp, Users, DollarSign, Target } from 'lucide-react';
import { DateRangeControl, DateRange, computeRange } from '../filters/DateRangeControl';
import { fmtBRL, fmtInt } from '../lib/format';

type ChannelKey = 'meta' | 'whatsapp' | 'instagram' | 'webchat' | 'form' | 'widget' | 'quiz' | 'api';

const CHANNEL_LABEL: Record<ChannelKey, string> = {
  meta: 'Meta Ads',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  webchat: 'Webchat',
  form: 'Formulários',
  widget: 'Widget',
  quiz: 'Quiz',
  api: 'API',
};

const CHANNEL_ICON: Record<ChannelKey, any> = {
  meta: Megaphone,
  whatsapp: MessageSquare,
  instagram: Instagram,
  webchat: Globe,
  form: FileText,
  widget: Code2,
  quiz: LayoutGrid,
  api: Zap,
};

const iso = (d: Date) => d.toISOString();

/**
 * Painel Marketing → Visão Geral: cross-canal, sem depender de credencial Meta.
 * Puxa contagens agregadas de leads (por source), conversas (por channel),
 * deals fechados e gasto Meta no período. Cada card é clicável para futura
 * navegação, mas por ora só apresenta a métrica.
 */
export function GlobalOverview() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const [range, setRange] = useState<DateRange>(() => computeRange('30d'));
  const [loading, setLoading] = useState(false);
  const [leadsByChannel, setLeadsByChannel] = useState<Record<string, number>>({});
  const [convByChannel, setConvByChannel] = useState<Record<string, number>>({});
  const [totals, setTotals] = useState<{ leads: number; conversas: number; deals: number; revenue: number; spendMeta: number }>({ leads: 0, conversas: 0, deals: 0, revenue: 0, spendMeta: 0 });
  const [topSources, setTopSources] = useState<Array<{ source: string; count: number }>>([]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      const fromISO = iso(range.from);
      const toISO = iso(range.to);
      const fromDate = range.from.toISOString().slice(0, 10);
      const toDate = range.to.toISOString().slice(0, 10);

      // Todos os fetches em paralelo, cada um só com as colunas necessárias.
      const [leadsRes, convRes, salesRes, spendRes] = await Promise.all([
        supabase.from('leads').select('id, source, utm_source', { count: 'exact' })
          .eq('organization_id', orgId)
          .gte('created_at', fromISO).lte('created_at', toISO)
          .limit(5000),
        supabase.from('webchat_conversations').select('id, channel', { count: 'exact' })
          .eq('organization_id', orgId)
          .gte('created_at', fromISO).lte('created_at', toISO)
          .limit(5000),
        (supabase as any).from('commerce_sales').select('id, value, currency, status, paid_at, provider')
          .eq('organization_id', orgId)
          .eq('status', 'confirmed')
          .gte('paid_at', fromISO).lte('paid_at', toISO)
          .limit(5000),
        supabase.from('marketing_insights_daily').select('spend')
          .eq('organization_id', orgId).eq('provider', 'meta')
          .gte('date', fromDate).lte('date', toDate)
          .limit(20000),
      ]);

      const byLeadChannel: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      (leadsRes.data ?? []).forEach((l: any) => {
        const src = (l.source || l.utm_source || 'direto').toLowerCase();
        bySource[src] = (bySource[src] || 0) + 1;
        // heurística: normaliza para chaves conhecidas
        const key = normalizeChannel(src);
        byLeadChannel[key] = (byLeadChannel[key] || 0) + 1;
      });
      setLeadsByChannel(byLeadChannel);
      setTopSources(Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([source, count]) => ({ source, count })));

      const byConvChannel: Record<string, number> = {};
      (convRes.data ?? []).forEach((c: any) => {
        const key = normalizeChannel((c.channel || 'webchat').toLowerCase());
        byConvChannel[key] = (byConvChannel[key] || 0) + 1;
      });
      setConvByChannel(byConvChannel);

      const revenue = (salesRes.data ?? []).reduce((a: number, sale: any) => a + Number(sale.value || 0), 0);
      const spendMeta = (spendRes.data ?? []).reduce((a: number, r: any) => a + Number(r.spend || 0), 0);

      setTotals({
        leads: leadsRes.count ?? (leadsRes.data?.length ?? 0),
        conversas: convRes.count ?? (convRes.data?.length ?? 0),
        deals: salesRes.data?.length ?? 0,
        revenue,
        spendMeta,
      });
      setLoading(false);
    })();
  }, [orgId, range.from.getTime(), range.to.getTime()]);

  const channels: ChannelKey[] = ['meta', 'whatsapp', 'instagram', 'webchat', 'form', 'widget', 'quiz', 'api'];

  const cpl = useMemo(() => (totals.leads > 0 && totals.spendMeta > 0 ? totals.spendMeta / totals.leads : null), [totals]);

  return (
    <div className="space-y-6">
      {/* Barra de período — o único filtro global suportado por enquanto */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <div className="text-sm text-muted-foreground font-medium">Período:</div>
          <DateRangeControl value={range} onChange={setRange} />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardContent>
      </Card>

      {/* KPIs globais no topo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile icon={Users} label="Leads" value={fmtInt(totals.leads)} />
        <KpiTile icon={MessageSquare} label="Conversas" value={fmtInt(totals.conversas)} />
        <KpiTile icon={Target} label="Vendas confirmadas" value={fmtInt(totals.deals)} />
        <KpiTile icon={DollarSign} label="Receita confirmada" value={fmtBRL(totals.revenue)} />
        <KpiTile icon={TrendingUp} label="Investimento Meta" value={fmtBRL(totals.spendMeta)} hint={cpl != null ? `CPL R$ ${cpl.toFixed(2)}` : undefined} />
      </div>

      {/* Grade por canal — leads + conversas */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Leads e conversas por canal</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
          {channels.map((c) => {
            const Icon = CHANNEL_ICON[c];
            return (
              <Card key={c}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Icon className="h-3.5 w-3.5" /> {CHANNEL_LABEL[c]}
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-lg font-semibold">{fmtInt(leadsByChannel[c] ?? 0)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">leads</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{fmtInt(convByChannel[c] ?? 0)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">conversas</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Top origens (leads.source bruto) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top 5 origens de leads</CardTitle>
        </CardHeader>
        <CardContent>
          {topSources.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem leads no período.</div>
          ) : (
            <div className="space-y-2">
              {topSources.map((s) => (
                <div key={s.source} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground truncate">{s.source}</span>
                  <Badge variant="secondary">{fmtInt(s.count)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function normalizeChannel(s: string): string {
  if (!s) return 'direto';
  const v = s.toLowerCase();
  if (v.includes('meta') || v.includes('facebook') || v.includes('fb') || v.includes('instagram_ads')) return 'meta';
  if (v.includes('whats') || v.includes('wa')) return 'whatsapp';
  if (v === 'instagram' || v.includes('ig')) return 'instagram';
  if (v.includes('webchat') || v.includes('site')) return 'webchat';
  if (v.includes('form') || v === 'formulario' || v === 'formulário') return 'form';
  if (v.includes('widget')) return 'widget';
  if (v.includes('quiz')) return 'quiz';
  if (v.includes('api')) return 'api';
  return v;
}
