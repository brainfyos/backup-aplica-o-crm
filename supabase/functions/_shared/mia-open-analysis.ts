import { aiChatContent } from './ai-call.ts';

type JsonRecord = Record<string, unknown>;

export interface OpenConversationMessage {
  content: string;
  direction: string;
  sender_type: string;
  created_at: string | null;
}

export interface OpenConversationContext {
  conversation: JsonRecord;
  lead: JsonRecord | null;
  deal: JsonRecord | null;
  product: JsonRecord | null;
  ownerName: string | null;
  messages: OpenConversationMessage[];
  totalMessageCount: number;
}

export interface VerifiedEvidence {
  quote: string;
  meaning: string;
  speaker?: string;
}

export interface OpenConversationAssessment {
  category: 'ready_to_close' | 'high_potential' | 'nurture' | 'needs_human' | 'at_risk' | 'unqualified';
  intent_score: number;
  close_probability: number;
  urgency_score: number;
  confidence: number;
  sentiment: 'positivo' | 'neutro' | 'negativo' | 'misto';
  summary: string;
  purchase_signals: string[];
  objections: string[];
  risks: string[];
  missing_information: string[];
  next_best_action: string;
  suggested_reply: string | null;
  evidence: VerifiedEvidence[];
  messages_analyzed: number;
  transcript_truncated: boolean;
  model_used: string;
}

export const ANALYSIS_VERSION = 'open-v2';
const CHUNK_CHARS = 18_000;
const MAX_CHUNKS = 8;

function text(value: unknown, max = 800): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function value(record: JsonRecord | null, key: string): unknown {
  return record?.[key] ?? null;
}

function list(input: unknown, maxItems = 8): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => text(item, 280)).filter(Boolean).slice(0, maxItems);
}

function score(input: unknown): number {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}

function confidence(input: unknown): number {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.45;
}

function parseJson(raw: string): JsonRecord {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('A IA não devolveu JSON válido.');
  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('A IA devolveu um formato inválido.');
  return parsed as JsonRecord;
}

function normalizeQuote(input: string): string {
  return input.toLocaleLowerCase('pt-BR').replace(/[“”„‟]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

function verifiedEvidence(input: unknown, transcript: string): VerifiedEvidence[] {
  if (!Array.isArray(input)) return [];
  const haystack = normalizeQuote(transcript);
  const output: VerifiedEvidence[] = [];
  for (const rawItem of input.slice(0, 6)) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const item = rawItem as JsonRecord;
    const quote = text(item.quote, 420);
    if (quote.length < 4 || !haystack.includes(normalizeQuote(quote))) continue;
    output.push({
      quote,
      meaning: text(item.meaning, 320) || 'Evidência encontrada na conversa.',
      speaker: text(item.speaker, 80) || undefined,
    });
  }
  return output;
}

function transcriptFrom(messages: OpenConversationMessage[]): string {
  return messages.map((message, index) => {
    const speaker = message.direction === 'inbound' || ['visitor', 'lead'].includes(message.sender_type)
      ? 'CLIENTE'
      : ['bot', 'agent'].includes(message.sender_type) ? 'ATENDIMENTO' : 'VENDEDOR';
    const date = message.created_at ? new Date(message.created_at).toISOString() : 'sem-data';
    return `${index + 1}. [${date}] ${speaker}: ${text(message.content, 4_000)}`;
  }).join('\n');
}

function splitTranscript(transcript: string): { chunks: string[]; truncated: boolean } {
  if (transcript.length <= CHUNK_CHARS) return { chunks: [transcript], truncated: false };
  const raw: string[] = [];
  let cursor = 0;
  while (cursor < transcript.length) {
    let end = Math.min(transcript.length, cursor + CHUNK_CHARS);
    if (end < transcript.length) {
      const boundary = transcript.lastIndexOf('\n', end);
      if (boundary > cursor + CHUNK_CHARS * 0.6) end = boundary;
    }
    raw.push(transcript.slice(cursor, end));
    cursor = end;
  }
  if (raw.length <= MAX_CHUNKS) return { chunks: raw, truncated: false };
  return { chunks: [...raw.slice(0, MAX_CHUNKS / 2), ...raw.slice(-MAX_CHUNKS / 2)], truncated: true };
}

function metadataBlock(context: OpenConversationContext): string {
  const conversation = context.conversation;
  const lead = context.lead;
  const deal = context.deal;
  return JSON.stringify({
    conversation_id: value(conversation, 'id'),
    status: value(conversation, 'status'),
    channel: value(conversation, 'channel'),
    needs_human: value(conversation, 'needs_human'),
    detected_intent: value(conversation, 'detected_intent'),
    last_inbound_at: value(conversation, 'last_inbound_at'),
    last_message_at: value(conversation, 'last_message_at'),
    visitor: value(conversation, 'visitor_name'),
    owner: context.ownerName,
    product: value(context.product, 'name'),
    lead: lead ? {
      name: value(lead, 'name'), temperature: value(lead, 'temperature'), stage_id: value(lead, 'current_stage_id'),
      expected_close_date: value(lead, 'expected_close_date'), next_action: value(lead, 'next_action'),
      bant_budget: value(lead, 'bant_budget'), bant_authority: value(lead, 'bant_authority'),
      bant_need: value(lead, 'bant_need'), bant_timing: value(lead, 'bant_timing'),
    } : null,
    deal: deal ? { status: value(deal, 'status'), value: value(deal, 'deal_value'), plan: value(deal, 'plan_name') } : null,
  }, null, 2);
}

const JSON_SHAPE = `{
  "intent_score": 0-100,
  "close_probability": 0-100,
  "urgency_score": 0-100,
  "confidence": 0-1,
  "sentiment": "positivo|neutro|negativo|misto",
  "qualified": true|false,
  "needs_human": true|false,
  "summary": "diagnóstico factual em até 3 frases",
  "purchase_signals": ["sinais observados"],
  "objections": ["objeções reais"],
  "risks": ["riscos reais"],
  "missing_information": ["informações que faltam para fechar"],
  "next_best_action": "uma ação específica e imediata",
  "suggested_reply": "mensagem pronta, natural e sem inventar informação, ou null",
  "evidence": [{"quote":"trecho LITERAL da transcrição","speaker":"CLIENTE|VENDEDOR|ATENDIMENTO","meaning":"o que comprova"}]
}`;

async function analyzeChunk(admin: unknown, organizationId: string, metadata: string, chunk: string, index: number, total: number) {
  const raw = await aiChatContent({
    supabase: admin,
    organizationId,
    capability: 'analysis_insights',
    keyPurpose: 'mia',
    model: 'google/gemini-2.5-flash',
    label: `mia-open-analysis-chunk-${index + 1}`,
    edgeFunction: 'mia-open-conversation-worker',
    timeoutMs: 70_000,
    body: {
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Extraia sinais comerciais somente dos dados fornecidos. Não deduza orçamento, intenção ou urgência sem evidência. Responda apenas JSON.' },
        { role: 'user', content: `Analise o trecho ${index + 1}/${total} desta conversa aberta.\n\nMETADADOS:\n${metadata}\n\nTRANSCRIÇÃO:\n${chunk}\n\nRetorne o formato:\n${JSON_SHAPE}` },
      ],
    },
  });
  return parseJson(raw);
}

export async function analyzeOpenConversation(
  admin: unknown,
  organizationId: string,
  context: OpenConversationContext,
): Promise<OpenConversationAssessment> {
  if (!context.messages.length) {
    return {
      category: 'unqualified', intent_score: 0, close_probability: 0,
      urgency_score: value(context.conversation, 'needs_human') === true ? 35 : 0,
      confidence: 1, sentiment: 'neutro',
      summary: 'A conversa está aberta, mas não possui mensagens analisáveis.',
      purchase_signals: [], objections: [], risks: ['Não há conteúdo de conversa para avaliar a oportunidade.'],
      missing_information: ['Mensagem ou resposta do cliente.'],
      next_best_action: 'Verificar se a conversa foi criada corretamente antes de iniciar contato.',
      suggested_reply: null, evidence: [], messages_analyzed: 0, transcript_truncated: false,
      model_used: 'deterministic:no-messages',
    };
  }

  const transcript = transcriptFrom(context.messages);
  const metadata = metadataBlock(context);
  const { chunks, truncated } = splitTranscript(transcript);
  const partials = await Promise.all(chunks.map((chunk, index) => analyzeChunk(admin, organizationId, metadata, chunk, index, chunks.length)));
  let result: JsonRecord;
  if (partials.length === 1) result = partials[0];
  else {
    result = parseJson(await aiChatContent({
      supabase: admin,
      organizationId,
      capability: 'analysis_insights',
      keyPurpose: 'mia',
      model: 'google/gemini-3-flash-preview',
      label: 'mia-open-analysis-final',
      edgeFunction: 'mia-open-conversation-worker',
      timeoutMs: 80_000,
      body: {
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Consolide as análises parciais de uma única conversa. Preserve apenas fatos sustentados pelos trechos. Responda apenas JSON.' },
          { role: 'user', content: `Consolide esta conversa aberta.\n\nMETADADOS:\n${metadata}\n\nANÁLISES PARCIAIS:\n${JSON.stringify(partials)}\n\nRetorne o formato:\n${JSON_SHAPE}` },
        ],
      },
    }));
  }

  const intentScore = score(result.intent_score);
  const closeProbability = score(result.close_probability);
  const urgencyScore = score(result.urgency_score);
  const isQualified = result.qualified !== false;
  const needsHuman = result.needs_human === true || value(context.conversation, 'needs_human') === true;
  const evidence = verifiedEvidence(result.evidence, transcript);
  let category: OpenConversationAssessment['category'];
  if (!isQualified && intentScore < 35) category = 'unqualified';
  else if (needsHuman && urgencyScore >= 55) category = 'needs_human';
  else if (closeProbability >= 75 && intentScore >= 65) category = 'ready_to_close';
  else if (intentScore >= 60 || closeProbability >= 55) category = 'high_potential';
  else if (urgencyScore >= 70 || list(result.risks).length >= 3) category = 'at_risk';
  else category = 'nurture';

  let finalConfidence = confidence(result.confidence);
  if (!evidence.length) finalConfidence = Math.min(finalConfidence, 0.55);
  if (truncated) finalConfidence = Math.max(0, finalConfidence - 0.12);
  const sentiment = ['positivo', 'neutro', 'negativo', 'misto'].includes(String(result.sentiment))
    ? result.sentiment as OpenConversationAssessment['sentiment'] : 'neutro';

  return {
    category,
    intent_score: intentScore,
    close_probability: closeProbability,
    urgency_score: urgencyScore,
    confidence: Number(finalConfidence.toFixed(2)),
    sentiment,
    summary: text(result.summary, 1_200) || 'A análise não produziu um resumo confiável.',
    purchase_signals: list(result.purchase_signals),
    objections: list(result.objections),
    risks: list(result.risks),
    missing_information: list(result.missing_information),
    next_best_action: text(result.next_best_action, 700) || 'Revisar a conversa antes de agir.',
    suggested_reply: text(result.suggested_reply, 1_000) || null,
    evidence,
    messages_analyzed: context.messages.length,
    transcript_truncated: truncated || context.messages.length < context.totalMessageCount,
    model_used: partials.length > 1 ? 'routed:deep-consolidation' : 'routed:single-pass',
  };
}
