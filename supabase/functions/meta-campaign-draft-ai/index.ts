// meta-campaign-draft-ai — transforma texto livre em um rascunho de campanha estruturado.
// POST { description, organization_id?, mode?: 'draft'|'regenerate_copy', base?, style? }
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DRAFT_SCHEMA_HINT = `Retorne SOMENTE JSON válido no formato:
{
  "nome_sugerido": "string",
  "produto": "string",
  "oferta": "string",
  "publico_texto": "string",
  "localizacao": { "paises": ["BR"], "cidades": [], "idade_min": 18, "idade_max": 65, "interesses": ["string"] },
  "orcamento_diario_brl": 100,
  "destino": "whatsapp" | "form" | "quiz" | "url",
  "tom": "string",
  "copies": [
    { "primary_text": "string até 300 chars", "headline": "string até 40 chars", "description": "string até 30 chars", "cta": "LEARN_MORE" }
  ],
  "mensagem_inicial_whatsapp": "string curta com placeholder [Nome] se fizer sentido"
}
Gere 3 copies variados (direto, consultivo, provocativo). Português BR.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: claims } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
  if (!claims?.claims?.sub) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const description = String(body?.description ?? '').trim();
  const mode = body?.mode ?? 'draft';
  const style = body?.style ?? '';
  const base = body?.base ?? null;

  if (mode === 'draft' && !description) return json({ error: 'missing_description' }, 400);

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return json({ error: 'missing_lovable_api_key' }, 500);

  let systemPrompt = 'Você é uma estrategista de tráfego pago sênior para Meta Ads. Objetivo: transformar a ideia do cliente em um rascunho pronto para publicar.';
  let userPrompt = '';

  if (mode === 'draft') {
    userPrompt = `IDEIA DO CLIENTE:\n${description}\n\n${DRAFT_SCHEMA_HINT}`;
  } else if (mode === 'regenerate_copy') {
    systemPrompt += ' Refaça APENAS as 3 copies mantendo o contexto do rascunho existente.';
    userPrompt = `RASCUNHO:\n${JSON.stringify(base, null, 2)}\n\nESTILO SOLICITADO: ${style || 'variar sem repetir'}\n\nRetorne SOMENTE JSON: { "copies": [ { "primary_text": "...", "headline": "...", "description": "...", "cta": "LEARN_MORE" } ] }`;
  } else {
    return json({ error: 'invalid_mode' }, 400);
  }

  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': apiKey },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ error: 'ai_error', details: t.slice(0, 500) }, 502);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '{}';
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { return json({ error: 'invalid_ai_json', raw: content }, 502); }
    return json({ ok: true, draft: parsed });
  } catch (e) {
    return json({ error: 'unexpected', details: (e as Error).message }, 500);
  }
});
