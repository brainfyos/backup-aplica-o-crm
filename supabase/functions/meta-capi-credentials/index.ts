// Salva/atualiza credenciais CAPI da Meta por organização.
// - Recebe token em texto plano do admin logado, criptografa (AES-GCM) e persiste.
// - GET retorna configuração atual (token mascarado).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { encryptSecret, decryptSecret, maskSecret } from '../_shared/meta-crypto.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userSb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await userSb.auth.getClaims(token);
  if (claimsErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = claims.claims.sub;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const url = new URL(req.url);
  const orgId = url.searchParams.get('organization_id');
  const credentialId = url.searchParams.get('credential_id');
  if (!orgId) {
    return new Response(JSON.stringify({ error: 'organization_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Autoriza: precisa pertencer à org como admin ou super_admin.
  const { data: membership } = await sb
    .from('user_organizations')
    .select('role')
    .eq('user_id', userId).eq('organization_id', orgId).maybeSingle();
  const { data: superRole } = await sb
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'super_admin').maybeSingle();
  const canWrite = superRole || (membership && ['admin', 'owner'].includes((membership as any).role));
  if (!canWrite) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'GET') {
    let query = sb.from('org_marketing_credentials')
      .select('meta_pixel_id, meta_capi_access_token_encrypted, meta_capi_test_event_code, capi_enabled, updated_at')
      .eq('organization_id', orgId).eq('provider', 'meta').eq('is_active', true);
    if (credentialId) query = query.eq('id', credentialId);
    const { data } = await query.limit(2);
    if (!credentialId && (data?.length ?? 0) > 1) {
      return new Response(JSON.stringify({ error: 'credential_id required for multiple Meta accounts' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const selected = data?.[0] ?? null;
    let tokenMask = '';
    if ((selected as any)?.meta_capi_access_token_encrypted) {
      try {
        const plain = await decryptSecret((selected as any).meta_capi_access_token_encrypted);
        tokenMask = maskSecret(plain);
      } catch { tokenMask = '••••'; }
    }
    return new Response(JSON.stringify({
      meta_pixel_id: (selected as any)?.meta_pixel_id ?? null,
      meta_capi_test_event_code: (selected as any)?.meta_capi_test_event_code ?? null,
      capi_enabled: (selected as any)?.capi_enabled ?? false,
      token_mask: tokenMask,
      has_token: !!(selected as any)?.meta_capi_access_token_encrypted,
      updated_at: (selected as any)?.updated_at ?? null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const body = await req.json().catch(() => ({}));
    const { meta_pixel_id, meta_capi_access_token, meta_capi_test_event_code, capi_enabled } = body ?? {};

    // Validate Pixel ID (must be numeric, 7-20 digits) when provided/non-empty
    if (typeof meta_pixel_id === 'string' && meta_pixel_id.trim().length > 0) {
      if (!/^\d{7,20}$/.test(meta_pixel_id.trim())) {
        return new Response(JSON.stringify({
          error: 'Pixel ID inválido',
          details: 'O Meta Pixel ID deve ser numérico (7 a 20 dígitos). Ex.: 1200998365220349. Não use e-mail.',
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const patch: Record<string, unknown> = { is_active: true };
    if (meta_pixel_id !== undefined) patch.meta_pixel_id = (typeof meta_pixel_id === 'string' ? meta_pixel_id.trim() : meta_pixel_id) || null;
    if (meta_capi_test_event_code !== undefined) {
      const t = typeof meta_capi_test_event_code === 'string' ? meta_capi_test_event_code.trim().replace(/[?\s]/g, '') : meta_capi_test_event_code;
      patch.meta_capi_test_event_code = t || null;
    }
    if (typeof capi_enabled === 'boolean') patch.capi_enabled = capi_enabled;
    if (typeof meta_capi_access_token === 'string' && meta_capi_access_token.trim().length > 0) {
      patch.meta_capi_access_token_encrypted = await encryptSecret(meta_capi_access_token.trim());
    }

    if (!credentialId) {
      return new Response(JSON.stringify({ error: 'credential_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existing, error: selErr } = await sb
      .from('org_marketing_credentials')
      .select('id')
      .eq('organization_id', orgId).eq('provider', 'meta')
      .eq('id', credentialId).maybeSingle();
    if (selErr) {
      return new Response(JSON.stringify({ error: selErr.message, details: (selErr as any).details ?? null }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let error: any = null;
    if (existing?.id) {
      ({ error } = await sb.from('org_marketing_credentials').update(patch).eq('id', existing.id));
    } else {
      return new Response(JSON.stringify({ error: 'Meta credential not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (error) {
      return new Response(JSON.stringify({
        error: error.message,
        details: (error as any).details ?? null,
        hint: (error as any).hint ?? null,
        code: (error as any).code ?? null,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (capi_enabled === true) {
      await sb.from('org_marketing_credentials')
        .update({ capi_enabled: false })
        .eq('organization_id', orgId).eq('provider', 'meta').neq('id', credentialId);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
