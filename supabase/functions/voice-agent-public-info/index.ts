// Retorna metadados públicos de um voice_agent pela `public_slug`.
// Usado pela landing /call/:slug antes de iniciar a chamada.
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
    if (!slug && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      slug = body?.slug || null;
    }
    if (!slug) return json({ error: 'slug is required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: agent } = await admin
      .from('voice_agents')
      .select('id, name, display_name, role_title, photo_url, theme, public_config, appearance, organization_id, is_active, public_enabled')
      .ilike('public_slug', slug)
      .maybeSingle();
    if (!agent) return json({ error: 'not_found', message: 'Slug não encontrado' }, 200);
    if (!agent.public_enabled) return json({ error: 'not_enabled', message: 'Página pública desativada pelo administrador' }, 200);
    if (!agent.is_active) return json({ error: 'inactive', message: 'Agente inativo' }, 200);

    const { data: org } = await admin
      .from('organizations')
      .select('name, logo_url')
      .eq('id', agent.organization_id)
      .maybeSingle();

    const cfg = (agent.public_config || {}) as Record<string, any>;
    return json({
      slug,
      agent_name: agent.display_name || agent.name,
      agent_role: agent.role_title || null,
      agent_photo: agent.photo_url || null,
      theme: agent.theme || 'phone',
      appearance: agent.appearance || {},
      org_name: org?.name || null,
      org_logo: org?.logo_url || null,
      headline: cfg.headline || `Fale com ${agent.display_name || agent.name} agora`,
      subheadline:
        cfg.subheadline ||
        'Uma conversa por voz, em tempo real. Toque para começar.',
      cta_label: cfg.cta_label || 'Falar agora',
      require_name: cfg.require_name ?? false,
      require_contact: cfg.require_contact ?? false,
      accent_color: cfg.accent_color || null,
      post_redirect_url: cfg.post_redirect_url || null,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
