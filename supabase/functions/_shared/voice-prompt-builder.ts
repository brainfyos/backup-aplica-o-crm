// voice-prompt-builder.ts
// Constrói o `instructions` do Grok Voice Realtime a partir de um product_agent
// completo — assim a ligação carrega a MESMA inteligência que o agente usa
// em WhatsApp/Inbox: prompt-base por tipo, objetivo, can/cannot_do,
// tom, estilo, frases obrigatórias/proibidas, humanização (persona, sotaque,
// tics, gírias, risadas) e cérebro do produto.

import { buildAgentTemplate, type AgentTypeKey } from './agent-prompt-templates.ts';

export interface VoicePromptLead {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  stage?: string | null;
}

export interface VoicePromptOrg { name?: string | null }

export interface VoicePromptInputs {
  productAgent: any;
  org?: VoicePromptOrg | null;
  productName?: string | null;
  productDescription?: string | null;
  brainSummary?: string | null;
  lead?: VoicePromptLead | null;
  visitor?: { name?: string; contact?: string } | null;
  callContext?: string | null;
  extraContext?: string | null;
}

const REGION_HINT: Record<string, string> = {
  neutral:    'sotaque brasileiro neutro (SP/RJ padrão de mídia)',
  paulista:   'sotaque paulista da capital (R retroflexo suave, ritmo rápido)',
  carioca:    'sotaque carioca autêntico (S chiado no fim das palavras, cadência musical)',
  nordestino: 'sotaque nordestino natural (vogais abertas, entonação cantada)',
  sulista:    'sotaque gaúcho/sulista (R vibrante, "tchê" ocasional)',
  mineiro:    'sotaque mineiro (vogais curtas, "uai", contrações)',
};

function toneRule(tone?: string): string {
  switch (tone) {
    case 'formal':    return 'Tom formal, respeitoso, sem gírias.';
    case 'technical': return 'Tom técnico e preciso, sem rodeios.';
    case 'friendly':  return 'Tom amigável e próximo, como um consultor de confiança.';
    case 'consultive':
    default:          return 'Tom consultivo (SPIN Selling), próximo, sem pressão nem clichês.';
  }
}

function messageStyleRule(style?: string): string {
  switch (style) {
    case 'short':    return 'Fale em NO MÁXIMO 1 frase por turno. Direto ao ponto.';
    case 'detailed': return 'Pode falar até 3 frases por turno, mas nunca monólogo. Uma ideia por vez.';
    case 'balanced':
    default:         return 'Fale em 1 a 2 frases curtas por turno. Uma pergunta por vez.';
  }
}

function listBlock(title: string, arr?: string[] | null): string {
  const items = (arr || []).map((s) => String(s).trim()).filter(Boolean);
  if (!items.length) return '';
  return `\n${title}\n${items.map((s) => `- ${s}`).join('\n')}`;
}

function humanizationBlock(h: any): string {
  if (!h || typeof h !== 'object') return '';
  const out: string[] = [];

  const persona = h.persona || {};
  const personaBits: string[] = [];
  if (persona.age)       personaBits.push(`${persona.age} anos`);
  if (persona.city)      personaBits.push(`mora em ${persona.city}`);
  if (persona.backstory) personaBits.push(persona.backstory);
  if (Array.isArray(persona.hobbies) && persona.hobbies.length) {
    personaBits.push(`hobbies: ${persona.hobbies.slice(0, 5).join(', ')}`);
  }
  if (personaBits.length) out.push(`Persona: ${personaBits.join(' · ')}.`);
  if (Array.isArray(persona.stories) && persona.stories.length) {
    out.push(
      'Histórias que pode contar quando fizer sentido:\n' +
      persona.stories.slice(0, 3).map((s: any) => `- ${s.title}: ${s.description}`).join('\n'),
    );
  }

  const tics = h.tics || {};
  const region = tics.region as string | undefined;
  if (region && region !== 'custom' && REGION_HINT[region]) {
    out.push(`Sotaque e cadência: fale com ${REGION_HINT[region]}. Mantenha natural, sem exagero caricato.`);
  } else if (region === 'custom' && tics.custom_region) {
    out.push(`Sotaque e cadência: ${tics.custom_region}.`);
  }
  const slang     = (tics.slang || []).filter(Boolean);
  const openers   = (tics.openers || []).filter(Boolean);
  const connectors = (tics.connectors || []).filter(Boolean);
  const fillers   = (tics.fillers || []).filter(Boolean);
  if (slang.length)      out.push(`Gírias que pode usar (com moderação): ${slang.slice(0, 8).join(', ')}.`);
  if (openers.length)    out.push(`Aberturas naturais: ${openers.slice(0, 5).join(', ')}.`);
  if (connectors.length) out.push(`Conectivos casuais: ${connectors.slice(0, 5).join(', ')}.`);
  if (fillers.length)    out.push(`Frases de muleta ocasionais: ${fillers.slice(0, 5).join(', ')}.`);

  const style = h.style || {};
  const laughterProb = Number(style.laughter_prob || 0);
  if (laughterProb > 0.05) {
    const kind = style.laughter_style && style.laughter_style !== 'auto' ? style.laughter_style : 'kkk/rs';
    out.push(`Ria de forma natural (${kind}) quando o cliente fizer piada ou o momento pedir. Nunca forçado.`);
  }

  const loved = (persona.loved_words || style.loved_words || []).filter(Boolean);
  const forbidden = (persona.forbidden_words || style.forbidden_words || []).filter(Boolean);
  if (loved.length)     out.push(`Palavras que você costuma usar: ${loved.slice(0, 6).join(', ')}.`);
  if (forbidden.length) out.push(`PALAVRAS PROIBIDAS (nunca use): ${forbidden.slice(0, 10).join(', ')}.`);

  return out.length ? `\n--- Como você fala (humanização) ---\n${out.join('\n')}\n` : '';
}

const DEFAULT_VOICE_BEHAVIOR_PROMPT = `Você está em uma LIGAÇÃO DE VOZ REAL. Fale como pessoa, não como script.

RITMO E EXTENSÃO
1. Respostas curtas por padrão — 1 a 2 frases. Pode chegar a 3 quando estiver explicando um benefício, contando uma história curta ou quebrando uma objeção. Nunca monólogo (>15s).
2. Termine devolvendo a bola: pergunta ou convite. Evite finais em declaração seca.
3. A pessoa deve falar mais que você. Se percebeu que ficou "recitando", pare e pergunte algo.
4. Sem emojis, sem markdown, sem "vou te enviar por escrito" — é fala.

USE SUA HUMANIZAÇÃO
5. Aproveite sua persona (cidade, backstory, hobbies), gírias, aberturas e sotaque configurados. Você é uma PESSOA, não um assistente virtual.
6. Ria quando o momento pedir (se tiver risada configurada). Pequenas pausas ("hmm", "olha", "então") deixam natural.
7. Ancore em dores concretas que a pessoa mencionou. Um benefício por vez.

AGENDAMENTO PROATIVO
8. Ao detectar QUALQUER interesse em agendar/conversar/apresentação/reunião/demo:
   - NÃO pergunte "que dia é melhor pra você"
   - Chame \`listar_horarios_reuniao\` IMEDIATAMENTE
   - Enquanto a tool carrega, fale UMA frase: "Deixa eu te mostrar as próximas datas."
   - A tool renderiza cards clicáveis. NÃO recite horários por voz.
   - Após o lead escolher e preencher, diga APENAS: "Sua reunião foi agendada. Em instantes você recebe a confirmação pelo WhatsApp. Obrigada!" — e encerre.

INTEGRIDADE (não invente)
9. NUNCA invente dados técnicos, hospedagem, stack, preço, prazo, parcerias ou histórico. Só afirme o que estiver no material de treinamento (Brain).
10. Não sabe? Diga algo próximo a: "Boa pergunta — deixa eu confirmar com o time e te retorno pelo WhatsApp em alguns minutos. Qual o melhor número?" Depois chame \`salvar_whatsapp\` e finalize com \`registrar_desfecho\` outcome_id="callback".
11. Se em {MAX_MIN} minutos não houve avanço, ofereça desfecho alternativo com elegância.`;

function voiceChannelBlock(agent: any): string {
  if (!agent) return '';
  if (agent.voice_mode_enabled === false) return '';

  const maxSentences = Number(agent.voice_max_sentences ?? 2);
  const maxSeconds   = Number(agent.voice_max_seconds ?? 10);
  const maxMin       = Number(agent.voice_max_call_minutes ?? 10);
  const alwaysAsk    = agent.voice_always_end_with_question !== false;
  const toolsEarly   = agent.voice_show_tools_early !== false;

  const rawPrompt = (agent.voice_behavior_prompt && String(agent.voice_behavior_prompt).trim())
    || DEFAULT_VOICE_BEHAVIOR_PROMPT;
  const prompt = rawPrompt.replace(/\{MAX_MIN\}/g, String(maxMin || 10));

  const extras: string[] = [];
  extras.push(`Hard limits: até ${maxSentences} frase(s) por turno em regra geral, ~${maxSeconds}s de fala. Pode esticar quando explicando valor.`);
  if (alwaysAsk)  extras.push('SEMPRE termine com uma pergunta ou convite à ação.');
  if (toolsEarly) extras.push('Use tools (listar_horarios_reuniao, mostrar_agendamento, confirmar_agendamento_reuniao) na PRIMEIRA menção de interesse — nunca leia horários em voz alta.');
  if (maxMin > 0) extras.push(`Se em ~${maxMin} minutos a conversa não avançar, ofereça encerramento alternativo.`);

  const specific = (agent.voice_specific_rules && String(agent.voice_specific_rules).trim()) || '';
  const specificBlock = specific
    ? `\n\n--- REGRAS ESPECÍFICAS DESTA AGENTE (voz) ---\n${specific}`
    : '';

  const integrity = `\n\n=== INTEGRIDADE (VOZ) ===
- NÃO tem informação sobre hospedagem, stack, arquitetura, parcerias, preço ou prazo além do que está no "Cérebro do produto" abaixo.
- Se o lead perguntar algo que não está no Brain, PROIBIDO chutar. Diga: "Boa pergunta — deixa eu confirmar com o time e te retorno pelo WhatsApp. Qual o melhor número?"
- Depois de captar o WhatsApp (\`salvar_whatsapp\` ou \`salvar_dado_lead\`), resuma a dúvida e encerre com \`registrar_desfecho\` outcome_id="callback".`;

  return `\n--- MODO LIGAÇÃO DE VOZ (regras deste canal) ---\n${prompt}\n\n${extras.join('\n')}${specificBlock}${integrity}\n`;
}

/**
 * Monta o system prompt completo para a chamada de voz.
 * Retorna texto pronto para ser usado como `session.instructions` da Grok Realtime.
 */
export function buildVoiceInstructions(input: VoicePromptInputs): string {
  const {
    productAgent, org, productName, productDescription, brainSummary,
    lead, visitor, callContext, extraContext,
  } = input;

  const agentType = (productAgent?.agent_type as AgentTypeKey) || 'custom';
  const base = buildAgentTemplate(agentType, {
    organization_name: org?.name || '',
    agent_name: productAgent?.name || 'Atendente',
    product_name: productName || undefined,
    product_description: productDescription || undefined,
    custom_context: productAgent?.additional_prompt || undefined,
  });

  const parts: string[] = [base];

  if (productAgent?.primary_objective) {
    parts.push(`\n--- Objetivo desta ligação ---\n${productAgent.primary_objective}`);
  }
  if (productAgent?.additional_prompt) {
    parts.push(`\n--- Instruções adicionais do agente ---\n${productAgent.additional_prompt}`);
  }

  const canDo    = listBlock('O que você PODE fazer:', productAgent?.can_do);
  const cannotDo = listBlock('O que você NÃO PODE fazer:', productAgent?.cannot_do);
  const handoff  = listBlock('Quando transferir para humano (handoff):', productAgent?.handoff_triggers);
  const endConv  = listBlock('Quando encerrar a conversa:', productAgent?.end_conversation_triggers);
  if (canDo || cannotDo || handoff || endConv) {
    parts.push(`\n--- Limites de atuação ---${canDo}${cannotDo}${handoff}${endConv}`);
  }

  const required   = listBlock('Frases OBRIGATÓRIAS em algum momento:', productAgent?.required_phrases);
  const prohibited = listBlock('Frases PROIBIDAS (nunca fale):',        productAgent?.prohibited_phrases);
  if (required || prohibited) parts.push(`\n--- Vocabulário ---${required}${prohibited}`);

  parts.push(
    '\n--- Tom & ritmo ---\n' +
    toneRule(productAgent?.tone_style) + '\n' +
    messageStyleRule(productAgent?.message_style) +
    (productAgent?.always_end_with_question ? '\nSEMPRE termine sua fala com UMA pergunta.' : ''),
  );

  // Camada Modo Voz — regras específicas de ligação (só valem aqui, não em WhatsApp/Inbox)
  const voiceBlock = voiceChannelBlock(productAgent);
  if (voiceBlock) parts.push(voiceBlock);

  const human = humanizationBlock(productAgent?.humanization);
  if (human) parts.push(human);

  if (brainSummary) {
    parts.push(`\n--- Cérebro do produto (fatos verificados) ---\n${brainSummary.trim()}`);
  }

  if (org?.name) parts.push(`\nVocê representa: ${org.name}.`);

  if (lead) {
    const l: string[] = [];
    if (lead.name)    l.push(`Nome: ${lead.name}`);
    if (lead.company) l.push(`Empresa: ${lead.company}`);
    if (lead.stage)   l.push(`Estágio atual: ${lead.stage}`);
    if (lead.phone)   l.push(`Telefone: ${lead.phone}`);
    if (l.length) parts.push(`\n--- Cliente ---\n${l.join('\n')}`);
  } else if (visitor && (visitor.name || visitor.contact)) {
    const l: string[] = [];
    if (visitor.name)    l.push(`Nome: ${visitor.name}`);
    if (visitor.contact) l.push(`Contato: ${visitor.contact}`);
    parts.push(`\n--- Visitante da página pública ---\n${l.join('\n')}`);
  }

  if (callContext) parts.push(`\n--- Contexto desta ligação ---\n${callContext.trim()}`);
  if (extraContext) parts.push(`\n--- Contexto extra ---\n${extraContext.trim()}`);

  return parts.join('\n');
}
