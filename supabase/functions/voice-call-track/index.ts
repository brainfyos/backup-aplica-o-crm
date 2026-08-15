// Recebe eventos de tracking de /call/:slug e replica para:
// - Meta Conversions API (server-side, deduplica com Pixel via event_id)
// - GA4 Measurement Protocol (opcional)
// - Webhook customizado da campanha (se configurado)
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

async function sha256Hex(s: string) {
  const data = new TextEncoder().encode(s.trim().toLowerCase());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashUserData(ud: Record<string, any>) {
  const out: Record<string, string> = {};
  if (ud.em) out.em = await sha256Hex(String(ud.em));
  if (ud.ph) out.ph = await sha256Hex(String(ud.ph).replace(/\D/g, ''));
  if (ud.fn) out.fn = await sha256Hex(String(ud.fn));
  if (ud.ln) out.ln = await sha256Hex(String(ud.ln));
  if (ud.external_id) out.external_id = await sha256Hex(String(ud.external_id));
  return out;
}

async function sendMetaCAPI(opts: {
  pixel_id: string;
  access_token: string;
  event: string;
  event_id: string;
  event_source_url?: string;
  user_agent?: string;
  ip?: string | null;
  user_data?: Record<string, any>;
  custom_data?: Record<string, any>;
  fbc?: string | null;
  fbp?: string | null;
}) {
  const hashed = opts.user_data ? await hashUserData(opts.user_data) : {};
  const payload: any = {
    data: [{
      event_name: opts.event,
      event_time: Math.floor(Date.now() / 1000),
      event_id: opts.event_id,
      action_source: 'website',
      event_source_url: opts.event_source_url,
      user_data: {
        ...hashed,
        client_user_agent: opts.user_agent,
        client_ip_address: opts.ip || undefined,
        fbc: opts.fbc || undefined,
        fbp: opts.fbp || undefined,
      },
      custom_data: opts.custom_data || {},
    }],
  };
  const url = `https://graph.facebook.com/v18.0/${opts.pixel_id}/events?access_token=${encodeURIComponent(opts.access_token)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  if (!r.ok) {
    console.warn('[voice-call-track] Meta CAPI error', r.status, text.slice(0, 300));
    return { ok: false, status: r.status, body: text.slice(0, 300) };
  }
  return { ok: true, body: text.slice(0, 200) };
}

async function sendGA4MP(opts: {
  measurement_id: string;
  api_secret: string;
  client_id: string;
  event: string;
  params: Record<string, any>;
}) {
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(opts.measurement_id)}&api_secret=${encodeURIComponent(opts.api_secret)}`;
  const r = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      client_id: opts.client_id,
      events: [{ name: opts.event.toLowerCase().replace(/[^a-z0-9_]/g, '_'), params: opts.params }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.warn('[voice-call-track] GA4 MP error', r.status, t.slice(0, 200));
    return { ok: false, status: r.status };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const {
      session_id,
      event,
      event_id,
      params,
      user_data,
      page_url,
      user_agent,
      referrer,
      fbc,
      fbp,
    } = body || {};
    if (!session_id || !event) return json({ error: 'session_id and event are required' }, 400);
    if (event === 'Purchase') {
      return json({ ok: true, ignored: 'unverified_purchase' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: session } = await admin
      .from('voice_call_sessions')
      .select('id, voice_call_id, lead_id, captured_data, utms, voice_calls(id, tracking, name, slug)')
      .eq('id', session_id)
      .maybeSingle();
    if (!session) return json({ error: 'session not found' }, 404);

    const call: any = (session as any).voice_calls;
    const tracking = (call?.tracking || {}) as Record<string, any>;

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    // Combina dados do lead + user_data explícito
    const merged = { ...(user_data || {}) } as Record<string, any>;
    const cap = (session as any).captured_data || {};
    if (!merged.em && cap.email) merged.em = cap.email;
    if (!merged.ph && (cap.whatsapp || cap.phone)) merged.ph = cap.whatsapp || cap.phone;
    if (!merged.fn && cap.name) merged.fn = String(cap.name).split(' ')[0];
    if (!merged.external_id && (session as any).lead_id) merged.external_id = (session as any).lead_id;

    const custom = { ...(params || {}), utms: (session as any).utms || {} };

    const results: Record<string, any> = {};

    // Meta CAPI
    if (tracking.meta_pixel_id && tracking.meta_access_token) {
      results.meta = await sendMetaCAPI({
        pixel_id: String(tracking.meta_pixel_id),
        access_token: String(tracking.meta_access_token),
        event,
        event_id: event_id || crypto.randomUUID(),
        event_source_url: page_url,
        user_agent,
        ip,
        user_data: merged,
        custom_data: custom,
        fbc,
        fbp,
      });
    }

    // GA4 Measurement Protocol (opcional — só quando api_secret disponível)
    if (tracking.ga4_id && tracking.ga4_api_secret) {
      results.ga4 = await sendGA4MP({
        measurement_id: String(tracking.ga4_id),
        api_secret: String(tracking.ga4_api_secret),
        client_id: (session as any).lead_id || session.id,
        event,
        params: { ...custom, engagement_time_msec: 1 },
      });
    }

    // Referrer eco
    if (referrer) results.referrer = referrer;

    return json({ ok: true, results });
  } catch (e) {
    console.error('[voice-call-track]', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
