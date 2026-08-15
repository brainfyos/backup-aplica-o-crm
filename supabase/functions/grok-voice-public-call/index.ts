// Versão pública do ephemeral-token: resolve voice_agent por public_slug,
// cria um lead novo (visitor) e um call_log, e devolve o token efêmero xAI.
// Sem exigência de auth (verify_jwt = false).

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { buildVoiceInstructions } from '../_shared/voice-prompt-builder.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

interface OutcomeDef { id: string; label: string; kind: string; }
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
    tools.push({ type: 'function', name: 'mostrar_botoes', description: 'Exibe botões clicáveis.', parameters: { type: 'object', properties: { titulo: { type: 'string' }, botoes: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id', 'label'] } } }, required: ['botoes'] } });
  }
  if (cfg.coletar_dado?.enabled !== false) {
    tools.push({ type: 'function', name: 'coletar_dado', description: 'Coleta dado por texto.', parameters: { type: 'object', properties: { campo: { type: 'string', enum: ['nome', 'whatsapp', 'email', 'texto_livre'] }, rotulo: { type: 'string' } }, required: ['campo'] } });
  }
  const links = cfg.abrir_link?.links || [];
  if (cfg.abrir_link?.enabled && links.length) {
    tools.push({ type: 'function', name: 'abrir_link', description: `Abre link. Opções: ${links.map(l => `${l.id}=${l.label}`).join(', ')}`, parameters: { type: 'object', properties: { link_id: { type: 'string', enum: links.map(l => l.id) } }, required: ['link_id'] } });
  }
  const props = cfg.enviar_proposta?.propostas || [];
  if (cfg.enviar_proposta?.enabled && props.length) {
    tools.push({ type: 'function', name: 'enviar_proposta', description: `Envia proposta. Opções: ${props.map(p => `${p.id}=${p.label}`).join(', ')}`, parameters: { type: 'object', properties: { proposta_id: { type: 'string', enum: props.map(p => p.id) } }, required: ['proposta_id'] } });
  }
  if (cfg.agendar_reuniao?.enabled && cfg.agendar_reuniao?.event_type_id) {
    tools.push({ type: 'function', name: 'listar_horarios_reuniao', description: 'Retorna horários REAIS disponíveis. Chame SEMPRE antes de propor — nunca invente.', parameters: { type: 'object', properties: { data: { type: 'string' }, dias_a_frente: { type: 'number' } } } });
    tools.push({ type: 'function', name: 'confirmar_agendamento_reuniao', description: 'Cria o evento no calendário. Só chame após confirmação verbal, passando o start_time EXATO da listagem.', parameters: { type: 'object', properties: { start_time: { type: 'string' }, nome: { type: 'string' }, email: { type: 'string' }, telefone: { type: 'string' } }, required: ['start_time'] } });
    tools.push({ type: 'function', name: 'agendar_reuniao', description: 'Deprecated: seletor visual.', parameters: { type: 'object', properties: { data_preferida: { type: 'string' } } } });
  }
  if (cfg.transferir_humano?.enabled && cfg.transferir_humano?.sector_id) {
    tools.push({ type: 'function', name: 'transferir_humano', description: 'Transfere para humano.', parameters: { type: 'object', properties: { motivo: { type: 'string' } } } });
  }
  tools.push({ type: 'function', name: 'registrar_desfecho', description: `Registra desfecho final. Kinds: ${outcomes.map(o => o.kind).join(', ') || 'lead_qualificado, recusou'}`, parameters: { type: 'object', properties: { outcome_id: { type: 'string' }, resumo: { type: 'string' }, dados: { type: 'object' } }, required: ['outcome_id'] } });
  return tools;
}

function buildInstructions(base: string, outcomes: OutcomeDef[], tools: any[]): string {
  const toolNames = tools.map(t => t.name);
  const outcomeList = outcomes.length
    ? outcomes.map((o, i) => `${i + 1}. ${o.label} (id=${o.id}, kind=${o.kind})`).join('\n')
    : '1. lead_qualificado\n2. recusou';
  const hasScheduling = toolNames.includes('listar_horarios_reuniao');
  const scheduleBlock = hasScheduling
    ? `- AGENDAMENTO: sempre "listar_horarios_reuniao" ANTES de propor horários (nunca invente). Ofereça 2 horários no MESMO dia (um mais cedo, um mais tarde). Só "confirmar_agendamento_reuniao" APÓS confirmação verbal, com start_time EXATO da listagem. Se faltar nome/email/telefone, pergunte antes.\n`
    : '';
  return `${base}\n\n--- Regras desta ligação (Vendus) ---\n` +
    `- Ligação de voz em pt-BR, tom consultivo (SPIN), sem clichês.\n` +
    `- Máximo 2 frases curtas por turno, UMA pergunta por vez.\n` +
    `- Ferramentas: ${toolNames.join(', ')}.\n` +
    `- Sempre use "mostrar_botoes" ao oferecer opções finitas.\n` +
    scheduleBlock +
    `- Para coletar dado preciso, use "coletar_dado".\n` +
    `- Encerre chamando "registrar_desfecho" com um dos desfechos:\n${outcomeList}\n`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { public_slug, visitor } = body || {};
    if (!public_slug) return json({ error: 'public_slug is required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: agent } = await admin
      .from('voice_agents')
      .select('*')
      .eq('public_slug', public_slug)
      .eq('public_enabled', true)
      .maybeSingle();
    if (!agent || !agent.is_active) return json({ error: 'voice agent not found' }, 404);
    const orgId = agent.organization_id;

    let productAgent: any = null;
    if (agent.product_agent_id) {
      const { data: pa } = await admin.from('product_agents').select('*').eq('id', agent.product_agent_id).maybeSingle();
      productAgent = pa;
    }
    const { data: org } = await admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle();

    // Cria lead visitante quando temos algum contato
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
          notes: `Chegou pela página pública /call/${public_slug}`,
        } as any)
        .select('id')
        .maybeSingle();
      leadId = lead?.id || null;
    }

    const basePrompt = productAgent?.system_prompt || productAgent?.persona || agent.system_prompt || 'Você é um agente de vendas consultivo.';
    const parts: string[] = [basePrompt];
    if (productAgent?.objective || agent.objective) parts.push(`\nObjetivo: ${productAgent?.objective || agent.objective}`);
    if (agent.context_override) parts.push(`\n${agent.context_override}`);
    if (org?.name) parts.push(`\nVocê representa: ${org.name}`);
    if (visitor?.name) parts.push(`\n--- Cliente ---\nNome: ${visitor.name}`);
    if (visitor?.contact) parts.push(`Contato: ${visitor.contact}`);

    const outcomes: OutcomeDef[] = Array.isArray(agent.outcomes) && agent.outcomes.length
      ? agent.outcomes
      : [{ id: 'ok', label: 'Lead qualificado', kind: 'lead_qualificado' }, { id: 'recusou', label: 'Recusou', kind: 'recusou' }];
    const toolsCfg: ToolsConfig = agent.tools_config || {};
    const tools = buildTools(toolsCfg, outcomes);
    const instructions = buildInstructions(parts.join('\n'), outcomes, tools);

    const { getOrgProviderKey } = await import('../_shared/voice-credentials.ts');
    const xaiKey = await getOrgProviderKey(admin, orgId, 'xai');
    if (!xaiKey) return json({ error: 'AI_NO_CREDENTIAL: cadastre sua chave xAI em Admin → Integrações → xAI (Grok).' }, 400);

    const { data: callLog, error: clErr } = await admin
      .from('call_logs')
      .insert({
        organization_id: orgId,
        lead_id: leadId,
        voice_agent_id: agent.id,
        provider: 'xai',
        direction: 'web_public',
        status: 'initiated',
        started_at: new Date().toISOString(),
        initiated_by: null,
        metadata: {
          agent_name: agent.name,
          voice: agent.grok_voice_id || agent.voice_option,
          language: agent.language,
          public_slug,
          visitor: visitor || null,
          tools: tools.map(t => t.name),
          outcomes: outcomes.map(o => ({ id: o.id, label: o.label, kind: o.kind })),
        },
      })
      .select('id')
      .single();
    if (clErr || !callLog) return json({ error: clErr?.message || 'failed to create call log' }, 500);

    const r = await fetch(XAI_EPHEMERAL_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${xaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
    if (!r.ok) {
      const txt = await r.text();
      await admin.from('call_logs').update({ status: 'failed', status_reason: `ephemeral ${r.status}: ${txt.slice(0, 200)}`, ended_at: new Date().toISOString() }).eq('id', callLog.id);
      return json({ error: `xAI ephemeral ${r.status}`, detail: txt.slice(0, 300) }, 502);
    }
    const tokenPayload = await r.json();
    const token: string | undefined = tokenPayload?.client_secret?.value || tokenPayload?.client_secret || tokenPayload?.value || tokenPayload?.token;
    if (!token) return json({ error: 'ephemeral response missing token' }, 502);

    const voice = agent.grok_voice_id || agent.voice_option || 'ara';
    const sessionConfig = {
      voice,
      instructions,
      turn_detection: { type: 'server_vad' as const, threshold: 0.6, silence_duration_ms: 700 },
      audio: {
        input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { language_hint: agent.language || 'pt-BR' } },
        output: { format: { type: 'audio/pcm', rate: 24000 } },
      },
      tools,
    };

    return json({
      call_id: callLog.id,
      token,
      model: 'grok-voice-latest',
      session: sessionConfig,
      outcomes,
      tools_meta: {
        abrir_link: toolsCfg.abrir_link?.links || [],
        enviar_proposta: toolsCfg.enviar_proposta?.propostas || [],
        agendar_reuniao_event_type: toolsCfg.agendar_reuniao?.event_type_id || null,
        transferir_humano_sector: toolsCfg.transferir_humano?.sector_id || null,
      },
    });
  } catch (e) {
    console.error('[grok-voice-public-call]', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
