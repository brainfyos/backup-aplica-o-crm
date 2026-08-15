import { Check, Mic, MicOff, PhoneOff } from 'lucide-react';
import { initialsFor, mergeAppearance, type PublicCallAppearance } from '../appearance';
import { DynamicSurface } from '@/components/admin/voice/call/DynamicSurface';
import { TranscriptBubbles } from './TranscriptBubbles';
import type { ToolCallEvent, TranscriptEntry } from '@/hooks/useGrokVoiceCall';

export interface CapturedField {
  key: string;
  label: string;
  value: string;
}

export function InCallView({
  appearance,
  agentName,
  agentRole,
  agentPhoto,
  transcript,
  timerText,
  muted,
  onToggleMute,
  onHangup,
  currentTool,
  toolsMeta,
  outcomes,
  onToolResult,
  onClickLog,
  onOutcome,
  assistantSpeaking,
  capturedFields,
}: {
  appearance?: PublicCallAppearance | null;
  agentName: string;
  agentRole?: string | null;
  agentPhoto?: string | null;
  transcript: TranscriptEntry[];
  timerText: string;
  muted: boolean;
  onToggleMute: () => void;
  onHangup: () => void;
  currentTool: ToolCallEvent | null;
  toolsMeta: any;
  outcomes: Array<{ id: string; label: string; kind: string }>;
  onToolResult: (callId: string, output: unknown) => void;
  onClickLog: (tool: string, payload: Record<string, unknown>) => void;
  onOutcome: (o: { outcome: string; outcome_data: Record<string, unknown> }) => void;
  assistantSpeaking: boolean;
  capturedFields?: CapturedField[];
}) {
  const a = mergeAppearance(appearance);

  return (
    <div className="pc-view pc-on pc-call">
      <div className="pc-call-head">
        <div className="pc-avatar">
          {agentPhoto ? <img src={agentPhoto} alt={agentName} /> : initialsFor(agentName)}
        </div>
        <div className="pc-who">
          <div className="pc-n">{agentName}</div>
          <div className="pc-s">
            <i /> {agentRole || 'em ligação'}
          </div>
        </div>
        {a.show_timer && <div className="pc-timer">{timerText}</div>}
      </div>

      {a.show_waveform && (
        <div className={`pc-wave ${assistantSpeaking ? 'pc-talking' : ''}`}>
          {Array.from({ length: 24 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
      )}

      <div className="pc-transcript">
        <TranscriptBubbles
          transcript={transcript}
          agentName={agentName}
          assistantSpeaking={assistantSpeaking}
        />
        {currentTool && (
          <div className="pc-toolzone">
            <DynamicSurface
              toolCall={currentTool}
              toolsMeta={toolsMeta}
              outcomes={outcomes}
              onResult={onToolResult}
              onClickLog={onClickLog}
              onOutcome={onOutcome}
            />
          </div>
        )}
      </div>

      {capturedFields && capturedFields.length > 0 && (
        <div className="pc-captured-list">
          {capturedFields.map((f) => (
            <div key={f.key} className="pc-captured-chip">
              <Check />
              <span>{f.label}:</span>
              <strong>{f.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="pc-controls">
        <button
          type="button"
          className={`pc-ctl ${muted ? 'pc-active' : ''}`}
          onClick={onToggleMute}
          aria-label={muted ? 'Reativar microfone' : 'Silenciar microfone'}
        >
          {muted ? <MicOff /> : <Mic />}
        </button>
        <button type="button" className="pc-ctl pc-end" onClick={onHangup} aria-label="Encerrar">
          <PhoneOff />
        </button>
      </div>
    </div>
  );
}
