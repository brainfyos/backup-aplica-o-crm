// meta-whatsapp-send
// Envia mensagem via Cloud API. Detecta janela 24h:
//  - dentro: texto/mídia livre
//  - fora: exige template HSM aprovado

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
import { GRAPH_BASE, graphFetch, GraphError } from '../_shared/meta-graph.ts';
import { decryptSecret } from '../_shared/meta-crypto.ts';
import { normalizePhoneBR } from '../_shared/phone.ts';
import { canSendWhatsAppToPhone } from '../_shared/optin-guard.ts';

const BodySchema = z.object({
  connection_id: z.string().uuid(),
  organization_id: z.string().uuid().nullish(),
  to: z.string().min(8).max(32),
  conversation_id: z.string().uuid().nullish(),
  type: z.enum(['text', 'template', 'image', 'audio', 'video', 'document', 'sticker']).default('text'),
  text: z.string().max(4096).nullish(),
  media: z.record(z.unknown()).nullish(),
  template: z.record(z.unknown()).nullish(),
}).passthrough();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log('[meta-send] request_received', {
    request_id: requestId,
    method: req.method,
    has_authorization: !!req.headers.get('Authorization'),
    has_apikey: !!req.headers.get('apikey'),
  });

  if (req.method !== 'POST') return json({ error: 'method not allowed', request_id: requestId }, 405);

  const authHeader = req.headers.get('Authorization');
  const apiKeyHeader = req.headers.get('apikey');
  if (!authHeader && !apiKeyHeader) return json({ error: 'Unauthorized', stage: 'auth_check', request_id: requestId }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const sbAdmin = createClient(
    supabaseUrl,
    serviceKey,
  );

  const rawBody = await req.json().catch(() => null);
  const parsedBody = BodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return json({ error: 'invalid request', fields: parsedBody.error.flatten().fieldErrors, request_id: requestId }, 400);
  }
  const body = parsedBody.data;
  const {
    connection_id,
    organization_id,
    to,                        // telefone destino
    conversation_id,           // opcional: para gravar mensagem + checar janela
    type = 'text',             // text | template | image | audio | video | document
    text,                      // string
    media,                     // { id?, link?, caption?, filename? }
    template,                  // { name, language, components? }  OR { template_id, variable_mapping, lead_id, context }
  } = body ?? {};
  const { data: conn, error: connErr } = await sbAdmin
    .from('whatsapp_meta_connections')
    .select('*')
    .eq('id', connection_id)
    .maybeSingle();
  if (connErr || !conn) return json({ error: 'connection not found', request_id: requestId }, 404);

  // A função aceita chamadas internas autenticadas pela chave do backend e
  // usuários válidos da organização. Instagram possui validação própria e não
  // participa deste caminho.
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const isInternalCall = apiKeyHeader === serviceKey || bearerToken === serviceKey;
  if (!isInternalCall) {
    if (!bearerToken) return json({ error: 'Unauthorized', stage: 'auth_check', request_id: requestId }, 401);
    const authClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader! } } },
    );
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(bearerToken);
    const callerUserId = claimsError ? null : String(claimsData?.claims?.sub ?? '') || null;
    if (!callerUserId) return json({ error: 'Unauthorized', stage: 'auth_check', request_id: requestId }, 401);
    const [{ data: membership }, { data: profile }, { data: roles }] = await Promise.all([
      sbAdmin.from('user_organizations').select('id').eq('user_id', callerUserId).eq('organization_id', conn.organization_id).maybeSingle(),
      sbAdmin.from('profiles').select('id').eq('id', callerUserId).eq('organization_id', conn.organization_id).maybeSingle(),
      sbAdmin.from('user_roles').select('role').eq('user_id', callerUserId).eq('role', 'super_admin').limit(1),
    ]);
    if (!membership && !profile && (roles?.length ?? 0) === 0) {
      return json({ error: 'Forbidden', stage: 'authorization', request_id: requestId }, 403);
    }
  }

  if (organization_id && conn.organization_id !== organization_id) return json({ error: 'org mismatch', request_id: requestId }, 403);
  console.log('[meta-send] auth_validated', { request_id: requestId, internal: isInternalCall, connection_id });
  {
    const { assertOrgActive } = await import('../_shared/org-status.ts');
    const guard = await assertOrgActive(sbAdmin, conn.organization_id);
    if (!guard.ok) return json(guard.body, guard.status);
  }
  if (conn.status !== 'active') return json({ error: `connection status=${conn.status}` }, 422);

  // janela 24h
  if (conversation_id && type !== 'template') {
    const { data: ok } = await sbAdmin.rpc('is_within_24h_window', { _conversation_id: conversation_id });
    if (!ok) {
      return json({ error: 'OUT_OF_WINDOW', message: 'Fora da janela 24h — envie um template HSM aprovado.' }, 422);
    }
  }

  let accessToken = '';
  try {
    accessToken = await decryptSecret(conn.access_token_encrypted);
    if (!accessToken) throw new Error('empty access token');
    console.log('[meta-send] credential_ready', { request_id: requestId, connection_id });
  } catch (error) {
    console.error('[meta-send] credential_error', { request_id: requestId, connection_id, error: String(error) });
    return json({ ok: false, error: 'Não foi possível ler a credencial do WhatsApp Oficial.', stage: 'credential_decrypt', request_id: requestId }, 200);
  }
  const toNorm = (normalizePhoneBR(to) ?? String(to)).replace(/^\+/, '');

  // opt-in guard: bloqueia envios para leads que pediram para sair
  const allowed = await canSendWhatsAppToPhone(sbAdmin, conn.organization_id, toNorm);
  if (!allowed) {
    return json({ error: 'OPTED_OUT', message: 'Lead optou por sair da lista de WhatsApp.' }, 422);
  }


  // build payload
  const payload: any = { messaging_product: 'whatsapp', to: toNorm, type };
  if (type === 'text') {
    payload.text = { body: text ?? '', preview_url: true };
  } else if (type === 'template') {
    // Modo A: chamada já traz {name, language, components}
    // Modo B: chamada traz {template_id, variable_mapping, lead_id, context} → resolvemos aqui
    let tplName = template?.name;
    let tplLang = template?.language;
    let tplComponents = template?.components;
    let resolvedPreview: string | null = text ?? null;
    let resolvedTplRow: any = null;

    if (!tplName && template?.template_id) {
      const { data: row } = await sbAdmin.from('whatsapp_meta_templates')
        .select('id, name, language, status, components, header_media_id, header_media_url, header_media_uploaded_at, header_media_storage_path, header_media_mime, header_media_filename, usage_count')
        .eq('id', template.template_id).maybeSingle();
      if (!row) return json({ error: 'template not found' }, 404);
      if (row.status !== 'APPROVED') return json({ error: `template status=${row.status}` }, 422);
      resolvedTplRow = row;
      tplName = row.name;
      tplLang = row.language;

      const { resolveVariableValues, buildSendComponents, renderTemplatePreview } =
        await import('../_shared/meta-template-builder.ts');

      // Header de mídia obrigatório: se template requer e não tem nada, falha cedo
      const headerComp = (row.components as any[])?.find((c: any) => c?.type === 'HEADER');
      const needsMedia = headerComp?.format && headerComp.format !== 'TEXT';
      if (needsMedia && !row.header_media_id && !row.header_media_url) {
        return json({
          error: 'MISSING_HEADER_MEDIA',
          message: 'Template com header de vídeo/imagem sem mídia configurada. Edite o template em Conexões → API Oficial → Templates.',
        }, 422);
      }

      // Refresh do media_id quando >25 dias (Meta expira em ~30)
      if (needsMedia && row.header_media_storage_path) {
        const uploadedAt = row.header_media_uploaded_at ? new Date(row.header_media_uploaded_at).getTime() : 0;
        const ageDays = uploadedAt ? (Date.now() - uploadedAt) / (1000 * 60 * 60 * 24) : 999;
        if (ageDays > 25) {
          try {
            const refreshRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-whatsapp-media-upload`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                connection_id,
                storage_path: row.header_media_storage_path,
                template_id: row.id,
                mime_type: row.header_media_mime,
                filename: row.header_media_filename,
              }),
            });
            const refreshed = await refreshRes.json().catch(() => null);
            if (refreshed?.media_id) {
              row.header_media_id = refreshed.media_id;
              row.header_media_url = refreshed.public_url ?? row.header_media_url;
              row.header_media_uploaded_at = refreshed.uploaded_at;
            }
          } catch (e) {
            console.warn('[meta-send] refresh media_id falhou', e);
          }
        }
      }

      let lead: any = null;
      if (template.lead_id) {
        const { data: ld } = await sbAdmin.from('leads')
          .select('id, name, email, phone, temperature, metadata').eq('id', template.lead_id).maybeSingle();
        lead = ld;
      }
      const mappingWithTpl = { ...(template.variable_mapping ?? {}), __template: row };
      try {
        const values = await resolveVariableValues({
          sb: sbAdmin,
          organizationId: conn.organization_id,
          components: row.components as any[],
          mapping: mappingWithTpl,
          lead,
          context: template.context ?? '',
        });
        tplComponents = buildSendComponents({ components: row.components as any[], values });
        resolvedPreview = renderTemplatePreview(row.components as any[], values);
      } catch (e: any) {
        if (String(e?.message ?? '').includes('MISSING_HEADER_MEDIA')) {
          return json({
            error: 'MISSING_HEADER_MEDIA',
            message: 'Template com header de vídeo/imagem sem mídia configurada. Edite o template em Conexões → API Oficial → Templates.',
          }, 422);
        }
        throw e;
      }
    }

    if (!tplName || !tplLang) return json({ error: 'template.name e template.language obrigatórios' }, 400);
    payload.template = {
      name: tplName,
      language: { code: tplLang },
      ...(tplComponents ? { components: tplComponents } : {}),
    };
    // Sobrescreve text para que o registro no inbox mostre a preview real
    if (resolvedPreview) (body as any)._preview = resolvedPreview;
    if (resolvedTplRow) (body as any)._tplRow = resolvedTplRow;
  } else if (['image', 'audio', 'video', 'document', 'sticker'].includes(type)) {

    payload[type] = { ...(media ?? {}) };
  } else {
    return json({ error: `tipo ${type} não suportado` }, 400);
  }

  // send
  let res: any;
  try {
    console.log('[meta-send] graph_request', { request_id: requestId, connection_id, payload_type: type });
    res = await graphFetch(`/${conn.phone_number_id}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    console.log('[meta-send] ok', { request_id: requestId, type, connection_id, meta_msg_id: res?.messages?.[0]?.id ?? null });
  } catch (e) {
    const ge = e as GraphError;
    const graphMessage = ge.graph?.message ?? String(e);
    const graphCode = ge.graph?.code ?? null;
    const graphSubcode = ge.graph?.error_subcode ?? null;
    const fbtraceId = ge.graph?.fbtrace_id ?? null;
    console.error('[meta-send] graph error', {
      status: ge.status,
      code: graphCode,
      subcode: graphSubcode,
      fbtrace_id: fbtraceId,
      message: graphMessage,
      payload_type: type,
      connection_id,
      request_id: requestId,
    });
    if (conversation_id) {
      await sbAdmin.from('webchat_messages').insert({
        conversation_id,
        direction: 'outbound',
        sender_type: 'agent',
        content: text ?? `[${type}]`,
        content_type: 'text',
        delivery_status: 'failed',
        metadata: {
          error: graphMessage,
          graph_code: graphCode,
          graph_subcode: graphSubcode,
          fbtrace_id: fbtraceId,
          payload,
        },
      });
    }
    // Retorna 200 com ok:false para que o supabase.functions.invoke consiga
    // ler o corpo (não-2xx é descartado pelo SDK) e propagar a mensagem real.
    return json({
      ok: false,
      error: graphMessage,
      graph_code: graphCode,
      graph_subcode: graphSubcode,
      fbtrace_id: fbtraceId,
      graph_status: ge.status ?? 500,
      request_id: requestId,
    }, 200);
  }

  const metaMsgId = res?.messages?.[0]?.id ?? null;
  const previewText = (body as any)?._preview ?? text ?? `[${type}]`;
  const tplRow = (body as any)?._tplRow ?? null;

  if (conversation_id) {
    await sbAdmin.from('webchat_messages').insert({
      conversation_id,
      direction: 'outbound',
      sender_type: 'agent',
      content: previewText,
      content_type: type === 'text' || type === 'template' ? 'text' : (type === 'image' ? 'image' : type === 'audio' ? 'audio' : 'file'),
      message_type: type,
      meta_message_id: metaMsgId,
      delivery_status: 'sent',
      metadata: { meta_send_payload_type: type, ...(template ? { template } : {}), ...(media ? { media } : {}) },
    });
    await sbAdmin.from('webchat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id);
  }

  if (type === 'template' && tplRow?.id) {
    await sbAdmin.from('whatsapp_meta_templates').update({
      usage_count: (tplRow.usage_count ?? 0) + 1,
      last_send_at: new Date().toISOString(),
      last_send_error: null,
    }).eq('id', tplRow.id);
  }

  return json({ ok: true, meta_message_id: metaMsgId, request_id: requestId });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
