// Gera resumo, sentimento, intenção, próximos passos e score a partir da transcrição
// de uma sessão de Ligação Web. Público (verify_jwt=false): opera via service role
// e valida sempre pela session_id.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { aiChat } from '../_shared/ai-call.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeJson(text: string): any {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  try { return JSON.parse(raw); } catch { /* try to extract */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* noop */ } }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { session_id } = await req.json().catch(() => ({}));
    if (!session_id) return json({ error: 'session_id is required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: session, error } = await admin
      .from('voice_call_sessions')
      .select('*, voice_calls(name, context, objective, ctas)')
      .eq('id', session_id)
      .maybeSingle();
    if (error || !session) return json({ error: 'session not found' }, 404);

    const transcript = Array.isArray((session as any).transcript) ? (session as any).transcript : [];
    if (transcript.length === 0) {
      return json({ error: 'transcrição vazia — nada para analisar' }, 400);
    }

    const call = (session as any).voice_calls || {};
    const ctas = Array.isArray(call.ctas) ? call.ctas : [];
    const captured = (session as any).captured_data || {};
    const ctasClicked = (session as any).ctas_clicked || [];
    const outcome = (session as any).outcome || null;
    const durationSec = (session as any).duration_sec || 0;

    const dialogue = transcript
      .map((t: any) => `${t.role === 'assistant' ? 'IA' : 'LEAD'}: ${t.text || ''}`.trim())
      .filter(Boolean)
      .join('\n');

    const systemPrompt = `Você é um analista de vendas sênior. Analisa uma ligação real (áudio → texto)
entre uma IA de vendas e um lead. Devolve APENAS um JSON válido, sem markdown, sem comentários.

Estrutura EXATA (use exatamente estas chaves):
{
  "summary": string,              // 1-2 frases, direto ao ponto, PT-BR
  "sentiment": "positivo" | "neutro" | "negativo",
  "intent": "alta" | "media" | "baixa",   // intenção de compra
  "lead_score": number,           // 0-100, quão qualificado ficou o lead
  "objections": string[],         // objeções levantadas pelo lead (máx 3)
  "interests": string[],          // tópicos que geraram engajamento (máx 5)
  "next_steps": string[],         // ações recomendadas para o time de vendas (máx 4)
  "highlights": string[]          // 2-4 frases marcantes do lead (aspas do lead)
}`;

    const userPrompt = `Contexto da campanha:
- Nome: ${call.name || '—'}
- Objetivo: ${call.objective || '—'}
- Contexto extra: ${call.context || '—'}
- CTAs disponíveis: ${ctas.map((c: any) => c.label).join(', ') || 'nenhum'}

Metadados da sessão:
- Duração: ${durationSec}s
- Desfecho declarado: ${outcome || 'sem_desfecho'}
- Dados capturados: ${JSON.stringify(captured)}
- CTAs disparados: ${ctasClicked.map((c: any) => c.tool).join(', ') || 'nenhum'}

Transcrição:
${dialogue}`;

    const { response } = await aiChat({
      supabase: admin,
      organizationId: (session as any).organization_id,
      capability: 'analysis_insights',
      model: 'google/gemini-3-flash-preview',
      label: 'voice-call-analyze',
      body: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[voice-call-analyze] AI error', response.status, text);
      if (response.status === 429) return json({ error: 'Rate limit' }, 429);
      if (response.status === 402) return json({ error: 'Créditos IA esgotados' }, 402);
      return json({ error: 'AI failed', detail: text.slice(0, 400) }, 500);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const analysis = safeJson(content) || { summary: content.slice(0, 500), raw: true };

    const now = new Date().toISOString();
    await admin
      .from('voice_call_sessions')
      .update({ ai_analysis: analysis, ai_analysis_at: now })
      .eq('id', session_id);

    return json({ ok: true, analysis, ai_analysis_at: now });
  } catch (e) {
    console.error('[voice-call-analyze]', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
