import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: pendingMessages, error: fetchError } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .limit(50);

    if (fetchError) throw fetchError;

    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(JSON.stringify({ processed: 0, failed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let failed = 0;

    const greet = () => {
      const h = new Date().getHours();
      if (h < 12) return "Bom dia";
      if (h < 18) return "Boa tarde";
      return "Boa noite";
    };
    const resolveVars = async (content: string, conversationId: string) => {
      if (!content.includes("{")) return content;
      let name = "";
      try {
        const { data: conv } = await supabase
          .from("webchat_conversations")
          .select("visitor_name")
          .eq("id", conversationId)
          .maybeSingle();
        name = (conv?.visitor_name as string) || "";
      } catch (_) {}
      const first = (name || "").trim().split(/\s+/)[0] || "";
      const now = new Date();
      const data = now.toLocaleDateString("pt-BR");
      const hora = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return content
        .replace(/\{primeiro_nome\}/gi, first)
        .replace(/\{nome\}/gi, name)
        .replace(/\{saudacao\}/gi, greet())
        .replace(/\{data\}/gi, data)
        .replace(/\{hora\}/gi, hora);
    };

    const markFailed = async (id: string, attemptCount: number, errorMsg: string) => {
      await supabase
        .from("scheduled_messages")
        .update({
          status: "failed",
          last_error: errorMsg.slice(0, 1000),
          last_attempt_at: new Date().toISOString(),
          attempt_count: attemptCount + 1,
        })
        .eq("id", id);
    };

    for (const msg of pendingMessages) {
      const attemptCount = (msg as any).attempt_count ?? 0;
      try {
        const rawContent = (msg.content as string | null) ?? "";
        const resolvedContent = await resolveVars(rawContent, msg.conversation_id as string);
        const hasMedia = !!(msg as any).media_url && !!(msg as any).media_kind;
        const media = hasMedia
          ? {
              kind: (msg as any).media_kind,
              url: (msg as any).media_url,
              mime: (msg as any).media_mime ?? undefined,
              filename: (msg as any).media_filename ?? undefined,
              caption: resolvedContent || undefined,
              duration_ms: (msg as any).media_duration_ms ?? undefined,
            }
          : undefined;

        const inboxUrl = `${supabaseUrl}/functions/v1/webchat-inbox?action=send`;
        const sendResponse = await fetch(inboxUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            apikey: supabaseKey,
          },
          body: JSON.stringify({
            action: "send",
            conversation_id: msg.conversation_id,
            content: hasMedia ? (resolvedContent || "") : resolvedContent,
            media,
            actorUserId: (msg as any).created_by ?? null,
            created_by: (msg as any).created_by ?? null,
          }),
        });

        const respText = await sendResponse.text();
        let respJson: any = null;
        try { respJson = respText ? JSON.parse(respText) : null; } catch (_) {}

        if (!sendResponse.ok) {
          const errMsg = respJson?.error || respJson?.message || respText || `HTTP ${sendResponse.status}`;
          console.error(`[process-scheduled-messages] send failed ${msg.id}:`, errMsg);
          await markFailed(msg.id, attemptCount, errMsg);
          failed++;
          continue;
        }

        // Verifica entrega externa (WhatsApp/Meta/Evolution)
        const delivery = respJson?.message?.metadata?.delivery_status;
        if (delivery === "failed") {
          const deliveryErr = respJson?.message?.metadata?.error || "Falha no envio externo";
          console.error(`[process-scheduled-messages] delivery failed ${msg.id}:`, deliveryErr);
          await markFailed(msg.id, attemptCount, deliveryErr);
          failed++;
          continue;
        }

        await supabase
          .from("scheduled_messages")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
            last_attempt_at: new Date().toISOString(),
            attempt_count: attemptCount + 1,
          })
          .eq("id", msg.id);
        processed++;
      } catch (msgError) {
        const errMsg = msgError instanceof Error ? msgError.message : String(msgError);
        console.error(`[process-scheduled-messages] exception ${msg.id}:`, errMsg);
        await markFailed(msg.id, attemptCount, errMsg);
        failed++;
      }
    }

    return new Response(JSON.stringify({ processed, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-scheduled-messages error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
