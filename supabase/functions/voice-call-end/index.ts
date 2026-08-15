// Finaliza uma sessão de Ligação Web: consolida transcript, dados capturados, CTAs clicados
// e (opcional) dispara webhook de resposta configurado na campanha.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const {
      session_id,
      transcript,
      captured_data,
      ctas_clicked,
      duration_sec,
      outcome,
      outcome_data,
    } = body || {};
    if (!session_id) return json({ error: 'session_id is required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const patch: Record<string, any> = {
      ended_at: new Date().toISOString(),
    };
    if (Array.isArray(transcript)) patch.transcript = transcript;
    if (captured_data && typeof captured_data === 'object') patch.captured_data = captured_data;
    if (Array.isArray(ctas_clicked)) patch.ctas_clicked = ctas_clicked;
    if (typeof duration_sec === 'number') patch.duration_sec = duration_sec;
    if (outcome) patch.outcome = outcome;
    if (outcome_data && typeof outcome_data === 'object') patch.summary = { ...(outcome_data as any) };

    const { data: session, error } = await admin
      .from('voice_call_sessions')
      .update(patch)
      .eq('id', session_id)
      .select('*, voice_calls(*)')
      .single();
    if (error) return json({ error: error.message }, 500);

    // ============ Custo estimado ============
    try {
      const s: any = session;
      const provider: string | null = s.provider || null;
      const model: string | null = s.model || null;
      const dur = Number(s.duration_sec || 0);
      if (provider && dur > 0) {
        // Carrega tarifas ativas do provider/model
        let pricingQ = admin.from('voice_pricing').select('*').eq('provider', provider).eq('is_active', true);
        if (model) pricingQ = pricingQ.or(`model.eq.${model},model.is.null`);
        const { data: pricing } = await pricingQ;
        const rates = (pricing || []) as any[];
        const findRate = (unit: string) => {
          const exact = rates.find((r) => r.unit === unit && (!model || r.model === model));
          return exact || rates.find((r) => r.unit === unit) || null;
        };

        // Se provider não instrumentou audio_seconds, aproxima pela duração (assume 50/50)
        let inSec = Number(s.audio_seconds_in || 0);
        let outSec = Number(s.audio_seconds_out || 0);
        if (inSec === 0 && outSec === 0) {
          inSec = dur / 2;
          outSec = dur / 2;
        }

        let cost = 0;
        const snapshot: any = { provider, model, computed_from: {} };

        const rateMin = findRate('minute');
        const rateAudioIn = findRate('audio_second_in');
        const rateAudioOut = findRate('audio_second_out');
        const rateAudio = findRate('audio_second');

        if (rateAudioIn || rateAudioOut) {
          if (rateAudioIn) { cost += inSec * Number(rateAudioIn.usd_per_unit); snapshot.audio_in = { rate: rateAudioIn.usd_per_unit, seconds: inSec }; }
          if (rateAudioOut) { cost += outSec * Number(rateAudioOut.usd_per_unit); snapshot.audio_out = { rate: rateAudioOut.usd_per_unit, seconds: outSec }; }
        } else if (rateAudio) {
          cost += (inSec + outSec) * Number(rateAudio.usd_per_unit);
          snapshot.audio = { rate: rateAudio.usd_per_unit, seconds: inSec + outSec };
        } else if (rateMin) {
          cost += (dur / 60) * Number(rateMin.usd_per_unit);
          snapshot.minute = { rate: rateMin.usd_per_unit, minutes: dur / 60 };
        }

        const rateTokIn = findRate('token_in');
        const rateTokOut = findRate('token_out');
        if (rateTokIn && Number(s.tokens_in || 0) > 0) { cost += Number(s.tokens_in) * Number(rateTokIn.usd_per_unit); snapshot.tokens_in = { rate: rateTokIn.usd_per_unit, tokens: Number(s.tokens_in) }; }
        if (rateTokOut && Number(s.tokens_out || 0) > 0) { cost += Number(s.tokens_out) * Number(rateTokOut.usd_per_unit); snapshot.tokens_out = { rate: rateTokOut.usd_per_unit, tokens: Number(s.tokens_out) }; }

        await admin.from('voice_call_sessions').update({
          cost_usd_estimated: Number(cost.toFixed(6)),
          pricing_snapshot: snapshot,
          audio_seconds_in: inSec,
          audio_seconds_out: outSec,
        } as any).eq('id', session_id);
      }
    } catch (e) {
      console.warn('[voice-call-end] cost estimation failed', e);
    }


    // Fecha o call_logs correspondente (criado por voice-call-start) — sem isso a aba "Ao Vivo" acumula.
    try {
      const durForLog = typeof duration_sec === 'number' ? duration_sec : null;
      const { error: clErr } = await admin
        .from('call_logs')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          ...(durForLog !== null ? { duration_sec: durForLog } : {}),
          ...(outcome ? { outcome } : {}),
        } as any)
        .filter('metadata->>voice_call_session_id', 'eq', session_id)
        .is('ended_at', null);
      if (clErr) console.warn('[voice-call-end] call_logs close failed', clErr.message);
    } catch (e) {
      console.warn('[voice-call-end] call_logs close exception', e);
    }


    // Atualiza estatísticas leves da campanha
    const call = (session as any).voice_calls;
    if (call) {
      const stats = (call.stats || {}) as Record<string, number>;
      const nextStats = {
        ...stats,
        calls: (stats.calls || 0) + 1,
        conversions: (stats.conversions || 0) + (outcome === 'agendou_reuniao' || outcome === 'lead_qualificado' ? 1 : 0),
      };
      await admin.from('voice_calls').update({ stats: nextStats } as any).eq('id', call.id);

      // Webhook opcional
      const webhookUrl = call.tracking?.webhook_url;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'voice_call.ended',
              campaign: { id: call.id, name: call.name, slug: call.slug },
              session,
            }),
          });
        } catch (e) {
          console.warn('[voice-call-end] webhook failed', e);
        }
      }
    }

    // ============ FASE 8: Automações pós-chamada ============
    // Regras em call.post_call_automations.rules = [{ outcome, cadence_id?, create_task?, task_title?, task_priority?, task_due_hours?, notify_admins? }]
    try {
      const leadId = (session as any).lead_id as string | null;
      const orgId = (session as any).organization_id as string;
      const rules = ((call?.post_call_automations as any)?.rules || []) as Array<any>;
      const matched = rules.filter((r) => r && r.outcome && r.outcome === outcome);

      for (const rule of matched) {
        // 1) Enroll em cadência
        if (rule.cadence_id && leadId) {
          try {
            fetch(`${SUPABASE_URL}/functions/v1/cadence-enroll`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${SERVICE_KEY}`,
              },
              body: JSON.stringify({
                cadence_id: rule.cadence_id,
                lead_ids: [leadId],
                source: 'voice_call',
                source_ref: { voice_call_id: call.id, session_id, outcome },
              }),
            }).catch((e) => console.warn('[voice-call-end] cadence-enroll failed', e));
          } catch (e) {
            console.warn('[voice-call-end] cadence-enroll error', e);
          }
        }

        // 2) Criar task
        if (rule.create_task && leadId) {
          try {
            const dueHours = Number(rule.task_due_hours ?? 24);
            const due = new Date(Date.now() + dueHours * 3_600_000).toISOString();
            // Descobre um user_id "dono" para a task: assigned_to do lead ou created_by da campanha
            const { data: lead } = await admin
              .from('leads')
              .select('assigned_to')
              .eq('id', leadId)
              .maybeSingle();
            const ownerId = (lead as any)?.assigned_to || (call as any)?.created_by;
            if (ownerId) {
              await admin.from('tasks').insert({
                organization_id: orgId,
                user_id: ownerId,
                lead_id: leadId,
                title: rule.task_title || `Follow-up: ${outcome}`,
                description: `Gerado automaticamente pela ligação "${call.name}" (outcome: ${outcome}).`,
                due_date: due,
                priority: rule.task_priority || 'medium',
                status: 'pending',
                type: 'voice_call_followup',
              });
            }
          } catch (e) {
            console.warn('[voice-call-end] task insert failed', e);
          }
        }

        // 3) Notificar admins
        if (rule.notify_admins) {
          try {
            await admin.from('admin_notifications').insert({
              organization_id: orgId,
              type: 'voice_call_outcome',
              title: `Ligação "${call.name}" — ${outcome}`,
              message: leadId
                ? `Novo desfecho registrado pela IA em uma chamada de captação.`
                : `Ligação sem lead associado teve desfecho: ${outcome}.`,
              metadata: {
                voice_call_id: call.id,
                session_id,
                lead_id: leadId,
                outcome,
                duration_sec: duration_sec ?? null,
              },
            });
          } catch (e) {
            console.warn('[voice-call-end] admin_notifications insert failed', e);
          }
        }
      }

      // 4) Notificação padrão para outcomes de alto valor mesmo sem regra explícita
      const highValue = outcome === 'agendou_reuniao' || outcome === 'lead_qualificado';
      if (highValue && !matched.some((r) => r.notify_admins)) {
        try {
          await admin.from('admin_notifications').insert({
            organization_id: orgId,
            type: 'voice_call_high_value',
            title: outcome === 'agendou_reuniao' ? `Novo agendamento via ligação IA` : `Lead qualificado via ligação IA`,
            message: `Campanha "${call.name}" acabou de gerar um desfecho de alto valor.`,
            metadata: { voice_call_id: call.id, session_id, lead_id: leadId, outcome },
          });
        } catch (e) {
          console.warn('[voice-call-end] high-value notification failed', e);
        }
      }

      // 5) Cadência padrão pós-chamada (voice_calls.post_cadence_id) — dispara sempre que houver lead,
      // independentemente das regras por outcome, se ainda não houve enroll da mesma cadência via regra.
      try {
        const defaultCadenceId = (call as any)?.post_cadence_id as string | null;
        const alreadyByRule = matched.some((r) => r.cadence_id === defaultCadenceId);
        if (defaultCadenceId && leadId && !alreadyByRule) {
          fetch(`${SUPABASE_URL}/functions/v1/cadence-enroll`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({
              cadence_id: defaultCadenceId,
              lead_ids: [leadId],
              source: 'voice_call_default',
              source_ref: { voice_call_id: call.id, session_id, outcome },
            }),
          }).catch((e) => console.warn('[voice-call-end] default cadence-enroll failed', e));
        }
      } catch (e) {
        console.warn('[voice-call-end] default cadence dispatch error', e);
      }
    } catch (e) {
      console.warn('[voice-call-end] post-call automations error', e);
    }

    // ============ Fallback automático: callback / followup técnico ============
    // Quando a IA registra outcome="callback" ou outcome_data.followup_needed,
    // cria uma task de retorno pra que o time humano feche a dúvida no WhatsApp.
    try {
      const leadId = (session as any).lead_id as string | null;
      const orgId = (session as any).organization_id as string;
      const captured = ((session as any).captured_data || {}) as Record<string, any>;
      const wa = captured.whatsapp || captured.telefone || captured.phone || null;
      const needsFollowup = outcome === 'callback'
        || (outcome_data && typeof outcome_data === 'object' && (outcome_data as any).followup_needed);
      const summary = (outcome_data && typeof outcome_data === 'object' && (outcome_data as any).resumo)
        || (outcome_data && typeof outcome_data === 'object' && (outcome_data as any).summary)
        || null;

      if (needsFollowup && leadId) {
        const { data: lead } = await admin
          .from('leads')
          .select('assigned_to, phone, name')
          .eq('id', leadId)
          .maybeSingle();
        const ownerId = (lead as any)?.assigned_to || (call as any)?.created_by;
        if (ownerId) {
          const waNormalized = wa ? String(wa).replace(/\D/g, '') : ((lead as any)?.phone || null);
          const due = new Date(Date.now() + 2 * 3_600_000).toISOString(); // 2h
          await admin.from('tasks').insert({
            organization_id: orgId,
            user_id: ownerId,
            lead_id: leadId,
            title: `Retornar dúvida — ligação "${call?.name || 'IA'}"`,
            description: [
              `A IA não teve resposta pra uma pergunta do lead durante a ligação.`,
              summary ? `Resumo: ${summary}` : null,
              waNormalized ? `WhatsApp capturado: ${waNormalized}` : `⚠️ WhatsApp NÃO capturado.`,
              `Sessão: ${session_id}`,
            ].filter(Boolean).join('\n'),
            due_date: due,
            priority: 'high',
            status: 'pending',
            type: 'voice_call_followup',
          });
        }
      }
    } catch (e) {
      console.warn('[voice-call-end] followup task fallback failed', e);
    }

    // Dispara análise IA em background (não bloqueia o encerramento)
    try {
      const hasTranscript = Array.isArray(transcript) && transcript.length > 0;
      if (hasTranscript) {
        const analyzeUrl = `${SUPABASE_URL}/functions/v1/voice-call-analyze`;
        fetch(analyzeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ session_id }),
        }).catch((e) => console.warn('[voice-call-end] analyze fire-and-forget failed', e));
      }
    } catch (e) {
      console.warn('[voice-call-end] analyze dispatch error', e);
    }

    return json({ ok: true, session });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
