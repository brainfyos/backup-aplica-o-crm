// Attribution Engine — resolve leads recentes para IDs Meta (fbclid/ctwa/utm).
// Multi-provider ready: por enquanto implementa Meta; Google/TikTok são plugáveis.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Lead = {
  id: string;
  organization_id: string;
  fbclid: string | null;
  ctwa_clid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  gclid: string | null;
  ttclid: string | null;
  li_fat_id: string | null;
  created_at: string;
};

type CampaignRow = { external_id: string; name: string | null };
type AdRow = { external_id: string; name: string | null; campaign_external_id: string | null; adset_external_id: string | null };

function norm(s: string | null | undefined): string {
  return (s ?? '').toString().trim().toLowerCase();
}

function similar(a: string, b: string): number {
  const A = norm(a), B = norm(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.85;
  // token overlap
  const ta = new Set(A.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const tb = new Set(B.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const x of ta) if (tb.has(x)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

async function attributeOrg(sb: ReturnType<typeof createClient>, orgId: string) {
  // Pega leads dos últimos 60 dias que ainda não têm attribution meta
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const { data: leads } = await sb
    .from('leads')
    .select('id, organization_id, fbclid, ctwa_clid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, gclid, ttclid, li_fat_id, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', since.toISOString())
    .limit(2000);

  if (!leads?.length) return { org: orgId, resolved: 0, skipped: 0 };

  const leadIds = (leads as Lead[]).map((l) => l.id);
  const { data: existing } = await sb
    .from('lead_attribution')
    .select('lead_id')
    .eq('organization_id', orgId)
    .eq('provider', 'meta')
    .in('lead_id', leadIds);
  const already = new Set((existing ?? []).map((r: any) => r.lead_id));

  const pending = (leads as Lead[]).filter((l) => !already.has(l.id) && (l.fbclid || l.ctwa_clid || l.utm_campaign || l.utm_content));
  if (!pending.length) return { org: orgId, resolved: 0, skipped: leads.length };

  const [{ data: camps }, { data: ads }] = await Promise.all([
    sb.from('marketing_campaigns').select('external_id, name').eq('organization_id', orgId).eq('provider', 'meta').limit(2000),
    sb.from('marketing_ads').select('external_id, name, campaign_external_id, adset_external_id').eq('organization_id', orgId).eq('provider', 'meta').limit(5000),
  ]);
  const campaigns = (camps ?? []) as CampaignRow[];
  const adsList = (ads ?? []) as AdRow[];

  const rows: any[] = [];
  let resolved = 0;

  for (const l of pending) {
    let campId: string | null = null;
    let adId: string | null = null;
    let campName: string | null = null;
    let adName: string | null = null;
    let method = 'unresolved';
    let confidence = 0;

    // 1) utm_content EXACT com nome de anúncio
    if (l.utm_content) {
      const hit = adsList.find((a) => a.name && norm(a.name) === norm(l.utm_content));
      if (hit) {
        adId = hit.external_id; adName = hit.name;
        campId = hit.campaign_external_id;
        campName = campaigns.find((c) => c.external_id === campId)?.name ?? null;
        method = 'utm_exact'; confidence = 1;
      }
    }
    // 2) utm_campaign EXACT com nome de campanha
    if (!campId && l.utm_campaign) {
      const hit = campaigns.find((c) => c.name && norm(c.name) === norm(l.utm_campaign));
      if (hit) {
        campId = hit.external_id; campName = hit.name;
        method = 'utm_exact'; confidence = 1;
      }
    }
    // 3) fuzzy utm_campaign
    if (!campId && l.utm_campaign) {
      let best: { c: CampaignRow; s: number } | null = null;
      for (const c of campaigns) {
        if (!c.name) continue;
        const s = similar(l.utm_campaign, c.name);
        if (s >= 0.8 && (!best || s > best.s)) best = { c, s };
      }
      if (best) {
        campId = best.c.external_id; campName = best.c.name;
        method = 'utm_fuzzy'; confidence = best.s;
      }
    }
    // 4) fbclid/ctwa: marca como recebido; resolver ad_id requer join com raw (fica pra próxima iteração)
    if (!method || method === 'unresolved') {
      if (l.fbclid) { method = 'fbclid'; confidence = 0.4; }
      else if (l.ctwa_clid) { method = 'ctwa'; confidence = 0.4; }
    }

    if (method !== 'unresolved') {
      resolved++;
      rows.push({
        lead_id: l.id,
        organization_id: orgId,
        provider: 'meta',
        campaign_id: campId,
        campaign_name: campName,
        ad_id: adId,
        ad_name: adName,
        fbclid: l.fbclid,
        ctwa_clid: l.ctwa_clid,
        gclid: l.gclid,
        ttclid: l.ttclid,
        li_fat_id: l.li_fat_id,
        utm_source: l.utm_source,
        utm_medium: l.utm_medium,
        utm_campaign: l.utm_campaign,
        utm_content: l.utm_content,
        utm_term: l.utm_term,
        attribution_method: method,
        confidence_score: confidence,
        attributed_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length) {
    const { error } = await sb.from('lead_attribution').upsert(rows, { onConflict: 'lead_id,provider' });
    if (error) console.error('[attribution] upsert error', error);

    // Publica journey_events em lote (best-effort)
    const events = rows.map((r) => ({
      organization_id: orgId,
      lead_id: r.lead_id,
      event_type: 'lead_attributed',
      event_category: 'system',
      source: 'attribution-engine',
      title: 'Atribuição resolvida',
      subject_type: 'lead',
      subject_id: r.lead_id,
      payload: {
        provider: r.provider,
        campaign_id: r.campaign_id,
        ad_id: r.ad_id,
        method: r.attribution_method,
        confidence: r.confidence_score,
      },
    }));
    await sb.from('journey_events').insert(events);
  }

  return { org: orgId, resolved, skipped: pending.length - resolved };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const orgId = body.organization_id as string | undefined;

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    let orgs: string[] = [];
    if (orgId) orgs = [orgId];
    else {
      const { data } = await sb
        .from('org_marketing_credentials')
        .select('organization_id')
        .eq('provider', 'meta')
        .eq('is_active', true);
      orgs = Array.from(new Set((data ?? []).map((r: any) => r.organization_id)));
    }

    const results = [];
    for (const o of orgs) {
      try { results.push(await attributeOrg(sb, o)); }
      catch (e) { results.push({ org: o, error: String(e) }); }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[attribution-engine]', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
