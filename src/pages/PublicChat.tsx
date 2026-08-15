import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Send, MessageSquare } from 'lucide-react';
import { useFunnelBySlug } from '@/hooks/useFunnels';
import { supabase } from '@/integrations/supabase/client';
import { FunnelBlock, VARIABLE_TO_LEAD_FIELD, getChannelAppearance, defaultChannelAppearance, type ChatChannelOptions, type ChannelKey } from '@/types/funnel';
import { ensureFontLoaded } from '@/lib/funnelAppearance';
import { pickContrast } from '@/lib/colors';

import { QuizResultView } from '@/components/quiz/QuizResultView';
import { collectTrackingParams } from '@/lib/trackingParams';

interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
  block?: FunnelBlock;
  options?: { id: string; label: string; emoji?: string }[];
  /** Quando definido, renderiza tela de Resultado do Quiz no lugar da bolha padrão. */
  resultPayload?: { scoreTotal: number; tags: string[] };
}

interface PublicChatProps {
  channel?: ChannelKey; // 'chat' (default) | 'quiz' — controla theme/slug-resolução
}

export default function PublicChat({ channel = 'chat' }: PublicChatProps = {}) {
  const { slug } = useParams<{ slug: string }>();
  const { data: funnel, isLoading, error } = useFunnelBySlug(slug, channel as any);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const responsesRef = useRef<Record<string, string>>({});
  // ─── Fase 3: acumuladores de score e tags durante o quiz ─────────────
  const scoreRef = useRef<number>(0);
  const tagsRef = useRef<Set<string>>(new Set());
  // Modo "Agente IA": após bloco ai_takeover/agent_switch, o chat passa a
  // ser conduzido 100% pelo webchat-bot — input fica sempre livre.
  const [aiMode, setAiMode] = useState<null | {
    conversationId: string;
    agentId: string | null;
    productId: string | null;
  }>(null);
  const aiModeRef = useRef<typeof aiMode>(null);
  useEffect(() => { aiModeRef.current = aiMode; }, [aiMode]);
  // Quando o takeover falha, mantemos o input livre para o usuário tentar de novo.
  const [aiError, setAiError] = useState(false);
  const pendingTakeoverBlockRef = useRef<FunnelBlock | null>(null);
  const visitorIdRef = useRef<string>('');
  if (!visitorIdRef.current) {
    const key = 'funnel_chat_visitor_id';
    let vid = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    if (!vid) {
      vid = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      try { window.localStorage.setItem(key, vid); } catch { /* ignore */ }
    }
    visitorIdRef.current = vid;
  }

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    responsesRef.current = responses;
  }, [responses]);


  // Get ordered blocks with robust fallback logic
  const getOrderedBlocks = (): FunnelBlock[] => {
    if (!funnel?.flow_blocks || funnel.flow_blocks.length === 0) return [];
    
    const blocks = funnel.flow_blocks;
    
    // Step 1: Try to find block by start_block_id
    let startBlock = blocks.find(b => b.id === funnel.start_block_id);
    
    // Step 2: Fallback - find "orphan" block (not targeted by any connection)
    if (!startBlock) {
      const targetedIds = new Set(
        blocks.flatMap(b => [
          b.next_block_id,
          b.data.true_next_block_id,
          b.data.false_next_block_id,
          ...(b.data.options?.map(o => o.next_block_id) || []),
          ...(b.data.ai_outputs?.map(o => o.next_block_id) || []),
        ].filter(Boolean))
      );
      startBlock = blocks.find(b => !targetedIds.has(b.id));
    }
    
    // Step 3: Last fallback - sort by position (top-left first)
    if (!startBlock) {
      const sorted = [...blocks].sort((a, b) => 
        a.position.y - b.position.y || a.position.x - b.position.x
      );
      startBlock = sorted[0];
    }
    
    if (!startBlock) return [];
    
    // Traverse with infinite loop protection
    const ordered: FunnelBlock[] = [];
    const visited = new Set<string>();
    let current: FunnelBlock | undefined = startBlock;
    const maxIterations = blocks.length + 10;
    let iterations = 0;

    while (current && !visited.has(current.id) && iterations < maxIterations) {
      ordered.push(current);
      visited.add(current.id);
      iterations++;
      
      if (current.next_block_id) {
        current = blocks.find(b => b.id === current!.next_block_id);
      } else {
        break;
      }
    }

    return ordered;
  };

  const orderedBlocks = getOrderedBlocks();

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track views
  useEffect(() => {
    if (funnel?.id) {
      supabase.rpc('increment_funnel_views', { p_funnel_id: funnel.id, p_channel: channel });
    }
  }, [funnel?.id]);

  // Process next block
  const processBlock = async (block: FunnelBlock) => {
    setIsTyping(true);
    
    await new Promise(resolve => setTimeout(resolve, block.data.delay_ms || 500));
    
    setIsTyping(false);

    if (block.type === 'message') {
      setMessages(prev => [...prev, {
        id: block.id,
        type: 'bot',
        content: block.data.content || '',
        block,
      }]);
      
      // Auto-advance to next block
      const nextIndex = orderedBlocks.findIndex(b => b.id === block.id) + 1;
      if (nextIndex < orderedBlocks.length) {
        setTimeout(() => processBlock(orderedBlocks[nextIndex]), 300);
      }
    } else if (block.type === 'input') {
      setMessages(prev => [...prev, {
        id: block.id,
        type: 'bot',
        content: block.data.content || block.data.placeholder || 'Digite sua resposta',
        block,
      }]);
      
      setTimeout(() => inputRef.current?.focus(), 100);
    } else if (block.type === 'buttons') {
      setMessages(prev => [...prev, {
        id: block.id,
        type: 'bot',
        content: block.data.content || 'Escolha uma opção:',
        block,
        options: block.data.options,
      }]);
    } else if (block.type === 'end') {
      const subtype = (block.data as any)?.quiz_subtype;
      const isResult = subtype === 'result' || subtype === 'result_ai' || (block.data as any)?.result_ai_enabled;
      setMessages(prev => [...prev, {
        id: block.id,
        type: 'bot',
        content: block.data.success_message || 'Obrigado!',
        block,
        resultPayload: isResult
          ? { scoreTotal: scoreRef.current, tags: Array.from(tagsRef.current) }
          : undefined,
      }]);
      setIsComplete(true);

      // Submit lead
      await submitLead();

      // Redirect if configured
      if (block.data.redirect_url) {
        setTimeout(() => {
          window.location.href = block.data.redirect_url!;
        }, 2000);
      }
    } else if (block.type === 'score') {
      // Fase 3: bloco de score apenas acumula e avança
      const inc = Number((block.data as any)?.score_value || 0);
      scoreRef.current += inc;
      const nextIndex = orderedBlocks.findIndex(b => b.id === block.id) + 1;
      if (nextIndex < orderedBlocks.length) processBlock(orderedBlocks[nextIndex]);
    } else if (block.type === 'tag') {
      const tags = (block.data as any)?.apply_tags as string[] | undefined;
      tags?.forEach(t => tagsRef.current.add(t));
      const nextIndex = orderedBlocks.findIndex(b => b.id === block.id) + 1;
      if (nextIndex < orderedBlocks.length) processBlock(orderedBlocks[nextIndex]);
    } else if (block.type === 'delay') {
      await new Promise(resolve => setTimeout(resolve, block.data.delay_ms || 1000));
      
      const nextIndex = orderedBlocks.findIndex(b => b.id === block.id) + 1;
      if (nextIndex < orderedBlocks.length) {
        processBlock(orderedBlocks[nextIndex]);
      }
    } else if (block.type === 'webhook') {
      // Fire webhook silently then advance
      const cfg = block.data.webhook_config;
      const isOnBlock = !cfg?.trigger || cfg.trigger === 'on_block';
      if (cfg?.url && isOnBlock && funnel?.id) {
        try {
          const collectedData: Record<string, string> = {};
          for (const [key, value] of Object.entries(responsesRef.current)) {
            const lf = VARIABLE_TO_LEAD_FIELD[key.toLowerCase()] || key;
            collectedData[lf] = value;
          }
          const urlParams = new URLSearchParams(window.location.search);
          const tracking = {
            utm_source: urlParams.get('utm_source') || undefined,
            utm_campaign: urlParams.get('utm_campaign') || undefined,
            referrer_url: document.referrer || undefined,
            landing_page: window.location.href,
          };
          const promise = supabase.functions.invoke('funnel-execute-webhook', {
            body: {
              funnel_id: funnel.id,
              block_id: block.id,
              collected_data: collectedData,
              responses: responsesRef.current,
              tracking,
              trigger_source: 'on_block',
            },
          });
          if (cfg.wait_for_response) {
            const { error } = await promise;
            if (error) throw error;
          } else {
            promise.then(({ error }) => {
              if (error) console.error('[chat] webhook error:', error);
            });
          }
        } catch (err) {
          console.error('[chat] webhook error:', err);
        }
      }
      const nextIndex = orderedBlocks.findIndex(b => b.id === block.id) + 1;
      if (nextIndex < orderedBlocks.length) {
        processBlock(orderedBlocks[nextIndex]);
      }
    } else if (block.type === 'ai_takeover' || block.type === 'agent_switch') {
      await startAgentTakeover(block);
    } else if (block.type === 'condition') {
      // Avalia condição contra responsesRef e ramifica
      const cond = block.data.condition;
      let matched = false;
      if (cond?.variable) {
        const raw = responsesRef.current[cond.variable];
        const left = (raw ?? '').toString().trim().toLowerCase();
        const right = (cond.value ?? '').toString().trim().toLowerCase();
        const ln = Number(left);
        const rn = Number(right);
        switch (cond.operator) {
          case 'equals': matched = left === right; break;
          case 'not_equals': matched = left !== right; break;
          case 'contains': matched = left.includes(right); break;
          case 'greater_than': matched = !isNaN(ln) && !isNaN(rn) && ln > rn; break;
          case 'less_than': matched = !isNaN(ln) && !isNaN(rn) && ln < rn; break;
        }
      }
      const targetId = matched ? block.data.true_next_block_id : block.data.false_next_block_id;
      const target = targetId ? orderedBlocks.find(b => b.id === targetId) : undefined;
      if (target) {
        setTimeout(() => processBlock(target), 100);
      } else {
        const nextIndex = orderedBlocks.findIndex(b => b.id === block.id) + 1;
        if (nextIndex < orderedBlocks.length) processBlock(orderedBlocks[nextIndex]);
      }
    } else {
      // For other block types, just advance
      const nextIndex = orderedBlocks.findIndex(b => b.id === block.id) + 1;
      if (nextIndex < orderedBlocks.length) {
        processBlock(orderedBlocks[nextIndex]);
      }
    }
  };

  // ─── Agente IA: cria conversa no backend e delega ao webchat-bot ──────────
  const startAgentTakeover = async (block: FunnelBlock) => {
    if (aiModeRef.current) return; // já em modo IA
    if (!funnel) return;
    pendingTakeoverBlockRef.current = block;

    const urlParams = new URLSearchParams(window.location.search);
    const collected = responsesRef.current;
    const visitorName = collected.name || collected.nome || collected.first_name || undefined;
    const visitorEmail = collected.email || undefined;
    const visitorPhone = collected.phone || collected.telefone || collected.whatsapp || undefined;

    setIsTyping(true);
    try {
      const { data, error: startErr } = await supabase.functions.invoke('funnel-chatbot-start', {
        body: {
          funnel_id: funnel.id,
          visitor_id: visitorIdRef.current,
          visitor_name: visitorName,
          visitor_email: visitorEmail,
          visitor_phone: visitorPhone,
          flow_variables: collected,
          agent_id: (block.data as any).agent_id || null,
          ai_context: (block.data as any).ai_context_prompt || null,
          override_can_do: (block.data as any).override_can_do || [],
          override_cannot_do: (block.data as any).override_cannot_do || [],
          override_handoff_triggers: (block.data as any).override_handoff_triggers || [],
          current_page_url: window.location.href,
          referrer_url: document.referrer || undefined,
          utm_source: urlParams.get('utm_source') || undefined,
          utm_medium: urlParams.get('utm_medium') || undefined,
          utm_campaign: urlParams.get('utm_campaign') || undefined,
          utm_content: urlParams.get('utm_content') || undefined,
          utm_term: urlParams.get('utm_term') || undefined,
        },
      });
      if (startErr || !data?.conversation_id) {
        console.error('[chat] failed to start agent conversation:', startErr);
        setIsTyping(false);
        setAiError(true);
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          type: 'bot',
          content: 'Não foi possível conectar ao atendente agora. Envie sua mensagem novamente para tentar de novo.',
        }]);
        setTimeout(() => inputRef.current?.focus(), 100);
        return;
      }
      setAiError(false);
      const newMode = {
        conversationId: data.conversation_id as string,
        agentId: (block.data as any).agent_id || null,
        productId: data.product_id || null,
      };
      setAiMode(newMode);
      aiModeRef.current = newMode;
      // Dispara primeira mensagem (saudação proativa do agente).
      const lastUserMsg = [...messages].reverse().find(m => m.type === 'user')?.content;
      const initialTrigger = lastUserMsg && lastUserMsg.trim().length > 0
        ? lastUserMsg
        : 'Olá';
      await sendToAgent(initialTrigger, newMode, { skipUserBubble: true });
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      console.error('[chat] takeover error:', err);
      setIsTyping(false);
      setAiError(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const sendToAgent = async (
    message: string,
    mode: { conversationId: string; agentId: string | null; productId: string | null },
    opts: { skipUserBubble?: boolean } = {},
  ) => {
    if (!opts.skipUserBubble) {
      setMessages(prev => [...prev, {
        id: `user-${Date.now()}`,
        type: 'user',
        content: message,
      }]);
    }
    setIsTyping(true);
    try {
      const { data, error: botErr } = await supabase.functions.invoke('webchat-bot', {
        body: {
          conversation_id: mode.conversationId,
          message,
          product_id: mode.productId || undefined,
          agent_id: mode.agentId || undefined,
          channel: 'webchat',
        },
      });
      if (botErr) {
        console.error('[chat] webchat-bot error:', botErr);
      }
      const content = data?.message?.content
        || (Array.isArray(data?.chunks) ? data.chunks.join('\n\n') : '')
        || data?.response
        || '';
      if (content) {
        setMessages(prev => [...prev, {
          id: `bot-${Date.now()}`,
          type: 'bot',
          content,
        }]);
      }
    } catch (err) {
      console.error('[chat] send error:', err);
    } finally {
      setIsTyping(false);
    }
  };


  // Start conversation
  useEffect(() => {
    if (funnel && orderedBlocks.length > 0 && messages.length === 0) {
      processBlock(orderedBlocks[0]);
    }
  }, [funnel]);

  // Hooks precisam rodar em todas as renderizações para não quebrar em produção.
  const a = useMemo(
    () => (funnel ? getChannelAppearance(funnel as any, channel) : defaultChannelAppearance(channel)),
    [funnel, channel]
  );
  const chatOpts = a.channel_options as ChatChannelOptions;
  useEffect(() => { ensureFontLoaded(a.font_family); }, [a.font_family]);

  const handleSubmitInput = async () => {
    if (!inputValue.trim()) return;
    const text = inputValue;
    setInputValue('');

    // Modo Agente IA: envia direto para webchat-bot, sem fluxo estático.
    if (aiModeRef.current) {
      await sendToAgent(text, aiModeRef.current);
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }

    // Retentativa de takeover após falha anterior.
    if (aiError && pendingTakeoverBlockRef.current) {
      setMessages(prev => [...prev, {
        id: `user-${Date.now()}`,
        type: 'user',
        content: text,
      }]);
      // Guarda como última resposta para o agente já ter contexto.
      const variableName = '__last_message__';
      const next = { ...responsesRef.current, [variableName]: text };
      setResponses(next);
      responsesRef.current = next;
      await startAgentTakeover(pendingTakeoverBlockRef.current);
      return;
    }

    const currentBlock = messages[messages.length - 1]?.block;
    if (!currentBlock || currentBlock.type !== 'input') return;

    // Add user message
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'user',
      content: text,
    }]);

    // Store response
    const variableName = currentBlock.data.variable_name || currentBlock.id;
    const nextResponses = { ...responsesRef.current, [variableName]: text };
    setResponses(nextResponses);
    responsesRef.current = nextResponses;

    // Process next block
    const currentIndex = orderedBlocks.findIndex(b => b.id === currentBlock.id);
    if (currentIndex >= 0 && currentIndex < orderedBlocks.length - 1) {
      setTimeout(() => processBlock(orderedBlocks[currentIndex + 1]), 300);
    }
  };


  const handleSelectOption = (option: { id: string; label: string }) => {
    const currentBlock = messages[messages.length - 1]?.block;
    if (!currentBlock || currentBlock.type !== 'buttons') return;

    // Add user message
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'user',
      content: option.label,
    }]);

    // Store response
    const variableName = currentBlock.data.variable_name || currentBlock.id;
    const nextResponses = { ...responsesRef.current, [variableName]: option.label };
    setResponses(nextResponses);
    responsesRef.current = nextResponses;

    // Find next block (could be option-specific or default)
    const selectedOption = currentBlock.data.options?.find(o => o.id === option.id);
    // Fase 3: acumula score e tag da opção
    if (selectedOption?.score) scoreRef.current += Number(selectedOption.score) || 0;
    if (selectedOption?.tag) tagsRef.current.add(String(selectedOption.tag));
    const nextBlockId = selectedOption?.next_block_id || currentBlock.next_block_id;
    
    if (nextBlockId) {
      const nextBlock = orderedBlocks.find(b => b.id === nextBlockId);
      if (nextBlock) {
        setTimeout(() => processBlock(nextBlock), 300);
        return;
      }
    }

    // Default: advance to next in sequence
    const currentIndex = orderedBlocks.findIndex(b => b.id === currentBlock.id);
    if (currentIndex >= 0 && currentIndex < orderedBlocks.length - 1) {
      setTimeout(() => processBlock(orderedBlocks[currentIndex + 1]), 300);
    }
  };

  const submitLead = async () => {
    if (isSubmitting || !funnel) return;
    setIsSubmitting(true);

    try {
      // Map responses to lead fields using variable names
      const collectedData: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(responses)) {
        const leadField = VARIABLE_TO_LEAD_FIELD[key.toLowerCase()] || key;
        collectedData[leadField] = value;
      }

      // Get tracking params
      const tracking = collectTrackingParams();

      // Submit via edge function with correct payload structure
      const { error } = await supabase.functions.invoke('funnel-submit', {
        body: {
          funnel_id: funnel.id,
          channel,
          responses,
          collected_data: collectedData,
          quiz_score: scoreRef.current,
          quiz_tags: Array.from(tagsRef.current),
          tracking,
        },
      });

      if (error) {
        console.error('Error submitting lead:', error);
      }
    } catch (err) {
      console.error('Error submitting lead:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !funnel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Chat não encontrado</h1>
          <p className="text-muted-foreground">Este link pode estar inativo ou incorreto.</p>
        </div>
      </div>
    );
  }

  const primaryFg = pickContrast(a.primary_color);
  const botBubbleColor = chatOpts.bot_bubble_color || a.primary_color;
  const botBubbleFg = pickContrast(botBubbleColor);
  const userBubbleColor = chatOpts.user_bubble_color || '#E2E8F0';
  const userBubbleFg = pickContrast(userBubbleColor);
  const headerBg = chatOpts.header_gradient
    ? `linear-gradient(135deg, ${a.primary_color}, ${a.secondary_color || a.primary_color})`
    : a.primary_color;
  // Mesma fórmula do AppearanceLivePreview/ChatPreview para garantir paridade visual
  const bubbleRadius = chatOpts.bubble_style === 'squared' ? 4
    : chatOpts.bubble_style === 'bubble' ? 24
    : (a.border_radius || 14);
  // "Tail" da bolha só faz sentido no estilo padrão (rounded). Squared já é reto
  // e bubble já é arredondado uniforme — manter o tail estraga a forma.
  const botTailRadius = chatOpts.bubble_style && chatOpts.bubble_style !== 'rounded' ? bubbleRadius : 4;
  const userTailRadius = botTailRadius;
  const botAvatarSrc = a.avatar_url || a.logo_url || null;

  const currentMessage = messages[messages.length - 1];
  const showInput = (!!aiMode || aiError || currentMessage?.block?.type === 'input') && !isTyping && !isComplete;
  const showButtons = currentMessage?.options && !isTyping && !isComplete;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: a.background_color,
        color: a.text_color,
        fontFamily: `${a.font_family}, system-ui, sans-serif`,
        fontSize: a.font_size_base,
      }}
    >
      {/* Header */}
      <div
        className="p-4 border-b"
        style={{ background: headerBg, color: primaryFg }}
      >
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {(a.logo_url || a.avatar_url) ? (
            <img
              src={(a.logo_url || a.avatar_url) as string}
              alt="Logo"
              loading="lazy"
              decoding="async"
              className={`w-10 h-10 object-cover ${a.avatar_shape === 'square' ? 'rounded-md' : 'rounded-full'}`}
            />
          ) : (
            <div className={`w-10 h-10 bg-white/20 flex items-center justify-center ${a.avatar_shape === 'square' ? 'rounded-md' : 'rounded-full'}`}>
              <MessageSquare className="h-5 w-5" style={{ color: primaryFg }} />
            </div>
          )}
          <div>
            <p className="font-medium" style={{ color: primaryFg }}>
              {a.bot_name || funnel.products?.name || funnel.name}
            </p>
            {a.show_online_status && (
              <p className="text-sm" style={{ color: primaryFg, opacity: 0.75 }}>Online agora</p>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <AnimatePresence>
            {messages.map((message, idx) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.type === 'bot' && (
                  <div className="flex gap-2 max-w-[85%]">
                    {a.avatar_enabled && (
                      botAvatarSrc ? (
                        <img
                          src={botAvatarSrc}
                          alt=""
                          loading="lazy"
                          className={`w-8 h-8 object-cover flex-shrink-0 ${a.avatar_shape === 'square' ? 'rounded-md' : 'rounded-full'}`}
                        />
                      ) : (
                        <div
                          className={`w-8 h-8 flex-shrink-0 flex items-center justify-center ${a.avatar_shape === 'square' ? 'rounded-md' : 'rounded-full'}`}
                          style={{ backgroundColor: a.primary_color }}
                        >
                          <MessageSquare className="h-4 w-4" style={{ color: primaryFg }} />
                        </div>
                      )
                    )}
                    <div className="space-y-2">
                      {message.resultPayload && message.block && funnel ? (
                        <QuizResultView
                          block={message.block}
                          scoreTotal={message.resultPayload.scoreTotal}
                          tags={message.resultPayload.tags}
                          responses={responsesRef.current}
                          funnelId={funnel.id}
                          primaryColor={a.primary_color}
                        />
                      ) : (
                        <div
                          className="p-3"
                          style={{
                            backgroundColor: botBubbleColor,
                            color: botBubbleFg,
                            borderRadius: bubbleRadius,
                            borderTopLeftRadius: botTailRadius,
                          }}
                        >
                          {message.content}
                        </div>
                      )}



                      {/* Buttons */}
                      {message.options && idx === messages.length - 1 && !isTyping && (
                        <div className="space-y-2 mt-2">
                          {message.options.map(option => (
                            <button
                              key={option.id}
                              onClick={() => handleSelectOption(option)}
                              className="block w-full p-3 text-left transition-all hover:scale-[1.02]"
                              style={{
                                borderRadius: bubbleRadius,
                                border: `1.5px solid ${a.primary_color}`,
                                color: a.text_color,
                                background: 'transparent',
                              }}
                            >
                              {option.emoji && <span className="mr-2">{option.emoji}</span>}
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {message.type === 'user' && (
                  <div
                    className="max-w-[85%] p-3"
                    style={{
                      backgroundColor: userBubbleColor,
                      color: userBubbleFg,
                      borderRadius: bubbleRadius,
                      borderTopRightRadius: userTailRadius,
                    }}
                  >
                    {message.content}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator: sempre visível em modo IA (mesmo com show_typing=false),
              senão o usuário fica sem feedback enquanto o webchat-bot processa. */}
          {isTyping && (chatOpts.show_typing || !!aiMode) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-2"
            >
              {a.avatar_enabled && (
                botAvatarSrc ? (
                  <img
                    src={botAvatarSrc}
                    alt=""
                    loading="lazy"
                    className={`w-8 h-8 object-cover ${a.avatar_shape === 'square' ? 'rounded-md' : 'rounded-full'}`}
                  />
                ) : (
                  <div
                    className={`w-8 h-8 flex items-center justify-center ${a.avatar_shape === 'square' ? 'rounded-md' : 'rounded-full'}`}
                    style={{ backgroundColor: a.primary_color }}
                  >
                    <MessageSquare className="h-4 w-4" style={{ color: primaryFg }} />
                  </div>
                )
              )}
              <div
                className="p-3"
                style={{ backgroundColor: botBubbleColor, borderRadius: bubbleRadius, borderTopLeftRadius: botTailRadius }}
              >
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: botBubbleFg, opacity: 0.6, animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: botBubbleFg, opacity: 0.6, animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: botBubbleFg, opacity: 0.6, animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      {showInput && (
        <div className="p-4 border-t" style={{ backgroundColor: a.background_color }}>
          <div className="max-w-lg mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitInput();
              }}
              className="flex gap-2"
            >
              <input
                ref={inputRef}
                type={!aiMode && currentMessage?.block?.data.input_type === 'email' ? 'email' : 'text'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={aiMode ? (chatOpts.input_placeholder || 'Digite sua mensagem...') : (currentMessage?.block?.data.placeholder || chatOpts.input_placeholder || 'Digite aqui...')}

                className="flex-1 px-4 py-3 outline-none"
                style={{
                  borderRadius: a.border_radius * 1.5,
                  border: `1.5px solid ${a.primary_color}`,
                  color: a.text_color,
                  background: '#fff',
                }}
              />
              <button
                type="submit"
                className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-105"
                style={{ backgroundColor: a.primary_color, color: primaryFg }}
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Complete indicator */}
      {isComplete && (
        <div className="p-4 border-t text-center" style={{ backgroundColor: a.background_color }}>
          <p className="text-sm" style={{ color: a.text_color, opacity: 0.7 }}>
            ✅ Conversa finalizada
          </p>
        </div>
      )}
    </div>
  );
}
