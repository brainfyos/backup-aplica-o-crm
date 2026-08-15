// voice-inbound-lead — endpoint público (token no query) para captação de leads
// vindos de formulários/anúncios/webhooks externos. Cria/atualiza lead + UTMs
// + tags, registra jornada e opcionalmente enrola em campanha de voz.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

function pick(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc: any, k) => (acc == null ? undefined : acc[k]), obj);
}

function mapField(payload: any, mapping: Record<string, string>, key: string, ...fallbacks: string[]): any {
  const source = mapping?.[key];
  if (source) {
    const v = pick(payload, source);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  for (const f of fallbacks) {
    const v = pick(payload, f);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') || req.headers.get('x-voice-token');
    if (!token) return json({ error: 'missing token' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: hook } = await admin
      .from('voice_inbound_webhooks')
      .select('*')
      .eq('token', token)
      .eq('active', true)
      .maybeSingle();
    if (!hook) return json({ error: 'invalid or inactive token' }, 403);

    const payload = await req.json().catch(() => ({}));
    const mapping = (hook.field_mapping || {}) as Record<string, string>;

    const name = String(mapField(payload, mapping, 'name', 'name', 'full_name', 'nome') ?? '').trim();
    const email = String(mapField(payload, mapping, 'email', 'email', 'e-mail') ?? '').trim().toLowerCase();
    const phoneRaw = mapField(payload, mapping, 'phone', 'phone', 'telefone', 'whatsapp', 'celular');
    const phone = normalizePhone(phoneRaw);

    if (!phone) return json({ error: 'phone is required (DDI+DDD+number)' }, 400);
    if (!name && !email) return json({ error: 'name or email is required' }, 400);

    const utm = {
      utm_source: mapField(payload, mapping, 'utm_source', 'utm_source', 'utm.source') ?? null,
      utm_medium: mapField(payload, mapping, 'utm_medium', 'utm_medium', 'utm.medium') ?? null,
      utm_campaign: mapField(payload, mapping, 'utm_campaign', 'utm_campaign', 'utm.campaign') ?? null,
      utm_term: mapField(payload, mapping, 'utm_term', 'utm_term', 'utm.term') ?? null,
      utm_content: mapField(payload, mapping, 'utm_content', 'utm_content', 'utm.content') ?? null,
    };

    const tagsFromPayload = (mapField(payload, mapping, 'tags', 'tags') ?? []) as any[];
    const allTagNames = [...(hook.default_tags || []), ...(Array.isArray(tagsFromPayload) ? tagsFromPayload : [])]
      .map((s) => String(s).trim()).filter(Boolean);

    // Upsert lead (dedup por telefone dentro da org)
    const { data: existing } = await admin
      .from('leads')
      .select('id')
      .eq('organization_id', hook.organization_id)
      .eq('phone', phone)
      .maybeSingle();

    let leadId: string;
    if (existing) {
      leadId = existing.id;
      await admin.from('leads').update({
        name: name || undefined,
        email: email || undefined,
        ...utm,
      }).eq('id', leadId);
    } else {
      const { data: created, error: cErr } = await admin.from('leads').insert({
        organization_id: hook.organization_id,
        name: name || 'Lead',
        email: email || null,
        phone,
        lead_origin: 'voice_inbound_webhook',
        lead_channel: 'webhook',
        lead_source: hook.default_source || null,
        ...utm,
      }).select('id').single();
      if (cErr || !created) return json({ error: `failed to create lead: ${cErr?.message}` }, 500);
      leadId = created.id;
    }

    // Resolve tag ids (cria se não existir)
    const tagIds: string[] = [];
    for (const tagName of allTagNames) {
      const { data: t } = await admin
        .from('lead_tags')
        .select('id')
        .eq('organization_id', hook.organization_id)
        .eq('name', tagName)
        .maybeSingle();
      let id = t?.id;
      if (!id) {
        const { data: nt } = await admin.from('lead_tags').insert({
          organization_id: hook.organization_id, name: tagName, color: '#3b82f6',
        }).select('id').single();
        id = nt?.id;
      }
      if (id) tagIds.push(id);
    }
    for (const tagId of tagIds) {
      await admin.from('lead_tag_assignments').upsert({ lead_id: leadId, tag_id: tagId }, { onConflict: 'lead_id,tag_id' });
    }

    // Cria jornada
    const { data: journey } = await admin.from('voice_campaign_journeys').insert({
      organization_id: hook.organization_id,
      campaign_id: hook.campaign_id,
      lead_id: leadId,
      stage: 'enrolled',
      utm,
      notes: `Recebido via webhook "${hook.name}"`,
    }).select('id').single();

    // Log de webhook
    await admin.from('webhook_logs').insert({
      organization_id: hook.organization_id,
      webhook_url: `voice-inbound-lead/${hook.id}`,
      request_body: payload,
      response_body: { lead_id: leadId, journey_id: journey?.id },
      status_code: 200,
    }).catch(() => {});

    await admin.from('voice_inbound_webhooks').update({
      last_triggered_at: new Date().toISOString(),
      trigger_count: (hook.trigger_count || 0) + 1,
    }).eq('id', hook.id);

    // Modo de execução
    let targetId: string | null = null;
    if (hook.mode === 'enroll_campaign' || hook.mode === 'call_immediate' || hook.mode === 'call_scheduled') {
      if (!hook.campaign_id) {
        return json({ ok: true, lead_id: leadId, journey_id: journey?.id, note: 'no campaign linked' });
      }
      const scheduledFor = hook.mode === 'call_immediate'
        ? new Date().toISOString()
        : hook.mode === 'call_scheduled'
        ? new Date(Date.now() + (hook.schedule_offset_minutes || 0) * 60000).toISOString()
        : null;

      const { data: t } = await admin.from('voice_campaign_targets').insert({
        campaign_id: hook.campaign_id,
        organization_id: hook.organization_id,
        lead_id: leadId,
        phone,
        status: 'pending',
        scheduled_for: scheduledFor,
        journey_id: journey?.id ?? null,
      }).select('id').single();
      targetId = t?.id ?? null;
    }

    return json({ ok: true, lead_id: leadId, journey_id: journey?.id, target_id: targetId });
  } catch (e) {
    console.error('[voice-inbound-lead]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
