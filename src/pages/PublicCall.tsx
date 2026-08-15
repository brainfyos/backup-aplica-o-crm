import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGrokVoiceCall, type ToolCallEvent } from '@/hooks/useGrokVoiceCall';
import { useOpenAIRealtimeCall } from '@/hooks/useOpenAIRealtimeCall';
import { PhoneFrame } from '@/components/publiccall/PhoneFrame';
import { LandingView } from '@/components/publiccall/views/LandingView';
import { RingingView } from '@/components/publiccall/views/RingingView';
import { RingingIncomingView } from '@/components/publiccall/views/RingingIncomingView';
import { InCallView, type CapturedField } from '@/components/publiccall/views/InCallView';
import { DoneView } from '@/components/publiccall/views/DoneView';
import { appearanceCssVars, type PublicCallAppearance, type DeviceTheme } from '@/components/publiccall/appearance';
import type { OutcomeContext, OutcomeKind } from '@/components/admin/voice/call/OutcomeScreen';
import { ensureTrackers, trackCallEvent } from '@/lib/publicCallTracking';

interface PublicInfo {
  kind?: 'voice_agent' | 'voice_call';
  slug: string;
  agent_name: string;
  agent_role: string | null;
  agent_photo: string | null;
  theme: DeviceTheme;
  appearance: PublicCallAppearance;
  org_name: string | null;
  org_logo: string | null;
  headline: string;
  subheadline: string;
  cta_label: string;
  require_name: boolean;
  require_contact: boolean;
  post_redirect_url: string | null;
  capture_fields?: Array<{ key: string; label: string; type: string; required?: boolean }>;
  ctas?: Array<{ id: string; kind: string; label: string; url?: string }>;
  tracking?: { meta_pixel_id?: string | null; ga4_id?: string | null } | null;
  voice_provider?: 'grok' | 'openai' | 'auto';
}

function fmtTimer(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function PublicCall() {
  const { slug } = useParams<{ slug: string }>();
  const isMobile = useIsMobile();
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState<ToolCallEvent | null>(null);
  const [finalOutcome, setFinalOutcome] = useState<{ label: string; kind: OutcomeKind | string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [incoming, setIncoming] = useState(false); // "atender ligação" fake ringer
  const [capturedFields, setCapturedFields] = useState<CapturedField[]>([]);

  const startedAtRef = useRef(0);
  const contextRef = useRef<OutcomeContext>({});

  // UTMs capturados da URL
  const utms = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => {
      const v = p.get(k);
      if (v) out[k] = v;
    });
    return out;
  }, []);

  const isCallCampaign = info?.kind === 'voice_call';
  const useOpenAI = (info?.voice_provider === 'openai' || info?.voice_provider === 'auto');

  const captureFieldMeta = useMemo(() => {
    const list = info?.capture_fields || [];
    const map = new Map<string, string>();
    for (const f of list) map.set(f.key, f.label);
    return map;
  }, [info?.capture_fields]);

  const onToolCallHandler = (evt: ToolCallEvent) => {
    setCurrentTool(evt);
    // captura campos salvos pela IA — vira chip visível
    try {
      if (evt?.name === 'salvar_dado_lead' && evt.args?.chave) {
        const key = String(evt.args.chave);
        const value = String(evt.args.valor ?? '');
        setCapturedFields((prev) => {
          const label = captureFieldMeta.get(key) || key;
          const filtered = prev.filter((x) => x.key !== key);
          return [...filtered, { key, label, value }];
        });
      } else if (typeof evt?.name === 'string' && evt.name.startsWith('salvar_')) {
        const key = evt.name.replace(/^salvar_/, '');
        const value = String(evt.args?.valor ?? '');
        setCapturedFields((prev) => {
          const label = captureFieldMeta.get(key) || key;
          const filtered = prev.filter((x) => x.key !== key);
          return [...filtered, { key, label, value }];
        });
      }
    } catch { /* noop */ }
  };

  const hookOpts = {
    voiceCallSlug: isCallCampaign ? slug : undefined,
    publicSlug: !isCallCampaign ? slug : undefined,
    utms,
    onToolCall: onToolCallHandler,
    onError: (m: string) => toast.error(m),
  };
  const grokCall = useGrokVoiceCall(hookOpts);
  const openaiCall = useOpenAIRealtimeCall(hookOpts);
  const call = useOpenAI ? openaiCall : grokCall;

  // Carrega info pública
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        // visitor_id persistente por navegador (dedupe de views)
        let visitor_id: string | null = null;
        try {
          visitor_id = localStorage.getItem('vc_visitor_id');
          if (!visitor_id) {
            visitor_id = (crypto as any).randomUUID?.() || `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            localStorage.setItem('vc_visitor_id', visitor_id);
          }
        } catch { /* SSR / privacy */ }
        const referrer = typeof document !== 'undefined' ? document.referrer || null : null;

        const asCall = await supabase.functions.invoke('voice-call-public-info', {
          body: { slug, visitor_id, utms, referrer },
        });
        if (!asCall.error && asCall.data && !asCall.data.error) {
          setInfo(asCall.data as PublicInfo);
          setLoading(false);
          return;
        }
        const asAgent = await supabase.functions.invoke('voice-agent-public-info', { body: { slug } });
        if (asAgent.error || !asAgent.data || asAgent.data.error) {
          throw new Error(asAgent.data?.message || asAgent.data?.error || asAgent.error?.message || 'não encontrado');
        }
        setInfo({ ...asAgent.data, kind: 'voice_agent' } as PublicInfo);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, utms]);


  useEffect(() => {
    if (!info) return;
    ensureTrackers(info.tracking || null);
    void trackCallEvent({
      event: 'PageView',
      session_id: call.sessionId || null,
      params: { call_slug: info.slug, campaign: info.headline, ...utms },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.slug]);

  useEffect(() => {
    if (!info || !call.sessionId) return;
    void trackCallEvent({
      event: 'InitiateCheckout',
      session_id: call.sessionId,
      params: { call_slug: info.slug, ...utms },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.sessionId]);

  useEffect(() => {
    if (call.state !== 'in_call') return;
    if (!startedAtRef.current) startedAtRef.current = Date.now();
    contextRef.current.agentName = info?.agent_name;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [call.state, info?.agent_name]);

  const start = () => {
    setIncoming(false);
    setFinalOutcome(null);
    setCurrentTool(null);
    setCapturedFields([]);
    setElapsed(0);
    startedAtRef.current = 0;
    contextRef.current = { agentName: info?.agent_name };
    void call.start();
  };

  const handleHangup = async () => {
    contextRef.current.durationSec = elapsed;
    await call.hangup(finalOutcome ? { outcome: finalOutcome.kind, outcome_data: {} } : undefined);
  };

  const handleClickLog = (tool: string, payload: Record<string, unknown>) => {
    call.logClick(tool, payload);
    if (tool === 'agendar_reuniao' && payload.start) {
      contextRef.current.agendamento = {
        start: payload.start as string,
        end: (payload.end as string) || undefined,
        link: (payload.link as string) || null,
      };
      void trackCallEvent({
        event: 'Schedule',
        session_id: call.sessionId || null,
        params: { call_slug: info?.slug, start: payload.start, end: payload.end, ...utms },
      });
    }
    if (tool === 'enviar_proposta' && payload.url) {
      contextRef.current.proposta = {
        label: (payload.label as string) || 'Proposta',
        url: payload.url as string,
      };
    }
    if (tool === 'transferir_humano') {
      contextRef.current.transferencia = { setor: (payload.setor as string) || null };
    }
    if (tool.startsWith('salvar_') || tool === 'salvar_dado_lead') {
      void trackCallEvent({
        event: 'Lead',
        session_id: call.sessionId || null,
        params: { call_slug: info?.slug, tool, ...utms },
      });
    } else if (tool === 'aplicar_tag_interesse') {
      void trackCallEvent({
        event: 'Lead',
        session_id: call.sessionId || null,
        params: { call_slug: info?.slug, tool, cta_id: payload.cta_id, ...utms },
      });
    } else if (tool === 'abrir_link' || tool === 'enviar_whatsapp') {
      void trackCallEvent({
        event: 'CTA_Clicked',
        session_id: call.sessionId || null,
        params: { call_slug: info?.slug, tool, ...payload, ...utms },
      });
    }
  };

  const handleOutcome = (o: { outcome: string; outcome_data: Record<string, unknown> }) => {
    const found = call.outcomes.find((x) => x.kind === o.outcome);
    const picked = found
      ? { label: found.label, kind: found.kind }
      : { label: 'Desfecho registrado', kind: o.outcome };
    setFinalOutcome(picked);
    contextRef.current.durationSec = elapsed;
    void trackCallEvent({
      event: 'Call_Outcome',
      session_id: call.sessionId || null,
      params: { call_slug: info?.slug, outcome: picked.kind, duration_sec: elapsed, ...utms },
    });
    void call.hangup({ outcome: picked.kind, outcome_data: o.outcome_data });
  };

  const view = useMemo<'landing' | 'incoming' | 'ringing' | 'in_call' | 'done'>(() => {
    if (call.state === 'idle' || call.state === 'error') return incoming ? 'incoming' : 'landing';
    if (call.state === 'connecting' || call.state === 'ringing') return 'ringing';
    if (call.state === 'in_call') return 'in_call';
    return 'done';
  }, [call.state, incoming]);

  useEffect(() => {
    if (view === 'done' && info?.post_redirect_url) {
      const t = setTimeout(() => {
        window.location.href = info.post_redirect_url!;
      }, 8000);
      return () => clearTimeout(t);
    }
  }, [view, info?.post_redirect_url]);

  useEffect(() => {
    const handler = () => {
      const sid = call.sessionId;
      if (!sid) return;
      if (call.state !== 'ringing' && call.state !== 'in_call' && call.state !== 'connecting') return;
      try {
        const url = `${(import.meta as any).env.VITE_SUPABASE_URL}/functions/v1/voice-call-end`;
        const payload = JSON.stringify({
          session_id: sid,
          duration_sec: elapsed,
          outcome: 'abandoned',
          outcome_data: { reason: 'page_unload' },
        });
        const blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) return;
        void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true });
      } catch { /* noop */ }
    };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, [call.sessionId, call.state, elapsed]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0D13]">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0D13] p-6 text-center">
        <div className="text-white">
          <h1 className="text-xl font-semibold mb-2">Página indisponível</h1>
          <p className="text-sm text-white/60">{error || 'Este link de ligação não está ativo.'}</p>
        </div>
      </div>
    );
  }

  const pageStyle: React.CSSProperties = {
    background: `
      radial-gradient(700px 500px at 50% 20%, color-mix(in srgb, ${info.appearance?.accent_color || '#8B5CF6'} 20%, transparent), transparent 60%),
      radial-gradient(600px 400px at 80% 90%, color-mix(in srgb, ${info.appearance?.cta_color || '#4ADE80'} 8%, transparent), transparent 60%),
      ${info.appearance?.bg_color || '#0A0D13'}
    `,
  };

  const renderView = () => {
    if (view === 'landing') {
      return (
        <LandingView
          appearance={info.appearance}
          agentName={info.agent_name}
          agentRole={info.agent_role}
          agentPhoto={info.agent_photo}
          headline={info.agent_name}
          subheadline={info.subheadline}
          ctaLabel={info.cta_label}
          onStart={start}
          onIncoming={() => setIncoming(true)}
        />
      );
    }
    if (view === 'incoming') {
      return (
        <RingingIncomingView
          appearance={info.appearance}
          agentName={info.agent_name}
          agentRole={info.agent_role}
          agentPhoto={info.agent_photo}
          onAccept={start}
          onReject={() => setIncoming(false)}
        />
      );
    }
    if (view === 'ringing') {
      return (
        <RingingView
          appearance={info.appearance}
          agentName={info.agent_name}
          agentPhoto={info.agent_photo}
          onHangup={handleHangup}
        />
      );
    }
    if (view === 'in_call') {
      return (
        <InCallView
          appearance={info.appearance}
          agentName={info.agent_name}
          agentRole={info.agent_role}
          agentPhoto={info.agent_photo}
          transcript={call.transcript}
          timerText={fmtTimer(elapsed)}
          muted={call.muted}
          onToggleMute={() => call.setMuted(!call.muted)}
          onHangup={handleHangup}
          currentTool={currentTool}
          toolsMeta={{ ...(call.toolsMeta || {}), __session_id: call.sessionId, __visitor: contextRef.current, __agent_name: info.agent_name }}
          outcomes={call.outcomes}
          onToolResult={call.sendToolResult}
          onClickLog={handleClickLog}
          onOutcome={handleOutcome}
          assistantSpeaking={call.assistantSpeaking}
          capturedFields={capturedFields}
        />
      );
    }
    return (
      <DoneView
        appearance={info.appearance}
        outcomeKind={finalOutcome?.kind}
        outcomeLabel={finalOutcome?.label}
        context={contextRef.current}
        agentName={info.agent_name}
        agentPhoto={info.agent_photo}
        onPlayAgain={start}
      />
    );
  };

  // MOBILE: ocupa a tela toda, sem moldura de iPhone
  if (isMobile) {
    return (
      <div
        className="pc-fullscreen pc-fonts"
        style={{ ...pageStyle, ...appearanceCssVars(info.appearance || {}) }}
      >
        {renderView()}
      </div>
    );
  }

  // DESKTOP: mantém a moldura de iPhone
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 py-8"
      style={pageStyle}
    >
      <div className="text-center text-white">
        <div className="text-[11px] tracking-[0.3em] uppercase text-white/50 font-mono">
          {info.org_name || 'Vendus'} · /call/{info.slug}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{info.headline}</h1>
      </div>

      <PhoneFrame
        appearance={info.appearance}
        theme={info.theme}
        onCall={view === 'in_call'}
        timerText={fmtTimer(elapsed)}
      >
        {renderView()}
      </PhoneFrame>

      <p className="text-center text-[11px] font-mono text-white/40 max-w-md leading-relaxed">
        {info.appearance?.footer_note || 'Toda ligação termina em um desfecho registrado.'}
      </p>
    </div>
  );
}
