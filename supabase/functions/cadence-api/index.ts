// API pública REST do módulo Cadências Inteligentes.
// Autenticação: header `Authorization: Bearer cdn_<key>` (cadence_api_keys.key_hash via SHA-256).
//
// Endpoints (path relativo a /cadence-api):
//   GET    /cadences                          -> lista cadências da org
//   GET    /cadences/:id                      -> detalhe + steps
//   GET    /cadences/:id/stats                -> totais + breakdown por step
//   POST   /cadences/:id/enroll               -> { lead_ids?, source?, source_ref? } proxy p/ cadence-enroll
//   POST   /enrollments/:id/stop              -> { reason? } proxy p/ cadence-stop
//   GET    /enrollments?cadence_id=&lead_id=&status=  -> lista enrollments
//   GET    /enrollments/:id                   -> detalhe + runs recentes

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function authenticate(req: Request): Promise<{ org_id: string; key_id: string } | Response> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token || !token.startsWith("cdn_")) {
    return json({ error: "Missing or invalid API key. Use 'Authorization: Bearer cdn_...'" }, 401);
  }
  const hash = await sha256(token);
  const sb = admin();
  const { data, error } = await sb
    .from("cadence_api_keys")
    .select("id, organization_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error || !data) return json({ error: "Invalid API key" }, 401);
  if (data.revoked_at) return json({ error: "API key revoked" }, 401);
  await sb.from("cadence_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { org_id: data.organization_id, key_id: data.id };
}

async function invokeInternal(name: string, payload: any) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { org_id } = auth;

  const url = new URL(req.url);
  // Strip leading "/cadence-api"
  const path = url.pathname.replace(/^\/cadence-api/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const sb = admin();

  try {
    // GET /cadences
    if (req.method === "GET" && parts[0] === "cadences" && parts.length === 1) {
      const { data } = await sb
        .from("cadences")
        .select("id, name, description, objective, status, channel, created_at, last_executed_at")
        .eq("organization_id", org_id)
        .order("created_at", { ascending: false });
      return json({ data: data ?? [] });
    }

    // GET /cadences/:id
    if (req.method === "GET" && parts[0] === "cadences" && parts.length === 2) {
      const id = parts[1];
      const { data: cadence } = await sb.from("cadences").select("*").eq("id", id).eq("organization_id", org_id).maybeSingle();
      if (!cadence) return json({ error: "Not found" }, 404);
      const { data: steps } = await sb.from("cadence_steps").select("*").eq("cadence_id", id).order("order_index");
      return json({ data: { ...cadence, steps: steps ?? [] } });
    }

    // GET /cadences/:id/stats
    if (req.method === "GET" && parts[0] === "cadences" && parts[2] === "stats") {
      const id = parts[1];
      const { data: cadence } = await sb.from("cadences").select("id").eq("id", id).eq("organization_id", org_id).maybeSingle();
      if (!cadence) return json({ error: "Not found" }, 404);
      const { data: enrollments } = await sb.from("cadence_enrollments").select("status, current_step_index").eq("cadence_id", id);
      const { data: runs } = await sb.from("cadence_step_runs").select("step_id, status").eq("organization_id", org_id);
      const totals = { active: 0, completed: 0, stopped: 0, paused: 0, total: 0 };
      (enrollments ?? []).forEach((e: any) => { totals.total++; if ((totals as any)[e.status] !== undefined) (totals as any)[e.status]++; });
      const byStep: Record<string, { sent: number; failed: number; skipped: number }> = {};
      (runs ?? []).forEach((r: any) => {
        if (!byStep[r.step_id]) byStep[r.step_id] = { sent: 0, failed: 0, skipped: 0 };
        if (r.status === "sent") byStep[r.step_id].sent++;
        else if (r.status === "failed") byStep[r.step_id].failed++;
        else if (r.status === "skipped") byStep[r.step_id].skipped++;
      });
      return json({ data: { totals, by_step: byStep } });
    }

    // POST /cadences/:id/enroll
    if (req.method === "POST" && parts[0] === "cadences" && parts[2] === "enroll") {
      const id = parts[1];
      const { data: cadence } = await sb.from("cadences").select("id").eq("id", id).eq("organization_id", org_id).maybeSingle();
      if (!cadence) return json({ error: "Not found" }, 404);
      const body = await req.json().catch(() => ({}));
      const { status, body: out } = await invokeInternal("cadence-enroll", {
        cadence_id: id,
        lead_ids: body.lead_ids,
        source: body.source ?? "api",
        source_ref: body.source_ref ?? null,
      });
      return json(out, status);
    }

    // POST /enrollments/:id/stop
    if (req.method === "POST" && parts[0] === "enrollments" && parts[2] === "stop") {
      const id = parts[1];
      const { data: enr } = await sb.from("cadence_enrollments").select("id").eq("id", id).eq("organization_id", org_id).maybeSingle();
      if (!enr) return json({ error: "Not found" }, 404);
      const body = await req.json().catch(() => ({}));
      const { status, body: out } = await invokeInternal("cadence-stop", {
        enrollment_id: id,
        reason: body.reason ?? "api",
      });
      return json(out, status);
    }

    // GET /enrollments
    if (req.method === "GET" && parts[0] === "enrollments" && parts.length === 1) {
      let q = sb.from("cadence_enrollments").select("*").eq("organization_id", org_id).order("created_at", { ascending: false }).limit(200);
      const cad = url.searchParams.get("cadence_id"); if (cad) q = q.eq("cadence_id", cad);
      const lead = url.searchParams.get("lead_id"); if (lead) q = q.eq("lead_id", lead);
      const st = url.searchParams.get("status"); if (st) q = q.eq("status", st);
      const { data } = await q;
      return json({ data: data ?? [] });
    }

    // GET /enrollments/:id
    if (req.method === "GET" && parts[0] === "enrollments" && parts.length === 2) {
      const id = parts[1];
      const { data: enr } = await sb.from("cadence_enrollments").select("*").eq("id", id).eq("organization_id", org_id).maybeSingle();
      if (!enr) return json({ error: "Not found" }, 404);
      const { data: runs } = await sb.from("cadence_step_runs").select("*").eq("enrollment_id", id).order("scheduled_at", { ascending: false }).limit(50);
      return json({ data: { ...enr, runs: runs ?? [] } });
    }

    return json({ error: "Not found", path, method: req.method }, 404);
  } catch (err) {
    console.error("[cadence-api]", err);
    return json({ error: (err as Error).message }, 500);
  }
});
