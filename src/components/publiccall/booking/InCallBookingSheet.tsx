import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, X, ArrowLeft, CheckCircle2, CalendarPlus } from 'lucide-react';
import './booking-sheet.css';

type Slot = { start: string; end: string };
type Step = 'days' | 'form' | 'confirming' | 'done';

interface Props {
  open: boolean;
  onClose: () => void;
  eventTypeId: string;
  timezone: string;
  sessionId?: string | null;
  preferredDate?: string | null; // yyyy-mm-dd
  visitor?: { name?: string; contact?: string } | null;
  agentName?: string;
  eventTitle?: string;
  // Se veio de chip rápido pula direto para dados com o slot fixo
  presetSlot?: Slot | null;
  /**
   * 'booking-submit' → chama edge booking-submit direto (uso público/legacy)
   * 'voice-call-tool' → chama voice-call-tool com confirmar_agendamento_reuniao
   *                     (uso dentro da /call quando IA já disparou o tool)
   */
  mode?: 'booking-submit' | 'voice-call-tool';
  onConfirmed: (payload: {
    start: string;
    end: string;
    link: string | null;
    guest_name: string;
    guest_email: string;
    guest_phone: string;
  }) => void;
}

const MAX_DAYS = 14;

function normalizeBRPhone(raw: string): string {
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

function maskBRPhone(raw: string): string {
  const d = raw.replace(/\D+/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function icsFor(start: string, end: string, title: string, description = '', location = ''): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid = `${Date.now()}@vendus`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vendus//Call//PT',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${title}`,
    description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
    location ? `LOCATION:${location}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function InCallBookingSheet({
  open,
  onClose,
  eventTypeId,
  timezone,
  sessionId,
  preferredDate,
  visitor,
  agentName,
  eventTitle,
  presetSlot,
  mode = 'booking-submit',
  onConfirmed,
}: Props) {
  const days = useMemo(() => {
    const base = startOfDay(new Date());
    return Array.from({ length: MAX_DAYS }, (_, i) => addDays(base, i));
  }, []);

  const initialDate = useMemo(() => {
    if (preferredDate) {
      const d = new Date(`${preferredDate}T12:00:00`);
      if (!isNaN(d.getTime())) return d;
    }
    return days[0];
  }, [preferredDate, days]);

  const [step, setStep] = useState<Step>(presetSlot ? 'form' : 'days');
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [slotsCache, setSlotsCache] = useState<Record<string, Slot[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [pickedSlot, setPickedSlot] = useState<Slot | null>(presetSlot || null);

  const [name, setName] = useState<string>(visitor?.name || '');
  const [phone, setPhone] = useState<string>(() => {
    const c = (visitor?.contact || '').trim();
    return c && !c.includes('@') ? maskBRPhone(c) : '';
  });
  const [email, setEmail] = useState<string>(() => {
    const c = (visitor?.contact || '').trim();
    return c.includes('@') ? c : '';
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    start: string;
    end: string;
    link: string | null;
    title: string;
  } | null>(null);

  // Fetch slots do dia selecionado
  useEffect(() => {
    if (!open || step !== 'days') return;
    const key = format(selectedDate, 'yyyy-MM-dd');
    if (slotsCache[key]) return;
    setLoadingSlots(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('booking-availability', {
          body: { eventTypeId, date: key, timezone },
        });
        if (error) throw error;
        const arr: Slot[] = (data?.slots || [])
          .filter((s: any) => s.available)
          .map((s: any) => ({ start: s.start, end: s.end }));
        setSlotsCache((prev) => ({ ...prev, [key]: arr }));
      } catch {
        setSlotsCache((prev) => ({ ...prev, [key]: [] }));
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [open, step, selectedDate, eventTypeId, timezone, slotsCache]);

  if (!open) return null;

  const currentKey = format(selectedDate, 'yyyy-MM-dd');
  const currentSlots = slotsCache[currentKey] || [];

  const canSubmit =
    !!pickedSlot &&
    name.trim().length >= 2 &&
    phone.replace(/\D+/g, '').length >= 10;

  const handlePickSlot = (s: Slot) => {
    setPickedSlot(s);
    setStep('form');
  };

  const handleConfirm = async () => {
    if (!pickedSlot || !canSubmit) return;
    setStep('confirming');
    setSubmitError(null);
    const guestPhone = normalizeBRPhone(phone);
    const guestName = name.trim();
    const guestEmail = email.trim() || `${guestPhone}@vendus.local`;
    try {
      let link: string | null = null;
      if (mode === 'voice-call-tool') {
        if (!sessionId) throw new Error('sessão não iniciada');
        const { data, error } = await supabase.functions.invoke('voice-call-tool', {
          body: {
            session_id: sessionId,
            tool_name: 'confirmar_agendamento_reuniao',
            args: {
              start_time: pickedSlot.start,
              nome: guestName,
              email: guestEmail,
              telefone: guestPhone,
            },
          },
        });
        if (error) throw error;
        if (data?.error || data?.agendado === false) throw new Error(data?.error || 'Falha ao agendar');
        link = data?.link || null;
      } else {
        const { data, error } = await supabase.functions.invoke('booking-submit', {
          body: {
            eventTypeId,
            startTime: pickedSlot.start,
            guestName,
            guestEmail,
            guestPhone,
            timezone,
            tracking: { source: 'voice_call', session_id: sessionId || null },
          },
        });
        if (error) throw error;
        link =
          data?.event?.meeting_link ||
          data?.event?.location_details?.link ||
          null;
      }
      const title = eventTitle || `Reunião com ${agentName || 'time'}`;
      setConfirmed({ start: pickedSlot.start, end: pickedSlot.end, link, title });
      setStep('done');
      onConfirmed({
        start: pickedSlot.start,
        end: pickedSlot.end,
        link,
        guest_name: guestName,
        guest_email: guestEmail,
        guest_phone: guestPhone,
      });
    } catch (e) {
      setSubmitError((e as Error).message || 'Falha ao agendar');
      setStep('form');
    }
  };

  const downloadIcs = () => {
    if (!confirmed) return;
    const ics = icsFor(
      confirmed.start,
      confirmed.end,
      confirmed.title,
      confirmed.link ? `Link da reunião: ${confirmed.link}` : '',
      confirmed.link || '',
    );
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reuniao.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Swipe-down para fechar (só quando não está confirmando/agendando)
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; dy: number; active: boolean }>({ startY: 0, dy: 0, active: false });
  const canDrag = step === 'days' || step === 'form' || step === 'done';
  const onGrabPointerDown = (e: React.PointerEvent) => {
    if (!canDrag) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, dy: 0, active: true };
  };
  const onGrabPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    dragRef.current.dy = dy;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
      sheetRef.current.style.transition = 'none';
    }
  };
  const onGrabPointerUp = () => {
    if (!dragRef.current.active) return;
    const dy = dragRef.current.dy;
    dragRef.current.active = false;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = '';
    }
    if (dy > 120) onClose();
  };

  const body = (
    <div className="pcbs-root" role="dialog" aria-modal="true">
      <div className="pcbs-veil" onClick={step === 'done' ? onClose : undefined} />
      <div className="pcbs-sheet" ref={sheetRef}>
        <div
          className="pcbs-grab"
          onPointerDown={onGrabPointerDown}
          onPointerMove={onGrabPointerMove}
          onPointerUp={onGrabPointerUp}
          onPointerCancel={onGrabPointerUp}
        />
        <button className="pcbs-close" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>

        {step === 'days' && (
          <>
            <div className="pcbs-title">Escolha um horário</div>
            <div className="pcbs-sub">{agentName ? `Agenda de ${agentName}` : 'Horários disponíveis'}</div>
            <div className="pcbs-body">
              <div className="pcbs-daystrip">
                {days.map((d) => {
                  const sel = isSameDay(d, selectedDate);
                  return (
                    <button
                      key={d.toISOString()}
                      className={`pcbs-daychip ${sel ? 'pcbs-sel' : ''}`}
                      onClick={() => setSelectedDate(d)}
                      type="button"
                    >
                      <div className="pcbs-dw">{format(d, 'EEE', { locale: ptBR })}</div>
                      <div className="pcbs-dn">{format(d, 'd')}</div>
                    </button>
                  );
                })}
              </div>

              {loadingSlots ? (
                <div className="pcbs-loading">
                  <Loader2 className="h-4 w-4 animate-spin" /> carregando horários…
                </div>
              ) : currentSlots.length === 0 ? (
                <div className="pcbs-empty">Sem horários neste dia.</div>
              ) : (
                <div className="pcbs-slotgrid">
                  {currentSlots.map((s) => (
                    <button
                      key={s.start}
                      className="pcbs-slot"
                      onClick={() => handlePickSlot(s)}
                      type="button"
                    >
                      {format(new Date(s.start), 'HH:mm')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {step === 'form' && pickedSlot && (
          <>
            <div className="pcbs-formhead">
              <button
                className="pcbs-back"
                onClick={() => setStep('days')}
                aria-label="Voltar"
                type="button"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="pcbs-title" style={{ textAlign: 'left', flex: 1 }}>
                Seus dados
              </div>
            </div>
            <div className="pcbs-body">
              <div className="pcbs-pickedslot">
                <span className="pcbs-ps-ico">📅</span>
                <span>
                  {format(new Date(pickedSlot.start), "EEE d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                </span>
                <button className="pcbs-ps-chg" onClick={() => setStep('days')} type="button">
                  trocar
                </button>
              </div>

              <div className="pcbs-fld">
                <label>
                  Nome <span aria-hidden>*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como você se chama"
                  maxLength={80}
                  autoFocus
                />
              </div>
              <div className="pcbs-fld">
                <label>
                  WhatsApp <span aria-hidden>*</span>
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(maskBRPhone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  inputMode="tel"
                  maxLength={16}
                />
              </div>
              <div className="pcbs-fld">
                <label>
                  E-mail <small>(opcional)</small>
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  type="email"
                  maxLength={120}
                />
              </div>

              {submitError && <div className="pcbs-error">{submitError}</div>}

              <button
                className="pcbs-cta"
                disabled={!canSubmit}
                onClick={handleConfirm}
                type="button"
              >
                Confirmar reunião
              </button>
              <div className="pcbs-note">
                Você recebe um lembrete no WhatsApp antes da reunião.
              </div>
            </div>
          </>
        )}

        {step === 'confirming' && (
          <div className="pcbs-loading pcbs-big">
            <Loader2 className="h-5 w-5 animate-spin" /> agendando…
          </div>
        )}

        {step === 'done' && confirmed && (
          <>
            <div className="pcbs-doneicon">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <div className="pcbs-title">Reunião confirmada!</div>
            <div className="pcbs-sub">
              {format(new Date(confirmed.start), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
            </div>
            <div className="pcbs-body">
              <button className="pcbs-cta" onClick={downloadIcs} type="button">
                <CalendarPlus className="h-4 w-4" style={{ marginRight: 8 }} /> Adicionar ao calendário
              </button>
              <div className="pcbs-note">Confirmação enviada. Enviamos também um lembrete no WhatsApp.</div>
              <button className="pcbs-secondary" onClick={onClose} type="button">
                Voltar para a ligação
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
