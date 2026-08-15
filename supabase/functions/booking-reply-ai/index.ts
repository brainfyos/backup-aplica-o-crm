// booking-reply-ai
// Quando o lead responde texto livre a uma confirmação/lembrete de booking,
// a IA interpreta a intenção e executa: confirm | reschedule | cancel | followup.
//
// Entrada: { booking_id, organization_id, message_text, instance_id?, phone? }
// Saída: { ok, intent, reply_text }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { resolveAIConfig, prepareAIRequestBody } from "../_shared/ai-router.ts";
import { buildTemporalPromptBlock } from "../_shared/temporalContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "confirm_booking",
      description: "Confirma a reunião quando o lead aceita o horário atual.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_booking",
      description: "Reagenda a reunião para um novo horário proposto pelo lead.",
      parameters: {
        type: "object",
        properties: {
          new_start_iso: {
            type: "string",
            description: "Novo horário em ISO 8601 com timezone (ex: 2026-06-13T16:00:00-03:00).",
          },
        },
        required: ["new_start_iso"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_booking",
      description: "Cancela a reunião quando o lead não pode mais e não quer reagendar agora.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_followup",
      description: "Cria um follow-up futuro quando o lead pede para ser chamado depois (ex: semana que vem).",
      parameters: {
        type: "object",
        properties: {
          when_iso: { type: "string", description: "Quando fazer o follow-up (ISO 8601)." },
          reason: { type: "string" },
        },
        required: ["when_iso"],
        additionalProperties: false,
      },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { booking_id, organization_id, message_text, instance_id } = body || {};

  if (!booking_id || !message_text) {
    return json({ error: "missing booking_id or message_text" }, 400);
  }

  // Load booking context
  const { data: booking, error: bErr } = await supabase
    .from("booking_requests")
    .select("*, booking_event_types(name, duration_minutes), profiles:host_user_id(full_name)")
    .eq("id", booking_id)
    .maybeSingle();
  if (bErr || !booking) return json({ error: "booking not found" }, 404);

  const tz = booking.timezone || "America/Sao_Paulo";
  const startStr = new Date(booking.start_time).toLocaleString("pt-BR", { timeZone: tz });
  const nowStr = new Date().toLocaleString("pt-BR", { timeZone: tz });

  const systemPrompt = `Você é um assistente de agendamento profissional, consultivo e direto (estilo SPIN). Máximo 2 linhas por mensagem.

Contexto da reunião:
- Lead: ${booking.guest_name}
- Anfitrião: ${booking.profiles?.full_name || "Vendedor"}
- Evento: ${booking.booking_event_types?.name || "Reunião"}
- Horário atual: ${startStr} (${tz})
- Agora: ${nowStr}

Sua tarefa: interpretar a resposta do lead e chamar UMA tool apropriada:
- Se confirma/aceita → confirm_booking
- Se pede outro horário específico → reschedule_booking(new_start_iso) — converta data/hora natural para ISO 8601 com offset -03:00 (Brasília). NÃO invente: se não der pra inferir data exata, prefira propose_followup.
- Se cancela definitivamente → cancel_booking
- Se diz "não posso agora, me chama depois/semana que vem/mês que vem" → propose_followup(when_iso) com data aproximada

Sempre execute UMA tool. Depois escreva uma resposta curta e gentil para enviar ao lead via WhatsApp (máx 2 linhas, 1 emoji).${buildTemporalPromptBlock(tz)}`;

  let aiCfg;
  try {
    aiCfg = await resolveAIConfig(supabase, organization_id || booking.organization_id, "agent_chat");
  } catch (e: any) {
    console.error("[booking-reply-ai] resolveAIConfig failed:", e?.message || e);
    return json({ error: "AI unavailable" }, 503);
  }

  const requestBody = prepareAIRequestBody({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message_text },
    ],
    tools: TOOLS,
    tool_choice: "required",
    max_tokens: 400,
  }, aiCfg);

  let aiRes: Response;
  try {
    aiRes = await fetch(aiCfg.endpoint, {
      method: "POST",
      headers: aiCfg.headers,
      body: JSON.stringify(requestBody),
    });
  } catch (e: any) {
    console.error("[booking-reply-ai] fetch failed:", e?.message || e);
    return json({ error: "AI fetch failed" }, 502);
  }

  if (!aiRes.ok) {
    const errTxt = await aiRes.text();
    console.error("[booking-reply-ai] AI error", aiRes.status, errTxt);
    return json({ error: "AI error", status: aiRes.status }, 502);
  }

  const aiJson = await aiRes.json();
  const choice = aiJson?.choices?.[0]?.message;
  const toolCall = choice?.tool_calls?.[0];

  let intent = "unknown";
  let replyText = "Recebido! 👍";
  let toolResult: any = {};

  if (toolCall) {
    intent = toolCall.function?.name || "unknown";
    let args: any = {};
    try { args = JSON.parse(toolCall.function?.arguments || "{}"); } catch {}

    try {
      toolResult = await executeIntent(supabase, booking, intent, args);
      replyText = toolResult.reply || choice?.content || replyText;
    } catch (e: any) {
      console.error("[booking-reply-ai] tool exec failed:", e?.message || e);
      replyText = "Tive um problema para processar agora. Pode reformular?";
    }
  } else if (choice?.content) {
    replyText = String(choice.content).trim();
  }

  // Log to booking_logs
  await supabase.from("booking_logs").insert({
    booking_id: booking.id,
    organization_id: booking.organization_id,
    type: "ai_reply_handled",
    channel: "whatsapp",
    payload: { intent, args: toolCall?.function?.arguments, message_text, result: toolResult },
  });

  // Send WhatsApp reply if instance provided
  if (instance_id && booking.guest_phone) {
    try {
      await supabase.functions.invoke("evolution-send", {
        body: {
          organization_id: booking.organization_id,
          instance_id,
          type: "text",
          to: booking.guest_phone.replace(/\D/g, "").replace(/^(\d)/, "55$1").replace(/^5555/, "55"),
          payload: { text: replyText },
        },
      });
    } catch (e: any) {
      console.warn("[booking-reply-ai] send reply failed:", e?.message || e);
    }
  }

  return json({ ok: true, intent, reply_text: replyText });
});

async function executeIntent(supabase: any, booking: any, intent: string, args: any) {
  const now = new Date().toISOString();

  if (intent === "confirm_booking") {
    await supabase.from("booking_requests")
      .update({ status: "confirmado", confirmed_at: now, last_reply_at: now })
      .eq("id", booking.id);
    return { reply: `Perfeito, ${firstName(booking.guest_name)}! Reunião confirmada ✅` };
  }

  if (intent === "cancel_booking") {
    await supabase.from("booking_requests")
      .update({ status: "cancelado", cancellation_reason: args?.reason || "Cancelado via WhatsApp", last_reply_at: now })
      .eq("id", booking.id);
    if (booking.calendar_event_id) {
      await supabase.from("calendar_events").update({ status: "cancelled" }).eq("id", booking.calendar_event_id);
    }
    return { reply: "Tudo bem, cancelei aqui. Se quiser remarcar depois, é só me chamar 🙏" };
  }

  if (intent === "reschedule_booking" && args?.new_start_iso) {
    const newStart = new Date(args.new_start_iso);
    if (isNaN(newStart.getTime())) {
      return { reply: "Pode confirmar o dia e o horário novamente, por favor?" };
    }
    const durMin = booking.booking_event_types?.duration_minutes || 30;
    const newEnd = new Date(newStart.getTime() + durMin * 60_000);

    await supabase.from("booking_requests").update({
      status: "reagendamento_solicitado",
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
      last_reply_at: now,
    }).eq("id", booking.id);

    if (booking.calendar_event_id) {
      await supabase.from("calendar_events").update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
      }).eq("id", booking.calendar_event_id);
    }

    const niceWhen = newStart.toLocaleString("pt-BR", { timeZone: booking.timezone || "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    return { reply: `Anotei o novo horário: ${niceWhen} 📅 Em breve te confirmo!` };
  }

  if (intent === "propose_followup" && args?.when_iso) {
    const when = new Date(args.when_iso);
    if (!isNaN(when.getTime()) && booking.host_user_id) {
      // Find lead by phone (best-effort)
      let leadId: string | null = null;
      if (booking.guest_phone) {
        const suffix = booking.guest_phone.replace(/\D/g, "").slice(-10);
        const { data: leads } = await supabase
          .from("leads")
          .select("id, phone")
          .eq("organization_id", booking.organization_id)
          .limit(20);
        const match = (leads || []).find((l: any) => (l.phone || "").replace(/\D/g, "").endsWith(suffix));
        leadId = match?.id || null;
      }

      await supabase.from("tasks").insert({
        user_id: booking.host_user_id,
        lead_id: leadId,
        title: `Follow-up agendamento — ${booking.guest_name}`,
        description: `Lead pediu para ser chamado depois.${args?.reason ? " Motivo: " + args.reason : ""}`,
        type: "callback",
        status: "pending",
        priority: "high",
        due_date: when.toISOString(),
        created_by: booking.host_user_id,
      });

      await supabase.from("booking_requests")
        .update({ status: "cancelado", cancellation_reason: "Pediu follow-up futuro", last_reply_at: now })
        .eq("id", booking.id);

      const niceWhen = when.toLocaleString("pt-BR", { timeZone: booking.timezone || "America/Sao_Paulo", dateStyle: "short" });
      return { reply: `Sem problema! Vou te chamar de novo em ${niceWhen} 📞` };
    }
  }

  return { reply: "Recebido! Em breve retorno." };
}

function firstName(full: string): string {
  return (full || "").trim().split(/\s+/)[0] || "tudo certo";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
