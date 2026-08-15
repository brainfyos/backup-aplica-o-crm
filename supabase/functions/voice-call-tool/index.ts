// Executa ações server-side disparadas por tools da IA durante uma Ligação Web.
// Público (verify_jwt=false): só age em cima de uma session válida.
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

interface Payload {
  session_id: string;
  tool_name: string;
  args: Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { session_id, tool_name, args } = (await req.json()) as Payload;
    if (!session_id || !tool_name) return json({ error: 'session_id e tool_name obrigatórios' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Sessão + campanha
    const { data: session, error: sErr } = await admin
      .from('voice_call_sessions')
      .select('*, voice_calls!inner(*)')
      .eq('id', session_id)
      .maybeSingle();
    if (sErr || !session) return json({ error: 'session not found' }, 404);
    const call = (session as any).voice_calls;
    const orgId = session.organization_id;
    const leadId = session.lead_id;
    const ctas: any[] = Array.isArray(call.ctas) ? call.ctas : [];

    // ============= salvar_dado / salvar_<key> =============
    if (tool_name === 'salvar_dado_lead' || tool_name.startsWith('salvar_')) {
      const key = tool_name === 'salvar_dado_lead' ? String(args?.chave || 'dado') : tool_name.replace(/^salvar_/, '');
      const value = args?.valor ?? args?.value ?? args?.chave;
      const nextCaptured = { ...(session.captured_data || {}), [key]: value };
      await admin.from('voice_call_sessions').update({ captured_data: nextCaptured }).eq('id', session_id);

      if (leadId) {
        const leadPatch: Record<string, any> = {};
        if (['nome', 'name'].includes(key.toLowerCase())) leadPatch.name = String(value);
        if (['whatsapp', 'telefone', 'phone'].includes(key.toLowerCase())) {
          leadPatch.phone = String(value).replace(/\D/g, '');
        }
        if (['email', 'e-mail'].includes(key.toLowerCase())) leadPatch.email = String(value);
        if (Object.keys(leadPatch).length) {
          await admin.from('leads').update(leadPatch).eq('id', leadId);
        }
      }
      return json({ ok: true, saved: { [key]: value } });
    }

    // ============= aplicar_tag_interesse =============
    if (tool_name === 'aplicar_tag_interesse') {
      const ctaId = args?.cta_id;
      const cta = ctas.find((c) => c.id === ctaId && c.kind === 'interest');
      if (!cta) return json({ error: 'cta não encontrada' }, 400);
      if (leadId && cta.tag_id) {
        try {
          await admin.rpc('apply_tag_automations', { p_lead_id: leadId, p_tag_id: cta.tag_id });
        } catch (e) { console.warn('apply_tag_automations failed', e); }
      }
      if (leadId && cta.score) {
        const { data: lead } = await admin.from('leads').select('score').eq('id', leadId).maybeSingle();
        const nextScore = Math.min(100, (lead?.score || 0) + Number(cta.score || 0));
        await admin.from('leads').update({ score: nextScore }).eq('id', leadId);
      }
      const nextClicked = [...((session.ctas_clicked as any[]) || []), { tool: tool_name, cta_id: ctaId, at: new Date().toISOString() }];
      await admin.from('voice_call_sessions').update({ ctas_clicked: nextClicked }).eq('id', session_id);
      return json({ ok: true, label: cta.label });
    }

    // ============= enviar_whatsapp =============
    if (tool_name === 'enviar_whatsapp') {
      const mensagem = String(args?.mensagem || '').trim();
      if (!mensagem) return json({ error: 'mensagem vazia' }, 400);

      // Resolve destino: capture_data.whatsapp OU lead.phone OU cta.whatsapp_target
      const waCta = ctas.find((c) => c.kind === 'whatsapp');
      const captured = (session.captured_data || {}) as Record<string, any>;
      let dest: string | null = captured.whatsapp || captured.telefone || waCta?.whatsapp_target || null;
      if (!dest && leadId) {
        const { data: lead } = await admin.from('leads').select('phone').eq('id', leadId).maybeSingle();
        dest = lead?.phone || null;
      }
      if (!dest) {
        return json({ error: 'sem número de destino', hint: 'IA precisa capturar o WhatsApp antes' }, 400);
      }
      const digits = String(dest).replace(/\D/g, '');
      const phone = digits.startsWith('55') ? digits : `55${digits}`;

      // Cria mensagem agendada para envio pelo dispatcher existente (não bloqueia a chamada)
      try {
        await admin.from('scheduled_messages').insert({
          organization_id: orgId,
          lead_id: leadId,
          channel: 'whatsapp',
          to_phone: phone,
          content: mensagem,
          scheduled_for: new Date().toISOString(),
          status: 'pending',
          metadata: { source: 'voice_call', session_id, campaign: call.name },
        } as any);
      } catch (e) {
        console.warn('scheduled_messages insert failed', e);
      }

      const nextClicked = [...((session.ctas_clicked as any[]) || []), { tool: tool_name, phone, at: new Date().toISOString() }];
      await admin.from('voice_call_sessions').update({ ctas_clicked: nextClicked }).eq('id', session_id);
      return json({ ok: true, phone });
    }

    // ============= listar_horarios_reuniao =============
    if (tool_name === 'listar_horarios_reuniao') {
      const scheduleCta = ctas.find((c) => c.kind === 'schedule');
      const eventTypeId = scheduleCta?.event_type_id;
      if (!eventTypeId) {
        return json({ error: 'agendamento não configurado nesta ligação' }, 400);
      }
      const daysAhead = Math.min(Math.max(Number(args?.dias_a_frente || 10), 1), 14);
      const preferred = typeof args?.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.data)
        ? args.data
        : null;

      const dates: string[] = [];
      if (preferred) {
        dates.push(preferred);
        const d = new Date(preferred + 'T00:00:00');
        for (let i = 1; i <= daysAhead && dates.length < daysAhead; i++) {
          const nd = new Date(d.getTime() + i * 86400000);
          dates.push(nd.toISOString().slice(0, 10));
        }
      } else {
        const today = new Date();
        for (let i = 0; i < daysAhead; i++) {
          const nd = new Date(today.getTime() + i * 86400000);
          dates.push(nd.toISOString().slice(0, 10));
        }
      }

      const timezone = 'America/Sao_Paulo';
      const collected: Array<{ start: string; end: string; label: string; date: string }> = [];
      for (const date of dates) {
        try {
          const { data: availData, error: availErr } = await admin.functions.invoke('booking-availability', {
            body: { eventTypeId, date, timezone },
          });
          if (availErr) { console.warn('[listar_horarios_reuniao] avail err', date, availErr); continue; }
          const slots = Array.isArray(availData?.slots) ? availData.slots : [];
          for (const s of slots) {
            if (!s.available) continue;
            const startIso = `${date}T${s.start}:00`;
            const endIso = `${date}T${s.end}:00`;
            const d = new Date(startIso + '-03:00');
            const dayName = d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: timezone });
            const dayMonth = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: timezone });
            const label = `${dayName} ${dayMonth} às ${s.start}`;
            collected.push({ start: startIso, end: endIso, label, date });
            if (collected.length >= 6) break;
          }
        } catch (e) {
          console.warn('[listar_horarios_reuniao] fail', date, e);
        }
        if (collected.length >= 6) break;
      }

      // NUNCA retornar `error` — apenas slots (mesmo que vazio) com uma dica interna
      // para o modelo tentar ampliar a janela. A UI usa `slots` para renderizar cards.
      if (!collected.length) {
        return json({
          slots: [],
          hint: 'Nenhum horário nos próximos dias. Tente chamar novamente com dias_a_frente=14 ou uma data específica. NUNCA diga ao lead que não há horários.',
        });
      }
      return json({ slots: collected });
    }

    // ============= confirmar_agendamento_reuniao =============
    if (tool_name === 'confirmar_agendamento_reuniao') {
      const scheduleCta = ctas.find((c) => c.kind === 'schedule');
      const eventTypeId = scheduleCta?.event_type_id;
      if (!eventTypeId) {
        return json({ error: 'agendamento não configurado nesta ligação' }, 400);
      }
      const startTime = String(args?.start_time || args?.startTime || '').trim();
      if (!startTime) return json({ error: 'start_time obrigatório (use listar_horarios_reuniao primeiro)' }, 400);

      // Resolve contato — args → captured_data → lead
      const captured = (session.captured_data || {}) as Record<string, any>;
      let leadRow: any = null;
      if (leadId) {
        const { data: l } = await admin.from('leads').select('name, email, phone').eq('id', leadId).maybeSingle();
        leadRow = l;
      }
      const guestName = String(
        args?.nome || args?.name ||
        captured.nome || captured.name ||
        leadRow?.name ||
        session.visitor_name ||
        'Cliente da ligação'
      ).trim();

      let guestEmail = String(
        args?.email || captured.email || captured['e-mail'] || leadRow?.email || ''
      ).trim();
      let guestPhone = String(
        args?.telefone || args?.phone || args?.whatsapp ||
        captured.whatsapp || captured.telefone || captured.phone ||
        leadRow?.phone || ''
      ).replace(/\D/g, '');

      if (guestPhone && !guestPhone.startsWith('55')) guestPhone = `55${guestPhone}`;

      if (!guestEmail) {
        // booking-submit exige email — fallback local (mesmo padrão do SlotPicker)
        const safeName = guestName.replace(/\s+/g, '.').toLowerCase() || 'guest';
        guestEmail = `${safeName}@no-email.local`;
      }

      const { data: submitData, error: submitErr } = await admin.functions.invoke('booking-submit', {
        body: {
          eventTypeId,
          startTime,
          guestName,
          guestEmail,
          guestPhone: guestPhone || undefined,
          timezone: 'America/Sao_Paulo',
          tracking: { source: 'voice_call', session_id, lead_id: leadId, campaign: call.name },
        },
      });
      if (submitErr || submitData?.error) {
        const detail = submitData?.error || submitErr?.message || 'falha ao agendar';
        console.error('[confirmar_agendamento_reuniao] booking-submit failed', detail);
        return json({ agendado: false, error: detail }, 200);
      }

      const evt = submitData?.event || {};
      const link = evt.meeting_link || evt.location_details?.link || null;
      const startIso = evt.start_time || startTime;
      const endIso = evt.end_time || null;

      const nextClicked = [
        ...((session.ctas_clicked as any[]) || []),
        {
          tool: 'confirmar_agendamento_reuniao',
          event_id: evt.id || null,
          start: startIso,
          end: endIso,
          link,
          at: new Date().toISOString(),
        },
      ];
      await admin.from('voice_call_sessions').update({ ctas_clicked: nextClicked }).eq('id', session_id);

      return json({
        agendado: true,
        event_id: evt.id || null,
        start: startIso,
        end: endIso,
        link,
        guest_name: guestName,
      });
    }

    return json({ error: `tool não suportada: ${tool_name}` }, 400);
  } catch (e) {
    console.error('[voice-call-tool]', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
