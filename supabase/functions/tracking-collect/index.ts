// Vendus Tracking SDK — endpoint público de coleta.
// Sempre retorna 200 (nunca quebra o site do cliente).
// - page_view / event: registra em tracking_events + tracking_visitors.
// - identify: resolve/cria lead, vincula visitor_id, publica journey, enfileira CAPI.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin');
  return {
  // sendBeacon inclui credenciais por padrão; nesse caso o navegador rejeita "*".
  // A origem é ecoada no CORS e validada contra a organização no POST abaixo.
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
  };
}

const ok = (req: Request, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...extra }), {
    status: 200,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });

const MAX_STR = 500;
// Purchase vindo do navegador é apenas telemetria não confirmada. A única
// origem autorizada de Purchase/CAPI é commerce_sales, alimentada por webhook
// autenticado do checkout.
const CAPI_EVENTS = new Set(['Lead', 'Lead-Vendus', 'CompleteRegistration', 'Schedule']);

function sanitizeString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, MAX_STR);
}

function sanitizeObject(obj: unknown, depth = 0): Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || depth > 2) return {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (count++ > 50) break;
    const key = String(k).slice(0, 80);
    if (v === null || typeof v === 'boolean' || typeof v === 'number') out[key] = v;
    else if (typeof v === 'string') out[key] = v.slice(0, MAX_STR);
    else if (Array.isArray(v)) out[key] = v.slice(0, 20).map((x) => (typeof x === 'object' ? sanitizeObject(x, depth + 1) : x));
    else if (typeof v === 'object') out[key] = sanitizeObject(v, depth + 1);
  }
  return out;
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length <= 11 && !digits.startsWith('55')) digits = '55' + digits;
  return digits.slice(0, 20);
}

function hostFromOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try { return new URL(origin).hostname.toLowerCase(); } catch { return null; }
}

function isDomainAllowed(host: string | null, allowed: string[], allowLocal: boolean): boolean {
  if (!host) return true; // sem origin/referer → server-side call, aceita
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return allowLocal;
  if (!allowed || allowed.length === 0) return true;
  return allowed.some((d) => {
    const raw = String(d).trim().toLowerCase();
    let clean = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
    try { clean = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase(); } catch { /* usa fallback */ }
    if (!clean) return false;
    return host === clean || host.endsWith('.' + clean);
  });
}

async function isAuthorizedAdminTest(req: Request, organizationId: string, body: any): Promise<boolean> {
  if (body?.properties?.source !== 'admin_test_button') return false;
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.toLowerCase().startsWith('bearer ')) return false;

  const token = authHeader.slice(7).trim();
  const authClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await authClient.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return false;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const [{ data: membership }, { data: profile }] = await Promise.all([
    sb.from('user_organizations').select('id').eq('user_id', userId).eq('organization_id', organizationId).maybeSingle(),
    sb.from('profiles').select('id').eq('id', userId).eq('organization_id', organizationId).maybeSingle(),
  ]);
  return !!membership || !!profile;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return ok(req, { ignored: 'method' });

  let body: any = null;
  try {
    const text = await req.text();
    if (text.length > 32_768) return ok(req, { ignored: 'payload_too_large' });
    body = JSON.parse(text || '{}');
  } catch {
    return ok(req, { ignored: 'invalid_json' });
  }

  const type = String(body?.type || '').toLowerCase();
  const orgKey = sanitizeString(body?.organization_key);
  const visitorId = sanitizeString(body?.visitor_id);
  const sessionId = sanitizeString(body?.session_id);
  const eventId = sanitizeString(body?.event_id);
  const eventName = sanitizeString(body?.event_name) || (type === 'page_view' ? 'PageView' : null);

  if (!orgKey || !visitorId || !eventId || !eventName) return ok(req, { ignored: 'missing_fields' });
  if (!['page_view', 'event', 'identify'].includes(type)) return ok(req, { ignored: 'invalid_type' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Resolve org por chave pública
  const { data: org } = await sb
    .from('organizations')
    .select('id, tracking_settings')
    .eq('tracking_public_key', orgKey)
    .maybeSingle();

  if (!org) return ok(req, { ignored: 'unknown_key' });

  const settings = (org as any).tracking_settings || {};
  if (settings.enabled === false) return ok(req, { ignored: 'disabled' });

  const originHost = hostFromOrigin(req.headers.get('origin')) || hostFromOrigin(req.headers.get('referer'));
  const allowedDomains: string[] = Array.isArray(settings.allowed_domains) ? settings.allowed_domains : [];
  const organizationId = (org as any).id as string;
  const adminTest = await isAuthorizedAdminTest(req, organizationId, body);
  const domainAllowed = isDomainAllowed(originHost, allowedDomains, !!settings.allow_localhost);
  console.log(JSON.stringify({
    scope: 'tracking-collect',
    stage: 'domain_check',
    organization_id: organizationId,
    event_name: eventName,
    origin_host: originHost,
    allowed_domains: allowedDomains,
    domain_allowed: domainAllowed,
    authorized_admin_test: adminTest,
  }));
  if (!domainAllowed && !adminTest) {
    return ok(req, { ignored: 'domain_not_allowed', host: originHost });
  }

  const firstTouch = sanitizeObject(body?.first_touch);
  const lastTouch = sanitizeObject(body?.last_touch);
  const properties = sanitizeObject(body?.properties);
  const pageUrl = sanitizeString(body?.url || body?.page?.url);
  const referrer = sanitizeString(body?.referrer || body?.page?.referrer);
  const hostname = sanitizeString(body?.hostname) || originHost;
  const fbp = sanitizeString(body?.meta?.fbp);
  const fbc = sanitizeString(body?.meta?.fbc);
  const fbclid = sanitizeString(body?.meta?.fbclid || (lastTouch as any)?.fbclid);
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || null;
  const userAgent = sanitizeString(req.headers.get('user-agent'));
  const eventTimeIso = new Date(Number(body?.event_time) * 1000 || Date.now()).toISOString();
  const eventTime = Number(body?.event_time) || Math.floor(Date.now() / 1000);

  // Upsert visitor — preserva first_touch/first_seen_at
  const { data: existingVisitor } = await sb
    .from('tracking_visitors')
    .select('id, lead_id, first_touch, backfilled')
    .eq('organization_id', organizationId)
    .eq('visitor_id', visitorId)
    .maybeSingle();

  if (existingVisitor) {
    await sb.from('tracking_visitors')
      .update({
        last_touch: Object.keys(lastTouch).length ? lastTouch : undefined,
        fbp: fbp ?? undefined,
        fbc: fbc ?? undefined,
        user_agent: userAgent ?? undefined,
        client_ip: clientIp ?? undefined,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', (existingVisitor as any).id);
  } else {
    await sb.from('tracking_visitors').insert({
      organization_id: organizationId,
      visitor_id: visitorId,
      first_touch: firstTouch,
      last_touch: lastTouch,
      fbp, fbc, user_agent: userAgent, client_ip: clientIp,
    });
  }

  const leadIdCurrent = (existingVisitor as any)?.lead_id ?? null;

  // Insere event (dedupe por event_id)
  await sb.from('tracking_events').insert({
    organization_id: organizationId,
    visitor_id: visitorId,
    session_id: sessionId,
    lead_id: leadIdCurrent,
    event_id: eventId,
    event_name: eventName,
    event_time: eventTimeIso,
    page_url: pageUrl,
    referrer,
    hostname,
    properties,
    first_touch: firstTouch,
    last_touch: lastTouch,
  }).then(() => {}, () => {}); // dedupe silencioso

  // Mapa evento SDK → journey_event_type válido
  const JOURNEY_MAP: Record<string, string> = {
    PageView: 'session_started',
    Lead: 'lead_created',
    'Lead-Vendus': 'lead_created',
    FormSubmit: 'lead_created',
    QuizComplete: 'lead_created',
    CompleteRegistration: 'lead_created',
    WidgetOpened: 'first_message_in',
    WhatsAppClick: 'ad_click_received',
    Schedule: 'meeting_created',
  };

  async function publishJourney(leadId: string, evt: string, dedupeSuffix = '') {
    try {
      await sb.rpc('emit_journey_event', {
        p_organization_id: organizationId,
        p_subject_type: 'lead',
        p_subject_id: leadId,
        p_event_type: evt,
        p_event_category: 'contact',
        p_source_module: 'tracking_sdk',
        p_actor_type: 'external',
        p_channel: 'web_tracking',
        p_payload: { event_name: eventName, properties, page_url: pageUrl, referrer, first_touch: firstTouch, last_touch: lastTouch },
        p_lead_id: leadId,
        p_dedupe_key: eventId + dedupeSuffix,
      });
    } catch (e) {
      console.warn('[tracking-collect] journey publish failed:', (e as Error).message);
    }
  }

  async function dispatchCapi(leadId: string) {
    if (eventName === 'Purchase') return;
    const cameFromPixel = properties.source === 'pixel_bridge';
    if (!CAPI_EVENTS.has(eventName) && !cameFromPixel) return;
    try {
      const invocation = sb.functions.invoke('meta-capi-dispatcher', {
        body: {
          organization_id: organizationId,
          event_type: eventName,
          event_id: eventId,
          event_time: eventTime,
          lead_id: leadId,
          channel: 'web',
          value: Number(properties.value) || null,
          currency: sanitizeString(properties.currency) || 'BRL',
          order_id: sanitizeString(properties.order_id),
          event_source_url: pageUrl,
          custom_data: properties,
          user_data_override: { fbp, fbc, client_ip: clientIp, client_user_agent: userAgent },
        },
      });
      (globalThis as any).EdgeRuntime?.waitUntil?.(invocation);
    } catch { /* noop */ }
  }

  if (type !== 'identify' && leadIdCurrent) {
    const evt = JOURNEY_MAP[eventName];
    if (evt) await publishJourney(leadIdCurrent, evt);
    await dispatchCapi(leadIdCurrent);
  }

  if (type === 'identify') {
    const leadIn = body?.lead || {};
    const email = sanitizeString(leadIn.email)?.toLowerCase() || null;
    const phone = normalizePhone(leadIn.phone);
    const name = sanitizeString(leadIn.name);
    const externalId = sanitizeString(leadIn.external_id);

    if (!email && !phone && !externalId) return ok(req, { ignored: 'identify_no_key' });

    // Resolve lead existente
    let leadId = leadIdCurrent;
    if (!leadId) {
      if (email) {
        const { data } = await sb.from('leads')
          .select('id').eq('organization_id', organizationId).eq('email', email).maybeSingle();
        if (data) leadId = (data as any).id;
      }
      if (!leadId && phone) {
        const { data } = await sb.from('leads')
          .select('id').eq('organization_id', organizationId).eq('phone', phone).maybeSingle();
        if (data) leadId = (data as any).id;
      }
    }

    // Cria se não achou
    if (!leadId) {
      const insertPayload: Record<string, unknown> = {
        organization_id: organizationId,
        name: name || (email ? email.split('@')[0] : 'Visitante'),
        email, phone,
        lead_origin: 'web_tracking',
        lead_channel: 'landing_page',
        landing_page: (firstTouch as any)?.landing_page || pageUrl,
        referrer_url: (firstTouch as any)?.referrer || referrer,
        utm_source: (lastTouch as any)?.utm_source || (firstTouch as any)?.utm_source || null,
        utm_medium: (lastTouch as any)?.utm_medium || (firstTouch as any)?.utm_medium || null,
        utm_campaign: (lastTouch as any)?.utm_campaign || (firstTouch as any)?.utm_campaign || null,
        utm_content: (lastTouch as any)?.utm_content || (firstTouch as any)?.utm_content || null,
        utm_term: (lastTouch as any)?.utm_term || (firstTouch as any)?.utm_term || null,
        fbclid, fbc, fbp, client_ip: clientIp, user_agent: userAgent,
        visitor_id: visitorId,
      };
      const { data: newLead, error: insErr } = await sb.from('leads').insert(insertPayload).select('id').maybeSingle();
      if (insErr) {
        console.error('[tracking-collect] lead insert failed:', insErr);
        return ok(req, { ignored: 'lead_insert_failed' });
      }
      leadId = (newLead as any)?.id;
    } else {
      // Atualiza campos vazios (não sobrescreve)
      const patch: Record<string, unknown> = { visitor_id: visitorId, client_ip: clientIp, user_agent: userAgent };
      if (email) patch.email = email;
      if (phone) patch.phone = phone;
      if (name) patch.name = name;
      if (fbc) patch.fbc = fbc;
      if (fbp) patch.fbp = fbp;
      if (fbclid) patch.fbclid = fbclid;
      await sb.from('leads').update(patch).eq('id', leadId);
    }

    if (leadId) {
      // Vincula visitor + backfill dos events antigos
      await sb.from('tracking_visitors').update({ lead_id: leadId }).eq('organization_id', organizationId).eq('visitor_id', visitorId);
      if (!(existingVisitor as any)?.backfilled) {
        await sb.from('tracking_events').update({ lead_id: leadId }).eq('organization_id', organizationId).eq('visitor_id', visitorId).is('lead_id', null);
        await sb.from('tracking_visitors').update({ backfilled: true }).eq('organization_id', organizationId).eq('visitor_id', visitorId);
      }

      // Journey — usa lead_updated como marcador de identificação (enum-safe)
      await publishJourney(leadId, 'lead_updated', ':identified');
      const evt2 = JOURNEY_MAP[eventName];
      if (evt2) await publishJourney(leadId, evt2);

      // Attribution engine (fire-and-forget)
      try {
        (globalThis as any).EdgeRuntime?.waitUntil?.(
          sb.functions.invoke('attribution-engine', { body: { organization_id: organizationId, lead_id: leadId } })
        );
      } catch { /* noop */ }

      await dispatchCapi(leadId);
    }
    console.log(JSON.stringify({ scope: 'tracking-collect', stage: 'persisted', organization_id: organizationId, event_name: eventName, type, lead_id: leadId }));
    return ok(req, { lead_id: leadId, test: adminTest });
  }

  console.log(JSON.stringify({ scope: 'tracking-collect', stage: 'persisted', organization_id: organizationId, event_name: eventName, type, visitor_id: visitorId }));
  return ok(req, { visitor_id: visitorId, test: adminTest });
});
