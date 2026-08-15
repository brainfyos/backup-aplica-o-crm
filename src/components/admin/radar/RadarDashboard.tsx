import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useOpportunityScan, useScanItems } from '@/hooks/useOpportunityScan';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { Loader2, Copy, Check, TrendingUp, Flame, Snowflake, Skull, CloudSun, FileText, ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RadarLeadActions } from './RadarLeadActions';
import { RadarLeadDetailSheet } from './RadarLeadDetailSheet';
import type { ScanItem } from '@/hooks/useOpportunityScan';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = {
  hot: '#ef4444',
  warm: '#f97316',
  cold: '#3b82f6',
  lost: '#71717a',
};

const ICONS = {
  hot: Flame,
  warm: CloudSun,
  cold: Snowflake,
  lost: Skull,
};

const LABELS = {
  hot: 'HOT',
  warm: 'WARM',
  cold: 'COLD',
  lost: 'LOST',
};

export function RadarDashboard({
  scanId,
  onOpenConversation,
  isHistorical,
  onBackToLatest,
}: {
  scanId: string;
  onOpenConversation?: (conversationId: string) => void;
  isHistorical?: boolean;
  onBackToLatest?: () => void;
}) {
  const { data: scan } = useOpportunityScan(scanId);
  const { data: items } = useScanItems(scanId);
  const [filter, setFilter] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<ScanItem | null>(null);

  const filteredItems = useMemo(() => {
    const list = (items || []).filter((i) => !filter || i.classification === filter);
    // Priorizar HOT > WARM > COLD > LOST e dentro disso por score desc
    const order = { hot: 0, warm: 1, cold: 2, lost: 3 } as const;
    return [...list].sort((a, b) => {
      const ra = order[a.classification as keyof typeof order] ?? 99;
      const rb = order[b.classification as keyof typeof order] ?? 99;
      if (ra !== rb) return ra - rb;
      return (b.score || 0) - (a.score || 0);
    });
  }, [items, filter]);

  const pieData = useMemo(() => {
    if (!scan) return [];
    return [
      { name: 'HOT', value: scan.hot_count, key: 'hot' },
      { name: 'WARM', value: scan.warm_count, key: 'warm' },
      { name: 'COLD', value: scan.cold_count, key: 'cold' },
      { name: 'LOST', value: scan.lost_count, key: 'lost' },
    ].filter((d) => d.value > 0);
  }, [scan]);

  const scoreDistribution = useMemo(() => {
    if (!items) return [];
    const buckets = [0, 20, 40, 60, 80, 100];
    return buckets.slice(0, -1).map((min, i) => ({
      range: `${min}-${buckets[i + 1]}`,
      count: items.filter((it) => it.score >= min && it.score < buckets[i + 1]).length,
    }));
  }, [items]);

  if (!scan) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  const isRunning = scan.status === 'running' || scan.status === 'pending';
  const progress = scan.total_candidates ? (scan.total_analyzed / scan.total_candidates) * 100 : 0;

  function copyMessage(id: string, msg: string) {
    navigator.clipboard.writeText(msg);
    setCopiedId(id);
    toast.success('Mensagem copiada');
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="space-y-4">
      {isHistorical && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">Visualizando análise de </span>
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(scan.created_at), { addSuffix: true, locale: ptBR })}
              </span>
            </div>
            {onBackToLatest && (
              <Button size="sm" variant="ghost" className="gap-1" onClick={onBackToLatest}>
                <ArrowLeft className="h-3 w-3" /> Voltar à atual
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isRunning && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Analisando conversas com IA...
              </span>
              <span className="text-muted-foreground">
                {scan.total_analyzed} / {scan.total_candidates}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['hot', 'warm', 'cold', 'lost'] as const).map((k) => {
          const Icon = ICONS[k];
          const count = scan[`${k}_count` as keyof typeof scan] as number;
          const isActive = filter === k;
          return (
            <Card
              key={k}
              className={`cursor-pointer transition-all ${isActive ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setFilter(isActive ? null : k)}
            >
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5" style={{ color: COLORS[k] }} />
                  <span className="text-2xl font-bold">{count}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{LABELS[k]}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Distribuição</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={COLORS[entry.key as keyof typeof COLORS]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Distribuição de score</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="range" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="py-4 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Receita potencial:</span>
            <span className="font-bold text-lg">
              R$ {Number(scan.potential_revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {scan.total_analyzed} análises
          </div>
        </CardContent>
      </Card>

      {/* Lista de leads */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {filter ? `Leads ${LABELS[filter as keyof typeof LABELS]}` : 'Todos os leads classificados'}
            </CardTitle>
            {filter && (
              <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>Ver todos</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
          {filteredItems.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {isRunning ? 'Aguardando resultados...' : 'Nenhum lead nesta categoria'}
            </div>
          )}
          {filteredItems.map((item) => {
            const Icon = ICONS[item.classification];
            return (
              <div
                key={item.id}
                className="border rounded-lg p-3 space-y-2 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" style={{ color: COLORS[item.classification] }} />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.lead_snapshot?.name || 'Sem nome'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.lead_snapshot?.phone || item.lead_snapshot?.email || '—'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" style={{ borderColor: COLORS[item.classification], color: COLORS[item.classification] }}>
                      Score {item.score}
                    </Badge>
                    {item.action_applied && <Badge variant="secondary" className="text-xs">✓ Ação</Badge>}
                  </div>
                </div>

                {item.reason && (
                  <p className="text-sm text-muted-foreground">{item.reason}</p>
                )}

                {item.signals?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.signals.map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                    ))}
                  </div>
                )}

                {item.suggested_action && (
                  <div className="text-xs">
                    <span className="font-medium">💡 Sugestão: </span>
                    <span className="text-muted-foreground">{item.suggested_action}</span>
                  </div>
                )}

                {item.followup_message && (
                  <div className="bg-muted/50 rounded p-2 text-xs flex items-start justify-between gap-2">
                    <div className="flex-1 italic">"{item.followup_message}"</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0"
                      onClick={() => copyMessage(item.id, item.followup_message!)}
                    >
                      {copiedId === item.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setDetailItem(item)}
                  >
                    <FileText className="h-3.5 w-3.5" /> Ver detalhes
                  </Button>
                  <div className="flex-1 min-w-[200px]">
                    <RadarLeadActions item={item} onOpenConversation={onOpenConversation} />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <RadarLeadDetailSheet
        item={detailItem}
        open={!!detailItem}
        onOpenChange={(v) => !v && setDetailItem(null)}
        onOpenConversation={onOpenConversation}
      />
    </div>
  );

}
