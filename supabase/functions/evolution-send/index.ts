import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhoneBR, phoneVariantsBR } from "../_shared/phone.ts";
import { canSendWhatsAppToPhone } from "../_shared/optin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendBody {
  organization_id?: string;
  instance_id?: string; // our DB id
  conversation_id?: string;
  type:
    | "text"
    | "media"
    | "audio"
    | "sticker"
    | "location"
    | "contact"
    | "link"
    | "poll"
    | "reaction"
    | "edit"
    | "delete"
    | "markRead"
    | "presence";
  to: string; // phone digits only
  payload: Record<string, any>;
}

async function evoFetch(url: string, apikey: string, path: string, body: any) {
  const fullUrl = `${url}${path}`;
  console.log(`[evolution-send] POST ${path} body=${JSON.stringify(body).slice(0, 300)}`);
  const res = await fetch(fullUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    console.error(
      `[evolution-send] error: status=${res.status} path=${path} body=${
        typeof parsed === "string" ? parsed.slice(0, 500) : JSON.stringify(parsed).slice(0, 500)
      }`
    );
  } else {
    console.log(`[evolution-send] success: status=${res.status} path=${path}`);
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

// Detecta erro "número não registrado no WhatsApp" nas várias variações que
// o Evolution Go pode retornar (upstream Baileys).
function isNotRegisteredError(res: { ok: boolean; body: any }): boolean {
  if (res.ok) return false;
  const raw = typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? '');
  return /not\s+registered\s+on\s+whatsapp/i.test(raw)
    || /is\s+not\s+on\s+whatsapp/i.test(raw)
    || /não\s+est[aá]\s+no\s+whatsapp/i.test(raw);
}

function providerPhoneVariantsBR(phone: string): string[] {
  return phoneVariantsBR(phone).filter((v) => v.startsWith('55'));
}

// Chama evoFetch e, se falhar como "not registered", tenta a variante com/sem 9.
// Retorna { res, phoneUsed } — phoneUsed vem preenchido se o retry teve sucesso
// com um número diferente do original (o caller usa para reescrever visitor_phone).
async function evoSendWithPhoneFallback(
  url: string,
  apikey: string,
  path: string,
  buildBody: (phone: string) => any,
  originalPhone: string,
  opts?: { lidJid?: string | null; confirmedJid?: string | null; confirmedJids?: string[] | null },
): Promise<{ res: Awaited<ReturnType<typeof evoFetch>>; phoneUsed: string; targetUsed: 'phone' | 'phone_variant' | 'lid' | 'confirmed_jid'; lidAttempted?: string | null; confirmedJidAttempted?: string | null }> {
  const variants = providerPhoneVariantsBR(originalPhone);
  let last: Awaited<ReturnType<typeof evoFetch>> | null = null;
  for (let i = 0; i < variants.length; i++) {
    const phone = variants[i];
    const res = await evoFetch(url, apikey, path, buildBody(phone));
    if (res.ok) return { res, phoneUsed: phone, targetUsed: phone === originalPhone ? 'phone' : 'phone_variant' };
    last = res;
    if (!isNotRegisteredError(res)) break; // erro diferente → não adianta trocar formato
    if (i < variants.length - 1) {
      console.warn(`[evolution-send] jid_fallback: retrying with alt phone (from=${phone} to=${variants[i + 1]})`);
    }
  }

  // Fallback 2: JID confirmado por inbound anterior. Se o cliente já nos escreveu,
  // salvamos `metadata.wa_confirmed_jid` (ex.: 5551968763758@s.whatsapp.net).
  // Reusar esse JID força o Evolution/Baileys a pular o pré-check onWhatsApp
  // que às vezes recusa números válidos intermitentemente.
  const confirmedJids = uniqueStrings([...(opts?.confirmedJids || []), opts?.confirmedJid || null]);
  const confirmedAttempted: string[] = [];
  if (confirmedJids.length > 0 && last && isNotRegisteredError(last)) {
    for (const confirmedJid of confirmedJids) {
      console.warn(`[evolution-send] confirmed_jid_fallback: retrying with ${confirmedJid}`);
      confirmedAttempted.push(confirmedJid);
      const cRes = await evoFetch(url, apikey, path, buildBody(confirmedJid));
      if (cRes.ok) return { res: cRes, phoneUsed: originalPhone, targetUsed: 'confirmed_jid', confirmedJidAttempted: confirmedJid, lidAttempted: opts?.lidJid ?? null };
      last = cRes;
      if (!isNotRegisteredError(cRes)) break;
    }
  }

  const lidJid = opts?.lidJid;
  // WhatsApp LID migration: alguns contatos recebem inbound normal com @lid,
  // mas o provedor recusa o telefone como "not registered". Só tentamos LID
  // quando o erro foi exatamente esse e a conversa já tem wa_lid confiável.
  if (lidJid && last && isNotRegisteredError(last)) {
    console.warn(`[evolution-send] lid_fallback: retrying with ${lidJid}`);
    const lidRes = await evoFetch(url, apikey, path, buildBody(lidJid));
    if (lidRes.ok) return { res: lidRes, phoneUsed: originalPhone, targetUsed: 'lid', lidAttempted: lidJid, confirmedJidAttempted: confirmedAttempted.join(',') || null };
    last = lidRes;
  }

  return { res: last!, phoneUsed: originalPhone, targetUsed: 'phone', lidAttempted: lidJid ?? null, confirmedJidAttempted: confirmedAttempted.join(',') || null };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const s = String(value || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function asSWhatsappJid(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw.endsWith('@g.us') || raw.includes('@lid')) return null;
  if (raw.includes('@s.whatsapp.net')) return raw;
  if (raw.includes('@')) return null;
  const digits = raw.replace(/\D/g, '');
  return digits ? `${digits}@s.whatsapp.net` : null;
}


async function resolveConversationWaLid(
  supabase: any,
  organizationId: string,
  conversationId?: string | null,
): Promise<string | null> {
  if (!conversationId) return null;
  try {
    const { data } = await supabase
      .from('webchat_conversations')
      .select('metadata')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    const raw = (data?.metadata as any)?.wa_lid;
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    return s.includes('@lid') ? s : `${s.replace(/\D/g, '')}@lid`;
  } catch (e) {
    console.warn('[evolution-send] failed to resolve wa_lid:', e);
    return null;
  }
}

// JID confirmado pelo último inbound recebido (ex.: "5551968763758@s.whatsapp.net").
// Salvo pelo evolution-webhook em metadata.wa_confirmed_jid quando o cliente
// escreve pra gente. Usado como fallback quando o pre-check do provedor recusa
// o número mesmo tendo histórico válido.
async function resolveConversationConfirmedJids(
  supabase: any,
  organizationId: string,
  conversationId?: string | null,
): Promise<string[]> {
  if (!conversationId) return [];
  const candidates: Array<string | null> = [];
  try {
    const { data } = await supabase
      .from('webchat_conversations')
      .select('metadata, visitor_phone, visitor_phone_normalized, evolution_instance_id')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    // 1) JID explicitly captured from a previous inbound (evolution-webhook)
    const meta = ((data?.metadata as any) || {}) as Record<string, any>;
    candidates.push(asSWhatsappJid(meta.wa_confirmed_jid));
    if (Array.isArray(meta.wa_confirmed_jids)) {
      for (const raw of meta.wa_confirmed_jids) candidates.push(asSWhatsappJid(raw));
    }

    // 2) Legacy rescue: older inbound rows stored the provider's remote_jid in
    // processed_messages before conversation metadata existed. This preserves
    // exact provider IDs like 51989482742@s.whatsapp.net (without BR DDI 55),
    // which is what Evolution Go/whatsmeow sometimes requires to skip the
    // unreliable onWhatsApp pre-check for DDD 51 numbers.
    const { data: inboundRows } = await supabase
      .from('webchat_messages')
      .select('metadata')
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(8);
    const messageIds = uniqueStrings((inboundRows || []).map((row: any) => row?.metadata?.evolution_message_id));
    if (messageIds.length > 0) {
      let q = supabase
        .from('processed_messages')
        .select('remote_jid')
        .in('message_id', messageIds)
        .order('created_at', { ascending: false })
        .limit(8);
      if ((data as any)?.evolution_instance_id) q = q.eq('instance_id', (data as any).evolution_instance_id);
      const { data: processedRows } = await q;
      for (const row of processedRows || []) candidates.push(asSWhatsappJid((row as any).remote_jid));
    }

    // 3) Fallback for legacy conversations without stored JID: derive all BR
    // variants from visitor_phone, including with/without DDI 55 and the extra 9.
    // Only used after phone+variants fail, so a bad number just errors again.
    const digits = String((data as any)?.visitor_phone_normalized || (data as any)?.visitor_phone || '')
      .replace(/\D/g, '');
    for (const variant of phoneVariantsBR(digits)) candidates.push(asSWhatsappJid(variant));
  } catch (e) {
    console.warn('[evolution-send] failed to resolve wa_confirmed_jid:', e);
  }
  return uniqueStrings(candidates);
}



async function hasTrustedWhatsAppHistory(
  supabase: any,
  organizationId: string,
  phone: string,
  conversationId?: string | null,
): Promise<{ hasHistory: boolean; hasRecentInbound: boolean; conversationIds: string[] }> {
  const canonical = normalizePhoneBR(phone) || phone.replace(/\D/g, '');
  const variants = phoneVariantsBR(phone);
  const conversationIds = new Set<string>();
  if (conversationId) conversationIds.add(conversationId);

  try {
    const { data: convs } = await supabase
      .from('webchat_conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('channel', 'whatsapp')
      .or(`visitor_phone.in.(${variants.join(',')}),visitor_phone_normalized.eq.${canonical}`)
      .limit(25);
    for (const c of convs || []) conversationIds.add(c.id);
  } catch (e) {
    console.warn('[evolution-send] history conversation lookup failed:', e);
  }

  if (conversationIds.size === 0) return { hasHistory: false, hasRecentInbound: false, conversationIds: [] };

  try {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { count } = await supabase
      .from('webchat_messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', Array.from(conversationIds))
      .eq('direction', 'inbound')
      .gt('created_at', since);
    return {
      hasHistory: true,
      hasRecentInbound: (count ?? 0) > 0,
      conversationIds: Array.from(conversationIds),
    };
  } catch (e) {
    console.warn('[evolution-send] history inbound lookup failed:', e);
    return { hasHistory: true, hasRecentInbound: false, conversationIds: Array.from(conversationIds) };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = (await req.json()) as SendBody;
    let { organization_id, instance_id, conversation_id, type, to, payload } = body;

    if (!type || !to || !payload) {
      return new Response(JSON.stringify({ error: "Missing type/to/payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth: if Bearer present, derive org from user
    if (!organization_id) {
      const auth = req.headers.get("Authorization");
      if (auth) {
        const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
        if (user) {
          const { data: profile } = await supabase
            .from("profiles").select("organization_id").eq("id", user.id).single();
          organization_id = profile?.organization_id || undefined;
        }
      }
    }

    const normalizedTo = normalizePhoneBR(to) || String(to).replace(/\D/g, '');
    const allowed = await canSendWhatsAppToPhone(supabase, organization_id, normalizedTo);
    if (!allowed) {
      return new Response(JSON.stringify({ ok: false, error: "OPTED_OUT", code: "OPTED_OUT", message: "Lead optou por sair da lista de WhatsApp." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    {
      const { assertOrgActive } = await import("../_shared/org-status.ts");
      const guard = await assertOrgActive(supabase, organization_id);
      if (!guard.ok) {
        return new Response(JSON.stringify(guard.body), {
          status: guard.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // Resolve instance
    let instance: any;
    if (instance_id) {
      const { data } = await supabase
        .from("evolution_instances").select("*")
        .eq("id", instance_id).eq("organization_id", organization_id).single();
      instance = data;
    } else {
      // Sem instance_id: pega a melhor instância conectada da org (default primeiro, senão mais recente)
      const { data } = await supabase
        .from("evolution_instances").select("*")
        .eq("organization_id", organization_id)
        .eq("status", "connected")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      instance = data;
    }
    if (!instance) {
      return new Response(JSON.stringify({ error: "No Evolution instance found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Org-level settings (legacy/per-org override)
    const { data: cfg } = await supabase
      .from("integration_settings").select("settings")
      .eq("organization_id", organization_id)
      .eq("integration_type", "whatsapp_provider").maybeSingle();
    const settings = cfg?.settings ?? {};
    let url = String(settings.evolution_go_url || "").replace(/\/$/, "");
    let globalKey = String(settings.evolution_go_global_api_key || "");

    // Fallback to platform-wide Evolution Go server (current architecture)
    if (!url || !globalKey) {
      const { data: platformCfg } = await supabase
        .from("platform_settings")
        .select("evolution_go_url, evolution_go_global_api_key")
        .maybeSingle();
      url = url || String((platformCfg as any)?.evolution_go_url || "").replace(/\/$/, "");
      globalKey = globalKey || String((platformCfg as any)?.evolution_go_global_api_key || "");
    }

    // Evolution Go: instance is identified by the instance_token in the apikey header
    const apikey = instance.instance_token || globalKey;
    if (!url || !apikey) {
      console.error("[evolution-send] Evolution Go not configured", {
        org_has_url: !!settings.evolution_go_url,
        platform_has_url: !!url,
        instance_has_token: !!instance.instance_token,
      });
      return new Response(JSON.stringify({ error: "Evolution Go not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = to.replace(/\D/g, "");
    const waLid = await resolveConversationWaLid(supabase, organization_id, conversation_id);
    const confirmedJids = await resolveConversationConfirmedJids(supabase, organization_id, conversation_id);

    let res: Awaited<ReturnType<typeof evoFetch>>;
    let phoneUsed = phone;
    let targetUsed: 'phone' | 'phone_variant' | 'lid' | 'confirmed_jid' = 'phone';
    let lidAttempted: string | null = null;
    let confirmedJidAttempted: string | null = null;

    switch (type) {
      case "text": {
        const r = await evoSendWithPhoneFallback(
          url, apikey, `/send/text`,
          (p) => ({ number: p, text: payload.text }),
          phone,
          { lidJid: waLid, confirmedJids },
        );
        res = r.res; phoneUsed = r.phoneUsed; targetUsed = r.targetUsed; lidAttempted = r.lidAttempted ?? null; confirmedJidAttempted = r.confirmedJidAttempted ?? null;
        break;
      }
      case "media": {
        const rawMedia = payload.url ?? payload.media;
        const mediaType = payload.type || payload.mediatype || "image";
        const isDataUrl = typeof rawMedia === "string" && rawMedia.startsWith("data:");
        console.log(`[evolution-send] media transport=${isDataUrl ? "base64" : "url"} mimetype=${payload.mimetype || "unknown"}`);
        const r = await evoSendWithPhoneFallback(
          url, apikey, `/send/media`,
          (p) => {
            const mp: Record<string, any> = {
              number: p,
              type: mediaType,
              caption: payload.caption,
              fileName: payload.fileName,
            };
            if (isDataUrl) mp.media = rawMedia; else mp.url = rawMedia;
            if (payload.mimetype) mp.mimetype = payload.mimetype;
            return mp;
          },
          phone,
          { lidJid: waLid, confirmedJids },
        );
        res = r.res; phoneUsed = r.phoneUsed; targetUsed = r.targetUsed; lidAttempted = r.lidAttempted ?? null; confirmedJidAttempted = r.confirmedJidAttempted ?? null;
        break;
      }
      case "audio": {
        const audioUrl = payload.audio || payload.url;
        const isDataUrl = typeof audioUrl === "string" && audioUrl.startsWith("data:");
        console.log(`[evolution-send] audio routed to /send/media transport=${isDataUrl ? "base64" : "url"}`);
        const r = await evoSendWithPhoneFallback(
          url, apikey, `/send/media`,
          (p) => {
            const ap: Record<string, any> = {
              number: p,
              type: "audio",
              mimetype: payload.mimetype || "audio/ogg",
              fileName: payload.fileName || `audio-${Date.now()}.ogg`,
            };
            if (isDataUrl) ap.media = audioUrl; else ap.url = audioUrl;
            return ap;
          },
          phone,
          { lidJid: waLid, confirmedJids },
        );
        res = r.res; phoneUsed = r.phoneUsed; targetUsed = r.targetUsed; lidAttempted = r.lidAttempted ?? null; confirmedJidAttempted = r.confirmedJidAttempted ?? null;
        break;
      }
      case "sticker":
        res = await evoFetch(url, apikey, `/send/sticker`, {
          number: phone,
          sticker: payload.sticker,
        });
        break;
      case "location":
        res = await evoFetch(url, apikey, `/send/location`, {
          number: phone,
          latitude: payload.latitude,
          longitude: payload.longitude,
          name: payload.name,
          address: payload.address,
        });
        break;
      case "contact":
        res = await evoFetch(url, apikey, `/send/contact`, {
          number: phone,
          contact: payload.contacts || payload.contact,
        });
        break;
      case "link":
        res = await evoFetch(url, apikey, `/send/link`, {
          number: phone,
          link: payload.link,
          text: payload.text,
        });
        break;
      case "poll":
        res = await evoFetch(url, apikey, `/send/poll`, {
          number: phone,
          name: payload.name,
          selectableCount: payload.selectableCount || 1,
          values: payload.values,
        });
        break;
      case "reaction":
        res = await evoFetch(url, apikey, `/send/reaction`, {
          key: payload.key,
          reaction: payload.reaction,
        });
        break;
      case "edit":
        res = await evoFetch(url, apikey, `/chat/updateMessage`, {
          number: phone,
          key: payload.key,
          text: payload.text,
        });
        break;
      case "delete":
        res = await evoFetch(url, apikey, `/chat/deleteMessageForEveryone`, {
          id: payload.id,
          remoteJid: payload.remoteJid,
          fromMe: payload.fromMe ?? true,
          participant: payload.participant,
        });
        break;
      case "markRead":
        res = await evoFetch(url, apikey, `/chat/markMessageAsRead`, {
          readMessages: payload.readMessages,
        });
        break;
      case "presence": {
        // Evolution Go contract: POST /message/presence { number, state, isAudio? }
        // States Baileys: composing | recording | paused | available | unavailable
        const state = String(payload.state || payload.presence || "composing");
        const isAudio = payload.isAudio === true || state === "recording";
        res = await evoFetch(url, apikey, `/message/presence`, {
          number: phone,
          state,
          isAudio,
        });
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Se acertamos com uma variante diferente do número original, persistimos
    // o formato correto no lead/conversa para próximos envios acertarem de primeira.
    if (res.ok && phoneUsed !== phone) {
      console.log(`[evolution-send] phone auto-corrected: ${phone} → ${phoneUsed}`);
      try {
        await supabase
          .from('webchat_conversations')
          .update({ visitor_phone: phoneUsed })
          .eq('organization_id', organization_id)
          .eq('visitor_phone', phone);
        await supabase
          .from('leads')
          .update({ phone: phoneUsed })
          .eq('organization_id', organization_id)
          .eq('phone', phone);
      } catch (e) {
        console.warn('[evolution-send] failed to persist corrected phone', e);
      }
    }

    // Erro "número não está no WhatsApp" → resposta amigável com HTTP 200 (para
    // que supabase.functions.invoke não jogue) mas ok:false + code estável.
    const failedAfterAllFallbacks = !res.ok && (!!lidAttempted || !!confirmedJidAttempted);
    if (!res.ok && (isNotRegisteredError(res) || failedAfterAllFallbacks)) {
      const history = await hasTrustedWhatsAppHistory(supabase, organization_id, phone, conversation_id);
      const remoteConnectedRaw = instance?.metadata?.remote?.connected;
      const remoteConnected = typeof remoteConnectedRaw === 'boolean' ? remoteConnectedRaw : null;
      const sessionWarning = instance?.status === 'connected' && remoteConnected === false;

      if (history.hasRecentInbound || sessionWarning) {
        return new Response(JSON.stringify({
          ok: false,
          code: 'WHATSAPP_VALIDATION_UNRELIABLE',
          error: 'WHATSAPP_VALIDATION_UNRELIABLE',
          message: waLid
            ? 'A conexão WhatsApp não confirmou este número mesmo com histórico e LID. A falha parece ser da sessão/provedor, não do telefone.'
            : 'A conexão WhatsApp não confirmou este número, mas há histórico com ele. A falha parece ser da sessão/conexão, não do telefone.',
          status: res.status,
          body: res.body,
          phone_attempted: phone,
          lid_attempted: lidAttempted,
          confirmed_jid_attempted: confirmedJidAttempted,
          target_used: targetUsed,
          checked_variants: providerPhoneVariantsBR(phone),
          has_recent_inbound: history.hasRecentInbound,
          has_existing_conversation: history.hasHistory,
          session_warning: sessionWarning,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        ok: false,
        code: 'PHONE_NOT_ON_WHATSAPP',
        error: 'PHONE_NOT_ON_WHATSAPP',
        message: 'Número do lead não está registrado no WhatsApp. Verifique o telefone cadastrado.',
        status: res.status,
        body: res.body,
        phone_attempted: phone,
        lid_attempted: lidAttempted,
        confirmed_jid_attempted: confirmedJidAttempted,
        target_used: targetUsed,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return real HTTP status when Evolution responds with error
    return new Response(JSON.stringify({ ...res, phone_attempted: phone, lid_attempted: lidAttempted, confirmed_jid_attempted: confirmedJidAttempted, target_used: targetUsed }), {
      status: res.ok ? 200 : res.status >= 400 ? res.status : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[evolution-send] exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
