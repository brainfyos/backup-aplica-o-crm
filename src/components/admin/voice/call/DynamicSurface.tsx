import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ExternalLink, FileText, Loader2, Send, MessageCircle, Sparkles, CheckCircle2, CalendarClock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ToolCallEvent } from '@/hooks/useGrokVoiceCall';
import { InCallBookingSheet } from '@/components/publiccall/booking/InCallBookingSheet';
import { QuickScheduleOffer, type QuickSlot } from '@/components/publiccall/booking/QuickScheduleOffer';

export interface DynamicSurfaceProps {
  toolCall: ToolCallEvent | null;
  toolsMeta: any;
  onResult: (toolCallId: string, output: unknown) => void;
  onClickLog: (tool: string, payload: Record<string, unknown>) => void;
  onOutcome: (outcome: { outcome: string; outcome_data: Record<string, unknown> }) => void;
  outcomes: Array<{ id: string; label: string; kind: string }>;
}

export function DynamicSurface(props: DynamicSurfaceProps) {
  const { toolCall } = props;
  if (!toolCall) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={toolCall.call_id}
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="w-full"
      >
        <ToolRenderer {...props} toolCall={toolCall} />
      </motion.div>
    </AnimatePresence>
  );
}

function ToolRenderer({ toolCall, toolsMeta, onResult, onClickLog, onOutcome, outcomes }: DynamicSurfaceProps & { toolCall: ToolCallEvent }) {
  const sessionId: string | null = toolsMeta?.__session_id ?? null;
  const visitor = toolsMeta?.__visitor as { name?: string; contact?: string } | undefined;
  const eventTypeId: string | null = toolsMeta?.agendar_reuniao_event_type ?? null;
  const agentName: string | undefined = toolsMeta?.__agent_name;

  switch (toolCall.name) {
    case 'mostrar_botoes':
      return <ButtonsRenderer toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} />;
    case 'coletar_dado':
      return <InputRenderer toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} />;
    case 'abrir_link':
      return <LinkRenderer toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} links={toolsMeta?.abrir_link || []} />;
    case 'enviar_proposta':
      return <LinkRenderer toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} links={toolsMeta?.enviar_proposta || []} isProposta />;
    case 'listar_horarios_reuniao':
      return <ListarHorariosCard toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} onOutcome={onOutcome} outcomes={outcomes} sessionId={sessionId} eventTypeId={eventTypeId} visitor={visitor} agentName={agentName} />;
    case 'confirmar_agendamento_reuniao':
    case 'agendar_reuniao': // legacy — mesmo fluxo
      return <ConfirmarAgendamentoCard toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} onOutcome={onOutcome} outcomes={outcomes} sessionId={sessionId} eventTypeId={eventTypeId} visitor={visitor} agentName={agentName} />;
    case 'enviar_whatsapp':
      return <WhatsAppSender toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} sessionId={sessionId} />;
    case 'aplicar_tag_interesse':
      return <InterestApplier toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} sessionId={sessionId} />;
    case 'salvar_dado_lead':
      return <SaveDataFeedback toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} sessionId={sessionId} />;
    case 'registrar_desfecho':
      return <OutcomeConfirm toolCall={toolCall} outcomes={outcomes} onResult={onResult} onOutcome={onOutcome} />;
    default:
      // Tools dinâmicas de captura: salvar_<key>
      if (toolCall.name.startsWith('salvar_')) {
        return <SaveDataFeedback toolCall={toolCall} onResult={onResult} onClickLog={onClickLog} sessionId={sessionId} />;
      }
      return null;
  }
}

function ButtonsRenderer({ toolCall, onResult, onClickLog }: { toolCall: ToolCallEvent; onResult: DynamicSurfaceProps['onResult']; onClickLog: DynamicSurfaceProps['onClickLog']; }) {
  const [choice, setChoice] = useState<string | null>(null);
  const titulo = (toolCall.args?.titulo as string) || 'Escolha uma opção';
  const botoes = (toolCall.args?.botoes as Array<{ id: string; label: string }>) || [];
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">{titulo}</div>
      <div className="flex flex-wrap gap-2">
        {botoes.map((b, i) => (
          <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Button
              variant={choice === b.id ? 'default' : 'outline'}
              disabled={!!choice}
              onClick={() => {
                setChoice(b.id);
                onClickLog('mostrar_botoes', { id: b.id, label: b.label });
                onResult(toolCall.call_id, { clicked: b.id, label: b.label });
              }}
            >
              {b.label}
            </Button>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

function InputRenderer({ toolCall, onResult, onClickLog }: { toolCall: ToolCallEvent; onResult: DynamicSurfaceProps['onResult']; onClickLog: DynamicSurfaceProps['onClickLog']; }) {
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const campo = (toolCall.args?.campo as string) || 'texto_livre';
  const rotulo = (toolCall.args?.rotulo as string) || labelFor(campo);
  const type = campo === 'email' ? 'email' : campo === 'whatsapp' ? 'tel' : 'text';
  const placeholder = campo === 'whatsapp' ? '(11) 99999-9999' : campo === 'email' ? 'seu@email.com' : rotulo;

  const submit = () => {
    if (!value.trim() || sent) return;
    let normalized = value.trim();
    if (campo === 'whatsapp') {
      const digits = normalized.replace(/\D+/g, '');
      normalized = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
    }
    setSent(true);
    onClickLog('coletar_dado', { campo, value: normalized });
    onResult(toolCall.call_id, { campo, value: normalized });
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">{rotulo}</div>
      <div className="flex gap-2">
        <Input
          type={type}
          value={value}
          disabled={sent}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoFocus
        />
        <Button onClick={submit} disabled={sent || !value.trim()}>
          {sent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </Card>
  );
}

function labelFor(campo: string) {
  return campo === 'nome' ? 'Como podemos te chamar?' : campo === 'whatsapp' ? 'Qual seu WhatsApp?' : campo === 'email' ? 'Qual seu e-mail?' : 'Digite abaixo';
}

function LinkRenderer({ toolCall, onResult, onClickLog, links, isProposta }: {
  toolCall: ToolCallEvent;
  onResult: DynamicSurfaceProps['onResult'];
  onClickLog: DynamicSurfaceProps['onClickLog'];
  links: Array<{ id: string; label: string; url: string; tipo?: string }>;
  isProposta?: boolean;
}) {
  const linkId = (toolCall.args?.link_id || toolCall.args?.proposta_id) as string;
  const found = links.find((l) => l.id === linkId);
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!found) {
      onResult(toolCall.call_id, { error: `link ${linkId} não configurado` });
    }
  }, [found]);
  if (!found) return null;
  const Icon = isProposta ? FileText : ExternalLink;
  return (
    <Card className="p-4 space-y-3">
      <div className="text-xs uppercase text-muted-foreground">{isProposta ? 'Proposta enviada' : 'Link enviado'}</div>
      <div className="text-sm font-medium">{found.label}</div>
      <Button
        onClick={() => {
          window.open(found.url, '_blank', 'noopener,noreferrer');
          setOpened(true);
          onClickLog(toolCall.name, { id: found.id, url: found.url, label: found.label });
          if (!opened) onResult(toolCall.call_id, { opened: true, id: found.id });
        }}
      >
        <Icon className="h-4 w-4 mr-2" /> {opened ? 'Abrir novamente' : isProposta ? 'Ver proposta' : 'Abrir link'}
      </Button>
    </Card>
  );
}

// ============ Agendamento in-call ============
// ListarHorariosCard: renderiza chips clicáveis com os horários retornados
// pela tool listar_horarios_reuniao (a IA propõe por voz em paralelo). Clique
// no chip abre o InCallBookingSheet para coleta de nome/WhatsApp/e-mail.
// ConfirmarAgendamentoCard: abre o sheet direto quando a IA dispara
// confirmar_agendamento_reuniao (lead confirmou por voz), pré-preenchendo o
// horário. Submissão vai por voice-call-tool para não duplicar booking.

function pickScheduleOutcome(outcomes: DynamicSurfaceProps['outcomes']): string {
  const found = outcomes.find((o) => /agend/i.test(o.kind)) || outcomes.find((o) => /agend/i.test(o.label));
  return found?.kind || 'agendou_reuniao';
}

type ListarSlot = { start: string; end: string; label?: string };

function ListarHorariosCard({
  toolCall, onResult, onClickLog, onOutcome, outcomes,
  sessionId, eventTypeId, visitor, agentName,
}: {
  toolCall: ToolCallEvent;
  onResult: DynamicSurfaceProps['onResult'];
  onClickLog: DynamicSurfaceProps['onClickLog'];
  onOutcome: DynamicSurfaceProps['onOutcome'];
  outcomes: DynamicSurfaceProps['outcomes'];
  sessionId?: string | null;
  eventTypeId?: string | null;
  visitor?: { name?: string; contact?: string };
  agentName?: string;
}) {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo', []);
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [slots, setSlots] = useState<ListarSlot[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [presetSlot, setPresetSlot] = useState<ListarSlot | null>(null);
  const [confirmed, setConfirmed] = useState<{ start: string; end: string; link: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      if (!sessionId) {
        setStatus('error'); setErrorMsg('sem sessão');
        onResult(toolCall.call_id, { error: 'sem sessão' });
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke('voice-call-tool', {
          body: { session_id: sessionId, tool_name: 'listar_horarios_reuniao', args: toolCall.args || {} },
        });
        if (error || data?.error) {
          setStatus('error');
          setErrorMsg(data?.error || error?.message || 'falha');
          onResult(toolCall.call_id, { error: data?.error || 'falha ao listar' });
          return;
        }
        const list: ListarSlot[] = Array.isArray(data?.slots) ? data.slots : [];
        setSlots(list);
        setStatus('done');
        onResult(toolCall.call_id, { slots: list });
      } catch (e) {
        setStatus('error'); setErrorMsg((e as Error).message);
        onResult(toolCall.call_id, { error: (e as Error).message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dataPreferida = (toolCall.args?.data as string) || null;

  const handleChipClick = (s: ListarSlot) => {
    setPresetSlot(s);
    setSheetOpen(true);
  };

  const handleConfirmed = (p: {
    start: string; end: string; link: string | null;
    guest_name: string; guest_email: string; guest_phone: string;
  }) => {
    setConfirmed({ start: p.start, end: p.end, link: p.link });
    setSheetOpen(false);
    onClickLog('agendar_reuniao', { start: p.start, end: p.end, link: p.link, guest_name: p.guest_name });
    // Dispara desfecho → PublicCall vai encerrar chamada e redirecionar para thank-you
    setTimeout(() => {
      onOutcome({
        outcome: pickScheduleOutcome(outcomes),
        outcome_data: { start: p.start, end: p.end, link: p.link, guest_name: p.guest_name },
      });
    }, 1200);
  };

  if (confirmed) {
    return (
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> <span className="text-sm font-semibold">Reunião confirmada</span>
        </div>
        <div className="text-sm">
          {format(new Date(confirmed.start), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
        </div>
      </Card>
    );
  }

  if (status === 'loading') {
    return (
      <Card className="p-3 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Consultando agenda…</span>
      </Card>
    );
  }
  if (status === 'error') {
    return (
      <Card className="p-3">
        <div className="text-xs text-destructive">Falha ao consultar agenda: {errorMsg}</div>
      </Card>
    );
  }

  // Ação alternativa opcional vinda da tool (ex: "Prefiro a proposta no WhatsApp")
  const altRaw = (toolCall.args?.alt_action || toolCall.args?.alternativa) as
    | { label?: string; hint?: string; kind?: string }
    | undefined;
  const altAction = altRaw?.label ? { label: altRaw.label, hint: altRaw.hint, kind: altRaw.kind } : null;

  const handleAlt = () => {
    onClickLog('mostrar_agendamento_alt', altAction || {});
    onResult(toolCall.call_id, { alt_chosen: true, alt_kind: altAction?.kind || 'proposta' });
  };

  const quickSlots: QuickSlot[] = slots.slice(0, 3).map((s) => ({
    start: s.start,
    end: s.end,
    label: s.label,
  }));

  return (
    <>
      <QuickScheduleOffer
        slots={quickSlots}
        agentName={agentName}
        altAction={altAction}
        onPickQuick={(s) => handleChipClick(s)}
        onOpenSheet={() => {
          setPresetSlot(null);
          setSheetOpen(true);
        }}
        onAlt={altAction ? handleAlt : undefined}
      />

      {eventTypeId && (
        <InCallBookingSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          eventTypeId={eventTypeId}
          timezone={tz}
          sessionId={sessionId || null}
          preferredDate={dataPreferida}
          visitor={visitor}
          agentName={agentName}
          presetSlot={presetSlot}
          mode="voice-call-tool"
          onConfirmed={handleConfirmed}
        />
      )}
    </>
  );
}



// ============ NOVOS RENDERERS (Fase 5) ============

function SaveDataFeedback({ toolCall, onResult, onClickLog, sessionId }: {
  toolCall: ToolCallEvent;
  onResult: DynamicSurfaceProps['onResult'];
  onClickLog: DynamicSurfaceProps['onClickLog'];
  sessionId?: string | null;
}) {
  const key = toolCall.name === 'salvar_dado_lead'
    ? String(toolCall.args?.chave || 'dado')
    : toolCall.name.replace(/^salvar_/, '');
  const value = String(toolCall.args?.valor ?? toolCall.args?.value ?? '');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      if (sessionId) {
        try {
          await supabase.functions.invoke('voice-call-tool', {
            body: { session_id: sessionId, tool_name: toolCall.name, args: toolCall.args },
          });
        } catch (e) { /* silencioso */ }
      }
      onClickLog(toolCall.name, { key, value });
      onResult(toolCall.call_id, { saved: true, key, value });
      setDone(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="p-3 flex items-center gap-2">
      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Loader2 className="h-4 w-4 animate-spin" />}
      <div className="text-sm">
        <span className="text-muted-foreground">{key}: </span>
        <span className="font-medium">{value || '…'}</span>
      </div>
    </Card>
  );
}

function WhatsAppSender({ toolCall, onResult, onClickLog, sessionId }: {
  toolCall: ToolCallEvent;
  onResult: DynamicSurfaceProps['onResult'];
  onClickLog: DynamicSurfaceProps['onClickLog'];
  sessionId?: string | null;
}) {
  const mensagem = String(toolCall.args?.mensagem || '');
  const [status, setStatus] = useState<'sending' | 'sent' | 'error'>('sending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!sessionId) {
        setStatus('error');
        setError('sem sessão');
        onResult(toolCall.call_id, { error: 'sem sessão' });
        return;
      }
      try {
        const { data, error: e } = await supabase.functions.invoke('voice-call-tool', {
          body: { session_id: sessionId, tool_name: 'enviar_whatsapp', args: toolCall.args },
        });
        if (e || data?.error) throw new Error(data?.error || e?.message);
        setStatus('sent');
        onClickLog('enviar_whatsapp', { phone: data?.phone, mensagem });
        onResult(toolCall.call_id, { sent: true, phone: data?.phone });
      } catch (e) {
        setStatus('error');
        setError((e as Error).message);
        onResult(toolCall.call_id, { error: (e as Error).message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
      </div>
      <div className="text-sm text-muted-foreground line-clamp-3">{mensagem}</div>
      <div className="text-xs">
        {status === 'sending' && <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Enviando…</span>}
        {status === 'sent' && <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Enviado</span>}
        {status === 'error' && <span className="text-destructive">Falha: {error}</span>}
      </div>
    </Card>
  );
}

function InterestApplier({ toolCall, onResult, onClickLog, sessionId }: {
  toolCall: ToolCallEvent;
  onResult: DynamicSurfaceProps['onResult'];
  onClickLog: DynamicSurfaceProps['onClickLog'];
  sessionId?: string | null;
}) {
  const [status, setStatus] = useState<'sending' | 'done' | 'error'>('sending');
  const [label, setLabel] = useState<string>('Interesse');

  useEffect(() => {
    (async () => {
      if (!sessionId) {
        setStatus('error');
        onResult(toolCall.call_id, { error: 'sem sessão' });
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke('voice-call-tool', {
          body: { session_id: sessionId, tool_name: 'aplicar_tag_interesse', args: toolCall.args },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        setLabel(data?.label || 'Interesse');
        setStatus('done');
        onClickLog('aplicar_tag_interesse', toolCall.args);
        onResult(toolCall.call_id, { applied: true });
      } catch (e) {
        setStatus('error');
        onResult(toolCall.call_id, { error: (e as Error).message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-amber-500" /> {label}
      </div>
      <div className="text-xs text-muted-foreground">
        {status === 'sending' && 'Registrando interesse…'}
        {status === 'done' && 'Tag aplicada no lead.'}
        {status === 'error' && 'Falha ao aplicar tag.'}
      </div>
    </Card>
  );
}

function OutcomeConfirm({ toolCall, outcomes, onResult, onOutcome }: { toolCall: ToolCallEvent; outcomes: DynamicSurfaceProps['outcomes']; onResult: DynamicSurfaceProps['onResult']; onOutcome: DynamicSurfaceProps['onOutcome']; }) {
  const outcomeId = toolCall.args?.outcome_id as string;
  const resumo = (toolCall.args?.resumo as string) || '';
  const dados = (toolCall.args?.dados as Record<string, unknown>) || {};
  const outcome = outcomes.find((o) => o.id === outcomeId) || outcomes.find((o) => o.kind === outcomeId);

  useEffect(() => {
    onResult(toolCall.call_id, { registered: true, outcome_id: outcomeId });
    onOutcome({ outcome: outcome?.kind || outcomeId || 'sem_desfecho', outcome_data: { outcome_id: outcomeId, resumo, dados } });
  }, []);

  return (
    <Card className="p-6 text-center space-y-2">
      <div className="text-xs uppercase text-muted-foreground">Desfecho registrado</div>
      <div className="text-lg font-semibold">{outcome?.label || outcomeId}</div>
      {resumo && <div className="text-sm text-muted-foreground">{resumo}</div>}
    </Card>
  );
}

// ============ ConfirmarAgendamentoCard ============
// Não agenda sozinho. Abre o InCallBookingSheet com o horário travado e
// coleta nome/WhatsApp/e-mail do lead. Submissão vai por voice-call-tool
// (confirmar_agendamento_reuniao), evitando double-booking.

function ConfirmarAgendamentoCard({
  toolCall, onResult, onClickLog, onOutcome, outcomes,
  sessionId, eventTypeId, visitor, agentName,
}: {
  toolCall: ToolCallEvent;
  onResult: DynamicSurfaceProps['onResult'];
  onClickLog: DynamicSurfaceProps['onClickLog'];
  onOutcome: DynamicSurfaceProps['onOutcome'];
  outcomes: DynamicSurfaceProps['outcomes'];
  sessionId?: string | null;
  eventTypeId?: string | null;
  visitor?: { name?: string; contact?: string };
  agentName?: string;
}) {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo', []);
  const startTime = (toolCall.args?.start_time as string) || null;
  const [sheetOpen, setSheetOpen] = useState<boolean>(!!startTime);
  const [confirmed, setConfirmed] = useState<{ start: string; end: string; link: string | null } | null>(null);

  const presetSlot = useMemo(() => {
    if (!startTime) return null;
    const startD = new Date(startTime);
    if (isNaN(startD.getTime())) return null;
    // end é placeholder (backend calcula real); só usado no UI do sheet
    const endD = new Date(startD.getTime() + 30 * 60 * 1000);
    return { start: startD.toISOString(), end: endD.toISOString() };
  }, [startTime]);

  const handleConfirmed = (p: {
    start: string; end: string; link: string | null;
    guest_name: string; guest_email: string; guest_phone: string;
  }) => {
    setConfirmed({ start: p.start, end: p.end, link: p.link });
    setSheetOpen(false);
    onClickLog('confirmar_agendamento_reuniao', { start: p.start, end: p.end, link: p.link, guest_name: p.guest_name });
    onResult(toolCall.call_id, {
      agendado: true,
      start: p.start,
      end: p.end,
      link: p.link,
      guest_name: p.guest_name,
      guest_email: p.guest_email,
      guest_phone: p.guest_phone,
    });
    setTimeout(() => {
      onOutcome({
        outcome: pickScheduleOutcome(outcomes),
        outcome_data: { start: p.start, end: p.end, link: p.link, guest_name: p.guest_name },
      });
    }, 1200);
  };

  const handleClose = () => {
    // Se o lead fechou o sheet sem confirmar, avisa a IA para propor outro horário
    if (!confirmed) {
      onResult(toolCall.call_id, { agendado: false, cancelled_by_user: true });
    }
    setSheetOpen(false);
  };

  if (!startTime || !presetSlot) {
    onResult(toolCall.call_id, { agendado: false, error: 'start_time inválido' });
    return null;
  }
  if (!eventTypeId) {
    onResult(toolCall.call_id, { agendado: false, error: 'event type não configurado' });
    return null;
  }

  if (confirmed) {
    return (
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> <span className="text-sm font-semibold">Reunião agendada</span>
        </div>
        <div className="text-sm">
          {format(new Date(confirmed.start), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
        </div>
        <div className="text-xs text-muted-foreground">
          Confirmação enviada no seu WhatsApp em instantes.
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">Preencha seus dados para confirmar…</div>
      </Card>
      <InCallBookingSheet
        open={sheetOpen}
        onClose={handleClose}
        eventTypeId={eventTypeId}
        timezone={tz}
        sessionId={sessionId || null}
        visitor={visitor}
        agentName={agentName}
        presetSlot={presetSlot}
        mode="voice-call-tool"
        onConfirmed={handleConfirmed}
      />
    </>
  );
}

