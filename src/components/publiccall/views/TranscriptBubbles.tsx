import { useEffect, useMemo, useRef } from 'react';
import type { TranscriptEntry } from '@/hooks/useGrokVoiceCall';

interface Props {
  transcript: TranscriptEntry[];
  agentName: string;
  assistantSpeaking: boolean;
}

// Split agent text into WhatsApp-style bubbles (max ~2 short sentences per bubble)
function splitIntoBubbles(text: string): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];
  // Prefer paragraph splits
  const paragraphs = clean.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const bubbles: string[] = [];
  for (const p of paragraphs) {
    // Split by sentence, group in pairs
    const sentences = p.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [p];
    if (sentences.length <= 2) {
      bubbles.push(sentences.join(' '));
    } else {
      for (let i = 0; i < sentences.length; i += 2) {
        bubbles.push(sentences.slice(i, i + 2).join(' '));
      }
    }
  }
  return bubbles;
}

export function TranscriptBubbles({ transcript, agentName, assistantSpeaking }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [transcript, assistantSpeaking]);

  const bubbles = useMemo(() => {
    type Bubble = { id: string; role: 'user' | 'assistant'; text: string; done: boolean };
    const out: Bubble[] = [];
    for (const t of transcript) {
      const txt = (t.text || '').trim();
      if (!txt) continue;
      if (t.role === 'user') {
        out.push({ id: t.id, role: 'user', text: txt, done: t.done });
      } else {
        splitIntoBubbles(txt).forEach((chunk, i) => {
          out.push({ id: `${t.id}-${i}`, role: 'assistant', text: chunk, done: t.done });
        });
      }
    }
    return out;
  }, [transcript]);

  return (
    <div ref={scrollRef} className="tb-scroll">
      {bubbles.map((b) => (
        <div key={b.id} className={`tb-row ${b.role === 'user' ? 'tb-me' : 'tb-them'}`}>
          {b.role === 'assistant' && <div className="tb-name">{agentName}</div>}
          <div className={`tb-bubble ${b.role === 'user' ? 'tb-bubble-me' : 'tb-bubble-them'}`}>
            {b.text}
          </div>
        </div>
      ))}
      {assistantSpeaking && (
        <div className="tb-row tb-them">
          <div className="tb-name">{agentName}</div>
          <div className="tb-bubble tb-bubble-them tb-typing">
            <span /><span /><span />
          </div>
        </div>
      )}
    </div>
  );
}
