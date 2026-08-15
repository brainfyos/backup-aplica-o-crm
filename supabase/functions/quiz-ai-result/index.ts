// Quiz AI Result — gera diagnóstico personalizado a partir das respostas do quiz.
// Retorna 4 seções: diagnostico, oportunidades, proximos_passos, oferta.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { resolveAIConfig, prepareAIRequestBody } from '../_shared/ai-router.ts';

interface Body {
  funnel_id: string;
  responses: Record<string, string>;
  score_total: number;
  score_tier?: string;
  tags?: string[];
  custom_prompt?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.funnel_id) {
      return new Response(JSON.stringify({ error: 'funnel_id obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: funnel } = await supabase
      .from('capture_funnels')
      .select('organization_id, name, products(name, description)')
      .eq('id', body.funnel_id)
      .maybeSingle();

    const orgId = (funnel as any)?.organization_id || null;
    const productCtx = (funnel as any)?.products
      ? `Produto: ${(funnel as any).products.name}\n${(funnel as any).products.description || ''}`
      : '';

    const cfg = await resolveAIConfig(supabase, orgId, 'content_generation');

    const respLines = Object.entries(body.responses || {})
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');

    const tagLine = body.tags?.length ? `Tags: ${body.tags.join(', ')}` : '';

    const system = body.custom_prompt?.trim() || `Você é um consultor sênior. Com base nas respostas de um quiz de diagnóstico, gere um relatório curto, objetivo e personalizado em português do Brasil. Tom profissional, direto, sem clichês. NUNCA invente dados.`;

    const user = `${productCtx}

Score do respondente: ${body.score_total} (${body.score_tier || 'sem faixa'})
${tagLine}

Respostas:
${respLines}

Retorne APENAS um JSON válido com este formato exato:
{
  "diagnostico": "2-3 frases sobre o cenário atual do respondente",
  "oportunidades": ["item 1", "item 2", "item 3"],
  "proximos_passos": ["passo 1", "passo 2", "passo 3"],
  "oferta": "1 frase com a recomendação/oferta mais relevante"
}`;

    const payload = prepareAIRequestBody({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    }, cfg);

    const aiResp = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify(payload),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error('[quiz-ai-result] AI error:', aiResp.status, errText);
      return new Response(JSON.stringify({
        error: aiResp.status === 429 ? 'Limite de uso da IA atingido. Tente novamente em instantes.'
          : aiResp.status === 402 ? 'Créditos de IA esgotados.'
          : 'Falha ao gerar resultado IA.',
      }), { status: aiResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { parsed = { diagnostico: String(raw).slice(0, 500) }; }

    return new Response(JSON.stringify({
      diagnostico: parsed.diagnostico || '',
      oportunidades: Array.isArray(parsed.oportunidades) ? parsed.oportunidades : [],
      proximos_passos: Array.isArray(parsed.proximos_passos) ? parsed.proximos_passos : [],
      oferta: parsed.oferta || '',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[quiz-ai-result] error:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
