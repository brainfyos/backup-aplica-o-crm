import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { initialsFor, mergeAppearance, type PublicCallAppearance } from '../appearance';
import { Check } from 'lucide-react';
import type { OutcomeContext, OutcomeKind } from '@/components/admin/voice/call/OutcomeScreen';

function buildIcs({
  title,
  start,
  end,
  description,
  location,
}: {
  title: string;
  start: string;
  end?: string;
  description?: string;
  location?: string;
}) {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date(s.getTime() + 30 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Vendus//Call//PT-BR',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@vendus.call`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(s)}`,
    `DTEND:${fmt(e)}`,
    `SUMMARY:${title.replace(/\n/g, ' ')}`,
    description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : '',
    location ? `LOCATION:${location}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DoneView({
  appearance,
  outcomeKind,
  outcomeLabel,
  context,
  agentName,
  agentPhoto,
  onPlayAgain,
}: {
  appearance?: PublicCallAppearance | null;
  outcomeKind?: OutcomeKind | string;
  outcomeLabel?: string | null;
  context: OutcomeContext;
  agentName: string;
  agentPhoto?: string | null;
  onPlayAgain?: () => void;
}) {
  const a = mergeAppearance(appearance);
  const agendamento = context.agendamento;
  const hasBooking = outcomeKind === 'agendou_reuniao' && agendamento?.start;

  let month = '';
  let day = '';
  let title = 'Reunião com Vendus';
  let subtitle = '';
  if (hasBooking && agendamento?.start) {
    const d = new Date(agendamento.start);
    month = format(d, 'MMM', { locale: ptBR }).toUpperCase().replace('.', '');
    day = format(d, 'dd');
    title = `Reunião com ${agentName}`;
    subtitle = format(d, "EEEE, d 'de' MMMM · HH:mm", { locale: ptBR });
  }

  const handleAddCalendar = () => {
    if (!hasBooking || !agendamento?.start) return;
    const ics = buildIcs({
      title,
      start: agendamento.start,
      end: agendamento.end,
      description: `Ligação Vendus com ${agentName}${agendamento.link ? `\n\nLink: ${agendamento.link}` : ''}`,
      location: agendamento.link || undefined,
    });
    downloadIcs('vendus-reuniao.ics', ics);
  };

  return (
    <div className="pc-view pc-on pc-done">
      <div className="pc-check">
        <Check strokeWidth={3} />
      </div>
      <h2>{outcomeLabel || a.done_title}</h2>
      <p className="pc-sub">{a.done_subtitle}</p>

      {hasBooking && (
        <div className="pc-book-card">
          <div className="pc-bc-top">
            <div className="pc-cal">
              <div className="pc-m">{month}</div>
              <div className="pc-d">{day}</div>
            </div>
            <div>
              <div className="pc-bt">{title}</div>
              <div className="pc-bs">{subtitle}</div>
            </div>
          </div>
          <div className="pc-bwho">
            <div className="pc-mini">
              {agentPhoto ? <img src={agentPhoto} alt={agentName} /> : initialsFor(agentName)}
            </div>
            <span>Agendado durante a ligação, por {agentName}</span>
          </div>
          <button type="button" className="pc-done-cta" onClick={handleAddCalendar}>
            {a.add_to_calendar_label}
          </button>
        </div>
      )}

      {onPlayAgain && (
        <div className="pc-done-sub">
          <button
            type="button"
            onClick={onPlayAgain}
            style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
          >
            {a.play_again_label}
          </button>
        </div>
      )}

      <div className="pc-outcome-tag">
        <i />
        desfecho registrado: {outcomeKind || 'sem_desfecho'}
      </div>
    </div>
  );
}
