// Builders + hashing utilitário para o Meta Conversions API.
// SHA-256 hex é o único formato aceito pela Meta para user_data PII.

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function digits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D+/g, '');
}

export interface LeadUserData {
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null; // ISO-2 (BR)
  external_id?: string | null; // lead uuid
  fbc?: string | null;
  fbp?: string | null;
  client_ip?: string | null;
  client_user_agent?: string | null;
  ctwa_clid?: string | null;
}

export async function buildUserData(u: LeadUserData): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (u.email) out.em = [await sha256Hex(u.email)];
  if (u.phone) {
    const p = digits(u.phone);
    if (p) out.ph = [await sha256Hex(p)];
  }
  if (u.first_name) out.fn = [await sha256Hex(u.first_name)];
  if (u.last_name) out.ln = [await sha256Hex(u.last_name)];
  if (u.city) out.ct = [await sha256Hex(u.city)];
  if (u.state) out.st = [await sha256Hex(u.state)];
  if (u.country) out.country = [await sha256Hex(u.country)];
  if (u.external_id) out.external_id = [await sha256Hex(u.external_id)];
  if (u.fbc) out.fbc = u.fbc;
  if (u.fbp) out.fbp = u.fbp;
  if (u.client_ip) out.client_ip_address = u.client_ip;
  if (u.client_user_agent) out.client_user_agent = u.client_user_agent;
  if (u.ctwa_clid) out.ctwa_clid = u.ctwa_clid;
  return out;
}

export interface CapiEventInput {
  event_name: string;
  event_id: string; // dedup key
  event_time?: number; // unix seconds
  action_source: 'website' | 'business_messaging' | 'system_generated' | 'other';
  event_source_url?: string | null;
  messaging_channel?: 'whatsapp' | 'instagram' | 'messenger' | null;
  user_data: LeadUserData;
  custom_data?: Record<string, unknown>;
}

export async function buildCapiEvent(e: CapiEventInput): Promise<Record<string, unknown>> {
  const evt: Record<string, unknown> = {
    event_name: e.event_name,
    event_time: e.event_time ?? Math.floor(Date.now() / 1000),
    event_id: e.event_id,
    action_source: e.action_source,
    user_data: await buildUserData(e.user_data),
  };
  if (e.event_source_url) evt.event_source_url = e.event_source_url;
  if (e.messaging_channel) evt.messaging_channel = e.messaging_channel;
  if (e.custom_data && Object.keys(e.custom_data).length > 0) evt.custom_data = e.custom_data;
  return evt;
}

// Map do event_type do Journey Bus → nome padrão da Meta.
export const JOURNEY_TO_META: Record<string, string> = {
  lead_created: 'Lead',
  lead_qualified: 'SubmitApplication',
  meeting_created: 'Schedule',
  meeting_confirmed: 'Schedule',
  proposal_sent: 'InitiateCheckout',
  sale_completed: 'Purchase',
  meta_ctwa_received: 'Contact',
};

export function pickActionSource(channel?: string | null): CapiEventInput['action_source'] {
  const c = (channel ?? '').toLowerCase();
  if (c === 'whatsapp' || c === 'instagram' || c === 'messenger') return 'business_messaging';
  return 'website';
}

export function pickMessagingChannel(channel?: string | null): CapiEventInput['messaging_channel'] {
  const c = (channel ?? '').toLowerCase();
  if (c === 'whatsapp' || c === 'instagram' || c === 'messenger') return c as any;
  return null;
}

// Chave de dedup ESTÁVEL — nunca use Date.now().
// Preferência: journey_event_id > (sale_id/order_id) > (event_type + lead_id + event_source_id).
export function stableDedupKey(opts: {
  event_id?: string | null;
  journey_event_id?: string | null;
  sale_id?: string | null;
  order_id?: string | null;
  event_type: string;
  lead_id?: string | null;
  extra?: string | null;
}): string {
  if (opts.event_id) return opts.event_id;
  if (opts.journey_event_id) return `je:${opts.journey_event_id}`;
  if (opts.sale_id) return `sale:${opts.sale_id}`;
  if (opts.order_id) return `order:${opts.order_id}`;
  const lead = opts.lead_id ?? 'nolead';
  const extra = opts.extra ?? 'n';
  return `${opts.event_type}:${lead}:${extra}`;
}
