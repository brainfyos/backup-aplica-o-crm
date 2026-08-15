// Verifica se um número está registrado no WhatsApp via Evolution Go.
// Tenta variantes com/sem 9º dígito (BR) e retorna o JID normalizado quando existir.
// Se `apply=true` e o número normalizado for diferente do original, atualiza
// leads.phone e webchat_conversations.visitor_phone da organização.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { phoneVariantsBR, normalizePhoneBR } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const m = String(jid).match(/^(\d+)@/);
  return m ? m[1] : null;
}

function providerPhoneVariantsBR(phone: string): string[] {
  return phoneVariantsBR(phone).filter((v) => v.startsWith("55"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as {
      organization_id?: string;
      instance_id?: string;
      conversation_id?: string;
      phone: string;
      apply?: boolean;
    };

    if (!body?.phone) {
      return new Response(JSON.stringify({ error: "phone required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let organization_id = body.organization_id;
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
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let conversation: any = null;
    if (body.conversation_id) {
      const { data } = await supabase
        .from("webchat_conversations")
        .select("id, organization_id, evolution_instance_id, visitor_phone, visitor_phone_normalized, last_inbound_at, metadata")
        .eq("id", body.conversation_id)
        .eq("organization_id", organization_id)
        .maybeSingle();
      conversation = data;
    }

    // Resolve instance (conversation instance first, then requested, then connected preferred)
    let instance: any;
    const preferredInstanceId = body.instance_id || conversation?.evolution_instance_id;
    if (preferredInstanceId) {
      const { data } = await supabase
        .from("evolution_instances").select("*")
        .eq("id", preferredInstanceId).eq("organization_id", organization_id).maybeSingle();
      instance = data;
    } else {
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
      return new Response(JSON.stringify({
        ok: false, error: "no_instance",
        message: "Nenhuma instância WhatsApp conectada encontrada para esta empresa.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Config
    const { data: cfg } = await supabase
      .from("integration_settings").select("settings")
      .eq("organization_id", organization_id)
      .eq("integration_type", "whatsapp_provider").maybeSingle();
    const settings = (cfg?.settings ?? {}) as any;
    let url = String(settings.evolution_go_url || "").replace(/\/$/, "");
    let globalKey = String(settings.evolution_go_global_api_key || "");
    if (!url || !globalKey) {
      const { data: platformCfg } = await supabase
        .from("platform_settings")
        .select("evolution_go_url, evolution_go_global_api_key")
        .maybeSingle();
      url = url || String((platformCfg as any)?.evolution_go_url || "").replace(/\/$/, "");
      globalKey = globalKey || String((platformCfg as any)?.evolution_go_global_api_key || "");
    }
    const apikey = instance.instance_token || globalKey;
    if (!url || !apikey) {
      return new Response(JSON.stringify({ ok: false, error: "provider_not_configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const original = body.phone.replace(/\D/g, "");
    const canonical = normalizePhoneBR(original) || original;
    const lookupVariants = phoneVariantsBR(original);
    const variants = providerPhoneVariantsBR(original);
    const checked: Array<{ number: string; exists: boolean; jid: string | null; raw?: any }> = [];
    let found: { number: string; jid: string | null } | null = null;

    for (const v of variants) {
      try {
        // Evolution Go: POST /user/check com body { number: [...] }
        const res = await fetch(`${url}/user/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey },
          body: JSON.stringify({ number: [v] }),
        });
        const text = await res.text();
        let parsed: any = text;
        try { parsed = JSON.parse(text); } catch { /* keep text */ }

        // Evolution Go: { data: { Users: [{ Query, IsInWhatsapp, JID, LID }] }, message: "success" }
        const arr = Array.isArray(parsed?.data?.Users) ? parsed.data.Users
          : Array.isArray(parsed?.data?.users) ? parsed.data.users
          : Array.isArray(parsed?.Users) ? parsed.Users
          : Array.isArray(parsed?.data) ? parsed.data
          : Array.isArray(parsed) ? parsed
          : Array.isArray(parsed?.results) ? parsed.results
          : [];
        const first = arr[0] ?? {};
        const exists = !!(first.IsInWhatsapp ?? first.isInWhatsapp ?? first.exists ?? first.isRegistered ?? first.registered);
        const jid = first.JID || first.jid || first.wa_jid || first.RemoteJID || null;
        checked.push({ number: v, exists, jid, raw: res.ok ? undefined : parsed });
        if (exists) { found = { number: v, jid }; break; }
      } catch (e: any) {
        checked.push({ number: v, exists: false, jid: null, raw: { error: String(e?.message || e) } });
      }
    }

    const recentCutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    const conversationIds = new Set<string>();
    if (conversation?.id) conversationIds.add(conversation.id);
    try {
      const { data: convs } = await supabase
        .from("webchat_conversations")
        .select("id, last_inbound_at, visitor_phone, visitor_phone_normalized")
        .eq("organization_id", organization_id)
        .eq("channel", "whatsapp")
        .or(`visitor_phone.in.(${lookupVariants.join(",")}),visitor_phone_normalized.eq.${canonical}`)
        .limit(20);
      for (const c of convs || []) conversationIds.add(c.id);
      if (!conversation && convs?.length) conversation = convs[0];
    } catch (e) {
      console.warn("[evolution-check-number] conversation lookup failed", e);
    }

    let inboundCount = 0;
    let lastInboundAt: string | null = conversation?.last_inbound_at ?? null;
    if (conversationIds.size > 0) {
      try {
        const { count } = await supabase
          .from("webchat_messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", Array.from(conversationIds))
          .eq("direction", "inbound")
          .gte("created_at", recentCutoff);
        inboundCount = count ?? 0;

        const { data: lastMsg } = await supabase
          .from("webchat_messages")
          .select("created_at")
          .in("conversation_id", Array.from(conversationIds))
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastInboundAt = lastMsg?.created_at ?? lastInboundAt;
      } catch (e) {
        console.warn("[evolution-check-number] inbound lookup failed", e);
      }
    }

    const hasExistingConversation = conversationIds.size > 0;
    const hasRecentInbound = inboundCount > 0;
    const waLidRaw = (conversation?.metadata as any)?.wa_lid;
    const waLid = waLidRaw ? String(waLidRaw) : null;
    const remoteConnectedRaw = instance?.metadata?.remote?.connected;
    const remoteConnected = typeof remoteConnectedRaw === "boolean" ? remoteConnectedRaw : null;
    const sessionWarning = instance?.status === "connected" && remoteConnected === false;
    const unreliableNegative = !found && (hasRecentInbound || hasExistingConversation || sessionWarning || !!waLid);
    const reliable = found ? true : !unreliableNegative;
    const diagnosis = found
      ? "ok"
      : unreliableNegative
      ? "provider_false_negative_or_session_issue"
      : "number_not_found";
    const message = found
      ? "Número confirmado no WhatsApp pela conexão atual."
      : unreliableNegative
      ? waLid
        ? "Este contato já enviou mensagem e possui LID do WhatsApp, mas a conexão não conseguiu confirmar/enviá-lo. Isso indica problema de sessão/provedor, não do cadastro do lead."
        : "Há histórico com este número, mas a conexão não conseguiu confirmá-lo. Isso indica problema de sessão/conexão, não do cadastro do lead."
      : "Número não confirmado no WhatsApp pela conexão atual.";

    let updated = false;
    const normalized = found ? (jidToPhone(found.jid) || found.number) : null;
    if (body.apply && found && normalized && normalized !== original) {
      try {
        await supabase.from("webchat_conversations")
          .update({ visitor_phone: normalized })
          .eq("organization_id", organization_id)
          .eq("visitor_phone", original);
        await supabase.from("leads")
          .update({ phone: normalized })
          .eq("organization_id", organization_id)
          .eq("phone", original);
        updated = true;
      } catch (e) {
        console.warn("[evolution-check-number] failed to persist normalized phone", e);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      exists: !!found,
      reliable,
      diagnosis,
      message,
      original_phone: original,
      normalized_phone: normalized,
      jid: found?.jid ?? null,
      wa_lid: waLid,
      checked_variants: checked.map((c) => ({ number: c.number, exists: c.exists, jid: c.jid })),
      updated,
      has_recent_inbound: hasRecentInbound,
      has_existing_conversation: hasExistingConversation,
      last_inbound_at: lastInboundAt,
      session_warning: sessionWarning,
      instance: { id: instance.id, name: instance.name, status: instance.status, remote_connected: remoteConnected },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[evolution-check-number] exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
