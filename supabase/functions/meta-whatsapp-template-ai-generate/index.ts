// meta-whatsapp-template-ai-generate
// Gera um template WhatsApp HSM seguindo best practices da Meta usando IA.
// Retorna JSON pronto para popular o editor (NÃO submete à Meta).
// verify_jwt = true (chamado pela UI logada).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { aiChat, describeAIError } from '../_shared/ai-call.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeneratedTemplate {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    example?: { body_text?: string[][]; header_text?: string[] };
    buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phone_number?: string }>;
  }>;
  variable_labels: Record<string, string>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const body = await req.json().catch(() => ({}));
  const {
    connection_id,
    objective,
    tone = 'profissional consultivo',
    category = 'UTILITY',
    language = 'pt_BR',
    include_optout_button = true,
    audience_hint = '',
    org_context = '',
  } = body ?? {};

  if (!connection_id || !objective) return json({ error: 'connection_id e objective são obrigatórios' }, 400);

  const { data: conn } = await sb.from('whatsapp_meta_connections').select('organization_id, display_name').eq('id', connection_id).maybeSingle();
  if (!conn) return json({ error: 'connection not found' }, 404);

  const systemPrompt = `Você é especialista em criar templates HSM aprovados pela Meta WhatsApp Cloud API.

REGRAS OBRIGATÓRIAS:
1. Nome: snake_case, máximo 60 chars, apenas [a-z0-9_], descritivo (ex: abertura_webinar_v1).
2. Categoria escolhida: ${category}
   - MARKETING: promoções, lembretes de evento, reativação. EXIGE opt-out.
   - UTILITY: confirmações operacionais (pedido, agendamento, ticket). Não pode ter teor promocional.
   - AUTHENTICATION: apenas OTP/códigos.
3. Body: máximo 1024 chars, claro, direto, sem caps excessivo, sem exagero comercial ("PROMOÇÃO IMPERDÍVEL!!!").
4. Variáveis numeradas {{1}}, {{2}}... sequenciais começando em {{1}}. Para cada variável forneça um exemplo realista em "example.body_text".
5. Idioma: ${language}.
6. ${include_optout_button ? 'INCLUA OBRIGATORIAMENTE 1 botão Quick Reply com texto "Sair da lista" (será usado para opt-out automático).' : 'Sem botões de opt-out.'}
7. Pode incluir Footer curto (máx 60 chars) com identificação ou disclaimer.
8. EVITAR gatilhos de rejeição: emojis excessivos, urgência falsa ("ÚLTIMA CHANCE"), promessas absolutas, claims de saúde sem disclaimer.

Retorne APENAS JSON no formato:
{
  "name": "snake_case_name",
  "language": "${language}",
  "category": "${category}",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Opcional, máx 60 chars com no máx 1 variável" },
    { "type": "BODY", "text": "Corpo com {{1}} variáveis", "example": { "body_text": [["valor1", "valor2"]] } },
    { "type": "FOOTER", "text": "Opcional" },
    { "type": "BUTTONS", "buttons": [{ "type": "QUICK_REPLY", "text": "Sair da lista" }] }
  ],
  "variable_labels": { "1": "nome_do_lead", "2": "nome_do_evento" }
}`;

  const userPrompt = `Empresa: ${conn.display_name}${org_context ? '\nContexto: ' + org_context : ''}
Objetivo do template: ${objective}
Tom: ${tone}
Público: ${audience_hint || 'leads B2C que se cadastraram via formulário'}

Gere o template completo seguindo as regras.`;

  try {
    const { response, config } = await aiChat({
      supabase: sb,
      organizationId: conn.organization_id,
      capability: 'content_generation',
      model: 'google/gemini-3-flash-preview',
      label: 'meta-template-ai',
      body: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      },
    });

    if (!response.ok) {
      return json({ error: await describeAIError(response, config.provider) }, response.status);
    }
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: GeneratedTemplate;
    try { parsed = JSON.parse(raw); }
    catch {
      // tenta limpar code fences
      const cleaned = String(raw).replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    // Saneamento mínimo
    parsed.name = String(parsed.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);
    parsed.language = parsed.language || language;
    parsed.category = (parsed.category as any) || category;
    parsed.components = Array.isArray(parsed.components) ? parsed.components : [];
    parsed.variable_labels = parsed.variable_labels || {};

    return json({ ok: true, template: parsed });
  } catch (e) {
    console.error('[meta-template-ai] error', e);
    return json({ error: (e as Error).message || 'erro ao gerar template' }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
