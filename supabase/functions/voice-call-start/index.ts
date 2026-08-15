// Inicia uma sessão de Ligação Web (voice_calls campanha).
// - Cria lead visitante (se dados presentes) + voice_call_sessions + call_logs
// - Monta tools dinâmicas a partir de ctas + capture_fields
// - Escolhe provider (grok/openai) com fallback automático de openai→grok
// - Retorna { provider, token, session } compatível com PublicCall.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { buildVoiceInstructions } from '../_shared/voice-prompt-builder.ts';
import { mintOpenAIRealtime, resolveOpenAIKey } from '../_shared/openai-realtime.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const XAI_EPHEMERAL_ENDPOINT = 'https://api.x.ai/v1/realtime/client_secrets';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface CtaLink { id: string; label: string; url: string }
interface Cta {
  id: string;
  kind: 'link' | 'schedule' | 'whatsapp' | 'interest';
  label: string;
  url?: string;
  links?: CtaLink[];
  event_type_id?: string;
  whatsapp_target?: string;
  tag_id?: string;
  score?: number;
}
interface CaptureField { key: string; label: string; type: string; required?: boolean }

// Achata todos os links de todos os CTAs kind=link (novos + legacy).
function flattenLinks(ctas: Cta[]): CtaLink[] {
  const out: CtaLink[] = [];
  for (const c of ctas) {
    if (c.kind !== 'link') continue;
    if (Array.isArray(c.links) && c.links.length) {
      for (const l of c.links) if (l.url) out.push({ id: l.id, label: l.label || c.label, url: l.url });
    } else if (c.url) {
      out.push({ id: c.id, label: c.label, url: c.url });
    }
  }
  return out;
}

function buildTools(ctas: Cta[], captureFields: CaptureField[], fallbackEventTypeId: string | null) {
  const tools: any[] = [];

  // Captura genérica (sempre)
  tools.push({
    type: 'function', name: 'salvar_dado_lead',
    description: 'Salva um dado do lead capturado durante a conversa. Use para qualquer info além dos campos padrão.',
    parameters: { type: 'object', properties: { chave: { type: 'string' }, valor: { type: 'string' } }, required: ['chave', 'valor'] },
  });

  // Ferramentas para campos configurados
  for (const f of captureFields) {
    tools.push({
      type: 'function', name: `salvar_${f.key}`,
      description: `Salva ${f.label} do lead. ${f.required ? 'OBRIGATÓRIO capturar durante a conversa.' : ''} NUNCA peça no início nem no fim — apenas quando fizer sentido natural.`,
      parameters: { type: 'object', properties: { valor: { type: 'string' } }, required: ['valor'] },
    });
  }

  // CTAs — cada um vira uma tool
  const links = flattenLinks(ctas);
  if (links.length) {
    tools.push({
      type: 'function', name: 'abrir_link',
      description: `Exibe botão(ões) de link ao usuário. Opções: ${links.map(l => `${l.id}=${l.label}`).join(', ')}`,
      parameters: { type: 'object', properties: { link_id: { type: 'string', enum: links.map(l => l.id) } }, required: ['link_id'] },
    });
  }
  const scheduleCta = ctas.find(c => c.kind === 'schedule');
  const effectiveEventTypeId = scheduleCta?.event_type_id || fallbackEventTypeId;
  if (effectiveEventTypeId) {
    tools.push({
      type: 'function', name: 'listar_horarios_reuniao',
      description: 'Retorna horários REAIS disponíveis para agendamento. Chame SEMPRE antes de propor horários — nunca invente.',
      parameters: { type: 'object', properties: {
        data: { type: 'string', description: 'Data preferida no formato YYYY-MM-DD (opcional).' },
        dias_a_frente: { type: 'number', description: 'Quantos dias buscar a partir de hoje. Default 3, máx 7.' },
      } },
    });
    tools.push({
      type: 'function', name: 'confirmar_agendamento_reuniao',
      description: 'Cria o evento no calendário e envia confirmação. Só chame APÓS o cliente confirmar verbalmente um horário retornado por listar_horarios_reuniao.',
      parameters: { type: 'object', properties: {
        start_time: { type: 'string', description: 'ISO exato retornado por listar_horarios_reuniao (ex: 2025-11-12T15:00:00).' },
        nome: { type: 'string' },
        email: { type: 'string' },
        telefone: { type: 'string', description: 'Celular com DDD (será normalizado para DDI 55).' },
      }, required: ['start_time'] },
    });
    tools.push({
      type: 'function', name: 'agendar_reuniao',
      description: 'Deprecated: use listar_horarios_reuniao + confirmar_agendamento_reuniao. Renderiza um seletor visual.',
      parameters: { type: 'object', properties: { data_preferida: { type: 'string' } } },
    });
  }
  const waCta = ctas.find(c => c.kind === 'whatsapp');
  if (waCta) {
    tools.push({
      type: 'function', name: 'enviar_whatsapp',
      description: 'Envia mensagem no WhatsApp do lead.',
      parameters: { type: 'object', properties: { mensagem: { type: 'string' } }, required: ['mensagem'] },
    });
  }
  const interestCtas = ctas.filter(c => c.kind === 'interest');
  if (interestCtas.length) {
    tools.push({
      type: 'function', name: 'aplicar_tag_interesse',
      description: `Aplica tag de interesse no lead. Opções: ${interestCtas.map(c => `${c.id}=${c.label}`).join(', ')}`,
      parameters: { type: 'object', properties: { cta_id: { type: 'string', enum: interestCtas.map(c => c.id) } }, required: ['cta_id'] },
    });
  }

  tools.push({
    type: 'function', name: 'registrar_desfecho',
    description: 'Registra o desfecho final da ligação. Kinds sugeridos: agendou_reuniao, lead_qualificado, sem_interesse, callback.',
    parameters: { type: 'object', properties: { outcome_id: { type: 'string' }, resumo: { type: 'string' }, dados: { type: 'object' } }, required: ['outcome_id'] },
  });

  return tools;
}

function buildCallSpecificRules(ctx: string | null, captureFields: CaptureField[], ctas: Cta[], fallbackEventTypeId: string | null) {
  const captureRules = captureFields.length
    ? `\n--- Dados a capturar (NO MEIO da conversa, nunca no início/fim) ---\n${captureFields.map(f => `- ${f.label} (${f.key})${f.required ? ' [OBRIGATÓRIO]' : ''} → tool salvar_${f.key}`).join('\n')}\nRegra: peça naturalmente ("pra te enviar o link, qual seu ${captureFields[0]?.label}?"). Nunca despeje um formulário.`
    : '';
  const links = flattenLinks(ctas);
  const ctaRules = ctas.length
    ? `\n--- Objetivos disponíveis (tool calling) ---\n${ctas.map(c => `- ${c.label} (${c.kind}) → ${c.kind === 'link' ? `abrir_link com link_id ∈ {${(c.links?.map(l=>l.id).join(',') || c.id)}}` : c.kind === 'schedule' ? 'listar_horarios_reuniao → confirmar_agendamento_reuniao' : c.kind === 'whatsapp' ? 'enviar_whatsapp' : `aplicar_tag_interesse cta_id=${c.id}`}`).join('\n')}${links.length ? `\nLinks disponíveis (id → label → url):\n${links.map(l => `  ${l.id} → ${l.label} → ${l.url}`).join('\n')}` : ''}\nUse o objetivo quando a conversa apontar naturalmente para ele.`
    : '';
  const hasSchedule = ctas.some(c => c.kind === 'schedule' && c.event_type_id) || !!fallbackEventTypeId;
  const scheduleRules = hasSchedule
    ? `\n--- Regras de AGENDAMENTO (obrigatório seguir — MODO PROATIVO) ---
- Ao detectar QUALQUER interesse em agendar/conversar/apresentação/reunião/demonstração: CHAME \`listar_horarios_reuniao\` IMEDIATAMENTE, sem perguntar qual dia. NUNCA diga "que dia é melhor pra você" — a tool mostra as próximas datas úteis reais na tela.
- Enquanto a tool carrega, fale APENAS UMA frase: "Deixa eu te mostrar as próximas datas disponíveis."
- PROIBIDO recitar horários por voz. Os horários aparecem em cards clicáveis. O lead clica → abre um formulário visual (nome / WhatsApp / e-mail) → o agendamento é criado automaticamente.
- NÃO peça nome, e-mail ou telefone antes de \`listar_horarios_reuniao\` — o formulário coleta isso sozinho após o clique.
- Se o lead pedir outra data, a IA responde "Vou te mostrar mais opções" — o botão "Ver outros horários" já está na tela.
- Após confirmação (evento \`voice.booking.confirmed\` chega como tool result com agendado:true), fale EXATAMENTE UMA frase e ENCERRE: "Sua reunião foi agendada com sucesso. Em instantes você recebe a confirmação pelo WhatsApp. Muito obrigado!" — então chame \`registrar_desfecho\` outcome_id="agendou_reuniao". PROIBIDO perguntar "posso ajudar com mais alguma coisa" ou "tem mais alguma dúvida".
- Se retornar cancelled_by_user:true, pergunte com leveza: "Prefere outro horário ou que eu te mande as opções pelo WhatsApp?"
- Se a tool voltar com \`slots: []\` (vazio) ou hint pedindo mais dias, CHAME \`listar_horarios_reuniao\` de novo com \`dias_a_frente: 14\`. NUNCA, EM HIPÓTESE ALGUMA, diga ao lead "não encontrei horários", "não tenho disponibilidade" ou qualquer variação. Sempre há alternativa — insista silenciosamente.
`
    : '';
  return `${ctx ? `\n--- Contexto desta ligação ---\n${ctx}` : ''}${captureRules}${ctaRules}${scheduleRules}\n\n--- Regras da ligação de voz ---\n- Ligação em tempo real. Fale natural, respire, faça pausas.\n- Encerre chamando registrar_desfecho.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { call_slug, visitor, utms } = body || {};
    if (!call_slug) return json({ error: 'call_slug is required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: call } = await admin
      .from('voice_calls')
      .select('*')
      .ilike('slug', call_slug)
      .maybeSingle();
    if (!call) return json({ error: 'call not found' }, 404);
    if (call.status !== 'active') return json({ error: 'call inactive' }, 400);
    const orgId = call.organization_id;

    // Resolve product_agent (fonte da inteligência). Fallback: voice_agents legado.
    let productAgent: any = null;
    let legacyVoiceAgent: any = null;
    if (call.product_agent_id) {
      const { data: pa } = await admin
        .from('product_agents')
        .select('*')
        .eq('id', call.product_agent_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      productAgent = pa;
    }
    if (!productAgent && call.voice_agent_id) {
      const { data: va } = await admin.from('voice_agents').select('*').eq('id', call.voice_agent_id).maybeSingle();
      legacyVoiceAgent = va;
      if (va?.product_agent_id) {
        const { data: pa } = await admin.from('product_agents').select('*').eq('id', va.product_agent_id).maybeSingle();
        productAgent = pa;
      }
    }
    if (!productAgent) return json({ error: 'agente de IA da ligação não configurado' }, 400);

    const { data: org } = await admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle();
    let product: any = null;
    if (productAgent.product_id) {
      const { data: p } = await admin.from('products').select('id, name, description').eq('id', productAgent.product_id).maybeSingle();
      product = p;
    }

    // Lead visitante
    let leadId: string | null = null;
    if (visitor && (visitor.name || visitor.contact)) {
      const rawContact: string = (visitor.contact || '').trim();
      const isEmail = rawContact.includes('@');
      const phone = !isEmail ? rawContact.replace(/\D/g, '') : null;
      const { data: lead } = await admin
        .from('leads')
        .insert({
          organization_id: orgId,
          name: visitor.name || 'Visitante da ligação',
          phone: phone || null,
          email: isEmail ? rawContact : null,
          source: 'ligacao_publica',
          stage: 'novo',
          notes: `Chegou pela campanha ${call.name} (/call/${call.slug})`,
        } as any)
        .select('id')
        .maybeSingle();
      leadId = lead?.id || null;
    }

    const ctas: Cta[] = Array.isArray(call.ctas) ? call.ctas : [];
    const captureFields: CaptureField[] = Array.isArray(call.capture_fields) ? call.capture_fields : [];
    const appearance: any = call.appearance || {};
    const fallbackEventTypeId: string | null = appearance.default_event_type_id || null;
    const scheduleCta = ctas.find((c) => c.kind === 'schedule');
    const tools = buildTools(ctas, captureFields, fallbackEventTypeId);
    const baseInstructions = buildVoiceInstructions({
      productAgent,
      org,
      productName: product?.name,
      productDescription: product?.description,
      visitor: visitor || null,
      callContext: call.context || null,
      extraContext: legacyVoiceAgent?.context_override || null,
    });
    const instructions = baseInstructions + buildCallSpecificRules(null, captureFields, ctas, fallbackEventTypeId);

    // === Resolução de provider (openai / grok / auto) ===
    const desiredProvider: 'grok' | 'openai' | 'auto' =
      (call.voice_provider as any) || (productAgent.voice_provider as any) || 'grok';

    const effectiveVoice = call.grok_voice_id
      || productAgent.default_grok_voice_id
      || legacyVoiceAgent?.grok_voice_id
      || legacyVoiceAgent?.voice_option
      || 'ara';
    const openaiVoice = call.openai_voice_id || productAgent.openai_voice_id || 'sage';
    const effectiveVoiceSettings = (call.voice_settings && Object.keys(call.voice_settings).length)
      ? call.voice_settings
      : (productAgent.voice_settings || legacyVoiceAgent?.voice_settings || {});
    const language = call.language || legacyVoiceAgent?.language || 'pt-BR';

    // Sessão + call_log (comum a ambos providers)
    const initialProvider = desiredProvider === 'auto' ? null : desiredProvider;
    const { data: session, error: sessErr } = await admin
      .from('voice_call_sessions')
      .insert({
        voice_call_id: call.id,
        organization_id: orgId,
        lead_id: leadId,
        utms: utms || {},
        provider: initialProvider,
        voice_id: initialProvider === 'openai' ? openaiVoice : effectiveVoice,
      } as any)
      .select('id')
      .single();
    if (sessErr || !session) return json({ error: sessErr?.message || 'failed session' }, 500);

    // --- Tenta OpenAI se desejado ---
    let useOpenAI = desiredProvider === 'openai' || desiredProvider === 'auto';
    let openaiResult: Awaited<ReturnType<typeof mintOpenAIRealtime>> | null = null;
    if (useOpenAI) {
      const key = await resolveOpenAIKey(admin, orgId);
      if (key) {
        openaiResult = await mintOpenAIRealtime({
          apiKey: key,
          voice: openaiVoice,
          instructions,
          tools,
          language,
        });
        if (!openaiResult.ok) {
          console.warn('[voice-call-start] openai mint failed, fallback to grok:', openaiResult.error);
          // Se explicitamente openai (sem 'auto'), retorna erro claro
          if (desiredProvider === 'openai') {
            return json({ error: `OpenAI Realtime falhou: ${openaiResult.error}` }, openaiResult.status);
          }
          useOpenAI = false;
        }
      } else {
        if (desiredProvider === 'openai') {
          return json({ error: 'OpenAI Realtime configurado como provider, mas nenhuma chave OpenAI cadastrada em Integrações → IA.' }, 400);
        }
        useOpenAI = false;
      }
    }

    if (useOpenAI && openaiResult?.ok) {
      await admin.from('voice_call_sessions').update({
        provider: 'openai',
        voice_id: openaiResult.voice,
        model: openaiResult.model,
      } as any).eq('id', session.id);

      const { data: callLog } = await admin
        .from('call_logs')
        .insert({
          organization_id: orgId,
          lead_id: leadId,
          voice_agent_id: legacyVoiceAgent?.id || null,
          product_agent_id: productAgent.id,
          grok_voice_id: openaiResult.voice,
          provider: 'openai',
          direction: 'web_public',
          status: 'initiated',
          started_at: new Date().toISOString(),
          initiated_by: null,
          metadata: {
            voice_call_id: call.id,
            voice_call_session_id: session.id,
            campaign_name: call.name,
            slug: call.slug,
            visitor: visitor || null,
            utms: utms || {},
            agent_name: productAgent.name,
            voice: openaiResult.voice,
            language,
            engine: 'openai-realtime',
            tools: tools.map(t => t.name),
          },
        } as any)
        .select('id')
        .single();

      return json({
        provider: 'openai',
        call_id: callLog?.id || null,
        session_id: session.id,
        token: openaiResult.token,
        model: openaiResult.model,
        session: openaiResult.session,
        outcomes: [
          { id: 'agendou_reuniao', label: 'Agendou reunião', kind: 'agendou_reuniao' },
          { id: 'lead_qualificado', label: 'Lead qualificado', kind: 'lead_qualificado' },
          { id: 'sem_interesse', label: 'Sem interesse', kind: 'sem_interesse' },
          { id: 'callback', label: 'Retornar depois', kind: 'callback' },
        ],
        tools_meta: {
          abrir_link: flattenLinks(ctas),
          agendar_reuniao_event_type: scheduleCta?.event_type_id || fallbackEventTypeId || null,
          capture_fields: captureFields,
        },
      });
    }

    // --- Fallback / default: xAI Grok ---
    const { getOrgProviderKey } = await import('../_shared/voice-credentials.ts');
    const xaiKey = await getOrgProviderKey(admin, orgId, 'xai');
    if (!xaiKey) return json({ error: 'AI_NO_CREDENTIAL: cadastre sua chave xAI em Admin → Integrações → xAI (Grok).' }, 400);

    await admin.from('voice_call_sessions').update({
      provider: 'grok',
      voice_id: effectiveVoice,
      model: 'grok-voice-latest',
    } as any).eq('id', session.id);



    const { data: callLog } = await admin
      .from('call_logs')
      .insert({
        organization_id: orgId,
        lead_id: leadId,
        voice_agent_id: legacyVoiceAgent?.id || null,
        product_agent_id: productAgent.id,
        grok_voice_id: effectiveVoice,
        provider: 'xai',
        direction: 'web_public',
        status: 'initiated',
        started_at: new Date().toISOString(),
        initiated_by: null,
        metadata: {
          voice_call_id: call.id,
          voice_call_session_id: session.id,
          campaign_name: call.name,
          slug: call.slug,
          visitor: visitor || null,
          utms: utms || {},
          agent_name: productAgent.name,
          voice: effectiveVoice,
          language,
          tools: tools.map(t => t.name),
        },
      } as any)
      .select('id')
      .single();

    // Token efêmero xAI
    const r = await fetch(XAI_EPHEMERAL_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${xaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
    if (!r.ok) {
      const txt = await r.text();
      return json({ error: `xAI ephemeral ${r.status}`, detail: txt.slice(0, 300) }, 502);
    }
    const tokenPayload = await r.json();
    const token: string | undefined = tokenPayload?.client_secret?.value || tokenPayload?.client_secret || tokenPayload?.value || tokenPayload?.token;
    if (!token) return json({ error: 'ephemeral response missing token' }, 502);

    const sessionConfig = {
      voice: effectiveVoice,
      instructions,
      turn_detection: { type: 'server_vad' as const, threshold: 0.6, silence_duration_ms: 700 },
      audio: {
        input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { language_hint: language } },
        output: { format: { type: 'audio/pcm', rate: 24000 } },
      },
      tools,
      ...(effectiveVoiceSettings && Object.keys(effectiveVoiceSettings).length ? { voice_settings: effectiveVoiceSettings } : {}),
    };

    return json({
      provider: 'grok',
      call_id: callLog?.id || null,
      session_id: session.id,
      token,
      model: 'grok-voice-latest',
      session: sessionConfig,
      outcomes: [
        { id: 'agendou_reuniao', label: 'Agendou reunião', kind: 'agendou_reuniao' },
        { id: 'lead_qualificado', label: 'Lead qualificado', kind: 'lead_qualificado' },
        { id: 'sem_interesse', label: 'Sem interesse', kind: 'sem_interesse' },
        { id: 'callback', label: 'Retornar depois', kind: 'callback' },
      ],
      tools_meta: {
        abrir_link: flattenLinks(ctas),
        agendar_reuniao_event_type: scheduleCta?.event_type_id || fallbackEventTypeId || null,
        capture_fields: captureFields,
      },
    });
  } catch (e) {
    console.error('[voice-call-start]', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
