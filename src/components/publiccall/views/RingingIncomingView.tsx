import { Phone, PhoneOff } from 'lucide-react';
import { initialsFor, mergeAppearance, type PublicCallAppearance } from '../appearance';

export function RingingIncomingView({
  appearance,
  agentName,
  agentRole,
  agentPhoto,
  onAccept,
  onReject,
}: {
  appearance?: PublicCallAppearance | null;
  agentName: string;
  agentRole?: string | null;
  agentPhoto?: string | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  const a = mergeAppearance(appearance);
  return (
    <div className="pc-view pc-on pc-incoming">
      <div className="pc-inc-header">
        <div className="pc-inc-label">Chamada recebida</div>
        <div className="pc-inc-name">{agentName}</div>
        {agentRole && <div className="pc-inc-role">{agentRole}</div>}
      </div>

      <div className="pc-inc-avatar">
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

      <div className="pc-inc-actions">
        <button
          type="button"
          className="pc-inc-btn pc-inc-reject"
          onClick={onReject}
          aria-label="Recusar"
        >
          <span className="pc-inc-circle">
            <PhoneOff />
          </span>
          Recusar
        </button>
        <button
          type="button"
          className="pc-inc-btn pc-inc-accept"
          onClick={onAccept}
          aria-label="Atender"
        >
          <span className="pc-inc-circle">
            <Phone />
          </span>
          Atender
        </button>
      </div>
    </div>
  );
}
