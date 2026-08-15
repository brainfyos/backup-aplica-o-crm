// Valida em lote se os telefones existem no WhatsApp usando a instância Evolution
// da organização. Retorna, para cada telefone recebido, se existe e o número
// normalizado (formato 55DDNNNNNNNNN).

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = (await req.json()) as {
      organization_id?: string;
      phones: string[];
    };

    if (!Array.isArray(body?.phones) || body.phones.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "phones required" }), {
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
      return new Response(JSON.stringify({ ok: false, error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolver instância Evolution conectada
    const { data: instance } = await supabase
      .from("evolution_instances").select("*")
      .eq("organization_id", organization_id)
      .eq("status", "connected")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    if (!instance) {
      return new Response(JSON.stringify({
        ok: false, error: "no_instance",
        message: "Nenhuma instância WhatsApp conectada.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Config do provider
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

    // Monta variantes únicas para todos os telefones
    const inputToVariants = new Map<string, string[]>();
    const allVariantsSet = new Set<string>();
    for (const raw of body.phones) {
      const clean = String(raw ?? "").replace(/\D/g, "");
      if (!clean) { inputToVariants.set(String(raw ?? ""), []); continue; }
      const variants = phoneVariantsBR(clean).filter((v) => v.startsWith("55"));
      inputToVariants.set(clean, variants);
      variants.forEach((v) => allVariantsSet.add(v));
    }
    const allVariants = Array.from(allVariantsSet);

    // Chama o provider em chunks de 50 variantes por request
    const variantResult = new Map<string, { exists: boolean; jid: string | null }>();
    const CHUNK = 50;
    let chunksTotal = 0;
    let chunksFailed = 0;
    let lastError: string | null = null;
    for (let i = 0; i < allVariants.length; i += CHUNK) {
      const slice = allVariants.slice(i, i + CHUNK);
      chunksTotal++;
      try {
        // Evolution Go: POST /user/check com body { number: [...] }
        const res = await fetch(`${url}/user/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey },
          body: JSON.stringify({ number: slice }),
        });
        const text = await res.text();
        if (!res.ok) {
          chunksFailed++;
          lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
          console.warn("[batch-check] chunk http error", lastError);
          continue;
        }
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
        for (const item of arr) {
          const exists = !!(item?.IsInWhatsapp ?? item?.isInWhatsapp ?? item?.exists ?? item?.isRegistered ?? item?.registered);
          const jid = item?.JID || item?.jid || item?.wa_jid || item?.RemoteJID || null;
          const lid = item?.LID || item?.lid || null;
          // Deriva o número consultado: prioriza Query, senão JID/number/phone
          const queryRaw = String(item?.Query ?? item?.query ?? item?.number ?? item?.phone ?? jid ?? "");
          const number = queryRaw.replace(/\D/g, "");
          if (number) variantResult.set(number, { exists, jid: jid || (lid ? String(lid) : null) });
        }
      } catch (e: any) {
        chunksFailed++;
        lastError = e?.message || String(e);
        console.warn("[batch-check] chunk failed", lastError);
      }
    }

    // Se todos os chunks falharam, sinaliza provedor inacessível
    if (chunksTotal > 0 && chunksFailed === chunksTotal) {
      return new Response(JSON.stringify({
        ok: false,
        error: "provider_unreachable",
        message: `Não foi possível contatar o provedor WhatsApp. ${lastError || ""}`.trim(),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Consolida por input
    const results = body.phones.map((originalInput) => {
      const clean = String(originalInput ?? "").replace(/\D/g, "");
      const variants = inputToVariants.get(clean) || [];
      let match: { number: string; jid: string | null } | null = null;
      for (const v of variants) {
        const r = variantResult.get(v);
        if (r?.exists) { match = { number: v, jid: r.jid }; break; }
      }
      const normalized = match ? (jidToPhone(match.jid) || normalizePhoneBR(match.number) || match.number) : null;
      return {
        input: originalInput,
        exists: !!match,
        normalized,
        jid: match?.jid ?? null,
      };
    });

    return new Response(JSON.stringify({
      ok: true,
      instance: { id: instance.id, name: instance.name },
      results,
      debug: {
        total_variants: allVariants.length,
        total_matched: Array.from(variantResult.values()).filter((r) => r.exists).length,
        chunks_total: chunksTotal,
        chunks_failed: chunksFailed,
      },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[whatsapp-check-numbers-batch] exception:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
