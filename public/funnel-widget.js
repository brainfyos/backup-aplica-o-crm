/**
 * Bizon Capture - Funnel Widget
 * 
 * Widget de chat para funis de captura.
 * Carrega o fluxo definido no Strategy Flow Builder.
 * 
 * Usage:
 * <script 
 *   src="https://your-domain.com/funnel-widget.js" 
 *   data-funnel-id="YOUR_FUNNEL_ID"
 *   async
 * ></script>
 */
(function() {
  'use strict';

  // Get configuration from script tag
  const currentScript = document.currentScript;
  const funnelId = currentScript?.dataset?.funnelId;
  
  if (!funnelId) {
    console.error('[Bizon Capture] Missing data-funnel-id attribute');
    return;
  }

  // Configuration
  const config = {
    funnelId: funnelId,
    apiBase: 'https://syvhrtaksjcvhrzhbltt.supabase.co/functions/v1',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5dmhydGFrc2pjdmhyemhibHR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTU1NDEsImV4cCI6MjA5MzYzMTU0MX0.wnXrkMUWnN4MdBt1QB2p3BXlHTwxxsox8zLrV2sMZPw'
  };

  // State
  let state = {
    isOpen: false,
    isLoading: true,
    isInitialized: false,
    funnel: null,
    currentBlockId: null,
    blocks: {},
    collectedData: {},
    messages: [],
    isTyping: false,
    visitorId: null,
    aiAgent: null,        // { agent_id, ai_context_prompt, block }
    aiHistory: [],        // [{role:'user'|'assistant', content}] — fallback stateless
    conversationId: null, // webchat_conversations.id quando o pipeline oficial foi iniciado
    productId: null,      // product_id retornado pelo funnel-chatbot-start
    inputPlaceholder: null,
  };

  // localStorage key p/ retomar a mesma conversa em recarregamentos
  function convStorageKey() {
    return `bizon_conv_${config.funnelId}_${state.visitorId}`;
  }
  function loadCachedConversationId() {
    try { return localStorage.getItem(convStorageKey()); } catch (_) { return null; }
  }
  function saveCachedConversationId(id) {
    try { if (id) localStorage.setItem(convStorageKey(), id); } catch (_) {}
  }

  // Generate or get visitor ID
  function getVisitorId() {
    const storageKey = `bizon_visitor_${config.funnelId}`;
    let visitorId = localStorage.getItem(storageKey);
    if (!visitorId) {
      visitorId = 'v_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem(storageKey, visitorId);
    }
    return visitorId;
  }

  // Cookie helper (Meta Pixel grava _fbp/_fbc como first-party)
  function readCookie(name) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (_) { return null; }
  }

  // Meta espera _fbc no formato fb.1.<timestamp>.<fbclid> quando não há cookie.
  function computeFbc(urlParams) {
    const cookieFbc = readCookie('_fbc');
    if (cookieFbc) return cookieFbc;
    const fbclid = urlParams.get('fbclid');
    if (!fbclid) return null;
    return `fb.1.${Date.now()}.${fbclid}`;
  }

  // Get page metadata
  function getPageMetadata() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      currentPageUrl: window.location.href,
      referrerUrl: document.referrer || null,
      landingPage: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent,
      utmSource: urlParams.get('utm_source'),
      utmMedium: urlParams.get('utm_medium'),
      utmCampaign: urlParams.get('utm_campaign'),
      utmContent: urlParams.get('utm_content'),
      utmTerm: urlParams.get('utm_term'),
      fbclid: urlParams.get('fbclid'),
      gclid: urlParams.get('gclid'),
      ttclid: urlParams.get('ttclid'),
      liFatId: urlParams.get('li_fat_id'),
      fbc: computeFbc(urlParams),
      fbp: readCookie('_fbp'),
    };
  }


  // API calls
  async function apiCall(action, body = {}) {
    const response = await fetch(`${config.apiBase}/funnel-api?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  }

  // Chamada direta a uma edge function (fora do funnel-api). Usado pelo
  // pipeline oficial de Conversas (funnel-chatbot-start + webchat-bot).
  async function edgeCall(fnName, body = {}) {
    const response = await fetch(`${config.apiBase}/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.anonKey,
        'Authorization': `Bearer ${config.anonKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!response.ok) {
      const err = new Error(`Edge ${fnName} ${response.status}`);
      err.status = response.status;
      err.body = data || text;
      throw err;
    }
    return data;
  }

  // Cria/reaproveita a webchat_conversations no backend oficial e guarda o
  // conversation_id em memória + localStorage para retomar após reload.
  async function ensureConversationStarted(block) {
    if (state.conversationId) return state.conversationId;

    const meta = getPageMetadata();
    const collected = state.collectedData || {};
    const visitorName = collected.name || collected.nome || collected.first_name || null;
    const visitorEmail = collected.email || null;
    const visitorPhone = collected.phone || collected.telefone || collected.whatsapp || null;

    const payload = {
      funnel_id: config.funnelId,
      visitor_id: state.visitorId,
      visitor_name: visitorName || undefined,
      visitor_email: visitorEmail || undefined,
      visitor_phone: visitorPhone || undefined,
      flow_variables: collected,
      agent_id: block?.data?.agent_id || null,
      ai_context: block?.data?.ai_context_prompt || block?.data?.context || null,
      override_can_do: block?.data?.override_can_do || [],
      override_cannot_do: block?.data?.override_cannot_do || [],
      override_handoff_triggers: block?.data?.override_handoff_triggers || [],
      current_page_url: meta.currentPageUrl,
      referrer_url: meta.referrerUrl || undefined,
      utm_source: meta.utmSource || undefined,
      utm_medium: meta.utmMedium || undefined,
      utm_campaign: meta.utmCampaign || undefined,
      utm_content: meta.utmContent || undefined,
      utm_term: meta.utmTerm || undefined,
    };

    const data = await edgeCall('funnel-chatbot-start', payload);
    if (!data || !data.conversation_id) {
      throw new Error('funnel-chatbot-start: sem conversation_id');
    }
    state.conversationId = data.conversation_id;
    state.productId = data.product_id || null;
    saveCachedConversationId(state.conversationId);
    return state.conversationId;
  }

  // Envia mensagem do visitante ao webchat-bot (mesma via do PublicChat /c/:slug).
  async function sendToWebchatBot(message) {
    const body = {
      conversation_id: state.conversationId,
      message,
      agent_id: state.aiAgent?.agent_id || undefined,
      product_id: state.productId || undefined,
      channel: 'webchat',
    };
    const data = await edgeCall('webchat-bot', body);
    const content = (data && data.message && data.message.content)
      || (data && Array.isArray(data.chunks) ? data.chunks.filter(Boolean).join('\n\n') : '')
      || (data && data.response)
      || '';
    return content;
  }

  // Dispara saudação proativa do agente (trigger "Olá" sem bolha do visitante).
  // Reproduz o comportamento do PublicChat quando entra em modo IA.
  async function triggerAgentGreeting(triggerText) {
    if (!state.conversationId) return;
    state.isTyping = true;
    render();
    try {
      const reply = await sendToWebchatBot(triggerText || 'Olá');
      state.isTyping = false;
      if (reply) {
        state.aiHistory.push({ role: 'assistant', content: reply });
        addMessage(reply);
      } else {
        render();
      }
    } catch (err) {
      console.error('[Bizon Capture] triggerAgentGreeting error:', err);
      state.isTyping = false;
      render();
    }
  }

  // Ativa modo IA implícito quando o fluxo termina mas há agente/ai_enabled.
  // Evita que mensagens do visitante caiam no vazio e nunca cheguem ao Inbox.
  async function enterAiModeImplicit(block) {
    if (state.aiAgent) return;
    const funnel = state.funnel || {};
    const fallbackAgentId =
      (block && block.data && block.data.agent_id)
      || funnel.default_agent_id
      || funnel.agent_id
      || null;
    const fallbackContext =
      (block && block.data && (block.data.ai_context_prompt || block.data.context))
      || funnel.ai_context
      || '';
    // Só entra em modo IA se houver algum sinal de que o funil suporta IA.
    if (!fallbackAgentId && !funnel.ai_enabled) return;
    state.aiAgent = {
      agent_id: fallbackAgentId,
      ai_context_prompt: fallbackContext,
      block: block || null,
    };
    state.collectingField = '__ai_chat__';
    try {
      await ensureConversationStarted({
        data: {
          agent_id: fallbackAgentId,
          ai_context_prompt: fallbackContext,
        },
      });
    } catch (e) {
      console.warn('[Bizon Capture] ensureConversationStarted (implícito) falhou:', e);
    }
    render();
  }

  // Delay helper
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Scroll to bottom of messages
  function scrollToBottom() {
    setTimeout(() => {
      const container = document.getElementById('bizon-capture-messages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 50);
  }

  // Add a message to the chat
  function addMessage(content, type = 'bot', options = null) {
    state.messages.push({
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(7),
      content,
      type,
      options,
      timestamp: new Date().toISOString()
    });
    render();
    scrollToBottom();
  }

  // Process the current block
  async function processBlock(blockId) {
    const block = state.blocks[blockId];
    if (!block) {
      console.error('[Bizon Capture] Block not found:', blockId);
      return;
    }

    state.currentBlockId = blockId;
    state.isTyping = true;
    render();

    // Simulate typing delay
    await delay(800 + Math.random() * 700);
    
    state.isTyping = false;

    switch (block.type) {
      case 'welcome':
        addMessage(block.data.content || block.data.message || block.data.text || 'Olá! Como posso ajudar?');
        if (block.next_block_id) {
          await delay(500);
          await processBlock(block.next_block_id);
        }
        break;

      case 'message':
        addMessage(block.data.content || block.data.text || block.data.message || '');
        if (block.next_block_id) {
          await delay(500);
          await processBlock(block.next_block_id);
        }
        break;

      case 'question':
      case 'input':
        addMessage(
          block.data.content
          || block.data.text
          || block.data.question
          || block.data.placeholder
          || 'Digite sua resposta',
        );
        state.collectingField = block.data.variable_name || block.data.variable || block.id;
        break;

      case 'buttons': {
        const rawOptions = block.data.options || block.data.buttons || [];
        const options = rawOptions.map(btn => ({
          label: btn.label || btn.text,
          value: btn.value || btn.label || btn.text,
          nextBlockId: btn.next_block_id,
        }));
        addMessage(
          block.data.content || block.data.text || block.data.message || 'Escolha uma opção:',
          'bot',
          options,
        );
        break;
      }

      case 'email':
        addMessage(block.data.content || block.data.text || 'Qual seu e-mail?');
        state.collectingField = 'email';
        break;

      case 'phone':
        addMessage(block.data.content || block.data.text || 'Qual seu telefone/WhatsApp?');
        state.collectingField = 'phone';
        break;

      case 'name':
        addMessage(block.data.content || block.data.text || 'Qual seu nome?');
        state.collectingField = 'name';
        break;

      case 'end':
        addMessage(
          block.data.success_message || block.data.content || block.data.message || 'Obrigado pelo contato! Em breve retornaremos.',
        );
        submitLead();
        break;

      case 'handoff':
        addMessage(
          block.data.content || block.data.message || 'Vou transferir você para um de nossos atendentes.',
        );
        submitLead();
        break;

      case 'redirect':
        addMessage(block.data.content || block.data.message || 'Redirecionando...');
        if (block.data.url) {
          setTimeout(() => {
            window.open(block.data.url, block.data.new_tab !== false ? '_blank' : '_self');
          }, 1000);
        }
        break;

      case 'whatsapp':
        addMessage(block.data.content || block.data.message || 'Clique para continuar no WhatsApp:');
        if (block.data.number) {
          const number = block.data.number.replace(/\D/g, '');
          const text = encodeURIComponent(block.data.whatsapp_message || 'Olá!');
          setTimeout(() => {
            window.open(`https://wa.me/${number}?text=${text}`, '_blank');
          }, 1000);
        }
        submitLead();
        break;

      case 'score':
        // Accumulate score in collected data
        if (block.data.score_value) {
          state.collectedData.__score = (state.collectedData.__score || 0) + Number(block.data.score_value);
        }
        if (block.next_block_id) {
          await processBlock(block.next_block_id);
        }
        break;

      case 'tag':
        // Accumulate tags in collected data
        if (block.data.apply_tags && Array.isArray(block.data.apply_tags)) {
          if (!Array.isArray(state.collectedData.__tags)) state.collectedData.__tags = [];
          state.collectedData.__tags.push(...block.data.apply_tags);
        }
        if (block.next_block_id) {
          await processBlock(block.next_block_id);
        }
        break;

      case 'condition': {
        // Suporta schema oficial (`data.condition.{variable,operator,value}`)
        // e legado (`data.variable`/`condition_field`/`operator`/`value`).
        const cond = block.data.condition || {};
        const condField = cond.variable || block.data.variable || block.data.condition_field;
        const condOperator = cond.operator || block.data.operator || 'equals';
        const condTarget = cond.value != null ? cond.value : (block.data.value || block.data.condition_value);
        const condValue = state.collectedData[condField];
        let conditionMet = false;
        const left = String(condValue ?? '').toLowerCase();
        const right = String(condTarget ?? '').toLowerCase();
        const ln = Number(left);
        const rn = Number(right);
        switch (condOperator) {
          case 'equals':
          case 'is':
            conditionMet = left === right; break;
          case 'not_equals':
          case 'neq':
            conditionMet = left !== right; break;
          case 'contains':
            conditionMet = left.includes(right); break;
          case 'greater_than':
          case 'gt':
            conditionMet = !isNaN(ln) && !isNaN(rn) && ln > rn; break;
          case 'less_than':
          case 'lt':
            conditionMet = !isNaN(ln) && !isNaN(rn) && ln < rn; break;
          case 'not_empty':
          case 'exists':
            conditionMet = !!condValue; break;
          default:
            conditionMet = !!condValue;
        }
        const nextId = conditionMet
          ? (block.data.true_next_block_id || block.data.true_block_id || block.data.yes_block_id || block.next_block_id)
          : (block.data.false_next_block_id || block.data.false_block_id || block.data.no_block_id || block.next_block_id);
        if (nextId) {
          await processBlock(nextId);
        }
        break;
      }

      case 'create_lead':
        // Trigger early lead submission, then continue
        submitLead();
        if (block.next_block_id) {
          await processBlock(block.next_block_id);
        }
        break;

      case 'webhook':
        // Fire webhook via dedicated edge function
        try {
          const cfg = block.data?.webhook_config || {};
          const trig = cfg.trigger || 'on_block';
          if (cfg.url && trig === 'on_block') {
            const meta = getPageMetadata();
            const promise = fetch(`${config.apiBase}/funnel-execute-webhook`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': config.anonKey },
              body: JSON.stringify({
                funnel_id: config.funnelId,
                block_id: block.id,
                collected_data: state.collectedData,
                responses: state.collectedData,
                tracking: {
                  utm_source: meta.utmSource || undefined,
                  utm_medium: meta.utmMedium || undefined,
                  utm_campaign: meta.utmCampaign || undefined,
                  utm_content: meta.utmContent || undefined,
                  utm_term: meta.utmTerm || undefined,
                  fbclid: meta.fbclid || undefined,
                  gclid: meta.gclid || undefined,
                  ttclid: meta.ttclid || undefined,
                  li_fat_id: meta.liFatId || undefined,
                  fbc: meta.fbc || undefined,
                  fbp: meta.fbp || undefined,
                  referrer_url: meta.referrerUrl || undefined,
                  landing_page: meta.landingPage || meta.currentPageUrl,
                  user_agent: meta.userAgent || undefined,
                },
                trigger_source: 'on_block',
              }),
            });
            if (cfg.wait_for_response) await promise;
          }
        } catch (e) {
          console.error('[Bizon Capture] Webhook error:', e);
        }
        if (block.next_block_id) {
          await processBlock(block.next_block_id);
        }
        break;

      case 'ai_takeover':
      case 'ai_chat':
      case 'agent_switch':
      case 'agent': {
        // Ativa modo Agente IA. Reaproveita o pipeline oficial (funnel-chatbot-start
        // + webchat-bot) para que a conversa apareça em Conversas > Atendendo/Agentes.
        state.aiAgent = {
          agent_id: block.data?.agent_id || null,
          ai_context_prompt: block.data?.ai_context_prompt || block.data?.context || '',
          block,
        };
        state.collectingField = '__ai_chat__';

        // Inicia (ou reaproveita) a webchat_conversations no backend oficial.

        try {
          await ensureConversationStarted(block);
        } catch (err) {
          console.error('[Bizon Capture] Falha ao iniciar conversa oficial (fallback stateless):', err);
          // Segue mesmo assim; handleInput vai usar o fallback agent-chat.
        }

        if (block.data?.initial_message) {
          addMessage(block.data.initial_message);
          state.aiHistory.push({ role: 'assistant', content: block.data.initial_message });
          render();
        } else if (state.conversationId) {
          // Sem initial_message: dispara saudação proativa do agente via webchat-bot
          // (mesma UX do PublicChat /c/:slug — trigger "Olá" sem bolha do visitante).
          render();
          await triggerAgentGreeting('Olá');
        } else {
          render();
        }
        break;
      }

      default:
        // For unknown block types, log and try to move to next
        console.warn('[Bizon Capture] Unsupported block type:', block.type, '- advancing to next');
        if (block.next_block_id) {
          await processBlock(block.next_block_id);
        }
    }

    render();
  }

  // Handle user input
  async function handleInput(value) {
    if (!value.trim()) return;

    // Add user message
    addMessage(value, 'user');

    // AI agent mode
    if (state.aiAgent && state.aiAgent.agent_id) {
      state.aiHistory.push({ role: 'user', content: value });
      state.isTyping = true;
      state.collectingField = '__ai_chat__';
      render();

      // Garante que existe conversation_id (caso o start tenha falhado no bloco).
      if (!state.conversationId) {
        try {
          await ensureConversationStarted(state.aiAgent.block);
        } catch (e) {
          console.warn('[Bizon Capture] ensureConversationStarted retry falhou:', e);
        }
      }

      // Caminho preferencial: webchat-bot (persiste em webchat_messages, aparece no Inbox).
      let reply = '';
      if (state.conversationId) {
        try {
          reply = await sendToWebchatBot(value);
        } catch (err) {
          console.error('[Bizon Capture] webchat-bot error, caindo p/ fallback agent-chat:', err);
        }
      }

      // Fallback stateless (não persiste no Inbox, mas mantém o widget respondendo).
      if (!reply) {
        try {
          const result = await apiCall('agent-chat', {
            funnel_id: config.funnelId,
            visitor_id: state.visitorId,
            agent_id: state.aiAgent.agent_id,
            ai_context_prompt: state.aiAgent.ai_context_prompt,
            messages: state.aiHistory.slice(-20),
          });
          reply = (result && result.reply) || '';
        } catch (err) {
          console.error('[Bizon Capture] agent-chat fallback error', err);
        }
      }

      if (!reply) reply = 'Desculpe, tive um problema técnico. Pode tentar novamente?';
      state.aiHistory.push({ role: 'assistant', content: reply });
      state.isTyping = false;
      addMessage(reply);
      state.collectingField = '__ai_chat__';
      render();
      return;
    }

    // Store collected data
    if (state.collectingField) {
      state.collectedData[state.collectingField] = value;
      state.collectingField = null;
    }

    // Find current block and move to next
    const currentBlock = state.blocks[state.currentBlockId];
    if (currentBlock?.next_block_id) {
      await delay(300);
      await processBlock(currentBlock.next_block_id);
      return;
    }

    // Não há próximo bloco declarado: se o funil tem IA, sobe pro modo agente
    // implícito e reenvia a mensagem via webchat-bot (persiste em Conversas).
    await enterAiModeImplicit(currentBlock);
    if (state.aiAgent && state.conversationId) {
      state.aiHistory.push({ role: 'user', content: value });
      state.isTyping = true;
      render();
      let reply = '';
      try {
        reply = await sendToWebchatBot(value);
      } catch (err) {
        console.error('[Bizon Capture] webchat-bot (implícito) error:', err);
      }
      state.isTyping = false;
      if (reply) {
        state.aiHistory.push({ role: 'assistant', content: reply });
        addMessage(reply);
      } else {
        addMessage('Recebi sua mensagem. Em breve um de nossos atendentes vai responder.');
      }
      render();
    }
  }

  // Handle button click
  async function handleButtonClick(option) {
    // Add user message
    addMessage(option.label, 'user');

    // Store the selection
    const currentBlock = state.blocks[state.currentBlockId];
    if (currentBlock?.data?.variable) {
      state.collectedData[currentBlock.data.variable] = option.value;
    }

    // Navigate to next block
    const nextBlockId = option.nextBlockId || currentBlock?.next_block_id;
    if (nextBlockId) {
      await delay(300);
      await processBlock(nextBlockId);
    }
  }

  // Submit lead to the API
  async function submitLead() {
    const metadata = getPageMetadata();
    
    try {
      await apiCall('submit', {
        funnel_id: config.funnelId,
        visitor_id: state.visitorId,
        channel: 'widget',
        variables: state.collectedData,
        metadata: {
          ...metadata,
          submitted_at: new Date().toISOString()
        }
      });
      console.log('[Bizon Capture] Lead submitted successfully');
    } catch (error) {
      console.error('[Bizon Capture] Failed to submit lead:', error);
    }
  }

  // Initialize the widget
  async function initWidget() {
    state.visitorId = getVisitorId();
    state.conversationId = loadCachedConversationId();
    
    // Create and inject styles
    injectStyles();
    
    // Create container
    createContainer();
    
    // Initial render
    render();

    try {
      const result = await apiCall('get-funnel', {
        funnel_id: config.funnelId,
        channel: 'widget'
      });

      if (!result.funnel) {
        console.error('[Bizon Capture] Funnel not found');
        state.isLoading = false;
        render();
        return;
      }

      state.funnel = result.funnel;
      
      // Parse blocks into a map
      const blocksArray = result.funnel.flow_blocks || [];
      blocksArray.forEach(block => {
        state.blocks[block.id] = block;
      });

      state.isLoading = false;
      state.isInitialized = true;

      // Apply widget config
      applyWidgetConfig();

      render();
    } catch (error) {
      console.error('[Bizon Capture] Init error:', error);
      state.isLoading = false;
      render();
    }
  }

  // Apply widget configuration: prefer per-channel `appearance.widget` (new
  // 4-themes system), fallback to legacy `widget_config`.
  function applyWidgetConfig() {
    const widgetConfig = state.funnel?.widget_config || {};
    const appearance = (state.funnel?.appearance && state.funnel.appearance.widget) || {};
    const channelOpts = appearance.channel_options || {};

    const primaryColor = appearance.primary_color || widgetConfig.primary_color || '#3B82F6';
    const secondaryColor = appearance.secondary_color || primaryColor;
    const bgColor = appearance.background_color || '#FFFFFF';
    const textColor = appearance.text_color || '#1e293b';
    const botBubble = channelOpts.bot_bubble_color || '#f1f5f9';
    const userBubble = channelOpts.user_bubble_color || primaryColor;
    const userBubbleText =
      channelOpts.user_bubble_color && channelOpts.user_bubble_color.toUpperCase() !== primaryColor.toUpperCase()
        ? textColor
        : '#FFFFFF';
    const radius = (appearance.border_radius != null ? appearance.border_radius : 14) + 'px';
    const fontFamily = appearance.font_family
      ? `${appearance.font_family}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
      : `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif`;
    const fontSize = (appearance.font_size_base || 14) + 'px';

    const root = document.documentElement;
    root.style.setProperty('--bizon-primary', primaryColor);
    root.style.setProperty('--bizon-secondary', secondaryColor);
    root.style.setProperty('--bizon-bg', bgColor);
    root.style.setProperty('--bizon-text', textColor);
    root.style.setProperty('--bizon-bot-bubble', botBubble);
    root.style.setProperty('--bizon-user-bubble', userBubble);
    root.style.setProperty('--bizon-user-bubble-text', userBubbleText);
    root.style.setProperty('--bizon-radius', radius);
    root.style.setProperty('--bizon-font', fontFamily);
    root.style.setProperty('--bizon-font-size', fontSize);

    // Save placeholder for input rendering
    state.inputPlaceholder = channelOpts.input_placeholder || null;
    if (appearance.bot_name) {
      state.botName = appearance.bot_name;
    }

    // Inject custom CSS if provided
    if (appearance.custom_css) {
      let customStyle = document.getElementById('bizon-custom-css');
      if (!customStyle) {
        customStyle = document.createElement('style');
        customStyle.id = 'bizon-custom-css';
        document.head.appendChild(customStyle);
      }
      customStyle.textContent = appearance.custom_css;
    }

    // Update button position
    const position = channelOpts.position || widgetConfig.position || 'bottom-right';
    const button = document.getElementById('bizon-capture-button');
    const chat = document.getElementById('bizon-capture-chat');

    if (position === 'bottom-left') {
      if (button) { button.style.right = 'auto'; button.style.left = '20px'; }
      if (chat) { chat.style.right = 'auto'; chat.style.left = '20px'; }
    }
  }

  // Resolve o bloco inicial usando a mesma lógica do PublicChat (/c/:slug):
  // 1) start_block_id, 2) bloco não referenciado (órfão), 3) ordena por posição.
  function resolveStartBlock() {
    const startBlockId = state.funnel?.start_block_id;
    if (startBlockId && state.blocks[startBlockId]) return state.blocks[startBlockId];

    const blocksArray = Object.values(state.blocks);
    if (blocksArray.length === 0) return null;

    const targetedIds = new Set();
    blocksArray.forEach(b => {
      const d = b.data || {};
      [
        b.next_block_id,
        d.true_next_block_id,
        d.false_next_block_id,
        d.true_block_id,
        d.false_block_id,
        d.yes_block_id,
        d.no_block_id,
        ...((d.options || []).map(o => o.next_block_id)),
        ...((d.buttons || []).map(o => o.next_block_id)),
        ...((d.ai_outputs || []).map(o => o.next_block_id)),
      ].filter(Boolean).forEach(id => targetedIds.add(id));
    });

    const welcomeBlock = blocksArray.find(b => b.type === 'welcome');
    if (welcomeBlock) return welcomeBlock;

    const orphan = blocksArray.find(b => !targetedIds.has(b.id));
    if (orphan) return orphan;

    return [...blocksArray].sort((a, b) => {
      const ay = a.position?.y ?? 0;
      const by = b.position?.y ?? 0;
      if (ay !== by) return ay - by;
      return (a.position?.x ?? 0) - (b.position?.x ?? 0);
    })[0];
  }

  // Start the flow when chat opens
  function startFlow() {
    if (state.messages.length > 0) return; // Already started
    const startBlock = resolveStartBlock();
    if (startBlock) {
      processBlock(startBlock.id);
    } else {
      addMessage('Olá! Como posso ajudar?');
    }
  }


  // Toggle chat open/closed
  function toggleChat() {
    state.isOpen = !state.isOpen;
    render();
    
    if (state.isOpen && state.isInitialized && state.messages.length === 0) {
      setTimeout(() => startFlow(), 300);
    }
  }

  // Create the container elements
  function createContainer() {
    const container = document.createElement('div');
    container.id = 'bizon-capture-widget';
    document.body.appendChild(container);
  }

  // Inject CSS styles
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --bizon-primary: #3B82F6;
        --bizon-secondary: #3B82F6;
        --bizon-bg: #ffffff;
        --bizon-text: #1e293b;
        --bizon-bot-bubble: #f1f5f9;
        --bizon-user-bubble: #3B82F6;
        --bizon-user-bubble-text: #ffffff;
        --bizon-radius: 14px;
        --bizon-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        --bizon-font-size: 14px;
      }
      
      #bizon-capture-widget {
        font-family: var(--bizon-font);
        font-size: var(--bizon-font-size);
        line-height: 1.5;
      }
      
      #bizon-capture-button {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: var(--bizon-primary);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        transition: transform 0.2s, box-shadow 0.2s;
        z-index: 999998;
      }
      
      #bizon-capture-button:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.2);
      }
      
      #bizon-capture-button svg {
        width: 28px;
        height: 28px;
        fill: white;
      }
      
      #bizon-capture-chat {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 380px;
        max-width: calc(100vw - 40px);
        height: 520px;
        max-height: calc(100vh - 120px);
        background: var(--bizon-bg);
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
        animation: bizon-slide-up 0.3s ease;
      }
      
      @keyframes bizon-slide-up {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .bizon-header {
        background: var(--bizon-primary);
        color: white;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .bizon-header-info { display: flex; align-items: center; gap: 12px; }
      
      .bizon-avatar {
        width: 40px; height: 40px;
        background: rgba(255,255,255,0.2);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
      }
      
      .bizon-avatar svg { width: 24px; height: 24px; fill: white; }
      
      .bizon-header-title { font-weight: 600; font-size: 16px; }
      .bizon-header-subtitle { font-size: 12px; opacity: 0.9; }
      
      .bizon-close {
        background: none; border: none; color: white;
        cursor: pointer; padding: 4px; opacity: 0.8;
        transition: opacity 0.2s;
      }
      .bizon-close:hover { opacity: 1; }
      
      .bizon-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: var(--bizon-bg);
      }
      
      .bizon-message {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: var(--bizon-radius);
        animation: bizon-fade-in 0.3s ease;
        word-wrap: break-word;
      }
      
      @keyframes bizon-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .bizon-message.bot {
        background: var(--bizon-bot-bubble);
        color: var(--bizon-text);
        align-self: flex-start;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 1px rgba(0,0,0,0.05);
      }
      
      .bizon-message.user {
        background: var(--bizon-user-bubble);
        color: var(--bizon-user-bubble-text);
        align-self: flex-end;
        border-bottom-right-radius: 4px;
        box-shadow: 0 1px 1px rgba(0,0,0,0.05);
      }
      
      .bizon-options {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }
      
      .bizon-option-btn {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px 16px;
        cursor: pointer;
        text-align: left;
        font-size: 14px;
        transition: all 0.2s;
      }
      
      .bizon-option-btn:hover {
        border-color: var(--bizon-primary);
        background: #f8fafc;
      }
      
      .bizon-typing {
        display: flex;
        gap: 4px;
        padding: 12px 16px;
        background: #f1f5f9;
        border-radius: 16px;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
      }
      
      .bizon-typing span {
        width: 8px;
        height: 8px;
        background: #94a3b8;
        border-radius: 50%;
        animation: bizon-bounce 1.4s infinite ease-in-out;
      }
      
      .bizon-typing span:nth-child(1) { animation-delay: 0s; }
      .bizon-typing span:nth-child(2) { animation-delay: 0.2s; }
      .bizon-typing span:nth-child(3) { animation-delay: 0.4s; }
      
      @keyframes bizon-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
      }
      
      .bizon-input-area {
        padding: 12px 16px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 8px;
      }
      
      .bizon-input {
        flex: 1;
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        padding: 10px 16px;
        font-size: 14px;
        color: #1e293b;
        background: #ffffff;
        outline: none;
        transition: border-color 0.2s;
      }
      
      .bizon-input:focus {
        border-color: var(--bizon-primary);
      }
      
      .bizon-send {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--bizon-primary);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s;
      }
      
      .bizon-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .bizon-send svg {
        width: 18px;
        height: 18px;
        fill: white;
      }
      
      .bizon-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #64748b;
      }
      
      .bizon-powered {
        text-align: center;
        padding: 8px;
        font-size: 11px;
        color: #94a3b8;
        background: #f8fafc;
      }
      
      .bizon-powered a {
        color: #64748b;
        text-decoration: none;
      }
      
      @media (max-width: 480px) {
        #bizon-capture-chat {
          bottom: 0;
          right: 0;
          left: 0;
          width: 100%;
          max-width: 100%;
          height: 100%;
          max-height: 100%;
          border-radius: 0;
        }
        
        #bizon-capture-button {
          bottom: 16px;
          right: 16px;
          width: 56px;
          height: 56px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Render the widget
  function render() {
    const container = document.getElementById('bizon-capture-widget');
    if (!container) return;

    const agentName = state.botName || state.funnel?.appearance?.widget?.bot_name || state.funnel?.widget_config?.agent_name || state.funnel?.name || 'Assistente';
    
    // Check if we should show input
    const showInput = state.collectingField !== null && !state.isTyping;
    const lastMessage = state.messages[state.messages.length - 1];
    const showOptions = lastMessage?.options && !state.isTyping;

    container.innerHTML = `
      <button id="bizon-capture-button" onclick="window.__bizonCapture.toggle()" style="${state.isOpen ? 'display: none;' : ''}">
        <svg viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
      </button>
      
      ${state.isOpen ? `
        <div id="bizon-capture-chat">
          <div class="bizon-header">
            <div class="bizon-header-info">
              <div class="bizon-avatar">
                <svg viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
              </div>
              <div>
                <div class="bizon-header-title">${escapeHtml(agentName)}</div>
                <div class="bizon-header-subtitle">Online agora</div>
              </div>
            </div>
            <button class="bizon-close" onclick="window.__bizonCapture.toggle()">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          
          <div class="bizon-messages" id="bizon-capture-messages">
            ${state.isLoading ? `
              <div class="bizon-loading">Carregando...</div>
            ` : `
              ${state.messages.map(msg => `
                <div class="bizon-message ${msg.type}">
                  ${escapeHtml(msg.content)}
                  ${msg.options && msg.type === 'bot' ? `
                    <div class="bizon-options">
                      ${msg.options.map((opt, idx) => `
                        <button class="bizon-option-btn" onclick="window.__bizonCapture.selectOption(${idx}, '${escapeHtml(JSON.stringify(opt))}')">${escapeHtml(opt.label)}</button>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
              ${state.isTyping ? `
                <div class="bizon-typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              ` : ''}
            `}
          </div>
          
          ${showInput && !showOptions ? `
            <div class="bizon-input-area">
              <input 
                type="text" 
                class="bizon-input" 
                placeholder="${getInputPlaceholder()}" 
                id="bizon-capture-input"
                onkeypress="if(event.key === 'Enter') window.__bizonCapture.send()"
              />
              <button class="bizon-send" onclick="window.__bizonCapture.send()">
                <svg viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          ` : ''}
          
          <div class="bizon-powered">
            Powered by <a href="https://bizon.ai" target="_blank">Bizon</a>
          </div>
        </div>
      ` : ''}
    `;

    // Focus input if visible
    if (showInput) {
      setTimeout(() => {
        const input = document.getElementById('bizon-capture-input');
        if (input) input.focus();
      }, 100);
    }
  }

  // Get placeholder text for input
  function getInputPlaceholder() {
    switch (state.collectingField) {
      case 'email': return 'Digite seu e-mail...';
      case 'phone': return 'Digite seu WhatsApp...';
      case 'name': return 'Digite seu nome...';
      default: return state.inputPlaceholder || 'Digite sua mensagem...';
    }
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  // Send message
  function send() {
    const input = document.getElementById('bizon-capture-input');
    if (!input) return;
    
    const value = input.value.trim();
    if (!value) return;
    
    input.value = '';
    handleInput(value);
  }

  // Select option
  function selectOption(index, optionJson) {
    try {
      const option = JSON.parse(optionJson);
      handleButtonClick(option);
    } catch (e) {
      console.error('[Bizon Capture] Failed to parse option:', e);
    }
  }

  // Expose functions globally
  window.__bizonCapture = {
    toggle: toggleChat,
    send: send,
    selectOption: selectOption
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
