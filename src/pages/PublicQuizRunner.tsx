import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronRight, ChevronLeft, Sparkles, Check } from 'lucide-react';
import { useFunnelBySlug } from '@/hooks/useFunnels';
import { supabase } from '@/integrations/supabase/client';
import {
  FunnelBlock,
  VARIABLE_TO_LEAD_FIELD,
  getChannelAppearance,
  defaultChannelAppearance,
  type QuizChannelOptions,
} from '@/types/funnel';
import { ensureFontLoaded, shadowToCss } from '@/lib/funnelAppearance';
import { pickContrast } from '@/lib/colors';
import { QuizResultView } from '@/components/quiz/QuizResultView';
import { cn } from '@/lib/utils';
import { evaluateDisplay } from '@/lib/quizDisplayRules';
import { collectTrackingParams } from '@/lib/trackingParams';

/**
 * Renderer público do Quiz no padrão inlead (form-style, 1 tela por bloco).
 * Não usa header de bot, avatar, balões — UI 100% focada na pergunta.
 */
export default function PublicQuizRunner() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const { data: funnel, isLoading, error } = useFunnelBySlug(slug, 'quiz');

  const [stepIndex, setStepIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const responsesRef = useRef<Record<string, string>>({});
  const scoreRef = useRef(0);
  const tagsRef = useRef<Set<string>>(new Set());
  const stepEnteredAtRef = useRef(Date.now());
  const sessionIdRef = useRef<string | null>(null);
  const trackingRef = useRef(collectTrackingParams());

  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);

  const renderVariables = (value?: string) => {
    if (!value) return '';
    const values: Record<string, unknown> = {
      ...trackingRef.current,
      ...responsesRef.current,
    };
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => {
      const resolved = values[key] ?? values[key.toLowerCase()];
      return resolved == null || resolved === '' ? match : String(resolved);
    });
  };

  // ───── Ordenação dos blocos (mesma lógica do PublicChat) ─────
  const orderedBlocks = useMemo<FunnelBlock[]>(() => {
    if (!funnel?.flow_blocks?.length) return [];
    const blocks = funnel.flow_blocks;
    let start = blocks.find((b) => b.id === funnel.start_block_id);
    if (!start) {
      const targeted = new Set(
        blocks.flatMap((b) => [
          b.next_block_id,
          b.data.true_next_block_id,
          b.data.false_next_block_id,
          ...(b.data.options?.map((o) => o.next_block_id) || []),
        ].filter(Boolean)),
      );
      start = blocks.find((b) => !targeted.has(b.id));
    }
    if (!start) {
      start = [...blocks].sort(
        (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
      )[0];
    }
    if (!start) return [];
    const out: FunnelBlock[] = [];
    const seen = new Set<string>();
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const visit = (block: FunnelBlock | undefined) => {
      if (!block || seen.has(block.id)) return;
      seen.add(block.id);
      out.push(block);
      const targets = [
        block.next_block_id,
        block.data.true_next_block_id,
        block.data.false_next_block_id,
        ...(block.data.options?.map((option) => option.next_block_id) || []),
      ];
      targets.forEach((target) => target && visit(byId.get(target)));
    };
    visit(start);
    return out;
  }, [funnel]);

  // ───── Aparência ─────
  const a = useMemo(
    () => (funnel ? getChannelAppearance(funnel as any, 'quiz') : defaultChannelAppearance('quiz')),
    [funnel],
  );
  const opts = a.channel_options as QuizChannelOptions;
  useEffect(() => { ensureFontLoaded(a.font_family); }, [a.font_family]);

  useEffect(() => {
    if (!funnel || isPreview) return;
    const pixelId = funnel.facebook_pixel_id?.trim();
    if (pixelId && /^\d{5,20}$/.test(pixelId)) {
      const win = window as any;
      if (!win.fbq) {
        const fbq: any = (...args: unknown[]) => fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args);
        fbq.queue = [];
        fbq.loaded = true;
        fbq.version = '2.0';
        win.fbq = fbq;
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        script.dataset.vendusQuizPixel = 'true';
        document.head.appendChild(script);
      }
      win.fbq('init', pixelId);
      win.fbq('track', 'PageView');
      win.fbq('trackCustom', 'QuizStarted', {}, { eventID: `${getSessionId()}:quiz_started` });
    }

    const googleCandidate = funnel.google_tag_id?.trim().toUpperCase();
    const googleId = googleCandidate && /^(G-[A-Z0-9]+|GTM-[A-Z0-9]+)$/.test(googleCandidate)
      ? googleCandidate
      : null;
    if (googleId?.startsWith('GTM-') && !document.querySelector('script[data-vendus-quiz-gtm]')) {
      const win = window as any;
      win.dataLayer = win.dataLayer || [];
      win.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(googleId)}`;
      script.dataset.vendusQuizGtm = 'true';
      document.head.appendChild(script);
    } else if (googleId?.startsWith('G-')) {
      const win = window as any;
      win.dataLayer = win.dataLayer || [];
      win.gtag = win.gtag || function gtag(...args: unknown[]) { win.dataLayer.push(args); };
      if (!document.querySelector(`script[data-vendus-google-tag="${googleId}"]`)) {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleId)}`;
        script.dataset.vendusGoogleTag = googleId;
        document.head.appendChild(script);
      }
      win.gtag('js', new Date());
      win.gtag('config', googleId);
      win.gtag('event', 'quiz_start', { quiz_id: funnel.id });
    }
  }, [funnel?.id, funnel?.facebook_pixel_id, funnel?.google_tag_id, isPreview]);

  const getSessionId = () => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const key = `vendus_quiz_session:${funnel?.id || slug || 'unknown'}`;
    const existing = sessionStorage.getItem(key);
    const generated = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    sessionIdRef.current = existing || generated;
    sessionStorage.setItem(key, sessionIdRef.current);
    return sessionIdRef.current;
  };

  const trackQuizEvent = async (
    eventType: 'session_started' | 'step_viewed' | 'step_answered' | 'quiz_completed' | 'quiz_submit_failed',
    block?: FunnelBlock,
    answer?: unknown,
    metadata: Record<string, unknown> = {},
  ) => {
    if (!funnel?.id || isPreview) return;
    const stableEvent = eventType === 'session_started' || eventType === 'quiz_completed';
    const eventId = stableEvent
      ? `${getSessionId()}:${eventType}`
      : `${getSessionId()}:${eventType}:${block?.id || 'quiz'}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => PromiseLike<unknown>;
    await rpc('track_quiz_event', {
      p_event_id: eventId,
      p_session_id: getSessionId(),
      p_funnel_id: funnel.id,
      p_event_type: eventType,
      p_block_id: block?.id || null,
      p_step_index: block ? orderedBlocks.findIndex((item) => item.id === block.id) : null,
      p_duration_ms: block ? Math.max(0, Date.now() - stepEnteredAtRef.current) : null,
      p_answer: answer == null ? null : answer,
      p_tracking: trackingRef.current,
      p_metadata: {
        device_type: isMobile ? 'mobile' : 'desktop',
        ...metadata,
      },
    });
  };

  // Track view 1x
  const trackedRef = useRef(false);
  useEffect(() => {
    if (funnel?.id && !trackedRef.current && !isPreview) {
      trackedRef.current = true;
      void trackQuizEvent('session_started');
    }
  }, [funnel?.id, isPreview]);

  // ───── Mobile detection (para regras de display por dispositivo) ─────
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ───── Pular blocos "silenciosos" (score/tag/condition/delay) + regras de display ─────
  const resolveVisible = (fromIdx: number): number => {
    let i = fromIdx;
    while (i < orderedBlocks.length) {
      const b = orderedBlocks[i];
      if (b.type === 'score') {
        scoreRef.current += Number((b.data as any)?.score_value || 0);
        i++; continue;
      }
      if (b.type === 'tag') {
        ((b.data as any)?.apply_tags as string[] | undefined)?.forEach((t) => tagsRef.current.add(t));
        i++; continue;
      }
      if (b.type === 'condition') {
        const cond = b.data.condition;
        let matched = false;
        if (cond?.variable) {
          const left = String(responsesRef.current[cond.variable] ?? '').trim().toLowerCase();
          const right = String(cond.value ?? '').trim().toLowerCase();
          const ln = Number(left), rn = Number(right);
          switch (cond.operator) {
            case 'equals': matched = left === right; break;
            case 'not_equals': matched = left !== right; break;
            case 'contains': matched = left.includes(right); break;
            case 'greater_than': matched = !isNaN(ln) && !isNaN(rn) && ln > rn; break;
            case 'less_than': matched = !isNaN(ln) && !isNaN(rn) && ln < rn; break;
          }
        }
        const targetId = matched ? b.data.true_next_block_id : b.data.false_next_block_id;
        if (targetId) {
          const idx = orderedBlocks.findIndex((x) => x.id === targetId);
          if (idx >= 0) { i = idx; continue; }
        }
        i++; continue;
      }
      if (b.type === 'delay') { i++; continue; }
      // Regra de exibição (device + condicionais sobre respostas)
      if (!evaluateDisplay(b.data.block_display, { responses: responsesRef.current, isMobile })) {
        i++; continue;
      }
      // bloco renderizável
      return i;
    }
    return -1;
  };

  const visibleIndex = useMemo(() => resolveVisible(stepIndex), [stepIndex, orderedBlocks, isMobile, responses]);
  const currentBlock: FunnelBlock | undefined = visibleIndex >= 0 ? orderedBlocks[visibleIndex] : undefined;

  useEffect(() => {
    if (!currentBlock) return;
    stepEnteredAtRef.current = Date.now();
    void trackQuizEvent('step_viewed', currentBlock);
  }, [currentBlock?.id]);

  // ───── Progresso ─────
  const totalSteps = orderedBlocks.filter((b) => ['message', 'text', 'buttons', 'input', 'end'].includes(b.type as any)).length || 1;
  const currentStepNumber = currentBlock
    ? orderedBlocks.slice(0, visibleIndex + 1).filter((b) => ['message', 'text', 'buttons', 'input', 'end'].includes(b.type as any)).length
    : totalSteps;
  const progressPct = Math.min(100, Math.round((currentStepNumber / totalSteps) * 100));

  // ───── Submit final ─────
  const submitLead = async () => {
    if (submitted || !funnel || isPreview) return;
    setSubmitted(true);
    setSubmitError(null);
    try {
      const collected: Record<string, string> = {};
      for (const [k, v] of Object.entries(responsesRef.current)) {
        const lf = VARIABLE_TO_LEAD_FIELD[k.toLowerCase()] || k;
        collected[lf] = v;
      }
      
      const { data, error: submitInvokeError } = await supabase.functions.invoke('funnel-submit', {
        body: {
          funnel_id: funnel.id,
          channel: 'quiz',
          responses: responsesRef.current,
          collected_data: collected,
          quiz_score: scoreRef.current,
          quiz_tags: Array.from(tagsRef.current),
          tracking: trackingRef.current,
        },
      });
      if (submitInvokeError || !data?.success) {
        throw submitInvokeError || new Error(data?.error || 'Não foi possível registrar as respostas.');
      }
      await trackQuizEvent('quiz_completed', currentBlock, null, {
        lead_id: data.lead_id,
        score: scoreRef.current,
        tags: Array.from(tagsRef.current),
      });
      const win = window as any;
      if (funnel.facebook_pixel_id && win.fbq) {
        win.fbq('track', 'Lead', {
          content_name: funnel.name,
          content_category: 'quiz',
        }, { eventID: `${getSessionId()}:quiz_completed` });
      }
      if (funnel.google_tag_id && win.gtag) {
        win.gtag('event', 'generate_lead', {
          quiz_id: funnel.id,
          quiz_name: funnel.name,
        });
      }
    } catch (e) {
      console.error('[quiz] submit error', e);
      setSubmitted(false);
      setSubmitError('Não conseguimos salvar agora. Confira sua conexão e tente novamente.');
      void trackQuizEvent('quiz_submit_failed', currentBlock, null, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // ───── Avançar ─────
  const goNext = (overrideTarget?: string | null) => {
    if (!currentBlock) return;

    if (overrideTarget) {
      const idx = orderedBlocks.findIndex((b) => b.id === overrideTarget);
      if (idx >= 0) {
        setHistory((previous) => [...previous, currentBlock.id]);
        setSelectedOptionIds([]);
        setInputValue('');
        setStepIndex(idx);
        return;
      }
    }
    if (currentBlock.next_block_id) {
      const idx = orderedBlocks.findIndex((b) => b.id === currentBlock.next_block_id);
      if (idx >= 0) {
        setHistory((previous) => [...previous, currentBlock.id]);
        setSelectedOptionIds([]);
        setInputValue('');
        setStepIndex(idx);
        return;
      }
    }
    setSelectedOptionIds([]);
    setInputValue('');
    setIsComplete(true);
    void submitLead();
  };

  const handleBack = () => {
    const previousId = history[history.length - 1];
    if (!previousId) return;
    const previousIndex = orderedBlocks.findIndex((block) => block.id === previousId);
    if (previousIndex < 0) return;
    setHistory((items) => items.slice(0, -1));
    setSelectedOptionIds([]);
    setInputValue('');
    setStepIndex(previousIndex);
  };

  const handleCtaText = () => {
    // intro / message: só avança
    goNext();
  };

  const handleSelectOption = (optionId: string) => {
    const isMultiple = (currentBlock?.data as any)?.quiz_subtype === 'multiple';
    setSelectedOptionIds((current) => (
      isMultiple
        ? current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId]
        : [optionId]
    ));
  };

  const handleConfirmOption = () => {
    if (!currentBlock || currentBlock.type !== 'buttons' || selectedOptionIds.length === 0) return;
    const options = (currentBlock.data.options || []).filter((option) => selectedOptionIds.includes(option.id));
    if (options.length === 0) return;
    const isMultiple = (currentBlock.data as any).quiz_subtype === 'multiple';
    const variable = currentBlock.data.variable_name || currentBlock.id;
    const labels = options.map((option) => option.label);
    const next = { ...responsesRef.current, [variable]: isMultiple ? labels.join(', ') : labels[0] };
    setResponses(next);
    responsesRef.current = next;
    options.forEach((option) => {
      if (option.score) scoreRef.current += Number(option.score) || 0;
      if (option.tag) tagsRef.current.add(String(option.tag));
    });
    void trackQuizEvent('step_answered', currentBlock, {
      option_ids: options.map((option) => option.id),
      labels,
      variable,
    });
    // Em múltipla escolha a pergunta possui uma única saída coerente; uma saída
    // específica continua válida quando todas as opções escolhidas apontam para ela.
    const optionTargets = [...new Set(options.map((option) => option.next_block_id).filter(Boolean))];
    goNext(optionTargets.length === 1 ? optionTargets[0] : currentBlock.next_block_id);
  };

  const handleSubmitInput = () => {
    if (!currentBlock || currentBlock.type !== 'input') return;
    const text = inputValue.trim();
    if (currentBlock.data.required && !text) return;
    const variable = currentBlock.data.variable_name || currentBlock.id;
    const next = { ...responsesRef.current, [variable]: text };
    setResponses(next);
    responsesRef.current = next;
    void trackQuizEvent('step_answered', currentBlock, { value: text, variable });
    goNext();
  };

  // ───── Tela final automática quando bloco "end" é atingido ─────
  useEffect(() => {
    if (currentBlock?.type === 'end' && !submitted) submitLead();
    // redirect_url opcional
    if (currentBlock?.type === 'end' && currentBlock.data.redirect_url && !isPreview) {
      const t = setTimeout(() => {
        window.location.href = currentBlock.data.redirect_url!;
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [currentBlock?.id]);

  // ───── Loading / erro ─────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !funnel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div>
          <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-1">Quiz não encontrado</h1>
          <p className="text-sm text-muted-foreground">Este link pode estar inativo ou incorreto.</p>
        </div>
      </div>
    );
  }

  // ───── Tokens visuais ─────
  const isDarkBg = isColorDark(a.background_color);
  const subtleBg = isDarkBg ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)';
  const subtleBorder = isDarkBg ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
  const trackBg = isDarkBg ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';
  const mutedText = isDarkBg ? 'rgba(255,255,255,0.65)' : 'rgba(15,23,42,0.55)';
  const primaryFg = pickContrast(a.primary_color);

  const showLogo = opts.show_logo !== false && a.logo_url && (currentBlock?.data.show_logo !== false);
  const showBack = opts.show_back_button !== false && history.length > 0;
  const ctaLabel = renderVariables(currentBlock?.data.cta_label || 'Continuar');
  const ctaEmoji = currentBlock?.data.cta_emoji || '👉';

  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{
        backgroundColor: a.background_color,
        backgroundImage: a.background_image_url ? `url("${a.background_image_url}")` : undefined,
        backgroundSize: a.background_image_mode === 'contain' ? 'contain' : a.background_image_mode === 'repeat' ? 'auto' : 'cover',
        backgroundRepeat: a.background_image_mode === 'repeat' ? 'repeat' : 'no-repeat',
        backgroundPosition: 'center',
        color: a.text_color,
        fontFamily: `${a.font_family}, Inter, system-ui, sans-serif`,
        fontSize: a.font_size_base,
      }}
    >
      {/* Conteúdo */}
      <div className={cn(
        'flex-1 w-full flex justify-center px-4 sm:px-6 py-5 sm:py-10',
        (opts.vertical_alignment ?? 'center') === 'center' ? 'items-center' : 'items-start',
      )}>
        <div
          className={cn(
            'w-full mx-auto flex flex-col',
            opts.surface === 'card' && 'p-5 sm:p-8 border',
            (opts.content_alignment ?? 'left') === 'center' && 'text-center',
          )}
          style={{
            maxWidth: opts.max_width ?? 560,
            background: opts.surface === 'card' ? a.background_color : 'transparent',
            borderColor: opts.surface === 'card' ? subtleBorder : undefined,
            borderRadius: opts.surface === 'card' ? a.border_radius : undefined,
            boxShadow: opts.surface === 'card' ? shadowToCss(a.shadow) : undefined,
          }}
        >
          {(showLogo || showBack) && (
            <div className="grid grid-cols-[40px_1fr_40px] items-center mb-5">
              <div>
                {showBack && (
                  <button type="button" onClick={handleBack} aria-label="Voltar" className="h-9 w-9 rounded-full grid place-items-center transition hover:opacity-70">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
              </div>
              {showLogo ? (
                <img
                  src={a.logo_url!}
                  alt=""
                  className={cn('max-h-20 object-contain', a.logo_position === 'center' ? 'mx-auto' : '')}
                  style={{ width: opts.logo_width ?? 128 }}
                />
              ) : <span />}
              <span />
            </div>
          )}

          {opts.show_progress !== false && (
            <div className="w-full h-1.5 rounded-full overflow-hidden mb-7" style={{ background: trackBg }}>
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%`, background: a.primary_color }}
              />
            </div>
          )}

          <AnimatePresence mode="wait">
            {isComplete && !currentBlock ? (
              <motion.div
                key="thanks"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="text-center py-10"
              >
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: a.primary_color }}
                >
                  <Check className="h-7 w-7" style={{ color: primaryFg }} />
                </div>
                <h2 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.01em' }}>
                  Obrigado!
                </h2>
                <p className="text-sm" style={{ color: mutedText }}>
                  Suas respostas foram registradas com sucesso.
                </p>
              </motion.div>
            ) : currentBlock ? (
              <motion.div
                key={currentBlock.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="flex flex-col"
              >
                {/* Título + subtítulo + badge duração */}
                {currentBlock.type !== 'end' && (
                  <>
                    {opts.show_counter && (
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: mutedText }}>
                        Pergunta {currentStepNumber} de {totalSteps}
                      </p>
                    )}
                    <h1
                      className="font-bold leading-[1.15] mb-2"
                      style={{
                        fontSize: `clamp(${a.font_size_base * 1.6}px, 6vw, ${a.font_size_base * 2.2}px)`,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {renderVariables(currentBlock.data.content || 'Pergunta')}
                    </h1>
                    {currentBlock.data.subtitle && (
                      <p
                        className="mb-3 leading-snug"
                        style={{ color: mutedText, fontSize: a.font_size_base * 1.05 }}
                      >
                        {renderVariables(currentBlock.data.subtitle)}
                      </p>
                    )}
                    {currentBlock.data.show_duration && (
                      <p className="mb-5 text-xs font-medium" style={{ color: mutedText }}>
                        ⏳ {renderVariables(currentBlock.data.duration_label || 'Duração de 2min para responder')}
                      </p>
                    )}
                  </>
                )}

                {/* Imagem opcional */}
                {currentBlock.data.image_url && currentBlock.type !== 'end' && (
                  <img
                    src={currentBlock.data.image_url}
                    alt=""
                    className="w-full rounded-xl mb-5 object-cover max-h-[240px]"
                    style={{ borderRadius: a.border_radius }}
                  />
                )}

                {/* Conteúdo por tipo */}
                {(currentBlock.type === 'message' || currentBlock.type === ('text' as any)) && (
                  <div className="mt-2" />
                )}

                {currentBlock.type === 'buttons' && (
                  <div className="space-y-3 mb-2">
                    {(currentBlock.data.options || []).map((opt) => {
                      const selected = selectedOptionIds.includes(opt.id);
                      const multiple = (currentBlock.data as any).quiz_subtype === 'multiple';
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleSelectOption(opt.id)}
                          className="w-full text-left px-4 py-4 sm:py-[18px] flex items-center gap-3 transition-all active:scale-[0.99]"
                          style={{
                            background: selected ? a.primary_color : subtleBg,
                            color: selected ? primaryFg : a.text_color,
                            borderRadius: multiple ? Math.max(4, a.border_radius / 3) : a.border_radius,
                            border: `1.5px solid ${selected ? a.primary_color : subtleBorder}`,
                            boxShadow: selected ? shadowToCss(a.shadow) : 'none',
                          }}
                        >
                          <span
                            className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-all"
                            style={{
                              background: selected ? 'rgba(255,255,255,0.25)' : 'transparent',
                              border: `2px solid ${selected ? primaryFg : subtleBorder}`,
                            }}
                          >
                            {selected && <Check className="h-3.5 w-3.5" style={{ color: primaryFg }} strokeWidth={3} />}
                          </span>
                          {opt.emoji && <span className="text-lg">{opt.emoji}</span>}
                          <span className="text-[15px] sm:text-base font-medium flex-1">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentBlock.type === 'input' && (
                  <div className="mb-2">
                    <input
                      autoFocus
                      type={currentBlock.data.input_type === 'email' ? 'email' : currentBlock.data.input_type === 'phone' ? 'tel' : 'text'}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmitInput()}
                      placeholder={currentBlock.data.placeholder || 'Sua resposta...'}
                      className="w-full px-4 py-4 outline-none text-base"
                      style={{
                        background: subtleBg,
                        color: a.text_color,
                        border: `1.5px solid ${subtleBorder}`,
                        borderRadius: a.border_radius,
                      }}
                    />
                  </div>
                )}

                {currentBlock.type === 'end' && (
                  <div className="mt-2">
                    {(() => {
                      const subtype = (currentBlock.data as any)?.quiz_subtype;
                      const isResult = subtype === 'result' || subtype === 'result_ai' || (currentBlock.data as any)?.result_ai_enabled;
                      if (isResult && funnel) {
                        return (
                          <QuizResultView
                            block={currentBlock}
                            scoreTotal={scoreRef.current}
                            tags={Array.from(tagsRef.current)}
                            responses={responsesRef.current}
                            funnelId={funnel.id}
                            primaryColor={a.primary_color}
                          />
                        );
                      }
                      return (
                        <div className="text-center py-6">
                          <div
                            className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4"
                            style={{ background: a.primary_color }}
                          >
                            <Check className="h-7 w-7" style={{ color: primaryFg }} />
                          </div>
                          <h2 className="text-2xl font-bold mb-2" style={{ letterSpacing: '-0.01em' }}>
                            {renderVariables(currentBlock.data.content || 'Obrigado!')}
                          </h2>
                          {currentBlock.data.success_message && (
                            <p className="text-sm" style={{ color: mutedText }}>
                              {renderVariables(currentBlock.data.success_message)}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* CTA */}
                {currentBlock.type !== 'end' && (
                  <button
                    type="button"
                    onClick={
                      currentBlock.type === 'buttons'
                        ? handleConfirmOption
                        : currentBlock.type === 'input'
                        ? handleSubmitInput
                        : handleCtaText
                    }
                    disabled={
                      (currentBlock.type === 'buttons' && selectedOptionIds.length === 0) ||
                      (currentBlock.type === 'input' && currentBlock.data.required && !inputValue.trim())
                    }
                    className="w-full py-4 mt-5 font-semibold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: a.primary_color,
                      color: primaryFg,
                      borderRadius: a.border_radius,
                      boxShadow: shadowToCss(a.shadow),
                    }}
                  >
                    <span>{ctaLabel}</span>
                    {ctaEmoji ? <span>{ctaEmoji}</span> : <ChevronRight className="h-4 w-4" />}
                  </button>
                )}
                {submitError && (
                  <div
                    role="alert"
                    className="mt-4 rounded-lg border px-4 py-3 text-sm"
                    style={{ borderColor: '#ef4444', color: '#ef4444' }}
                  >
                    <p>{submitError}</p>
                    <button
                      type="button"
                      onClick={() => void submitLead()}
                      className="mt-2 font-semibold underline underline-offset-2"
                    >
                      Tentar salvar novamente
                    </button>
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {isPreview && (
        <div className="text-center py-2 text-[10px] uppercase tracking-wider" style={{ color: mutedText }}>
          Modo preview — respostas não serão salvas
        </div>
      )}

      {a.custom_css && <style dangerouslySetInnerHTML={{ __html: a.custom_css }} />}
    </div>
  );
}

function isColorDark(hex: string): boolean {
  const c = (hex || '').replace('#', '');
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.5;
}
