import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Eye, PhoneCall, CheckCircle2, Clock, DollarSign, Calendar, Link2, MessageSquare, Tag,
  UserPlus, TrendingUp, Users,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { useVoiceCallKpis, useVoiceCallTrend, useVoiceSessions, type Period } from '@/hooks/useVoiceCallAnalytics';
import { useVoiceCalls } from '@/hooks/useVoiceCalls';

const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'mtd', label: 'Mês atual' },
  { value: 'all', label: 'Todo o período' },
];

const PIE_COLORS = ['hsl(var(--primary))', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

export function VoiceDashboardTab() {
  const [period, setPeriod] = useState<Period>('30d');
  const { data: k, isLoading } = useVoiceCallKpis(period);
  const { data: trend = [] } = useVoiceCallTrend(period);
  const { data: sessions = [] } = useVoiceSessions(period);
  const { data: voiceCalls = [] } = useVoiceCalls();

  const conversionRate = k?.calls_started ? Math.round((k.calls_completed / k.calls_started) * 100) : 0;
  const viewToCall = k?.views_unique ? Math.round((k.calls_started / k.views_unique) * 100) : 0;

  const cards = [
    { icon: Eye, label: 'Visualizações únicas', value: k?.views_unique ?? 0, sub: `${k?.views_total ?? 0} totais`, color: 'text-blue-600' },
    { icon: PhoneCall, label: 'Ligações iniciadas', value: k?.calls_started ?? 0, sub: `${viewToCall}% das visitas`, color: 'text-indigo-600' },
    { icon: CheckCircle2, label: 'Concluídas', value: k?.calls_completed ?? 0, sub: `${conversionRate}% de conclusão`, color: 'text-emerald-600' },
    { icon: Clock, label: 'Minutos totais', value: ((k?.total_seconds ?? 0) / 60).toFixed(1), sub: `Média ${Math.round((k?.avg_seconds ?? 0))}s/ligação`, color: 'text-amber-600' },
    { icon: DollarSign, label: 'Custo estimado', value: `$${(k?.cost_usd ?? 0).toFixed(2)}`, sub: 'USD', color: 'text-green-600' },
    { icon: Calendar, label: 'Agendamentos', value: k?.schedules ?? 0, sub: 'via CTA da IA', color: 'text-purple-600' },
    { icon: Link2, label: 'Cliques em link', value: k?.link_clicks ?? 0, color: 'text-cyan-600' },
    { icon: MessageSquare, label: 'CTA WhatsApp', value: k?.whatsapp_clicks ?? 0, color: 'text-green-500' },
    { icon: Tag, label: 'Tags de interesse', value: k?.interest_clicks ?? 0, color: 'text-pink-600' },
    { icon: UserPlus, label: 'Leads capturados', value: k?.leads_captured ?? 0, sub: `${k?.leads_new ?? 0} novos na base`, color: 'text-orange-600' },
  ];

  // Sentimentos (via ai_analysis)
  const sentiments: Record<string, number> = {};
  for (const s of sessions) {
    const st = s.ai_analysis?.sentiment;
    if (st) sentiments[st] = (sentiments[st] || 0) + 1;
  }
  const sentimentData = Object.entries(sentiments).map(([name, value]) => ({ name, value }));

  // Distribuição CTAs
  const ctaData = [
    { name: 'Agendou', value: k?.schedules ?? 0 },
    { name: 'Link', value: k?.link_clicks ?? 0 },
    { name: 'WhatsApp', value: k?.whatsapp_clicks ?? 0 },
    { name: 'Interesse', value: k?.interest_clicks ?? 0 },
  ].filter((x) => x.value > 0);

  // Top ligações por conversão
  const byCall: Record<string, { name: string; sessions: number; schedules: number }> = {};
  for (const s of sessions) {
    byCall[s.voice_call_id] = byCall[s.voice_call_id] || { name: s.voice_call_name, sessions: 0, schedules: 0 };
    byCall[s.voice_call_id].sessions += 1;
    if (s.ctas_clicked.some((c) => c.kind === 'schedule')) byCall[s.voice_call_id].schedules += 1;
  }
  const topCalls = Object.values(byCall)
    .sort((a, b) => (b.schedules / Math.max(b.sessions, 1)) - (a.schedules / Math.max(a.sessions, 1)))
    .slice(0, 5);

  // Funil
  const funnel = [
    { name: 'Visualizações', value: k?.views_unique ?? 0 },
    { name: 'Iniciaram', value: k?.calls_started ?? 0 },
    { name: 'Concluíram', value: k?.calls_completed ?? 0 },
    { name: 'Agendaram', value: k?.schedules ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Visão geral</h2>
          <p className="text-sm text-muted-foreground">
            Ligação web de {voiceCalls.length} campanha{voiceCalls.length === 1 ? '' : 's'}. Dados em tempo real.
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className={`flex items-center gap-2 ${c.color}`}>
              <c.icon className="h-4 w-4" />
              <span className="text-xs uppercase text-muted-foreground truncate">{c.label}</span>
            </div>
            <div className="mt-2 text-2xl font-semibold">{isLoading ? '—' : c.value}</div>
            {c.sub && <div className="text-xs text-muted-foreground mt-0.5">{c.sub}</div>}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 md:col-span-2">
          <h3 className="text-sm font-medium mb-3">Tendência (visualizações vs ligações)</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5) || ''} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="views" name="Visualizações" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="calls" name="Ligações" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="schedules" name="Agendamentos" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Funil</h3>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={funnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">CTAs clicados</h3>
          {ctaData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sem dados no período.</p>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={ctaData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {ctaData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3">Sentimento</h3>
          {sentimentData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sem análise IA ainda.</p>
          ) : (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={sentimentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {sentimentData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Top ligações</h3>
          {topCalls.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sem dados.</p>
          ) : (
            <div className="space-y-2">
              {topCalls.map((c, i) => {
                const rate = c.sessions ? Math.round((c.schedules / c.sessions) * 100) : 0;
                return (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="min-w-0 flex-1 truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                      {c.schedules}/{c.sessions} · <span className="font-medium text-emerald-600">{rate}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
