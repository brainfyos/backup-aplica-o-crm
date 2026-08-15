import { PhoneCall, PhoneIncoming } from 'lucide-react';
import { initialsFor, mergeAppearance, type PublicCallAppearance } from '../appearance';

export function LandingView({
  appearance,
  agentName,
  agentRole,
  agentPhoto,
  headline,
  subheadline,
  ctaLabel,
  onStart,
  onIncoming,
  disabled,
}: {
  appearance?: PublicCallAppearance | null;
  agentName: string;
  agentRole?: string | null;
  agentPhoto?: string | null;
  headline: string;
  subheadline: string;
  ctaLabel: string;
  onStart: () => void;
  onIncoming?: () => void;
  disabled?: boolean;
}) {
  const a = mergeAppearance(appearance);
  const showIncoming = a.enable_incoming_mode && !!onIncoming;
  return (
    <div className="pc-view pc-on pc-landing">
      <div className="pc-agent-hero">
        <div className="pc-ring" />
        <div className="pc-avatar">
          {agentPhoto ? <img src={agentPhoto} alt={agentName} /> : initialsFor(agentName)}
        </div>
      </div>
      <h2>{headline || agentName}</h2>
      {agentRole && <div className="pc-role">{agentRole}</div>}
      <p className="pc-pitch">{subheadline}</p>
      <button type="button" className="pc-cta" onClick={onStart} disabled={disabled}>
        <PhoneCall />
        {ctaLabel || 'Falar agora'}
      </button>
      {showIncoming && (
        <button type="button" className="pc-cta-secondary" onClick={onIncoming} disabled={disabled}>
          <PhoneIncoming />
          {a.incoming_button_label || 'Atender ligação'}
        </button>
      )}
      {a.micro_below_cta && <div className="pc-micro">{a.micro_below_cta}</div>}
    </div>
  );
}

