import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  calendarEventId: string;
  eventTypeId: string;
  leadId: string;
}

function normalizePhoneBR(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = (await req.json()) as RequestBody;
    const { calendarEventId, eventTypeId, leadId } = body || ({} as RequestBody);

    if (!calendarEventId || !eventTypeId || !leadId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields (calendarEventId, eventTypeId, leadId)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[manual-booking-create] start', { calendarEventId, eventTypeId, leadId });

    // Load calendar event
    const { data: calEvent, error: calErr } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('id', calendarEventId)
      .single();
    if (calErr || !calEvent) {
      console.error('calendar_event not found', calErr);
      return new Response(JSON.stringify({ error: 'calendar_event not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load event type
    const { data: eventType, error: etErr } = await supabase
      .from('booking_event_types')
      .select('*')
      .eq('id', eventTypeId)
      .single();
    if (etErr || !eventType) {
      console.error('event_type not found', etErr);
      return new Response(JSON.stringify({ error: 'event_type not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load lead
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, name, email, phone, phone_normalized, organization_id')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) {
      console.error('lead not found', leadErr);
      return new Response(JSON.stringify({ error: 'lead not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const guestName = lead.name || 'Convidado';
    const guestEmail = lead.email || `noemail+${lead.id}@vendus.local`;
    const guestPhone = lead.phone_normalized || normalizePhoneBR(lead.phone);

    // Idempotency: re-use booking_request if already linked
    const { data: existing } = await supabase
      .from('booking_requests')
      .select('id, confirmation_token')
      .eq('calendar_event_id', calendarEventId)
      .maybeSingle();

    let bookingId: string;
    let confirmationToken: string;

    if (existing) {
      bookingId = existing.id;
      confirmationToken = existing.confirmation_token;
      console.log('[manual-booking-create] reusing existing booking', bookingId);
    } else {
      confirmationToken = crypto.randomUUID().replace(/-/g, '').substring(0, 32);
      const { data: booking, error: brErr } = await supabase
        .from('booking_requests')
        .insert({
          organization_id: eventType.organization_id,
          event_type_id: eventType.id,
          host_user_id: calEvent.user_id,
          calendar_event_id: calEvent.id,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          start_time: calEvent.start_time,
          end_time: calEvent.end_time,
          timezone: calEvent.timezone || 'America/Sao_Paulo',
          status: 'confirmed',
          additional_info: { source: 'manual_calendar', lead_id: lead.id },
          confirmation_token: confirmationToken,
          tracking: {},
        })
        .select()
        .single();
      if (brErr || !booking) {
        console.error('booking_request insert error', brErr);
        return new Response(JSON.stringify({ error: 'failed to create booking_request' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      bookingId = booking.id;
    }

    // Enqueue automation jobs (mirror booking-submit)
    const { data: settings } = await supabase
      .from('booking_notification_settings')
      .select('*')
      .eq('event_type_id', eventType.id)
      .maybeSingle();

    const { data: reminders } = await supabase
      .from('booking_reminders')
      .select('*')
      .eq('event_type_id', eventType.id)
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    const startDate = new Date(calEvent.start_time);
    const now = new Date();
    const jobs: any[] = [];

    const hasPhone = !!guestPhone;
    const wantsWa = settings ? !!settings.send_whatsapp : true;
    const wantsEmail = settings ? !!settings.send_email : true;

    // Confirmation immediate
    if (wantsEmail || wantsWa) {
      const channel = (wantsWa && hasPhone) && wantsEmail
        ? 'both'
        : (wantsWa && hasPhone) ? 'whatsapp' : 'email';
      jobs.push({
        booking_id: bookingId,
        organization_id: eventType.organization_id,
        kind: 'confirmation',
        channel,
        scheduled_for: now.toISOString(),
        status: 'pending',
        payload: {},
      });
    }

    // Internal seller notification
    if (!settings || settings.notify_seller_on_new) {
      jobs.push({
        booking_id: bookingId,
        organization_id: eventType.organization_id,
        kind: 'internal_notification',
        channel: settings?.internal_channel || 'both',
        scheduled_for: now.toISOString(),
        status: 'pending',
        payload: { event: 'new' },
      });
    }

    const unitMs: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
    const startMs = startDate.getTime();
    for (const r of reminders || []) {
      const offset = (r.offset_value || 0) * (unitMs[r.offset_unit] || 60_000);
      const runAt = new Date(startMs - offset);
      if (runAt.getTime() <= now.getTime()) continue;
      const ch = (r.channel === 'whatsapp' && !hasPhone) ? 'email' : (r.channel || 'whatsapp');
      jobs.push({
        booking_id: bookingId,
        organization_id: eventType.organization_id,
        reminder_id: r.id,
        kind: 'reminder',
        channel: ch,
        scheduled_for: runAt.toISOString(),
        status: 'pending',
        payload: {},
      });
    }

    if (settings?.recovery_enabled) {
      const offset = (settings.recovery_offset_value || 0) * (unitMs[settings.recovery_offset_unit] || 3_600_000);
      const runAt = new Date(startMs + offset);
      jobs.push({
        booking_id: bookingId,
        organization_id: eventType.organization_id,
        kind: 'recovery',
        channel: (settings.send_whatsapp && hasPhone) ? 'whatsapp' : 'email',
        scheduled_for: runAt.toISOString(),
        status: 'pending',
        payload: {},
      });
    }

    if (jobs.length) {
      const { error: jobsErr } = await supabase.from('booking_scheduled_jobs').insert(jobs);
      if (jobsErr) console.error('[manual-booking-create] jobs insert err', jobsErr);
      else console.log(`[manual-booking-create] enqueued ${jobs.length} jobs`);
    }

    // Audit log
    await supabase.from('booking_logs').insert({
      booking_id: bookingId,
      organization_id: eventType.organization_id,
      action: 'manual_create',
      details: { calendar_event_id: calendarEventId, lead_id: lead.id, jobs: jobs.length } as any,
    } as any).then(() => {}, () => {});

    // Send immediate confirmation via existing function
    try {
      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', calEvent.user_id)
        .maybeSingle();
      const siteUrl = Deno.env.get('SITE_URL') || 'https://app.vendus.com.br';
      await supabase.functions.invoke('send-booking-confirmation', {
        body: {
          bookingId,
          guestName,
          guestEmail,
          eventName: eventType.name,
          hostName: hostProfile?.full_name || 'Anfitrião',
          startTime: calEvent.start_time,
          endTime: calEvent.end_time,
          meetLink: calEvent.meet_link || undefined,
          confirmationToken,
          confirmationUrl: `${siteUrl}/confirmar/${confirmationToken}`,
        },
      });
    } catch (e) {
      console.warn('send-booking-confirmation invoke failed', e);
    }

    // Push: novo agendamento → notifica anfitrião
    try {
      const { sendPushToUsers } = await import('../_shared/push.ts');
      const { formatBookingPush } = await import('../_shared/push-formatters.ts');
      const payload = formatBookingPush({
        eventName: eventType.name,
        leadName: lead.name,
        guestName: guestName,
        startIso: calEvent.start_time,
        timezone: calEvent.timezone,
        calendarEventId: calEvent.id,
      });
      if (calEvent.user_id) {
        await sendPushToUsers(supabase as any, [calEvent.user_id], payload, 'push_new_booking');
      }
    } catch (e) {
      console.warn('[manual-booking-create] push non-fatal:', (e as Error).message);
    }

    return new Response(JSON.stringify({ success: true, bookingId, jobs: jobs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[manual-booking-create] error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
