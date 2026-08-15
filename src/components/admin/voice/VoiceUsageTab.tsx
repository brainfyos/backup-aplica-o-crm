import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download, DollarSign, Clock, Phone, Info } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import {
  useVoiceUsageByMonth, useVoiceUsageByDim, useVoiceCallKpis, type Period,
} from '@/hooks/useVoiceCallAnalytics';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'mtd', label: 'Mês atual' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: 'all', label: 'Todo o período' },
];

export function VoiceUsageTab() {
  const [period, setPeriod] = useState<Period>('mtd');

  const { data: kpis } = useVoiceCallKpis(period);
  const { data: byMonth = [] } = useVoiceUsageByMonth();
  const { data: byCall = [] } = useVoiceUsageByDim('voice_call', period);
  const { data: byAgent = [] } = useVoiceUsageByDim('agent', period);
  const { data: byProvider = [] } = useVoiceUsageByDim('provider', period);

  const totalCost = kpis?.cost_usd || 0;
  const totalCalls = kpis?.calls_started || 0;
  const totalMin = (kpis?.total_seconds || 0) / 60;

  const avgCost = totalCalls ? totalCost / totalCalls : 0;
  const costPerLead = kpis?.leads_captured ? totalCost / kpis.leads_captured : 0;
  const costPerSched = kpis?.schedules ? totalCost / kpis.schedules : 0;

  const trendMonths = [...byMonth].slice(0, 12).reverse();

  const exportCSV = () => {
    const header = ['mes', 'ligacoes', 'minutos', 'audio_sec_in', 'audio_sec_out', 'tokens_in', 'tokens_out', 'custo_grok_usd', 'custo_openai_usd', 'custo_total_usd'];
    const rows = byMonth.map((m) => [m.month, m.calls, m.minutes, m.audio_sec_in, m.audio_sec_out, m.tokens_in, m.tokens_out, m.cost_grok, m.cost_openai, m.cost_total]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consumo-voz-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Consumo</h2>
          <p className="text-sm text-muted-foreground">
            Custo estimado por sessão de ligação web, calculado com tarifas configuráveis por provider.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV}><Download className="h-3 w-3 mr-1" /> CSV</Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={Clock} label="Minutos" value={totalMin.toFixed(1)} />
        <KpiCard icon={Phone} label="Ligações" value={String(totalCalls)} />
        <KpiCard icon={DollarSign} label="Custo total" value={`$${totalCost.toFixed(2)}`} />
        <KpiCard icon={DollarSign} label="Custo médio/chamada" value={`$${avgCost.toFixed(4)}`} />
        <KpiCard icon={DollarSign} label="Custo por lead" value={costPerLead ? `$${costPerLead.toFixed(3)}` : '—'} />
        <KpiCard icon={DollarSign} label="Custo por agendamento" value={costPerSched ? `$${costPerSched.toFixed(3)}` : '—'} />
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-3">Custo por mês (últimos 12) — Grok vs OpenAI</h3>
        {trendMonths.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Sem dados ainda.</p>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={trendMonths}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: any) => `$${Number(v).toFixed(4)}`} />
                <Legend />
                <Bar dataKey="cost_grok" name="Grok" stackId="c" fill="#8b5cf6" />
                <Bar dataKey="cost_openai" name="OpenAI" stackId="c" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <UsageTable title="Por ligação" rows={byCall} showBreakdown />
        <UsageTable title="Por agente" rows={byAgent} showBreakdown />
      </div>

      <UsageTable title="Por provider · modelo" rows={byProvider} showBreakdown />

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-2">Detalhamento mensal</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2">Mês</th>
                <th className="text-right">Ligações</th>
                <th className="text-right">Minutos</th>
                <th className="text-right">Áudio in (s)</th>
                <th className="text-right">Áudio out (s)</th>
                <th className="text-right">Tokens in</th>
                <th className="text-right">Tokens out</th>
                <th className="text-right">Grok</th>
                <th className="text-right">OpenAI</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.length === 0 ? (
                <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">Sem dados.</td></tr>
              ) : byMonth.map((m) => (
                <tr key={m.month} className="border-t">
                  <td className="py-2 font-medium">{m.month}</td>
                  <td className="text-right">{m.calls}</td>
                  <td className="text-right">{m.minutes.toFixed(1)}</td>
                  <td className="text-right">{m.audio_sec_in.toFixed(0)}</td>
                  <td className="text-right">{m.audio_sec_out.toFixed(0)}</td>
                  <td className="text-right">{m.tokens_in.toLocaleString('pt-BR')}</td>
                  <td className="text-right">{m.tokens_out.toLocaleString('pt-BR')}</td>
                  <td className="text-right text-purple-600">${m.cost_grok.toFixed(4)}</td>
                  <td className="text-right text-emerald-600">${m.cost_openai.toFixed(4)}</td>
                  <td className="text-right font-semibold">${m.cost_total.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          Custos estimados usando a tarifa vigente da tabela <b>voice_pricing</b> (editável pelo Super Admin em Tarifas de Voz).
          Cada sessão guarda um <i>pricing_snapshot</i> com a tarifa usada, portanto valores históricos não mudam quando você atualiza a tabela.
          Sessões anteriores à instrumentação mostram o custo aproximado por duração × tarifa padrão.
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" /><span className="text-xs uppercase">{label}</span></div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </Card>
  );
}

function UsageTable({ title, rows, showBreakdown }: { title: string; rows: any[]; showBreakdown?: boolean }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left py-2">Nome</th>
              <th className="text-right">Ligações</th>
              <th className="text-right">Minutos</th>
              {showBreakdown && <th className="text-right">Grok</th>}
              {showBreakdown && <th className="text-right">OpenAI</th>}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sem dados.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="py-2 max-w-[180px] truncate">{r.label}</td>
                <td className="text-right">{r.calls}</td>
                <td className="text-right">{r.minutes.toFixed(1)}</td>
                {showBreakdown && <td className="text-right text-purple-600">${r.cost_grok.toFixed(4)}</td>}
                {showBreakdown && <td className="text-right text-emerald-600">${r.cost_openai.toFixed(4)}</td>}
                <td className="text-right font-semibold">${r.cost_total.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
