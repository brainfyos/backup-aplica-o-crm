import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PhoneOff, Mic, MicOff, Bot, User, Loader2 } from 'lucide-react';
import { useGrokVoiceCall, type ToolCallEvent } from '@/hooks/useGrokVoiceCall';
import { CallWaveform } from './CallWaveform';
import { DynamicSurface } from './DynamicSurface';
import { OutcomeScreen, type OutcomeContext, type OutcomeKind } from './OutcomeScreen';
import { toast } from 'sonner';


export function VoiceCallStage({
  open,
  onOpenChange,
  voiceAgentId,
  agentName,
  leadId,
  leadName,
  publicSlug,
  visitor,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  voiceAgentId?: string;
  agentName: string;
  leadId?: string | null;
  leadName?: string | null;
  publicSlug?: string;
  visitor?: { name?: string; contact?: string } | null;
}) {
  const [currentTool, setCurrentTool] = useState<ToolCallEvent | null>(null);
  const [finalOutcome, setFinalOutcome] = useState<{ label: string; kind: OutcomeKind | string } | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef<number>(0);
  const contextRef = useRef<OutcomeContext>({});

  const call = useGrokVoiceCall({
    voiceAgentId,
    leadId,
    publicSlug,
    visitor,
    onToolCall: (evt) => {
      setCurrentTool(evt);
    },
    onError: (msg) => toast.error(msg),
  });

  useEffect(() => {
    if (open && call.state === 'idle') {
      startedAtRef.current = Date.now();
      contextRef.current = { leadName, agentName };
      void call.start();
    }
    if (!open && (call.state === 'in_call' || call.state === 'ringing')) {
      void call.hangup();
      setCurrentTool(null);
      setFinalOutcome(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [call.transcript]);

  // Captura contexto do desfecho enquanto o agente usa ferramentas.
  const handleClickLog = (tool: string, payload: Record<string, unknown>) => {
    call.logClick(tool, payload);
    if (tool === 'agendar_reuniao' && payload.start) {
      contextRef.current.agendamento = {
        start: payload.start as string,
        end: (payload.end as string) || undefined,
        link: (payload.link as string) || null,
      };
    }
    if (tool === 'enviar_proposta' && payload.url) {
      contextRef.current.proposta = {
        label: (payload.label as string) || 'Proposta',
        url: payload.url as string,
      };
    }
    if (tool === 'transferir_humano') {
      contextRef.current.transferencia = { setor: (payload.setor as string) || null };
    }
  };

  const handleClose = async () => {
    const durationSec = Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000);
    contextRef.current.durationSec = durationSec;
    await call.hangup(finalOutcome ? { outcome: finalOutcome.kind, outcome_data: {} } : undefined);
    onOpenChange(false);
    setCurrentTool(null);
    setFinalOutcome(null);
    contextRef.current = {};
  };

  const restart = () => {
    setFinalOutcome(null);
    setCurrentTool(null);
    contextRef.current = { leadName, agentName };
    startedAtRef.current = Date.now();
    void call.start();
  };


  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) void handleClose(); else onOpenChange(o); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0 border-0 bg-gradient-to-b from-background via-background to-muted">
        {/* Header */}
        <div className="px-6 pt-6 pb-3 text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {call.state === 'connecting' && 'Conectando…'}
            {call.state === 'ringing' && 'Chamando…'}
            {call.state === 'in_call' && 'Em ligação'}
            {call.state === 'ended' && 'Ligação encerrada'}
            {call.state === 'error' && 'Erro'}
            {call.state === 'idle' && 'Pronto'}
          </div>
          <div className="mt-2 text-xl font-semibold">{agentName}</div>
          {leadName && <div className="text-sm text-muted-foreground">com {leadName}</div>}
          {call.state === 'in_call' && (
            <Badge variant="outline" className="mt-2 gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> ao vivo
            </Badge>
          )}
        </div>

        {/* Avatar / Waveform */}
        <div className="px-6 py-4">
          <div className="mx-auto h-40 w-40 rounded-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent flex items-center justify-center relative">
            {(call.state === 'connecting' || call.state === 'ringing') && (
              <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
            )}
            <Bot className="h-16 w-16 text-primary" />
          </div>
          <div className="mt-4">
            <CallWaveform getAnalyser={call.getAnalyser} active={call.state === 'in_call'} />
          </div>
        </div>

        {/* Dynamic surface (tool calls) */}
        {call.state === 'in_call' && currentTool && (
          <div className="px-6 pb-2">
            <DynamicSurface
              toolCall={currentTool}
              toolsMeta={call.toolsMeta}
              outcomes={call.outcomes}
              onResult={(toolCallId, output) => {
                call.sendToolResult(toolCallId, output);
              }}
              onClickLog={handleClickLog}
              onOutcome={(o) => {
                const found = call.outcomes.find((x) => x.kind === o.outcome);
                const picked = found
                  ? { label: found.label, kind: found.kind }
                  : { label: 'Desfecho registrado', kind: o.outcome };
                setFinalOutcome(picked);
                // encerra ligação automaticamente ao registrar desfecho
                const durationSec = Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000);
                contextRef.current.durationSec = durationSec;
                void call.hangup({ outcome: picked.kind, outcome_data: {} });
              }}
            />
          </div>
        )}

        {/* Transcript */}
        {call.state === 'in_call' && (
          <div ref={transcriptRef} className="px-6 max-h-40 overflow-y-auto space-y-1 text-xs">
            {call.transcript.length === 0 ? (
              <div className="text-center text-muted-foreground flex items-center justify-center gap-2 py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> aguardando fala…
              </div>
            ) : (
              call.transcript.slice(-6).map((t) => (
                <div key={t.id} className="flex gap-1.5">
                  {t.role === 'assistant' ? <Bot className="h-3 w-3 mt-0.5 text-primary flex-shrink-0" /> : <User className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />}
                  <span className={t.role === 'assistant' ? 'text-foreground' : 'text-muted-foreground'}>{t.text}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Outcome final desenhado */}
        {call.state === 'ended' && (
          <OutcomeScreen
            kind={(finalOutcome?.kind as OutcomeKind) || 'sem_desfecho'}
            label={finalOutcome?.label}
            context={contextRef.current}
            onClose={() => onOpenChange(false)}
            onNewCall={restart}
          />
        )}

        {/* Controls durante a ligação */}
        {call.state !== 'ended' && (
          <div className="p-6 flex items-center justify-center gap-4 border-t bg-background/50 backdrop-blur">
            <Button
              variant={call.muted ? 'default' : 'outline'}
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={() => call.setMuted(!call.muted)}
              disabled={call.state !== 'in_call'}
            >
              {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="h-14 w-14 rounded-full"
              onClick={() => void handleClose()}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </div>
        )}


        {call.error && (
          <div className="bg-destructive/10 text-destructive text-xs px-6 py-2 text-center">{call.error}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
