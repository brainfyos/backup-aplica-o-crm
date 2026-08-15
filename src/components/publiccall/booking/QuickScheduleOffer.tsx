import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import './quick-schedule.css';

export type QuickSlot = { start: string; end: string; label?: string };

export interface QuickScheduleOfferProps {
  slots: QuickSlot[];                     // 2-3 chips rápidos que a IA sugeriu por voz
  agentName?: string;
  altAction?: { label: string; hint?: string; kind?: string } | null;
  onPickQuick: (slot: QuickSlot) => void; // clique num chip rápido → sheet no passo `form`
  onOpenSheet: () => void;                // "Ver outros horários" → sheet no passo `days`
  onAlt?: () => void;                     // ex: "Prefiro a proposta no WhatsApp"
}

/**
 * Chips estilo HTML v2 (.dynbtn) — nascem só quando o agente dispara
 * mostrar_agendamento / agendar_reuniao. O clique volta como evento para
 * a IA reagir por voz; nada aqui detecta intenção sozinho.
 */
export function QuickScheduleOffer({
  slots,
  agentName,
  altAction,
  onPickQuick,
  onOpenSheet,
  onAlt,
}: QuickScheduleOfferProps) {
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [gone, setGone] = useState(false);

  const handlePick = (idx: number, s: QuickSlot) => {
    if (gone) return;
    setPickedIdx(idx);
    setGone(true);
    onPickQuick(s);
  };

  const handleOpen = () => {
    if (gone) return;
    setGone(true);
    onOpenSheet();
  };

  const handleAlt = () => {
    if (gone || !onAlt) return;
    setGone(true);
    onAlt();
  };

  const fmtChip = (s: QuickSlot) => {
    if (s.label) return s.label;
    const d = new Date(s.start);
    if (isNaN(d.getTime())) return 'horário';
    return format(d, "EEE · HH:mm", { locale: ptBR });
  };

  return (
    <div className="pc-dynzone">
      <div className="pc-dyntag">
        <i /> {agentName ? `sugestão de ${agentName}` : 'agendamento'}
      </div>

      {slots.slice(0, 3).map((s, i) => (
        <button
          key={s.start + i}
          type="button"
          className={`pc-dynbtn ${pickedIdx === i ? 'pc-dynbtn-picked' : ''} ${gone && pickedIdx !== i ? 'pc-dynbtn-gone' : ''}`}
          onClick={() => handlePick(i, s)}
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          <span className="pc-dynico">📅</span>
          <span className="pc-dynlbl">
            {fmtChip(s)}
            <small>horário real da agenda</small>
          </span>
        </button>
      ))}

      <button
        type="button"
        className={`pc-dynbtn ${gone ? 'pc-dynbtn-gone' : ''}`}
        onClick={handleOpen}
        style={{ animationDelay: `${Math.min(slots.length, 3) * 0.08}s` }}
      >
        <span className="pc-dynico">🗓️</span>
        <span className="pc-dynlbl">
          Ver outros horários
          <small>escolha o dia e a hora que preferir</small>
        </span>
      </button>

      {altAction && onAlt && (
        <button
          type="button"
          className={`pc-dynbtn ${gone ? 'pc-dynbtn-gone' : ''}`}
          onClick={handleAlt}
          style={{ animationDelay: `${(Math.min(slots.length, 3) + 1) * 0.08}s` }}
        >
          <span className="pc-dynico">📄</span>
          <span className="pc-dynlbl">
            {altAction.label}
            {altAction.hint && <small>{altAction.hint}</small>}
          </span>
        </button>
      )}
    </div>
  );
}
