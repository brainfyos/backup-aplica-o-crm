// send-material — envia UM material da biblioteca (materials) para a conversa.
// Roteia por canal: WhatsApp (Meta Cloud ou Evolution) → mídia nativa; Webchat → mensagem com metadata.media.
// Tipo "link" sempre vai como texto (URL). Segue o mesmo padrão de validação/base64 do send-catalog-item.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendBody {
  conversation_id: string;
  material_id: string;
  caption?: string | null;
}

// Mapeia o "type" do material para o mediatype aceito pelos providers.
function toMediaType(materialType: string, url: string): "image" | "video" | "document" | "link" {
  const t = (materialType || "").toLowerCase();
  if (t === "link") return "link";
  if (t === "image") return "image";
  if (t === "video") return "video";
  if (t === "document") return "document";
  // "other" ou desconhecido → decide por extensão
  const u = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/.test(u)) return "image";
  if (/\.(mp4|mov|webm|mkv|avi)(\?|$)/.test(u)) return "video";
  if (/\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip)(\?|$)/.test(u)) return "document";
  return "link";
}

function guessFileName(name: string, url: string): string {
  const clean = name.replace(/[^\w\-. ]+/g, "_").trim() || "material";
  const m = url.match(/\.([a-z0-9]{2,5})(\?|$)/i);
  const ext = m ? m[1].toLowerCase() : "";
  return ext && !clean.toLowerCase().endsWith("." + ext) ? `${clean}.${ext}` : clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as SendBody;
    if (!body.conversation_id || !body.material_id) {
      return new Response(JSON.stringify({ error: "conversation_id and material_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conv, error: convErr } = await supabase
      .from("webchat_conversations")
      .select("id, organization_id, channel, lead_id, evolution_instance_id, meta_connection_id, visitor_phone")
      .eq("id", body.conversation_id)
      .maybeSingle();

    if (convErr || !conv) {
      return new Response(JSON.stringify({ error: "conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: material, error: matErr } = await supabase
      .from("materials")
      .select("*")
      .eq("id", body.material_id)
      .eq("organization_id", conv.organization_id)
      .maybeSingle();

    if (matErr || !material) {
      return new Response(JSON.stringify({ error: "material not found or wrong org" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mediaType = toMediaType(material.type, material.url);
    const caption = (body.caption && body.caption.trim())
      ? body.caption.trim()
      : `📎 ${material.name}${material.objective ? `\n\n${material.objective}` : ""}`;

    // Se URL vem do bucket privado "materials" do Storage, resolve signed URL.
    let mediaUrl: string = material.url;
    try {
      const storageMatch = material.url.match(/\/storage\/v1\/object\/(?:public|sign)\/materials\/(.+?)(?:\?|$)/);
      if (storageMatch) {
        const path = decodeURIComponent(storageMatch[1]);
        const { data: signed } = await supabase.storage.from("materials").createSignedUrl(path, 60 * 60);
        if (signed?.signedUrl) mediaUrl = signed.signedUrl;
      }
    } catch (signErr) {
      console.warn("[send-material] signed URL resolution failed:", signErr);
    }

    const channel = (conv.channel || "chat").toLowerCase();
    let phone: string | null = conv.visitor_phone || null;
    if (!phone && conv.lead_id) {
      const { data: lead } = await supabase.from("leads").select("phone").eq("id", conv.lead_id).maybeSingle();
      phone = lead?.phone || null;
    }

    let delivered = false;
    let deliveryChannel = channel;
    let providerError: string | null = null;

    // === WhatsApp (Meta Cloud OU Evolution) ===
    if (channel === "whatsapp" && phone && (conv.evolution_instance_id || (conv as any).meta_connection_id)) {
      // Tipo "link" → manda como texto simples
      if (mediaType === "link") {
        const text = `${caption}\n\n🔗 ${mediaUrl}`;
        if ((conv as any).meta_connection_id) {
          const { data, error } = await supabase.functions.invoke("meta-whatsapp-send", {
            body: {
              connection_id: (conv as any).meta_connection_id,
              organization_id: conv.organization_id,
              to: phone.replace(/\D/g, ""),
              type: "text",
              text: { body: text },
            },
          });
          delivered = !error && !(data as any)?.error;
          deliveryChannel = "meta_whatsapp";
          if (!delivered) providerError = error?.message || (data as any)?.error || "meta_send_failed";
        } else {
          const { data, error } = await supabase.functions.invoke("evolution-send", {
            body: {
              organization_id: conv.organization_id,
              instance_id: conv.evolution_instance_id,
              type: "text",
              to: phone.replace(/\D/g, ""),
              payload: { text },
            },
          });
          delivered = !error && (data as any)?.ok !== false;
          deliveryChannel = "evolution";
          if (!delivered) providerError = error?.message || `evolution_status_${(data as any)?.status}`;
        }
      } else {
        // Mídia → tenta URL, fallback base64 (só Evolution aceita data URL; Meta exige URL pública)
        const fileName = mediaType === "document" ? guessFileName(material.name, mediaUrl) : undefined;

        if ((conv as any).meta_connection_id) {
          const mediaPayload: Record<string, unknown> = { link: mediaUrl };
          if (caption) mediaPayload.caption = caption;
          if (fileName && mediaType === "document") mediaPayload.filename = fileName;
          const { data, error } = await supabase.functions.invoke("meta-whatsapp-send", {
            body: {
              connection_id: (conv as any).meta_connection_id,
              organization_id: conv.organization_id,
              to: phone.replace(/\D/g, ""),
              type: mediaType,
              media: mediaPayload,
            },
          });
          delivered = !error && !(data as any)?.error;
          deliveryChannel = "meta_whatsapp";
          if (!delivered) providerError = error?.message || (data as any)?.error || "meta_send_failed";
        } else {
          const invokeEvo = async (urlToSend: string): Promise<{ ok: boolean; reason?: string }> => {
            const { data, error } = await supabase.functions.invoke("evolution-send", {
              body: {
                organization_id: conv.organization_id,
                instance_id: conv.evolution_instance_id,
                type: "media",
                to: phone!.replace(/\D/g, ""),
                payload: {
                  type: mediaType,
                  url: urlToSend,
                  caption,
                  fileName,
                },
              },
            });
            if (error) return { ok: false, reason: `invoke_error: ${error.message || String(error)}` };
            if ((data as any)?.ok === false) return { ok: false, reason: `provider_status_${(data as any)?.status}` };
            return { ok: true };
          };

          let r = await invokeEvo(mediaUrl);
          // fallback base64 se URL falhar
          if (!r.ok) {
            try {
              const resp = await fetch(mediaUrl, { redirect: "follow" });
              if (resp.ok) {
                const buf = await resp.arrayBuffer();
                if (buf.byteLength <= 8 * 1024 * 1024) {
                  const mime = resp.headers.get("content-type") || "application/octet-stream";
                  const bytes = new Uint8Array(buf);
                  let binary = "";
                  const chunk = 0x8000;
                  for (let i = 0; i < bytes.length; i += chunk) {
                    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
                  }
                  const dataUrl = `data:${mime};base64,${btoa(binary)}`;
                  r = await invokeEvo(dataUrl);
                }
              }
            } catch (b64Err) {
              console.warn("[send-material] base64 fallback failed:", b64Err);
            }
          }
          delivered = r.ok;
          deliveryChannel = "evolution";
          if (!delivered) providerError = r.reason || "unknown";
        }
      }
    } else if (channel === "whatsapp") {
      providerError = !phone ? "missing_phone" : "missing_whatsapp_connection";
    } else {
      // Webchat / outros: entrega dentro do próprio chat via metadata.media
      delivered = true;
      deliveryChannel = "webchat_inline";
    }

    // === Persist message ===
    try {
      await supabase.from("webchat_messages").insert({
        conversation_id: body.conversation_id,
        direction: "outbound",
        sender_type: "bot",
        content: caption + (mediaType === "link" ? `\n\n🔗 ${mediaUrl}` : ""),
        message_type: mediaType === "link" ? "text" : mediaType,
        metadata: {
          material: {
            id: material.id,
            name: material.name,
            type: material.type,
            url: mediaUrl,
          },
          media: mediaType === "link" ? null : {
            url: mediaUrl,
            kind: mediaType, // image | video | document — casa com extractMedia
            filename: guessFileName(material.name, mediaUrl),
            caption,
          },
          delivered,
          delivery_channel: deliveryChannel,
          provider_error: providerError,
        },
      });
    } catch (persistErr) {
      console.error("[send-material] persist error:", persistErr);
    }

    // === Log action ===
    try {
      await supabase.from("agent_action_logs").insert({
        organization_id: conv.organization_id,
        conversation_id: conv.id,
        lead_id: conv.lead_id || null,
        product_id: material.product_id || null,
        action_type: "send_material",
        action_data: { material_id: material.id, type: material.type, delivery_channel: deliveryChannel },
        success: delivered,
        error_message: delivered ? null : providerError,
      });
    } catch (logErr) {
      console.warn("[send-material] log failed:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: delivered,
        delivered,
        delivery_channel: deliveryChannel,
        provider_error: providerError,
        material: { id: material.id, name: material.name, type: material.type, url: mediaUrl },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[send-material] exception:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
