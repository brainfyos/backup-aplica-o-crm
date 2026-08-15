import { PhoneOff } from 'lucide-react';
import { initialsFor, mergeAppearance, type PublicCallAppearance } from '../appearance';

export function RingingView({
  appearance,
  agentName,
  agentPhoto,
  onHangup,
}: {
  appearance?: PublicCallAppearance | null;
  agentName: string;
  agentPhoto?: string | null;
  onHangup: () => void;
}) {
  const a = mergeAppearance(appearance);
  return (
    <div className="pc-view pc-on pc-ringing">
      <div className="pc-ring-wrap">
        {a.show_ripples && (
          <>
            <span className="pc-ripple" />
            <span className="pc-ripple" />
            <span className="pc-ripple" />
          </>
        )}
        <div className="pc-avatar">
          {agentPhoto ? <img src={agentPhoto} alt={agentName} /> : initialsFor(agentName)}
        </div>
      </div>
      <h2>{agentName}</h2>
      <div className="pc-st">{a.ringing_status}<span className="pc-dots">…</span></div>
      <button type="button" className="pc-hang" onClick={onHangup} aria-label="Encerrar">
        <PhoneOff />
      </button>
    </div>
  );
}
