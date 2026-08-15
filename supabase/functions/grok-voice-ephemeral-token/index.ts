// Grok Voice Realtime — Ephemeral Token
// - Valida usuário e organização.
// - Carrega voice_agent (com tools_config, outcomes, prompt do product_agent).
// - Cria call_log (status=initiated, direction=web).
// - Chama xAI /v1/realtime/client_secrets para obter token efêmero (fica no servidor).
// - Devolve { token, call_id, session } prontos para o browser abrir o WebSocket
//   com subprotocol "xai-client-secret.<token>".

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { buildVoiceInstructions } from '../_shared/voice-prompt-builder.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const XAI_EPHEMERAL_ENDPOINT = 'https://api.x.ai/v1/realtime/client_secrets';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface OutcomeDef {
  id: string;
  label: string;
  kind: string;
  screen_config?: Record<string, unknown>;
}

interface ToolsConfig {
  mostrar_botoes?: { enabled?: boolean };
  coletar_dado?: { enabled?: boolean };
  abrir_link?: { enabled?: boolean; links?: Array<{ id: string; label: string; url: string }> };
  enviar_proposta?: { enabled?: boolean; propostas?: Array<{ id: string; label: string; url: string; tipo?: string }> };
  agendar_reuniao?: { enabled?: boolean; event_type_id?: string | null };
  transferir_humano?: { enabled?: boolean; sector_id?: string | null };
}

function buildTools(cfg: ToolsConfig, outcomes: OutcomeDef[]) {
  const tools: any[] = [];

  if (cfg.mostrar_botoes?.enabled !== false) {
    tools.push({
      type: 'function',
      name: 'mostrar_botoes',
      description:
        'Exibe uma lista de botões clicáveis para o cliente escolher opções concretas. Use no lugar de perguntas abertas quando as respostas forem finitas.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Título curto acima dos botões (ex: "Qual você prefere?")' },
          botoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['id', 'label'],
            },
          },
        },
        required: ['botoes'],
      },
    });
  }

  if (cfg.coletar_dado?.enabled !== false) {
    tools.push({
      type: 'function',
      name: 'coletar_dado',
      description:
        'Exibe um input inline para o cliente digitar um dado (nome, whatsapp, email). O cliente vê o campo na tela — use quando precisar de precisão em texto.',
      parameters: {
        type: 'object',
        properties: {
          campo: { type: 'string', enum: ['nome', 'whatsapp', 'email', 'texto_livre'] },
          rotulo: { type: 'string', description: 'Rótulo mostrado ao cliente' },
        },
        required: ['campo'],
      },
    });
  }

  const linkOpts = cfg.abrir_link?.links || [];
  if (cfg.abrir_link?.enabled && linkOpts.length) {
    tools.push({
      type: 'function',
      name: 'abrir_link',
      description: `Abre um link configurado. Opções válidas: ${linkOpts.map((l) => `${l.id}=${l.label}`).join(', ')}`,
      parameters: {
        type: 'object',
        properties: { link_id: { type: 'string', enum: linkOpts.map((l) => l.id) } },
        required: ['link_id'],
      },
    });
  }

  const propostas = cfg.enviar_proposta?.propostas || [];
  if (cfg.enviar_proposta?.enabled && propostas.length) {
    tools.push({
      type: 'function',
      name: 'enviar_proposta',
      description: `Envia uma proposta comercial ao cliente na tela. Opções: ${propostas.map((p) => `${p.id}=${p.label}`).join(', ')}`,
      parameters: {
        type: 'object',
        properties: { proposta_id: { type: 'string', enum: propostas.map((p) => p.id) } },
        required: ['proposta_id'],
      },
    });
  }

  if (cfg.agendar_reuniao?.enabled && cfg.agendar_reuniao?.event_type_id) {
    tools.push({
      type: 'function',
      name: 'listar_horarios_reuniao',
      description: 'Retorna horários REAIS disponíveis do evento configurado. Chame SEMPRE antes de propor horários — nunca invente disponibilidade.',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data preferida (YYYY-MM-DD), opcional.' },
          dias_a_frente: { type: 'number', description: 'Quantos dias buscar. Default 3, máx 7.' },
        },
      },
    });
    tools.push({
      type: 'function',
      name: 'confirmar_agendamento_reuniao',
      description: 'Cria o evento no calendário e envia confirmação. Só chame APÓS confirmação verbal do cliente sobre um horário retornado por listar_horarios_reuniao.',
      parameters: {
        type: 'object',
        properties: {
          start_time: { type: 'string', description: 'ISO exato retornado por listar_horarios_reuniao.' },
          nome: { type: 'string' },
          email: { type: 'string' },
          telefone: { type: 'string' },
        },
        required: ['start_time'],
      },
    });
    // Legacy — mantido para clientes com tela clicável
    tools.push({
      type: 'function',
      name: 'agendar_reuniao',
      description:
        'Deprecated: prefira listar_horarios_reuniao + confirmar_agendamento_reuniao. Abre um seletor visual de horários.',
      parameters: {
        type: 'object',
        properties: {
          data_preferida: { type: 'string', description: 'Data ISO (YYYY-MM-DD) se o cliente indicou preferência, senão hoje' },
        },
      },
    });
  }

  if (cfg.transferir_humano?.enabled && cfg.transferir_humano?.sector_id) {
    tools.push({
      type: 'function',
      name: 'transferir_humano',
      description: 'Transfere a conversa para um atendente humano do setor configurado. Use como último recurso quando o cliente pedir explicitamente.',
      parameters: {
        type: 'object',
        properties: { motivo: { type: 'string' } },
      },
    });
  }

  // Sempre presente — obrigatória
  tools.push({
    type: 'function',
    name: 'registrar_desfecho',
    description:
      `Registra o desfecho final da ligação. Você DEVE chamar esta função antes de encerrar. Tipos válidos: ${outcomes.map((o) => o.kind).join(', ') || 'lead_qualificado, recusou'}`,
    parameters: {
      type: 'object',
      properties: {
        outcome_id: { type: 'string', description: outcomes.length ? `IDs disponíveis: ${outcomes.map((o) => o.id).join(', ')}` : 'ID do desfecho' },
        resumo: { type: 'string', description: 'Resumo em 1 frase do que aconteceu' },
        dados: { type: 'object', description: 'Dados coletados relevantes (nome, contato, valor, motivo, etc)' },
      },
      required: ['outcome_id'],
    },
  });

  return tools;
}

function buildVoiceRules(outcomes: OutcomeDef[], tools: any[]): string {
  const toolNames = tools.map((t) => t.name);
  const outcomeList = outcomes.length
    ? outcomes.map((o, i) => `${i + 1}. ${o.label} (id=${o.id}, kind=${o.kind})`).join('\n')
    : '1. lead_qualificado\n2. recusou';
  const hasScheduling = toolNames.includes('listar_horarios_reuniao');
  const scheduleBlock = hasScheduling
    ? `- AGENDAMENTO: sempre chame "listar_horarios_reuniao" ANTES de propor horários (nunca invente). Ofereça no máximo 2 horários por vez, um mais cedo e um mais tarde no mesmo dia. Só chame "confirmar_agendamento_reuniao" APÓS o cliente confirmar verbalmente, passando o start_time EXATO retornado pela listagem. Se faltar nome/email/telefone, pergunte ANTES de confirmar.\n`
    : '';
  return `\n\n--- Regras desta ligação de voz ---\n` +
    `- Você conduz uma LIGAÇÃO DE VOZ em tempo real. Fale de forma natural, respire, faça pausas.\n` +
    `- Ferramentas disponíveis: ${toolNames.join(', ')}.\n` +
    `- Sempre que oferecer opções finitas ao cliente, use "mostrar_botoes" no lugar de listar em voz.\n` +
    scheduleBlock +
    `- Para coletar nome/whatsapp/email com precisão, use "coletar_dado".\n` +
    `- Você DEVE terminar a conversa chamando "registrar_desfecho" com um dos desfechos:\n${outcomeList}\n` +
    `- Nunca desligue sem chamar registrar_desfecho.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing auth' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'not authenticated' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      product_agent_id: bodyProductAgentId,
      voice_agent_id: legacyVoiceAgentId,
      grok_voice_id: bodyGrokVoiceId,
      voice_settings: bodyVoiceSettings,
      language: bodyLanguage,
      context_override: bodyContextOverride,
      tools_config: bodyToolsConfig,
      outcomes: bodyOutcomes,
      lead_id,
    } = body || {};
    if (!bodyProductAgentId && !legacyVoiceAgentId) {
      return json({ error: 'product_agent_id is required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();
    if (!profile?.organization_id) return json({ error: 'user has no organization' }, 400);
    const orgId = profile.organization_id;

    // Legado: se veio só voice_agent_id, resolve o product_agent_id/voz a partir dele.
    let legacyAgent: any = null;
    let productAgentId: string | null = bodyProductAgentId || null;
    let grokVoiceId: string | null = bodyGrokVoiceId || null;
    let voiceSettings: any = bodyVoiceSettings || null;
    let language: string = bodyLanguage || 'pt-BR';
    let toolsCfg: ToolsConfig = (bodyToolsConfig as ToolsConfig) || {};
    let outcomes: OutcomeDef[] = Array.isArray(bodyOutcomes) ? bodyOutcomes : [];
    let contextOverride: string | null = bodyContextOverride || null;
    if (!productAgentId && legacyVoiceAgentId) {
      const { data: va } = await admin
        .from('voice_agents')
        .select('*')
        .eq('id', legacyVoiceAgentId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (!va) return json({ error: 'voice agent not found' }, 404);
      legacyAgent = va;
      productAgentId = va.product_agent_id || null;
      grokVoiceId = grokVoiceId || va.grok_voice_id || va.voice_option || null;
      voiceSettings = voiceSettings || va.voice_settings || null;
      language = bodyLanguage || va.language || 'pt-BR';
      if (!Object.keys(toolsCfg).length) toolsCfg = (va.tools_config as ToolsConfig) || {};
      if (!outcomes.length && Array.isArray(va.outcomes)) outcomes = va.outcomes;
      contextOverride = contextOverride || va.context_override || null;
    }

    if (!productAgentId) return json({ error: 'product_agent_id is required' }, 400);

    const { data: productAgent } = await admin
      .from('product_agents')
      .select('*')
      .eq('id', productAgentId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!productAgent) return json({ error: 'agente de IA não encontrado' }, 404);

    // Voz efetiva: body → agente.default_grok_voice_id → legado → default 'ara'
    const effectiveVoice = grokVoiceId || productAgent.default_grok_voice_id || 'ara';
    const effectiveVoiceSettings = voiceSettings && Object.keys(voiceSettings).length
      ? voiceSettings
      : (productAgent.voice_settings || {});

    let lead: any = null;
    if (lead_id) {
      const { data: l } = await admin.from('leads').select('id, name, phone, email, company, stage').eq('id', lead_id).eq('organization_id', orgId).maybeSingle();
      lead = l;
    }

    // Produto vinculado ao agente (para nome/descrição no prompt)
    let product: any = null;
    if (productAgent.product_id) {
      const { data: p } = await admin.from('products').select('id, name, description').eq('id', productAgent.product_id).maybeSingle();
      product = p;
    }

    const { data: org } = await admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle();

    if (!outcomes.length) {
      outcomes = [
        { id: 'ok', label: 'Lead qualificado', kind: 'lead_qualificado' },
        { id: 'recusou', label: 'Recusou', kind: 'recusou' },
      ];
    }
    const tools = buildTools(toolsCfg, outcomes);
    const baseInstructions = buildVoiceInstructions({
      productAgent,
      org,
      productName: product?.name,
      productDescription: product?.description,
      lead,
      extraContext: contextOverride,
    });
    const instructions = baseInstructions + buildVoiceRules(outcomes, tools);

    // XAI key: apenas da org (multi-tenant, sem env global)
    const { getOrgProviderKey } = await import('../_shared/voice-credentials.ts');
    const xaiKey = await getOrgProviderKey(admin, orgId, 'xai');
    if (!xaiKey) return json({ error: 'AI_NO_CREDENTIAL: cadastre sua chave xAI em Admin → Integrações → xAI (Grok).' }, 400);

    // Cria call_log ANTES do token (assim se falhar temos rastro)
    const { data: callLog, error: clErr } = await admin
      .from('call_logs')
      .insert({
        organization_id: orgId,
        lead_id: lead?.id || null,
        voice_agent_id: legacyAgent?.id || null,
        product_agent_id: productAgent.id,
        grok_voice_id: effectiveVoice,
        provider: 'xai',
        direction: 'web',
        status: 'initiated',
        started_at: new Date().toISOString(),
        initiated_by: userId,
        metadata: {
          agent_name: productAgent.name,
          voice: effectiveVoice,
          language,
          tools: tools.map((t) => t.name),
          outcomes: outcomes.map((o) => ({ id: o.id, label: o.label, kind: o.kind })),
        },
      })
      .select('id')
      .single();
    if (clErr || !callLog) return json({ error: clErr?.message || 'failed to create call log' }, 500);

    // Requisita ephemeral token à xAI
    const r = await fetch(XAI_EPHEMERAL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${xaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
    if (!r.ok) {
      const txt = await r.text();
      await admin.from('call_logs').update({ status: 'failed', status_reason: `ephemeral ${r.status}: ${txt.slice(0, 200)}`, ended_at: new Date().toISOString() }).eq('id', callLog.id);
      return json({ error: `xAI ephemeral ${r.status}`, detail: txt.slice(0, 300) }, 502);
    }
    const tokenPayload = await r.json();
    // xAI retorna algo como { client_secret: { value: "...", expires_at: ... } } — normalizamos
    const token: string | undefined =
      tokenPayload?.client_secret?.value ||
      tokenPayload?.client_secret ||
      tokenPayload?.value ||
      tokenPayload?.token;
    if (!token) {
      return json({ error: 'ephemeral response missing token', raw: tokenPayload }, 502);
    }

    const sessionConfig = {
      voice: effectiveVoice,
      instructions,
      turn_detection: { type: 'server_vad' as const, threshold: 0.6, silence_duration_ms: 700 },
      audio: {
        input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { language_hint: language || 'pt-BR' } },
        output: { format: { type: 'audio/pcm', rate: 24000 } },
      },
      tools,
      ...(effectiveVoiceSettings && Object.keys(effectiveVoiceSettings).length ? { voice_settings: effectiveVoiceSettings } : {}),
    };

    return json({
      call_id: callLog.id,
      token,
      model: 'grok-voice-latest',
      session: sessionConfig,
      outcomes,
      tools_meta: {
        abrir_link: cfg_or_empty(toolsCfg.abrir_link?.links),
        enviar_proposta: cfg_or_empty(toolsCfg.enviar_proposta?.propostas),
        agendar_reuniao_event_type: toolsCfg.agendar_reuniao?.event_type_id || null,
        transferir_humano_sector: toolsCfg.transferir_humano?.sector_id || null,
      },
    });
  } catch (e) {
    console.error('[grok-voice-ephemeral-token] error', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});

function cfg_or_empty<T>(x: T[] | undefined | null): T[] { return Array.isArray(x) ? x : []; }
