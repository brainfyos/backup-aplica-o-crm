// Aplica o payload da submission nas tabelas reais. Idempotente via applied_refs.
// Autenticado via token público + session_token (para empresas externas) OU usuário admin logado.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

type Payload = {
  empresa?: any;
  horarios?: { timezone?: string; schedule?: any };
  negocios?: any[];
  agentes?: any[];
  setores?: any[];
  equipes?: any[];
};

// Formato usado pelo app (useBusinessHours): mon/tue/... + [{start,end}] (array vazio = desligado)
const DEFAULT_SCHEDULE_APP = {
  mon: [{ start: "09:00", end: "18:00" }],
  tue: [{ start: "09:00", end: "18:00" }],
  wed: [{ start: "09:00", end: "18:00" }],
  thu: [{ start: "09:00", end: "18:00" }],
  fri: [{ start: "09:00", end: "18:00" }],
  sat: [],
  sun: [],
};

const DAY_KEY_MAP: Record<string, string> = {
  monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu",
  friday: "fri", saturday: "sat", sunday: "sun",
  mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun",
};

function convertScheduleToApp(input: any) {
  if (!input || typeof input !== "object") return DEFAULT_SCHEDULE_APP;
  // Já está no formato do app? (arrays por dia)
  const firstKey = Object.keys(input)[0];
  if (firstKey && Array.isArray(input[firstKey])) return input;
  // Converter wizard -> app
  const out: Record<string, Array<{ start: string; end: string }>> = {
    mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
  };
  for (const [k, v] of Object.entries(input)) {
    const dk = DAY_KEY_MAP[k];
    if (!dk) continue;
    const day: any = v;
    if (day?.enabled && day.start && day.end) out[dk] = [{ start: day.start, end: day.end }];
    else out[dk] = [];
  }
  return out;
}


async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const body = await req.json();
    const { submission_id, token, session_token } = body ?? {};

    let actorUserId: string | null = null;
    let sub: any = null;

    // ===== Fluxo público: token + session_token =====
    if (token && session_token) {
      const tokenHash = await sha256Hex(token);
      const { data: row, error: rErr } = await admin
        .from("onboarding_submissions").select("*").eq("token_hash", tokenHash).maybeSingle();
      if (rErr || !row) return json({ error: "invalid_token" }, 400);
      if (row.revoked_at) return json({ error: "link_revoked" }, 400);
      if (row.expires_at && new Date(row.expires_at) < new Date()) return json({ error: "expired_token" }, 400);
      if (row.session_token !== session_token) return json({ error: "link_already_in_use" }, 400);
      if (row.status === "applied") return json({ ok: true, already_applied: true });
      if (row.status !== "submitted") return json({ error: "not_submitted" }, 400);

      const { data: org } = await admin.from("organizations")
        .select("onboarding_completed_at, onboarding_locked").eq("id", row.organization_id).maybeSingle();
      if (org?.onboarding_completed_at || org?.onboarding_locked) {
        return json({ error: "already_applied" }, 400);
      }
      sub = row;
    } else {
      // ===== Fluxo autenticado (legado) =====
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
      const { data: u } = await userClient.auth.getUser();
      const userId = u.user?.id;
      if (!userId) return json({ error: "Unauthorized" }, 401);
      actorUserId = userId;

      if (!submission_id) return json({ error: "submission_id required" }, 400);
      const { data: subRow, error: subErr } = await admin
        .from("onboarding_submissions").select("*").eq("id", submission_id).maybeSingle();
      if (subErr || !subRow) return json({ error: "not_found" }, 404);
      if (subRow.status === "applied") return json({ ok: true, already_applied: true });

      const { data: prof } = await admin.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
      const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
      if (!isSuper && prof?.organization_id !== subRow.organization_id) return json({ error: "forbidden" }, 403);

      const { data: org } = await admin.from("organizations")
        .select("onboarding_completed_at, onboarding_locked").eq("id", subRow.organization_id).maybeSingle();
      if (org?.onboarding_completed_at || org?.onboarding_locked) {
        return json({ error: "already_applied" }, 400);
      }
      sub = subRow;
    }

    const payload: Payload = sub.payload ?? {};
    const orgId = sub.organization_id;
    const refs: any = sub.applied_refs ?? {};
    const errors: string[] = [];
    const createdBy = actorUserId ?? sub.created_by ?? null;

    // ===== 1. EMPRESA =====
    try {
      const e = payload.empresa ?? {};
      const orgUpdate: any = {};
      if (e.nome_fantasia || e.razao_social) orgUpdate.name = e.nome_fantasia || e.razao_social;
      if (e.cnpj) orgUpdate.cnpj = e.cnpj;
      if (e.telefone) orgUpdate.phone = e.telefone;
      if (e.instagram) orgUpdate.instagram = e.instagram;
      if (e.site) orgUpdate.website = e.site;
      if (e.logo_url) orgUpdate.logo_url = e.logo_url;

      // Razão social: sem coluna dedicada — persistir em settings.legal_name e address.razao_social
      if (e.razao_social) {
        const { data: currentOrg } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
        const currentSettings = (currentOrg?.settings && typeof currentOrg.settings === "object") ? currentOrg.settings : {};
        orgUpdate.settings = { ...currentSettings, legal_name: e.razao_social };
      }

      if (e.endereco || e.razao_social) {
        const en: any = e.endereco ?? {};
        const cep = en.cep ?? undefined;
        const street = en.street ?? en.rua ?? undefined;
        const number = en.number ?? en.numero ?? undefined;
        const complement = en.complement ?? en.complemento ?? undefined;
        const neighborhood = en.neighborhood ?? en.bairro ?? undefined;
        const city = en.city ?? en.cidade ?? undefined;
        const state = en.state ?? en.uf ?? undefined;
        // Grava bilíngue para funcionar com todos os leitores do app
        orgUpdate.address = {
          cep, street, number, complement, neighborhood, city, state,
          rua: street, numero: number, complemento: complement, bairro: neighborhood, cidade: city, uf: state,
          razao_social: e.razao_social ?? undefined,
          legal_name: e.razao_social ?? undefined,
        };
      }
      orgUpdate.onboarding_completed_at = new Date().toISOString();
      orgUpdate.onboarding_locked = true;
      await admin.from("organizations").update(orgUpdate).eq("id", orgId);
    } catch (err: any) { errors.push(`empresa: ${err.message}`); }

    // ===== 2. HORÁRIOS =====
    try {
      const h = payload.horarios ?? {};
      const tz = h.timezone || "America/Sao_Paulo";
      const schedule = convertScheduleToApp(h.schedule);
      const { data: existing } = await admin.from("business_hours").select("id").eq("organization_id", orgId).maybeSingle();
      if (existing?.id) {
        await admin.from("business_hours").update({ timezone: tz, schedule }).eq("id", existing.id);
      } else {
        await admin.from("business_hours").insert({ organization_id: orgId, timezone: tz, schedule, out_of_hours_enabled: false, out_of_hours_message: "" });
      }
      try {
        const { error: tzErr } = await admin.from("organizations").update({ timezone: tz }).eq("id", orgId);
        if (tzErr) errors.push(`horarios/timezone: ${tzErr.message}`);
      } catch (tzE: any) {
        errors.push(`horarios/timezone: ${tzE.message}`);
      }
    } catch (err: any) { errors.push(`horarios: ${err.message}`); }

    // ===== 3. SETORES =====
    refs.sectors = refs.sectors ?? [];
    try {
      for (const s of payload.setores ?? []) {
        if (!s?.nome) continue;
        const { data: existing } = await admin.from("sectors").select("id")
          .eq("organization_id", orgId).eq("name", s.nome).maybeSingle();
        if (existing?.id) { refs.sectors.push(existing.id); continue; }
        const { data: ins } = await admin.from("sectors").insert({
          organization_id: orgId, name: s.nome, order_index: s.ordem ?? 1, is_active: true,
        }).select("id").maybeSingle();
        if (ins?.id) refs.sectors.push(ins.id);
      }
    } catch (err: any) { errors.push(`setores: ${err.message}`); }

    // ===== 4. NEGÓCIOS =====
    refs.products = refs.products ?? [];
    refs.knowledge_sources = refs.knowledge_sources ?? [];
    try {
      for (const n of payload.negocios ?? []) {
        if (!n?.nome) continue;
        const { data: prod, error: pErr } = await admin.from("products").insert({
          organization_id: orgId,
          name: n.nome,
          status: (n.status || "draft").toString().toLowerCase() === "publicado" ? "published" : "draft",
          category: n.categoria ?? null,
          short_description: n.descricao_curta ?? null,
          description: n.descricao_completa ?? null,
          custom_info: n.personalizadas ?? null,
          icp: n.icp ?? null,
          differentials: Array.isArray(n.diferenciais) ? n.diferenciais : (n.diferenciais ? String(n.diferenciais).split("\n").map((s: string) => s.trim()).filter(Boolean) : []),
          created_by: createdBy,
        }).select("id").maybeSingle();
        if (pErr) { errors.push(`negocio ${n.nome}: ${pErr.message}`); continue; }
        if (!prod?.id) continue;
        refs.products.push(prod.id);

        const ks: any[] = [];
        const websites: string[] = Array.isArray(n.websites_list)
          ? n.websites_list.filter(Boolean)
          : (n.websites ? String(n.websites).split("\n").map((s: string) => s.trim()).filter(Boolean) : []);
        const videos: string[] = Array.isArray(n.videos_list)
          ? n.videos_list.filter(Boolean)
          : (n.videos ? String(n.videos).split("\n").map((s: string) => s.trim()).filter(Boolean) : []);
        const faqItems: Array<{question: string; answer: string}> = Array.isArray(n.faq_items) ? n.faq_items.filter((f: any) => f?.question && f?.answer) : [];

        websites.forEach((url: string) => {
          ks.push({ product_id: prod.id, organization_id: orgId, source_type: "website", title: url, source_url: url, processing_status: "pending", is_active: true, created_by: createdBy });
        });
        videos.forEach((url: string) => {
          ks.push({ product_id: prod.id, organization_id: orgId, source_type: "youtube", title: url, source_url: url, processing_status: "pending", is_active: true, created_by: createdBy });
        });
        // Grava cada FAQ como registro individual (mesma estrutura usada pelo FAQBuilder)
        faqItems.forEach((f) => {
          ks.push({
            product_id: prod.id, organization_id: orgId, source_type: "faq",
            title: (f.question ?? "").substring(0, 100),
            question: f.question, answer: f.answer,
            extracted_content: `Pergunta: ${f.question}\nResposta: ${f.answer}`,
            processing_status: "completed", is_active: true, created_by: createdBy,
          });
        });
        // Fallback: FAQ como texto livre (drafts antigos)
        if (!faqItems.length && n.faq) {
          ks.push({ product_id: prod.id, organization_id: orgId, source_type: "faq", title: "FAQ", raw_content: n.faq, processing_status: "completed", is_active: true, created_by: createdBy });
        }
        if (n.dados) ks.push({ product_id: prod.id, organization_id: orgId, source_type: "data", title: "Dados", raw_content: n.dados, processing_status: "completed", is_active: true, created_by: createdBy });
        if (n.treinamento) ks.push({ product_id: prod.id, organization_id: orgId, source_type: "text", title: "Treinamento", raw_content: n.treinamento, processing_status: "completed", is_active: true, created_by: createdBy });
        if (n.catalogo) ks.push({ product_id: prod.id, organization_id: orgId, source_type: "text", title: "Catálogo", raw_content: n.catalogo, processing_status: "completed", is_active: true, created_by: createdBy });
        (n.arquivos ?? []).forEach((f: any) => {
          if (!f?.url) return;
          ks.push({ product_id: prod.id, organization_id: orgId, source_type: "file", title: f.name ?? "Arquivo", file_url: f.url, file_type: f.type ?? null, file_size: f.size ?? null, processing_status: "pending", is_active: true, created_by: createdBy });
        });
        if (ks.length) {
          const { data: ksIns } = await admin.from("product_knowledge_sources").insert(ks).select("id");
          (ksIns ?? []).forEach((r: any) => refs.knowledge_sources.push(r.id));
        }
      }
    } catch (err: any) { errors.push(`negocios: ${err.message}`); }

    // ===== 5. AGENTES =====
    refs.agents = refs.agents ?? [];
    try {
      const productIds: string[] = refs.products ?? [];
      const agentes = payload.agentes ?? [];
      const tipoMap: Record<string, string> = {
        "SDR — Qualifica": "sdr", "Closer — Fecha a venda": "closer",
        "Suporte": "support", "Financeiro": "financial", "Administrativo": "admin",
      };
      const tomMap: Record<string, string> = { "Formal": "formal", "Consultivo": "consultative", "Amigável": "friendly", "Técnico": "technical" };
      for (let i = 0; i < agentes.length; i++) {
        const a = agentes[i];
        if (!a?.nome) continue;
        // Distribui: se N agentes e N produtos pareia por índice; sobras ficam como agente global (product_id = null)
        const productId = productIds.length > 0 && i < productIds.length ? productIds[i] : (productIds[0] ?? null);
        const missao = a.missao ?? null;
        const { data: ag } = await admin.from("product_agents").insert({
          organization_id: orgId,
          product_id: productId,
          name: a.nome,
          agent_type: tipoMap[a.tipo] ?? "sdr",
          primary_objective: missao,
          description: missao,
          tone_style: tomMap[a.tom] ?? "consultative",
          message_style: "balanced",
          can_do: [],
          cannot_do: [],
          handoff_triggers: [],
          is_active: true,
          created_by: createdBy,
        }).select("id").maybeSingle();
        if (ag?.id) refs.agents.push(ag.id);
      }
    } catch (err: any) { errors.push(`agentes: ${err.message}`); }

    // ===== 6. EQUIPES =====
    refs.invitations = refs.invitations ?? [];
    try {
      for (const m of payload.equipes ?? []) {
        if (!m?.email) continue;
        const role = (m.perfil || "seller").toLowerCase();
        const validRole = ["admin","seller"].includes(role) ? role : "seller";
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-team-member`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE}` },
            body: JSON.stringify({
              email: m.email, full_name: m.nome ?? m.email,
              phone: m.whatsapp ?? null, role: validRole,
              organization_id: orgId, sector_ids: m.setores ?? [],
            }),
          });
          if (resp.ok) {
            const j = await resp.json().catch(() => ({}));
            if (j?.invitation_id) refs.invitations.push(j.invitation_id);
          }
        } catch (e: any) { errors.push(`equipe ${m.email}: ${e.message}`); }
      }
    } catch (err: any) { errors.push(`equipes: ${err.message}`); }

    // ===== Finaliza =====
    await admin.from("onboarding_submissions").update({
      status: "applied",
      applied_at: new Date().toISOString(),
      applied_by: actorUserId,
      applied_refs: refs,
      error_message: errors.length ? errors.join(" | ") : null,
    }).eq("id", sub.id);

    // Garante que a org fique travada
    await admin.from("organizations").update({
      onboarding_locked: true,
      onboarding_completed_at: new Date().toISOString(),
    }).eq("id", orgId);

    // Audit
    try {
      await admin.from("platform_audit_logs").insert({
        action: "onboarding_applied",
        actor_id: actorUserId,
        organization_id: orgId,
        metadata: { submission_id: sub.id, warnings: errors.length },
      });
    } catch { /* ignore */ }

    try {
      await admin.from("admin_notifications").insert({
        organization_id: orgId,
        type: "onboarding_completed",
        title: "Implantação concluída",
        message: `Empresa concluiu o onboarding.${errors.length ? ` Com ${errors.length} aviso(s).` : ""}`,
        severity: errors.length ? "warning" : "info",
        category: "system",
        is_read: false,
      });
    } catch { /* ignore */ }

    return json({ ok: true, refs, warnings: errors });
  } catch (e: any) {
    console.error("[apply-onboarding]", e);
    return json({ error: e.message ?? String(e) }, 500);
  }
});
