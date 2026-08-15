import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, Clock3, Eye, Loader2, MousePointerClick, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Funnel } from '@/types/funnel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface Props {
  funnel: Funnel;
}

interface QuizSessionRow {
  id: string;
  started_at: string;
  first_interaction_at: string | null;
  completed_at: string | null;
  current_block_id: string | null;
  max_step: number;
  device_type: string | null;
  tracking: Record<string, string | null> | null;
}

interface QuizEventRow {
  session_id: string;
  block_id: string | null;
  event_type: string;
  duration_ms: number | null;
  answer: Record<string, unknown> | null;
  created_at: string;
}

const number = new Intl.NumberFormat('pt-BR');

function getBlockName(funnel: Funnel, blockId: string | null) {
  if (!blockId) return 'Sem etapa';
  const block = funnel.flow_blocks.find((item) => item.id === blockId);
  return block?.data?.content || block?.data?.variable_name || `Etapa ${blockId.slice(0, 6)}`;
}

export function QuizAnalyticsTab({ funnel }: Props) {
  const [days, setDays] = useState(30);
  const start = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }, [days]);

  const analytics = useQuery({
    queryKey: ['quiz-runtime-analytics', funnel.id, days],
    queryFn: async () => {
      const client = supabase as any;
      const [sessionsResult, eventsResult] = await Promise.all([
        client
          .from('quiz_sessions')
          .select('id,started_at,first_interaction_at,completed_at,current_block_id,max_step,device_type,tracking')
          .eq('funnel_id', funnel.id)
          .gte('started_at', start)
          .order('started_at', { ascending: false })
          .limit(5000),
        client
          .from('quiz_step_events')
          .select('session_id,block_id,event_type,duration_ms,answer,created_at')
          .eq('funnel_id', funnel.id)
          .gte('created_at', start)
          .order('created_at', { ascending: false })
          .limit(10000),
      ]);
      if (sessionsResult.error) throw sessionsResult.error;
      if (eventsResult.error) throw eventsResult.error;
      return {
        sessions: (sessionsResult.data || []) as QuizSessionRow[],
        events: (eventsResult.data || []) as QuizEventRow[],
      };
    },
  });

  const summary = useMemo(() => {
    const sessions = analytics.data?.sessions || [];
    const events = analytics.data?.events || [];
    const started = sessions.filter((session) => session.first_interaction_at).length;
    const completed = sessions.filter((session) => session.completed_at).length;
    const answeredEvents = events.filter((event) => event.event_type === 'step_answered');
    const averageDuration = answeredEvents.length
      ? answeredEvents.reduce((sum, event) => sum + (event.duration_ms || 0), 0) / answeredEvents.length
      : 0;

    const stepMap = new Map<string, { views: Set<string>; answers: Set<string>; duration: number; durations: number }>();
    events.forEach((event) => {
      if (!event.block_id || !['step_viewed', 'step_answered'].includes(event.event_type)) return;
      const value = stepMap.get(event.block_id) || {
        views: new Set<string>(),
        answers: new Set<string>(),
        duration: 0,
        durations: 0,
      };
      if (event.event_type === 'step_viewed') value.views.add(event.session_id);
      if (event.event_type === 'step_answered') {
        value.answers.add(event.session_id);
        value.duration += event.duration_ms || 0;
        value.durations += 1;
      }
      stepMap.set(event.block_id, value);
    });

    const steps = funnel.flow_blocks
      .map((block, index) => {
        const stats = stepMap.get(block.id);
        const views = stats?.views.size || 0;
        const answers = stats?.answers.size || 0;
        return {
          id: block.id,
          index: index + 1,
          name: getBlockName(funnel, block.id),
          views,
          answers,
          conversion: views ? (answers / views) * 100 : 0,
          averageTime: stats?.durations ? stats.duration / stats.durations : 0,
        };
      })
      .filter((step) => step.views > 0 || step.answers > 0);

    const deviceCounts = sessions.reduce<Record<string, number>>((acc, session) => {
      const device = session.device_type || 'desconhecido';
      acc[device] = (acc[device] || 0) + 1;
      return acc;
    }, {});

    return {
      visits: sessions.length,
      started,
      completed,
      startRate: sessions.length ? (started / sessions.length) * 100 : 0,
      completionRate: started ? (completed / started) * 100 : 0,
      averageDuration,
      steps,
      devices: deviceCounts,
    };
  }, [analytics.data, funnel]);

  if (analytics.isLoading) {
    return <div className="h-full grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (analytics.isError) {
    return (
      <div className="h-full grid place-items-center p-6 text-center">
        <div>
          <Activity className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">Analytics do quiz ainda não está disponível</p>
          <p className="text-sm text-muted-foreground mt-1">Publique a migração e faça uma nova visita ao quiz.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => analytics.refetch()}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  const cards = [
    { label: 'Visitas', value: number.format(summary.visits), icon: Eye, detail: `${days} dias` },
    { label: 'Iniciaram', value: number.format(summary.started), icon: MousePointerClick, detail: `${summary.startRate.toFixed(1)}% das visitas` },
    { label: 'Concluíram', value: number.format(summary.completed), icon: CheckCircle2, detail: `${summary.completionRate.toFixed(1)}% de conclusão` },
    { label: 'Tempo por etapa', value: `${Math.round(summary.averageDuration / 1000)}s`, icon: Clock3, detail: 'média das respostas' },
  ];

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Resultados do quiz</h2>
          <p className="text-sm text-muted-foreground">Veja onde as pessoas avançam, respondem e abandonam.</p>
        </div>
        <div className="flex rounded-lg border p-1">
          {[7, 30, 90].map((value) => (
            <Button
              key={value}
              variant={days === value ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-3"
              onClick={() => setDays(value)}
            >
              {value}d
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon, detail }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-semibold mt-2">{value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <h3 className="font-medium">Conversão por etapa</h3>
            <p className="text-xs text-muted-foreground">A queda entre visualizações e respostas revela o ponto de abandono.</p>
          </div>
          {summary.steps.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Ainda não há sessões neste período</p>
              <p className="text-xs text-muted-foreground mt-1">Os próximos acessos serão registrados automaticamente.</p>
            </div>
          ) : (
            <div className="divide-y">
              {summary.steps.map((step) => (
                <div key={step.id} className="grid grid-cols-[minmax(0,1fr)_72px_72px_96px] gap-3 items-center px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{step.index}. {step.name}</p>
                    <Progress value={step.conversion} className="h-1.5 mt-2" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{step.views}</p>
                    <p className="text-[10px] text-muted-foreground">viram</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{step.answers}</p>
                    <p className="text-[10px] text-muted-foreground">responderam</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{step.conversion.toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">{Math.round(step.averageTime / 1000)}s médios</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-medium mb-3">Dispositivos</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.devices).length === 0 && <span className="text-xs text-muted-foreground">Sem dados</span>}
            {Object.entries(summary.devices).map(([device, count]) => (
              <span key={device} className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs">
                {device === 'mobile' ? 'Celular' : device === 'desktop' ? 'Computador' : 'Desconhecido'} · {count}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
