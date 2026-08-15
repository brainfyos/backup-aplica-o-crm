// Helper de roteamento WhatsApp: respeita a conexão de origem da conversa.
// Se a conversa entrou pela Meta Cloud API (meta_connection_id), envia via
// `meta-whatsapp-send` usando a MESMA conexão (mesmo número oficial).
// Se entrou pela Evolution (evolution_instance_id), envia via `evolution-send`
// na mesma instância. Sem fallback silencioso para a instância default da org.

export type WAConversation = {
  id?: string;
  organization_id?: string | null;
  meta_connection_id?: string | null;
  evolution_instance_id?: string | null;
  visitor_phone?: string | null;
};

export type WAMedia = {
  kind: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  url: string;
  mime?: string;
  filename?: string;
  caption?: string;
};

export type WARouterResult = {
  ok: boolean;
  provider: 'meta' | 'evolution' | 'none';
  error?: string;
  /** Código estável para o frontend tratar erros específicos (ex: PHONE_NOT_ON_WHATSAPP). */
  code?: string;
  message?: string;
  /** ID da mensagem retornado pelo provedor (key.id / wamid / messageId). Usado
   *  para casar com receipts de delivery/read posteriormente. */
  messageId?: string | null;
  /** Detalhes do provedor Meta quando aplicável. */
  graph_code?: number | null;
  graph_subcode?: number | null;
  fbtrace_id?: string | null;
  raw?: unknown;
};

function extractProviderMessageId(raw: any): string | null {
  if (!raw) return null;
  // evolution-send retorna { ok, status, body }
  // meta-whatsapp-send retorna { ok, meta_message_id }
  const body = raw?.body ?? raw;
  // Evolution Go canonical: { data: { Info: { ID: "3EB0..." } }, message: "success" }
  const evoData = body?.data ?? body?.Data;
  const evoInfo = evoData?.Info ?? evoData?.info;
  const evoInfoId = evoInfo?.ID ?? evoInfo?.Id ?? evoInfo?.id;
  return (
    raw?.meta_message_id ||
    body?.meta_message_id ||
    evoInfoId ||
    body?.key?.id ||
    body?.key?.ID ||
    body?.key?.Id ||
    body?.messageId ||
    body?.message_id ||
    body?.id ||
    body?.ID ||
    body?.wamid ||
    // Meta Cloud raw: messages: [{ id: 'wamid...' }]
    (Array.isArray(body?.messages) ? body.messages[0]?.id : null) ||
    // Evolution Go alt locations
    evoData?.messageId ||
    evoData?.MessageID ||
    evoData?.key?.id ||
    evoData?.key?.ID ||
    null
  );
}

export type WARouterInput = {
  supabase: any;
  conversation: WAConversation;
  to: string; // já normalizado idealmente
  text?: string;
  media?: WAMedia;
};

async function invokeMetaSend(body: Record<string, unknown>): Promise<{ data: any; error: Error | null; status: number }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return { data: null, error: new Error('Meta send internal credentials unavailable'), status: 500 };
  }

  // Chamadas internas usam a chave apenas no header apikey quando ela é opaca.
  // Chaves JWT legadas também seguem em Authorization para compatibilidade.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: serviceKey,
  };
  if (serviceKey.split('.').length === 3) headers.Authorization = `Bearer ${serviceKey}`;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/meta-whatsapp-send`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const rawText = await response.text();
    let data: any = null;
    if (rawText) {
      try { data = JSON.parse(rawText); }
      catch { data = { error: rawText.slice(0, 500) }; }
    }
    return {
      data,
      error: response.ok ? null : new Error(data?.error || `meta-whatsapp-send HTTP ${response.status}`),
      status: response.status,
    };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)), status: 0 };
  }
}

function normalizePhoneBR(p: string): string {
  let phone = (p || '').replace(/\D/g, '');
  if (!phone) return phone;
  if (!phone.startsWith('55')) phone = '55' + phone;
  return phone;
}

export async function sendWhatsAppForConversation(
  input: WARouterInput,
): Promise<WARouterResult> {
  const { supabase, conversation } = input;
  const to = normalizePhoneBR(input.to || conversation.visitor_phone || '');

  // Prioridade: Meta (oficial) tem preferência se ambos por acaso estiverem setados.
  const provider: 'meta' | 'evolution' | 'none' =
    conversation.meta_connection_id ? 'meta'
      : conversation.evolution_instance_id ? 'evolution'
        : 'none';

  console.log(
    `[wa-router] provider=${provider} conv=${conversation.id ?? '-'} ` +
    `meta_conn=${conversation.meta_connection_id ?? '-'} ` +
    `evo_inst=${conversation.evolution_instance_id ?? '-'} to=${to}`,
  );

  if (provider === 'none') {
    return {
      ok: false,
      provider,
      error: 'NO_CONNECTION',
      message: 'Conversa sem conexão WhatsApp vinculada (Meta ou Evolution).',
    };
  }

  if (provider === 'meta') {
    // Adapta mídia: meta espera { link, caption, filename }
    let type: string = 'text';
    let mediaPayload: Record<string, unknown> | undefined;
    if (input.media) {
      const k = input.media.kind;
      // Meta não tem "sticker" no mesmo endpoint do send livre — manda como image
      type = k === 'sticker' ? 'image' : k;
      mediaPayload = {
        link: input.media.url,
        ...(input.media.caption && k !== 'audio' ? { caption: input.media.caption } : {}),
        ...(input.media.filename && k === 'document' ? { filename: input.media.filename } : {}),
      };
    }

    const body: Record<string, unknown> = {
      connection_id: conversation.meta_connection_id,
      organization_id: conversation.organization_id,
      // IMPORTANTE: NÃO passamos conversation_id aqui — a mensagem já foi
      // inserida pelo chamador (webchat-inbox/etc). Passar duplicaria.
      to,
      type,
    };
    if (type === 'text') body.text = input.text ?? '';
    else if (mediaPayload) body.media = mediaPayload;

    // Fetch direto preserva o corpo de erros do gateway/Graph e envia a
    // autenticação interna explicitamente. Não compartilha cliente com Instagram.
    const { data, error, status } = await invokeMetaSend(body);
    const d = (data ?? {}) as any;
    const ok = !error && d?.ok !== false && !d?.error;
    if (!ok) {
      const errMsg = d?.error || error?.message || 'meta-whatsapp-send failed';
      const msg = d?.message;
      console.error('[wa-router] meta-whatsapp-send FAILED:', JSON.stringify({ status, error: error?.message, data }).slice(0, 800));
      return {
        ok: false,
        provider,
        error: errMsg,
        message: msg,
        graph_code: d?.graph_code ?? null,
        graph_subcode: d?.graph_subcode ?? null,
        fbtrace_id: d?.fbtrace_id ?? null,
        raw: { status, ...d },
      };
    }
    return { ok: true, provider, messageId: extractProviderMessageId(data), raw: data };
  }

  // provider === 'evolution'
  let evoBody: Record<string, unknown>;
  if (input.media) {
    const m = input.media;
    evoBody = {
      organization_id: conversation.organization_id,
      instance_id: conversation.evolution_instance_id,
      conversation_id: conversation.id,
      type: 'media',
      to,
      payload: {
        type: m.kind === 'sticker' ? 'image' : m.kind,
        url: m.url,
        mimetype: m.mime || (m.kind === 'audio' ? 'audio/ogg' : undefined),
        fileName: m.filename || (m.kind === 'audio' ? `audio-${Date.now()}.ogg` : undefined),
        caption: m.kind === 'audio' ? undefined : (input.text || m.caption || undefined),
      },
    };
  } else {
    evoBody = {
      organization_id: conversation.organization_id,
      instance_id: conversation.evolution_instance_id,
      conversation_id: conversation.id,
      type: 'text',
      to,
      payload: { text: input.text ?? '' },
    };
  }

  const { data, error } = await supabase.functions.invoke('evolution-send', { body: evoBody });
  const ok = !error && (data as any)?.ok !== false;
  if (!ok) {
    console.error('[wa-router] evolution-send FAILED:', JSON.stringify({ error, data }).slice(0, 500));
    const code = (data as any)?.code ?? undefined;
    const msg = (data as any)?.message ?? undefined;
    return {
      ok: false,
      provider,
      code,
      error: (data as any)?.error || error?.message || (data as any)?.body || 'evolution-send failed',
      message: msg,
      raw: data,
    };
  }
  return { ok: true, provider, messageId: extractProviderMessageId(data), raw: data };
}
