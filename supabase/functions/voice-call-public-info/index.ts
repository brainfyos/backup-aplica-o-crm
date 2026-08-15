// Retorna metadados públicos de uma `voice_calls` (campanha) pela slug.
// Mesma forma do payload de voice-agent-public-info para reuso no /call/:slug.
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
    const url = new URL(req.url);
    let slug = url.searchParams.get('slug');
    let visitor_id: string | null = url.searchParams.get('visitor_id');
    let utms: Record<string, string> = {};
    let referrer: string | null = null;
    let user_agent: string | null = req.headers.get('user-agent') || null;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      slug = slug || body?.slug || null;
      visitor_id = visitor_id || body?.visitor_id || null;
      if (body?.utms && typeof body.utms === 'object') utms = body.utms;
      referrer = body?.referrer || null;
    }
    if (!slug) return json({ error: 'slug is required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: call } = await admin
      .from('voice_calls')
      .select('*')
      .ilike('slug', slug)
      .maybeSingle();
    if (!call) return json({ error: 'not_found', message: 'Ligação não encontrada' }, 200);
    if (call.status !== 'active') return json({ error: 'inactive', message: 'Ligação não publicada' }, 200);

    // Registra visualização (dedupe leve: só grava se não houver hit do mesmo visitor no mesmo dia)
    try {
      const generatedVisitor = visitor_id || crypto.randomUUID();
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { data: existing } = await admin
        .from('voice_call_views')
        .select('id')
        .eq('voice_call_id', call.id)
        .eq('visitor_id', generatedVisitor)
        .gte('created_at', since.toISOString())
        .limit(1)
        .maybeSingle();
      if (!existing) {
        const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
        const ipHash = ip ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))))
          .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32) : null;
        await admin.from('voice_call_views').insert({
          organization_id: call.organization_id,
          voice_call_id: call.id,
          visitor_id: generatedVisitor,
          utm_source: utms.utm_source || null,
          utm_medium: utms.utm_medium || null,
          utm_campaign: utms.utm_campaign || null,
          utm_term: utms.utm_term || null,
          utm_content: utms.utm_content || null,
          referrer,
          user_agent,
          ip_hash: ipHash,
        });
      }
      visitor_id = generatedVisitor;
    } catch (e) {
      console.warn('[voice-call-public-info] view log failed', e);
    }


    // Preferir product_agent (nova arquitetura); fallback para voice_agents legacy
    let productAgent: any = null;
    if (call.product_agent_id) {
      const { data } = await admin
        .from('product_agents')
        .select('id, name, avatar_url, description, voice_provider')
        .eq('id', call.product_agent_id)
        .maybeSingle();
      productAgent = data;
    }
    let legacyAgent: any = null;
    if (!productAgent && call.voice_agent_id) {
      const { data } = await admin
        .from('voice_agents')
        .select('id, name, display_name, role_title, photo_url, theme, appearance, public_config')
        .eq('id', call.voice_agent_id)
        .maybeSingle();
      legacyAgent = data;
    }

    const { data: org } = await admin
      .from('organizations')
      .select('name, logo_url')
      .eq('id', call.organization_id)
      .maybeSingle();

    const appearance = { ...(legacyAgent?.appearance || {}), ...(call.appearance || {}) };
    const cfg = (legacyAgent?.public_config || {}) as Record<string, any>;
    const displayName = productAgent?.name || legacyAgent?.display_name || legacyAgent?.name || call.name;
    const displayPhoto = productAgent?.avatar_url || legacyAgent?.photo_url || null;
    const configuredProvider = (call.voice_provider || productAgent?.voice_provider || 'grok') as 'grok' | 'openai' | 'auto';
    let effectiveProvider: 'grok' | 'openai' | 'auto' = configuredProvider;
    if (configuredProvider === 'auto') {
      const { getOrgProviderKey } = await import('../_shared/voice-credentials.ts');
      const openaiKey = await getOrgProviderKey(admin, call.organization_id, 'openai');
      effectiveProvider = openaiKey ? 'openai' : 'grok';
    }

    return json({
      kind: 'voice_call',
      call_id: call.id,
      slug: call.slug,
      visitor_id,
      agent_name: displayName,
      agent_role: legacyAgent?.role_title || null,
      agent_photo: displayPhoto,
      theme: legacyAgent?.theme || 'phone',
      appearance,
      org_name: org?.name || null,
      org_logo: org?.logo_url || null,
      headline: appearance.headline || cfg.headline || `Fale com ${displayName}`,
      subheadline: appearance.subheadline || cfg.subheadline || 'Uma conversa por voz, em tempo real.',
      cta_label: appearance.cta_label || cfg.cta_label || 'Falar agora',
      voice_provider: effectiveProvider,
      require_name: cfg.require_name ?? false,
      require_contact: cfg.require_contact ?? false,
      post_redirect_url: cfg.post_redirect_url || null,
      capture_fields: call.capture_fields || [],
      ctas: call.ctas || [],
      tracking: {
        meta_pixel_id: call.tracking?.meta_pixel_id || null,
        ga4_id: call.tracking?.ga4_id || null,
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
