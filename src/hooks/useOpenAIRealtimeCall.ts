// useOpenAIRealtimeCall — WebRTC client for OpenAI Realtime (gpt-realtime-2.1).
// Same public API as useGrokVoiceCall so PublicCall can swap between them based on
// the provider returned by voice-call-start.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  CallState,
  TranscriptEntry,
  ToolCallEvent,
  UseGrokVoiceCallOptions,
} from './useGrokVoiceCall';

export function useOpenAIRealtimeCall({
  voiceCallSlug,
  publicSlug,
  voiceAgentId,
  leadId,
  utms,
  visitor,
  onToolCall,
  onError,
}: UseGrokVoiceCallOptions) {
  const [state, setState] = useState<CallState>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [outcomes, setOutcomes] = useState<Array<{ id: string; label: string; kind: string }>>([]);
  const [toolsMeta, setToolsMeta] = useState<any>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef<number>(0);
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  const capturedDataRef = useRef<Record<string, unknown>>({});
  const ctasClickedRef = useRef<Array<Record<string, unknown>>>([]);
  const currentAssistantIdRef = useRef<string | null>(null);
  const initialResponseSentRef = useRef(false);

  const relMs = () => (startedAtRef.current ? Date.now() - startedAtRef.current : 0);

  const cleanup = useCallback(() => {
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { audioElRef.current?.pause(); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
    dcRef.current = null;
    pcRef.current = null;
    micStreamRef.current = null;
    audioElRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setState('connecting');
    try {
      const fnName = voiceCallSlug ? 'voice-call-start' : publicSlug ? 'grok-voice-public-call' : 'grok-voice-ephemeral-token';
      const fnBody = voiceCallSlug
        ? { call_slug: voiceCallSlug, visitor: visitor || null, utms: utms || null }
        : publicSlug
        ? { public_slug: publicSlug, visitor: visitor || null }
        : { voice_agent_id: voiceAgentId, lead_id: leadId ?? null };
      const { data, error: fnErr } = await supabase.functions.invoke(fnName, { body: fnBody });
      if (fnErr) throw new Error(fnErr.message);
      if (!data || data.error) throw new Error(data?.error || 'ephemeral failure');
      const { token, call_id, session_id: sess, session, outcomes: outs, tools_meta, provider } = data as any;

      if (provider && provider !== 'openai') {
        throw new Error(`Provider retornado (${provider}) não é OpenAI — use useGrokVoiceCall.`);
      }

      setCallId(call_id);
      setSessionId(sess || null);
      setOutcomes(outs || []);
      setToolsMeta(tools_meta || {});
      initialResponseSentRef.current = false;

      // 1) mic
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = mediaStream;

      // 2) peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      mediaStream.getAudioTracks().forEach((track) => pc.addTrack(track, mediaStream));

      // 3) remote audio → <audio>
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      pc.ontrack = (e) => {
        if (e.streams[0]) {
          audioEl.srcObject = e.streams[0];
          setState('in_call');
          setAssistantSpeaking(true);
          // Analyser para waveform
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            const ac = new AudioCtx();
            audioCtxRef.current = ac;
            const src = ac.createMediaStreamSource(e.streams[0]);
            const analyser = ac.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            analyserRef.current = analyser;
          } catch {}
        }
      };

      // 4) data channel para eventos
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      const requestInitialResponse = () => {
        if (initialResponseSentRef.current || dc.readyState !== 'open') return;
        initialResponseSentRef.current = true;
        try {
          dc.send(JSON.stringify({
            type: 'response.create',
            response: { output_modalities: ['audio'] },
          }));
        } catch {}
      };

      dc.onopen = () => {
        startedAtRef.current = Date.now();
        setState('ringing');
        // Envia session.update caso servidor não tenha aplicado
        try {
          dc.send(JSON.stringify({
            type: 'session.update',
            session,
          }));
        } catch {}
        // Trigger primeira fala depois que a sessão for aceita; fallback curto caso o evento atrase.
        window.setTimeout(requestInitialResponse, 700);
      };

      dc.onmessage = (msg) => {
        let evt: any;
        try { evt = JSON.parse(typeof msg.data === 'string' ? msg.data : ''); } catch { return; }
        switch (evt.type) {
          case 'session.created':
          case 'session.updated':
            requestInitialResponse();
            break;
          case 'response.created':
            currentAssistantIdRef.current = evt.response?.id || `a-${Date.now()}`;
            setState('in_call');
            setAssistantSpeaking(true);
            setTranscript((t) => [...t, { id: currentAssistantIdRef.current!, role: 'assistant', text: '', done: false, ts: Date.now() }]);
            break;
          case 'response.output_audio.delta':
          case 'response.audio.delta':
            setState('in_call');
            setAssistantSpeaking(true);
            break;
          case 'response.audio_transcript.delta':
          case 'response.output_audio_transcript.delta': {
            const delta = evt.delta || '';
            const id = currentAssistantIdRef.current!;
            setTranscript((t) => {
              const idx = t.findIndex((x) => x.id === id);
              if (idx === -1) return [...t, { id, role: 'assistant', text: delta, done: false, ts: Date.now() }];
              const c = [...t]; c[idx] = { ...c[idx], text: c[idx].text + delta }; return c;
            });
            break;
          }
          case 'response.audio_transcript.done':
          case 'response.output_audio_transcript.done': {
            const finalText = evt.transcript || '';
            const id = currentAssistantIdRef.current!;
            setTranscript((t) => t.map((x) => (x.id === id ? { ...x, text: finalText || x.text, done: true } : x)));
            break;
          }
          case 'conversation.item.input_audio_transcription.delta': {
            const delta = evt.delta || '';
            const itemId = evt.item_id;
            if (!itemId) break;
            setTranscript((t) => {
              const idx = t.findIndex((x) => x.id === itemId);
              if (idx === -1) return [...t, { id: itemId, role: 'user', text: delta, done: false, ts: Date.now() }];
              const c = [...t]; c[idx] = { ...c[idx], text: c[idx].text + delta }; return c;
            });
            break;
          }
          case 'conversation.item.input_audio_transcription.completed': {
            const itemId = evt.item_id;
            const finalText = evt.transcript || '';
            setTranscript((t) => {
              const idx = t.findIndex((x) => x.id === itemId);
              if (idx === -1) return [...t, { id: itemId || `u-${Date.now()}`, role: 'user', text: finalText, done: true, ts: Date.now() }];
              const c = [...t]; c[idx] = { ...c[idx], text: finalText, done: true }; return c;
            });
            break;
          }
          case 'response.done':
          case 'output_audio_buffer.stopped':
            setAssistantSpeaking(false);
            break;
          case 'response.function_call_arguments.done': {
            const args = (() => { try { return JSON.parse(evt.arguments || '{}'); } catch { return {}; } })();
            const payload: ToolCallEvent = {
              call_id: evt.call_id,
              name: evt.name,
              args,
              ts_relative_ms: relMs(),
            };
            if (call_id) {
              void supabase.from('call_tool_events' as any).insert({
                call_id, organization_id: null as any, tool_name: evt.name,
                direction: 'call', args, ts_relative_ms: payload.ts_relative_ms,
              } as any).then(() => {}, () => {});
            }
            if (evt.name === 'salvar_dado_lead' && args?.chave) {
              capturedDataRef.current[String(args.chave)] = args.valor;
            } else if (typeof evt.name === 'string' && evt.name.startsWith('salvar_')) {
              capturedDataRef.current[evt.name.replace(/^salvar_/, '')] = args?.valor ?? args;
            } else if (['abrir_link', 'agendar_reuniao', 'confirmar_agendamento_reuniao', 'enviar_whatsapp', 'aplicar_tag_interesse'].includes(evt.name)) {
              ctasClickedRef.current.push({ tool: evt.name, args, at: new Date().toISOString() });
            }
            onToolCall?.(payload);
            break;
          }
          case 'error':
            console.error('[openai realtime error]', evt);
            setError(evt.error?.message || 'erro remoto');
            onError?.(evt.error?.message || 'erro remoto');
            break;
        }
      };

      // Toggle mic based on muted flag
      const track = mediaStream.getAudioTracks()[0];
      const applyMute = () => { if (track) track.enabled = !mutedRef.current; };
      applyMute();
      const muteWatcher = setInterval(applyMute, 300);
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'connected') {
          setState('in_call');
        }
        if (['closed', 'failed', 'disconnected'].includes(pc.connectionState)) {
          clearInterval(muteWatcher);
        }
      });

      // 5) SDP offer / answer via OpenAI Realtime endpoint
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResp = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });
      if (!sdpResp.ok) {
        const err = await sdpResp.text();
        throw new Error(`OpenAI SDP negotiation failed: ${sdpResp.status} ${err.slice(0, 200)}`);
      }
      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'falha ao iniciar ligação';
      setError(msg);
      onError?.(msg);
      setState('error');
      cleanup();
    }
  }, [voiceCallSlug, publicSlug, voiceAgentId, leadId, utms, visitor, onToolCall, onError, cleanup]);

  const sendToolResult = useCallback((toolCallId: string, output: unknown) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? {});
    dc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: toolCallId, output: outputStr },
    }));
    dc.send(JSON.stringify({ type: 'response.create' }));
    if (callId) {
      void supabase.from('call_tool_events' as any).insert({
        call_id: callId, organization_id: null as any, tool_name: toolCallId,
        direction: 'result', result: typeof output === 'object' ? (output as any) : { value: output },
        ts_relative_ms: relMs(),
      } as any).then(() => {}, () => {});
    }
  }, [callId]);

  const logClick = useCallback((tool: string, payload: Record<string, unknown>) => {
    if (!callId) return;
    void supabase.from('call_tool_events' as any).insert({
      call_id: callId, organization_id: null as any, tool_name: tool,
      direction: 'click', args: payload, ts_relative_ms: relMs(),
    } as any).then(() => {}, () => {});
  }, [callId]);

  const sendUserText = useCallback((text: string) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    }));
    dc.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  const hangup = useCallback(async (outcomePayload?: { outcome?: string; outcome_data?: Record<string, unknown> }) => {
    const finalOutcome = outcomePayload?.outcome || null;
    const duration = Math.floor((Date.now() - startedAtRef.current) / 1000);
    if (callId) {
      await supabase.from('call_logs' as any).update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        duration_sec: duration,
        outcome: finalOutcome ?? 'sem_desfecho',
        outcome_data: outcomePayload?.outcome_data ?? {},
      }).eq('id', callId);
    }
    if (sessionId) {
      try {
        await supabase.functions.invoke('voice-call-end', {
          body: {
            session_id: sessionId,
            transcript: transcriptRef.current.map((t) => ({ role: t.role, text: t.text, at: t.ts })),
            captured_data: capturedDataRef.current,
            ctas_clicked: ctasClickedRef.current,
            duration_sec: duration,
            outcome: finalOutcome ?? 'sem_desfecho',
            outcome_data: outcomePayload?.outcome_data ?? {},
          },
        });
      } catch (e) { console.warn('[voice-call-end] failed', e); }
    }
    cleanup();
    setState('ended');
  }, [callId, sessionId, cleanup]);

  const getAnalyser = useCallback(() => analyserRef.current, []);

  return {
    state, error, callId, sessionId, transcript, outcomes, toolsMeta,
    muted, setMuted, assistantSpeaking,
    start, hangup, sendToolResult, sendUserText, logClick, getAnalyser,
  };
}
