// whatsapp-media-fetch
// Refaz o download de uma mídia inbound (documento/vídeo/áudio/imagem) cujo
// upload inicial no `evolution-webhook` falhou (URL do WhatsApp expira e é
// encriptada). Reusa o mesmo caminho: pega `metadata.media.rawMessage` +
// evolution_message_id/instance_id, chama Evolution Go para decriptar em
// base64 e sobe no bucket público `chat-media`, atualizando a mensagem.
//
// Autenticação: exige JWT do usuário. RLS garante que só verá mensagens da
// organização dele (a checagem é feita via user_organizations).

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  decryptWhatsAppMedia,
  downloadViaEvolutionGo,
  looksDecrypted,
  type MediaKind,
} from '../_shared/whatsapp-media.ts';

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

function base64ToUint8(b64: string): Uint8Array {
  const cleaned = b64.includes(',') ? b64.split(',', 2)[1] : b64;
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extFromMime(mime?: string | null, fallback = 'bin'): string {
  if (!mime) return fallback;
  const m = mime.toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('m4a')) return 'm4a';
  if (m.includes('msword')) return 'doc';
  if (m.includes('officedocument.wordprocessingml')) return 'docx';
  if (m.includes('ms-excel')) return 'xls';
  if (m.includes('officedocument.spreadsheetml')) return 'xlsx';
  if (m.includes('zip')) return 'zip';
  return fallback;
}

async function attemptDownload(
  evoUrl: string,
  apiKeys: string[],
  rawMessage: any,
  mediaKind: string,
): Promise<{ base64: string; mime?: string; error?: string }> {
  // 1) Decripta localmente com HKDF/AES-CBC (Signal Protocol).
  //    Funciona enquanto o link do WhatsApp estiver vivo (~14 dias).
  const local = await decryptWhatsAppMedia(rawMessage, mediaKind as MediaKind);
  if (local && looksDecrypted(local.base64)) {
    console.log(`[whatsapp-media-fetch] decrypted locally (kind=${mediaKind}, ${local.base64.length} b64)`);
    return local;
  }

  // 2) Fallback: Evolution Go /message/downloadimage com payload canônico
  //    (byte arrays), formato exigido pela API v2 Go.
  const remote = await downloadViaEvolutionGo(evoUrl, apiKeys, rawMessage);
  if (remote?.base64 && remote.base64.length > 50 && looksDecrypted(remote.base64)) {
    console.log(`[whatsapp-media-fetch] downloaded via Evolution Go (${remote.base64.length} b64)`);
    return { base64: remote.base64, mime: remote.mime };
  }
  return { base64: '', mime: undefined, error: remote?.error || 'download indisponível' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // 1) Autentica usuário
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
  const userId = userData.user.id;

  const { message_id } = await req.json().catch(() => ({}));
  if (!message_id || typeof message_id !== 'string') {
    return json({ error: 'missing message_id' }, 400);
  }

  const sb = createClient(supabaseUrl, serviceKey);

  // 2) Carrega mensagem + conversa (para descobrir organization_id)
  const { data: msg, error: msgErr } = await sb
    .from('webchat_messages')
    .select('id, conversation_id, metadata')
    .eq('id', message_id)
    .maybeSingle();
  if (msgErr || !msg) return json({ error: 'message not found' }, 404);

  const metadata = (msg.metadata as any) || {};
  const media = metadata.media || {};
  if (media.url && !media.needs_fetch) {
    return json({ ok: true, url: media.url, cached: true });
  }

  const { data: conv } = await sb
    .from('webchat_conversations')
    .select('id, organization_id')
    .eq('id', msg.conversation_id)
    .maybeSingle();
  if (!conv) return json({ error: 'conversation not found' }, 404);

  // 3) Verifica se o usuário pertence à organização da conversa
  const { data: membership } = await sb
    .from('user_organizations')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('organization_id', conv.organization_id)
    .maybeSingle();
  if (!membership) return json({ error: 'forbidden' }, 403);

  // 4) Descobre credenciais do Evolution
  const rawMessage = media.rawMessage;
  const evoMessageId = metadata.evolution_message_id || rawMessage?.key?.id;
  const evoInstanceId = metadata.evolution_instance_id;

  if (!rawMessage || (!rawMessage.mediaKey && !rawMessage.MediaKey)) {
    return json({ error: 'arquivo indisponível: mensagem antiga sem material para redownload' }, 422);
  }

  let evoUrl = '';
  const apiKeys: (string | null | undefined)[] = [];

  if (evoInstanceId) {
    const { data: instance } = await sb
      .from('evolution_instances')
      .select('id, instance_id, name, instance_token, organization_id')
      .eq('id', evoInstanceId)
      .maybeSingle();
    if (instance && instance.organization_id === conv.organization_id) {
      apiKeys.push(instance.instance_token);
    }
  }

  const { data: cfg } = await sb
    .from('integration_settings')
    .select('settings')
    .eq('organization_id', conv.organization_id)
    .eq('integration_type', 'whatsapp_provider')
    .maybeSingle();
  const settings = (cfg as any)?.settings || {};
  evoUrl = String(settings.evolution_go_url || '').replace(/\/$/, '');
  apiKeys.push(settings.evolution_go_global_api_key);

  if (!evoUrl || apiKeys.every((k) => !k)) {
    const { data: platformCfg } = await sb
      .from('platform_settings')
      .select('evolution_go_url, evolution_go_global_api_key')
      .limit(1)
      .maybeSingle();
    evoUrl = evoUrl || String((platformCfg as any)?.evolution_go_url || '').replace(/\/$/, '');
    apiKeys.push((platformCfg as any)?.evolution_go_global_api_key);
  }

  // 5) Refaz download (decripta localmente; se falhar, tenta Evolution Go)
  const dl = await attemptDownload(
    evoUrl,
    apiKeys.filter(Boolean) as string[],
    rawMessage,
    String(media.kind || 'document'),
  );
  if (!dl.base64) {
    return json({
      error: dl.error || 'não foi possível recuperar o arquivo do WhatsApp (link expirou após ~14 dias)',
    }, 502);
  }

  // 6) Upload no Storage e atualiza metadata
  const bytes = base64ToUint8(dl.base64);
  const mime = dl.mime || media.mime || 'application/octet-stream';
  const rawName = String(media.filename || '').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const ext = extFromMime(mime, rawName.includes('.') ? rawName.split('.').pop()! : 'bin');
  const baseId = String(evoMessageId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]+/g, '_');
  const finalName = rawName ? `${baseId}-${rawName}` : `${baseId}.${ext}`;
  const path = `whatsapp-inbound/${conv.organization_id}/${conv.id}/${finalName}`;
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const { error: upErr } = await sb.storage
    .from('chat-media')
    .upload(path, ab, { contentType: mime, upsert: true });
  if (upErr) return json({ error: `storage upload failed: ${upErr.message}` }, 500);
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/chat-media/${path}`;

  const newMedia = {
    ...media,
    url: publicUrl,
    mime,
    size_bytes: media.size_bytes || bytes.byteLength,
    needs_fetch: false,
  };
  await sb
    .from('webchat_messages')
    .update({ metadata: { ...metadata, media: newMedia } })
    .eq('id', message_id);

  return json({ ok: true, url: publicUrl });
});
