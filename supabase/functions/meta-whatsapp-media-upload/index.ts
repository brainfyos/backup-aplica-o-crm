// meta-whatsapp-media-upload
// Faz upload de uma mídia (vídeo/imagem/documento) já presente no Storage
// (bucket `whatsapp-media`) para o endpoint /{phone_number_id}/media da Meta,
// retornando o `media_id` válido por ~30 dias. Opcionalmente atualiza o
// template informado em `whatsapp_meta_templates.header_media_*`.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { GRAPH_BASE } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const { connection_id, storage_path, template_id, mime_type, filename } = body ?? {};
  if (!connection_id || !storage_path) {
    return json({ error: 'missing connection_id or storage_path' }, 400);
  }

  // 1) conexão
  const { data: conn } = await sb
    .from('whatsapp_meta_connections')
    .select('id, organization_id, phone_number_id, access_token_encrypted, status')
    .eq('id', connection_id)
    .maybeSingle();
  if (!conn) return json({ error: 'connection not found' }, 404);
  if (conn.status !== 'active') return json({ error: `connection status=${conn.status}` }, 422);

  // 2) baixa o arquivo do Storage
  const { data: fileBlob, error: dlErr } = await sb.storage
    .from('whatsapp-media')
    .download(storage_path);
  if (dlErr || !fileBlob) return json({ error: `storage download: ${dlErr?.message ?? 'not found'}` }, 404);

  const detectedMime = mime_type || fileBlob.type || 'application/octet-stream';
  const name = filename || storage_path.split('/').pop() || 'media';

  // 3) Decrypta token e faz upload para Meta /{phone_number_id}/media
  const accessToken = await decryptSecret(conn.access_token_encrypted);
  const fd = new FormData();
  fd.append('messaging_product', 'whatsapp');
  fd.append('type', detectedMime);
  fd.append('file', new File([await fileBlob.arrayBuffer()], name, { type: detectedMime }));

  const res = await fetch(`${GRAPH_BASE}/${conn.phone_number_id}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: fd,
  });
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch {}
  if (!res.ok) {
    return json({
      error: data?.error?.message ?? `Meta upload ${res.status}`,
      code: data?.error?.code,
      details: data?.error?.error_data?.details,
    }, res.status);
  }

  const mediaId = String(data?.id ?? '');
  if (!mediaId) return json({ error: 'Meta não retornou id' }, 502);

  const nowIso = new Date().toISOString();
  // URL pública: bucket é privado → usamos signed URL longa (7d, renovada quando necessário).
  // Meta só baixa via `link` em fallback, no fluxo primário usamos `id` (válido ~30d).
  const { data: signed } = await sb.storage
    .from('whatsapp-media')
    .createSignedUrl(storage_path, 60 * 60 * 24 * 7);
  const publicUrl = signed?.signedUrl ?? null;

  // 4) Se template_id informado, atualiza a linha
  if (template_id) {
    await sb.from('whatsapp_meta_templates').update({
      header_media_id: mediaId,
      header_media_url: publicUrl,
      header_media_uploaded_at: nowIso,
      header_media_mime: detectedMime,
      header_media_storage_path: storage_path,
      header_media_filename: name,
    }).eq('id', template_id).eq('organization_id', conn.organization_id);
  }

  return json({
    ok: true,
    media_id: mediaId,
    public_url: publicUrl,
    uploaded_at: nowIso,
    mime_type: detectedMime,
  });
});
