// useGrokVoiceCall — cliente WebSocket + WebAudio para Grok Voice Realtime API.
// - Requisita token efêmero via edge function `grok-voice-ephemeral-token`.
// - Abre WebSocket com subprotocolo `xai-client-secret.<token>`.
// - Captura microfone a 24kHz PCM16 e envia via `input_audio_buffer.append`.
// - Recebe áudio PCM16 (base64) e faz scheduling em um AudioContext único.
// - Expõe transcrição incremental, estado da chamada, waveform data e tool calls.
// - Tool calls não são executados aqui — o consumer registra `onToolCall` e devolve
//   o resultado com `sendToolResult(callId, output)`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CallState = 'idle' | 'connecting' | 'ringing' | 'in_call' | 'reconnecting' | 'ended' | 'error';

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  done: boolean;
  ts: number;
}

export interface ToolCallEvent {
  call_id: string;
  name: string;
  args: Record<string, unknown>;
  ts_relative_ms: number;
}

export interface UseGrokVoiceCallOptions {
  voiceAgentId?: string;
  leadId?: string | null;
  publicSlug?: string;
  voiceCallSlug?: string;
  utms?: Record<string, string> | null;
  visitor?: { name?: string; contact?: string } | null;
  onToolCall?: (evt: ToolCallEvent) => void;
  onError?: (err: string) => void;
}

const SAMPLE_RATE = 24000;

function float32ToBase64PCM16(buf: Float32Array): string {
  const pcm16 = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

function base64PCM16ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const out = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) out[i] = pcm16[i] / 32768;
  return out;
}

export function useGrokVoiceCall({ voiceAgentId, leadId, publicSlug, voiceCallSlug, utms, visitor, onToolCall, onError }: UseGrokVoiceCallOptions) {
  const [state, setState] = useState<CallState>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [outcomes, setOutcomes] = useState<Array<{ id: string; label: string; kind: string }>>([]);
  const [toolsMeta, setToolsMeta] = useState<any>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micNodeRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSinkRef = useRef<GainNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const startedAtRef = useRef<number>(0);
  const mutedRef = useRef(false);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const capturedDataRef = useRef<Record<string, unknown>>({});
  const ctasClickedRef = useRef<Array<Record<string, unknown>>>([]);
  // Barge-in: rastrear fontes de áudio da IA em playback + início da resposta atual
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentResponseStartedAtRef = useRef<number>(0);
  const currentAssistantIdRef = useRef<string | null>(null);

  const relMs = () => (startedAtRef.current ? Date.now() - startedAtRef.current : 0);

  const stopAssistantPlayback = useCallback((audioCtx: AudioContext | null) => {
    for (const src of activeSourcesRef.current) {
      try { src.onended = null; src.stop(); } catch {}
      try { src.disconnect(); } catch {}
    }
    activeSourcesRef.current.clear();
    if (audioCtx) nextPlayTimeRef.current = audioCtx.currentTime;
  }, []);

  const cleanup = useCallback(() => {
    stopAssistantPlayback(ctxRef.current);
    try { micNodeRef.current?.disconnect(); } catch {}
    try { micSinkRef.current?.disconnect(); } catch {}
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { wsRef.current?.close(); } catch {}
    try { ctxRef.current?.close(); } catch {}
    micNodeRef.current = null;
    micSinkRef.current = null;
    micStreamRef.current = null;
    wsRef.current = null;
    ctxRef.current = null;
    analyserRef.current = null;
  }, [stopAssistantPlayback]);

  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setTranscript([]);
    setState('connecting');
    try {
      // 1) Pede token + session
      const fnName = voiceCallSlug
        ? 'voice-call-start'
        : publicSlug
        ? 'grok-voice-public-call'
        : 'grok-voice-ephemeral-token';
      const fnBody = voiceCallSlug
        ? { call_slug: voiceCallSlug, visitor: visitor || null, utms: utms || null }
        : publicSlug
        ? { public_slug: publicSlug, visitor: visitor || null }
        : { voice_agent_id: voiceAgentId, lead_id: leadId ?? null };
      const { data, error: fnErr } = await supabase.functions.invoke(fnName, { body: fnBody });
      if (fnErr) throw new Error(fnErr.message);
      if (!data || data.error) throw new Error(data?.error || 'ephemeral failure');
      const { token, call_id, session_id: sess, session, model, outcomes: outs, tools_meta } = data as any;
      setCallId(call_id);
      setSessionId(sess || null);
      setOutcomes(outs || []);
      setToolsMeta(tools_meta || {});

      // 2) Prepara mic (peça antes do WebSocket para falhar cedo)
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: SAMPLE_RATE },
      });
      micStreamRef.current = mediaStream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx: AudioContext = new AudioCtx({ sampleRate: SAMPLE_RATE });
      ctxRef.current = audioCtx;
      nextPlayTimeRef.current = audioCtx.currentTime;

      const source = audioCtx.createMediaStreamSource(mediaStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      micNodeRef.current = processor;
      source.connect(processor);
      // IMPORTANTE: NÃO conectar processor → destination (isso rotearia o mic
      // para os alto-falantes causando eco/duplicação de voz e loop com o Grok).
      // Conectamos a um GainNode mudo apenas para manter o ScriptProcessor vivo.
      const micSink = audioCtx.createGain();
      micSink.gain.value = 0;
      processor.connect(micSink);
      micSink.connect(audioCtx.destination);
      micSinkRef.current = micSink;

      // 3) WebSocket
      const url = `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(model || 'grok-voice-latest')}`;
      const ws = new WebSocket(url, [`xai-client-secret.${token}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        startedAtRef.current = Date.now();
        setState('ringing');
        // Configura sessão
        ws.send(JSON.stringify({ type: 'session.update', session }));
        // Faz a IA falar primeiro (curto cumprimento) — apenas em modo web/inbound
        ws.send(JSON.stringify({ type: 'response.create' }));
      };

      let currentAssistantId: string | null = null;
      let currentUserId: string | null = null;

      ws.onmessage = (msg) => {
        let evt: any;
        try { evt = JSON.parse(typeof msg.data === 'string' ? msg.data : ''); } catch { return; }
        switch (evt.type) {
          case 'session.created':
          case 'session.updated':
            break;
          case 'response.created':
            currentAssistantId = evt.response?.id || `a-${Date.now()}`;
            currentAssistantIdRef.current = currentAssistantId;
            currentResponseStartedAtRef.current = 0; // marca no primeiro delta
            setState('in_call');
            setAssistantSpeaking(true);
            setTranscript((t) => [...t, { id: currentAssistantId!, role: 'assistant', text: '', done: false, ts: Date.now() }]);
            break;
          case 'response.output_audio.delta':
          case 'response.audio.delta': {
            const audioB64 = evt.delta || evt.audio;
            if (!audioB64) break;
            const floats = base64PCM16ToFloat32(audioB64);
            const buffer = audioCtx.createBuffer(1, floats.length, SAMPLE_RATE);
            buffer.getChannelData(0).set(floats);
            const src = audioCtx.createBufferSource();
            src.buffer = buffer;
            src.connect(audioCtx.destination);
            const now = audioCtx.currentTime;
            const startAt = Math.max(now, nextPlayTimeRef.current);
            src.start(startAt);
            nextPlayTimeRef.current = startAt + buffer.duration;
            // Rastreia fontes ativas para barge-in
            activeSourcesRef.current.add(src);
            src.onended = () => {
              activeSourcesRef.current.delete(src);
              try { src.disconnect(); } catch {}
            };
            // Marca início real do áudio (para calcular audio_end_ms no truncate)
            if (currentResponseStartedAtRef.current === 0) {
              currentResponseStartedAtRef.current = startAt;
            }
            break;
          }
          case 'response.output_audio_transcript.delta':
          case 'response.audio_transcript.delta': {
            const delta = evt.delta || '';
            if (!currentAssistantId) currentAssistantId = evt.response_id || `a-${Date.now()}`;
            setTranscript((t) => {
              const idx = t.findIndex((x) => x.id === currentAssistantId);
              if (idx === -1) return [...t, { id: currentAssistantId!, role: 'assistant', text: delta, done: false, ts: Date.now() }];
              const copy = [...t];
              copy[idx] = { ...copy[idx], text: copy[idx].text + delta };
              return copy;
            });
            break;
          }
          case 'response.output_audio_transcript.done':
          case 'response.audio_transcript.done': {
            const finalText = evt.transcript || '';
            setTranscript((t) => t.map((x) => (x.id === currentAssistantId ? { ...x, text: finalText || x.text, done: true } : x)));
            break;
          }
          case 'conversation.item.input_audio_transcription.delta': {
            const delta = evt.delta || '';
            const itemId = evt.item_id;
            if (!itemId) break;
            setTranscript((t) => {
              const idx = t.findIndex((x) => x.id === itemId);
              if (idx === -1) return [...t, { id: itemId, role: 'user', text: delta, done: false, ts: Date.now() }];
              const copy = [...t];
              copy[idx] = { ...copy[idx], text: copy[idx].text + delta };
              return copy;
            });
            currentUserId = itemId;
            break;
          }
          case 'conversation.item.input_audio_transcription.completed': {
            const itemId = evt.item_id;
            const finalText = evt.transcript || '';
            setTranscript((t) => {
              const idx = t.findIndex((x) => x.id === itemId);
              if (idx === -1) return [...t, { id: itemId || `u-${Date.now()}`, role: 'user', text: finalText, done: true, ts: Date.now() }];
              const copy = [...t];
              copy[idx] = { ...copy[idx], text: finalText, done: true };
              return copy;
            });
            break;
          }
          case 'input_audio_buffer.speech_started': {
            // Barge-in real: para todo o áudio da IA, cancela geração e trunca histórico
            const assistantId = currentAssistantIdRef.current;
            const startedAt = currentResponseStartedAtRef.current;
            const playedMs = startedAt > 0
              ? Math.max(0, Math.floor((audioCtx.currentTime - startedAt) * 1000))
              : 0;
            stopAssistantPlayback(audioCtx);
            if (ws.readyState === WebSocket.OPEN) {
              try { ws.send(JSON.stringify({ type: 'response.cancel' })); } catch {}
              if (assistantId && playedMs > 0) {
                try {
                  ws.send(JSON.stringify({
                    type: 'conversation.item.truncate',
                    item_id: assistantId,
                    content_index: 0,
                    audio_end_ms: playedMs,
                  }));
                } catch {}
              }
            }
            setAssistantSpeaking(false);
            break;
          }
          case 'response.done':
            currentResponseStartedAtRef.current = 0;
            setAssistantSpeaking(false);
            break;
          case 'response.function_call_arguments.done': {
            const args = (() => {
              try { return JSON.parse(evt.arguments || '{}'); } catch { return {}; }
            })();
            const payload: ToolCallEvent = {
              call_id: evt.call_id,
              name: evt.name,
              args,
              ts_relative_ms: relMs(),
            };
            // log local em call_tool_events
            if (call_id) {
              void supabase.from('call_tool_events' as any).insert({
                call_id,
                organization_id: null as any,
                tool_name: evt.name,
                direction: 'call',
                args,
                ts_relative_ms: payload.ts_relative_ms,
              } as any).then(() => {}, () => {});
            }
            // Captura dados/CTAs automaticamente para persistir no voice_call_sessions
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
            console.error('[grok voice error]', evt);
            setError(evt.error?.message || 'erro remoto');
            onError?.(evt.error?.message || 'erro remoto');
            break;
          default:
            break;
        }
      };

      ws.onerror = (e) => {
        console.error('[ws error]', e);
        setError('Erro na conexão com xAI');
        onError?.('WebSocket erro');
      };

      ws.onclose = () => {
        // Fecha registro no banco se ainda estiver aberto
        if (call_id) {
          const duration = Math.floor((Date.now() - startedAtRef.current) / 1000);
          void supabase
            .from('call_logs' as any)
            .update({
              status: 'completed',
              ended_at: new Date().toISOString(),
              duration_sec: duration,
            })
            .eq('id', call_id)
            .in('status', ['initiated', 'ringing', 'in_call'] as any)
            .then(() => {}, () => {});
        }
        cleanup();
        setState((prev) => (prev === 'ended' ? prev : 'ended'));
      };

      // Mic → WebSocket
      processor.onaudioprocess = (e) => {
        if (mutedRef.current) return;
        if (ws.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const b64 = float32ToBase64PCM16(input);
        ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'falha ao iniciar ligação';
      setError(msg);
      onError?.(msg);
      setState('error');
      cleanup();
    }
  }, [voiceAgentId, leadId, onToolCall, onError, cleanup]);

  const sendToolResult = useCallback(
    (toolCallId: string, output: unknown) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output ?? {});
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: toolCallId, output: outputStr },
        }),
      );
      ws.send(JSON.stringify({ type: 'response.create' }));
      if (callId) {
        void supabase.from('call_tool_events' as any).insert({
          call_id: callId,
          organization_id: null as any,
          tool_name: toolCallId,
          direction: 'result',
          result: typeof output === 'object' ? (output as any) : { value: output },
          ts_relative_ms: relMs(),
        } as any).then(() => {}, () => {});
      }
    },
    [callId],
  );

  const logClick = useCallback(
    (tool: string, payload: Record<string, unknown>) => {
      if (!callId) return;
      void supabase.from('call_tool_events' as any).insert({
        call_id: callId,
        organization_id: null as any,
        tool_name: tool,
        direction: 'click',
        args: payload,
        ts_relative_ms: relMs(),
      } as any).then(() => {}, () => {});
    },
    [callId],
  );

  const sendUserText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    }));
    ws.send(JSON.stringify({ type: 'response.create' }));
  }, []);

  const hangup = useCallback(async (outcomePayload?: { outcome?: string; outcome_data?: Record<string, unknown> }) => {
    const finalOutcome = outcomePayload?.outcome || null;
    const duration = Math.floor((Date.now() - startedAtRef.current) / 1000);
    if (callId) {
      await supabase
        .from('call_logs' as any)
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          duration_sec: duration,
          outcome: finalOutcome ?? 'sem_desfecho',
          outcome_data: outcomePayload?.outcome_data ?? {},
        })
        .eq('id', callId);
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
    state,
    error,
    callId,
    sessionId,
    transcript,
    outcomes,
    toolsMeta,
    muted,
    setMuted,
    assistantSpeaking,
    start,
    hangup,
    sendToolResult,
    sendUserText,
    logClick,
    getAnalyser,
  };
}
