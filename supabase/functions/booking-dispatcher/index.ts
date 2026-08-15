// booking-dispatcher
// Cron-driven dispatcher for booking automation jobs (confirmations, reminders,
// recovery, internal notifications). Picks pending jobs whose scheduled_for has
// arrived, renders the message, sends through Evolution (WhatsApp) and/or the
// email pipeline, and updates booking + status history.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import {
  buildBookingVars,
  renderTemplate,
  DEFAULT_TEMPLATES,
} from "../_shared/booking-templates.ts";
import { authorizePlatformWorker, loadWorkerControl, workerCanRunFor } from "../_shared/worker-control.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 25;

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.replace(/\D/g, "");
  if (!p) return null;
  if (!p.startsWith("55")) p = "55" + p;
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  if (!(await authorizePlatformWorker(supabase, req))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const siteUrl = Deno.env.get("SITE_URL") || "https://app.vendus.com.br";

  const startedAt = Date.now();
  console.log("[booking-dispatcher] tick start");

  const workerControl = await loadWorkerControl(supabase, "booking");
  if (!workerControl.enabled) {
    return new Response(JSON.stringify({ processed: 0, reason: "worker_disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pull due jobs (idempotent: claim by transitioning pending -> processing).
  const { data: candidates, error: pickErr } = await supabase
    .from("booking_scheduled_jobs")
    .select("id, organization_id")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH_SIZE * 10);

  if (pickErr) {
    console.error("[booking-dispatcher] pick error:", pickErr);
    return new Response(JSON.stringify({ error: pickErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!candidates || candidates.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ids = candidates
    .filter((c) => workerCanRunFor(workerControl, c.organization_id))
    .slice(0, BATCH_SIZE)
    .map((c) => c.id);
  if (!ids.length) {
    return new Response(JSON.stringify({ processed: 0, reason: "organizations_paused" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: claimed } = await supabase
    .from("booking_scheduled_jobs")
    .update({ status: "processing", attempts: 1 })
    .in("id", ids)
    .eq("status", "pending")
    .select("*");

  const jobs = claimed || [];
  console.log(`[booking-dispatcher] claimed ${jobs.length}/${ids.length} jobs`);

  let processed = 0;
  for (const job of jobs) {
    try {
      await processJob(supabase, job, siteUrl);
      processed++;
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error("[booking-dispatcher] job failed", job.id, msg);
      await supabase.from("booking_scheduled_jobs")
        .update({ status: "failed", last_error: msg, processed_at: new Date().toISOString() })
        .eq("id", job.id);
      await supabase.from("booking_logs").insert({
        booking_id: job.booking_id,
        organization_id: job.organization_id,
        type: "send_failed",
        channel: job.channel,
        payload: { kind: job.kind, job_id: job.id },
        error: msg,
      });
    }
  }

  console.log(`[booking-dispatcher] tick done in ${Date.now() - startedAt}ms processed=${processed}`);
  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function processJob(supabase: any, job: any, siteUrl: string) {
  // Load booking + event type + settings
  const { data: booking, error: bErr } = await supabase
    .from("booking_requests")
    .select("*, booking_event_types(name, location_type, location_details), profiles:host_user_id(full_name, email, organization_id)")
    .eq("id", job.booking_id)
    .single();
  if (bErr || !booking) throw new Error("booking not found");

  // Skip if booking was already cancelled
  if (["cancelled", "cancelado"].includes(booking.status)) {
    await supabase.from("booking_scheduled_jobs")
      .update({ status: "cancelled", processed_at: new Date().toISOString() })
      .eq("id", job.id);
    return;
  }

  const { data: settings } = await supabase
    .from("booking_notification_settings")
    .select("*")
    .eq("event_type_id", booking.event_type_id)
    .maybeSingle();

  const { data: calendarEvent } = booking.calendar_event_id
    ? await supabase.from("calendar_events").select("meet_link").eq("id", booking.calendar_event_id).maybeSingle()
    : { data: null } as any;

  // Resolve meeting link: Google Meet > manual location_details (if URL) > empty
  const locDetails = booking.booking_event_types?.location_details || "";
  const looksLikeUrl = /^https?:\/\//i.test(locDetails.trim());
  const meetingLink = calendarEvent?.meet_link || (looksLikeUrl ? locDetails.trim() : "");

  // Resolve modalidade label
  const locType = booking.booking_event_types?.location_type || "google_meet";
  const modalidadeMap: Record<string, string> = {
    google_meet: "Google Meet",
    zoom: "Zoom",
    teams: "Microsoft Teams",
    phone: "Telefone",
    in_person: "Presencial",
    custom: locDetails || "Online",
  };
  const modalidade = modalidadeMap[locType] || "Online";

  // Resolve empresa name
  let empresa = "";
  if (booking.organization_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", booking.organization_id)
      .maybeSingle();
    empresa = org?.name || "";
  }

  const vars = buildBookingVars({
    guest_name: booking.guest_name,
    guest_email: booking.guest_email,
    guest_phone: booking.guest_phone,
    start_time: booking.start_time,
    end_time: booking.end_time,
    timezone: booking.timezone,
    event_name: booking.booking_event_types?.name,
    host_name: booking.profiles?.full_name,
    meet_link: meetingLink,
    modalidade,
    empresa,
    confirmation_url: `${siteUrl}/confirmar/${booking.confirmation_token}`,
    reschedule_url: `${siteUrl}/reagendar/${booking.confirmation_token}`,
  });

  // Pick template
  let waText = "";
  let emailSubject = "";
  let emailBody = "";

  if (job.kind === "confirmation") {
    waText = renderTemplate(settings?.confirmation_message_whatsapp || DEFAULT_TEMPLATES.confirmation_whatsapp, vars);
    emailSubject = renderTemplate(settings?.confirmation_subject_email || DEFAULT_TEMPLATES.confirmation_email_subject, vars);
    emailBody = renderTemplate(settings?.confirmation_html_email || DEFAULT_TEMPLATES.confirmation_whatsapp.replace(/\n/g, "<br>"), vars);
  } else if (job.kind === "reminder") {
    const { data: reminder } = job.reminder_id
      ? await supabase.from("booking_reminders").select("*").eq("id", job.reminder_id).maybeSingle()
      : { data: null } as any;
    waText = renderTemplate(reminder?.message_template || DEFAULT_TEMPLATES.reminder_whatsapp, vars);
    emailSubject = renderTemplate(reminder?.email_subject || `Lembrete: {{nome_evento}} às {{hora}}`, vars);
    emailBody = waText.replace(/\n/g, "<br>");
  } else if (job.kind === "recovery") {
    waText = renderTemplate(settings?.recovery_message || DEFAULT_TEMPLATES.recovery_whatsapp, vars);
    emailSubject = renderTemplate(`Sentimos sua falta — {{nome_evento}}`, vars);
    emailBody = waText.replace(/\n/g, "<br>");
  } else if (job.kind === "internal_notification") {
    waText = renderTemplate(settings?.internal_message_template || DEFAULT_TEMPLATES.internal_whatsapp, vars);
    emailSubject = renderTemplate(`Novo agendamento: {{nome_evento}}`, vars);
    emailBody = waText.replace(/\n/g, "<br>");
  }

  const channel: string = job.channel || "whatsapp";

  // Resolve target (guest for client jobs, seller for internal)
  const isInternal = job.kind === "internal_notification";
  let resolvedGuestPhone: string | null = booking.guest_phone || null;

  // Hydrate guest_phone from CRM lead if missing and WhatsApp is needed
  if (!isInternal && !resolvedGuestPhone && (channel === "whatsapp" || channel === "both") && booking.guest_email) {
    try {
      const { data: lead } = await supabase
        .from("leads")
        .select("phone, phone_normalized")
        .eq("organization_id", booking.organization_id)
        .eq("email", booking.guest_email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const hydrated = lead?.phone_normalized || lead?.phone || null;
      if (hydrated) {
        resolvedGuestPhone = hydrated;
        await supabase.from("booking_requests").update({ guest_phone: hydrated }).eq("id", booking.id);
        console.log(`[dispatcher] hydrated phone from lead for booking ${booking.id}`);
      }
    } catch (e: any) {
      console.warn("[dispatcher] hydrate phone failed:", e?.message || e);
    }
  }

  const targetPhone = normalizePhone(isInternal ? null : resolvedGuestPhone);
  const targetEmail = isInternal ? booking.profiles?.email : booking.guest_email;


  let waSent = false;
  let emailSent = false;
  let waMessageId: string | null = null;

  // === WhatsApp ===
  if ((channel === "whatsapp" || channel === "both") && targetPhone && settings?.whatsapp_instance_id) {
    try {
      const { data: sendRes, error: sendErr } = await supabase.functions.invoke("evolution-send", {
        body: {
          organization_id: job.organization_id,
          instance_id: settings.whatsapp_instance_id,
          type: "text",
          to: targetPhone,
          payload: { text: waText },
        },
      });
      if (sendErr) throw sendErr;
      waSent = true;
      waMessageId = sendRes?.body?.key?.id || sendRes?.messageId || null;
    } catch (e: any) {
      console.error("[dispatcher] whatsapp send error:", e?.message || e);
    }
  }

  // === Email ===
  if ((channel === "email" || channel === "both") && targetEmail) {
    try {
      await supabase.functions.invoke("send-booking-confirmation", {
        body: {
          bookingId: booking.id,
          guestName: isInternal ? (booking.profiles?.full_name || "Vendedor") : booking.guest_name,
          guestEmail: targetEmail,
          eventName: booking.booking_event_types?.name || "Reunião",
          hostName: booking.profiles?.full_name || "Anfitrião",
          startTime: booking.start_time,
          endTime: booking.end_time,
          meetLink: calendarEvent?.meet_link || undefined,
          confirmationToken: booking.confirmation_token,
          confirmationUrl: vars.link_confirmar,
          customSubject: emailSubject,
          customBody: emailBody,
        },
      });
      emailSent = true;
    } catch (e: any) {
      console.error("[dispatcher] email send error:", e?.message || e);
    }
  }

  if (!waSent && !emailSent) {
    throw new Error(`No channel could deliver (channel=${channel} phone=${targetPhone ? "yes" : "no"} email=${targetEmail ? "yes" : "no"} wa_instance=${settings?.whatsapp_instance_id ? "yes" : "no"})`);
  }

  // Mark job as sent
  await supabase.from("booking_scheduled_jobs")
    .update({ status: "sent", processed_at: new Date().toISOString() })
    .eq("id", job.id);

  // Update booking status & message id
  const updates: Record<string, any> = {};
  if (job.kind === "confirmation" && waMessageId) updates.whatsapp_message_id = waMessageId;
  if (job.kind === "confirmation" && booking.status === "confirmed") {
    updates.status = "confirmacao_enviada";
  }
  if (job.kind === "reminder" && ["confirmed", "agendado", "confirmacao_enviada", "confirmado"].includes(booking.status)) {
    updates.status = "lembrete_enviado";
  }
  if (Object.keys(updates).length > 0) {
    await supabase.from("booking_requests").update(updates).eq("id", booking.id);
  }

  // Log
  const logType =
    job.kind === "confirmation" ? "confirmation_sent" :
    job.kind === "reminder" ? "reminder_sent" :
    job.kind === "recovery" ? "recovery_sent" :
    "notification_sent";
  await supabase.from("booking_logs").insert({
    booking_id: booking.id,
    organization_id: job.organization_id,
    type: logType,
    channel,
    payload: { job_id: job.id, wa: waSent, email: emailSent, wa_message_id: waMessageId },
  });
}
