// vapid-admin
// Super Admin: gerar/rotacionar par VAPID e atualizar subject.
// GET  -> { configured, public_key, subject, generated_at }
// POST { action: 'generate' | 'rotate' } -> gera novo par (privada criptografada)
// POST { action: 'update_subject', subject } -> valida mailto: e persiste
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import webpush from 'npm:web-push@3.6.7';
import { encryptSecret } from '../_shared/meta-crypto.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const sbUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await sbUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: isSuper } = await admin.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'super_admin',
  });
  if (!isSuper) return json({ error: 'forbidden' }, 403);

  const { data: current, error: selErr } = await admin
    .from('platform_settings')
    .select('id, vapid_public_key, vapid_subject, vapid_generated_at')
    .limit(1)
    .maybeSingle();
  if (selErr) return json({ error: selErr.message }, 500);

  if (req.method === 'GET') {
    return json({
      configured: !!current?.vapid_public_key,
      public_key: current?.vapid_public_key ?? '',
      subject: current?.vapid_subject ?? 'mailto:noreply@vendus.com.br',
      generated_at: current?.vapid_generated_at ?? null,
    });
  }

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action || '');

  if (action === 'generate' || action === 'rotate') {
    if (action === 'generate' && current?.vapid_public_key) {
      return json({ error: 'Já existe um par. Use "rotate" para substituir.' }, 400);
    }
    const pair = webpush.generateVAPIDKeys();
    const encPriv = await encryptSecret(pair.privateKey);
    const patch = {
      vapid_public_key: pair.publicKey,
      vapid_private_key_encrypted: encPriv,
      vapid_generated_at: new Date().toISOString(),
      vapid_subject: current?.vapid_subject || 'mailto:noreply@vendus.com.br',
    };
    if (!current?.id) {
      const { error } = await admin.from('platform_settings').insert(patch);
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await admin.from('platform_settings').update(patch).eq('id', current.id);
      if (error) return json({ error: error.message }, 500);
    }
    return json({
      ok: true,
      rotated: action === 'rotate',
      public_key: pair.publicKey,
      generated_at: patch.vapid_generated_at,
    });
  }

  if (action === 'update_subject') {
    const subject = String(body?.subject || '').trim();
    if (!/^mailto:.+@.+\..+/i.test(subject) && !/^https?:\/\/.+/i.test(subject)) {
      return json({ error: 'Subject inválido. Use mailto:email@dominio ou https://...' }, 400);
    }
    if (!current?.id) {
      const { error } = await admin.from('platform_settings').insert({ vapid_subject: subject });
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await admin
        .from('platform_settings')
        .update({ vapid_subject: subject })
        .eq('id', current.id);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true, subject });
  }

  // Import manual: super admin cola o par atual (usado para migrar
  // de env vars antigas sem invalidar as inscrições existentes).
  if (action === 'import_manual') {
    if (current?.vapid_public_key) {
      return json({ error: 'Já existe um par cadastrado. Rotacione para substituir.' }, 400);
    }
    const pub = String(body?.public_key || '').trim();
    const priv = String(body?.private_key || '').trim();
    const subj = String(body?.subject || current?.vapid_subject || 'mailto:noreply@vendus.com.br').trim();
    if (!pub || !priv) return json({ error: 'Informe public_key e private_key' }, 400);
    // Sanity: tenta usar como par VAPID
    try {
      webpush.setVapidDetails(subj, pub, priv);
    } catch (e: any) {
      return json({ error: 'Par inválido: ' + (e?.message || 'erro') }, 400);
    }
    const encPriv = await encryptSecret(priv);
    const patch = {
      vapid_public_key: pub,
      vapid_private_key_encrypted: encPriv,
      vapid_subject: subj,
      vapid_generated_at: new Date().toISOString(),
    };
    if (!current?.id) {
      const { error } = await admin.from('platform_settings').insert(patch);
      if (error) return json({ error: error.message }, 500);
    } else {
      const { error } = await admin.from('platform_settings').update(patch).eq('id', current.id);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true, imported: true });
  }

  if (action === 'list_my_subscriptions') {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, user_agent, platform, is_standalone, created_at, last_seen_at, revoked_at')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ subscriptions: data || [] });
  }

  if (action === 'delete_subscription') {
    const id = String(body?.id || '');
    if (!id) return json({ error: 'id required' }, 400);
    const { error } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('id', id)
      .eq('user_id', userData.user.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === 'cleanup_invalid') {
    const { data, error } = await admin
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userData.user.id)
      .not('revoked_at', 'is', null)
      .select('id');
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, removed: data?.length || 0 });
  }

  if (action === 'send_test') {
    const { sendPushToUsers } = await import('../_shared/push.ts');
    const r: any = await sendPushToUsers(
      admin,
      [userData.user.id],
      {
        title: String(body?.title || 'Push de teste'),
        body: String(body?.body || `Enviado em ${new Date().toLocaleString('pt-BR')}`),
        url: '/super-admin',
        tag: 'vapid-test',
        requireInteraction: false,
      },
      'push_new_message',
    );
    return json({ ok: true, sent: r.sent, failed: r.failed, skipped: r.skipped, details: r.details || [] });
  }

  return json({ error: 'unknown action' }, 400);
});
