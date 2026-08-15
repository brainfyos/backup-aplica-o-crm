import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Insight = { title: string; recommendation: string };

export function AICampaignAssistant({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [summary, setSummary] = useState<any>(null);

  const run = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('campaign-ai-insights', {
      body: { campaign_id: campaignId },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setInsights(data?.insights ?? []);
    setSummary(data?.summary ?? null);
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Assistente IA da Campanha
        </CardTitle>
        <Button size="sm" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {insights ? 'Reanalisar' : 'Analisar campanha'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!insights && !loading && (
          <p className="text-sm text-muted-foreground">
            Clique em "Analisar campanha" para receber recomendações sobre melhor horário, agente e contexto a partir dos dados reais.
          </p>
        )}
        {summary && (
          <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
            <span>Enviadas: <strong>{summary.totals?.sent ?? 0}</strong></span>
            <span>Respostas: <strong>{summary.totals?.responded ?? 0}</strong></span>
            <span>Taxa: <strong className="text-primary">{summary.totals?.response_rate ?? 0}%</strong></span>
            {!!summary.best_response_hours?.length && (
              <span>Melhores horários: <strong>{summary.best_response_hours.map((h: any) => `${h.hour}h`).join(', ')}</strong></span>
            )}
          </div>
        )}
        {insights?.map((i, idx) => (
          <div key={idx} className="rounded-md border bg-background p-3">
            <p className="font-medium text-sm">{i.title}</p>
            <p className="text-sm text-muted-foreground mt-1">{i.recommendation}</p>
          </div>
        ))}
        {insights && !insights.length && (
          <p className="text-sm text-muted-foreground">Sem insights por enquanto — colete mais dados antes de reanalisar.</p>
        )}
      </CardContent>
    </Card>
  );
}
