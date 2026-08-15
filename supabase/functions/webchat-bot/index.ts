import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { matchAgentByMessage, type MatcherChannel } from "../_shared/agent-matcher.ts";
import { parseHandoffTag, handoffTargetToAgentRole } from "../_shared/handoff-parser.ts";
import { runOrchestrator, type Intent } from "../_shared/orchestrator.ts";
import {
  formatMenuMessage,
  matchMenuOption,
  sanitizeMenuOptions,
  getInvalidMessage,
  type QuickMenuOption,
} from "../_shared/quick-menu.ts";
import {
  listTools as listRegistryTools,
  toolsToOpenAISchema as registryToolsToSchema,
  executeTool as executeRegistryTool,
  getTool as getRegistryTool,
} from "../_shared/tools/registry.ts";
import { resolveAIConfig, logAIConfig, prepareAIRequestBody, recordAIUsage, type ResolvedAIConfig } from "../_shared/ai-router.ts";
import { aiChatWithFallback } from "../_shared/ai-fallback.ts";
import { checkBotLoop } from "../_shared/bot-loop-guard.ts";
import { sanitizeAgentOutput, extractLeakedToolCalls, detectDegenerateRepetition } from "../_shared/sanitize-agent-output.ts";
import { humanize, buildHumanizationPromptBlock, detectReaction, type HumanizationConfig, type HumanizationChannel, type ReactionsConfig } from "../_shared/humanizer.ts";
import { extractFirstName, safeFirstName } from "../_shared/name-utils.ts";
import { getBusinessHoursContext, renderBusinessHoursPromptBlock } from "../_shared/businessHoursContext.ts";
import { buildTemporalPromptBlock } from "../_shared/temporalContext.ts";
import { getTransferRules, matchTransferRule, buildTransferRulesPrompt } from "../_shared/agent-transfer-rules.ts";
import {
  collectApprovedUrls,
  extractUrls,
  guardOutboundUrls,
} from "../_shared/approved-url-guard.mjs";

// Map orchestrator intent → preferred specialist agent_type(s) (in order of preference)
function mapIntentToRoles(intent: Intent): string[] {
  switch (intent) {
    case 'compra': return ['closer', 'sdr'];
    case 'informacao': return ['sdr', 'closer'];
    case 'suporte': return ['support'];
    case 'financeiro': return ['financial'];
    case 'humano': return [];
    case 'indefinida':
    default: return ['sdr', 'closer'];
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Handoff helpers ────────────────────────────────────────────────────────
const DEFAULT_HANDOFF_OUTGOING =
  'Beleza, {{nome}}! Vou te passar pra {{proximo_agente}}, que segue daqui contigo. Já te chama em instantes.';

const KNOWN_PLACEHOLDERS = new Set([
  'nome', 'produto', 'agente_anterior', 'agent_name', 'resumo', 'proximo_agente',
]);

function renderHandoffTpl(tpl: string, vars: Record<string, string>): string {
  return tpl
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Remove placeholders {{xxx}} que o modelo escreveu mas que ninguém vai
 * renderizar (ex: {{checkout_link}}). Mantém apenas variáveis conhecidas.
 * Se uma linha ficar vazia/só com placeholder, ela é removida.
 */
function stripUnrenderedPlaceholders(text: string): string {
  if (!text || !text.includes('{{')) return text;
  let removed = 0;
  const cleaned = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => {
    if (KNOWN_PLACEHOLDERS.has(k)) return m;
    removed++;
    return '';
  });
  // Drop linhas que ficaram só com pontuação/espaço
  const lines = cleaned.split('\n').filter((ln) => ln.replace(/[\s\.,;:!?\-—_]/g, '').length > 0);
  if (removed > 0) {
    console.log('[webchat-bot] ⚠️ stripped unrendered placeholders, count=', removed);
  }
  return lines.join('\n').trim();
}

/**
 * Detecta tags falsas de transferência que o modelo às vezes inventa
 * (ex: "[TRANSFER]", "[TRANSFERIR]", "[HANDOFF]" sem :role, "[PASSAR]").
 * Retorna { cleaned, fakeFound }.
 */
const VALID_HANDOFF_ROLES = ['sdr', 'closer', 'support', 'financial', 'humano', 'human'];
function stripFakeHandoffTags(text: string): { cleaned: string; fakeFound: boolean } {
  if (!text) return { cleaned: text, fakeFound: false };
  let fakeFound = false;
  const fakeRe = /\[\s*(?:transfer(?:ir)?|hand[\s_-]*off|passar(?:\s+para[^\]]*)?|enviar\s+para[^\]]*|transferir\s+para[^\]]*)\s*\]/gi;
  const invalidRoleRe = /\[\s*handoff\s*:\s*([a-z_]+)\s*\]/gi;
  let cleaned = text.replace(fakeRe, () => { fakeFound = true; return ''; });
  cleaned = cleaned.replace(invalidRoleRe, (m, role: string) => {
    if (VALID_HANDOFF_ROLES.includes(role.toLowerCase())) return m;
    fakeFound = true;
    return '';
  });
  // Remove "entregáveis" inventados em colchetes (ex: "[Depoimento: https://...]",
  // "[Vídeo aqui]", "[Link]", "[Material]"). Se o agente quiser enviar mídia,
  // tem que usar send_catalog_item / send_video — não escrever placeholders.
  const fakeAssetRe = /\[\s*(?:depoimento|case|v[ií]deo|pdf|ficha|folder|material|link|prova[\s_-]*social|brochura)\b[^\]]*\]/gi;
  cleaned = cleaned.replace(fakeAssetRe, () => { fakeFound = true; return ''; });
  cleaned = cleaned.split('\n').filter((ln) => ln.replace(/[\s\.,;:!?\-—_]/g, '').length > 0).join('\n').trim();
  return { cleaned, fakeFound };
}

// ============================================================
// In-memory state for orchestrator TEST mode (AgentEditor → Testar).
// Keyed by the synthetic conversation_id sent by the test client.
// Each entry has its own state machine (idle → aguardando_menu →
// em_atendimento|humano). Auto-expires after TEST_STATE_TTL_MS.
// Lives only inside this isolate; perfectly fine for interactive testing.
// ============================================================
type OrchestratorTestState = {
  state: 'idle' | 'aguardando_menu' | 'em_atendimento' | 'humano';
  questionCount: number;
  context: string;
  routedAgentId: string | null;
  routedAgentName: string | null;
  updatedAt: number;
};
const TEST_STATE_TTL_MS = 30 * 60 * 1000; // 30 min
const orchestratorTestStates = new Map<string, OrchestratorTestState>();

function getTestState(key: string): OrchestratorTestState {
  // Lazy GC: prune anything older than TTL on access.
  const now = Date.now();
  for (const [k, v] of orchestratorTestStates) {
    if (now - v.updatedAt > TEST_STATE_TTL_MS) orchestratorTestStates.delete(k);
  }
  let s = orchestratorTestStates.get(key);
  if (!s) {
    s = {
      state: 'idle',
      questionCount: 0,
      context: '',
      routedAgentId: null,
      routedAgentName: null,
      updatedAt: now,
    };
    orchestratorTestStates.set(key, s);
  }
  return s;
}

function saveTestState(key: string, patch: Partial<OrchestratorTestState>) {
  const cur = getTestState(key);
  Object.assign(cur, patch, { updatedAt: Date.now() });
}

interface BotRequest {
  conversation_id: string;
  message: string;
  product_id?: string;
  channel?: string;
  is_test?: boolean;
  /**
   * When set, signals a special test flow:
   *   'orchestrator' — run welcome+menu+routing using in-memory state
   *                    (no DB writes), so admins can test the orchestrator
   *                    agent end-to-end from the AgentEditor "Testar" tab.
   */
  test_mode?: 'orchestrator';
  visitor_name?: string;
  agent_id?: string;  // Specific agent to use
  // Flow execution fields
  flow_context?: {
    current_flow_id: string | null;
    current_block_id: string | null;
    flow_variables: Record<string, string>;
    flow_completed: boolean;
  };
  agent_config: {
    agent_name: string;
    system_prompt: string;
    sales_prompt?: string;
    knowledge_base: string | null;
    faq: Array<{ question: string; answer: string }>;
    fallback_message: string;
    temperature?: number;
    max_tokens?: number;
    persona_style?: string;
    use_product_brain?: boolean;
    chunked_messages_enabled?: boolean;
    typing_delay_ms?: number;
    max_message_length?: number;
  };
}

// Product Agent interface
interface ProductAgent {
  id: string;
  name: string;
  agent_type: string;
  primary_objective: string;
  can_do: string[];
  cannot_do: string[];
  handoff_triggers: string[];
  tone_style: string;
  message_style: string;
  always_end_with_question: boolean;
  additional_prompt: string | null;
  required_phrases: string[];
  prohibited_phrases: string[];
  is_active: boolean;
  is_default: boolean;
  // Tool permissions
  can_update_pipeline: boolean;
  can_create_tasks: boolean;
  can_schedule_meetings: boolean;
  can_apply_tags: boolean;
  can_update_lead: boolean;
  can_send_emails: boolean;
  can_send_materials: boolean;
  can_trigger_flows: boolean;
  can_transfer: boolean;
  can_notify: boolean;
  can_add_notes: boolean;
  can_start_cadence: boolean;
  can_qualify: boolean;
  tool_configs: Record<string, any>;
  // Optional fields used for routing/persona heuristics
  product_id?: string | null;
  personality?: string | null;
  organization_id?: string | null;
}

interface KnowledgeSource {
  source_type: string;
  title: string;
  extracted_content: string | null;
  transcript: string | null;
  question: string | null;
  answer: string | null;
}

interface Product {
  name: string;
  description: string | null;
  pitch_15s: string | null;
  pitch_30s: string | null;
  pitch_2min: string | null;
  icp: string | null;
  differentials: string[] | null;
}

interface Objection {
  what_they_say: string;
  suggested_response: string;
}

interface TrainingMaterial {
  title: string;
  category: string;
  extracted_content: string | null;
}

interface ProductCTA {
  id: string;
  cta_type: string;
  label: string;
  action_url: string | null;
  whatsapp_number: string | null;
  whatsapp_message: string | null;
  video_url: string | null;
  intent_level: string;
  trigger_keywords: string[] | null;
}

interface ChatButton {
  id: string;
  label: string;
  type: 'url' | 'whatsapp' | 'callback' | 'calendar' | 'video' | 'flow_button';
  action: string;
  style: 'primary' | 'secondary' | 'outline';
  cta_type: string;
}

// Flow Block Types
type ButtonActionType = 'next_block' | 'url' | 'whatsapp' | 'handoff' | 'ai_takeover';

interface FlowBlockButton {
  id: string;
  label: string;
  emoji?: string;
  action_type: ButtonActionType;
  next_block_id: string | null;
  url?: string;
  open_in_new_tab?: boolean;
  whatsapp_number?: string;
  whatsapp_message?: string;
  ai_context?: string;
}

interface FlowBlock {
  id: string;
  type: 'message' | 'input' | 'buttons' | 'ai_takeover' | 'handoff' | 'tag' | 'video' | 'delay' | 'agent_switch';
  position: { x: number; y: number };
  data: {
    content?: string;
    delay_ms?: number;
    input_type?: string;
    variable_name?: string;
    placeholder?: string;
    validation?: string;
    error_message?: string;
    buttons?: FlowBlockButton[];
    buttons_layout?: string;
    ai_context_prompt?: string;
    transfer_variables?: boolean;
    handoff_message?: string;
    handoff_target?: string;
    handoff_user_id?: string;
    handoff_squad_id?: string;
    tag_name?: string;
    tag_value?: string;
    video_url?: string;
    video_title?: string;
    delay_seconds?: number;
    agent_id?: string;  // For agent_switch and ai_takeover blocks
    // Override permissions (for ai_takeover)
    override_can_do?: string[];
    override_cannot_do?: string[];
    override_handoff_triggers?: string[];
    // Auto-switch configuration (for ai_takeover)
    auto_switch_enabled?: boolean;
    auto_switch_agents?: Array<{
      agent_id: string;
      trigger_condition: string;
    }>;
  };
  next_block_id?: string | null;
}

interface ChatFlow {
  id: string;
  blocks: FlowBlock[];
  start_block_id: string | null;
  collected_variables: Array<{ name: string; type: string; label: string }>;
}

// Agent type labels
const AGENT_TYPE_LABELS: Record<string, string> = {
  sdr: 'SDR (Qualificação)',
  closer: 'Closer (Fechamento)',
  support: 'Suporte',
  financial: 'Financeiro',
  admin: 'Administrativo',
  custom: 'Personalizado',
};

// Default super sales prompt - Vendedor Consultivo Estratégico
const DEFAULT_SALES_PROMPT = `Você é um VENDEDOR CONSULTIVO ESTRATÉGICO de alta performance. Sua missão é VENDER através de CONEXÃO GENUÍNA e DIAGNÓSTICO REAL, não apenas informar.

═══════════════════════════════════════
REGRAS CRÍTICAS ANTI-REPETIÇÃO
═══════════════════════════════════════

ANTES de responder, ANALISE TODO o histórico da conversa e siga estas regras:

1. NUNCA repita a mesma saudação, frase de abertura ou encerramento já usada no histórico
2. NUNCA use o mesmo emoji em 2 mensagens consecutivas (máximo 1 emoji por mensagem)
3. Se já agendou reunião, NÃO ofereça agendar novamente
4. Se já coletou email/telefone, NÃO peça novamente
5. Se já apresentou o produto, NÃO repita a apresentação — avance para próxima etapa
6. Cada mensagem DEVE progredir a conversa — nunca voltar a um ponto já coberto

FRASES ABSOLUTAMENTE PROIBIDAS:
- "Tudo ótimo por aqui"
- "Fechar com chave de ouro"
- "Fico à disposição"
- "Sem problemas"
- "Fique à vontade"
- "Com certeza"
- "Perfeito!"
- Qualquer frase que já apareceu no histórico desta conversa

═══════════════════════════════════════
TÉCNICA DE VENDAS CONSULTIVAS (SPIN)
═══════════════════════════════════════

Siga esta progressão natural (NÃO pule etapas):

1. SITUAÇÃO (1-2 msgs): Entenda o cenário atual do cliente
   - "Como funciona [processo X] hoje na sua operação?"
   - "Quanto tempo vocês dedicam a [atividade Y] por semana?"

2. PROBLEMA (1-2 msgs): Identifique a DOR real
   - "E o que mais te incomoda nesse processo atual?"
   - "Qual o maior gargalo que vocês enfrentam com isso?"

3. IMPLICAÇÃO (1 msg): Amplifique a dor com consequências
   - "E isso acaba impactando [resultado Z] de que forma?"
   - "Quanto vocês estimam que perdem por causa disso?"

4. NECESSIDADE (1 msg): Faça o cliente verbalizar a solução
   - "Se você pudesse resolver isso, qual seria o cenário ideal?"
   - "O que mudaria na sua operação se [problema] não existisse mais?"

5. SOLUÇÃO (1-2 msgs): Conecte benefício específico à dor identificada
   - Não liste features — mostre como resolve a DOR específica que ele mencionou

6. AÇÃO (1 msg): Conduza para próximo passo concreto e específico

═══════════════════════════════════════
ESTILO DE COMUNICAÇÃO
═══════════════════════════════════════

- Mensagens CURTAS: máximo 3-4 linhas por mensagem
- Envie TUDO em UMA ÚNICA mensagem — NUNCA quebre em múltiplos parágrafos separados por \\n\\n
- Se a resposta ficar longa, resuma e priorize o mais importante em um único bloco
- SEMPRE termine com UMA pergunta que avança a venda
- Use o NOME do cliente quando souber (mas não em toda mensagem)
- Fale como humano — linguagem natural do dia-a-dia
- Seja específico: números, exemplos reais, dados concretos
- NUNCA faça mais de 1 pergunta por mensagem
- Varie a estrutura: alterne perguntas diretas, observações e provocações
- Adapte o tom ao humor do cliente (se ele é direto, seja direto; se é detalhista, dê detalhes)

═══════════════════════════════════════
O QUE NUNCA FAZER
═══════════════════════════════════════

- Respostas longas (mais de 2 linhas em um único bloco)
- Mensagens com mais de 150 caracteres sem quebra de parágrafo
- Listar features sem conectar a benefício/dor
- Responder sem fazer pergunta de retorno
- Parecer genérico ou robotizado
- Dar toda informação de uma vez — dê aos poucos, uma coisa por mensagem
- Repetir qualquer elemento do histórico (saudações, emojis, frases)
- Usar mais de 1 emoji por mensagem
- Ignorar o que já foi discutido/combinado na conversa`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: BotRequest = await req.json();
    
    console.log('[webchat-bot] Request received for conversation:', body.conversation_id);
    console.log('[webchat-bot] Message:', body.message?.substring(0, 100));
    console.log('[webchat-bot] Visitor name:', body.visitor_name);
    console.log('[webchat-bot] Flow context:', body.flow_context);

    // Required: conversation_id + message. Agent is optional here because the
    // orchestrator may take over and resolve the specialist agent downstream.
    if (!body.conversation_id || !body.message) {
      console.error('[webchat-bot] Missing required fields (conversation_id/message)');
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================
    // 🔒 HUMAN TAKEOVER GUARD (CRITICAL)
    // If a human seller has taken over this conversation, the AI must NOT
    // respond — not even with a fallback. Any reply here would "talk over"
    // the seller and confuse the customer (e.g., "Desculpe, não entendi"
    // sent right after the seller's message).
    // The whatsapp-webhook does this check too (defense-in-depth), but
    // webchat-bot is also called by other entrypoints (Inbox revival,
    // simulator, social channels), so we MUST guard here as well.
    // ============================================================
    try {
      const { data: convStatus } = await supabase
        .from('webchat_conversations')
        .select('status, channel, current_agent_id, instagram_ai_flow_id, organization_id, lead_id')
        .eq('id', body.conversation_id)
        .maybeSingle();

      if (convStatus?.channel === 'whatsapp' && convStatus.lead_id) {
        const { data: leadPermission } = await supabase
          .from('leads')
          .select('whatsapp_opt_in')
          .eq('id', convStatus.lead_id)
          .maybeSingle();
        if (leadPermission?.whatsapp_opt_in === false) {
          console.log('[webchat-bot] Lead opted out of WhatsApp, skipping AI');
          return new Response(
            JSON.stringify({ ok: true, skipped: true, reason: 'OPTED_OUT', code: 'OPTED_OUT' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
      if (convStatus?.status === 'human_active' || convStatus?.status === 'waiting_human') {
        console.log('[webchat-bot] 🔒 Conversation is with human (' + convStatus.status + '), skipping AI');
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: 'human_active' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Instagram é opt-in por fluxo: conexão, palavra-chave, agente padrão ou
      // current_agent_id legado nunca bastam. A autorização precisa vir de um
      // fluxo ativo que contenha um bloco IA assume para este mesmo agente.
      if (convStatus?.channel === 'instagram') {
        const agentId = String(body.agent_id ?? '');
        const flowId = String((convStatus as any).instagram_ai_flow_id ?? '');
        const assignedAgentId = String((convStatus as any).current_agent_id ?? '');
        let authorized = !!agentId && !!flowId && assignedAgentId === agentId && convStatus.status === 'bot_active';
        if (authorized) {
          const { data: flow } = await supabase
            .from('instagram_flows')
            .select('status, flow_blocks, organization_id')
            .eq('id', flowId)
            .maybeSingle();
          const blocks = Array.isArray((flow as any)?.flow_blocks) ? (flow as any).flow_blocks : [];
          authorized = !!flow
            && flow.status === 'active'
            && flow.organization_id === convStatus.organization_id
            && blocks.some((block: any) =>
              block?.type === 'ai_takeover' && String(block?.data?.agent_id ?? '') === agentId
            );
        }
        if (!authorized) {
          console.warn('[webchat-bot] instagram AI blocked: explicit flow authorization required', {
            conversation_id: body.conversation_id,
            agent_id: agentId || null,
            flow_id: flowId || null,
          });
          return new Response(
            JSON.stringify({ ok: true, skipped: true, reason: 'instagram_flow_authorization_required' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch (e) {
      console.warn('[webchat-bot] human takeover precheck failed:', e);
      // Instagram is strictly opt-in. If the database check is unavailable,
      // do not guess: fail closed so an unverified agent can never answer.
      if (String(body.channel ?? '').toLowerCase() === 'instagram') {
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: 'instagram_authorization_check_failed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ============================================================
    // 🤖 BOT-LOOP GUARD (global token-saver)
    // If the other side is another bot/AI/autoresponder, abort here
    // BEFORE we hit the gateway. Marks the conversation as
    // waiting_human, stops cadences/campaigns and notifies admins.
    // Skipped in test/simulator mode.
    // ============================================================
    if (!body.is_test && body.test_mode !== 'orchestrator') {
      try {
        const guard = await checkBotLoop(supabase, {
          conversationId: body.conversation_id,
          inboundText: body.message,
        });
        if (guard.tripped) {
          console.warn(`[webchat-bot] 🤖 bot-loop guard tripped (${guard.reason}) — skipping AI`);
          return new Response(
            JSON.stringify({ ok: true, skipped: true, reason: 'bot_loop_detected', detail: guard.reason }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e) {
        console.warn('[webchat-bot] bot-loop guard error (non-fatal):', e);
      }
    }

    // If no agent_config was passed, create a minimal default. The actual
    // specialist agent (if any) will be resolved later by orchestrator /
    // keyword matcher / instance-bound fallback / product default agent.
    if (!body.agent_config) {
      body.agent_config = {
        agent_name: 'Assistente',
        system_prompt: '',
        knowledge_base: null,
        faq: [],
        fallback_message: 'Vou pedir para um atendente humano continuar o seu atendimento, só um instante. 🙋',
        use_product_brain: true,
      };
    }

    // ============================================================
    // ORCHESTRATOR TEST MODE
    // When the AgentEditor "Testar" tab is testing an Orchestrator-style
    // agent, run a self-contained simulation of welcome → menu → routing
    // using in-memory state. No DB writes, no specialist execution —
    // the goal is to let admins validate the orchestrator's UX exactly
    // as the lead would experience it.
    // ============================================================
    if (body.is_test === true && body.test_mode === 'orchestrator' && body.agent_id) {
      try {
        const { data: orchAgent } = await supabase
          .from('product_agents')
          .select('id, name, agent_type, organization_id, welcome_enabled, welcome_message, quick_menu_mode, quick_menu_intro, quick_menu_options, quick_menu_invalid_message')
          .eq('id', body.agent_id)
          .maybeSingle();

        if (!orchAgent) {
          return new Response(
            JSON.stringify({
              message: { content: '⚠️ Agente não encontrado para o teste.', message_type: 'text' },
              response: '⚠️ Agente não encontrado para o teste.',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const menuOptions: QuickMenuOption[] = sanitizeMenuOptions((orchAgent as any).quick_menu_options);
        const menuMode = (orchAgent as any).quick_menu_mode || 'off';
        const greetingEnabled = !!(orchAgent as any).welcome_enabled;
        const greetingText: string = ((orchAgent as any).welcome_message || '').trim();

        const stateKey = body.conversation_id;
        const ts = getTestState(stateKey);

        // Resolve {{vars}} for greeting
        let orgName = '';
        if ((orchAgent as any).organization_id) {
          const { data: orgRow } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', (orchAgent as any).organization_id)
            .maybeSingle();
          orgName = orgRow?.name || '';
        }
        const safeNameForMenu = safeFirstName(body.visitor_name);
        const renderVars = (s: string) =>
          s
            .replaceAll('{{nome}}', safeNameForMenu)
            .replaceAll('{{visitor_name}}', safeNameForMenu)
            .replaceAll('{{agent_name}}', (orchAgent as any).name || '')
            .replaceAll('{{organization_name}}', orgName);

        // CASE A — Lead is replying to a quick menu we previously sent
        if (ts.state === 'aguardando_menu' && menuOptions.length > 0) {
          const match = matchMenuOption(body.message, menuOptions);
          if (!match) {
            const invalidMsg = getInvalidMessage((orchAgent as any).quick_menu_invalid_message);
            const menuMsg = formatMenuMessage((orchAgent as any).quick_menu_intro, menuOptions);
            return new Response(
              JSON.stringify({
                message: { content: `${invalidMsg}\n\n${menuMsg}`, message_type: 'text' },
                response: `${invalidMsg}\n\n${menuMsg}`,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const opt = match.option;
          if (opt.action === 'transfer_to_human') {
            saveTestState(stateKey, { state: 'humano', context: `Menu: ${opt.label}` });
            const msg = `[Teste] 👤 Encaminhando para um atendente humano (opção: ${opt.label}).`;
            return new Response(
              JSON.stringify({
                message: { content: msg, message_type: 'text' },
                response: msg,
                test_routing: { action: 'transfer_to_human', label: opt.label },
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (opt.action === 'transfer_to_agent' && opt.target_agent_id) {
            const { data: targetAgent } = await supabase
              .from('product_agents')
              .select('id, name, agent_type')
              .eq('id', opt.target_agent_id)
              .maybeSingle();

            if (!targetAgent) {
              const msg = '[Teste] ⚠️ Agente alvo configurado no menu não existe ou foi desativado.';
              return new Response(
                JSON.stringify({
                  message: { content: msg, message_type: 'text' },
                  response: msg,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            saveTestState(stateKey, {
              state: 'em_atendimento',
              context: `Menu: ${opt.label}`,
              routedAgentId: (targetAgent as any).id,
              routedAgentName: (targetAgent as any).name,
            });
            const msg = `[Teste] 🎯 Roteamento concluído para **${(targetAgent as any).name}** (opção: ${opt.label}).\n\nEm produção, a partir daqui o lead conversaria diretamente com este agente.`;
            return new Response(
              JSON.stringify({
                message: { content: msg, message_type: 'text' },
                response: msg,
                test_routing: {
                  action: 'transfer_to_agent',
                  label: opt.label,
                  target_agent_id: (targetAgent as any).id,
                  target_agent_name: (targetAgent as any).name,
                },
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (opt.action === 'start_flow') {
            saveTestState(stateKey, { state: 'em_atendimento', context: `Menu: ${opt.label}` });
            const msg = `[Teste] ▶️ Iniciaria o fluxo configurado para a opção "${opt.label}".`;
            return new Response(
              JSON.stringify({
                message: { content: msg, message_type: 'text' },
                response: msg,
                test_routing: { action: 'start_flow', label: opt.label, target_flow_id: opt.target_flow_id },
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // CASE B — Already routed in this test session
        if (ts.state === 'em_atendimento' && ts.routedAgentName) {
          const msg = `[Teste] ✅ A conversa já foi roteada para **${ts.routedAgentName}** nesta sessão de teste.\n\nClique em "Limpar" para reiniciar o fluxo do orquestrador.`;
          return new Response(
            JSON.stringify({
              message: { content: msg, message_type: 'text' },
              response: msg,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (ts.state === 'humano') {
          const msg = `[Teste] ✅ A conversa já foi encaminhada para humano nesta sessão de teste.\n\nClique em "Limpar" para reiniciar.`;
          return new Response(
            JSON.stringify({
              message: { content: msg, message_type: 'text' },
              response: msg,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // CASE C — First message: send greeting + (maybe) menu
        const showMenu = menuMode === 'always' && menuOptions.length > 0;
        const greeting = greetingEnabled ? renderVars(greetingText) : '';
        const menuMsg = showMenu
          ? formatMenuMessage((orchAgent as any).quick_menu_intro, menuOptions)
          : '';
        const fullMsg = [greeting.trim(), menuMsg.trim()].filter(Boolean).join('\n\n');

        if (fullMsg) {
          saveTestState(stateKey, {
            state: showMenu ? 'aguardando_menu' : 'em_atendimento',
            questionCount: 0,
            context: '',
          });
          return new Response(
            JSON.stringify({
              message: { content: fullMsg, message_type: 'text' },
              response: fullMsg,
              test_state: showMenu ? 'aguardando_menu' : 'em_atendimento',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // No greeting and no menu configured → tell admin to configure something
        const msg =
          '[Teste] ℹ️ Este agente Orquestrador não tem mensagem de boas-vindas nem menu rápido configurado.\n\n' +
          'Configure pelo menos um deles nas abas **Boas-vindas** ou **Roteamento** para testar o fluxo.';
        return new Response(
          JSON.stringify({
            message: { content: msg, message_type: 'text' },
            response: msg,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (testErr) {
        console.error('[webchat-bot] orchestrator test mode error:', testErr);
        return new Response(
          JSON.stringify({
            message: {
              content: '⚠️ Erro ao executar teste do orquestrador. Veja os logs.',
              message_type: 'text',
            },
            response: '⚠️ Erro ao executar teste do orquestrador.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check if we're in flow execution mode (flow active and not completed)
    const flowContext = body.flow_context;
    if (flowContext && flowContext.current_flow_id && flowContext.current_block_id && !flowContext.flow_completed) {
      console.log('[webchat-bot] Executing flow block:', flowContext.current_block_id);
      
      const flowResult = await executeFlowBlock(
        supabase,
        body.conversation_id,
        body.message,
        flowContext,
        body.product_id
      );
      
      return new Response(
        JSON.stringify(flowResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // Pega as ÚLTIMAS 80 mensagens (desc) e reverte para ordem cronológica.
    // Antes usava ascending:true + limit(80), o que enviava o INÍCIO da conversa
    // ao modelo e escondia as respostas recentes do lead (causa de repetição).
    const { data: messagesDesc } = await supabase
      .from('webchat_messages')
      .select('*')
      .eq('conversation_id', body.conversation_id)
      .order('created_at', { ascending: false })
      .limit(80);

    const messages = (messagesDesc || []).slice().reverse();

    // Dedupe defensivo: eco do WhatsApp pode ter gravado a mesma mensagem 2x.
    const dedupedMessages: any[] = [];
    for (const msg of messages) {
      const prev = dedupedMessages[dedupedMessages.length - 1];
      const extId = (msg.metadata as any)?.external_id;
      const prevExtId = prev ? (prev.metadata as any)?.external_id : null;
      const sameExternal = !!extId && extId === prevExtId;
      const sameConsecutive =
        prev &&
        prev.direction === msg.direction &&
        (prev.content || '') === (msg.content || '') &&
        Math.abs(new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime()) < 120_000;
      if (sameExternal || sameConsecutive) continue;
      dedupedMessages.push(msg);
    }

    const fullHistory = dedupedMessages.map(msg => {
      const base = {
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.content,
      };
      // Enrich with scheduling context if available
      const metadata = msg.metadata as any;
      if (metadata?.scheduling_context?.action === 'slots_offered') {
        const slots = metadata.scheduling_context.suggestions;
        base.content += `\n[CONTEXTO INTERNO - NÃO REPITA ISSO AO CLIENTE: Horários já oferecidos: ${
          slots.map((s: any) => `${s.date} ${s.time}`).join(', ')
        }. event_type_id: ${metadata.scheduling_context.event_type_id}, schedule_user_id: ${metadata.scheduling_context.schedule_user_id}. Se o cliente confirmar um horário, use schedule_meeting IMEDIATAMENTE. NÃO chame check_available_slots novamente.]`;
      }
      return base;
    });

    // === Janela de contexto enxuta (economia de tokens) ===
    // Só as últimas 20 mensagens vão íntegras para o modelo. O que veio antes
    // é condensado em um resumo curto, preservando continuidade sem pagar
    // milhares de tokens por turno.
    const RECENT_WINDOW = 20;
    const recentHistory = fullHistory.slice(-RECENT_WINDOW);
    const olderHistory = fullHistory.slice(0, Math.max(0, fullHistory.length - RECENT_WINDOW));
    const conversationHistory: Array<{ role: string; content: string }> = [];
    if (olderHistory.length > 0) {
      const digest = olderHistory
        .slice(-24)
        .map((m) => `${m.role === 'user' ? 'Cliente' : 'Atendente'}: ${(m.content || '').replace(/\s+/g, ' ').slice(0, 160)}`)
        .join('\n');
      conversationHistory.push({
        role: 'system',
        content:
          `RESUMO DO HISTÓRICO ANTERIOR (${olderHistory.length} mensagens antigas, condensadas — não repita literalmente):\n${digest}`,
      });
    }
    conversationHistory.push(...recentHistory);



    // Fetch product CTAs if product_id is available
    let productCTAs: ProductCTA[] = [];
    if (body.product_id) {
      const { data: ctas } = await supabase
        .from('product_ctas')
        .select('*')
        .eq('product_id', body.product_id)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      productCTAs = ctas || [];
      console.log('[webchat-bot] Found CTAs:', productCTAs.length);
    }

    // === Fetch materials (biblioteca de apoio — PDFs, vídeos, imagens, links) ===
    // Pega materiais do produto atual (se houver) + materiais "gerais" da org (product_id null).
    // Sempre filtra por organization_id (multi-tenant).
    let agentMaterials: Array<{ id: string; name: string; type: string; url: string; objective: string | null; tags: string[] | null; product_id: string | null }> = [];
    try {
      const { data: convForMat } = await supabase
        .from('webchat_conversations')
        .select('organization_id')
        .eq('id', body.conversation_id)
        .maybeSingle();
      const orgId = (convForMat as any)?.organization_id;
      if (orgId) {
        let q = supabase
          .from('materials')
          .select('id, name, type, url, objective, tags, product_id')
          .eq('organization_id', orgId)
          .eq('status', 'active');
        if (body.product_id) {
          q = q.or(`product_id.eq.${body.product_id},product_id.is.null`);
        } else {
          q = q.is('product_id', null);
        }
        const { data: mats } = await q.limit(30);
        agentMaterials = (mats || []) as any;
        console.log('[webchat-bot] Found materials:', agentMaterials.length);
      }
    } catch (matErr) {
      console.warn('[webchat-bot] materials fetch failed (non-fatal):', matErr);
    }

    // Fetch product agent if available
    let activeAgent: ProductAgent | null = null;
    let keywordMatchInfo: { matched_term: string; match_type: string; takeover: boolean; from_agent_id: string | null } | null = null;
    let orchestratorEarlyResponse: { content: string; needsHuman: boolean } | null = null;

    // === STEP -2: Manual Admin takeover guard (highest priority) ===
    // If a gestor manually transferred this conversation to an Admin agent (e.g., Malu),
    // we MUST short-circuit orchestrator + keyword matcher + instance-bound resolution
    // and run with the admin agent. This protects intentional human intervention.
    let adminTakeoverActive = false;
    if (body.conversation_id) {
      try {
        // Check 1: explicit body.agent_id pointing to an admin agent
        if (body.agent_id) {
          const { data: explicitAdmin } = await supabase
            .from('product_agents')
            .select('*')
            .eq('id', body.agent_id)
            .eq('agent_type', 'admin')
            .eq('is_active', true)
            .maybeSingle();
          if (explicitAdmin) {
            activeAgent = explicitAdmin as ProductAgent;
            adminTakeoverActive = true;
            if (explicitAdmin.product_id && !body.product_id) {
              body.product_id = explicitAdmin.product_id;
            }
            console.log('[webchat-bot] 🔒 Admin takeover (explicit agent_id):', explicitAdmin.name);
          }
        }

        // Check 2: conversation.current_agent_id pointing to admin (no explicit agent_id)
        if (!adminTakeoverActive && !body.agent_id) {
          const { data: convAdmin } = await supabase
            .from('webchat_conversations')
            .select('current_agent_id, product_agents:current_agent_id(*)')
            .eq('id', body.conversation_id)
            .maybeSingle();
          const candidate = (convAdmin as any)?.product_agents;
          if (candidate?.agent_type === 'admin' && candidate?.is_active) {
            activeAgent = candidate as ProductAgent;
            adminTakeoverActive = true;
            if (candidate.product_id && !body.product_id) {
              body.product_id = candidate.product_id;
            }
            console.log('[webchat-bot] 🔒 Admin takeover detected (current_agent_id):', candidate.name);
          }
        }
      } catch (e) {
        console.warn('[webchat-bot] admin takeover check failed (non-fatal):', e);
      }
    }

    // === STEP -2.5: Delegate to admin-agent-handle-inbound when admin takeover is active ===
    // The admin agent has a dedicated kernel (EXECUTIVE_KERNEL) and read-only tools.
    // Running it through the generic webchat-bot pipeline produces "Desculpe, não entendi".
    if (adminTakeoverActive && activeAgent && body.conversation_id) {
      try {
        const { data: convForAdmin } = await supabase
          .from('webchat_conversations')
          .select('organization_id, channel, visitor_phone, evolution_instance_id, lead_id')
          .eq('id', body.conversation_id)
          .maybeSingle();

        if (convForAdmin?.organization_id) {
          console.log('[webchat-bot] 🎯 Delegating to admin-agent-handle-inbound', {
            agent: activeAgent.name,
            agent_id: activeAgent.id,
            conv: body.conversation_id,
            channel: convForAdmin.channel,
            phone: convForAdmin.visitor_phone,
            has_product_id: !!body.product_id,
          });

          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const adminRes = await fetch(`${supabaseUrl}/functions/v1/admin-agent-handle-inbound`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              organization_id: convForAdmin.organization_id,
              message: body.message,
              phone: convForAdmin.visitor_phone || null,
              agent_id: activeAgent.id,
              instance_id: convForAdmin.evolution_instance_id || null,
              conversation_id: body.conversation_id,
              skip_send: true,
            }),
          });

          const adminJson = await adminRes.json().catch(() => ({} as any));
          console.log('[webchat-bot] ← admin-agent-handle-inbound response', {
            status: adminRes.status,
            ok: adminRes.ok,
            has_reply: !!adminJson?.reply,
            handoff: adminJson?.handoff || null,
          });

          const replyText = (adminJson?.reply as string) || 'Sem resposta.';
          const handoffInfo = adminJson?.handoff || null;

          // Persist outbound reply in webchat_messages so the Inbox UI shows it.
          // If a handoff happened, mark it on the metadata so downstream reads
          // know the next inbound will go to a different agent.
          try {
            await supabase.from('webchat_messages').insert({
              conversation_id: body.conversation_id,
              direction: 'outbound',
              content: replyText,
              metadata: {
                admin_takeover: true,
                agent_id: activeAgent.id,
                agent_name: activeAgent.name,
                ...(handoffInfo ? { handoff: handoffInfo } : {}),
              },
            });
          } catch (persistErr) {
            console.warn('[webchat-bot] failed to persist admin outbound (non-fatal):', persistErr);
          }

          // Return in a shape that evolution-webhook understands (chunks) AND
          // that webchat clients understand (response/message.content).
          return new Response(
            JSON.stringify({
              response: replyText,
              chunks: [replyText],
              message: { content: replyText, role: 'assistant' },
              admin_takeover: true,
              agent_id: activeAgent.id,
              agent_name: activeAgent.name,
              handoff: handoffInfo,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          console.warn('[webchat-bot] admin delegation skipped: no organization_id on conversation', {
            conv: body.conversation_id,
          });
        }
      } catch (delegateErr) {
        console.error('[webchat-bot] admin delegation FAILED with exception:', delegateErr);
        // Even on failure, do NOT fall through into the sales pipeline (scheduling,
        // pipeline movement, etc) — those tools must NEVER respond to an admin
        // takeover conversation. Return a safe placeholder instead.
        const fallback = 'Tive um problema técnico ao acessar os dados. Tente novamente.';
        return new Response(
          JSON.stringify({
            response: fallback,
            chunks: [fallback],
            message: { content: fallback, role: 'assistant' },
            admin_takeover: true,
            error: 'admin_delegation_failed',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // === STEP -1: Orchestrator triage (runs FIRST when enabled) ===
    // The orchestrator classifies product+intent and routes to a specialist.
    // Only runs when org has orchestration enabled AND conversation is in 'triagem' state (or null).
    try {
      const { data: convInit } = await supabase
        .from('webchat_conversations')
        .select('id, organization_id, channel, visitor_phone, lead_id, current_agent_id, orchestrator_state, orchestrator_context, orchestrator_question_count')
        .eq('id', body.conversation_id)
        .maybeSingle();

      if (convInit?.organization_id) {
        const { data: orchConfig } = await supabase
          .from('organization_orchestrator_config')
          .select('*')
          .eq('organization_id', convInit.organization_id)
          .maybeSingle();

        const orchEnabled = orchConfig?.is_enabled === true && !!orchConfig?.orchestrator_agent_id;
        let currentState = convInit.orchestrator_state || null;
        let inTriage = currentState === null || currentState === 'triagem';

        // === Auto-reset: returning lead after long silence ===
        // If the conversation hasn't received an outbound message in a long time
        // (>6h) OR the conversation was previously closed, treat as a fresh start
        // so the orchestrator's welcome message + quick menu fire again.
        // This guarantees: every NEW or REOPENED conversation passes through
        // the orchestrator's greeting flow before any specialist agent answers.
        if (orchEnabled && !body.agent_id && !adminTakeoverActive) {
          try {
            const { data: lastOutbound } = await supabase
              .from('webchat_messages')
              .select('created_at')
              .eq('conversation_id', body.conversation_id)
              .eq('direction', 'outbound')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
            const lastOutboundAt = lastOutbound?.created_at ? new Date(lastOutbound.created_at).getTime() : 0;
            const silenceTooLong = lastOutboundAt > 0 && (Date.now() - lastOutboundAt) > SIX_HOURS_MS;

            // If the orchestrator state is "stuck" (e.g., triagem/em_atendimento) but
            // no outbound was ever sent, it means the welcome flow was missed
            // (e.g., a previous deploy / failure). Force-reset so the welcome fires now.
            const noOutboundEver = !lastOutbound;
            const stateLooksStuck =
              currentState !== null && currentState !== 'aguardando_menu' && noOutboundEver;

            if (silenceTooLong || stateLooksStuck) {
              await supabase
                .from('webchat_conversations')
                .update({
                  orchestrator_state: null,
                  orchestrator_context: null,
                  orchestrator_question_count: 0,
                  current_agent_id: null,
                })
                .eq('id', body.conversation_id);
              currentState = null;
              inTriage = true;
              console.log('[webchat-bot] 🧭 Orchestrator state reset', {
                reason: silenceTooLong ? 'silence>6h' : 'stuck_state_no_outbound',
                previous_state: convInit.orchestrator_state,
              });
            }
          } catch (resetErr) {
            console.warn('[webchat-bot] orchestrator reset check failed (non-fatal):', resetErr);
          }
        }

        // === Pre-step: Welcome message + Quick menu ===
        // The orchestrator agent can greet the lead and offer a quick numeric menu
        // before any AI classification runs. Configured per-agent in the admin.
        if (orchEnabled && !body.agent_id && !adminTakeoverActive) {
          try {
            const { data: orchAgentFull } = await supabase
              .from('product_agents')
              .select('id, name, welcome_enabled, welcome_message, quick_menu_mode, quick_menu_intro, quick_menu_options, quick_menu_invalid_message')
              .eq('id', orchConfig.orchestrator_agent_id)
              .maybeSingle();

            const menuOptions: QuickMenuOption[] = sanitizeMenuOptions((orchAgentFull as any)?.quick_menu_options);
            const menuMode = (orchAgentFull as any)?.quick_menu_mode || 'off';
            const greetingEnabled = !!(orchAgentFull as any)?.welcome_enabled;
            const greetingText: string = ((orchAgentFull as any)?.welcome_message || '').trim();

            // CASE A — User is replying to a quick menu we previously sent.
            if (currentState === 'aguardando_menu' && menuOptions.length > 0) {
              const match = matchMenuOption(body.message, menuOptions);
              if (!match) {
                // Count previous invalid attempts (outbound msgs since the menu was sent
                // that contained the invalid-input marker). If >= 2, fall through to free
                // triage so we don't loop forever asking for a number.
                const prevInvalid = convInit.orchestrator_question_count || 0;
                if (prevInvalid >= 2) {
                  // Reset state → let the orchestrator triage / specialist agent answer naturally.
                  await supabase
                    .from('webchat_conversations')
                    .update({
                      orchestrator_state: null,
                      orchestrator_question_count: 0,
                      orchestrator_context: 'menu_bypassed_after_invalid_attempts',
                    })
                    .eq('id', body.conversation_id);
                  currentState = null;
                  inTriage = true;
                  console.log('[webchat-bot] 🧭 Menu bypassed after 2 invalid attempts → free triage');
                  // Do NOT set orchestratorEarlyResponse → pipeline continues to AI triage.
                } else {
                  // Still under threshold: re-send menu with invalid-input message
                  await supabase
                    .from('webchat_conversations')
                    .update({ orchestrator_question_count: prevInvalid + 1 })
                    .eq('id', body.conversation_id);
                  const invalidMsg = getInvalidMessage((orchAgentFull as any)?.quick_menu_invalid_message);
                  const menuMsg = formatMenuMessage((orchAgentFull as any)?.quick_menu_intro, menuOptions);
                  orchestratorEarlyResponse = {
                    content: `${invalidMsg}\n\n${menuMsg}`,
                    needsHuman: false,
                  };
                }
              } else {
                const opt = match.option;

                if (opt.action === 'transfer_to_human') {
                  await supabase
                    .from('webchat_conversations')
                    .update({
                      orchestrator_state: 'humano',
                      needs_human: true,
                      orchestrator_context: `Menu: ${opt.label}`,
                    })
                    .eq('id', body.conversation_id);
                  orchestratorEarlyResponse = {
                    content: 'Perfeito, vou te conectar com um dos nossos atendentes. Aguarde um instante.',
                    needsHuman: true,
                  };
                } else if (opt.action === 'transfer_to_agent' && opt.target_agent_id) {
                  const { data: targetAgent } = await supabase
                    .from('product_agents')
                    .select('*')
                    .eq('id', opt.target_agent_id)
                    .eq('is_active', true)
                    .maybeSingle();

                  if (targetAgent) {
                    activeAgent = targetAgent as any;
                    const targetProductId = (targetAgent as any).product_id || null;
                    if (targetProductId) body.product_id = targetProductId;
                    await supabase
                      .from('webchat_conversations')
                      .update({
                        orchestrator_state: 'em_atendimento',
                        current_agent_id: targetAgent.id,
                        product_id: targetProductId,
                        orchestrator_context: `Menu: ${opt.label}`,
                      })
                      .eq('id', body.conversation_id);
                    console.log('[webchat-bot] 🧭 Quick-menu match → routing to:', (targetAgent as any).name);
                    // Fall through: the rest of the pipeline will run with activeAgent set.
                    // Override the user message so the specialist sees the lead's intent
                    // (the original numeric "1" alone wouldn't make sense to the agent).
                    body.message = `[Menu: ${opt.label}] — ${body.message}`;
                  } else {
                    orchestratorEarlyResponse = {
                      content: 'Esse atendimento está temporariamente indisponível. Vou te conectar com um humano.',
                      needsHuman: true,
                    };
                    await supabase
                      .from('webchat_conversations')
                      .update({ orchestrator_state: 'humano', needs_human: true })
                      .eq('id', body.conversation_id);
                  }
                } else {
                  // Unknown / unsupported action → fallback to human
                  orchestratorEarlyResponse = {
                    content: 'Vou te conectar com um dos nossos atendentes.',
                    needsHuman: true,
                  };
                  await supabase
                    .from('webchat_conversations')
                    .update({ orchestrator_state: 'humano', needs_human: true })
                    .eq('id', body.conversation_id);
                }
              }
            }
            // CASE B — First message of conversation: send greeting (and menu if mode=always).
            // Fires whenever no outbound message was ever sent and the conversation is
            // not already in an active attendance / human / menu-awaiting state.
            // This is more robust than checking only `currentState === null`, because
            // a previous failed run may have set the state to 'triagem' without ever
            // sending the welcome message.
            else if (
              currentState !== 'aguardando_menu' &&
              currentState !== 'em_atendimento' &&
              currentState !== 'humano'
            ) {
              // Lock atômico: só dispara welcome se welcome_sent_at AINDA estiver NULL.
              // Isso evita que reentregas paralelas do webhook (Evolution Go retry) ou
              // múltiplas invocações concorrentes mandem o welcome mais de uma vez.
              const greetingWanted = greetingEnabled || (menuMode === 'always' && menuOptions.length > 0);
              let isFirstInteraction = false;
              if (greetingWanted) {
                const { data: lockRow } = await supabase
                  .from('webchat_conversations')
                  .update({ welcome_sent_at: new Date().toISOString() })
                  .eq('id', body.conversation_id)
                  .is('welcome_sent_at', null)
                  .select('id')
                  .maybeSingle();
                isFirstInteraction = !!lockRow?.id;
                if (!isFirstInteraction) {
                  console.log('[webchat-bot] 🧭 welcome skip: welcome_sent_at já preenchido (lock)');
                }
              }

              if (isFirstInteraction && greetingWanted) {
                // Resolve {{variables}} in greeting
                const { data: orgRowG } = await supabase
                  .from('organizations')
                  .select('name')
                  .eq('id', convInit.organization_id)
                  .maybeSingle();
                let greeting = greetingEnabled ? greetingText : '';
                const safeWelcomeName = safeFirstName(body.visitor_name);
                greeting = greeting
                  .replaceAll('{{nome}}', safeWelcomeName)
                  .replaceAll('{{visitor_name}}', safeWelcomeName)
                  .replaceAll('{{agent_name}}', (orchAgentFull as any)?.name || '')
                  .replaceAll('{{organization_name}}', orgRowG?.name || '');
                // Limpa saudação tipo "Oi , tudo bem?" quando nome ficou vazio
                greeting = greeting.replace(/\s+,/g, ',').replace(/(Oi|Olá|Opa|E aí)\s+,/gi, '$1,');

                const showMenu = menuMode === 'always' && menuOptions.length > 0;
                const menuMsg = showMenu
                  ? formatMenuMessage((orchAgentFull as any)?.quick_menu_intro, menuOptions)
                  : '';

                const fullMsg = [greeting.trim(), menuMsg.trim()].filter(Boolean).join('\n\n');

                if (fullMsg) {
                  await supabase
                    .from('webchat_conversations')
                    .update({
                      orchestrator_state: showMenu ? 'aguardando_menu' : 'triagem',
                      // Clear any leaked specialist agent so the next turn flows
                      // through the orchestrator pipeline cleanly.
                      current_agent_id: null,
                      orchestrator_context: null,
                      orchestrator_question_count: 0,
                    })
                    .eq('id', body.conversation_id);

                  orchestratorEarlyResponse = {
                    content: fullMsg,
                    needsHuman: false,
                  };
                  console.log('[webchat-bot] 🧭 Greeting sent, state =', showMenu ? 'aguardando_menu' : 'triagem');
                }
              }
            }
          } catch (welcomeErr) {
            console.warn('[webchat-bot] welcome/menu pipeline error (non-fatal):', welcomeErr);
          }
        }

        // === STEP -1 (continued): Orchestrator AI triage ===
        // Skip if greeting/menu just produced an early response,
        // or if conversation is already in 'aguardando_menu' or 'em_atendimento'.
        if (orchEnabled && inTriage && !body.agent_id && !adminTakeoverActive && !orchestratorEarlyResponse && !activeAgent) {
          console.log('[webchat-bot] 🧭 Orchestrator enabled, running triage...');

          const { data: orgRow } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', convInit.organization_id)
            .maybeSingle();

          const { data: orgProducts } = await supabase
            .from('products')
            .select('id, name, description')
            .eq('organization_id', convInit.organization_id)
            .eq('is_active', true)
            .limit(20);

          const { data: orchAgent } = await supabase
            .from('product_agents')
            .select('additional_prompt, quick_menu_mode, quick_menu_intro, quick_menu_options, quick_menu_invalid_message')
            .eq('id', orchConfig.orchestrator_agent_id)
            .maybeSingle();

          const result = await runOrchestrator({
            supabase,
            organizationId: convInit.organization_id,
            organizationName: orgRow?.name || 'a empresa',
            channel: convInit.channel || 'chat',
            channelIdentifier: convInit.visitor_phone || null,
            products: (orgProducts || []).map(p => ({ id: p.id, name: p.name, description: p.description })),
            orchestratorContext: convInit.orchestrator_context || '',
            questionCount: convInit.orchestrator_question_count || 0,
            maxTriageQuestions: orchConfig.max_triage_questions || 2,
            message: body.message,
            customPrompt: orchAgent?.additional_prompt || null,
          });

          console.log('[webchat-bot] 🧭 Orchestrator result:', JSON.stringify({
            intencao: result.intencao,
            produto_id: result.produto_id,
            confianca: result.confianca,
          }));

          // Persist orchestration log (best-effort)
          try {
            await supabase.from('orchestration_logs').insert({
              organization_id: convInit.organization_id,
              conversation_id: body.conversation_id,
              lead_id: convInit.lead_id || null,
              message: body.message,
              detected_intent: result.intencao,
              detected_product_id: result.produto_id,
              confidence: result.confianca,
              extracted_context: result.contexto_extraido,
              orchestrator_response: result.resposta_orquestrador || null,
            });
          } catch (logErr) {
            console.warn('[webchat-bot] orchestration_logs insert failed (non-fatal):', logErr);
          }

          const minConfidence = orchConfig.min_confidence ?? 0.6;
          const maxQuestions = orchConfig.max_triage_questions ?? 2;
          const questionCount = convInit.orchestrator_question_count || 0;

          // CASE 1: Lead asked for human OR too many failed triage questions → handoff
          if (result.intencao === 'humano' || (questionCount >= maxQuestions && result.confianca < minConfidence)) {
            await supabase
              .from('webchat_conversations')
              .update({
                orchestrator_state: 'humano',
                needs_human: true,
                detected_intent: result.intencao,
                orchestrator_context: result.contexto_extraido,
              })
              .eq('id', body.conversation_id);

            orchestratorEarlyResponse = {
              content: result.resposta_orquestrador || 'Vou te conectar com um dos nossos atendentes agora.',
              needsHuman: true,
            };
          }
          // CASE 2: Low confidence and still has triage budget → ask clarifying question
          else if (result.confianca < minConfidence && result.resposta_orquestrador) {
            await supabase
              .from('webchat_conversations')
              .update({
                orchestrator_state: 'triagem',
                orchestrator_question_count: questionCount + 1,
                orchestrator_context: result.contexto_extraido,
                detected_intent: result.intencao,
              })
              .eq('id', body.conversation_id);

            orchestratorEarlyResponse = {
              content: result.resposta_orquestrador,
              needsHuman: false,
            };
          }
          // CASE 3: Confident classification → route to specialist with fallback chain
          else if (result.confianca >= minConfidence && result.produto_id) {
            // Inject orchestrator-detected product into the request
            body.product_id = result.produto_id;

            const preferredRoles = mapIntentToRoles(result.intencao);
            let routedAgent: ProductAgent | null = null;

            // Try each preferred role for this product
            for (const role of preferredRoles) {
              const { data: candidate } = await supabase
                .from('product_agents')
                .select('*')
                .eq('product_id', result.produto_id)
                .eq('agent_type', role)
                .eq('is_active', true)
                .order('is_default', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (candidate) {
                routedAgent = candidate;
                console.log('[webchat-bot] 🧭 Routed to specialist:', candidate.name, '(', role, ')');
                break;
              }
            }

            // Fallback 1: any default agent of the product
            if (!routedAgent) {
              const { data: defaultAgent } = await supabase
                .from('product_agents')
                .select('*')
                .eq('product_id', result.produto_id)
                .eq('is_default', true)
                .eq('is_active', true)
                .maybeSingle();
              if (defaultAgent) {
                routedAgent = defaultAgent;
                console.log('[webchat-bot] 🧭 Fallback: default agent of product:', defaultAgent.name);
              }
            }

            // Fallback 2: orchestrator itself assumes the conversation with product context
            if (!routedAgent) {
              const { data: orchAsAgent } = await supabase
                .from('product_agents')
                .select('*')
                .eq('id', orchConfig.orchestrator_agent_id)
                .eq('is_active', true)
                .maybeSingle();
              if (orchAsAgent) {
                routedAgent = orchAsAgent;
                console.warn('[webchat-bot] 🧭 No specialist found — orchestrator assumes conversation');
              }
            }

            if (routedAgent) {
              activeAgent = routedAgent;
              await supabase
                .from('webchat_conversations')
                .update({
                  orchestrator_state: 'em_atendimento',
                  current_agent_id: routedAgent.id,
                  orchestrator_context: result.contexto_extraido,
                  detected_intent: result.intencao,
                  product_id: result.produto_id,
                })
                .eq('id', body.conversation_id);
            } else {
              // No agent at all → human
              await supabase
                .from('webchat_conversations')
                .update({
                  orchestrator_state: 'humano',
                  needs_human: true,
                  detected_intent: result.intencao,
                  orchestrator_context: result.contexto_extraido,
                })
                .eq('id', body.conversation_id);
              orchestratorEarlyResponse = {
                content: 'Vou te conectar com um dos nossos atendentes para te ajudar melhor.',
                needsHuman: true,
              };
            }
          }
        } else if (currentState === 'em_atendimento' && convInit.current_agent_id) {
          // Already in active conversation — load the assigned specialist
          const { data: assigned } = await supabase
            .from('product_agents')
            .select('*')
            .eq('id', convInit.current_agent_id)
            .eq('is_active', true)
            .maybeSingle();
          if (assigned) {
            activeAgent = assigned;
            if (assigned.product_id) body.product_id = assigned.product_id;
            console.log('[webchat-bot] 🧭 Continuing with assigned specialist:', assigned.name);
          }
        }
      }
    } catch (orchErr) {
      console.warn('[webchat-bot] orchestrator pipeline error (non-fatal):', orchErr);
    }

    // If orchestrator wants to send a triage question or hand off to human, return early
    if (orchestratorEarlyResponse) {
      // Persist outbound message
      try {
        await supabase.from('webchat_messages').insert({
          conversation_id: body.conversation_id,
          direction: 'outbound',
          content: orchestratorEarlyResponse.content,
          metadata: { orchestrator: true, needs_human: orchestratorEarlyResponse.needsHuman },
        });
      } catch (msgErr) {
        console.warn('[webchat-bot] failed to persist orchestrator message (non-fatal):', msgErr);
      }
      return new Response(
        JSON.stringify({
          response: orchestratorEarlyResponse.content,
          needs_human: orchestratorEarlyResponse.needsHuman,
          orchestrator: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // === STEP 0: Keyword/phrase auto-activation ===
    // Palavras-chave/frases podem trocar o agente ativo em qualquer canal,
    // inclusive quando um agent_id foi passado explicitamente (ex: WhatsApp
    // com agente vinculado à instância Evolution). Regras:
    //   - Nunca sobrescreve atendimento humano (status = 'human_active').
    //   - Escopo dos candidatos = TODA a organização (não só do produto),
    //     permitindo que um agente de outro produto assuma via keyword.
    //   - takeover_on_match respeita a config do agente disparado.
    if (body.message && !adminTakeoverActive) {
      try {
        // Resolve channel + status + org for scope/guard
        const { data: convForChannel } = await supabase
          .from('webchat_conversations')
          .select('channel, current_agent_id, status, organization_id')
          .eq('id', body.conversation_id)
          .maybeSingle();

        // Guard humano: humano é soberano — não trocamos agente por keyword.
        if ((convForChannel as any)?.status === 'human_active') {
          console.log('[webchat-bot] matcher skipped: conversation is human_active');
        } else {
          const rawChannel = (convForChannel?.channel || 'chat').toLowerCase();
          const channel: MatcherChannel =
            rawChannel === 'whatsapp' ? 'whatsapp' :
            rawChannel === 'inbox' ? 'inbox' :
            rawChannel === 'funnel' ? 'funnel' : 'chat';

          const orgIdForMatch = (convForChannel as any)?.organization_id || null;
          let candidateQuery = supabase
            .from('product_agents')
            .select('id, name, is_active, activation_keywords, activation_phrases, activation_priority, activation_scope, takeover_on_match, updated_at')
            .eq('is_active', true);
          if (orgIdForMatch) {
            candidateQuery = candidateQuery.eq('organization_id', orgIdForMatch);
          } else if (body.product_id) {
            candidateQuery = candidateQuery.eq('product_id', body.product_id);
          }
          const { data: candidateAgents } = await candidateQuery;

          const match = matchAgentByMessage(body.message, candidateAgents || [], channel);
          if (match) {
            const currentAgentId = (convForChannel as any)?.current_agent_id || body.agent_id || null;
            // Se o agente que deu match já é o ativo, nada a fazer.
            if (currentAgentId === match.agent.id) {
              console.log('[webchat-bot] matcher: agent already active, no switch');
            } else {
              const { data: full } = await supabase
                .from('product_agents')
                .select('*')
                .eq('id', match.agent.id)
                .maybeSingle();

              if (full) {
                activeAgent = full;
                const takeover = match.agent.takeover_on_match !== false;
                keywordMatchInfo = {
                  matched_term: match.matched_term,
                  match_type: match.match_type,
                  takeover,
                  from_agent_id: currentAgentId,
                };
                console.log('[webchat-bot] 🎯 Keyword match → agent:', full.name, 'term:', match.matched_term, 'takeover:', takeover);

                if (takeover) {
                  // Reset orchestrator para forçar re-boot com a nova persona.
                  await supabase
                    .from('webchat_conversations')
                    .update({
                      current_agent_id: full.id,
                      orchestrator_state: 'em_atendimento',
                      orchestrator_context: null,
                    })
                    .eq('id', body.conversation_id);
                }

                // Audit log (best-effort)
                try {
                  const { data: convInfo } = await supabase
                    .from('webchat_conversations')
                    .select('organization_id, lead_id')
                    .eq('id', body.conversation_id)
                    .maybeSingle();
                  if (convInfo?.organization_id) {
                    await supabase.from('agent_activation_logs').insert({
                      organization_id: convInfo.organization_id,
                      product_id: body.product_id || (full as any).product_id || null,
                      conversation_id: body.conversation_id,
                      lead_id: convInfo.lead_id || null,
                      from_agent_id: keywordMatchInfo.from_agent_id,
                      to_agent_id: full.id,
                      matched_term: match.matched_term,
                      match_type: match.match_type,
                      channel,
                    });
                  }
                } catch (logErr) {
                  console.warn('[webchat-bot] activation log failed (non-fatal):', logErr);
                }
              }
            }
          }
        }
      } catch (matchErr) {
        console.warn('[webchat-bot] activation matcher error (non-fatal):', matchErr);
      }
    }

    // First check if agent_id is provided directly (only if no keyword match)
    if (!activeAgent && body.agent_id) {
      const { data: agent } = await supabase
        .from('product_agents')
        .select('*')
        .eq('id', body.agent_id)
        .eq('is_active', true)
        .maybeSingle();

      activeAgent = agent;
      console.log('[webchat-bot] Using specified agent:', activeAgent?.name);
    }

    // Priority #2 (manual admin takeover): if the conversation's current_agent_id
    // points to an active Admin agent, that override wins over instance-bound rules.
    // This protects manual transfers made by gestores via the Inbox UI.
    if (!activeAgent && !body.agent_id) {
      const { data: convAdminCheck } = await supabase
        .from('webchat_conversations')
        .select('current_agent_id, product_agents:current_agent_id(*)')
        .eq('id', body.conversation_id)
        .maybeSingle();

      const candidateAgent = (convAdminCheck as any)?.product_agents;
      if (candidateAgent?.agent_type === 'admin' && candidateAgent?.is_active) {
        activeAgent = candidateAgent as ProductAgent;
        console.log('[webchat-bot] 🔒 Using admin agent (manual takeover):', activeAgent.name);
      }
    }

    // Priority #3 (after explicit agent_id and admin override): agent bound to this
    // conversation's Evolution WhatsApp instance. This isolates attendance per-number —
    // a message arriving on number X is handled by the agent bound to that connection.
    // IMPORTANT: skip this fallback while the conversation is still owned by the
    // Orchestrator (states: null / 'triagem' / 'aguardando_menu'). Otherwise an
    // instance-bound SDR (e.g., Natan) would answer before the welcome flow runs.
    if (!activeAgent && !body.agent_id) {
      const { data: convInst } = await supabase
        .from('webchat_conversations')
        .select('evolution_instance_id, meta_connection_id, instagram_connection_id, orchestrator_state, organization_id')
        .eq('id', body.conversation_id)
        .maybeSingle();

      let orchOwnsThis = false;
      if (convInst?.organization_id) {
        const { data: orchCfgFb } = await supabase
          .from('organization_orchestrator_config')
          .select('is_enabled, orchestrator_agent_id')
          .eq('organization_id', convInst.organization_id)
          .maybeSingle();
        const orchActive = !!(orchCfgFb?.is_enabled && orchCfgFb?.orchestrator_agent_id);
        const st = (convInst as any).orchestrator_state || null;
        orchOwnsThis = orchActive && (st === null || st === 'triagem' || st === 'aguardando_menu');
      }

      if (orchOwnsThis) {
        console.log('[webchat-bot] 📱 Skipping connection-bound fallback — orchestrator owns conversation');
      } else if (convInst) {
        // Build the list of (type,id) pairs this conversation arrived on.
        const pairs: Array<{ type: 'evolution' | 'meta_whatsapp' | 'instagram'; id: string }> = [];
        if (convInst.evolution_instance_id)   pairs.push({ type: 'evolution',     id: convInst.evolution_instance_id });
        if (convInst.meta_connection_id)      pairs.push({ type: 'meta_whatsapp', id: convInst.meta_connection_id });
        if (convInst.instagram_connection_id) pairs.push({ type: 'instagram',     id: convInst.instagram_connection_id });

        // 1) New multi-channel junction table (preferred)
        for (const p of pairs) {
          const { data: link } = await supabase
            .from('product_agent_connections')
            .select('agent_id, product_agents!inner(*)')
            .eq('connection_type', p.type)
            .eq('connection_id', p.id)
            .eq('product_agents.is_active', true)
            .order('product_agents(is_default)', { ascending: false })
            .limit(1)
            .maybeSingle();
          const bound = (link as any)?.product_agents;
          if (bound) {
            activeAgent = bound as ProductAgent;
            console.log('[webchat-bot] 📱 Using connection-bound agent (multi-channel):', activeAgent.name, p.type, p.id);
            // Persist on the conversation so the inbox shows the "Agent · IA" badge.
            // Only set when empty — never overwrite manual transfers.
            try {
              await supabase
                .from('webchat_conversations')
                .update({ current_agent_id: bound.id })
                .eq('id', body.conversation_id)
                .is('current_agent_id', null);
            } catch (e) {
              console.warn('[webchat-bot] failed to persist bound current_agent_id:', e);
            }
            break;
          }
        }

        // 2) Legacy fallback — old single evolution_instance_id column on product_agents
        if (!activeAgent && convInst.evolution_instance_id) {
          const { data: boundAgent } = await supabase
            .from('product_agents')
            .select('*')
            .eq('evolution_instance_id', convInst.evolution_instance_id)
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (boundAgent) {
            activeAgent = boundAgent as ProductAgent;
            console.log('[webchat-bot] 📱 Using instance-bound agent (legacy):', activeAgent.name);
            try {
              await supabase
                .from('webchat_conversations')
                .update({ current_agent_id: boundAgent.id })
                .eq('id', body.conversation_id)
                .is('current_agent_id', null);
            } catch (e) {
              console.warn('[webchat-bot] failed to persist legacy bound current_agent_id:', e);
            }
          }
        }
      }
    }
    // Then check conversation's current_agent_id and fetch flow_variables for overrides
    let flowVariables: Record<string, string> = {};
    
    if (!body.agent_id) {
      const { data: conversation } = await supabase
        .from('webchat_conversations')
        .select('current_agent_id, flow_variables')
        .eq('id', body.conversation_id)
        .maybeSingle();
      
      if (conversation?.flow_variables) {
        flowVariables = conversation.flow_variables as Record<string, string>;
        console.log('[webchat-bot] Flow variables loaded:', Object.keys(flowVariables));
      }
      
      // Only fall back to conversation's current_agent_id if no keyword match already set activeAgent
      if (!activeAgent && conversation?.current_agent_id) {
        const { data: agent } = await supabase
          .from('product_agents')
          .select('*')
          .eq('id', conversation.current_agent_id)
          .eq('is_active', true)
          .maybeSingle();
        
        activeAgent = agent;
        console.log('[webchat-bot] Using conversation agent:', activeAgent?.name);
      }
    }
    // Finally, try to get default agent for product
    if (!activeAgent && body.product_id) {
      const { data: defaultAgent } = await supabase
        .from('product_agents')
        .select('*')
        .eq('product_id', body.product_id)
        .eq('is_default', true)
        .eq('is_active', true)
        .maybeSingle();
      
      activeAgent = defaultAgent;
      if (activeAgent) {
        console.log('[webchat-bot] Using default product agent:', activeAgent.name);
      }
    }

    // Fallback: first active agent for product (when no default is set)
    if (!activeAgent && body.product_id) {
      const { data: firstActiveAgent } = await supabase
        .from('product_agents')
        .select('*')
        .eq('product_id', body.product_id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      activeAgent = firstActiveAgent;
      if (activeAgent) {
        console.log('[webchat-bot] Using first active agent as fallback:', activeAgent.name);
      }
    }
    
    // Build permission overrides from flow variables
    const permissionOverrides: PermissionOverrides = {};
    if (flowVariables['__override_can_do']) {
      try { permissionOverrides.can_do = JSON.parse(flowVariables['__override_can_do']); } catch {}
    }
    if (flowVariables['__override_cannot_do']) {
      try { permissionOverrides.cannot_do = JSON.parse(flowVariables['__override_cannot_do']); } catch {}
    }
    if (flowVariables['__override_handoff_triggers']) {
      try { permissionOverrides.handoff_triggers = JSON.parse(flowVariables['__override_handoff_triggers']); } catch {}
    }
    if (flowVariables['__ai_context']) {
      permissionOverrides.context = flowVariables['__ai_context'];
    }
    
    // Check for auto-switch configuration
    let schedulingMetadata: any = null;
    let autoSwitchConfig: Array<{ agent_id: string; trigger_condition: string }> = [];
    if (flowVariables['__auto_switch_config']) {
      try { 
        autoSwitchConfig = JSON.parse(flowVariables['__auto_switch_config']);
        console.log('[webchat-bot] Auto-switch enabled with', autoSwitchConfig.length, 'agents');
      } catch {}
    }

    // ─── Phase 3: Contextual reactions (pre-AI) ──────────────────────
    // Detect emoji-only/audio/keywords/inactivity BEFORE calling the LLM.
    // Direct-reply rules short-circuit the AI call entirely; context rules
    // get injected into the system prompt so the LLM responds the right way.
    let reactionContext: string | null = null;
    let reactionDirectReply: string | null = null;
    try {
      const reactionsCfg = (activeAgent as any)?.humanization?.reactions as ReactionsConfig | undefined;
      if (reactionsCfg && reactionsCfg.enabled !== false) {
        // Find the previous interaction timestamp (any message before now in this conv)
        let lastInteractionAt: string | null = null;
        try {
          const { data: prevMsg } = await supabase
            .from('webchat_messages')
            .select('created_at')
            .eq('conversation_id', body.conversation_id)
            .order('created_at', { ascending: false })
            .limit(2);
          // index 0 is current inbound, 1 is the previous
          lastInteractionAt = prevMsg && prevMsg[1]?.created_at ? prevMsg[1].created_at : null;
        } catch (_) { /* non-fatal */ }

        const match = detectReaction(
          { text: body.message || '', lastInteractionAt },
          reactionsCfg
        );
        if (match) {
          console.log('[webchat-bot] Reaction matched:', match.rule.id, '→', match.kind);
          if (match.kind === 'reply') reactionDirectReply = match.text;
          else reactionContext = match.text;
        }
      }
    } catch (rxErr: any) {
      console.warn('[webchat-bot] reaction detection failed (non-fatal):', rxErr?.message);
    }

    const agentAISettings = getAgentAISettings(activeAgent);
    const allowedCTAIds = activeAgent?.tool_configs?.allowed_cta_ids;
    if (Array.isArray(allowedCTAIds) && allowedCTAIds.length > 0) {
      productCTAs = productCTAs.filter((cta) => allowedCTAIds.includes(cta.id));
    }
    const allowedMaterialIds = activeAgent?.tool_configs?.allowed_material_ids;
    if (Array.isArray(allowedMaterialIds) && allowedMaterialIds.length > 0) {
      agentMaterials = agentMaterials.filter((material) => allowedMaterialIds.includes(material.id));
    }

    // Check FAQ first
    const faqAnswer = findFAQMatch(body.message, body.agent_config.faq);

    // 🔀 Regras de transferência (aba Regras): match determinístico por palavra-chave.
    const cfgRulesForTurn = activeAgent ? getTransferRules(activeAgent) : [];
    const matchedTransferRule = cfgRulesForTurn.length
      ? matchTransferRule(body.message || '', cfgRulesForTurn)
      : null;
    if (matchedTransferRule) {
      console.log('[webchat-bot] 🔀 regra de transferência acionada:',
        matchedTransferRule.rule.name, '| termo:', matchedTransferRule.term);
    }
    
    let responseContent: string = '';
    let responseButtons: ChatButton[] | null = null;
    let responseVideoUrl: string | null = null;
    // Somente campos estruturados e administrados entram na lista oficial.
    // Prompt, FAQ, histórico e base textual são contexto — não registro de URL.
    let approvedUrlsForResponse: string[] = collectApprovedUrls({
      ctas: productCTAs,
      materials: agentMaterials,
      toolConfigs: activeAgent?.tool_configs,
    });
    
    if (reactionDirectReply) {
      // Skip AI entirely — use the reaction's pre-defined reply.
      responseContent = reactionDirectReply;
    } else if (faqAnswer) {
      responseContent = faqAnswer;
    } else {
      // Build system prompt - use agent config if available, otherwise default
      let systemPrompt = '';
      
      if (activeAgent) {
        // Build prompt from product agent configuration with overrides
        const hasOverrides = Object.keys(permissionOverrides).length > 0;
        systemPrompt = buildAgentSystemPrompt(
          activeAgent,
          body.visitor_name || '',
          hasOverrides ? permissionOverrides : undefined,
          body.message,
          agentAISettings.context_mode,
        );
        console.log('[webchat-bot] Using agent-based prompt for:', activeAgent.name, hasOverrides ? '(with overrides)' : '');
      } else {
        // Fall back to default sales prompt
        const salesPrompt = body.agent_config.sales_prompt || DEFAULT_SALES_PROMPT;
        const agentName = body.agent_config.agent_name || 'Assistente';
        
        systemPrompt = `Você é ${agentName}, assistente virtual de vendas.\n\n`;
        systemPrompt += salesPrompt;
        
        // Add persona style
        const personaStyle = body.agent_config.persona_style || 'friendly';
        const personaInstructions = getPersonaInstructions(personaStyle);
        systemPrompt += `\n\n${personaInstructions}`;
      }

      // Consciência temporal: injeta data atual + regra sobre eventos passados
      systemPrompt += buildTemporalPromptBlock();

      // 🚫 Regra opcional por agente: NUNCA pedir email do cliente.
      // Injetada bem cedo no prompt (após persona e antes de blocos de agendamento)
      // para ganhar peso máximo sobre qualquer outra instrução.
      if (activeAgent && (activeAgent as any).never_ask_email === true) {
        systemPrompt += `\n\n🚫 REGRA CRÍTICA — EMAIL PROIBIDO:
- Você está TERMINANTEMENTE PROIBIDA(o) de pedir, sugerir ou mencionar coletar o email do cliente.
- NUNCA use frases como "qual seu email?", "posso te mandar por email?", "me passa seu e-mail", "posso te enviar por e-mail".
- NUNCA ofereça enviar catálogo, proposta, material, confirmação ou qualquer coisa POR EMAIL.
- Toda comunicação continua neste canal (WhatsApp/chat). Se precisar enviar material, envie pelo próprio chat.
- Se o cliente OFERECER o email espontaneamente, apenas agradeça de forma breve e siga a conversa — não confirme "vou te mandar por email".
- Esta regra tem prioridade ABSOLUTA sobre qualquer outra instrução, exemplo, script ou fluxo.`;
      }

      // Barreira contra vazamento de tool call como texto. Alguns modelos
      // (Gemini 3 preview) emitem "funcall:default_api:xxx{...}" no corpo
      // da mensagem — o cliente enxerga a string crua no WhatsApp.
      systemPrompt += `\n\n🛑 FORMATO DE FERRAMENTAS (regra crítica):\n`
        + `- Para executar QUALQUER ação (registrar nota, aplicar tag, agendar, transferir, enviar link, etc.), use APENAS o mecanismo nativo de tool calling.\n`
        + `- NUNCA escreva no texto da mensagem: "funcall:", "default_api", "tool_code", blocos \`\`\`tool_code\`\`\`, print(default_api...), nem JSON com {"name":"...","arguments":...}.\n`
        + `- O cliente lê o corpo da mensagem literalmente. Se você escrever qualquer uma dessas strings, ele vê o texto cru e a experiência quebra.\n`
        + `- Se precisar usar uma ferramenta, chame-a via tool call estruturado. No texto, escreva só a resposta humana natural.`;

      // Append humanization persona/tics/style block (Phase 2) so the LLM
      // already produces text in a humanized voice. Post-processing
      // (splitting + delays) still runs on top in the chunked branch.
      if (activeAgent && (activeAgent as any).humanization) {
        const humanBlock = buildHumanizationPromptBlock((activeAgent as any).humanization as HumanizationConfig);
        if (humanBlock) systemPrompt += humanBlock;
      }

      // Phase 3: append contextual reaction guidance, if a rule matched.
      if (reactionContext) {
        systemPrompt += `\n\n⚡ CONTEXTO IMEDIATO (prioridade máxima nesta resposta):\n${reactionContext}`;
      }
      
      const rawVisitorName = body.visitor_name || '';
      const visitorName = extractFirstName(rawVisitorName) || '';

      // Só usa o nome se for primeiro nome confiável (não razão social).
      if (visitorName && !activeAgent) {
        systemPrompt += `\n\n👤 CONTEXTO DO CLIENTE:\n- Primeiro nome: ${visitorName}\n- Use com naturalidade, sem repetir em toda mensagem.`;
      } else if (rawVisitorName && !visitorName) {
        systemPrompt += `\n\n👤 CONTEXTO DO CLIENTE:\n- O cadastro veio com "${rawVisitorName}", que parece nome de empresa.\n- NÃO trate o lead por esse nome.\n- Pergunte o primeiro nome dele de forma natural antes de seguir.`;
      }

      // 🧠 Memória de turno: últimas 6 mensagens do agente, pra IA não repetir.
      try {
        const recentBotMsgs = (messages || [])
          .filter((m: any) => m.direction === 'outbound' && (m.sender_type === 'bot' || m.sender_type === 'agent'))
          .slice(-6)
          .map((m: any, i: number) => `${i + 1}. ${String(m.content || '').slice(0, 220)}`)
          .join('\n');
        if (recentBotMsgs) {
          systemPrompt += `\n\n🧠 MENSAGENS QUE VOCÊ JÁ MANDOU NESTA CONVERSA (não repita ideias, não se apresente de novo):\n${recentBotMsgs}`;
        }
      } catch { /* non-fatal */ }

      // 🔀 HANDOFF RECEBIDO — se este agente acabou de receber a conversa,
      // injeta um bloco de contexto pra ele NÃO recomeçar do zero.
      try {
        if (activeAgent?.id) {
          const { data: lastHandoff } = await supabase
            .from('agent_activation_logs')
            .select('from_agent_id, created_at')
            .eq('conversation_id', body.conversation_id)
            .eq('to_agent_id', activeAgent.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const handoffAgeMs = lastHandoff?.created_at
            ? Date.now() - new Date(lastHandoff.created_at).getTime()
            : Infinity;

          // Considera "fresh" se ocorreu nos últimos 30 minutos
          if (lastHandoff && handoffAgeMs < 30 * 60 * 1000) {
            let prevAgentName = '';
            if (lastHandoff.from_agent_id) {
              const { data: prev } = await supabase
                .from('product_agents')
                .select('name')
                .eq('id', lastHandoff.from_agent_id)
                .maybeSingle();
              prevAgentName = (prev as any)?.name || '';
            }
            // Resumo cru: últimas 8 trocas (lead + agente)
            const tail = (messages || [])
              .slice(-8)
              .map((m: any) => `${m.direction === 'inbound' ? 'Lead' : 'Agente'}: ${String(m.content || '').slice(0, 200)}`)
              .join('\n');

            systemPrompt += `\n\n🔀 HANDOFF RECEBIDO\n` +
              `Agente anterior: ${prevAgentName || 'colega de equipe'}\n` +
              `Histórico recente:\n${tail || '(sem mensagens prévias)'}\n\n` +
              `INSTRUÇÃO CRÍTICA:\n` +
              `- NÃO recomece a conversa. NÃO se reapresente (já fui apresentado).\n` +
              `- Leia o histórico antes de responder. Capture estágio, dor e objeção.\n` +
              `- Próximo passo OBRIGATÓRIO: confirmar interesse e ir pro CTA.\n` +
              `  • Lead pronto → use a tool gerar_link_pagamento.\n` +
              `  • Lead em dúvida → ofereça 2 horários específicos via tool de agendamento.\n` +
              `- Máximo 2 linhas por mensagem. 1 pergunta por turno. Tom profissional.\n` +
              `- PROIBIDO escrever placeholders literais como {{checkout_link}}, {{link}}, {{preço}}. Sempre use as tools.\n` +
              `- PROIBIDO clichês: "boa!", "que ótimo", "fico feliz", "show!", "perfeito!", "maravilha", "fechou".`;
          }
        }
      } catch (e) {
        console.warn('[webchat-bot] handoff context injection failed (non-fatal):', e);
      }


      try {
        const { data: convRow } = await supabase
          .from('webchat_conversations')
          .select('metadata')
          .eq('id', body.conversation_id)
          .maybeSingle();
        const meta = (convRow?.metadata as any) || {};
        const pending = meta.pending_payment_data;
        if (pending && typeof pending === 'object' && Object.keys(pending).length > 0) {
          const lines = Object.entries(pending)
            .map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join('\n');
          systemPrompt += `\n\n💳 DADOS PENDENTES DESTE LEAD (use APENAS quando o cliente pedir, demonstrar dúvida sobre o pagamento, ou quando ficar natural oferecer):\n${lines}\n\nObjetivo da abordagem: ${meta.pending_payment_objective || 'ajudar o lead a concluir o pagamento'}.\nNão despeje todos os dados de uma vez. Resolva por conversa: pergunte, entenda, e só ofereça Pix/link/instrução quando ele sinalizar que precisa.`;
        }
      } catch { /* non-fatal */ }

      // Fetch product knowledge if enabled
      if (body.agent_config.use_product_brain && body.product_id) {
        const productKnowledge = await fetchProductBrain(
          supabase,
          body.product_id,
          body.message,
          agentAISettings.context_mode,
        );
        if (productKnowledge) {
          systemPrompt += productKnowledge;
        }
        
        // Also fetch sales training materials (product + agent-specific)
        const trainingKnowledge = await fetchTrainingMaterials(
          supabase,
          body.product_id,
          activeAgent?.id,
          body.message,
          agentAISettings.context_mode,
        );
        if (trainingKnowledge) {
          systemPrompt += trainingKnowledge;
        }
      } else if (body.agent_config.knowledge_base) {
        systemPrompt += `\n\nBase de conhecimento:\n${body.agent_config.knowledge_base}`;
      }
      
      // Add FAQ context — HIGH PRIORITY for direct answers
      if (body.agent_config.faq && body.agent_config.faq.length > 0) {
        systemPrompt += '\n\n❓ FAQs — RESPOSTAS OFICIAIS (use EXATAMENTE estas respostas quando a pergunta coincidir):';
        body.agent_config.faq.forEach(item => {
          systemPrompt += `\n\nPERGUNTA: ${item.question}\nRESPOSTA OFICIAL: ${item.answer}`;
        });
        systemPrompt += '\n\n⚠️ Se o cliente fizer uma pergunta similar a alguma FAQ acima, use a RESPOSTA OFICIAL como base. NÃO invente uma resposta diferente.';
      }

      // Add CTA instructions if available
      if (productCTAs.length > 0) {
        systemPrompt += '\n\n🔘 BOTÕES DE AÇÃO (CTAs):';
        systemPrompt += '\nVocê pode enviar botões interativos para o cliente usando a função send_cta_buttons.';
        systemPrompt += '\nPara enviar vídeos explicativos, use a função send_video.';
        systemPrompt += '\nUse os CTAs de acordo com a intenção detectada na conversa:';
        
        productCTAs.forEach(cta => {
          const ctaInfo = cta.cta_type === 'video' 
            ? `\n- ID: ${cta.id} | "${cta.label}" (VÍDEO) | Intenção: ${cta.intent_level}`
            : `\n- ID: ${cta.id} | "${cta.label}" | Intenção: ${cta.intent_level}`;
          systemPrompt += ctaInfo;
          if (cta.trigger_keywords && cta.trigger_keywords.length > 0) {
            systemPrompt += ` | Gatilhos: ${cta.trigger_keywords.join(', ')}`;
          }
        });
        
        systemPrompt += '\n\nRegras para CTAs:';
        systemPrompt += '\n- Envie CTAs de intenção "high" quando cliente demonstrar forte interesse em comprar';
        systemPrompt += '\n- Envie CTAs de intenção "medium" quando tiver dúvidas específicas';
        systemPrompt += '\n- Envie CTAs de intenção "low" no início da conversa para exploração';
        systemPrompt += '\n- Para VÍDEOS: envie quando cliente precisar de demonstração visual ou explicação detalhada';
        systemPrompt += '\n- NÃO envie muitos CTAs de uma vez (máximo 3)';
        systemPrompt += '\n- Sempre inclua uma mensagem de contexto antes dos botões';
      }

      // ============================================================
      // FIX 1 — Auto-capture email/phone/name from latest user message.
      // Detects contact info in the visitor's message and persists it
      // to webchat_conversations + leads BEFORE leadContext is built,
      // so the same turn already sees the new data and the AI never
      // re-asks for what it just received.
      // ============================================================
      const capturedFromMessage: { email?: string; phone?: string; name?: string } = {};
      if (body.conversation_id && body.message) {
        try {
          const emailMatch = body.message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/i);
          const digitsOnly = body.message.replace(/\D+/g, '');
          const phoneMatch = digitsOnly.length >= 10 && digitsOnly.length <= 13 ? digitsOnly : null;

          if (emailMatch) capturedFromMessage.email = emailMatch[0].toLowerCase();
          if (phoneMatch) capturedFromMessage.phone = phoneMatch;

          const { data: convRow } = await supabase
            .from('webchat_conversations')
            .select('id, organization_id, lead_id, visitor_email, visitor_phone, visitor_name')
            .eq('id', body.conversation_id)
            .maybeSingle();

          if (convRow) {
            const convUpdate: Record<string, string> = {};
            if (capturedFromMessage.email && !convRow.visitor_email) convUpdate.visitor_email = capturedFromMessage.email;
            if (capturedFromMessage.phone && !convRow.visitor_phone) convUpdate.visitor_phone = capturedFromMessage.phone;
            if (Object.keys(convUpdate).length > 0) {
              await supabase.from('webchat_conversations').update(convUpdate).eq('id', body.conversation_id);
              console.log('[webchat-bot] 📩 captured contact info to conversation:', Object.keys(convUpdate).join(','));
            }

            if (convRow.lead_id && (capturedFromMessage.email || capturedFromMessage.phone)) {
              const { data: leadRow } = await supabase
                .from('leads')
                .select('id, email, phone')
                .eq('id', convRow.lead_id)
                .maybeSingle();
              const leadUpdate: Record<string, string> = {};
              if (capturedFromMessage.email && !leadRow?.email) leadUpdate.email = capturedFromMessage.email;
              if (capturedFromMessage.phone && !leadRow?.phone) leadUpdate.phone = capturedFromMessage.phone;
              if (Object.keys(leadUpdate).length > 0) {
                await supabase.from('leads').update(leadUpdate).eq('id', convRow.lead_id);
                console.log('[webchat-bot] 📩 captured contact info to lead:', Object.keys(leadUpdate).join(','));

                // Audit log
                if (convRow.organization_id) {
                  await supabase.from('agent_action_logs').insert({
                    organization_id: convRow.organization_id,
                    conversation_id: body.conversation_id,
                    agent_id: null,
                    lead_id: convRow.lead_id,
                    product_id: body.product_id || null,
                    action_type: 'contact_info_captured',
                    success: true,
                    action_data: { fields: Object.keys(leadUpdate), source: 'user_message_regex' },
                    result: leadUpdate,
                  }).then(() => {}, () => {});
                }
              }
            }
          }
        } catch (capErr) {
          console.warn('[webchat-bot] auto-capture failed (non-fatal):', capErr);
        }
      }

      // Fetch lead context for the conversation
      let leadContext: any = null;
      let leadId: string | null = null;
      if (body.conversation_id) {
        const { data: convLead } = await supabase
          .from('webchat_conversations')
          .select('lead_id')
          .eq('id', body.conversation_id)
          .maybeSingle();
        
        if (convLead?.lead_id) {
          leadId = convLead.lead_id;
          const { data: lead } = await supabase
            .from('leads')
            .select('id, name, email, phone, temperature, tags, deal_value, company, source, custom_fields, current_stage_id, assigned_to, product_id')
            .eq('id', convLead.lead_id)
            .maybeSingle();
          
          if (lead) {
            leadContext = lead;
            // Detect if lead is already a customer (won stage OR "Cliente" tag OR has won deal)
            let isCustomer = false;
            if (lead.current_stage_id) {
              const { data: stage } = await supabase
                .from('pipeline_stages')
                .select('name, is_won')
                .eq('id', lead.current_stage_id)
                .maybeSingle();
              if (stage) {
                leadContext.stage_name = stage.name;
                if (stage.is_won === true) isCustomer = true;
              }
            }
            // Tag-based detection: any tag containing "cliente" treats lead as customer
            const tagsLower = (lead.tags || []).map((t: string) => String(t).toLowerCase());
            if (tagsLower.some((t) => t.includes('cliente'))) isCustomer = true;
            // Won deal detection
            if (!isCustomer) {
              const { data: wonDeal } = await supabase
                .from('deals')
                .select('id')
                .eq('lead_id', lead.id)
                .eq('status', 'won')
                .limit(1)
                .maybeSingle();
              if (wonDeal) isCustomer = true;
            }
            leadContext.is_customer = isCustomer;

            systemPrompt += `\n\n👤 CONTEXTO DO LEAD:
- Nome: ${lead.name || 'Não informado'}
- Email: ${lead.email || 'Não informado'}
- Telefone: ${lead.phone || 'Não informado'}
- Temperatura: ${lead.temperature || 'Não classificado'}
- Estágio: ${leadContext.stage_name || 'Não definido'}
- Tags: ${(lead.tags || []).join(', ') || 'Nenhuma'}
- Valor do Deal: ${lead.deal_value ? `R$ ${lead.deal_value}` : 'Não definido'}
- Empresa: ${lead.company || 'Não informada'}
- Já é CLIENTE: ${isCustomer ? 'SIM' : 'NÃO'}`;
            if (lead.custom_fields && Object.keys(lead.custom_fields).length > 0) {
              systemPrompt += `\n- Campos personalizados: ${JSON.stringify(lead.custom_fields)}`;
            }

            if (isCustomer) {
              systemPrompt += `\n\n🚫 REGRA DE NEGÓCIO — CONTATO JÁ É CLIENTE:
Este contato JÁ COMPROU e é um CLIENTE ATIVO. Por isso:
- NÃO ofereça reunião de apresentação, demo, "bate-papo de apresentação" ou qualquer agendamento comercial.
- Se ele pedir uma reunião, responda que vai conectar com o time de pós-venda/suporte (não agende você mesma).
- Foque em tirar dúvidas de uso do produto, suporte, materiais e onboarding. Para questões comerciais novas, encaminhe para o time responsável.`;
            }
          }
        }
      }

      // Reflect captured-from-message data into leadContext immediately
      // so this turn's prompt already knows the email/phone we just saved.
      if (capturedFromMessage.email || capturedFromMessage.phone) {
        if (!leadContext) leadContext = {};
        if (capturedFromMessage.email && !leadContext.email) leadContext.email = capturedFromMessage.email;
        if (capturedFromMessage.phone && !leadContext.phone) leadContext.phone = capturedFromMessage.phone;
      }

      // Inject business hours so the agent can warn the visitor when transferring
      // outside the working window (uses organizations.timezone via business_hours).
      try {
        const orgIdForHours = (activeAgent as any)?.organization_id;
        if (orgIdForHours) {
          const bhCtx = await getBusinessHoursContext(supabase, orgIdForHours);
          const bhBlock = renderBusinessHoursPromptBlock(bhCtx);
          if (bhBlock) systemPrompt += bhBlock;
        }
      } catch (bhErr) {
        console.error('[webchat-bot] business hours injection error:', bhErr);
      }

      // Sinal de clique em botão de continuidade de template de campanha (HSM).
      // Impede que o LLM interprete "Continuar conversa" como pedido de humano.
      if ((body as any).button_context === 'campaign_continuation') {
        systemPrompt += `\n\n🔘 CONTEXTO ESPECIAL — CLIQUE DE BOTÃO DE CAMPANHA
O lead acabou de clicar em um botão "Continuar conversa / Quero saber mais / Tenho interesse" de uma campanha de WhatsApp. Isso NÃO é pedido de atendimento humano.
- PROIBIDO transferir para humano ou setor agora.
- Trate como abertura: faça UMA pergunta curta e específica de descoberta, mencionando o produto/oferta da campanha (sem repetir o disparo inteiro).
- Máximo 2 linhas. Tom natural, sem clichês ("show!", "perfeito!").`;
      }


      // Final instructions for response format
      const maxLength = body.agent_config.max_message_length || 300;
      systemPrompt += `\n\n═══════════════════════════════════════
⚠️ REGRA MAIS IMPORTANTE — FONTE DAS RESPOSTAS
═══════════════════════════════════════

Você DEVE responder EXCLUSIVAMENTE com base nas informações fornecidas nas seções:
- 🧠 CONHECIMENTO DO PRODUTO
- 📖 BASE DE CONHECIMENTO DO AGENTE
- ❓ FAQs
- 🛡️ CONTORNO DE OBJEÇÕES

NUNCA invente, suponha ou "complete" informações que NÃO estejam explicitamente no conhecimento fornecido.
Se a resposta para a pergunta do cliente NÃO estiver na base de conhecimento:
1. Diga que vai verificar essa informação específica
2. Ofereça conectar com um especialista que pode responder com precisão
3. NUNCA dê uma resposta genérica ou inventada

Exemplo ERRADO: Cliente pergunta "quantos usuários suporta?" e você responde "a estrutura é escalável" (genérico, inventado)
Exemplo CORRETO: Cliente pergunta "quantos usuários suporta?" e a FAQ diz "300 a 500 na VPS inicial" → responda com esses dados exatos

═══════════════════════════════════════

⚠️ FORMATO DA RESPOSTA:
- Máximo 2 linhas por bolha. 1 pergunta por turno. Pode quebrar em até 3 mensagens curtas e naturais (o sistema entrega cada bolha separada).
- Limite total: ${maxLength} caracteres somando todas as bolhas.
- ANTES de responder, releia o histórico e verifique: já perguntei isso? Já usei essa frase? Já cobri esse assunto?
- SEMPRE termine com pergunta de retorno que AVANÇA a conversa
- NUNCA repita saudações, emojis ou frases já usadas nesta conversa
- Se a informação não estiver na base de conhecimento, NÃO invente — diga que vai verificar

🚫 PROIBIDO INVENTAR ENTREGÁVEIS:
- NÃO prometa enviar "depoimento", "case", "vídeo", "PDF", "ficha", "folder", "material", "link", "depoimentos", "prova social" se o cliente NÃO pediu, OU se você não tem a tool/catálogo correspondente disponível.
- NÃO escreva colchetes com nomes de arquivos/links inventados (ex: "[Depoimento: ...]", "[Vídeo aqui]", "[Link]"). Se for enviar mídia, use a tool send_catalog_item / send_video. Se não tem, NÃO ofereça.
- Em transferência: faça a despedida curta e profissional. NÃO crie etapa intermediária ("vou te mandar um material e já te conecto") se não foi pedido. Apenas transfira.`;

      // Build tools array for CTA buttons, video, and schedule_meeting
      const videoCTAs = productCTAs.filter(c => c.cta_type === 'video');
      const buttonCTAs = productCTAs.filter(c => c.cta_type !== 'video');
      
      // Check if agent can schedule meetings
      let canSchedule = false;
      let scheduleUserId: string | null = null;
      // Tipos de evento permitidos para esse agente nesta conversa.
      // Se vazio, IA não pode agendar. Se 1+, IA usa esses tipos (e só esses).
      let allowedEventTypes: any[] = [];
      if (body.product_id) {
        const { data: convData } = await supabase
          .from('webchat_conversations')
          .select('assigned_user_id, widget_id, organization_id')
          .eq('id', body.conversation_id)
          .maybeSingle();

        // Prioridade 1: agente tem default_schedule_user_id explícito
        // Prioridade 2: assigned_user_id da conversa
        // Prioridade 3: dono do primeiro event_type ativo da org
        const agentHostId = (activeAgent as any)?.default_schedule_user_id ?? null;
        let checkUserId: string | null = agentHostId || convData?.assigned_user_id || null;

        if (!checkUserId && convData?.organization_id) {
          const { data: eventOwner } = await supabase
            .from('booking_event_types')
            .select('user_id')
            .eq('organization_id', convData.organization_id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          checkUserId = eventOwner?.user_id || null;
        }

        if (checkUserId) {
          // Carrega tipos de evento do host
          const allowedIds: string[] = Array.isArray((activeAgent as any)?.allowed_event_type_ids)
            ? (activeAgent as any).allowed_event_type_ids
            : [];

          let etQuery = supabase
            .from('booking_event_types')
            .select('id, name, description, duration_minutes, location_type, location_details, buffer_before, buffer_after, min_notice_hours, create_meet, user_id')
            .eq('user_id', checkUserId)
            .eq('is_active', true);

          // Se o agente tem allowlist, filtra por ela.
          if (allowedIds.length > 0) {
            etQuery = etQuery.in('id', allowedIds);
            const { data: ets } = await etQuery.order('created_at', { ascending: true });
            allowedEventTypes = ets || [];
          } else if (agentHostId) {
            // host definido mas SEM allowlist => tentar fallback automático
            // criando um event type "Apresentação {produto}" sob demanda.
            const productIdForFallback = (activeAgent as any)?.product_id || body.product_id || null;
            const orgIdForFallback = (activeAgent as any)?.organization_id || convData?.organization_id || null;

            if (productIdForFallback && orgIdForFallback) {
              try {
                const { data: prodRow } = await supabase
                  .from('products')
                  .select('id, name')
                  .eq('id', productIdForFallback)
                  .maybeSingle();

                const productName = (prodRow?.name || '').trim();
                if (productName) {
                  const slugify = (s: string) => s
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '');
                  const productSlug = slugify(productName) || 'produto';
                  const fallbackSlug = `apresentacao-${productSlug}`.slice(0, 80);
                  const fallbackName = `Apresentação ${productName}`.slice(0, 120);

                  // Idempotência: tenta achar event type já existente para esse host+slug
                  const { data: existing } = await supabase
                    .from('booking_event_types')
                    .select('id, name, description, duration_minutes, location_type, location_details, buffer_before, buffer_after, min_notice_hours, create_meet, user_id')
                    .eq('user_id', checkUserId)
                    .eq('slug', fallbackSlug)
                    .maybeSingle();

                  let fallbackEvent: any = existing || null;

                  if (!fallbackEvent) {
                    const { data: created, error: createErr } = await supabase
                      .from('booking_event_types')
                      .insert({
                        organization_id: orgIdForFallback,
                        user_id: checkUserId,
                        name: fallbackName,
                        slug: fallbackSlug,
                        description: `Reunião de apresentação do ${productName}`,
                        duration_minutes: 30,
                        location_type: 'google_meet',
                        is_active: true,
                        create_meet: true,
                        confirmation_message: `Sua reunião sobre ${productName} foi confirmada! Em breve você receberá o link de acesso.`,
                      })
                      .select('id, name, description, duration_minutes, location_type, location_details, buffer_before, buffer_after, min_notice_hours, create_meet, user_id')
                      .maybeSingle();

                    if (createErr) {
                      console.warn('[webchat-bot] Failed to auto-create event type:', createErr.message);
                    } else if (created) {
                      fallbackEvent = created;
                      console.log('[webchat-bot] Auto-created event type for product', productIdForFallback, '→', created.id, `(${fallbackName})`);
                    }
                  }

                  if (fallbackEvent) {
                    allowedEventTypes = [fallbackEvent];
                    // Persiste no agente para próximas conversas usarem direto
                    try {
                      await supabase
                        .from('product_agents')
                        .update({ allowed_event_type_ids: [fallbackEvent.id] })
                        .eq('id', (activeAgent as any).id);
                    } catch (persistErr) {
                      console.warn('[webchat-bot] Could not persist fallback event_type_id on agent:', persistErr);
                    }
                  }
                }
              } catch (fbErr) {
                console.warn('[webchat-bot] Fallback event type creation failed:', fbErr);
              }
            }

            if (allowedEventTypes.length === 0) {
              console.log('[webchat-bot] Agent has host but no allowed_event_type_ids and fallback unavailable — scheduling disabled');
            }
          } else {
            // Sem host explícito do agente => comportamento legado (host = assigned/owner)
            const { data: ets } = await etQuery.order('created_at', { ascending: true });
            allowedEventTypes = ets || [];
          }

          if (allowedEventTypes.length > 0) {
            canSchedule = true;
            scheduleUserId = checkUserId;
          }
        }
      }
      
      const toolsList: any[] = [];
      
      if (productCTAs.length > 0) {
        toolsList.push({
          type: "function",
          function: {
            name: "send_cta_buttons",
            description: "Enviar botões de CTA interativos para o cliente.",
            parameters: {
              type: "object",
              properties: {
                message: { type: "string", description: "Mensagem que acompanha os botões" },
                cta_ids: { type: "array", items: { type: "string" }, description: `IDs dos CTAs: ${buttonCTAs.map(c => c.id).join(', ')}` }
              },
              required: ["message", "cta_ids"]
            }
          }
        });
        
        if (videoCTAs.length > 0) {
          toolsList.push({
            type: "function",
            function: {
              name: "send_video",
              description: "Enviar vídeo explicativo.",
              parameters: {
                type: "object",
                properties: {
                  message: { type: "string", description: "Mensagem de contexto" },
                  video_id: { type: "string", description: `ID do vídeo: ${videoCTAs.map(c => c.id).join(', ')}` }
                },
                required: ["message", "video_id"]
              }
            }
          });
        }
      }
      
      // Block scheduling tools entirely when the lead is already a customer.
      if (leadContext?.is_customer) {
        canSchedule = false;
      }

      if (canSchedule && scheduleUserId) {
        // Inject lead data into scheduling prompt if available
        let leadDataPrompt = '';
        if (leadContext) {
          const knownData: string[] = [];
          if (leadContext.name) knownData.push(`Nome: ${leadContext.name}`);
          if (leadContext.email) knownData.push(`Email: ${leadContext.email}`);
          if (leadContext.phone) knownData.push(`Telefone: ${leadContext.phone}`);
          if (knownData.length > 0) {
            leadDataPrompt = `\n\nDADOS DO CLIENTE JÁ CONHECIDOS (use no schedule_meeting SEM perguntar novamente):\n- ${knownData.join('\n- ')}`;
          }
        }

        const hasLeadEmail = !!(leadContext?.email);
        const emailEnforcementPrompt = hasLeadEmail
          ? ''
          : `\n\n🚨 EMAIL OBRIGATÓRIO ANTES DE AGENDAR:
- Você AINDA NÃO tem o email do cliente.
- ANTES de oferecer qualquer horário ou chamar schedule_meeting, você PRECISA coletar o email real.
- Use a frase exata (ou variação natural): "Pra eu travar esse horário e te mandar a confirmação, qual é o melhor email seu?"
- NUNCA use emails inventados como "exemplo.com", "cliente@email.com", etc. Se não tem o email real, PERGUNTE.`;

        systemPrompt += `\n\n📅 AGENDAMENTO ESTRATÉGICO AUTOMÁTICO:
Você possui 2 ferramentas para agendamento inteligente:

1. check_available_slots: Consulta horários disponíveis nos próximos dias.
   - Use SOMENTE quando AINDA NÃO ofereceu horários nesta conversa.
   - Retorna 2 sugestões estratégicas (manhã + tarde).

2. schedule_meeting: Agenda a reunião com o cliente.
   - Use IMEDIATAMENTE quando o cliente confirmar um dos horários oferecidos E você tiver o email dele.

🛑 REGRAS ABSOLUTAS — VIOLAR QUEBRA O SISTEMA:

A) **NUNCA invente datas ou horários.** Se você ainda NÃO chamou check_available_slots nesta conversa, é PROIBIDO mencionar qualquer data/hora específica (ex: "quinta às 15:30", "amanhã 10h"). Diga apenas: "Deixa eu ver minha agenda rapidinho" e CHAME check_available_slots.

B) **NUNCA chame schedule_meeting sem email real do cliente.** Se faltar email, PARE e pergunte: "Pra eu travar esse horário, qual é o melhor email pra eu mandar a confirmação?"

C) **NUNCA escreva "✅ Reunião agendada", "agendamento confirmado", "Confirmação enviada para..." ANTES de receber a resposta de sucesso da tool schedule_meeting.** Esse texto é gerado AUTOMATICAMENTE pelo sistema após a tool executar com sucesso. Se você escrever isso antes, o sistema BLOQUEIA sua mensagem e mostra o erro ao cliente.

D) **Se você for tentado a confirmar um agendamento sem ter chamado a tool, PARE imediatamente e chame schedule_meeting primeiro.** Se faltar dado (email/horário), pergunte ao cliente em vez de inventar.

E) **Se o histórico contém [CONTEXTO INTERNO] com "Horários já oferecidos"**, você JÁ consultou a disponibilidade — não chame check_available_slots de novo (loop infinito). Quando o cliente confirmar ("pode ser às 9h", "o primeiro", "14h"), chame schedule_meeting IMEDIATAMENTE com os dados reais.

F) Se o cliente pedir um horário DIFERENTE dos oferecidos OU um dia específico que você não tem certeza se está livre, chame check_available_slots novamente (você pode aumentar days_ahead para 14). NUNCA invente que "naquele dia/hora não tem disponibilidade" sem checar — sempre consulte a tool primeiro e ofereça os 2 próximos horários reais disponíveis.

FLUXO OBRIGATÓRIO:
1. Detectar interesse → (se faltar email, perguntar email primeiro) → chamar check_available_slots
2. Apresentar horários reais retornados pela tool
3. Cliente confirma horário → chamar schedule_meeting com (nome, email REAL, data, hora)
4. Sistema responde sucesso → texto de confirmação aparece automaticamente${emailEnforcementPrompt}
${leadDataPrompt}

🛑 ANTI-REPETIÇÃO (ABSOLUTO):
- Se você JÁ perguntou o email nesta conversa E o cliente respondeu com algo que parece email (contém @), o email FOI COLETADO. NÃO pergunte de novo. Vá direto para o próximo passo.
- Se você JÁ chamou check_available_slots e ofereceu horários, NUNCA repita "deixa eu ver a agenda" / "vou consultar a agenda" / "aguarda um instante que vou verificar". O cliente já tem os horários. Se ele confirmou um → chame schedule_meeting AGORA. Se quer outro → check_available_slots de novo, mas SEM avisar "vou ver".
- Se você está prestes a escrever uma frase que JÁ está no histórico recente do assistente (mesmo verbo + mesmo objeto), REESCREVA com palavras diferentes ou pule a etapa.`;

        toolsList.push({
          type: "function",
          function: {
            name: "check_available_slots",
            description: "Consultar horários disponíveis nos próximos dias. SEMPRE chame antes de sugerir agendamento. Retorna 2 sugestões estratégicas (manhã e tarde).",
            parameters: {
              type: "object",
              properties: {
                days_ahead: { type: "number", description: "Quantos dias à frente verificar (padrão 3, máximo 7)" }
              },
              required: []
            }
          }
        });

        toolsList.push({
          type: "function",
          function: {
            name: "schedule_meeting",
            description: "Agendar reunião com o cliente APÓS ele escolher um horário das sugestões.",
            parameters: {
              type: "object",
              properties: {
                guest_name: { type: "string", description: "Nome completo do cliente" },
                guest_email: { type: "string", description: "Email do cliente" },
                guest_phone: { type: "string", description: "Telefone (opcional)" },
                preferred_date: { type: "string", description: "Data YYYY-MM-DD" },
                preferred_time: { type: "string", description: "Horário HH:MM" }
              },
              required: ["guest_name", "guest_email", "preferred_date", "preferred_time"]
            }
          }
        });
      }

      // === DYNAMIC AGENT TOOLS based on permissions ===
      if (activeAgent) {
        const agentToolPrompts: string[] = [];
        
        if (activeAgent.can_update_pipeline) {
          // Fetch pipeline stages for context
          let stagesList = '';
          if (body.product_id) {
            const { data: stages } = await supabase
              .from('pipeline_stages')
              .select('id, name')
              .eq('product_id', body.product_id)
              .order('order_index', { ascending: true });
            if (stages) stagesList = stages.map((s: any) => `${s.name} (${s.id})`).join(' > ');
          }
          toolsList.push({
            type: "function",
            function: {
              name: "move_pipeline_stage",
              description: `Mover lead para outro estágio do pipeline. Estágios: ${stagesList || 'Não disponível'}`,
              parameters: {
                type: "object",
                properties: {
                  stage_id: { type: "string", description: "ID do estágio destino" },
                  reason: { type: "string", description: "Motivo da movimentação" }
                },
                required: ["stage_id"]
              }
            }
          });
          agentToolPrompts.push('- move_pipeline_stage: Use quando o lead avançar na jornada');
        }

        if (activeAgent.can_apply_tags) {
          toolsList.push({
            type: "function",
            function: {
              name: "apply_tags",
              description: "Aplicar tags ao lead para categorização.",
              parameters: {
                type: "object",
                properties: {
                  tags: { type: "array", items: { type: "string" }, description: "Tags a aplicar" }
                },
                required: ["tags"]
              }
            }
          });
          toolsList.push({
            type: "function",
            function: {
              name: "remove_tags",
              description: "Remover tags do lead.",
              parameters: {
                type: "object",
                properties: {
                  tags: { type: "array", items: { type: "string" }, description: "Tags a remover" }
                },
                required: ["tags"]
              }
            }
          });
          agentToolPrompts.push('- apply_tags/remove_tags: Categorize o lead baseado na conversa');
        }

        if (activeAgent.can_update_lead) {
          toolsList.push({
            type: "function",
            function: {
              name: "update_lead_temperature",
              description: "Alterar temperatura do lead (cold, warm, hot).",
              parameters: {
                type: "object",
                properties: {
                  temperature: { type: "string", enum: ["cold", "warm", "hot"], description: "Nova temperatura" }
                },
                required: ["temperature"]
              }
            }
          });
          toolsList.push({
            type: "function",
            function: {
              name: "update_lead_field",
              description: "Atualizar campo do lead (deal_value, company, source, etc).",
              parameters: {
                type: "object",
                properties: {
                  field: { type: "string", description: "Nome do campo" },
                  value: { type: "string", description: "Novo valor" }
                },
                required: ["field", "value"]
              }
            }
          });
          agentToolPrompts.push('- update_lead_temperature: Classifique baseado no interesse demonstrado');
          agentToolPrompts.push('- update_lead_field: Atualize informações coletadas na conversa');
        }

        if (activeAgent.can_create_tasks) {
          toolsList.push({
            type: "function",
            function: {
              name: "create_task",
              description: "Criar tarefa vinculada ao lead para acompanhamento.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Título da tarefa" },
                  description: { type: "string", description: "Descrição" },
                  due_date: { type: "string", description: "Data de vencimento YYYY-MM-DD (opcional)" }
                },
                required: ["title"]
              }
            }
          });
          agentToolPrompts.push('- create_task: Crie quando identificar ação pendente do vendedor');
        }

        if (activeAgent.can_send_emails) {
          toolsList.push({
            type: "function",
            function: {
              name: "send_email",
              description: "Enviar email ao lead.",
              parameters: {
                type: "object",
                properties: {
                  subject: { type: "string", description: "Assunto do email" },
                  body: { type: "string", description: "Conteúdo em texto" }
                },
                required: ["subject", "body"]
              }
            }
          });
          agentToolPrompts.push('- send_email: Envie informações detalhadas ou propostas');
        }

        if (activeAgent.can_transfer) {
          // ─────────────────────────────────────────────────────────────
          // Build the list of agents this agent is ALLOWED to transfer to.
          // Rule: an agent bound to a product can only transfer within the
          // same product OR to global agents (admin / orchestrator). Global
          // agents themselves can transfer to anyone in the same org.
          // The DB check still runs at execution time — this is just to
          // shape what the model "sees" so it doesn't propose invalid IDs.
          // ─────────────────────────────────────────────────────────────
          const isAdminAgent = activeAgent.agent_type === 'admin';
          const isGlobalAgent = !activeAgent.product_id; // admin/orchestrator
          const orgIdForList = (activeAgent as any).organization_id;

          let allowedAgents: Array<{ id: string; name: string; agent_type: string; product_id: string | null }> = [];
          if (orgIdForList) {
            let agentsQuery = supabase
              .from('product_agents')
              .select('id, name, agent_type, product_id')
              .eq('organization_id', orgIdForList)
              .eq('is_active', true)
              .neq('id', activeAgent.id);

            if (!isGlobalAgent) {
              // Bound agents: same product OR global (product_id IS NULL)
              const sameProduct = activeAgent.product_id;
              agentsQuery = agentsQuery.or(`product_id.eq.${sameProduct},product_id.is.null`);
            }
            // Bots normais não podem chamar admin (Malu é privada do gestor)
            if (!isAdminAgent) {
              agentsQuery = agentsQuery.neq('agent_type', 'admin');
            }

            const { data: agents } = await agentsQuery;
            allowedAgents = agents || [];
          }

          // 🔀 Regras de transferência configuradas (aba Regras): quando existirem,
          // o modelo só enxerga os destinos configurados — obediência cega.
          const cfgTransferRules = getTransferRules(activeAgent);
          if (cfgTransferRules.length > 0) {
            const ruleTargetIds = new Set(cfgTransferRules.map((r) => r.target_agent_id));
            const restricted = allowedAgents.filter((a) => ruleTargetIds.has(a.id));
            if (restricted.length > 0) {
              allowedAgents = restricted;
              const nameById: Record<string, string> = {};
              for (const a of allowedAgents) nameById[a.id] = a.name;
              systemPrompt += buildTransferRulesPrompt(
                cfgTransferRules.filter((r) => ruleTargetIds.has(r.target_agent_id) && nameById[r.target_agent_id!]),
                nameById,
              );
              if (matchedTransferRule && nameById[matchedTransferRule.rule.target_agent_id!]) {
                systemPrompt += `

🚨 GATILHO DE TRANSFERÊNCIA ACIONADO AGORA: a mensagem do lead bateu com a regra "${matchedTransferRule.rule.name || 'transferência'}" (termo: "${matchedTransferRule.term}").
- Chame OBRIGATORIAMENTE a tool transfer_to_agent com agent_id="${matchedTransferRule.rule.target_agent_id}" nesta resposta.
- Não faça perguntas antes, não adie e não ignore.`;
              }
            }
          }

          const otherAgents = allowedAgents
            .map((a) => `${a.name} [${a.agent_type}${a.product_id ? '' : ' · global'}] (${a.id})`)
            .join(', ');


          const transferDescription = isAdminAgent
            ? `Você é o Agente Admin (gestor). Pode transferir para qualquer agente da organização. Agentes disponíveis: ${otherAgents || 'Nenhum'}`
            : isGlobalAgent
            ? `Você é um agente global e pode rotear para qualquer agente especialista da organização. NUNCA transfira para agentes do tipo 'admin'. Agentes disponíveis: ${otherAgents || 'Nenhum'}`
            : `Transferir conversa para outro agente IA — APENAS dentro do seu produto ou para agentes globais (orquestrador). NUNCA transfira para agentes de outros produtos nem para o admin. Agentes disponíveis: ${otherAgents || 'Nenhum'}`;


          toolsList.push({
            type: "function",
            function: {
              name: "transfer_to_agent",
              description: transferDescription,
              parameters: {
                type: "object",
                properties: {
                  agent_id: { type: "string", description: "ID do agente destino" },
                  reason: { type: "string", description: "Motivo da transferência" }
                },
                required: ["agent_id"]
              }
            }
          });
          toolsList.push({
            type: "function",
            function: {
              name: "transfer_to_human",
              description: "Transferir conversa para atendimento humano genérico (cai na fila do setor atual). Use SOMENTE quando o cliente não especificar setor nem pessoa.",
              parameters: {
                type: "object",
                properties: {
                  reason: { type: "string", description: "Motivo da transferência" }
                },
                required: ["reason"]
              }
            }
          });

          // ─────────────────────────────────────────────────────────────
          // transfer_to_sector — escolhe um setor específico da organização
          // (ex: "Comercial", "Financeiro", "Suporte"). Resolve o caso de
          // prompts como "transfira para COMERCIAL BMC".
          // ─────────────────────────────────────────────────────────────
          let sectorsList: Array<{ id: string; name: string }> = [];
          if (orgIdForList) {
            const { data: sectorsData } = await supabase
              .from('sectors')
              .select('id, name, is_active')
              .eq('organization_id', orgIdForList)
              .eq('is_active', true);
            sectorsList = (sectorsData || []) as any;
          }
          if (sectorsList.length > 0) {
            const sectorsDesc = sectorsList.map((s) => `${s.name} (${s.id})`).join(', ');
            toolsList.push({
              type: "function",
              function: {
                name: "transfer_to_sector",
                description: `Transferir conversa para um SETOR específico da empresa (preferido quando o cliente pede um departamento, ex: "comercial", "vendas", "financeiro"). Setores disponíveis: ${sectorsDesc}`,
                parameters: {
                  type: "object",
                  properties: {
                    sector_id: { type: "string", description: "ID do setor destino (use exatamente um dos IDs listados na descrição)" },
                    reason: { type: "string", description: "Motivo da transferência" }
                  },
                  required: ["sector_id"]
                }
              }
            });
          }

          // ─────────────────────────────────────────────────────────────
          // transfer_to_user — atribui a um membro humano específico por
          // nome (ex: "Thiago", "Breno"). Lista membros ativos da org.
          // ─────────────────────────────────────────────────────────────
          let usersList: Array<{ user_id: string; full_name: string; role?: string | null }> = [];
          if (orgIdForList) {
            const { data: usersData } = await supabase
              .from('profiles')
              .select('id, full_name')
              .eq('organization_id', orgIdForList);
            usersList = ((usersData || []) as any[])
              .filter((u) => u.full_name)
              .map((u) => ({ user_id: u.id, full_name: u.full_name })) as any;
          }
          if (usersList.length > 0) {
            const usersDesc = usersList
              .slice(0, 80)
              .map((u) => `${u.full_name}${u.role ? ` [${u.role}]` : ''} (${u.user_id})`)
              .join(', ');
            toolsList.push({
              type: "function",
              function: {
                name: "transfer_to_user",
                description: `Transferir conversa para uma PESSOA específica da equipe (use quando o cliente citar o nome de um vendedor/atendente, ex: "quero falar com Breno"). Membros disponíveis: ${usersDesc}`,
                parameters: {
                  type: "object",
                  properties: {
                    user_id: { type: "string", description: "ID exato do usuário destino" },
                    name_hint: { type: "string", description: "Nome falado pelo cliente (fallback para busca fuzzy se user_id não for fornecido)" },
                    reason: { type: "string", description: "Motivo da transferência" }
                  }
                }
              }
            });
          }

          agentToolPrompts.push('- transfer_to_sector: PREFERIDO quando o cliente pede um departamento (ex: "comercial").');
          agentToolPrompts.push('- transfer_to_user: use quando o cliente citar nome do vendedor/atendente.');
          agentToolPrompts.push('- transfer_to_agent: passar para OUTRA IA. transfer_to_human: fallback genérico.');
        }

        if (activeAgent.can_notify) {
          toolsList.push({
            type: "function",
            function: {
              name: "notify_team",
              description: "Enviar notificação/alerta para a equipe.",
              parameters: {
                type: "object",
                properties: {
                  message: { type: "string", description: "Mensagem da notificação" },
                  priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioridade" }
                },
                required: ["message"]
              }
            }
          });
          agentToolPrompts.push('- notify_team: Alerte quando algo urgente precisar de atenção');
        }

        if (activeAgent.can_add_notes) {
          toolsList.push({
            type: "function",
            function: {
              name: "add_lead_note",
              description: "Adicionar nota interna ao perfil do lead.",
              parameters: {
                type: "object",
                properties: {
                  content: { type: "string", description: "Conteúdo da nota" }
                },
                required: ["content"]
              }
            }
          });
          agentToolPrompts.push('- add_lead_note: Registre informações relevantes da conversa');
        }

        if (activeAgent.can_start_cadence) {
          toolsList.push({
            type: "function",
            function: {
              name: "start_cadence",
              description: "Iniciar cadência automática de follow-up.",
              parameters: {
                type: "object",
                properties: {
                  objective: { type: "string", description: "Objetivo da cadência" },
                  interval_hours: { type: "number", description: "Intervalo em horas entre follow-ups" },
                  max_followups: { type: "number", description: "Máximo de follow-ups" }
                },
                required: ["objective"]
              }
            }
          });
          agentToolPrompts.push('- start_cadence: Inicie follow-up automático quando lead esfriar');
        }

        if (activeAgent.can_qualify) {
          // Schema dinâmico de qualificação: cada agente pode definir o seu
          // (BANT, GPCT, SPIN, Método BMC, custom...). Fallback = BANT clássico.
          const rawSchema = (activeAgent as any).qualification_schema as
            | { name?: string; fields?: Array<{ key: string; label: string; weight?: number; hints?: string[] }> }
            | null
            | undefined;
          const isBant = !rawSchema || !Array.isArray(rawSchema.fields) || rawSchema.fields.length === 0;
          const methodName = isBant ? 'BANT' : (rawSchema?.name || 'Qualificação');
          const fields = isBant
            ? [
                { key: 'budget',    label: 'Budget (Orçamento)',     weight: 25, hints: ['valor disponível', 'faixa de investimento'] },
                { key: 'authority', label: 'Authority (Autoridade)', weight: 25, hints: ['quem decide', 'comitê', 'aprovação'] },
                { key: 'need',      label: 'Need (Necessidade)',     weight: 30, hints: ['dor', 'problema', 'objetivo'] },
                { key: 'timeline',  label: 'Timing (Tempo)',         weight: 20, hints: ['prazo', 'quando pretende'] },
              ]
            : rawSchema!.fields!;

          const props: Record<string, any> = {};
          for (const f of fields) {
            const hints = (f.hints && f.hints.length) ? ` — pistas: ${f.hints.join(', ')}` : '';
            props[f.key] = {
              type: 'string',
              description: `${f.label}${hints}. Preencha com a FRASE DO CLIENTE, não rótulos genéricos.`,
            };
          }

          toolsList.push({
            type: "function",
            function: {
              name: "qualify_lead",
              description: `Registrar qualificação do lead usando o método "${methodName}". Preencha com a frase exata do cliente sempre que possível (ex: "cozinha 12m² em porcelanato bege"), nunca com palavras genéricas como "sim" ou "alto".`,
              parameters: {
                type: "object",
                properties: props,
                required: [],
              },
            },
          });
          agentToolPrompts.push(`- qualify_lead: Registre ${methodName} com as PALAVRAS do cliente conforme você coleta na conversa.`);
        }

        // Add tool usage instructions to system prompt
        if (agentToolPrompts.length > 0) {
          systemPrompt += `\n\n🔧 FERRAMENTAS AUTÔNOMAS DISPONÍVEIS:\n${agentToolPrompts.join('\n')}`;
          systemPrompt += `\n\nREGRAS DE USO DAS FERRAMENTAS:
- Execute ações automaticamente quando fizer sentido no contexto da conversa
- NÃO peça permissão ao lead para ações internas (tags, notas, temperatura)
- SEMPRE confirme antes de ações visíveis ao lead (agendar reunião, enviar email)
- Registre informações importantes coletadas na conversa usando as ferramentas
- NUNCA mencione ao lead que você está usando ferramentas internas`;
        }
      }

      // === CATALOG TOOLS (search + send) — habilita SEMPRE que org tiver itens ativos
      // (não trava no product_id; busca prioriza produto atual mas faz fallback org-wide)
      try {
        const { data: convForCatalog } = await supabase
          .from('webchat_conversations')
          .select('organization_id')
          .eq('id', body.conversation_id)
          .maybeSingle();
        const orgId = convForCatalog?.organization_id;

        if (orgId) {
          // Conta itens ativos da ORG inteira (sem filtrar por produto atual).
          // Assim o agente sempre tem a tool quando há catálogo, mesmo se o produto
          // dele não tiver itens próprios.
          const { count: orgCatalogCount } = await supabase
            .from('product_catalog_items')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('is_active', true);

          // Conta itens do produto atual só pra log/contexto
          let productCatalogCount = 0;
          if (body.product_id) {
            const { count: pc } = await supabase
              .from('product_catalog_items')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgId)
              .eq('product_id', body.product_id)
              .eq('is_active', true);
            productCatalogCount = pc || 0;
          }

          if ((orgCatalogCount || 0) > 0) {
            console.log('[webchat-bot] 📦 Catalog tools enabled — org items:', orgCatalogCount, 'current product items:', productCatalogCount);

            toolsList.push({
              type: "function",
              function: {
                name: "search_catalog",
                description: "Buscar itens no catálogo (imóveis, produtos, etc) por texto livre + filtros. Use quando o cliente descrever o que procura (ex: 'apto 2 quartos no Batel até 600 mil', 'tem o modelo X?'). Retorna no máximo 5 itens.",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Texto livre da busca (ex: 'apartamento 2 quartos batel')" },
                    price_min: { type: "number", description: "Preço mínimo (opcional)" },
                    price_max: { type: "number", description: "Preço máximo (opcional)" },
                    attribute_filters: {
                      type: "object",
                      description: "Filtros por atributo (ex: {bairro:'Batel', quartos:2}). Use chaves do attributes do catálogo.",
                      additionalProperties: true,
                    },
                    tags: { type: "array", items: { type: "string" }, description: "Tags exigidas (opcional)" },
                    limit: { type: "number", description: "Máximo de resultados (1-5, padrão 3)" },
                  },
                  required: [],
                },
              },
            });

            toolsList.push({
              type: "function",
              function: {
                name: "send_catalog_item",
                description: "Enviar UM item do catálogo ao cliente. Por padrão envia apenas FOTO + título + preço + link. Use include_videos=true APENAS se o cliente pediu vídeo/tour/demonstração. Use include_documents=true APENAS se o cliente pediu ficha/folder/specs/brochura/PDF. Só chame após o cliente CONFIRMAR interesse num item específico retornado por search_catalog. NÃO envie múltiplos itens automaticamente — pergunte antes.",
                parameters: {
                  type: "object",
                  properties: {
                    item_id: { type: "string", description: "ID do item retornado por search_catalog" },
                    caption: { type: "string", description: "Legenda customizada opcional. Se vazio, gera automaticamente." },
                    include_videos: { type: "boolean", description: "Inclui vídeo se disponível. SÓ use se cliente pediu vídeo/tour explicitamente. Default false." },
                    include_documents: { type: "boolean", description: "Inclui PDF/documento se disponível. SÓ use se cliente pediu ficha/folder/PDF/specs. Default false." },
                  },
                  required: ["item_id"],
                },
              },
            });

            systemPrompt += `\n\n📦 CATÁLOGO PESQUISÁVEL DISPONÍVEL (CANAL OFICIAL DE ENVIO DE MÍDIA):
Você tem acesso a um catálogo de itens (imóveis/produtos) com busca semântica e mídia rica (fotos, vídeos, PDFs, link).
Esse catálogo é o CANAL OFICIAL para entregar fotos, vídeos, fichas e links neste WhatsApp.

🚨 REGRAS PRIORITÁRIAS — VIOLAÇÃO É ERRO GRAVE:
- Se o cliente pedir FOTO, VÍDEO, PDF, FICHA, LINK, SITE, TOUR, PLANTA, FOLDER, BROCHURA, IMAGENS, MATERIAL → você DEVE chamar search_catalog (se ainda não souber qual item) e em seguida send_catalog_item. Sem rodeios.
- PROIBIDO inventar bloqueios. NÃO diga "não posso enviar por aqui", "o sistema restringe", "é off-market", "não está aberto ao público", "precisa de cadastro prévio", "vou alinhar com especialista", "não tenho acesso", "não está disponível publicamente" se NÃO houver regra explícita cadastrada. Se o item está no catálogo e ativo, ele PODE e DEVE ser enviado.
- Você só pode negar envio se: (a) search_catalog retornou 0 itens compatíveis, OU (b) há instrução explícita cadastrada proibindo. Em qualquer outro caso, ENVIE.
- Se o cliente pediu só "o link", chame send_catalog_item normalmente — o link oficial vai junto, ou responda com a URL do item retornado por search_catalog.

REGRAS DE USO:
1. Cliente descreve o que procura (sem pedir mídia ainda) → search_catalog com query + filtros relevantes
2. Cliente pede mídia/link diretamente sobre algo identificável → search_catalog imediato e depois send_catalog_item no item correto (não pergunte "qual?" se já é óbvio pela mensagem)
3. Apresente no MÁXIMO 3 opções em texto curto e estratégico quando houver múltiplos resultados
4. NUNCA invente itens — só fale de itens retornados por search_catalog
5. Cada item tem flags has_video e has_document. Quando relevante, OFEREÇA: "Tenho fotos, vídeo do tour e a ficha. Quero te mandar tudo ou começar pelas fotos?"
6. send_catalog_item: por padrão envia FOTO + título + preço + link. Use include_videos=true se cliente pediu vídeo/tour/demonstração. Use include_documents=true se pediu ficha/folder/specs/PDF/brochura/planta.
7. Escale com bom senso: foto → (se interesse) vídeo → (se precisar) documento. Mas se o cliente pediu "manda tudo", mande tudo.
8. Múltiplos itens: um por vez, aguardando reação entre envios.
9. search_catalog vazio → ofereça relaxar filtros / outra região / outra faixa. NUNCA invente desculpa de "off-market" ou "restrição".
10. Se o envio falhar por algum motivo técnico, mande pelo menos o LINK oficial do item (nunca devolva resposta vazia).`;
          }
        }
      } catch (catErr) {
        console.warn('[webchat-bot] catalog tools setup failed (non-fatal):', catErr);
      }

      // === MATERIAIS DE APOIO (send_material) ===
      // Registra a tool apenas se o agente tem permissão E existem materiais elegíveis.
      try {
        if ((body.agent_config as any)?.can_send_materials !== false && agentMaterials.length > 0 && activeAgent) {
          const materialLines = agentMaterials.map(m => {
            const objectiveTxt = m.objective ? ` — ${m.objective}` : '';
            const tagsTxt = (m.tags && m.tags.length > 0) ? ` [tags: ${m.tags.join(', ')}]` : '';
            return `- ${m.id} | ${m.name} (${m.type})${objectiveTxt}${tagsTxt}`;
          }).join('\n');

          const materialIds = agentMaterials.map(m => m.id);

          toolsList.push({
            type: 'function',
            function: {
              name: 'send_material',
              description: `Enviar UM material de apoio (PDF, vídeo, imagem ou link) da biblioteca da empresa ao cliente. Use quando o cliente pedir explicitamente algo que combine com um material disponível (case, ficha, apresentação, folder, vídeo demo, PDF de proposta, etc.) OU quando fizer sentido no contexto para vencer uma objeção. Materiais disponíveis (id | nome (tipo) — objetivo [tags]):\n${materialLines}\n\nRegras: escolha 1 material só (nunca dispare vários seguidos). Nunca invente material_id que não esteja nesta lista.`,
              parameters: {
                type: 'object',
                properties: {
                  material_id: { type: 'string', enum: materialIds, description: 'ID do material da lista acima' },
                  message: { type: 'string', description: 'Mensagem curta de contexto que acompanha o envio (1 linha, natural).' },
                },
                required: ['material_id', 'message'],
              },
            },
          });

          systemPrompt += `\n\n📎 MATERIAIS DE APOIO DISPONÍVEIS (use com \`send_material\`):
${materialLines}

Regras:
- Envie um material quando ajudar de verdade (pedido explícito, prova social, vencer objeção, mostrar demo).
- Nunca dispare mais de 1 material por resposta.
- Nunca invente materiais fora dessa lista.
- Para catálogo de produtos (imóveis/SKUs com foto/preço), continue usando send_catalog_item.`;
        }
      } catch (matToolErr) {
        console.warn('[webchat-bot] materials tool setup failed (non-fatal):', matToolErr);
      }


      // Adiciona as tools modulares do registry centralizado.
      // Só habilita se temos agente ativo (caso contrário não há contexto pra executar).
      // Filtra nomes já presentes na toolsList legada pra evitar conflito.
      try {
        if (activeAgent) {
          const existingNames = new Set(toolsList.map((t: any) => t?.function?.name).filter(Boolean));
          const registryTools = listRegistryTools();
          const registrySchemas = registryToolsToSchema(registryTools).filter(
            (s) => !existingNames.has(s.function.name),
          );
          if (registrySchemas.length > 0) {
            toolsList.push(...registrySchemas);
            console.log('[webchat-bot] 🧰 Registry tools enabled:', registrySchemas.map((s) => s.function.name).join(', '));
          }
        }
      } catch (regErr) {
        console.warn('[webchat-bot] registry tools setup failed (non-fatal):', regErr);
      }

      const tools = toolsList.length > 0 ? toolsList : undefined;

      // ============================================
      // MEMÓRIA DE AGENDAMENTO — evita reagendar reunião confirmada
      // ============================================
      try {
        const { data: convMeeting } = await supabase
          .from('webchat_conversations')
          .select('meeting_scheduled_at, meeting_metadata')
          .eq('id', body.conversation_id)
          .maybeSingle();
        if (convMeeting?.meeting_scheduled_at) {
          const meetingDate = new Date(convMeeting.meeting_scheduled_at);
          const formatted = meetingDate.toLocaleString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo',
          });
          const meta = convMeeting.meeting_metadata as any;
          const extra = meta?.attendee_email ? ` (confirmação enviada para ${meta.attendee_email})` : '';
          systemPrompt +=
            `\n\n📅 REUNIÃO JÁ AGENDADA NESTA CONVERSA: ${formatted}${extra}.\n` +
            `REGRA CRÍTICA: NUNCA proponha um novo horário. NUNCA pergunte "prefere 09h ou 12h?". ` +
            `A reunião já foi confirmada. Apenas siga a conversa normalmente focando no produto/objeção do cliente. ` +
            `Só sugira remarcar se o cliente pedir explicitamente para mudar o horário.`;
          console.log('[webchat-bot] Meeting context injected:', formatted);
        }
      } catch (meetErr) {
        console.warn('[webchat-bot] meeting context check failed (non-fatal):', meetErr);
      }

      // ============================================
      // SPRINT 2 — Memória semântica + Supervisor
      // ============================================
      // Buscar memórias relevantes do lead (silencioso em caso de falha)
      try {
        const convInfo: any = await supabase
          .from('webchat_conversations')
          .select('lead_id, organization_id')
          .eq('id', body.conversation_id)
          .maybeSingle();
        const leadId = convInfo?.data?.lead_id;
        const orgId = convInfo?.data?.organization_id;

        if (leadId && orgId) {
          // 1) Retrieval: busca memórias relevantes
          const memResp = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/memory-search`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                lead_id: leadId,
                query: body.message,
                match_count: 5,
                min_similarity: 0.55,
              }),
            },
          );
          if (memResp.ok) {
            const memData = await memResp.json();
            const memories = memData?.memories ?? [];
            if (memories.length > 0) {
              const memBlock = memories
                .map(
                  (m: any) =>
                    `- [${m.source}${m.role ? `/${m.role}` : ''}] ${m.content.slice(0, 280)}`,
                )
                .join('\n');
              systemPrompt +=
                `\n\n🧠 MEMÓRIA SEMÂNTICA (contexto histórico relevante deste cliente):\n${memBlock}\n\nUse essas informações para personalizar sua resposta sem repetir o que ele já disse.`;
              console.log('[webchat-bot] Injected', memories.length, 'memories into prompt');
            }
          }

          // 2) Persistência fire-and-forget: salva mensagem do usuário como memória
          fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/memory-embedder`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                lead_id: leadId,
                organization_id: orgId,
                conversation_id: body.conversation_id,
                content: body.message,
                source: 'message',
                role: 'user',
                importance_score: 0.6,
              }),
            },
          ).catch((e) => console.warn('[webchat-bot] embed user msg failed:', e));
        }
      } catch (memErr) {
        console.warn('[webchat-bot] memory layer failed (non-fatal):', memErr);
      }

      // ============================================
      // SPRINT 3 — A/B Testing de prompts
      // ============================================
      let activeVariantId: string | null = null;
      try {
        const convInfo2: any = await supabase
          .from('webchat_conversations')
          .select('lead_id, organization_id')
          .eq('id', body.conversation_id)
          .maybeSingle();
        const orgId2 = convInfo2?.data?.organization_id;
        const seed = convInfo2?.data?.lead_id || body.conversation_id;

        if (orgId2 && seed) {
          const pickResp = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/prompt-experiment-pick`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                organization_id: orgId2,
                agent_id: activeAgent?.id ?? null,
                seed,
              }),
            },
          );
          if (pickResp.ok) {
            const pickData = await pickResp.json();
            const variant = pickData?.variant;
            if (variant?.prompt_override) {
              activeVariantId = variant.id;
              if (variant.prompt_mode === 'replace') {
                systemPrompt = variant.prompt_override;
              } else {
                systemPrompt += `\n\n🧪 VARIANTE ${variant.label}:\n${variant.prompt_override}`;
              }
              console.log('[webchat-bot] A/B variant active:', variant.label, variant.id);
            }
          }
        }
      } catch (abErr) {
        console.warn('[webchat-bot] A/B picker failed (non-fatal):', abErr);
      }

      // Call Lovable AI Gateway
      try {
        const temperature = agentAISettings.temperature ?? body.agent_config.temperature ?? 0.3;
        const maxTokens = agentAISettings.max_tokens ?? body.agent_config.max_tokens ?? 600;
        // Resolução completa: provider + model + endpoint + key vindo de
        // Configurações > Integrações > Roteamento de IA. Se a org tiver chave
        // externa (ex.: OpenAI) configurada, chamamos direto o provedor — sem
        // gastar créditos Lovable.
        let orgIdForRouting = (activeAgent as any)?.organization_id || null;
        if (!orgIdForRouting && body.conversation_id) {
          const { data: convForRouting } = await supabase
            .from('webchat_conversations')
            .select('organization_id')
            .eq('id', body.conversation_id)
            .maybeSingle();
          orgIdForRouting = convForRouting?.organization_id || null;
        }
        if (!orgIdForRouting && body.product_id) {
          const { data: productForRouting } = await supabase
            .from('products')
            .select('organization_id')
            .eq('id', body.product_id)
            .maybeSingle();
          orgIdForRouting = productForRouting?.organization_id || null;
        }
        let aiConfig: ResolvedAIConfig;
        try {
          aiConfig = await resolveAIConfig(supabase, orgIdForRouting, 'agent_chat', agentAISettings.model);
        } catch (cfgErr: any) {
          console.error('[webchat-bot] AI config error:', cfgErr?.message);
          return new Response(JSON.stringify({
            error: 'ai_provider_not_configured',
            message: cfgErr?.message || 'Provedor de IA não configurado e fallback desativado.',
          }), { status: 412, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const agentModel = aiConfig.model;

        logAIConfig('webchat-bot', aiConfig);
        console.log('[webchat-bot] Agent:', activeAgent?.name);
        console.log('[webchat-bot] Temperature:', temperature, 'Max tokens:', maxTokens);
        console.log('[webchat-bot] Tools enabled:', !!tools);

        // === ANTI-HALLUCINATION RAILS (mandatory, last in system prompt) ===
        // Two real bugs we are protecting against:
        //  1. The AI "becoming" another agent because the conversation history
        //     contains messages from a previous specialist (e.g. Sofia/Poupe Já)
        //     that drifted into a Natan/ihMob conversation. The agent must keep
        //     ITS identity regardless of what was said before.
        //  2. The AI pretending it heard an audio or saw an image even though
        //     no transcription/description was generated (the placeholder
        //     "[Áudio recebido — não consegui transcrever]" arrives in chat).
        const fixedAgentName = activeAgent?.name || body.agent_config?.agent_name || 'Assistente';
        const approvedLinksRail = approvedUrlsForResponse.length > 0
          ? `\n\n=== LINKS OFICIAIS ===\nUse somente URLs EXATAS desta lista:\n${approvedUrlsForResponse.map((url) => `- ${url}`).join('\n')}\nSe o link necessário não estiver listado, diga que vai confirmar; nunca monte ou adivinhe uma URL.\n`
          : `\n\n=== LINKS OFICIAIS ===\nNenhuma URL oficial foi fornecida neste contexto. Não invente nem monte links; diga que vai confirmar com a equipe.\n`;
        const identityRail =
          `\n\n=== REGRAS CRÍTICAS DE IDENTIDADE E HONESTIDADE (NÃO QUEBRAR) ===\n` +
          `1. Você é EXCLUSIVAMENTE "${fixedAgentName}". Mantenha SEMPRE este nome, papel e empresa.\n` +
          `2. Mensagens anteriores no histórico podem ter sido escritas por OUTRO atendente que cuidou do cliente antes. IGNORE personas, ofertas, produtos ou nomes próprios mencionados nessas mensagens passadas se conflitarem com a sua identidade atual.\n` +
          `3. Se o cliente perguntar seu nome, responda APENAS com "${fixedAgentName}".\n` +
          `4. NUNCA finja que ouviu um áudio ou viu uma imagem. Se a última mensagem do cliente for um placeholder do tipo "🎙️ [Áudio recebido — não consegui transcrever...]" ou "🖼️ [Imagem recebida — não consegui analisar...]", responda DIZENDO QUE TEVE PROBLEMA TÉCNICO PARA OUVIR/VER e peça ao cliente para reenviar ou descrever em texto. NÃO invente conteúdo.\n` +
          `5. Quando a mensagem começar com "🎙️ Áudio do cliente (transcrito):" ou "🖼️ Imagem do cliente:", essa É a mensagem real do cliente — trate como tal.\n`;

        const finalSystemPrompt = systemPrompt + approvedLinksRail + identityRail;

        // Chamadas de follow-up (pós-tool) não precisam do prompt completo nem
        // do histórico inteiro — só do essencial para formatar a resposta.
        // Isso corta milhares de tokens por turno com tool call.
        const followUpSystemPrompt = systemPrompt.slice(0, 3000) + approvedLinksRail + identityRail;
        const optimizedHistory = optimizeConversationHistory(conversationHistory, agentAISettings.context_mode);
        const followUpHistory = optimizedHistory.slice(-8);



        const requestBody: any = {
          model: agentModel,
          messages: [
            { role: 'system', content: finalSystemPrompt },
            ...optimizedHistory,
            { role: 'user', content: body.message },
          ],
          max_tokens: maxTokens,
          temperature: temperature,
          reasoning_effort: agentAISettings.reasoning_effort || 'minimal',
        };

        if (tools) {
          requestBody.tools = tools;
        }

        // Chamada primária com cadeia de fallback automática configurada em
        // org_ai_routing.fallback_chain (rate limit, sem créditos, 5xx, output
        // vazio ou loop de repetição escalam para o próximo modelo).
        const fbResult = await aiChatWithFallback(supabase, orgIdForRouting, 'agent_chat', requestBody, {
          edgeFunction: 'webchat-bot',
          detectDegenerate: (t) => detectDegenerateRepetition(t),
          preferredModel: agentAISettings.model,
        });
        // Adota a config vencedora para follow-ups (tools, retries a jusante).
        aiConfig = fbResult.aiConfig;
        const aiResponse: any = {
          ok: fbResult.ok,
          status: fbResult.status,
          json: async () => fbResult.data,
        };

        console.log('[webchat-bot] AI response status:', fbResult.status,
          '| attempt:', fbResult.attempt_index,
          '| reason:', fbResult.reason ?? 'ok',
          '| model:', fbResult.aiConfig.model);

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          // Uso já registrado por aiChatWithFallback (com attempt_index e fallback_reason).
          const choice = aiData.choices?.[0];
          const finishReason = choice?.finish_reason;
          const reasoningTokens = (aiData?.usage as any)?.completion_tokens_details?.reasoning_tokens;
          console.log('[webchat-bot] finish_reason:', finishReason, '| reasoning_tokens:', reasoningTokens ?? '-');

          
          // Check if AI used tool calling
          let responseVideoUrl: string | null = null;
          let scheduleSucceeded = false; // anti-hallucination guard
          
          if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
            const toolCall = choice.message.tool_calls[0];
            console.log('[webchat-bot] Tool call detected:', toolCall.function.name);
            
            // Redirect loop: lets the deterministic shortcut in check_available_slots
            // mutate toolCall to schedule_meeting and re-enter the dispatch chain ONCE.
            let __redirectAttempts = 0;
            while (__redirectAttempts < 2) {
              const __previousToolName = toolCall.function.name;
              __redirectAttempts++;
            if (toolCall.function.name === 'send_cta_buttons') {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                responseContent = args.message || '';
                
                // Build buttons from CTA IDs
                const selectedCTAs = productCTAs.filter(c => args.cta_ids?.includes(c.id));
                responseButtons = selectedCTAs.map((cta, index) => ({
                  id: cta.id,
                  label: cta.label,
                  type: mapCTATypeToButtonType(cta.cta_type),
                  action: getButtonAction(cta),
                  style: index === 0 ? 'primary' as const : 'secondary' as const,
                  cta_type: cta.cta_type,
                }));
                
                console.log('[webchat-bot] Generated buttons:', responseButtons.length);
              } catch (parseError) {
                console.error('[webchat-bot] Error parsing tool arguments:', parseError);
                responseContent = choice.message?.content || body.agent_config.fallback_message;
              }
            } else if (toolCall.function.name === 'send_video') {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                responseContent = args.message || '';
                
                // Find the video CTA
                const videoCTA = productCTAs.find(c => c.id === args.video_id);
                if (videoCTA && videoCTA.video_url) {
                  responseVideoUrl = videoCTA.video_url;
                  console.log('[webchat-bot] Sending video:', responseVideoUrl);
                }
              } catch (parseError) {
                console.error('[webchat-bot] Error parsing video arguments:', parseError);
                responseContent = choice.message?.content || body.agent_config.fallback_message;
              }
            } else if (toolCall.function.name === 'search_catalog') {
              try {
                const args = JSON.parse(toolCall.function.arguments || '{}');
                const { data: convForCat } = await supabase
                  .from('webchat_conversations')
                  .select('organization_id')
                  .eq('id', body.conversation_id)
                  .maybeSingle();

                const filtersPayload = {
                  price_min: args.price_min,
                  price_max: args.price_max,
                  attribute_filters: args.attribute_filters,
                  tags: args.tags,
                };
                const limitPayload = Math.min(args.limit || 3, 5);

                // 1ª tentativa: priorizar produto atual (se houver)
                let { data: searchData, error: searchErr } = await supabase.functions.invoke('catalog-search', {
                  body: {
                    organization_id: convForCat?.organization_id,
                    product_id: body.product_id || null,
                    query: args.query || '',
                    filters: filtersPayload,
                    limit: limitPayload,
                  },
                });

                let items = (searchData as any)?.items || [];
                console.log('[webchat-bot] 📦 catalog-search (product scope) returned', items.length, 'items');

                // 2ª tentativa: fallback org-wide se o produto atual não trouxe nada
                if (items.length === 0 && body.product_id) {
                  const { data: orgSearchData } = await supabase.functions.invoke('catalog-search', {
                    body: {
                      organization_id: convForCat?.organization_id,
                      product_id: null,
                      query: args.query || '',
                      filters: filtersPayload,
                      limit: limitPayload,
                    },
                  });
                  items = (orgSearchData as any)?.items || [];
                  console.log('[webchat-bot] 📦 catalog-search (org-wide fallback) returned', items.length, 'items');
                }

                // Detect if user EXPLICITLY asked for media in the current message
                const userMsgLower = (body.message || '').toLowerCase();
                const mediaIntentRegex = /\b(foto|fotos|imagem|imagens|video|vídeo|videos|vídeos|tour|planta|pdf|ficha|folder|brochura|material|materiais|link|site|envia|manda|mandar|enviar|envie|me\s+manda|me\s+envia|quero\s+ver|posso\s+ver)\b/i;
                const explicitMediaRequest = mediaIntentRegex.test(userMsgLower);
                const wantsVideo = /\b(video|vídeo|tour|demonstr)/i.test(userMsgLower);
                const wantsDoc = /\b(pdf|ficha|folder|brochura|planta|specs)/i.test(userMsgLower);

                let toolResultText: string;
                if (items.length === 0) {
                  toolResultText = 'Nenhum item encontrado com esses critérios. Sugira ao cliente relaxar filtros ou explorar alternativas. NÃO invente desculpa de "off-market" ou "restrição".';
                } else if (explicitMediaRequest) {
                  // User asked for media → IA must send NOW, not ask
                  const topItem = items[0];
                  toolResultText = `ITENS ENCONTRADOS NO CATÁLOGO (use o id quando for chamar send_catalog_item):\n${JSON.stringify(items, null, 2)}\n\n🚨 O CLIENTE JÁ PEDIU MÍDIA EXPLICITAMENTE NESTA MENSAGEM ("${body.message}"). VOCÊ DEVE CHAMAR send_catalog_item AGORA com item_id="${topItem.id}"${wantsVideo ? ' e include_videos=true' : ''}${wantsDoc ? ' e include_documents=true' : ''}. NÃO PERGUNTE "qual interessa?" — envie direto. Se houver múltiplos itens muito relevantes, escolha o que mais combina com o pedido. Não devolva texto explicando — chame a tool send_catalog_item.`;
                } else {
                  toolResultText = `ITENS ENCONTRADOS NO CATÁLOGO (use o id quando for chamar send_catalog_item):\n${JSON.stringify(items, null, 2)}\n\nApresente no máximo 3 opções de forma curta e estratégica. Pergunte qual interessa antes de chamar send_catalog_item.`;
                }

                // Follow-up: deixa a IA formatar a resposta — COM tools habilitadas
                // para que ela possa chamar send_catalog_item no mesmo ciclo.
                const followUpBody: any = {
                  model: agentModel,
                  messages: [
                    { role: 'system', content: followUpSystemPrompt },
                    ...followUpHistory,
                    { role: 'user', content: body.message },
                    { role: 'assistant', content: null, tool_calls: [toolCall] },
                    { role: 'tool', tool_call_id: toolCall.id, content: toolResultText },
                  ],
                  max_tokens: 2000,
                  temperature: 0.5,
                };
                if (tools) followUpBody.tools = tools;
                // Force tool use when media was explicitly requested
                if (explicitMediaRequest && items.length > 0) {
                  followUpBody.tool_choice = { type: 'function', function: { name: 'send_catalog_item' } };
                }

                const followUp = await fetch(aiConfig.endpoint, {
                  method: 'POST',
                  headers: aiConfig.headers,
                  body: JSON.stringify(prepareAIRequestBody(followUpBody, aiConfig)),
                });

                if (followUp.ok) {
                  const fuData = await followUp.json();
                  await recordAIUsage(supabase, orgIdForRouting, aiConfig, 'agent_chat', fuData?.usage, 'webchat-bot:followup');
                  const fuChoice = fuData.choices?.[0];
                  const fuToolCall = fuChoice?.message?.tool_calls?.[0];

                  if (fuToolCall?.function?.name === 'send_catalog_item') {
                    // Chain: execute send_catalog_item right now
                    console.log('[webchat-bot] 📦 follow-up triggered send_catalog_item, chaining…');
                    try {
                      const sendArgs = JSON.parse(fuToolCall.function.arguments || '{}');
                      if (!sendArgs.item_id && items.length > 0) sendArgs.item_id = items[0].id;
                      if (explicitMediaRequest && wantsVideo) sendArgs.include_videos = true;
                      if (explicitMediaRequest && wantsDoc) sendArgs.include_documents = true;

                      const { data: sendData, error: sendErr } = await supabase.functions.invoke('send-catalog-item', {
                        body: {
                          conversation_id: body.conversation_id,
                          item_id: sendArgs.item_id,
                          caption_override: sendArgs.caption || null,
                          send_videos: sendArgs.include_videos === true,
                          send_documents: sendArgs.include_documents === true,
                        },
                      });

                      if (sendErr) {
                        console.error('[webchat-bot] chained send_catalog_item error:', sendErr);
                        const fallbackItem = items.find((i: any) => i.id === sendArgs.item_id) || items[0];
                        responseContent = fallbackItem?.url
                          ? `Aqui está: ${fallbackItem.title} — ${fallbackItem.url}`
                          : 'Houve um problema ao enviar. Posso te mandar o link manualmente?';
                      } else {
                        const sent = sendData as any;
                        console.log('[webchat-bot] 📦 chained catalog item sent:', sent?.delivered, sent?.delivery_channel, sent?.sent_counts);
                        const counts = sent?.sent_counts || {};
                        const parts: string[] = [];
                        if (counts.images) parts.push(`${counts.images} foto${counts.images > 1 ? 's' : ''}`);
                        if (counts.videos) parts.push(`${counts.videos} vídeo`);
                        if (counts.documents) parts.push(`${counts.documents} documento`);
                        const summary = parts.length > 0 ? parts.join(' + ') : 'os detalhes';
                        responseContent = sent?.delivered
                          ? `Acabei de te mandar ${summary} de ${sent?.item?.title || 'o imóvel'}. O que achou?`
                          : `Aqui está: ${sent?.item?.title || 'item'}${sent?.item?.url ? ` — ${sent.item.url}` : ''}. O que achou?`;
                      }
                    } catch (chainErr) {
                      console.error('[webchat-bot] chain send_catalog_item exception:', chainErr);
                      const fallbackItem = items[0];
                      responseContent = fallbackItem?.url
                        ? `Aqui está: ${fallbackItem.title} — ${fallbackItem.url}`
                        : 'Não consegui enviar agora. Quer que eu tente novamente?';
                    }
                  } else {
                    // Plain text response from follow-up
                    responseContent = fuChoice?.message?.content || toolResultText;
                    // Safety net: if user asked for media but model returned text only,
                    // force-send the top item with link as fallback.
                    if (explicitMediaRequest && items.length > 0 && !fuToolCall) {
                      console.log('[webchat-bot] ⚠️ Model ignored forced tool_choice — falling back to direct send');
                      try {
                        const topItem = items[0];
                        const { data: sendData } = await supabase.functions.invoke('send-catalog-item', {
                          body: {
                            conversation_id: body.conversation_id,
                            item_id: topItem.id,
                            send_videos: wantsVideo,
                            send_documents: wantsDoc,
                          },
                        });
                        const sent = sendData as any;
                        const counts = sent?.sent_counts || {};
                        const parts: string[] = [];
                        if (counts.images) parts.push(`${counts.images} foto${counts.images > 1 ? 's' : ''}`);
                        if (counts.videos) parts.push(`${counts.videos} vídeo`);
                        if (counts.documents) parts.push(`${counts.documents} documento`);
                        const summary = parts.length > 0 ? parts.join(' + ') : 'os detalhes';
                        responseContent = sent?.delivered
                          ? `Acabei de te mandar ${summary} de ${topItem.title}. O que achou?`
                          : `Aqui está: ${topItem.title}${topItem.url ? ` — ${topItem.url}` : ''}. O que achou?`;
                      } catch (e) {
                        console.error('[webchat-bot] fallback direct send failed:', e);
                      }
                    }
                  }
                } else {
                  responseContent = items.length === 0
                    ? 'Não encontrei itens com esses critérios. Quer ajustar a busca?'
                    : `Achei ${items.length} ${items.length === 1 ? 'opção' : 'opções'} pra você. Quer que eu envie os detalhes?`;
                }
              } catch (catErr) {
                console.error('[webchat-bot] search_catalog error:', catErr);
                responseContent = 'Não consegui consultar o catálogo agora. Pode descrever melhor o que procura?';
              }
            } else if (toolCall.function.name === 'send_catalog_item') {
              try {
                const args = JSON.parse(toolCall.function.arguments || '{}');
                if (!args.item_id) {
                  responseContent = choice.message?.content || 'Posso te enviar mais detalhes? Confirma qual te interessa?';
                } else {
                  const { data: sendData, error: sendErr } = await supabase.functions.invoke('send-catalog-item', {
                    body: {
                      conversation_id: body.conversation_id,
                      item_id: args.item_id,
                      caption_override: args.caption || null,
                      send_videos: args.include_videos === true,
                      send_documents: args.include_documents === true,
                    },
                  });

                  if (sendErr) {
                    console.error('[webchat-bot] send_catalog_item error:', sendErr);
                    responseContent = 'Houve um problema ao enviar o item. Posso te mandar o link manualmente?';
                  } else {
                    const sent = sendData as any;
                    console.log('[webchat-bot] 📦 catalog item sent:', sent?.delivered, sent?.delivery_channel, sent?.sent_counts);
                    const counts = sent?.sent_counts || {};
                    const parts: string[] = [];
                    if (counts.images) parts.push(`${counts.images} foto${counts.images > 1 ? 's' : ''}`);
                    if (counts.videos) parts.push(`${counts.videos} vídeo`);
                    if (counts.documents) parts.push(`${counts.documents} documento`);
                    const summary = parts.length > 0 ? parts.join(' + ') : 'os detalhes';
                    responseContent = sent?.delivered
                      ? `Acabei de te mandar ${summary}. O que achou?`
                      : `Aqui está: ${sent?.item?.title || 'item'}${sent?.item?.url ? ` — ${sent.item.url}` : ''}. O que achou?`;
                  }
                }
              } catch (catErr) {
                console.error('[webchat-bot] send_catalog_item exception:', catErr);
                responseContent = 'Não consegui enviar agora. Quer que eu tente novamente?';
              }
            } else if (toolCall.function.name === 'send_material') {
              try {
                const args = JSON.parse(toolCall.function.arguments || '{}');
                const material = agentMaterials.find(m => m.id === args.material_id);
                if (!material) {
                  responseContent = choice.message?.content || 'Deixa eu confirmar qual material te enviar.';
                } else {
                  responseContent = args.message || `Segue o material: ${material.name}`;
                  const { data: sendData, error: sendErr } = await supabase.functions.invoke('send-material', {
                    body: {
                      conversation_id: body.conversation_id,
                      material_id: material.id,
                      caption: args.message || null,
                    },
                  });
                  if (sendErr) {
                    console.error('[webchat-bot] send_material error:', sendErr);
                  } else {
                    console.log('[webchat-bot] 📎 material sent:', (sendData as any)?.delivered, (sendData as any)?.delivery_channel);
                  }
                }
              } catch (matErr) {
                console.error('[webchat-bot] send_material exception:', matErr);
                responseContent = choice.message?.content || body.agent_config.fallback_message;
              }
            } else if (toolCall.function.name === 'check_available_slots' && scheduleUserId) {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                const daysAhead = Math.min(args.days_ahead || 3, 7);
                console.log('[webchat-bot] Checking available slots for next', daysAhead, 'days');

                // ============================================================
                // FIX 2 — GUARD: block redundant check_available_slots if we
                // already offered slots in the last 60 minutes. Force the
                // model to use schedule_meeting instead.
                // ============================================================
                const { data: recentMsgs } = await supabase
                  .from('webchat_messages')
                  .select('metadata, created_at')
                  .eq('conversation_id', body.conversation_id)
                  .eq('direction', 'outbound')
                  .order('created_at', { ascending: false })
                  .limit(5);

                const recentSlotMsg = (recentMsgs || []).find((m: any) =>
                  m.metadata?.scheduling_context?.action === 'slots_offered'
                );
                const slotMsgAgeMin = recentSlotMsg
                  ? (Date.now() - new Date(recentSlotMsg.created_at).getTime()) / 60000
                  : Infinity;

                let skipSlotSearch = false;
                if (recentSlotMsg && slotMsgAgeMin < 60) {
                  const offered = recentSlotMsg.metadata.scheduling_context.suggestions || [];
                  const guestEmail = leadContext?.email || capturedFromMessage.email || '';
                  const guestName = leadContext?.name || body.visitor_name || 'Cliente';

                  console.log('[webchat-bot] 🛑 BLOCKING redundant check_available_slots — slots already offered', slotMsgAgeMin.toFixed(1), 'min ago');

                  // Try to deterministically match user's confirmation against offered slots
                  const userMsgLower = (body.message || '').toLowerCase();
                  let matchedSlot: any = null;
                  for (let i = 0; i < offered.length; i++) {
                    const s = offered[i];
                    const timeNorm = s.time.replace(':', '');
                    const timeAlt = s.time.replace(':', 'h');
                    if (userMsgLower.includes(s.time) ||
                        userMsgLower.includes(timeNorm) ||
                        userMsgLower.includes(timeAlt) ||
                        (i === 0 && /\b(primeir|opção 1|opcao 1|primeira|primeiro)\b/.test(userMsgLower)) ||
                        (i === 1 && /\b(segund|opção 2|opcao 2|segunda)\b/.test(userMsgLower))) {
                      matchedSlot = s;
                      break;
                    }
                  }

                  if (matchedSlot && guestEmail) {
                    // Deterministic shortcut: rewrite this toolCall as schedule_meeting
                    // and let the schedule_meeting branch below execute it.
                    toolCall.function.name = 'schedule_meeting';
                    toolCall.function.arguments = JSON.stringify({
                      guest_name: guestName,
                      guest_email: guestEmail,
                      preferred_date: matchedSlot.date,
                      preferred_time: matchedSlot.time,
                    });
                    console.log('[webchat-bot] 🔁 Deterministic redirect → schedule_meeting', matchedSlot.date, matchedSlot.time);
                    // skipSlotSearch stays false here, but the dispatch below uses if-else;
                    // we set skipSlotSearch=true and re-route by finishing this branch
                    // and letting a small inline schedule_meeting trigger run.
                    skipSlotSearch = true;
                  } else if (!guestEmail) {
                    responseContent = 'Pra eu travar esse horário pra você, qual o melhor email pra mandar a confirmação?';
                    skipSlotSearch = true;
                  } else {
                    // Have email but couldn't match slot text → ask short clarification
                    const opts = offered.map((s: any, i: number) => `${i + 1}) ${s.dateLabel || s.date} às ${s.time}`).join(' ou ');
                    responseContent = `Qual desses prefere: ${opts}?`;
                    skipSlotSearch = true;
                  }
                }

                if (!skipSlotSearch) {




                // Find event type — usa allowedEventTypes se disponível (vinculado ao agente),
                // senão fallback para o primeiro ativo do host
                let eventType: any = null;
                if (allowedEventTypes.length > 0) {
                  eventType = allowedEventTypes[0];
                } else {
                  const { data: et } = await supabase
                    .from('booking_event_types')
                    .select('*')
                    .eq('user_id', scheduleUserId)
                    .eq('is_active', true)
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .single();
                  eventType = et;
                }

                if (!eventType) {
                  responseContent = 'No momento não tenho horários configurados. Posso verificar alternativas para você?';
                } else {
                  const today = new Date();
                  const allSlots: Array<{ date: string; dateLabel: string; time: string; period: 'morning' | 'afternoon' }> = [];

                  for (let d = 0; d < daysAhead; d++) {
                    const checkDate = new Date(today);
                    checkDate.setDate(today.getDate() + d);
                    const dateStr = checkDate.toISOString().split('T')[0];
                    const dayOfWeek = checkDate.getDay();

                    // Skip if today and already past business hours
                    if (d === 0 && today.getHours() >= 18) continue;

                    // Fetch weekly availability
                    const { data: weeklyAvail } = await supabase
                      .from('user_availability')
                      .select('*')
                      .eq('user_id', scheduleUserId)
                      .eq('day_of_week', dayOfWeek)
                      .eq('is_available', true);

                    // Check overrides
                    const { data: override } = await supabase
                      .from('availability_overrides')
                      .select('*')
                      .eq('user_id', scheduleUserId)
                      .eq('date', dateStr)
                      .maybeSingle();

                    if (override && !override.is_available) continue;

                    let timeRanges: { start: string; end: string }[] = [];
                    if (override?.is_available && override.start_time && override.end_time) {
                      timeRanges = [{ start: override.start_time, end: override.end_time }];
                    } else if (weeklyAvail && weeklyAvail.length > 0) {
                      timeRanges = weeklyAvail.map((a: any) => ({ start: a.start_time, end: a.end_time }));
                    }

                    if (timeRanges.length === 0) continue;

                    // Fetch existing events
                    const { data: existingEvents } = await supabase
                      .from('calendar_events')
                      .select('start_time, end_time')
                      .eq('user_id', scheduleUserId)
                      .neq('status', 'cancelled')
                      .gte('start_time', `${dateStr}T00:00:00`)
                      .lte('start_time', `${dateStr}T23:59:59`);

                    const duration = eventType.duration_minutes;
                    const bufferBefore = eventType.buffer_before || 0;
                    const bufferAfter = eventType.buffer_after || 0;
                    const minNoticeHours = eventType.min_notice_hours || 0;
                    const minNoticeTime = new Date(today.getTime() + minNoticeHours * 60 * 60 * 1000);

                    const dateLabel = checkDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

                    for (const range of timeRanges) {
                      const [startH, startM] = range.start.split(':').map(Number);
                      const [endH, endM] = range.end.split(':').map(Number);
                      let cur = startH * 60 + startM;
                      const endMin = endH * 60 + endM;

                      while (cur + duration <= endMin) {
                        const slotH = Math.floor(cur / 60);
                        const slotM = cur % 60;
                        const timeStr = `${slotH.toString().padStart(2, '0')}:${slotM.toString().padStart(2, '0')}`;
                        // BRT (-03:00) explicit so comparison with minNoticeTime is correct
                        const slotDT = new Date(`${dateStr}T${timeStr}:00-03:00`);

                        if (slotDT < minNoticeTime) { cur += 30; continue; }

                        let conflict = false;
                        for (const ev of existingEvents || []) {
                          const evS = new Date(ev.start_time);
                          const evE = new Date(ev.end_time);
                          // Convert evt to minutes-of-day in BRT to compare with cur (which is BRT minutes)
                          const evSBrt = new Date(evS.getTime() - 3 * 3600_000);
                          const evEBrt = new Date(evE.getTime() - 3 * 3600_000);
                          const evSM = evSBrt.getUTCHours() * 60 + evSBrt.getUTCMinutes() - bufferBefore;
                          const evEM = evEBrt.getUTCHours() * 60 + evEBrt.getUTCMinutes() + bufferAfter;
                          if (cur < evEM && cur + duration > evSM) { conflict = true; break; }
                        }

                        if (!conflict) {
                          allSlots.push({
                            date: dateStr,
                            dateLabel,
                            time: timeStr,
                            period: slotH < 12 ? 'morning' : 'afternoon',
                          });
                        }
                        cur += 30;
                      }
                    }

                    // If we found enough slots, stop searching
                    if (allSlots.length >= 10) break;
                  }

                  // Strategic selection: pick 1 morning + 1 afternoon slot, preferring same/next day
                  const morningSlots = allSlots.filter(s => s.period === 'morning');
                  const afternoonSlots = allSlots.filter(s => s.period === 'afternoon');

                  const suggestions: typeof allSlots = [];
                  if (morningSlots.length > 0) suggestions.push(morningSlots[0]);
                  if (afternoonSlots.length > 0) suggestions.push(afternoonSlots[0]);
                  // Fallback: if only one period available, pick 2 from same period
                  if (suggestions.length === 0 && allSlots.length > 0) {
                    suggestions.push(allSlots[0]);
                    if (allSlots.length > 1) suggestions.push(allSlots[1]);
                  } else if (suggestions.length === 1 && allSlots.length > 1) {
                    const extra = allSlots.find(s => s.time !== suggestions[0].time || s.date !== suggestions[0].date);
                    if (extra) suggestions.push(extra);
                  }

                  if (suggestions.length === 0) {
                    responseContent = 'Infelizmente não encontrei horários disponíveis nos próximos dias. Posso verificar outras opções para você?';
                  } else {
                    // Save scheduling context as metadata for persistence
                    schedulingMetadata = {
                      scheduling_context: {
                        action: 'slots_offered',
                        suggestions: suggestions.map(s => ({
                          date: s.date,
                          time: s.time,
                          period: s.period,
                          dateLabel: s.dateLabel,
                        })),
                        event_type_id: eventType.id,
                        schedule_user_id: scheduleUserId,
                      }
                    };
                    console.log('[webchat-bot] Saved scheduling metadata with', suggestions.length, 'suggestions');

                    // Build a natural response for the AI to relay
                    let slotsInfo = '📅 HORÁRIOS DISPONÍVEIS ENCONTRADOS:\n';
                    suggestions.forEach((s, i) => {
                      slotsInfo += `\nOpção ${i + 1}: ${s.dateLabel} às ${s.time} (${s.period === 'morning' ? 'manhã' : 'tarde'}) [data: ${s.date}]`;
                    });
                    slotsInfo += '\n\nApresente esses horários ao cliente de forma natural e estratégica. NÃO mostre o formato de data técnico (YYYY-MM-DD).';

                    // FIX 3: slim follow-up prompt — drop emailEnforcement, anti-CTAs etc.
                    // We only want a clean "present these slots and ask which one" reply.
                    const slimAgentName = activeAgent?.name || 'Assistente';
                    const slimAgentPersona = activeAgent?.personality || 'consultivo, claro e cordial';
                    const slimFollowUpSystem = `Você é ${slimAgentName}. Tom: ${slimAgentPersona}.\n\nApresente os horários encontrados de forma natural, curta (no máximo 2 linhas) e pergunte qual o cliente prefere. NUNCA pergunte o email novamente — você já tem ou pedirá depois. NUNCA diga "deixa eu ver a agenda" — você acabou de ver. NUNCA invente outros horários além dos fornecidos.`;

                    // Make a follow-up call to the AI with the slot info
                    const followUpResponse = await fetch(aiConfig.endpoint, {
                      method: 'POST',
                      headers: aiConfig.headers,
                      body: JSON.stringify(prepareAIRequestBody({
                        model: agentModel,
                        messages: [
                          { role: 'system', content: slimFollowUpSystem },
                          { role: 'user', content: body.message },
                          { role: 'assistant', content: null, tool_calls: [toolCall] },
                          { role: 'tool', tool_call_id: toolCall.id, content: slotsInfo },
                        ],
                        max_tokens: 200,
                        temperature: 0.6,
                      }, aiConfig)),
                    });

                    if (followUpResponse.ok) {
                      const followUpData = await followUpResponse.json();
                      await recordAIUsage(supabase, orgIdForRouting, aiConfig, 'agent_chat', followUpData?.usage, 'webchat-bot:schedule-followup');
                      responseContent = followUpData.choices?.[0]?.message?.content || slotsInfo;
                    } else {
                      // Fallback: present slots directly
                      responseContent = suggestions.map((s, i) => 
                        `Opção ${i + 1}: ${s.dateLabel} às ${s.time}`
                      ).join('\n');
                      responseContent = `Encontrei esses horários disponíveis:\n\n${responseContent}\n\nQual funciona melhor pra você?`;
                    }
                  }
                }
                } // end if (!skipSlotSearch)
                console.log('[webchat-bot] Available slots check completed');
              } catch (slotsError) {
                console.error('[webchat-bot] Check slots error:', slotsError);
                responseContent = 'Não consegui verificar a agenda agora. Posso tentar novamente ou transferir para um atendente?';
              }
            } else if (toolCall.function.name === 'schedule_meeting' && scheduleUserId) {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                console.log('[webchat-bot] Schedule meeting requested:', args);
                
                // Find event type for this user.
                // Se o cliente passou event_type_id (escolheu entre múltiplos), prioriza esse.
                // Senão usa allowedEventTypes[0] (vínculo do agente) ou fallback para o mais antigo.
                let eventType: any = null;
                const requestedEtId = (args as any).event_type_id;
                if (requestedEtId && allowedEventTypes.length > 0) {
                  eventType = allowedEventTypes.find((e: any) => e.id === requestedEtId) || null;
                }
                if (!eventType && allowedEventTypes.length > 0) {
                  eventType = allowedEventTypes[0];
                }
                if (!eventType) {
                  const { data: et } = await supabase
                    .from('booking_event_types')
                    .select('*')
                    .eq('user_id', scheduleUserId)
                    .eq('is_active', true)
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .single();
                  eventType = et;
                }
                
                if (eventType) {
                  // Combine date and time into ISO string — BRT offset (-03:00) explicit
                  // so a string like "14:00" stays as 14:00 BRT (17:00 UTC) and NOT as 14:00 UTC (11:00 BRT).
                  const startTime = new Date(`${args.preferred_date}T${args.preferred_time}:00-03:00`);
                  const endTime = new Date(startTime.getTime() + eventType.duration_minutes * 60000);
                  
                  // Get user's org
                   const { data: hostProfile } = await supabase
                    .from('profiles')
                    .select('organization_id, full_name')
                    .eq('id', scheduleUserId)
                    .single();
                  
                  if (hostProfile) {
                    // Create calendar event (NUNCA enviar campos que não existem na tabela calendar_events,
                    // ex.: location_details — isso fazia o insert falhar silenciosamente e o agendamento
                    // ficava sem vínculo com a agenda interna nem ia para o Google).
                    const locationDetailsText = eventType.location_details
                      ? (typeof eventType.location_details === 'string'
                          ? eventType.location_details
                          : JSON.stringify(eventType.location_details))
                      : null;

                    const baseDescription = `Agendado via chat AI\nCliente: ${args.guest_name}\nEmail: ${args.guest_email}${args.guest_phone ? `\nTelefone: ${args.guest_phone}` : ''}`;
                    const fullDescription = locationDetailsText
                      ? `${baseDescription}\n\nLocal: ${locationDetailsText}`
                      : baseDescription;

                    // Resolve product_id do lead (para que o evento apareça quando o vendedor filtra por produto)
                    let resolvedProductId: string | null = body.product_id || null;
                    if (!resolvedProductId && leadId) {
                      const { data: leadRow } = await supabase
                        .from('leads')
                        .select('product_id')
                        .eq('id', leadId)
                        .maybeSingle();
                      resolvedProductId = leadRow?.product_id || null;
                    }

                    // Criação atômica e idempotente. A RPC segura um advisory
                    // lock por agenda, revalida conflito e grava evento + pedido
                    // na mesma transação. Assim duas mensagens simultâneas não
                    // conseguem reservar o mesmo horário nem duplicar o lead.
                    const { data: bookingGuard, error: calendarInsertError } = await supabase
                      .rpc('create_agent_booking_guarded', {
                        p_event_type_id: eventType.id,
                        p_host_user_id: scheduleUserId,
                        p_organization_id: hostProfile.organization_id,
                        p_guest_name: args.guest_name,
                        p_guest_email: String(args.guest_email || '').trim().toLowerCase(),
                        p_guest_phone: args.guest_phone || null,
                        p_start_time: startTime.toISOString(),
                        p_end_time: endTime.toISOString(),
                        p_timezone: 'America/Sao_Paulo',
                        p_title: `${eventType.name} - ${args.guest_name}`,
                        p_description: fullDescription,
                        p_location: eventType.location_type || null,
                        p_create_meet: eventType.create_meet ?? false,
                        p_color: eventType.color || null,
                        p_lead_id: leadId || null,
                        p_product_id: resolvedProductId,
                        p_metadata: {
                          booking_event_type_id: eventType.id,
                          guest_name: args.guest_name,
                          guest_email: String(args.guest_email || '').trim().toLowerCase(),
                          guest_phone: args.guest_phone || null,
                          source: 'webchat-bot',
                          conversation_id: body.conversation_id,
                        },
                      })
                      .single();

                    if (bookingGuard?.status === 'slot_conflict') {
                      responseContent = 'Esse horário acabou de ser reservado. Quer que eu te mostre as próximas opções disponíveis?';
                      break;
                    }

                    if (bookingGuard?.status === 'existing_booking') {
                      const { data: existingEvent } = await supabase
                        .from('calendar_events')
                        .select('id, start_time, end_time')
                        .eq('id', bookingGuard.calendar_event_id)
                        .maybeSingle();
                      if (existingEvent) {
                        const existingDate = new Date(existingEvent.start_time);
                        const formattedDate = existingDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
                        const formattedTime = existingDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
                        responseContent = `Você já tem uma reunião confirmada para ${formattedDate} às ${formattedTime}. Não criei outro agendamento.`;
                        scheduleSucceeded = true;
                        await supabase.from('webchat_conversations').update({
                          meeting_scheduled_at: existingEvent.start_time,
                          meeting_event_id: existingEvent.id,
                        }).eq('id', body.conversation_id);
                        break;
                      }
                    }

                    let calendarEvent: any = null;
                    if (bookingGuard?.calendar_event_id) {
                      const { data } = await supabase
                        .from('calendar_events')
                        .select('*')
                        .eq('id', bookingGuard.calendar_event_id)
                        .single();
                      calendarEvent = data;
                    }

                    if (calendarInsertError || !calendarEvent) {
                      console.error('[webchat-bot] calendar_events insert failed:', calendarInsertError);
                      responseContent = 'Tive um problema técnico para travar esse horário na agenda. Pode me dar 1 minutinho que eu confirmo com a equipe?';
                      try {
                        await supabase.from('notifications').insert({
                          organization_id: hostProfile.organization_id,
                          user_id: scheduleUserId,
                          title: '⚠️ Falha ao criar agendamento via IA',
                          message: `Não consegui criar o evento na agenda para ${args.guest_name} (${args.guest_email}) em ${args.preferred_date} ${args.preferred_time}. Verifique manualmente. Erro: ${calendarInsertError?.message || 'desconhecido'}`,
                          type: 'system_alert',
                          product_id: body.product_id || null,
                        });
                      } catch (_e) {}
                      break; // sai do loop — não declarar "agendado com sucesso"
                    }

                    // Send confirmation email to the guest
                    const confirmationToken = crypto.randomUUID();
                    const confirmationUrl = `${Deno.env.get('SUPABASE_URL')?.replace('/rest/v1', '')}/functions/v1/booking-confirmation?token=${confirmationToken}`;
                    
                    let emailSent = false;
                    try {
                      await supabase.from('booking_requests')
                        .update({ confirmation_token: confirmationToken })
                        .eq('calendar_event_id', calendarEvent?.id);

                      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                      
                      const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${supabaseKey}`,
                        },
                        body: JSON.stringify({
                          bookingId: calendarEvent?.id || '',
                          guestName: args.guest_name,
                          guestEmail: args.guest_email,
                          eventName: eventType.name,
                          hostName: hostProfile.full_name || 'Equipe',
                          startTime: startTime.toISOString(),
                          endTime: endTime.toISOString(),
                          meetLink: calendarEvent?.meet_link || '',
                          confirmationToken,
                          confirmationUrl,
                        }),
                      });
                      
                      if (emailResp.ok) {
                        const emailJson = await emailResp.json().catch(() => ({}));
                        emailSent = !!emailJson?.success;
                        console.log('[webchat-bot] Confirmation email response:', emailResp.status, 'success:', emailSent);
                      } else {
                        console.error('[webchat-bot] Confirmation email HTTP error:', emailResp.status, await emailResp.text().catch(() => ''));
                      }
                    } catch (emailError) {
                      console.error('[webchat-bot] Failed to send confirmation email:', emailError);
                    }
                    
                    // Mark schedule as truly succeeded — guard for anti-hallucination check
                    scheduleSucceeded = true;

                    // === Fire-and-forget: push to host's Google Calendar if connected ===
                    try {
                      const { data: gconn } = await supabase
                        .from('google_calendar_connections')
                        .select('id')
                        .eq('user_id', scheduleUserId)
                        .eq('is_active', true)
                        .maybeSingle();
                      if (gconn) {
                        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                        fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
                          body: JSON.stringify({ userId: scheduleUserId, direction: 'export', daysAhead: 60 }),
                        }).then(() => console.log('[webchat-bot] GCal sync triggered'))
                          .catch((e) => console.warn('[webchat-bot] GCal sync trigger failed:', e));
                      }
                    } catch (gcalErr) {
                      console.warn('[webchat-bot] GCal sync check failed (non-fatal):', gcalErr);
                    }


                    // Persist meeting context on the conversation so future
                    // messages don't re-propose times. Read in the system
                    // prompt at the top of every bot invocation.
                    try {
                      await supabase
                        .from('webchat_conversations')
                        .update({
                          meeting_scheduled_at: startTime.toISOString(),
                          meeting_event_id: calendarEvent?.id || null,
                          meeting_metadata: {
                            event_type_id: eventType.id,
                            event_type_name: eventType.name,
                            attendee_email: args.guest_email,
                            attendee_name: args.guest_name,
                            host_user_id: scheduleUserId,
                          },
                        })
                        .eq('id', body.conversation_id);
                    } catch (persistErr) {
                      console.warn('[webchat-bot] Failed to persist meeting context (non-fatal):', persistErr);
                    }

                    // === Notificações internas para a equipe ===
                    try {
                      const formattedDateNotif = startTime.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
                      const formattedTimeNotif = startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
                      const agentNameNotif = activeAgent?.name || 'IA';
                      const recipientIds = new Set<string>();

                      // Usuários explícitos configurados no agente
                      const explicitIds: string[] = Array.isArray((activeAgent as any)?.booking_notification_user_ids)
                        ? (activeAgent as any).booking_notification_user_ids
                        : [];
                      explicitIds.forEach((id) => id && recipientIds.add(id));

                      // Notificar todos os admins da org se a flag estiver ativa
                      if ((activeAgent as any)?.booking_notify_org_admins) {
                        const { data: admins } = await supabase
                          .from('user_roles')
                          .select('user_id, profiles!inner(organization_id)')
                          .eq('role', 'admin')
                          .eq('profiles.organization_id', hostProfile.organization_id);
                        (admins || []).forEach((a: any) => a.user_id && recipientIds.add(a.user_id));
                      }

                      // Sempre incluir o host (anfitrião)
                      if (scheduleUserId) recipientIds.add(scheduleUserId);

                      const notifTitle = `📅 Nova reunião agendada via ${agentNameNotif}`;
                      const notifMsg = `${eventType.name} com ${args.guest_name} (${args.guest_email}) em ${formattedDateNotif} às ${formattedTimeNotif}.`;

                      const notifRows = Array.from(recipientIds).map((uid) => ({
                        organization_id: hostProfile.organization_id,
                        user_id: uid,
                        title: notifTitle,
                        message: notifMsg,
                        type: 'system' as any,
                        product_id: body.product_id || null,
                        metadata: {
                          calendar_event_id: calendarEvent?.id || null,
                          event_type_id: eventType.id,
                          agent_id: activeAgent?.id || null,
                          guest_email: args.guest_email,
                          guest_name: args.guest_name,
                          start_time: startTime.toISOString(),
                        },
                      }));

                      if (notifRows.length > 0) {
                        await supabase.from('notifications').insert(notifRows);
                        console.log(`[webchat-bot] Sent booking notifications to ${notifRows.length} users`);
                      }
                    } catch (notifyErr) {
                      console.error('[webchat-bot] Failed to send team notifications:', notifyErr);
                    }
                    
                    // Format confirmation for AI to relay
                    const formattedDate = startTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' });
                    const formattedTime = startTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
                    
                    if (emailSent) {
                      responseContent = `✅ Reunião agendada com sucesso!\n\n📅 ${formattedDate} às ${formattedTime}\n📧 Confirmação enviada para ${args.guest_email}\n\nPosso ajudar com mais alguma coisa?`;
                    } else {
                      responseContent = `✅ Reunião agendada com sucesso!\n\n📅 ${formattedDate} às ${formattedTime}\n\n⚠️ Tive um problema ao disparar o email automático para ${args.guest_email}. Nosso time vai te enviar a confirmação manualmente em instantes.`;
                      // Notify internal team
                      try {
                        await supabase.from('notifications').insert({
                          organization_id: hostProfile.organization_id,
                          user_id: scheduleUserId,
                          title: '⚠️ Email de confirmação falhou',
                          message: `Agendamento criado para ${args.guest_name} (${args.guest_email}) em ${formattedDate} ${formattedTime}, mas o email automático não foi enviado. Confirme manualmente.`,
                          type: 'system_alert',
                          product_id: body.product_id,
                        });
                      } catch (notifyErr) {
                        console.error('[webchat-bot] Failed to create internal notification:', notifyErr);
                      }
                    }
                    console.log('[webchat-bot] Meeting scheduled successfully, emailSent:', emailSent);
                  } else {
                    responseContent = 'Desculpe, não foi possível agendar no momento. Posso transferir você para um atendente para confirmar o agendamento?';
                  }
                } else {
                  responseContent = 'Infelizmente não tenho horários disponíveis no momento. Posso verificar alternativas para você?';
                }
              } catch (scheduleError) {
                console.error('[webchat-bot] Schedule error:', scheduleError);
                responseContent = 'Desculpe, ocorreu um erro ao agendar. Posso transferir para um atendente?';
              }
            } else {
              // Handle dynamic agent tools
              const toolName = toolCall.function.name;
              try {
                const args = JSON.parse(toolCall.function.arguments);
                console.log('[webchat-bot] Agent tool call:', toolName, args);

                // Helper to log action
                const logAction = async (success: boolean, result: any = {}, errorMsg?: string) => {
                  if (!activeAgent || !body.product_id) return;
                  const { data: conv } = await supabase.from('webchat_conversations').select('organization_id').eq('id', body.conversation_id).maybeSingle();
                  if (conv) {
                    await supabase.from('agent_action_logs').insert({
                      organization_id: conv.organization_id,
                      conversation_id: body.conversation_id,
                      product_id: body.product_id,
                      agent_id: activeAgent.id,
                      lead_id: leadId,
                      action_type: toolName,
                      action_data: args,
                      result,
                      success,
                      error_message: errorMsg || null,
                    });
                  }
                };

                // ============================================================
                // ANTI-RECOVERY GUARD: bloqueia re-envio de PIX / checkout
                // quando o cliente ACABOU de confirmar pagamento.
                // ============================================================
                const PAYMENT_RECOVERY_TOOLS = new Set([
                  'gerar_link_pagamento',
                  'send_pix_link',
                  'send_checkout_link',
                  'send_payment_link',
                  'reenviar_pix',
                  'reenviar_checkout',
                ]);
                if (PAYMENT_RECOVERY_TOOLS.has(toolName)) {
                  const lastUserMsg = String(body.message || '').toLowerCase();
                  const paymentConfirmedMarkers = [
                    'ja paguei', 'já paguei',
                    'ja efetuei', 'já efetuei',
                    'efetuei o pagamento', 'efetuei pagamento',
                    'pagamento efetuado', 'pagamento realizado', 'pagamento concluido', 'pagamento concluído',
                    'paguei agora', 'acabei de pagar', 'acabo de pagar',
                    'pix enviado', 'pix realizado', 'pix pago', 'pix efetuado', 'fiz o pix', 'fiz pix',
                    'comprovante', 'segue comprovante',
                    'transferencia feita', 'transferência feita',
                    'compra finalizada', 'compra concluida', 'compra concluída',
                  ];
                  const isPaymentConfirmed = paymentConfirmedMarkers.some(m => lastUserMsg.includes(m));
                  if (isPaymentConfirmed) {
                    console.warn('[webchat-bot] 🛡️ ANTI-RECOVERY: bloqueando', toolName, '— cliente já confirmou pagamento. Msg:', lastUserMsg.slice(0, 120));
                    await logAction(false, { blocked: true, reason: 'payment_already_confirmed', user_message: body.message }, 'Tool bloqueada: cliente confirmou pagamento');
                    responseContent = choice.message?.content || '';
                    break; // sai do while de redirect/tool dispatch — follow-up gera resposta natural
                  }
                }


                if (toolName === 'move_pipeline_stage' && leadId) {
                  await supabase.from('leads').update({ current_stage_id: args.stage_id }).eq('id', leadId);
                  await supabase.from('lead_stage_history').insert({ lead_id: leadId, stage_id: args.stage_id, changed_by: null });
                  await logAction(true, { stage_id: args.stage_id });
                  responseContent = choice.message?.content || 'Lead movido no pipeline com sucesso.';
                } else if (toolName === 'apply_tags' && leadId) {
                  const { data: currentLead } = await supabase.from('leads').select('tags').eq('id', leadId).maybeSingle();
                  const currentTags = currentLead?.tags || [];
                  const newTags = [...new Set([...currentTags, ...(args.tags || [])])];
                  await supabase.from('leads').update({ tags: newTags }).eq('id', leadId);
                  await logAction(true, { tags: args.tags });
                  responseContent = choice.message?.content || '';
                } else if (toolName === 'remove_tags' && leadId) {
                  const { data: currentLead } = await supabase.from('leads').select('tags').eq('id', leadId).maybeSingle();
                  const currentTags = currentLead?.tags || [];
                  const filtered = currentTags.filter((t: string) => !(args.tags || []).includes(t));
                  await supabase.from('leads').update({ tags: filtered }).eq('id', leadId);
                  await logAction(true, { removed: args.tags });
                  responseContent = choice.message?.content || '';
                } else if (toolName === 'update_lead_temperature' && leadId) {
                  await supabase.from('leads').update({ temperature: args.temperature }).eq('id', leadId);
                  await logAction(true, { temperature: args.temperature });
                  responseContent = choice.message?.content || '';
                } else if (toolName === 'update_lead_field' && leadId) {
                  const allowedFields = ['deal_value', 'company', 'source', 'email', 'phone', 'name'];
                  if (allowedFields.includes(args.field)) {
                    await supabase.from('leads').update({ [args.field]: args.value }).eq('id', leadId);
                    await logAction(true, { field: args.field, value: args.value });
                  }
                  responseContent = choice.message?.content || '';
                } else if (toolName === 'create_task' && leadId) {
                  const { data: conv } = await supabase.from('webchat_conversations').select('organization_id, assigned_user_id').eq('id', body.conversation_id).maybeSingle();
                  if (conv) {
                    await supabase.from('tasks').insert({
                      title: args.title,
                      description: args.description || '',
                      lead_id: leadId,
                      product_id: body.product_id,
                      organization_id: conv.organization_id,
                      assigned_to: conv.assigned_user_id,
                      due_date: args.due_date || null,
                      created_by: activeAgent?.id || null,
                    });
                    await logAction(true, { title: args.title });
                  }
                  responseContent = choice.message?.content || 'Tarefa criada com sucesso.';
                } else if (toolName === 'transfer_to_agent') {
                  // ─────────────────────────────────────────────────────
                  // Cross-product safety: an agent bound to a product can only
                  // transfer within the same product OR to a global agent
                  // (admin / orchestrator). Global agents may transfer freely.
                  // We enforce this here even if the model proposes an invalid ID.
                  // ─────────────────────────────────────────────────────
                  const targetAgentId = args.agent_id;

                  // No-op se já estamos no agente alvo (evita transferência redundante
                  // quando o modelo "reaplica" a tool após handoff anterior).
                  const alreadyOnTarget = !!(targetAgentId && activeAgent?.id && targetAgentId === activeAgent.id);

                  if (alreadyOnTarget) {
                    console.log('[webchat-bot] 🔁 transfer_to_agent: already on target, skipping', { agent: activeAgent?.name });
                    await logAction(true, { target_agent: targetAgentId, reason: 'already_on_target', noop: true });
                    responseContent = choice.message?.content || 'Pode seguir comigo, já estou aqui.';
                  } else {
                  const { data: targetAgent } = await supabase
                    .from('product_agents')
                    .select('id, name, agent_type, product_id, organization_id, handoff_incoming_message')
                    .eq('id', targetAgentId)
                    .eq('is_active', true)
                    .maybeSingle();

                  const activeIsGlobal = !activeAgent?.product_id;
                  const sameOrg = targetAgent && (targetAgent.organization_id === (activeAgent as any)?.organization_id);
                  const targetIsGlobal = targetAgent && !targetAgent.product_id;
                  const sameProduct = targetAgent && activeAgent?.product_id && targetAgent.product_id === activeAgent.product_id;
                  const isAllowed = !!targetAgent && !!sameOrg && (activeIsGlobal || targetIsGlobal || sameProduct);
                  // Bots normais nunca podem chamar admin
                  const tryingToCallAdmin = targetAgent?.agent_type === 'admin' && activeAgent?.agent_type !== 'admin';

                  if (!targetAgent) {
                    console.warn('[webchat-bot] ⛔ transfer_to_agent: target not found / inactive', { targetAgentId });
                    await logAction(false, { target_agent: targetAgentId, reason: 'target_not_found' });
                    responseContent = 'Não consegui localizar esse agente. Posso continuar te atendendo aqui.';
                  } else if (tryingToCallAdmin) {
                    console.warn('[webchat-bot] ⛔ transfer_to_agent: bots cannot call admin agents', {
                      from: activeAgent?.name, to: targetAgent.name,
                    });
                    await logAction(false, { target_agent: targetAgentId, reason: 'admin_is_private' });
                    responseContent = 'Esse agente é exclusivo do gestor da organização. Posso seguir aqui ou chamar outro especialista?';
                  } else if (!isAllowed) {
                    console.warn('[webchat-bot] ⛔ cross-product transfer blocked', {
                      from: `${activeAgent?.name} (product ${activeAgent?.product_id})`,
                      to: `${targetAgent.name} (product ${targetAgent.product_id})`,
                    });
                    await logAction(false, {
                      target_agent: targetAgentId,
                      reason: 'cross_product_blocked',
                      from_product: activeAgent?.product_id,
                      to_product: targetAgent.product_id,
                    });
                    responseContent = 'Esse agente atende outro produto, não posso transferir. Posso continuar com você por aqui?';
                  } else {
                    // ✅ Allowed — switch the conversation and fire the greeter so
                    // the new agent introduces itself even if the lead doesn't reply.
                    await supabase
                      .from('webchat_conversations')
                      .update({ current_agent_id: targetAgentId })
                      .eq('id', body.conversation_id);
                    await logAction(true, { target_agent: targetAgentId, reason: args.reason });
                    console.log('[webchat-bot] 🔀 transfer_to_agent OK', {
                      from: activeAgent?.name, to: targetAgent.name,
                    });

                    // Registra em agent_activation_logs pra que o próximo turno do
                    // novo agente detecte "handoff recebido" e injete o contexto.
                    try {
                      const { data: convOrg } = await supabase
                        .from('webchat_conversations')
                        .select('organization_id, lead_id')
                        .eq('id', body.conversation_id)
                        .maybeSingle();
                      if (convOrg?.organization_id) {
                        await supabase.from('agent_activation_logs').insert({
                          organization_id: convOrg.organization_id,
                          product_id: targetAgent.product_id || activeAgent?.product_id || null,
                          conversation_id: body.conversation_id,
                          lead_id: convOrg.lead_id || null,
                          from_agent_id: activeAgent?.id || null,
                          to_agent_id: targetAgentId,
                          matched_term: 'tool:transfer_to_agent',
                          match_type: 'transfer_tool',
                          channel: null,
                        });
                      }
                    } catch (logErr) {
                      console.warn('[webchat-bot] activation log failed (non-fatal):', logErr);
                    }

                    // Background dispatch of the handoff greeter (auto-introduction)
                    try {
                      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                      const greeterPromise = fetch(`${supabaseUrl}/functions/v1/agent-handoff-greeter`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${serviceKey}`,
                        },
                        body: JSON.stringify({
                          conversation_id: body.conversation_id,
                          to_agent_id: targetAgentId,
                          from_agent_name: activeAgent?.name || null,
                          product_id: targetAgent.product_id || activeAgent?.product_id || null,
                          // Overrides opcionais da regra de transferência configurada
                          template_override:
                            (cfgRulesForTurn.find((r) => r.target_agent_id === targetAgentId)?.greeting || '').trim() || null,
                          delay_seconds:
                            cfgRulesForTurn.find((r) => r.target_agent_id === targetAgentId)?.delay_seconds ?? undefined,
                          include_summary:
                            cfgRulesForTurn.find((r) => r.target_agent_id === targetAgentId)?.include_summary ?? null,
                        }),
                      }).catch((e) => console.warn('[webchat-bot] greeter dispatch failed:', e));
                      // @ts-ignore EdgeRuntime is provided by Supabase Deno runtime
                      if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) {
                        // @ts-ignore
                        (EdgeRuntime as any).waitUntil(greeterPromise);
                      }
                    } catch (greeterErr) {
                      console.warn('[webchat-bot] greeter schedule error:', greeterErr);
                    }

                    // Despedida do agente atual: usa template configurado OU default.
                    // Resolve nome do lead pra renderização das vars.
                    let nomeLead = '';
                    try {
                      const { data: convL } = await supabase
                        .from('webchat_conversations')
                        .select('lead_id')
                        .eq('id', body.conversation_id)
                        .maybeSingle();
                      if (convL?.lead_id) {
                        const { data: lead } = await supabase
                          .from('leads')
                          .select('name, full_name')
                          .eq('id', convL.lead_id)
                          .maybeSingle();
                        nomeLead = ((lead as any)?.full_name || (lead as any)?.name || '').split(' ')[0] || '';
                      }
                    } catch { /* non-fatal */ }

                    const ruleForTarget = cfgRulesForTurn.find((r) => r.target_agent_id === targetAgentId);
                    const outTpl = (ruleForTarget?.farewell || '').trim()
                      || ((activeAgent as any)?.handoff_outgoing_message || '').trim()
                      || DEFAULT_HANDOFF_OUTGOING;
                    responseContent = renderHandoffTpl(outTpl, {
                      nome: nomeLead,
                      produto: '',
                      proximo_agente: targetAgent.name || 'minha colega',
                      agent_name: activeAgent?.name || '',
                    });
                  }
                  } // end else (alreadyOnTarget guard)
                } else if (toolName === 'transfer_to_human') {
                  // GUARD: se o lead acabou de clicar em botão de continuidade de
                  // campanha, NUNCA escalar — força pergunta de descoberta.
                  if ((body as any).button_context === 'campaign_continuation') {
                    console.warn('[webchat-bot] 🛑 transfer_to_human bloqueado: clique de botão de continuidade');
                    await logAction(false, { reason: args.reason }, 'blocked_campaign_button');
                    responseContent = choice.message?.content?.trim()
                      || 'Que bom te ver por aqui! Pra eu te ajudar de forma certeira, me conta: o que você gostaria de saber primeiro?';
                  } else {
                    // IA larga o lead: limpa agente IA, marca needs_human e devolve à fila do setor
                    await supabase.from('webchat_conversations').update({
                      status: 'waiting_human',
                      current_agent_id: null,
                      assigned_user_id: null,
                      needs_human: true,
                    }).eq('id', body.conversation_id);
                    await logAction(true, { reason: args.reason });
                    responseContent = choice.message?.content || 'Vou transferir você para um atendente. Aguarde um momento!';
                  }
                } else if (toolName === 'transfer_to_sector') {
                  // GUARD: bloqueia escalada em clique de botão de continuidade.
                  if ((body as any).button_context === 'campaign_continuation') {
                    console.warn('[webchat-bot] 🛑 transfer_to_sector bloqueado: clique de botão de continuidade');
                    await logAction(false, { reason: args.reason }, 'blocked_campaign_button');
                    responseContent = choice.message?.content?.trim()
                      || 'Que bom te ver por aqui! Pra eu te ajudar de forma certeira, me conta: o que você gostaria de saber primeiro?';
                  } else {
                  // Transfere para um setor específico (resolve "transferir para Comercial")
                  const orgIdForSector = (activeAgent as any)?.organization_id;
                  let targetSectorId: string | null = args.sector_id || null;
                  // Valida que o setor existe e pertence à org
                  if (targetSectorId && orgIdForSector) {
                    const { data: secCheck } = await supabase
                      .from('sectors')
                      .select('id, name')
                      .eq('id', targetSectorId)
                      .eq('organization_id', orgIdForSector)
                      .eq('is_active', true)
                      .maybeSingle();
                    if (!secCheck) targetSectorId = null;
                  }
                  if (!targetSectorId) {
                    console.warn('[webchat-bot] ⛔ transfer_to_sector: setor inválido ou inexistente', { sector_id: args.sector_id });
                    await logAction(false, { reason: args.reason }, 'sector_not_found');
                    responseContent = choice.message?.content || 'Vou transferir você para um atendente. Aguarde um momento!';
                    await supabase.from('webchat_conversations').update({
                      status: 'waiting_human', current_agent_id: null, assigned_user_id: null, needs_human: true,
                    }).eq('id', body.conversation_id);
                  } else {
                    await supabase.from('webchat_conversations').update({
                      status: 'waiting_human',
                      current_agent_id: null,
                      assigned_user_id: null,
                      needs_human: true,
                      sector_id: targetSectorId,
                    }).eq('id', body.conversation_id);
                    await logAction(true, { sector_id: targetSectorId, reason: args.reason });
                    responseContent = choice.message?.content || 'Vou transferir você para o setor responsável. Aguarde um momento!';
                  }
                  } // end else (campaign_continuation guard)
                } else if (toolName === 'transfer_to_user') {
                  // Transfere para um usuário humano específico (Thiago, Breno, etc.)
                  const orgIdForUser = (activeAgent as any)?.organization_id;
                  let targetUserId: string | null = args.user_id || null;
                  if (!targetUserId && args.name_hint && orgIdForUser) {
                    const { data: found } = await supabase
                      .from('profiles')
                      .select('id, full_name')
                      .eq('organization_id', orgIdForUser)
                      .ilike('full_name', `%${String(args.name_hint).trim()}%`)
                      .limit(1);
                    if (found && found.length) targetUserId = (found[0] as any).id;
                  }
                  if (targetUserId && orgIdForUser) {
                    // Confirma que o usuário pertence à org
                    const { data: profCheck } = await supabase
                      .from('profiles')
                      .select('id')
                      .eq('id', targetUserId)
                      .eq('organization_id', orgIdForUser)
                      .maybeSingle();
                    if (!profCheck) targetUserId = null;
                  }
                  if (!targetUserId) {
                    console.warn('[webchat-bot] ⛔ transfer_to_user: usuário não encontrado', { user_id: args.user_id, name_hint: args.name_hint });
                    await logAction(false, args, 'user_not_found');
                    responseContent = choice.message?.content || 'Vou transferir você para um atendente. Aguarde um momento!';
                    await supabase.from('webchat_conversations').update({
                      status: 'waiting_human', current_agent_id: null, assigned_user_id: null, needs_human: true,
                    }).eq('id', body.conversation_id);
                  } else {
                    await supabase.from('webchat_conversations').update({
                      status: 'human_active',
                      current_agent_id: null,
                      assigned_user_id: targetUserId,
                      needs_human: false,
                    }).eq('id', body.conversation_id);
                    await logAction(true, { user_id: targetUserId, reason: args.reason });
                    responseContent = choice.message?.content || 'Vou transferir você agora. Aguarde um momento!';
                  }
                } else if (toolName === 'notify_team') {
                  const { data: conv } = await supabase.from('webchat_conversations').select('organization_id, assigned_user_id').eq('id', body.conversation_id).maybeSingle();
                  if (conv) {
                    await supabase.from('notifications').insert({
                      organization_id: conv.organization_id,
                      user_id: conv.assigned_user_id,
                      title: '🤖 Alerta do Agente IA',
                      message: args.message,
                      type: 'agent_alert',
                      product_id: body.product_id,
                    });
                    await logAction(true, { message: args.message });
                  }
                  responseContent = choice.message?.content || '';
                } else if (toolName === 'add_lead_note' && leadId) {
                  const { data: conv } = await supabase.from('webchat_conversations').select('organization_id').eq('id', body.conversation_id).maybeSingle();
                  if (conv) {
                    await supabase.from('lead_notes').insert({
                      lead_id: leadId,
                      content: `[IA - ${activeAgent?.name || 'Agente'}] ${args.content}`,
                      created_by: null,
                    });
                    await logAction(true, { content: args.content });
                  }
                  responseContent = choice.message?.content || '';
                } else if (toolName === 'start_cadence' && leadId) {
                  const { data: activeEnroll } = await supabase
                    .from('cadence_enrollments')
                    .select('id')
                    .eq('lead_id', leadId)
                    .eq('status', 'active')
                    .limit(1);
                  const { data: conv } = await supabase.from('webchat_conversations').select('organization_id').eq('id', body.conversation_id).maybeSingle();
                  if (activeEnroll && activeEnroll.length) {
                    await logAction(false, { blocked: 'cadence_active' });
                  } else if (conv) {
                    await supabase.from('ai_outreach_queue').insert({
                      lead_id: leadId,
                      organization_id: conv.organization_id,
                      product_id: body.product_id,
                      agent_id: activeAgent?.id,
                      conversation_id: body.conversation_id,
                      objective: args.objective || 'Follow-up automático',
                      followup_enabled: true,
                      followup_interval_hours: args.interval_hours || 24,
                      max_followups: args.max_followups || 3,
                      status: 'pending',
                    });
                    await logAction(true, { objective: args.objective });
                  }

                  responseContent = choice.message?.content || '';
                } else if (toolName === 'qualify_lead' && leadId) {
                  const rawSchema = (activeAgent as any)?.qualification_schema as
                    | { name?: string; fields?: Array<{ key: string; label: string; weight?: number }> }
                    | null
                    | undefined;
                  const isBant = !rawSchema || !Array.isArray(rawSchema.fields) || rawSchema.fields.length === 0;
                  const methodName = isBant ? 'BANT' : (rawSchema?.name || 'Qualificação');
                  const fields = isBant
                    ? [
                        { key: 'budget',    label: 'Budget',    weight: 25 },
                        { key: 'authority', label: 'Authority', weight: 25 },
                        { key: 'need',      label: 'Need',      weight: 30 },
                        { key: 'timeline',  label: 'Timing',    weight: 20 },
                      ]
                    : rawSchema!.fields!;

                  const answers: Record<string, string> = {};
                  let filledWeight = 0;
                  let totalWeight = 0;
                  for (const f of fields) {
                    const w = typeof f.weight === 'number' ? f.weight : 0;
                    totalWeight += w;
                    const val = args[f.key];
                    if (typeof val === 'string' && val.trim()) {
                      answers[f.key] = val.trim();
                      filledWeight += w;
                    }
                  }
                  const score = totalWeight > 0 ? Math.round((filledWeight / totalWeight) * 100) : 0;

                  const { data: currentLead } = await supabase
                    .from('leads')
                    .select('custom_fields')
                    .eq('id', leadId)
                    .maybeSingle();
                  const customFields = (currentLead?.custom_fields || {}) as Record<string, any>;
                  customFields['qualification'] = {
                    method: methodName,
                    answers,
                    score,
                    updated_at: new Date().toISOString(),
                  };

                  // Back-compat: se for BANT, popula também as colunas dedicadas
                  // bant_budget / bant_authority / bant_need / bant_timing para a aba existente.
                  const leadUpdate: Record<string, any> = { custom_fields: customFields };
                  if (isBant) {
                    customFields['bant_qualification'] = answers;
                    if (answers.budget)    leadUpdate.bant_budget    = JSON.stringify({ q1: answers.budget });
                    if (answers.authority) leadUpdate.bant_authority = JSON.stringify({ q1: answers.authority });
                    if (answers.need)      leadUpdate.bant_need      = JSON.stringify({ q1: answers.need });
                    if (answers.timeline)  leadUpdate.bant_timing    = JSON.stringify({ q1: answers.timeline });
                  }

                  await supabase.from('leads').update(leadUpdate).eq('id', leadId);
                  await logAction(true, { method: methodName, answers, score });
                  responseContent = choice.message?.content || '';
                } else if (toolName === 'send_email' && leadId && leadContext?.email) {
                  // Send via Resend
                  try {
                    const resendKey = Deno.env.get('RESEND_API_KEY');
                    if (resendKey) {
                      await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
                        body: JSON.stringify({
                          from: 'noreply@resend.dev',
                          to: [leadContext.email],
                          subject: args.subject,
                          text: args.body,
                        }),
                      });
                      await logAction(true, { subject: args.subject, to: leadContext.email });
                    }
                  } catch (emailErr) {
                    console.error('[webchat-bot] Email error:', emailErr);
                    await logAction(false, {}, String(emailErr));
                  }
                  responseContent = choice.message?.content || 'Email enviado com sucesso!';
                } else if (getRegistryTool(toolName)) {
                  // === REGISTRY DISPATCH (Fase 1) ===
                  // Ferramenta nova do registry centralizado. Auditoria automática.
                  const orgIdForTool = (activeAgent as any)?.organization_id || null;
                  if (!orgIdForTool) {
                    console.warn('[webchat-bot] registry tool sem organization_id — pulando:', toolName);
                    responseContent = choice.message?.content || body.agent_config.fallback_message;
                  } else {
                    const registryResult = await executeRegistryTool(toolName, args, {
                      organizationId: orgIdForTool,
                      agentId: activeAgent?.id ?? null,
                      agentName: activeAgent?.name ?? null,
                      leadId: leadId ?? null,
                      conversationId: body.conversation_id ?? null,
                      channel: body.channel ?? null,
                      supabase,
                    });
                    console.log('[webchat-bot] 🧰 Registry tool result:', toolName, registryResult.success ? 'OK' : 'FAIL', registryResult.error || '');
                    // Resultado de ferramenta executada pelo registry é uma fonte
                    // confiável e pode produzir URLs dinâmicas (agenda, arquivo etc.).
                    approvedUrlsForResponse = [
                      ...new Set([
                        ...approvedUrlsForResponse,
                        ...extractUrls(registryResult.user_message),
                        ...extractUrls(registryResult.data),
                      ]),
                    ];
                    // Mantém logAction legado também, pra retrocompatibilidade do painel antigo
                    await logAction(registryResult.success, registryResult.data || {}, registryResult.error);
                    responseContent =
                      choice.message?.content ||
                      registryResult.user_message ||
                      ''; // ← vazio força o follow-up completion (linhas abaixo) a gerar resposta natural
                                                                                          // em vez de mandar "Ação executada com sucesso." pro cliente

                  }
                } else {
                  responseContent = choice.message?.content || body.agent_config.fallback_message;
                }
              } catch (toolError) {
                console.error('[webchat-bot] Agent tool error:', toolError);
                responseContent = choice.message?.content || body.agent_config.fallback_message;
              }
            }
              // 🔁 If the agent only emitted a tool call (no text), do a follow-up
              // completion so the user actually receives a reply. Without this,
              // tools like update_lead_temperature / add_lead_note / apply_tags
              // make the bot go silent.
              if (
                toolCall &&
                (!responseContent || !responseContent.trim()) &&
                (!choice?.message?.content || !choice.message.content.trim())
              ) {
                try {
                  console.log('[webchat-bot] 🔁 Empty response after tool call → running follow-up for', toolCall.function.name);
                  const followUpBody: any = {
                    model: agentModel,
                    messages: [
                      { role: 'system', content: followUpSystemPrompt },
                      ...followUpHistory,
                      { role: 'user', content: body.message },
                      { role: 'assistant', content: null, tool_calls: [toolCall] },
                      { role: 'tool', tool_call_id: toolCall.id, content: 'Ação executada com sucesso. Continue a conversa naturalmente respondendo à última mensagem do cliente. NÃO mencione que executou uma ferramenta.' },
                    ],
                    max_tokens: 2000,
                    temperature: 0.6,
                  };
                  const fu = await fetch(aiConfig.endpoint, {
                    method: 'POST',
                    headers: aiConfig.headers,
                    body: JSON.stringify(prepareAIRequestBody(followUpBody, aiConfig)),
                  });
                  if (fu.ok) {
                    const fuJson = await fu.json();
                    await recordAIUsage(supabase, orgIdForRouting, aiConfig, 'agent_chat', fuJson?.usage, 'webchat-bot:tool-followup');
                    const fuText = fuJson?.choices?.[0]?.message?.content?.trim();
                    if (fuText) {
                      responseContent = fuText;
                      console.log('[webchat-bot] 🔁 Follow-up produced reply (', fuText.length, 'chars)');
                    }
                  } else {
                    console.warn('[webchat-bot] follow-up failed:', fu.status);
                  }
                } catch (fuErr) {
                  console.warn('[webchat-bot] follow-up exception:', fuErr);
                }
              }
              // Break unless toolCall.function.name was mutated (deterministic redirect)
              if (toolCall.function.name === __previousToolName) break;
              console.log('[webchat-bot] 🔁 Redirect attempt → re-dispatching as', toolCall.function.name);
            } // end while redirect loop
          } else {
            responseContent = choice?.message?.content || '';

            // ============================================================
            // EMPTY-RESPONSE RETRY (reasoning models / finish_reason=length)
            // Se o modelo terminou por falta de tokens (comum em gpt-5 quando
            // reasoning consumiu o budget), repete a chamada UMA vez com
            // orçamento maior e reasoning_effort="minimal". Isso evita que
            // resposta vazia vire fallback de handoff humano.
            // ============================================================
            if ((!responseContent || !responseContent.trim()) && finishReason === 'length') {
              try {
                console.warn('[webchat-bot] ⚠️ empty content + finish_reason=length → retrying with bigger budget');
                const retryBody: any = {
                  ...requestBody,
                  max_tokens: 8000,
                  reasoning_effort: 'minimal',
                };
                const retryResp = await fetch(aiConfig.endpoint, {
                  method: 'POST',
                  headers: aiConfig.headers,
                  body: JSON.stringify(prepareAIRequestBody(retryBody, aiConfig)),
                });
                if (retryResp.ok) {
                  const retryData = await retryResp.json();
                  await recordAIUsage(supabase, orgIdForRouting, aiConfig, 'agent_chat', retryData?.usage, 'webchat-bot:empty-retry');
                  const retryChoice = retryData.choices?.[0];
                  const retryText = retryChoice?.message?.content?.trim();
                  console.log('[webchat-bot] retry finish_reason:', retryChoice?.finish_reason, '| length:', retryText?.length || 0);
                  if (retryText) responseContent = retryText;
                } else {
                  console.warn('[webchat-bot] empty-retry failed:', retryResp.status);
                }
              } catch (rErr) {
                console.warn('[webchat-bot] empty-retry threw:', rErr);
              }
            }

            // Última linha de defesa: NÃO usar fallback_message aqui (era a
            // frase de handoff humano). Se ainda estiver vazio, avisa erro
            // técnico neutro. Handoff real só via [HANDOFF:*] ou ai_takeover.
            if (!responseContent || !responseContent.trim()) {
              console.error('[webchat-bot] ❌ still empty after retry — returning neutral tech-error');
              responseContent = 'Tive um problema técnico agora, pode repetir sua última mensagem?';
            }
          }
          
          // ============================================================
          // ANTI-HALLUCINATION GUARD: blocks fake booking confirmations
          // If the model wrote a "meeting scheduled" message but the
          // schedule_meeting tool was NOT actually executed in this turn,
          // replace the message and log the attempt.
          // ============================================================
          if (canSchedule && !scheduleSucceeded && responseContent) {
            const lowered = responseContent.toLowerCase();
            const hallucinationMarkers = [
              'reunião agendada',
              'reuniao agendada',
              'agendamento confirmado',
              'agendado com sucesso',
              'confirmação enviada para',
              'confirmacao enviada para',
              'agendei sua reunião',
              'agendei sua reuniao',
              'marquei sua reunião',
              'marquei sua reuniao',
            ];
            const matchedMarker = hallucinationMarkers.find(m => lowered.includes(m));
            
            if (matchedMarker) {
              console.warn('[webchat-bot] 🚨 HALLUCINATED BOOKING BLOCKED — marker:', matchedMarker);
              console.warn('[webchat-bot] Original (blocked) content:', responseContent);
              
              const originalContent = responseContent;
              const needsEmail = !leadContext?.email;
              responseContent = needsEmail
                ? 'Deixa eu confirmar a agenda aqui rapidinho antes de fechar com você. Pode me passar o melhor email pra eu mandar a confirmação?'
                : 'Deixa eu confirmar a agenda aqui rapidinho antes de travar o horário. Só um instante…';
              
              // Log attempt for audit
              try {
                const { data: convForLog } = await supabase
                  .from('webchat_conversations')
                  .select('organization_id')
                  .eq('id', body.conversation_id)
                  .maybeSingle();
                if (convForLog?.organization_id) {
                  await supabase.from('agent_action_logs').insert({
                    organization_id: convForLog.organization_id,
                    agent_id: activeAgent?.id || null,
                    conversation_id: body.conversation_id,
                    lead_id: leadId || null,
                    product_id: body.product_id || null,
                    action_type: 'hallucinated_booking_blocked',
                    success: false,
                    action_data: { matched_marker: matchedMarker, user_message: body.message },
                    result: { original_content: originalContent, replaced_with: responseContent },
                    error_message: `Model wrote booking confirmation without calling schedule_meeting tool (marker: "${matchedMarker}")`,
                  });
                }
              } catch (logErr) {
                console.error('[webchat-bot] Failed to log hallucination:', logErr);
              }
            } else {
              // Detect "scheduling intent missed": user confirmed a slot but model didn't call tool
              const userMsg = (body.message || '').toLowerCase();
              const confirmationTerms = /\b(pode ser|fechado|ok|combinado|vamos|marca pra mim|marca pra mim|tá bom|ta bom|beleza|perfeito|pode marcar)\b/;
              const timePattern = /\b\d{1,2}[:h]\d{0,2}\b/;
              const hasConfirmation = confirmationTerms.test(userMsg) || timePattern.test(userMsg);
              
              if (hasConfirmation) {
                try {
                  const { data: convForLog } = await supabase
                    .from('webchat_conversations')
                    .select('organization_id')
                    .eq('id', body.conversation_id)
                    .maybeSingle();
                  if (convForLog?.organization_id) {
                    await supabase.from('agent_action_logs').insert({
                      organization_id: convForLog.organization_id,
                      agent_id: activeAgent?.id || null,
                      conversation_id: body.conversation_id,
                      lead_id: leadId || null,
                      product_id: body.product_id || null,
                      action_type: 'scheduling_intent_missed',
                      success: false,
                      action_data: { user_message: body.message, has_email: !!leadContext?.email },
                      result: { ai_response: responseContent },
                      error_message: 'User appeared to confirm a slot but schedule_meeting tool was not invoked',
                    });
                  }
                } catch (logErr) {
                  console.error('[webchat-bot] Failed to log scheduling_intent_missed:', logErr);
                }
              }
            }
          }

          // ============================================================
          // SAFETY NET — TRANSFER PROMISED BUT NOT EXECUTED
          // Se a IA escreveu "vou transferir / vou encaminhar / vou passar
          // para o setor X" mas NÃO chamou transfer_to_sector/human/user,
          // a conversa fica presa em bot_active e o cliente espera para sempre.
          // Aqui detectamos a promessa + intenção do usuário e executamos a
          // transferência real para o setor mais provável.
          // ============================================================
          try {
            if (responseContent && activeAgent?.can_transfer) {
              const lowered = (responseContent || '').toLowerCase();
              const userLower = (body.message || '').toLowerCase();
              const promiseRegex = /(vou (te )?(transferir|encaminhar|passar)|estou (te )?(transferindo|encaminhando|passando)|j[áa] (vou|estou) (te )?(transferindo|transferir|encaminhar|encaminhando|passando|passar)|encaminhando (tudo )?para|transferindo (agora|j[áa])|nosso (consultor|time) (comercial|de vendas)|um (de nossos )?(consultor|especialista|atendente|vendedor)s?\s+(j[áa]\s+)?(assume|vai|te chama|entra em contato))/i;
              const userAskedTransfer = /(transfere|transferir|transfira|me passa|me transfere|quero falar com (humano|atendente|vendedor|consultor|pessoa|gente)|chama (um|o) (humano|atendente|vendedor|consultor)|fala com (humano|atendente|vendedor|consultor))/i.test(userLower);
              const promised = promiseRegex.test(lowered);

              const { data: convNow } = await supabase
                .from('webchat_conversations')
                .select('id, status, sector_id, current_agent_id, organization_id')
                .eq('id', body.conversation_id)
                .maybeSingle();

              const stillWithBot = convNow && convNow.status === 'bot_active' && !!convNow.current_agent_id;

              if (stillWithBot && (promised || userAskedTransfer)) {
                let targetSectorId: string | null = null;
                const orgIdSafe = convNow.organization_id;
                if (orgIdSafe) {
                  const { data: orgSectors } = await supabase
                    .from('sectors')
                    .select('id, name')
                    .eq('organization_id', orgIdSafe)
                    .eq('is_active', true);
                  const sectors = (orgSectors || []) as Array<{ id: string; name: string }>;

                  const haystack = `${lowered} ${userLower}`;
                  for (const s of sectors) {
                    const nm = (s.name || '').toLowerCase().trim();
                    if (nm && haystack.includes(nm)) { targetSectorId = s.id; break; }
                  }
                  if (!targetSectorId && /(comercial|vendas|consultor)/i.test(haystack)) {
                    const commercial = sectors.find((s) => /(comercial|vendas)/i.test(s.name || ''));
                    if (commercial) targetSectorId = commercial.id;
                  }
                  if (!targetSectorId && convNow.sector_id) targetSectorId = convNow.sector_id;
                  if (!targetSectorId && sectors.length > 0) targetSectorId = sectors[0].id;
                }

                if (targetSectorId) {
                  console.warn('[webchat-bot] 🛟 SAFETY NET: transferência prometida mas não executada — forçando transfer_to_sector', { sector_id: targetSectorId, promised, userAskedTransfer });
                  await supabase.from('webchat_conversations').update({
                    status: 'waiting_human',
                    current_agent_id: null,
                    assigned_user_id: null,
                    needs_human: true,
                    sector_id: targetSectorId,
                  }).eq('id', body.conversation_id);

                  try {
                    await supabase.from('agent_action_logs').insert({
                      organization_id: convNow.organization_id,
                      agent_id: activeAgent?.id || null,
                      conversation_id: body.conversation_id,
                      lead_id: leadId || null,
                      product_id: body.product_id || null,
                      action_type: 'transfer_to_sector_safety_net',
                      success: true,
                      action_data: { sector_id: targetSectorId, promised, user_asked: userAskedTransfer, user_message: body.message },
                      result: { ai_response: responseContent },
                    });
                  } catch { /* non-fatal */ }
                }
              }
            }
          } catch (safetyErr) {
            console.error('[webchat-bot] transfer safety net error:', safetyErr);
          }


          
          // ============================================================
          // FIX 4 — ANTI-REPETITION SIMILARITY FILTER
          // If the new response repeats a key sentence from the last 4
          // assistant messages, ask the model to rewrite once.
          // ============================================================
          if (responseContent && responseContent.length > 30) {
            try {
              const { data: recentAssistantMsgs } = await supabase
                .from('webchat_messages')
                .select('content')
                .eq('conversation_id', body.conversation_id)
                .eq('direction', 'outbound')
                .order('created_at', { ascending: false })
                .limit(4);

              const norm = (s: string) => s.toLowerCase().replace(/[^a-záéíóúâêôãõç0-9 ]/gi, '').replace(/\s+/g, ' ').trim();
              const splitSentences = (s: string) => s.split(/[.!?\n]+/).map(x => norm(x)).filter(x => x.length > 25);

              const newSentences = splitSentences(responseContent);
              let repeatedPhrase: string | null = null;

              for (const prevMsg of recentAssistantMsgs || []) {
                const prevSentences = splitSentences(prevMsg.content || '');
                for (const newS of newSentences) {
                  for (const prevS of prevSentences) {
                    // Cheap similarity: trigram overlap or substring match
                    if (newS === prevS || prevS.includes(newS) || newS.includes(prevS)) {
                      repeatedPhrase = prevS.length > 80 ? prevS.slice(0, 80) + '…' : prevS;
                      break;
                    }
                    // Token-overlap fallback
                    const aTokens = new Set(newS.split(' '));
                    const bTokens = new Set(prevS.split(' '));
                    const inter = [...aTokens].filter(t => bTokens.has(t)).length;
                    const ratio = inter / Math.max(aTokens.size, bTokens.size);
                    if (ratio >= 0.8) {
                      repeatedPhrase = prevS.length > 80 ? prevS.slice(0, 80) + '…' : prevS;
                      break;
                    }
                  }
                  if (repeatedPhrase) break;
                }
                if (repeatedPhrase) break;
              }

              if (repeatedPhrase) {
                console.warn('[webchat-bot] 🔁 REPETITION DETECTED, asking model to rewrite. Repeated:', repeatedPhrase);
                const rewriteResp = await fetch(aiConfig.endpoint, {
                  method: 'POST',
                  headers: aiConfig.headers,
                  body: JSON.stringify(prepareAIRequestBody({
                    model: agentModel,
                    messages: [
                      { role: 'system', content: `Você é um editor. Reescreva a mensagem do assistente removendo qualquer frase parecida com: "${repeatedPhrase}". A nova mensagem deve AVANÇAR a conversa para o próximo passo, ser curta (máx 2 linhas) e NÃO repetir nada que já foi dito. Responda apenas com o novo texto, sem aspas.` },
                      { role: 'user', content: responseContent },
                    ],
                    max_tokens: 200,
                    temperature: 0.6,
                  }, aiConfig)),
                });
                if (rewriteResp.ok) {
                  const rewriteData = await rewriteResp.json();
                  await recordAIUsage(supabase, orgIdForRouting, aiConfig, 'content_generation', rewriteData?.usage, 'webchat-bot:rewrite');
                  const rewritten = rewriteData.choices?.[0]?.message?.content?.trim();
                  if (rewritten && rewritten.length > 10) {
                    console.log('[webchat-bot] ✓ Rewritten response used');
                    // Log the repetition event for audit
                    try {
                      const { data: convForLog } = await supabase
                        .from('webchat_conversations')
                        .select('organization_id')
                        .eq('id', body.conversation_id)
                        .maybeSingle();
                      if (convForLog?.organization_id) {
                        await supabase.from('agent_action_logs').insert({
                          organization_id: convForLog.organization_id,
                          agent_id: activeAgent?.id || null,
                          conversation_id: body.conversation_id,
                          lead_id: leadId || null,
                          product_id: body.product_id || null,
                          action_type: 'response_repetition_detected',
                          success: true,
                          action_data: { repeated_phrase: repeatedPhrase },
                          result: { original: responseContent, rewritten },
                        });
                      }
                    } catch (e) { /* non-fatal */ }
                    responseContent = rewritten;
                  }
                }
              }
            } catch (simErr) {
              console.error('[webchat-bot] similarity filter error:', simErr);
            }
          }
          
          console.log('[webchat-bot] Response length:', responseContent?.length || 0);
        } else {
          const errorText = await aiResponse.text();
          console.error('[webchat-bot] AI API error:', aiResponse.status, errorText.slice(0, 500));
          // NÃO usar fallback_message (frase de handoff humano). Mensagem
          // neutra — handoff real acontece só via tags/blocos do fluxo.
          responseContent = 'Tive um problema técnico agora, pode repetir sua última mensagem?';
        }
      } catch (aiError) {
        console.error('[webchat-bot] AI call failed:', aiError);
        responseContent = 'Tive um problema técnico agora, pode repetir sua última mensagem?';
      }
    }

    // ============================================================
    // [HANDOFF:xxx] tag interpreter — runs AFTER agent generated reply
    // If the AI ended its message with [HANDOFF:closer|humano|cs|sdr|support|financial],
    // we strip the tag, switch the conversation's current_agent_id to the matching role,
    // or escalate to a human (mark conversation needs_human + create activation log).
    // The current message is delivered to the lead clean (without the tag).
    // The NEXT inbound message will be handled by the new agent automatically.
    // ============================================================
    if (responseContent && activeAgent && body.product_id) {
      try {
        // 🔧 PRÉ-CORREÇÃO: se o modelo escreveu tags inventadas tipo [TRANSFER],
        // [TRANSFERIR], [HANDOFF] (sem role) ou [PASSAR PARA SONIA], converte
        // para [HANDOFF:closer] antes do parser oficial. Assim a transferência
        // realmente acontece em vez de só ser limpa silenciosamente.
        if (/\[\s*(?:transfer(?:ir)?|hand[\s_-]*off|passar(?:\s+para[^\]]*)?|enviar\s+para[^\]]*|transferir\s+para[^\]]*)\s*\]/i.test(responseContent)
            && !/\[HANDOFF:\s*(?:closer|sdr|cs|support|financial|humano|human)\s*\]/i.test(responseContent)) {
          // Default seguro: closer (cenário comercial). Se o agente atual já é closer,
          // vira humano (escalonamento natural).
          const fallbackRole = activeAgent.agent_type === 'closer' ? 'humano' : 'closer';
          responseContent = responseContent.replace(
            /\[\s*(?:transfer(?:ir)?|hand[\s_-]*off|passar(?:\s+para[^\]]*)?|enviar\s+para[^\]]*|transferir\s+para[^\]]*)\s*\]/gi,
            `[HANDOFF:${fallbackRole}]`,
          );
          console.log('[webchat-bot] 🔁 Fake transfer tag promoted to [HANDOFF:' + fallbackRole + ']');
        }

        const parsedHandoff = parseHandoffTag(responseContent);
        if (parsedHandoff.handoffTo) {
          responseContent = parsedHandoff.cleanText || responseContent;
          const target = parsedHandoff.handoffTo;
          const targetRole = handoffTargetToAgentRole(target);

          console.log('[webchat-bot] 🔀 HANDOFF detected →', target, 'rawTag:', parsedHandoff.rawTag);

          // Get conversation org for logging + lead/product names for variable rendering
          const { data: convForHandoff } = await supabase
            .from('webchat_conversations')
            .select('organization_id, lead_id, channel, visitor_phone')
            .eq('id', body.conversation_id)
            .maybeSingle();

          // Resolve variables for the OUTGOING message (Sofia → Ana)
          let leadFirstName = '';
          let productName = '';
          if (convForHandoff?.lead_id) {
            const { data: lead } = await supabase
              .from('leads')
              .select('name, full_name')
              .eq('id', convForHandoff.lead_id)
              .maybeSingle();
            leadFirstName = ((lead as any)?.full_name || (lead as any)?.name || '').split(' ')[0] || '';
          }
          if (body.product_id) {
            const { data: prod } = await supabase
              .from('products')
              .select('name')
              .eq('id', body.product_id)
              .maybeSingle();
            productName = (prod as any)?.name || '';
          }

          const renderTpl = (tpl: string, vars: Record<string, string>) =>
            tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? '').replace(/\s{2,}/g, ' ').trim();

          if (target === 'humano') {
            // Escalate to human queue
            await supabase
              .from('webchat_conversations')
              .update({
                needs_human: true,
                current_agent_id: null,
              })
              .eq('id', body.conversation_id);

            // Replace AI reply with the configured outgoing message OR default farewell
            const outTpl = ((activeAgent as any).handoff_outgoing_message || '').trim() || DEFAULT_HANDOFF_OUTGOING;
            responseContent = renderTpl(outTpl, {
              nome: leadFirstName,
              produto: productName,
              proximo_agente: 'um especialista humano',
              agent_name: activeAgent.name || '',
            });

            // Best-effort log
            if (convForHandoff?.organization_id) {
              try {
                await supabase.from('agent_activation_logs').insert({
                  organization_id: convForHandoff.organization_id,
                  product_id: body.product_id,
                  conversation_id: body.conversation_id,
                  lead_id: convForHandoff.lead_id || null,
                  from_agent_id: activeAgent.id,
                  to_agent_id: null,
                  matched_term: parsedHandoff.rawTag || '[HANDOFF:humano]',
                  match_type: 'handoff_human',
                  channel: null,
                });
              } catch (logErr) {
                console.warn('[webchat-bot] handoff log failed (non-fatal):', logErr);
              }
            }
          } else if (targetRole) {
            // Find specialist agent of the requested role for the same product
            const { data: nextAgent } = await supabase
              .from('product_agents')
              .select('id, name, agent_type, handoff_incoming_message, handoff_delay_seconds')
              .eq('product_id', body.product_id)
              .eq('agent_type', targetRole)
              .eq('is_active', true)
              .order('is_default', { ascending: false })
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (nextAgent && nextAgent.id !== activeAgent.id) {
              await supabase
                .from('webchat_conversations')
                .update({ current_agent_id: nextAgent.id })
                .eq('id', body.conversation_id);
              console.log('[webchat-bot] ✅ Switched current_agent_id →', nextAgent.name);

              // Replace the AI's reply with the configured outgoing (farewell) message OR default
              const outTpl = ((activeAgent as any).handoff_outgoing_message || '').trim() || DEFAULT_HANDOFF_OUTGOING;
              responseContent = renderTpl(outTpl, {
                nome: leadFirstName,
                produto: productName,
                proximo_agente: nextAgent.name || 'a próxima atendente',
                agent_name: activeAgent.name || '',
              });

              // Schedule the incoming agent's auto-greeting in background.
              // Sempre dispara: o greeter usa o template configurado OU o default interno
              // (DEFAULT_TEMPLATE em agent-handoff-greeter), garantindo apresentação.
              try {
                const greeterPayload = {
                  conversation_id: body.conversation_id,
                  to_agent_id: nextAgent.id,
                  from_agent_name: activeAgent.name || null,
                  product_id: body.product_id,
                };
                const greeterPromise = supabase.functions.invoke('agent-handoff-greeter', {
                  body: greeterPayload,
                }).then((r) => {
                  if ((r as any).error) {
                    console.warn('[webchat-bot] greeter invoke error:', (r as any).error);
                  }
                }).catch((e) => {
                  console.warn('[webchat-bot] greeter invoke threw:', e);
                });
                // @ts-ignore EdgeRuntime is available in Supabase Deno runtime
                if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) {
                  // @ts-ignore
                  (EdgeRuntime as any).waitUntil(greeterPromise);
                }
                console.log('[webchat-bot] 📨 Scheduled incoming greeting for', nextAgent.name);
              } catch (e) {
                console.warn('[webchat-bot] failed to schedule greeter:', e);
              }

              if (convForHandoff?.organization_id) {
                try {
                  await supabase.from('agent_activation_logs').insert({
                    organization_id: convForHandoff.organization_id,
                    product_id: body.product_id,
                    conversation_id: body.conversation_id,
                    lead_id: convForHandoff.lead_id || null,
                    from_agent_id: activeAgent.id,
                    to_agent_id: nextAgent.id,
                    matched_term: parsedHandoff.rawTag || `[HANDOFF:${target}]`,
                    match_type: 'handoff_tag',
                    channel: null,
                  });
                } catch (logErr) {
                  console.warn('[webchat-bot] handoff log failed (non-fatal):', logErr);
                }
              }
            } else {
              console.log('[webchat-bot] ⚠️ No specialist found for role:', targetRole, '— staying with current agent');
            }
          }
        }
      } catch (handoffErr) {
        console.warn('[webchat-bot] handoff parser error (non-fatal):', handoffErr);
      }
    }

    // Sanitize: remove placeholders {{xxx}} desconhecidos que o modelo escapou
    // (ex: {{checkout_link}}). Força o agente a usar tools no próximo turno.
    if (responseContent) {
      responseContent = stripUnrenderedPlaceholders(responseContent);
      const fakeRes = stripFakeHandoffTags(responseContent);
      if (fakeRes.fakeFound) {
        console.log('[webchat-bot] ⚠️ fake transfer/handoff tag detected and stripped');
      }
      responseContent = fakeRes.cleaned;

      // Antes de remover os vazamentos, tenta extrair intenções conhecidas
      // (ex: notify_team) para não perder a ação. Só executa tools "seguras"
      // (sem efeitos irreversíveis de roteamento).
      try {
        const leakedCalls = extractLeakedToolCalls(responseContent);
        for (const call of leakedCalls) {
          if (call.name === 'notify_team') {
            const message = String((call.args as any)?.message ?? '').trim();
            if (message) {
              const { data: convForNotif } = await supabase
                .from('webchat_conversations')
                .select('organization_id, assigned_user_id')
                .eq('id', body.conversation_id)
                .maybeSingle();
              if (convForNotif) {
                await supabase.from('notifications').insert({
                  organization_id: convForNotif.organization_id,
                  user_id: convForNotif.assigned_user_id,
                  title: '🤖 Alerta do Agente IA (recuperado)',
                  message,
                  type: 'agent_alert',
                  product_id: body.product_id,
                }).catch(() => {});
              }
              console.warn('[webchat-bot] recovered notify_team from leaked text', {
                conversation_id: body.conversation_id,
              });
            }
          }
        }
      } catch (leakedErr) {
        console.warn('[webchat-bot] leaked tool extraction failed (non-fatal):', leakedErr);
      }

      // Remove vazamentos de tool call que alguns modelos (Gemini 3 preview)
      // emitem como texto livre (ex: "funcall:default_api:add_lead_note{...}",
      // {"action":"notify_team","action_input":"..."}) em vez de preencher
      // `tool_calls[]`. Sem isso o lead vê a string crua.
      const sanitized = sanitizeAgentOutput(responseContent);
      if (sanitized.leaked) {
        console.warn('[webchat-bot] ⚠️ tool-call leak stripped from response:',
          sanitized.removed.slice(0, 3));
        try {
          await supabase.from('agent_action_logs').insert({
            organization_id: body.agent_config?.organization_id ?? null,
            agent_id: (body as any).agent_config?.id ?? null,
            conversation_id: body.conversation_id ?? null,
            action_type: 'tool_leak_blocked',
            status: 'blocked',
            payload: { removed: sanitized.removed.slice(0, 5) },
          } as any);
        } catch (_) { /* log é best-effort */ }
      }
      responseContent = sanitized.text;

      // Defesa final: mesmo que o modelo ignore a instrução, uma URL que não
      // veio do registro estruturado de material, CTA ou ferramenta não chega.
      const urlGuard = guardOutboundUrls(responseContent, approvedUrlsForResponse);
      if (urlGuard.blocked.length > 0) {
        console.warn('[webchat-bot] blocked unapproved URLs:', urlGuard.blocked);
        try {
          await supabase.from('agent_action_logs').insert({
            organization_id: (activeAgent as any)?.organization_id ?? null,
            agent_id: activeAgent?.id ?? null,
            conversation_id: body.conversation_id ?? null,
            action_type: 'unapproved_url_blocked',
            status: 'blocked',
            payload: { urls: urlGuard.blocked.slice(0, 5) },
          } as any);
        } catch (_) { /* best-effort */ }
      }
      responseContent = urlGuard.text;

      // Circuit breaker: modelo entrou em loop de token (ex: "aminaseaminase..."
      // 800x saído do gemini-3-flash-preview). Nunca envia isso para o lead.
      if (sanitized.degenerate) {
        const badPreview = responseContent.slice(0, 120);
        console.error('[webchat-bot] 🛑 DEGENERATE OUTPUT blocked:', {
          reason: sanitized.degenerateReason,
          length: responseContent.length,
          preview: badPreview,
          model: agentModel,
          conversation_id: body.conversation_id,
        });
        try {
          await supabase.from('agent_action_logs').insert({
            organization_id: body.agent_config?.organization_id ?? null,
            agent_id: (body as any).agent_config?.id ?? null,
            conversation_id: body.conversation_id ?? null,
            action_type: 'degenerate_output_blocked',
            success: false,
            action_data: {
              reason: sanitized.degenerateReason,
              length: responseContent.length,
              model: agentModel,
              preview: badPreview,
            },
          } as any);
        } catch (_) { /* best-effort */ }

        // Uma tentativa de retry: temperatura baixa, teto curto, instrução extra.
        let rescued: string | null = null;
        try {
          const retryResp = await fetch(aiConfig.endpoint, {
            method: 'POST',
            headers: aiConfig.headers,
            body: JSON.stringify(prepareAIRequestBody({
              model: agentModel,
              messages: [
                { role: 'system', content: 'Responda em português brasileiro, em no máximo 2 linhas, sem repetir palavras nem sílabas. Se não souber o que dizer, peça um instante.' },
                { role: 'user', content: (body as any).message || 'Continue a conversa.' },
              ],
              max_tokens: 200,
              temperature: 0.3,
            }, aiConfig)),
          });
          if (retryResp.ok) {
            const retryData = await retryResp.json();
            await recordAIUsage(supabase, orgIdForRouting, aiConfig, 'content_generation', retryData?.usage, 'webchat-bot:degenerate_retry');
            const cand = retryData.choices?.[0]?.message?.content?.trim() || '';
            if (cand && !detectDegenerateRepetition(cand)) rescued = cand;
          }
        } catch (retryErr) {
          console.error('[webchat-bot] degenerate retry failed:', retryErr);
        }

        responseContent = rescued
          || body.agent_config?.fallback_message
          || 'Só um instante, já te respondo por aqui.';
      }

      // Se sobrou vazio depois da limpeza, usa fallback para não enviar em branco.
      if (!responseContent.trim()) {
        responseContent = body.agent_config?.fallback_message
          || 'Deixa eu confirmar uma coisa aqui e já te respondo.';
      }
    }


    // Check if chunked messages are enabled
    const chunkedEnabled = body.agent_config.chunked_messages_enabled !== false;

    // Test mode - return without saving
    if (body.is_test) {
      const messageType = responseButtons ? 'buttons' : (responseVideoUrl ? 'video' : 'text');
      
      return new Response(
        JSON.stringify({ 
          message: { 
            content: responseContent,
            message_type: messageType,
            buttons: responseButtons,
            video_url: responseVideoUrl,
          },
          response: responseContent,
          buttons: responseButtons,
          video_url: responseVideoUrl,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine message type
    const messageType = responseButtons ? 'buttons' : (responseVideoUrl ? 'video' : 'text');

    // For WhatsApp (and other chunked-delivery channels), DON'T save the full
    // response upfront. The orchestrator (e.g. evolution-webhook) will save
    // one row per chunk so the Inbox mirrors exactly what the lead sees.
    const incomingChannel = String((body as any).channel || 'webchat').toLowerCase();
    const skipFullPersist =
      incomingChannel === 'whatsapp' &&
      (body.agent_config.chunked_messages_enabled !== false) &&
      !responseButtons;

    let botMessage: any = null;
    if (!skipFullPersist) {
      const { data: saved, error: msgError } = await supabase
        .from('webchat_messages')
        .insert({
          conversation_id: body.conversation_id,
          direction: 'outbound',
          sender_type: 'bot',
          content: responseContent,
          message_type: messageType,
          buttons: responseButtons,
          video_url: responseVideoUrl,
          metadata: schedulingMetadata || null,
        })
        .select()
        .single();

      if (msgError) {
        console.error('Error saving bot message:', msgError);
        return new Response(
          JSON.stringify({ error: 'Failed to save bot response' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      botMessage = saved;
    }

    // Return with chunked info for widget to process
    if (chunkedEnabled && !responseButtons) {
      // Apply humanization (style + smart splitting + delays) using the agent config.
      const humanCfg = (activeAgent as any)?.humanization as HumanizationConfig | undefined;
      const channel = ((body as any).channel || 'webchat') as HumanizationChannel;
      const humanResult = humanCfg && humanCfg.enabled !== false
        ? humanize(responseContent, humanCfg, channel)
        : {
            bubbles: splitIntoChunks(responseContent),
            firstDelayMs: 0,
            betweenDelaysMs: [] as number[],
            typingMsPerBubble: [] as number[],
            typingIndicator: true,
            postponeUntil: null,
          };

      // ============================================================
      // CAP de bolhas — respeita config do agente (humanization.splitting.max_bubbles)
      // com teto absoluto de 4 para WhatsApp (anti-spam / queima de número).
      // Não colapsa abaixo do que o humanizer decidiu naturalmente.
      // ============================================================
      const normalizedChannel = String(channel).toLowerCase();
      const isWhatsApp = normalizedChannel === 'whatsapp';
      const isInstagram = normalizedChannel === 'instagram';
      let bubbles: string[] = Array.isArray(humanResult.bubbles) ? humanResult.bubbles.filter(b => typeof b === 'string' && b.trim().length > 0) : [];
      let between: number[] = Array.isArray(humanResult.betweenDelaysMs) ? [...humanResult.betweenDelaysMs] : [];
      let typingMs: number[] = Array.isArray(humanResult.typingMsPerBubble) ? [...humanResult.typingMsPerBubble] : [];

      if (isWhatsApp && bubbles.length > 0) {
        const cfgMax = Math.min(4, Math.max(1, Number((humanCfg as any)?.splitting?.max_bubbles ?? 3)));
        const MAX_BUBBLES = cfgMax;
        if (bubbles.length > MAX_BUBBLES) {
          const head = bubbles.slice(0, MAX_BUBBLES - 1);
          const tail = bubbles.slice(MAX_BUBBLES - 1).join('\n\n').trim();
          bubbles = MAX_BUBBLES === 1 ? [bubbles.join('\n\n').trim()] : [...head, tail];
          between = between.slice(0, Math.max(0, MAX_BUBBLES - 1));
          while (between.length < MAX_BUBBLES - 1) between.push(1200);
          if (typingMs.length > MAX_BUBBLES) {
            const headTyping = typingMs.slice(0, MAX_BUBBLES - 1);
            const tailTyping = typingMs.slice(MAX_BUBBLES - 1).reduce((a, b) => a + b, 0);
            typingMs = [...headTyping, tailTyping];
          }
          console.log('[webchat-bot] whatsapp cap: bubbles=', bubbles.length, '(max=', MAX_BUBBLES, ')');
        }
        // Clamp between delays: 800ms..4000ms para naturalidade
        between = between.map((n) => Math.min(4000, Math.max(800, Number(n) || 1200)));
      }
      if (isInstagram && bubbles.length > 2) {
        bubbles = [bubbles[0], bubbles.slice(1).join('\n\n').trim()];
        between = [Math.min(2500, Math.max(900, Number(between[0]) || 1200))];
        typingMs = typingMs.length > 0
          ? [typingMs[0], typingMs.slice(1).reduce((total, value) => total + value, 0)]
          : [];
        console.log('[webchat-bot] instagram cap: bubbles=', bubbles.length, '(max=2)');
      }

      // Última barreira imediatamente antes de devolver as bolhas ao webhook.
      // Protege também contra qualquer transformação futura do humanizer.
      const finalBubbleGuard = guardOutboundUrls(bubbles.join('\n\n'), approvedUrlsForResponse);
      if (finalBubbleGuard.blocked.length > 0) {
        console.warn('[webchat-bot] blocked unapproved URL after humanization:', finalBubbleGuard.blocked);
        bubbles = [finalBubbleGuard.text];
        between = [];
        typingMs = typingMs.length > 0 ? [typingMs[0]] : [];
      }

      return new Response(
        JSON.stringify({
          message: botMessage,
          chunked: true,
          chunks: bubbles,
          delays: {
            firstMs: humanResult.firstDelayMs,
            betweenMs: between,
          },
          typingMs,
          typingIndicator: humanResult.typingIndicator,
          postponeUntil: humanResult.postponeUntil,
          metadata: schedulingMetadata || null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        message: botMessage,
        buttons: responseButtons,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in webchat-bot:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Map CTA type to button type
function mapCTATypeToButtonType(ctaType: string): 'url' | 'whatsapp' | 'callback' | 'calendar' {
  switch (ctaType) {
    case 'whatsapp':
      return 'whatsapp';
    case 'callback':
      return 'callback';
    case 'calendar':
      return 'calendar';
    default:
      return 'url';
  }
}

// Get button action based on CTA type
function getButtonAction(cta: ProductCTA): string {
  if (cta.cta_type === 'whatsapp') {
    return cta.whatsapp_number || '';
  }
  return cta.action_url || '';
}

// Split response into natural chunks for typing effect
// Defesa em profundidade: mesmo após sanitizeAgentOutput, se um chunk isolado
// ainda parecer um vazamento de tool_call (JSON quebrado, chaves órfãs), a
// gente descarta antes de mandar para o Evolution/Meta.
const LEAK_CHUNK_GUARD = /(^[\s{}\[\]"]*$)|"action"\s*:|"action_input"\s*:|"arguments"\s*:\s*\{|funcall\s*:|default_api\s*[.:]/i;

function splitIntoChunks(text: string): string[] {
  if (!text || text.length < 50) return [text];

  // Split by sentence endings, questions, or exclamations
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());

  let chunks: string[];
  if (sentences.length <= 1) {
    const parts = text.split(/\n+/).filter(s => s.trim());
    chunks = parts.length > 1 ? parts : [text];
  } else {
    chunks = [];
    let current = '';
    for (const sentence of sentences) {
      if (current.length + sentence.length < 80) {
        current += (current ? ' ' : '') + sentence;
      } else {
        if (current) chunks.push(current);
        current = sentence;
      }
    }
    if (current) chunks.push(current);
    chunks = chunks.slice(0, 4); // Max 4 chunks
  }

  // Filtra chunks que sobraram só com resíduo de tool_call.
  const safe = chunks.filter((c) => {
    const trimmed = c.trim();
    if (!trimmed) return false;
    if (LEAK_CHUNK_GUARD.test(trimmed)) {
      console.warn('[webchat-bot] blocked chunk with leaked tool_call residue:', trimmed.slice(0, 120));
      return false;
    }
    return true;
  });

  return safe.length > 0 ? safe : [text.replace(LEAK_CHUNK_GUARD, '').trim() || ''];
}

// Get persona instructions
function getPersonaInstructions(style: string): string {
  switch (style) {
    case 'professional':
      return '🎩 TOM: Seja formal, objetivo e técnico. Use linguagem corporativa. Transmita autoridade e conhecimento.';
    case 'casual':
      return '😎 TOM: Seja descontraído e informal. Use linguagem leve, gírias quando apropriado, e seja próximo do cliente.';
    case 'friendly':
    default:
      return '😊 TOM: Seja amigável, acolhedor e prestativo. Equilíbrio entre profissional e descontraído. Crie conexão genuína.';
  }
}

// Interface for permission overrides
interface PermissionOverrides {
  can_do?: string[];
  cannot_do?: string[];
  handoff_triggers?: string[];
  context?: string;
}

type AgentContextMode = 'economy' | 'balanced' | 'complete';
type AgentAISettings = {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  context_mode: AgentContextMode;
};

function getAgentAISettings(agent: ProductAgent | null): AgentAISettings {
  const raw = agent?.tool_configs?.ai;
  const mode = raw?.context_mode;
  return {
    model: typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : undefined,
    temperature: Number.isFinite(raw?.temperature) ? Math.max(0, Math.min(1, Number(raw.temperature))) : undefined,
    max_tokens: Number.isFinite(raw?.max_tokens) ? Math.max(200, Math.min(1200, Number(raw.max_tokens))) : undefined,
    reasoning_effort: ['minimal', 'low', 'medium', 'high'].includes(raw?.reasoning_effort)
      ? raw.reasoning_effort
      : undefined,
    context_mode: mode === 'economy' || mode === 'complete' ? mode : 'balanced',
  };
}

function queryTerms(query: string): string[] {
  return [...new Set(
    String(query || '')
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3),
  )].slice(0, 18);
}

function rankByQuery<T>(items: T[], query: string, toText: (item: T) => string): T[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return items;
  return items
    .map((item, index) => {
      const haystack = toText(item)
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { item, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
}

function compactLongInstruction(text: string, query: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  const introChars = Math.min(3500, Math.floor(maxChars * 0.35));
  const intro = text.slice(0, introChars);
  const sections = text.slice(introChars).split(/\n{2,}/).filter(Boolean);
  const ranked = rankByQuery(sections, query, (section) => section);
  let used = intro.length;
  const selected: string[] = [];
  for (const section of ranked) {
    if (used >= maxChars) break;
    const available = maxChars - used;
    selected.push(section.slice(0, available));
    used += Math.min(section.length, available) + 2;
  }
  return `${intro}\n\n${selected.join('\n\n')}`.slice(0, maxChars);
}

function optimizeConversationHistory(
  history: Array<{ role: string; content: string }>,
  mode: AgentContextMode,
): Array<{ role: string; content: string }> {
  const limits: Record<AgentContextMode, number> = { economy: 10, balanced: 16, complete: 20 };
  const digest = history.find((message) => message.role === 'system');
  const recent = history.filter((message) => message.role !== 'system').slice(-limits[mode]);
  return digest ? [digest, ...recent] : recent;
}

// Build system prompt based on product agent configuration with optional overrides
function buildAgentSystemPrompt(
  agent: ProductAgent, 
  visitorName: string,
  overrides?: PermissionOverrides,
  currentMessage = '',
  contextMode: AgentContextMode = 'balanced',
): string {
  const typeLabel = AGENT_TYPE_LABELS[agent.agent_type] || agent.agent_type;
  
  let prompt = `IDENTIDADE: Você é ${agent.name}, agente de ${typeLabel}.\n\n`;
  
  // Primary objective
  prompt += `OBJETIVO PRINCIPAL:\n${agent.primary_objective}\n\n`;
  
  // Tone of voice
  const toneInstructions: Record<string, string> = {
    formal: 'Seja formal, objetivo e profissional. Use linguagem corporativa e transmita autoridade.',
    consultive: 'Seja consultivo, demonstrando expertise e conduzindo o cliente com confiança. Faça perguntas estratégicas.',
    friendly: 'Seja amigável, acolhedor e próximo. Crie conexão genuína sem ser artificial.',
    technical: 'Seja técnico, preciso e detalhista. Use termos apropriados ao contexto.',
  };
  prompt += `TOM DE VOZ: ${toneInstructions[agent.tone_style] || toneInstructions.friendly}\n\n`;

  // Regras adicionais para evitar bugs reais que apareceram em conversas (Maria → leads).
  prompt += `🚫 NUNCA reconheça verbalmente bugs, falhas, repetição de mensagem ou que o sinal "travou". Se algo parecer estranho, ignore e siga.\n`;
  prompt += `🚫 NUNCA se apresente de novo se já se apresentou nesta conversa.\n`;
  if (agent.agent_type === 'sdr') {
    prompt += `🎯 VOCÊ É SDR: NÃO vende, NÃO faz pitch de produto, NÃO explica detalhes técnicos. Seu papel é qualificar e levar pro próximo passo (grupo, live, agendamento, closer).\n`;
    prompt += `🎯 Se o lead JÁ realizou a CTA (entrou no grupo, agendou, comprou), PARE de qualificar e PARE de fazer perguntas novas — só reforce o próximo passo.\n`;
  }
  prompt += `📱 Estilo WhatsApp: frases curtas terminadas em ".", "?" ou "!". Cada ideia em uma frase. NUNCA mande parágrafo gigante.\n`;
  prompt += `🚨 TRAVA ANTI-SPAM (OBRIGATÓRIA): O lead pode mandar várias mensagens seguidas — você as recebe AGRUPADAS em um único bloco. Responda UMA ÚNICA VEZ, em UMA mensagem só, considerando TUDO que ele disse. NUNCA gere múltiplas respostas separadas, NUNCA reaja mensagem por mensagem. Resposta curta (até ~500 caracteres), pontual, certeira, com no máximo 1 pergunta no final. Se for absolutamente necessário dividir, no MÁXIMO 2 mensagens — nunca 3 ou mais.\n\n`;

  // CRITICAL: Anti-repetition and context awareness rules
  prompt += `═══════════════════════════════════════
REGRAS CRÍTICAS DE COMPORTAMENTO (OBRIGATÓRIAS)
═══════════════════════════════════════

1. ANALISE o histórico COMPLETO antes de CADA resposta
2. NUNCA repita saudações, frases ou emojis já usados no histórico
3. Se já realizou uma ação (agendou reunião, coletou dados, enviou email), NÃO repita nem ofereça novamente
4. Adapte seu estilo baseado nas respostas e humor do cliente
5. CADA mensagem deve PROGREDIR a conversa — nunca retroceda a pontos já cobertos
6. Máximo 1 emoji por mensagem, NUNCA o mesmo emoji em mensagens consecutivas

FRASES ABSOLUTAMENTE PROIBIDAS:
- "Tudo ótimo por aqui"
- "Fechar com chave de ouro"
- "Fico à disposição"
- "Sem problemas"
- "Fique à vontade"
- "Com certeza!"
- "Perfeito!"
- Qualquer frase ou saudação que já apareceu nesta conversa

VARIAÇÃO OBRIGATÓRIA:
- Alterne entre perguntas diretas, observações estratégicas e provocações construtivas
- Varie a estrutura das mensagens (não use sempre o mesmo padrão)
- Use o nome do cliente de forma natural (não em toda mensagem, a cada 2-3 msgs)
- Adapte o tom: se o cliente é direto, seja direto; se é detalhista, explore

TÉCNICA CONSULTIVA:
1. Descubra a DOR real antes de apresentar qualquer solução
2. Faça perguntas ABERTAS que revelam necessidades (não perguntas de sim/não)
3. Conecte benefícios ESPECÍFICOS às dores ESPECÍFICAS mencionadas pelo cliente
4. Crie urgência baseada na REALIDADE do cliente, não urgência artificial
5. Progrida naturalmente: Situação → Problema → Implicação → Solução → Ação

FONTE DAS RESPOSTAS (REGRA MAIS IMPORTANTE):
- TODAS as suas respostas DEVEM ser baseadas EXCLUSIVAMENTE no conhecimento fornecido (Cérebro do Produto + Treinamento)
- Se a informação não estiver na base de conhecimento, DIGA que vai verificar — NUNCA invente
- Use dados, números e fatos EXATOS da base — não generalize nem parafraseie de forma vaga
- Quando o cliente perguntar algo coberto pelo FAQ ou base de conhecimento, cite os dados reais

CONTINUIDADE PÓS-TRANSFERÊNCIA:
- Se o histórico mostrar que outro agente já estava conversando com o lead, você ASSUMIU a conversa: NÃO se reapresente novamente, NÃO repita perguntas já feitas, NÃO peça dados que o lead já forneceu
- Reconheça brevemente o contexto anterior ("vi que vocês estavam falando sobre X") e siga com o próximo passo natural
- Se já houver uma mensagem automática de saudação sua no histórico, vá DIRETO ao assunto

NUNCA AJA COMO SUPORTE (a menos que seu agent_type seja explicitamente "support"):
- Você NUNCA pede CPF, número de pedido, "motivo do seu contato" ou age como atendente de SAC/suporte técnico
- Se o objetivo principal menciona "transferir pra suporte", isso é uma INSTRUÇÃO DE ROTEAMENTO, não um exemplo de fala — não copie esse tom
- Se o lead pedir suporte explicitamente E for um cliente atual com problema técnico, use a tool transfer_to_human ou transfer_to_agent (nunca finja ser suporte)
- Para qualquer outra intenção (compra, dúvida comercial, agendamento), siga seu papel de vendas/SDR normalmente

═══════════════════════════════════════\n\n`;

  // Apply overrides - merge with agent defaults
  const effectiveCanDo = [
    ...(agent.can_do || []),
    ...(overrides?.can_do || [])
  ];
  
  const effectiveCannotDo = [
    ...(agent.cannot_do || []),
    ...(overrides?.cannot_do || [])
  ];
  
  const effectiveHandoffTriggers = [
    ...(agent.handoff_triggers || []),
    ...(overrides?.handoff_triggers || [])
  ];
  
  // What the agent can do (with overrides)
  if (effectiveCanDo.length > 0) {
    prompt += `✅ VOCÊ PODE:\n${effectiveCanDo.map(c => `- ${c}`).join('\n')}\n\n`;
  }
  
  // What the agent cannot do (with overrides)
  if (effectiveCannotDo.length > 0) {
    prompt += `❌ VOCÊ NÃO PODE:\n${effectiveCannotDo.map(c => `- ${c}`).join('\n')}\n\n`;
  }
  
  // When to hand off to human (with overrides)
  if (effectiveHandoffTriggers.length > 0) {
    prompt += `🙋 TRANSFIRA PARA HUMANO QUANDO:\n${effectiveHandoffTriggers.map(t => `- ${t}`).join('\n')}\n\n`;
  }
  
  // Required phrases
  if (agent.required_phrases && agent.required_phrases.length > 0) {
    prompt += `📝 INCLUA SEMPRE: ${agent.required_phrases.join(', ')}\n\n`;
  }
  
  // Prohibited phrases - merge with built-in blacklist
  const allProhibited = [
    ...(agent.prohibited_phrases || []),
    'Tudo ótimo por aqui',
    'Fechar com chave de ouro', 
    'Fico à disposição',
    'Sem problemas',
  ];
  const uniqueProhibited = [...new Set(allProhibited)];
  prompt += `🚫 NUNCA USE: ${uniqueProhibited.join(', ')}\n\n`;
  
  // Additional prompt
  if (agent.additional_prompt) {
    const additionalLimits: Record<AgentContextMode, number> = {
      economy: 8000,
      balanced: 14000,
      complete: 26000,
    };
    const compacted = compactLongInstruction(agent.additional_prompt, currentMessage, additionalLimits[contextMode]);
    prompt += `📌 INSTRUÇÕES ADICIONAIS:\n${compacted}\n\n`;
  }

  // Support agent: inject curated links + quick answers from tool_configs
  if (agent.agent_type === 'support') {
    const tc = (agent as any).tool_configs || {};
    const links = Array.isArray(tc.support_links) ? tc.support_links : [];
    const quick = Array.isArray(tc.support_quick_answers) ? tc.support_quick_answers : [];
    if (links.length > 0) {
      prompt += `🔗 LINKS OFICIAIS DE SUPORTE (use APENAS estes — não invente URLs):\n`;
      links.forEach((l: any) => {
        if (l?.title && l?.url) {
          prompt += `- ${l.title}: ${l.url}${l.description ? ` — ${l.description}` : ''}\n`;
        }
      });
      prompt += '\n';
    }
    if (quick.length > 0) {
      prompt += `💡 RESPOSTAS RÁPIDAS OFICIAIS (use EXATAMENTE quando a pergunta coincidir):\n`;
      quick.forEach((q: any) => {
        if (q?.question && q?.answer) {
          prompt += `\nP: ${q.question}\nR: ${q.answer}\n`;
        }
      });
      prompt += '\n';
    }
  }

  // Context override from flow
  if (overrides?.context) {
    prompt += `📌 CONTEXTO ADICIONAL NESTE MOMENTO:\n${overrides.context}\n\n`;
  }
  
  // Visitor name context
  if (visitorName) {
    prompt += `👤 CLIENTE: ${visitorName}\n- Use o nome de forma natural (não em toda mensagem)\n\n`;
  }
  
  // Message style
  const messageLength: Record<string, string> = {
    short: '2 linhas',
    balanced: '3-4 linhas',
    detailed: '5-6 linhas',
  };
  prompt += `⚠️ FORMATO: Mensagens de no máximo ${messageLength[agent.message_style] || '3-4 linhas'}.`;
  prompt += ' ANTES de responder, releia o histórico e verifique se não está repetindo nada.';
  
  if (agent.always_end_with_question) {
    prompt += ' SEMPRE termine com uma pergunta que AVANÇA a conversa para o objetivo.';
  }
  
  return prompt;
}

// Fetch product brain knowledge
async function fetchProductBrain(
  supabase: any,
  productId: string,
  query = '',
  contextMode: AgentContextMode = 'balanced',
): Promise<string | null> {
  try {
    const { data: product } = await supabase
      .from('products')
      .select('name, description, pitch_15s, pitch_30s, pitch_2min, icp, differentials')
      .eq('id', productId)
      .single() as { data: Product | null };

    const { data: sources } = await supabase
      .from('product_knowledge_sources')
      .select('source_type, title, extracted_content, transcript, question, answer')
      .eq('product_id', productId)
      .eq('is_active', true)
      .eq('processing_status', 'completed') as { data: KnowledgeSource[] | null };

    const { data: objections } = await supabase
      .from('objections')
      .select('what_they_say, suggested_response')
      .eq('product_id', productId) as { data: Objection[] | null };

    if (!product && !sources?.length && !objections?.length) {
      return null;
    }

    let context = '\n\n=== 🧠 CONHECIMENTO DO PRODUTO (RESPONDA COM BASE NESTES DADOS) ===';

    if (product) {
      context += `\n\n📦 SOBRE O PRODUTO:`;
      context += `\nNome: ${product.name}`;
      if (product.description) context += `\nDescrição: ${product.description}`;
      if (product.pitch_15s) context += `\n⚡ Pitch rápido: ${product.pitch_15s}`;
      if (product.pitch_30s) context += `\n💡 Pitch médio: ${product.pitch_30s}`;
      if (product.icp) context += `\n🎯 Cliente ideal: ${product.icp}`;
      if (product.differentials?.length) {
        context += `\n✨ Diferenciais: ${product.differentials.join(', ')}`;
      }
    }

    if (sources && sources.length > 0) {
      context += '\n\n📚 BASE DE CONHECIMENTO (USE ESTAS INFORMAÇÕES PARA RESPONDER):';
      const budgets: Record<AgentContextMode, { limit: number; chars: number }> = {
        economy: { limit: 4, chars: 1800 },
        balanced: { limit: 7, chars: 3000 },
        complete: { limit: 10, chars: 5000 },
      };
      const budget = budgets[contextMode];
      const rankedSources = rankByQuery(sources, query, (source) =>
        `${source.title} ${source.question || ''} ${source.answer || ''} ${source.extracted_content || ''} ${source.transcript || ''}`,
      );
      
      for (const source of rankedSources.slice(0, budget.limit)) {
        let content = '';
        
        if (source.source_type === 'faq' && source.question && source.answer) {
          content = `P: ${source.question}\nR: ${source.answer}`;
        } else if (source.source_type === 'youtube' && source.transcript) {
          content = source.transcript.substring(0, budget.chars);
        } else if (source.extracted_content) {
          content = source.extracted_content.substring(0, budget.chars);
        }
        
        if (content) {
          context += `\n\n[${source.title}]:\n${content}`;
        }
      }
    }

    if (objections && objections.length > 0) {
      context += '\n\n🛡️ CONTORNO DE OBJEÇÕES (USE estas respostas quando o cliente levantar objeções):';
      const objectionLimit: Record<AgentContextMode, number> = { economy: 5, balanced: 8, complete: 12 };
      const rankedObjections = rankByQuery(objections, query, (obj) => `${obj.what_they_say} ${obj.suggested_response}`);
      for (const obj of rankedObjections.slice(0, objectionLimit[contextMode])) {
        context += `\n\n❌ Objeção: "${obj.what_they_say}"`;
        context += `\n✅ Resposta: ${obj.suggested_response}`;
      }
    }

    return context;
  } catch (error) {
    console.error('Error fetching product brain:', error);
    return null;
  }
}

// Fetch sales training materials - SUPPORTS BOTH PRODUCT AND AGENT-SPECIFIC MATERIALS
async function fetchTrainingMaterials(
  supabase: any, 
  productId: string,
  agentId?: string,
  query = '',
  contextMode: AgentContextMode = 'balanced',
): Promise<string | null> {
  try {
    // 1. Fetch product-level materials (agent_id is NULL) - used by all agents
    const { data: productMaterials } = await supabase
      .from('agent_training_materials')
      .select('title, category, extracted_content')
      .eq('product_id', productId)
      .is('agent_id', null)
      .eq('is_active', true)
      .eq('processing_status', 'completed')
      .limit(10) as { data: TrainingMaterial[] | null };

    // 2. Fetch agent-specific materials if agentId is provided
    let agentMaterials: TrainingMaterial[] = [];
    if (agentId) {
      const { data } = await supabase
        .from('agent_training_materials')
        .select('title, category, extracted_content')
        .eq('agent_id', agentId)
        .eq('is_active', true)
        .eq('processing_status', 'completed')
        .limit(10) as { data: TrainingMaterial[] | null };
      
      agentMaterials = data || [];
      console.log('[webchat-bot] Agent-specific materials found:', agentMaterials.length);
    }

    // Combine both sources
    const allMaterials = rankByQuery(
      [...(productMaterials || []), ...agentMaterials],
      query,
      (material) => `${material.title} ${material.category} ${material.extracted_content || ''}`,
    );
    
    if (allMaterials.length === 0) return null;

    let context = '\n\n=== 📖 BASE DE CONHECIMENTO DO AGENTE (USE ESTAS INFORMAÇÕES NAS RESPOSTAS) ===';
    
    const budgets: Record<AgentContextMode, { limit: number; chars: number }> = {
      economy: { limit: 4, chars: 1800 },
      balanced: { limit: 7, chars: 3000 },
      complete: { limit: 10, chars: 6000 },
    };
    const budget = budgets[contextMode];
    for (const material of allMaterials.slice(0, budget.limit)) {
      if (material.extracted_content) {
        const categoryLabel = getCategoryLabel(material.category);
        context += `\n\n[${categoryLabel}: ${material.title}]:\n${material.extracted_content.substring(0, budget.chars)}`;
      }
    }

    return context;
  } catch (error) {
    console.error('Error fetching training materials:', error);
    return null;
  }
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    'sales_techniques': '🎯 Técnicas de Vendas',
    'communication': '💬 Comunicação',
    'objections': '🛡️ Objeções',
    'closing': '✅ Fechamento',
    'prospecting': '🔍 Prospecção',
    'negotiation': '🤝 Negociação',
    'general': '📋 Geral'
  };
  return labels[category] || '📋 Geral';
}

// FAQ matching
function findFAQMatch(
  message: string,
  faq: Array<{ question: string; answer: string }> | null
): string | null {
  if (!faq || faq.length === 0) return null;

  const messageLower = message.toLowerCase().trim();
  
  for (const item of faq) {
    const questionLower = item.question.toLowerCase();
    
    if (messageLower === questionLower) {
      return item.answer;
    }
    
    const questionWords = questionLower.split(' ').filter(w => w.length > 3);
    const matchingWords = questionWords.filter(word => messageLower.includes(word));
    
    if (matchingWords.length >= questionWords.length * 0.6) {
      return item.answer;
    }
  }
  
  return null;
}

// Sincroniza variáveis capturadas no fluxo (name, phone, email, etc.) para o lead vinculado.
// Campos conhecidos vão direto na coluna do lead; demais entram em custom_fields.
async function syncFlowVarsToLead(
  supabase: any,
  conversationId: string,
  flowVariables: Record<string, string>,
  options?: { onlyKeys?: string[] }
): Promise<void> {
  try {
    const { data: conv } = await supabase
      .from('webchat_conversations')
      .select('lead_id, organization_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conv?.lead_id) return;

    const KNOWN: Record<string, string> = {
      name: 'name', nome: 'name', full_name: 'name',
      email: 'email', 'e-mail': 'email',
      phone: 'phone', telefone: 'phone', whatsapp: 'phone', celular: 'phone',
      company: 'company', empresa: 'company',
      cpf: 'cpf', cnpj: 'cnpj',
    };

    const update: Record<string, any> = {};
    const customFields: Record<string, any> = {};
    let hasCustom = false;

    const entries = Object.entries(flowVariables).filter(([k, v]) => {
      if (k.startsWith('__')) return false;
      if (v == null || String(v).trim() === '') return false;
      if (options?.onlyKeys && !options.onlyKeys.includes(k)) return false;
      return true;
    });

    for (const [rawKey, rawValue] of entries) {
      const key = rawKey.toLowerCase();
      const value = String(rawValue).trim();
      const mapped = KNOWN[key];
      if (mapped) {
        update[mapped] = value;
        if (mapped === 'phone') update.phone_normalized = value.replace(/\D/g, '');
      } else {
        customFields[rawKey] = value;
        hasCustom = true;
      }
    }

    if (Object.keys(update).length === 0 && !hasCustom) return;

    if (hasCustom) {
      const { data: leadRow } = await supabase
        .from('leads')
        .select('custom_fields')
        .eq('id', conv.lead_id)
        .maybeSingle();
      update.custom_fields = { ...(leadRow?.custom_fields || {}), ...customFields };
    }

    await supabase.from('leads').update(update).eq('id', conv.lead_id);
    console.log('[syncFlowVarsToLead] Lead atualizado:', conv.lead_id, Object.keys(update));
  } catch (e) {
    console.error('[syncFlowVarsToLead] erro (não-fatal):', e);
  }
}

// Avalia condicional simples do bloco condition contra flow_variables
function evaluateCondition(
  cond: { variable?: string; operator?: string; value?: any } | undefined,
  vars: Record<string, string>
): boolean {
  if (!cond?.variable || !cond.operator) return false;
  const left = String(vars[cond.variable] ?? '').toLowerCase();
  const right = String(cond.value ?? '').toLowerCase();
  switch (cond.operator) {
    case 'equals': return left === right;
    case 'not_equals': return left !== right;
    case 'contains': return left.includes(right);
    case 'greater_than': return Number(left) > Number(right);
    case 'less_than': return Number(left) < Number(right);
    default: return false;
  }
}

// Execute flow block and determine next action
async function executeFlowBlock(
  supabase: any,
  conversationId: string,
  userMessage: string,
  flowContext: {
    current_flow_id: string | null;
    current_block_id: string | null;
    flow_variables: Record<string, string>;
    flow_completed: boolean;
  },
  productId?: string
): Promise<{
  message?: any;
  flow_update?: {
    current_block_id: string | null;
    flow_variables: Record<string, string>;
    flow_completed: boolean;
  };
  buttons?: any[];
  video_url?: string;
  action?: string;
  action_data?: {
    url?: string;
    open_in_new_tab?: boolean;
    number?: string;
    message?: string;
  };
}> {
  try {
    // Fetch the flow
    const { data: flowData, error: flowError } = await supabase
      .from('chat_flows')
      .select('*')
      .eq('id', flowContext.current_flow_id)
      .single();

    if (flowError || !flowData) {
      console.error('[executeFlowBlock] Flow not found:', flowError);
      return { flow_update: { ...flowContext, flow_completed: true } };
    }

    const flow: ChatFlow = {
      id: flowData.id,
      blocks: flowData.blocks || [],
      start_block_id: flowData.start_block_id,
      collected_variables: flowData.collected_variables || [],
    };

    const currentBlock = flow.blocks.find((b: FlowBlock) => b.id === flowContext.current_block_id);
    
    if (!currentBlock) {
      console.error('[executeFlowBlock] Block not found:', flowContext.current_block_id);
      return { flow_update: { ...flowContext, flow_completed: true } };
    }

    let responseContent = '';
    let nextBlockId: string | null = currentBlock.next_block_id || null;
    let flowVariables = { ...flowContext.flow_variables };
    let flowCompleted = false;
    let responseButtons: any[] | undefined;
    let responseVideoUrl: string | undefined;
    let messageType = 'text';

    switch (currentBlock.type) {
      case 'message':
        responseContent = currentBlock.data.content || '';
        break;

      case 'input':
        // User's message is the input value - save it to flow variables
        if (currentBlock.data.variable_name) {
          flowVariables[currentBlock.data.variable_name] = userMessage;
          console.log('[executeFlowBlock] Saved variable:', currentBlock.data.variable_name, '=', userMessage);
          // Sincroniza imediatamente no lead vinculado (name/phone/email/...)
          await syncFlowVarsToLead(supabase, conversationId, flowVariables, {
            onlyKeys: [currentBlock.data.variable_name],
          });
        }
        
        // Move to next block - we need to execute it immediately
        if (nextBlockId) {
          const nextBlock = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
          if (nextBlock) {
            // Execute next block
            return executeNextBlock(supabase, conversationId, flow, nextBlock, flowVariables);
          }
        }
        break;

      case 'buttons':
        // Check if user clicked a button (message matches button label or ID)
        const clickedButton = currentBlock.data.buttons?.find(
          (btn: FlowBlockButton) => btn.label.toLowerCase() === userMessage.toLowerCase() || btn.id === userMessage
        );
        
        if (clickedButton) {
          // Process button action based on action_type
          const actionType = clickedButton.action_type || 'next_block';
          
          switch (actionType) {
            case 'next_block':
              // User clicked a button, move to the button's target
              nextBlockId = clickedButton.next_block_id;
              if (nextBlockId) {
                const nextBlock = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
                if (nextBlock) {
                  return executeNextBlock(supabase, conversationId, flow, nextBlock, flowVariables);
                }
              }
              break;
              
            case 'url':
              // Return action for widget to open URL
              return {
                message: null,
                action: 'open_url',
                action_data: {
                  url: clickedButton.url || '',
                  open_in_new_tab: clickedButton.open_in_new_tab !== false,
                },
                flow_update: {
                  current_block_id: currentBlock.id,
                  flow_variables: flowVariables,
                  flow_completed: false,
                },
              };
              
            case 'whatsapp':
              // Return action for widget to open WhatsApp
              return {
                message: null,
                action: 'open_whatsapp',
                action_data: {
                  number: clickedButton.whatsapp_number || '',
                  message: clickedButton.whatsapp_message || '',
                },
                flow_update: {
                  current_block_id: currentBlock.id,
                  flow_variables: flowVariables,
                  flow_completed: false,
                },
              };
              
            case 'ai_takeover':
              // AI takes over the conversation
              flowCompleted = true;
              
              // Store AI context if provided
              if (clickedButton.ai_context) {
                flowVariables['__ai_context'] = clickedButton.ai_context;
              }
              
              // Update conversation state
              await supabase
                .from('webchat_conversations')
                .update({
                  current_block_id: null,
                  flow_variables: flowVariables,
                  flow_completed: true,
                })
                .eq('id', conversationId);
              
              console.log('[executeFlowBlock] AI takeover via button, context:', clickedButton.ai_context);
              
              return {
                message: null,
                flow_update: {
                  current_block_id: null,
                  flow_variables: flowVariables,
                  flow_completed: true,
                },
              };
              
            case 'handoff':
              // Transfer to human agent
              flowCompleted = true;
              responseContent = 'Vou transferir você para um atendente. Aguarde um momento!';
              
              // Update conversation status — IA larga o lead, vai para fila do setor
              await supabase
                .from('webchat_conversations')
                .update({ 
                  status: 'waiting_human',
                  current_block_id: null,
                  flow_completed: true,
                  current_agent_id: null,
                  assigned_user_id: null,
                  needs_human: true,
                })
                .eq('id', conversationId);
              
              // Save message
              const { data: handoffMsg } = await supabase
                .from('webchat_messages')
                .insert({
                  conversation_id: conversationId,
                  direction: 'outbound',
                  sender_type: 'bot',
                  content: responseContent,
                  message_type: 'text',
                })
                .select()
                .single();
              
              return {
                message: handoffMsg,
                flow_update: {
                  current_block_id: null,
                  flow_variables: flowVariables,
                  flow_completed: true,
                },
              };
          }
        } else {
          // Show buttons again
          responseContent = currentBlock.data.content || 'Escolha uma opção:';
          messageType = 'buttons';
          responseButtons = currentBlock.data.buttons?.map((btn: FlowBlockButton, index: number) => ({
            id: btn.id,
            label: `${btn.emoji || ''} ${btn.label}`.trim(),
            type: btn.action_type === 'url' ? 'url' : 
                  btn.action_type === 'whatsapp' ? 'whatsapp' : 'flow_button',
            action: btn.action_type === 'url' ? btn.url : 
                    btn.action_type === 'whatsapp' ? btn.whatsapp_number : btn.id,
            style: index === 0 ? 'primary' : 'secondary',
            cta_type: btn.action_type || 'flow',
            action_type: btn.action_type || 'next_block',
            whatsapp_message: btn.whatsapp_message,
            open_in_new_tab: btn.open_in_new_tab,
          }));
        }
        break;

      case 'ai_takeover':
        // AI takes over the conversation
        flowCompleted = true;
        
        // Se o bloco tem agente específico, usar ele
        if (currentBlock.data.agent_id) {
          await supabase
            .from('webchat_conversations')
            .update({ current_agent_id: currentBlock.data.agent_id })
            .eq('id', conversationId);
          
          flowVariables['__current_agent_id'] = currentBlock.data.agent_id;
          console.log('[executeFlowBlock] AI takeover with agent:', currentBlock.data.agent_id);
        }
        
        // Armazenar overrides de permissões
        if (currentBlock.data.override_can_do?.length) {
          flowVariables['__override_can_do'] = JSON.stringify(currentBlock.data.override_can_do);
        }
        if (currentBlock.data.override_cannot_do?.length) {
          flowVariables['__override_cannot_do'] = JSON.stringify(currentBlock.data.override_cannot_do);
        }
        if (currentBlock.data.override_handoff_triggers?.length) {
          flowVariables['__override_handoff_triggers'] = JSON.stringify(currentBlock.data.override_handoff_triggers);
        }
        
        // Armazenar config de auto-switch
        if (currentBlock.data.auto_switch_enabled && currentBlock.data.auto_switch_agents?.length) {
          flowVariables['__auto_switch_config'] = JSON.stringify(currentBlock.data.auto_switch_agents);
          console.log('[executeFlowBlock] Auto-switch enabled with', currentBlock.data.auto_switch_agents.length, 'agents');
        }
        
        // Contexto adicional
        if (currentBlock.data.ai_context_prompt) {
          flowVariables['__ai_context'] = currentBlock.data.ai_context_prompt;
        }
        
        responseContent = currentBlock.data.ai_context_prompt 
          ? `[Contexto para IA: ${currentBlock.data.ai_context_prompt}]`
          : '';
        console.log('[executeFlowBlock] AI takeover with variables:', Object.keys(flowVariables));
        break;

      case 'handoff':
        // Transfer to human agent
        flowCompleted = true;
        responseContent = currentBlock.data.handoff_message || 'Vou transferir você para um atendente.';
        
        // Update conversation status — IA larga o lead, vai para fila do setor
        await supabase
          .from('webchat_conversations')
          .update({
            status: 'waiting_human',
            current_agent_id: null,
            assigned_user_id: null,
            needs_human: true,
          })
          .eq('id', conversationId);
        break;

      case 'tag':
        // Add tag to lead (implementation would connect to leads table)
        console.log('[executeFlowBlock] Tag applied:', currentBlock.data.tag_name, '=', currentBlock.data.tag_value);
        
        // Move to next block immediately
        if (nextBlockId) {
          const nextBlock = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
          if (nextBlock) {
            return executeNextBlock(supabase, conversationId, flow, nextBlock, flowVariables);
          }
        }
        break;

      case 'video':
        responseContent = currentBlock.data.video_title || 'Assista a este vídeo:';
        responseVideoUrl = currentBlock.data.video_url;
        messageType = 'video';
        break;

      case 'delay':
        // In a real implementation, this would use a job queue
        // For now, we just move to the next block
        if (nextBlockId) {
          const nextBlock = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
          if (nextBlock) {
            return executeNextBlock(supabase, conversationId, flow, nextBlock, flowVariables);
          }
        }
        break;
      
      case 'agent_switch':
        // Switch to a different agent
        const newAgentId = currentBlock.data.agent_id;
        
        if (newAgentId) {
          // Update conversation with new agent
          await supabase
            .from('webchat_conversations')
            .update({ current_agent_id: newAgentId })
            .eq('id', conversationId);
          
          flowVariables['__current_agent_id'] = newAgentId;
          console.log('[executeFlowBlock] Switched to agent:', newAgentId);
        }
        
        // Move to next block immediately
        if (nextBlockId) {
          const nextBlock = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
          if (nextBlock) {
            return executeNextBlock(supabase, conversationId, flow, nextBlock, flowVariables);
          }
        }
        break;

      case 'create_lead':
      case 'update_lead':
        // Sincroniza todas as variáveis capturadas para o lead vinculado.
        // O lead já é auto-criado em webchat-api ao iniciar a conversa,
        // então tanto 'create_lead' quanto 'update_lead' acabam fazendo update.
        await syncFlowVarsToLead(supabase, conversationId, flowVariables);
        if (nextBlockId) {
          const nb = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
          if (nb) return executeNextBlock(supabase, conversationId, flow, nb, flowVariables);
        }
        break;

      case 'score': {
        const inc = Number(currentBlock.data.score_value || 0);
        if (inc) {
          const { data: convRow } = await supabase
            .from('webchat_conversations')
            .select('lead_id')
            .eq('id', conversationId)
            .maybeSingle();
          if (convRow?.lead_id) {
            const { data: leadRow } = await supabase
              .from('leads')
              .select('lead_score')
              .eq('id', convRow.lead_id)
              .maybeSingle();
            const newScore = Number(leadRow?.lead_score || 0) + inc;
            await supabase.from('leads').update({ lead_score: newScore }).eq('id', convRow.lead_id);
            console.log('[executeFlowBlock] score +', inc, '→', newScore);
          }
        }
        if (nextBlockId) {
          const nb = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
          if (nb) return executeNextBlock(supabase, conversationId, flow, nb, flowVariables);
        }
        break;
      }

      case 'tag': {
        const tagsToAdd: string[] = currentBlock.data.apply_tags
          || (currentBlock.data.tag_name ? [currentBlock.data.tag_name] : []);
        if (tagsToAdd.length) {
          const { data: convRow } = await supabase
            .from('webchat_conversations')
            .select('lead_id')
            .eq('id', conversationId)
            .maybeSingle();
          if (convRow?.lead_id) {
            const { data: leadRow } = await supabase
              .from('leads')
              .select('tags')
              .eq('id', convRow.lead_id)
              .maybeSingle();
            const merged = Array.from(new Set([...(leadRow?.tags || []), ...tagsToAdd]));
            await supabase.from('leads').update({ tags: merged }).eq('id', convRow.lead_id);
            console.log('[executeFlowBlock] tags aplicadas:', tagsToAdd);
          }
        }
        if (nextBlockId) {
          const nb = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
          if (nb) return executeNextBlock(supabase, conversationId, flow, nb, flowVariables);
        }
        break;
      }

      case 'condition': {
        const branch = evaluateCondition(currentBlock.data.condition, flowVariables);
        const target = branch
          ? currentBlock.data.true_next_block_id
          : currentBlock.data.false_next_block_id;
        console.log('[executeFlowBlock] condition →', branch ? 'true' : 'false', target);
        if (target) {
          const nb = flow.blocks.find((b: FlowBlock) => b.id === target);
          if (nb) return executeNextBlock(supabase, conversationId, flow, nb, flowVariables);
        }
        nextBlockId = target || null;
        break;
      }

      case 'create_task': {
        const cfg = currentBlock.data.task_config;
        const { data: convRow } = await supabase
          .from('webchat_conversations')
          .select('lead_id, organization_id')
          .eq('id', conversationId)
          .maybeSingle();
        if (cfg && convRow?.lead_id) {
          // Substitui {{var}} no template
          const renderTpl = (tpl: string) =>
            Object.entries(flowVariables).reduce(
              (acc, [k, v]) => acc.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? '')),
              tpl || ''
            );
          const dueAt = new Date(Date.now() + (cfg.due_in_days || 1) * 86400000).toISOString();
          await supabase.from('tasks').insert({
            organization_id: convRow.organization_id,
            lead_id: convRow.lead_id,
            title: renderTpl(cfg.title_template) || 'Tarefa do funil',
            description: renderTpl(cfg.description_template) || null,
            due_at: dueAt,
            assigned_to: cfg.assign_to === 'specific_user' ? cfg.user_id : null,
            squad_id: cfg.assign_to === 'squad' ? cfg.squad_id : null,
            status: 'pending',
          });
          console.log('[executeFlowBlock] task criada para lead', convRow.lead_id);
        }
        if (nextBlockId) {
          const nb = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
          if (nb) return executeNextBlock(supabase, conversationId, flow, nb, flowVariables);
        }
        break;
      }
    }

    // Save bot response message if we have content
    let botMessage = null;
    if (responseContent) {
      const { data: msg, error: msgError } = await supabase
        .from('webchat_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          sender_type: 'bot',
          content: responseContent,
          message_type: messageType,
          buttons: responseButtons || null,
          video_url: responseVideoUrl || null,
        })
        .select()
        .single();

      if (msgError) {
        console.error('[executeFlowBlock] Error saving message:', msgError);
      } else {
        botMessage = msg;
      }
    }

    // Update conversation flow state
    await supabase
      .from('webchat_conversations')
      .update({
        current_block_id: nextBlockId,
        flow_variables: flowVariables,
        flow_completed: flowCompleted,
      })
      .eq('id', conversationId);

    return {
      message: botMessage,
      flow_update: {
        current_block_id: nextBlockId,
        flow_variables: flowVariables,
        flow_completed: flowCompleted,
      },
      buttons: responseButtons,
      video_url: responseVideoUrl,
    };
  } catch (error) {
    console.error('[executeFlowBlock] Error:', error);
    return { flow_update: { ...flowContext, flow_completed: true } };
  }
}

// Helper to execute a block immediately (used for chaining blocks)
async function executeNextBlock(
  supabase: any,
  conversationId: string,
  flow: ChatFlow,
  block: FlowBlock,
  flowVariables: Record<string, string>
): Promise<{
  message?: any;
  flow_update?: {
    current_block_id: string | null;
    flow_variables: Record<string, string>;
    flow_completed: boolean;
  };
  buttons?: any[];
  video_url?: string;
  action?: string;
  action_data?: {
    url?: string;
    open_in_new_tab?: boolean;
    number?: string;
    message?: string;
  };
}> {
  let responseContent = '';
  let messageType = 'text';
  let responseButtons: any[] | undefined;
  let responseVideoUrl: string | undefined;
  let nextBlockId: string | null = block.next_block_id || null;
  let flowCompleted = false;

  switch (block.type) {
    case 'message':
      responseContent = block.data.content || '';
      // Replace variables in content
      Object.entries(flowVariables).forEach(([key, value]) => {
        responseContent = responseContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      });
      break;

    case 'input':
      responseContent = block.data.placeholder || 'Digite sua resposta...';
      break;

    case 'buttons':
      responseContent = block.data.content || 'Escolha uma opção:';
      // Replace variables in content
      Object.entries(flowVariables).forEach(([key, value]) => {
        responseContent = responseContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      });
      messageType = 'buttons';
      responseButtons = block.data.buttons?.map((btn: FlowBlockButton, index: number) => ({
        id: btn.id,
        label: `${btn.emoji || ''} ${btn.label}`.trim(),
        type: btn.action_type === 'url' ? 'url' : 
              btn.action_type === 'whatsapp' ? 'whatsapp' : 'flow_button',
        action: btn.action_type === 'url' ? btn.url : 
                btn.action_type === 'whatsapp' ? btn.whatsapp_number : btn.id,
        style: index === 0 ? 'primary' : 'secondary',
        cta_type: btn.action_type || 'flow',
        action_type: btn.action_type || 'next_block',
        whatsapp_message: btn.whatsapp_message,
        open_in_new_tab: btn.open_in_new_tab,
      }));
      break;

    case 'ai_takeover':
      flowCompleted = true;
      break;

    case 'handoff':
      flowCompleted = true;
      responseContent = block.data.handoff_message || 'Vou transferir você para um atendente.';
      await supabase
        .from('webchat_conversations')
        .update({
          status: 'waiting_human',
          current_agent_id: null,
          assigned_user_id: null,
          needs_human: true,
        })
        .eq('id', conversationId);
      break;

    case 'video':
      responseContent = block.data.video_title || 'Assista a este vídeo:';
      responseVideoUrl = block.data.video_url;
      messageType = 'video';
      break;
    
    case 'agent_switch':
      // Switch agent and continue to next block
      if (block.data.agent_id) {
        await supabase
          .from('webchat_conversations')
          .update({ current_agent_id: block.data.agent_id })
          .eq('id', conversationId);
        
        flowVariables['__current_agent_id'] = block.data.agent_id;
        console.log('[executeNextBlock] Switched to agent:', block.data.agent_id);
      }
      
      // Continue to next block
      if (nextBlockId) {
        const nextBlock = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
        if (nextBlock) {
          return executeNextBlock(supabase, conversationId, flow, nextBlock, flowVariables);
        }
      }
      break;

    case 'create_lead':
    case 'update_lead':
      await syncFlowVarsToLead(supabase, conversationId, flowVariables);
      if (nextBlockId) {
        const nb = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
        if (nb) return executeNextBlock(supabase, conversationId, flow, nb, flowVariables);
      }
      break;

    case 'score': {
      const inc = Number(block.data.score_value || 0);
      if (inc) {
        const { data: convRow } = await supabase
          .from('webchat_conversations')
          .select('lead_id')
          .eq('id', conversationId)
          .maybeSingle();
        if (convRow?.lead_id) {
          const { data: leadRow } = await supabase
            .from('leads').select('lead_score').eq('id', convRow.lead_id).maybeSingle();
          await supabase.from('leads')
            .update({ lead_score: Number(leadRow?.lead_score || 0) + inc })
            .eq('id', convRow.lead_id);
        }
      }
      if (nextBlockId) {
        const nb = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
        if (nb) return executeNextBlock(supabase, conversationId, flow, nb, flowVariables);
      }
      break;
    }

    case 'tag': {
      const tagsToAdd: string[] = block.data.apply_tags
        || (block.data.tag_name ? [block.data.tag_name] : []);
      if (tagsToAdd.length) {
        const { data: convRow } = await supabase
          .from('webchat_conversations').select('lead_id').eq('id', conversationId).maybeSingle();
        if (convRow?.lead_id) {
          const { data: leadRow } = await supabase
            .from('leads').select('tags').eq('id', convRow.lead_id).maybeSingle();
          const merged = Array.from(new Set([...(leadRow?.tags || []), ...tagsToAdd]));
          await supabase.from('leads').update({ tags: merged }).eq('id', convRow.lead_id);
        }
      }
      if (nextBlockId) {
        const nb = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
        if (nb) return executeNextBlock(supabase, conversationId, flow, nb, flowVariables);
      }
      break;
    }

    case 'condition': {
      const branch = evaluateCondition(block.data.condition, flowVariables);
      const target = branch ? block.data.true_next_block_id : block.data.false_next_block_id;
      if (target) {
        const nb = flow.blocks.find((b: FlowBlock) => b.id === target);
        if (nb) return executeNextBlock(supabase, conversationId, flow, nb, flowVariables);
      }
      nextBlockId = target || null;
      break;
    }

    default:
      // For unknown/passthrough blocks (delay, etc.), continue to next block
      if (nextBlockId) {
        const nextBlock = flow.blocks.find((b: FlowBlock) => b.id === nextBlockId);
        if (nextBlock) {
          return executeNextBlock(supabase, conversationId, flow, nextBlock, flowVariables);
        }
      }
  }

  // Save message if we have content
  let botMessage = null;
  if (responseContent) {
    const { data: msg } = await supabase
      .from('webchat_messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outbound',
        sender_type: 'bot',
        content: responseContent,
        message_type: messageType,
        buttons: responseButtons || null,
        video_url: responseVideoUrl || null,
      })
      .select()
      .single();
    
    botMessage = msg;
  }

  // Update conversation state
  await supabase
    .from('webchat_conversations')
    .update({
      current_block_id: block.id,
      flow_variables: flowVariables,
      flow_completed: flowCompleted,
    })
    .eq('id', conversationId);

  return {
    message: botMessage,
    flow_update: {
      current_block_id: block.id,
      flow_variables: flowVariables,
      flow_completed: flowCompleted,
    },
    buttons: responseButtons,
    video_url: responseVideoUrl,
  };
}
