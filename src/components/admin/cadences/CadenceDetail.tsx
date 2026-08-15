import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit, Bot, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCadenceSteps } from '@/hooks/useCadences';

interface Props {
  cadenceId: string;
  onBack: () => void;
  onEdit: () => void;
}

export function CadenceDetail({ cadenceId, onBack, onEdit }: Props) {
  const [cadence, setCadence] = useState<any>(null);
  const { steps } = useCadenceSteps(cadenceId);

  useEffect(() => {
    supabase.from('cadences' as any).select('*').eq('id', cadenceId).maybeSingle()
      .then(({ data }) => setCadence(data));
  }, [cadenceId]);

  if (!cadence) return <div className="p-6">Carregando…</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
        <Button onClick={onEdit}><Edit className="h-4 w-4 mr-2" /> Editar</Button>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold">{cadence.name}</h1>
          <Badge>{cadence.status}</Badge>
          {cadence.objective && <Badge variant="outline">{cadence.objective}</Badge>}
        </div>
        {cadence.description && <p className="text-muted-foreground">{cadence.description}</p>}
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Jornada visual</CardTitle></CardHeader>
        <CardContent>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma etapa configurada.</p>
          ) : (
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={s.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">{i + 1}</div>
                    {i < steps.length - 1 && <div className="w-px h-12 bg-border mt-1" />}
                  </div>
                  <div className="flex-1 border rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{s.name}</div>
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {s.execute_immediately ? 'Imediatamente' : `${s.delay_value} ${labelUnit(s.delay_unit)} após ${s.delay_from === 'enrollment' ? 'entrada' : 'etapa anterior'}`}
                      </Badge>
                    </div>
                    {s.objective && <div className="text-xs text-muted-foreground">{s.objective}</div>}
                    {(s.context_inline || s.context_id) && (
                      <div className="text-xs bg-muted rounded p-2 mt-1 flex items-start gap-2">
                        <Bot className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-3">{s.context_inline ?? 'Contexto da biblioteca'}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm">✓</div>
                <div className="text-sm text-muted-foreground pt-1.5">Encerrar</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Janela de execução</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Dias:</span> {(cadence.execution_window?.days ?? []).join(', ').toUpperCase()}</div>
            <div><span className="text-muted-foreground">Horário:</span> {cadence.execution_window?.start} — {cadence.execution_window?.end}</div>
            <div><span className="text-muted-foreground">Aleatório:</span> {cadence.execution_window?.randomize ? 'Sim' : 'Não'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Regras de parada</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1">
              {Object.entries(cadence.stop_rules ?? {}).filter(([, v]) => v).map(([k]) => (
                <li key={k}>• {STOP_LABELS[k] ?? k}</li>
              ))}
              {!Object.values(cadence.stop_rules ?? {}).some(Boolean) && <li className="text-muted-foreground">Nenhuma regra</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function labelUnit(u: string) {
  return u === 'minutes' ? 'minutos' : u === 'hours' ? 'horas' : 'dias';
}

const STOP_LABELS: Record<string, string> = {
  responded: 'Lead respondeu',
  purchased: 'Compra realizada',
  tag_buyer: 'Tag Comprador',
  tag_dnd: 'Tag Não Perturbe',
  pipeline_closed: 'Pipeline fechado',
  active_customer: 'Cliente ativo',
  meeting_scheduled: 'Reunião agendada',
  human_handover: 'Atendimento humano',
};
