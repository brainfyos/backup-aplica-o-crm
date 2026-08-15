// voice-postcall-agent — chamada após call.ended pelo xai-voice-webhook.
// Lê transcrição, gera resumo/sentimento/pontos-chave/próximas-ações via Lovable AI Gateway,
// atualiza call_logs, cria voice_actions e tasks/notas no lead.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const SYSTEM_PROMPT = `Você é um analista de vendas. Recebe a transcrição de uma ligação entre um agente de voz IA e um cliente.
Sua tarefa é retornar EXATAMENTE um JSON com esta forma:

{
  "summary": "1-3 frases em português.",
  "sentiment": "positivo" | "neutro" | "negativo",
  "key_points": ["ponto 1", "ponto 2", ...],
  "next_actions": [
    { "type": "follow_up_call" | "send_email" | "send_whatsapp" | "schedule_meeting" | "update_stage" | "no_action",
      "title": "curto e imperativo",
      "description": "detalhe opcional",
      "due_in_hours": 24 }
  ]
}

Regras:
- Máximo 5 key_points e 3 next_actions.
- Se a ligação não teve conversa útil (não atendeu, mudo, ruído), sentiment="neutro", key_points=[], next_actions=[{ type:"follow_up_call", title:"Retentar ligação", due_in_hours:48 }].
- Nada além do JSON.`;

async function analyze(transcription: string) {
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');
  const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Transcrição da ligação:\n\n${transcription.slice(0, 12000)}` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`AI gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty AI response');
  return JSON.parse(content);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { call_log_id } = await req.json().catch(() => ({}));
    if (!call_log_id) return json({ error: 'call_log_id required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: log } = await admin.from('call_logs').select('*').eq('id', call_log_id).maybeSingle();
    if (!log) return json({ error: 'call_log not found' }, 404);
    if (log.summary) return json({ ok: true, skipped: 'already processed' });

    const transcription = log.transcription_text || '';
    if (!transcription.trim()) {
      await admin.from('call_logs').update({ summary: 'Ligação sem transcrição disponível.', sentiment: 'neutro' }).eq('id', call_log_id);
      return json({ ok: true, empty: true });
    }

    let analysis: any;
    try {
      analysis = await analyze(transcription);
    } catch (e) {
      console.error('[voice-postcall-agent] AI failed', e);
      return json({ error: (e as Error).message }, 502);
    }

    await admin.from('call_logs').update({
      summary: analysis.summary || null,
      sentiment: analysis.sentiment || null,
      key_points: Array.isArray(analysis.key_points) ? analysis.key_points : [],
      next_actions: Array.isArray(analysis.next_actions) ? analysis.next_actions : [],
    }).eq('id', call_log_id);

    // Cria voice_actions + tasks
    const now = Date.now();
    const actions = Array.isArray(analysis.next_actions) ? analysis.next_actions.slice(0, 3) : [];
    for (const a of actions) {
      if (!a?.type || a.type === 'no_action') continue;
      const dueAt = new Date(now + (Number(a.due_in_hours) || 24) * 3600_000).toISOString();
      await admin.from('voice_actions').insert({
        organization_id: log.organization_id,
        call_log_id: log.id,
        lead_id: log.lead_id,
        action_type: a.type,
        title: a.title || a.type,
        description: a.description || null,
        due_at: dueAt,
        payload: {},
        status: 'pending',
      });

      // Se lead existe e a tabela tasks aceita, cria task
      if (log.lead_id) {
        try {
          await admin.from('tasks').insert({
            organization_id: log.organization_id,
            lead_id: log.lead_id,
            title: `[Pós-ligação] ${a.title || a.type}`,
            description: a.description || null,
            due_date: dueAt,
            status: 'pending',
            priority: 'medium',
            task_type: a.type,
          });
        } catch (_) { /* schema variance — ignore */ }
      }
    }

    // Nota no lead com o resumo
    if (log.lead_id && analysis.summary) {
      try {
        await admin.from('lead_notes').insert({
          organization_id: log.organization_id,
          lead_id: log.lead_id,
          content: `📞 Resumo da ligação (${new Date(log.ended_at || log.created_at).toLocaleString('pt-BR')}):\n\n${analysis.summary}\n\nSentimento: ${analysis.sentiment || 'n/a'}${analysis.key_points?.length ? '\n\nPontos:\n- ' + analysis.key_points.join('\n- ') : ''}`,
        });
      } catch (_) { /* ignore */ }
    }

    return json({ ok: true, actions: actions.length });
  } catch (e) {
    console.error('[voice-postcall-agent] error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
