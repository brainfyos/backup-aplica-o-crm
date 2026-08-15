// meta-campaign-publish — cria campanha completa (campaign+adset+creative+ad) via Graph API v21.
// Sempre PAUSED. Grava em marketing_campaigns/adsets/ads/creatives com metadata.vendus_link.
// Rollback automático em caso de falha.
// POST { organization_id?, credential_id, draft, destination_ref }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decryptSecret } from '../_shared/meta-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const GRAPH = 'https://graph.facebook.com/v21.0';

type Draft = {
  nome_sugerido: string;
  destino: 'whatsapp' | 'form' | 'quiz' | 'url';
  orcamento_diario_brl: number;
  data_inicio?: string;
  data_fim?: string;
  localizacao: { paises?: string[]; cidades?: any[]; idade_min?: number; idade_max?: number; interesses?: any[] };
  copies: Array<{ primary_text: string; headline: string; description: string; cta?: string }>;
  mensagem_inicial_whatsapp?: string;
  creatives?: Array<{ image_hash?: string; video_id?: string; upload_base64?: string; upload_type?: 'image' | 'video'; filename?: string }>;
  destination_url?: string; // preenchida pelo backend
};

const OBJECTIVE_MAP: Record<string, { objective: string; optimization_goal: string; destination_type?: string; cta: string }> = {
  whatsapp: { objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS', destination_type: 'WHATSAPP', cta: 'WHATSAPP_MESSAGE' },
  form: { objective: 'OUTCOME_LEADS', optimization_goal: 'OFFSITE_CONVERSIONS', cta: 'LEARN_MORE' },
  quiz: { objective: 'OUTCOME_TRAFFIC', optimization_goal: 'LANDING_PAGE_VIEWS', cta: 'LEARN_MORE' },
  url: { objective: 'OUTCOME_TRAFFIC', optimization_goal: 'LANDING_PAGE_VIEWS', cta: 'LEARN_MORE' },
};

function buildUrlWithUtms(base: string) {
  const sep = base.includes('?') ? '&' : '?';
  return base + sep + 'utm_source=FB&utm_medium={{adset.name}}|{{adset.id}}&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}';
}

function formatGraphError(data: any, status: number): string {
  const err = data?.error;
  if (!err) return `HTTP ${status}`;
  const parts = [err.message];
  if (err.error_user_title) parts.push(`(${err.error_user_title})`);
  if (err.error_user_msg) parts.push(`— ${err.error_user_msg}`);
  if (err.code || err.error_subcode) parts.push(`[code=${err.code}${err.error_subcode ? `/${err.error_subcode}` : ''}]`);
  if (err.fbtrace_id) parts.push(`trace=${err.fbtrace_id}`);
  return parts.filter(Boolean).join(' ');
}

async function graphPost(path: string, token: string, params: Record<string, any>) {
  const url = `${GRAPH}${path}`;
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  form.set('access_token', token);
  const res = await fetch(url, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[meta-campaign-publish] Graph ${path} failed:`, JSON.stringify({ status: res.status, error: data?.error, sent: Object.keys(params) }));
  }
  return { ok: res.ok, status: res.status, data };
}
async function graphDelete(path: string, token: string) {
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set('access_token', token);
  try { await fetch(url.toString(), { method: 'DELETE' }); } catch { /* ignore */ }
}

async function uploadVideo(adAccountId: string, token: string, base64: string, filename?: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const form = new FormData();
  form.set('access_token', token);
  form.set('title', filename ?? 'Vídeo Vendus');
  form.set('source', new Blob([bytes], { type: 'video/mp4' }), filename ?? 'creative.mp4');
  const res = await fetch(`${GRAPH}/${adAccountId}/advideos`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) throw new Error(`Upload de vídeo: ${formatGraphError(data, res.status)}`);
  return String(data.id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: claimsRes } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
  const userId = claimsRes?.claims?.sub;
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const draft: Draft = body?.draft;
  const destination_ref = body?.destination_ref ?? {};
  const credential_id = String(body?.credential_id ?? '').trim();
  if (!draft) return json({ error: 'missing_draft' }, 400);

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: profile } = await service.from('profiles').select('organization_id').eq('id', userId).maybeSingle();
  const organization_id = body?.organization_id ?? profile?.organization_id;
  if (!organization_id) return json({ error: 'no_organization' }, 400);

  // Autorização admin/super_admin
  const [{ data: isSuper }, { data: uo }] = await Promise.all([
    service.rpc('is_super_admin', { _user_id: userId }),
    service.from('user_organizations').select('role').eq('user_id', userId).eq('organization_id', organization_id).maybeSingle(),
  ]);
  if (!isSuper && uo?.role !== 'admin' && uo?.role !== 'owner') return json({ error: 'forbidden' }, 403);

  // Credenciais Meta
  let credentialQuery = service
    .from('org_marketing_credentials')
    .select('id, ad_account_id, access_token_encrypted')
    .eq('organization_id', organization_id).eq('provider', 'meta').eq('is_active', true);
  if (credential_id) credentialQuery = credentialQuery.eq('id', credential_id);
  const { data: credentialRows } = await credentialQuery.limit(2);
  if (!credential_id && (credentialRows?.length ?? 0) > 1) {
    return json({ error: 'credential_required', details: 'Selecione a conta Meta Ads para publicar.' }, 400);
  }
  const cred = credentialRows?.[0] ?? null;
  if (!cred?.access_token_encrypted) return json({ error: 'no_meta_credential' }, 400);
  const token = await decryptSecret(cred.access_token_encrypted);
  const ad_account_id = cred.ad_account_id!;
  const cfg = OBJECTIVE_MAP[draft.destino];
  if (!cfg) return json({ error: 'invalid_destination' }, 400);

  // Resolver destination URL
  let destinationUrl = 'https://facebook.com'; // fallback
  if (draft.destino === 'url') {
    destinationUrl = destination_ref?.url ?? '';
  } else if (draft.destino === 'form') {
    const { data: form } = await service.from('forms').select('slug').eq('id', destination_ref?.form_id).maybeSingle();
    const publicBase = Deno.env.get('PUBLIC_APP_URL') ?? 'https://app.vendus.com.br';
    destinationUrl = form ? `${publicBase}/f/${form.slug}` : publicBase;
  } else if (draft.destino === 'quiz') {
    const { data: quiz } = await service.from('quiz_templates').select('slug').eq('id', destination_ref?.quiz_id).maybeSingle();
    const publicBase = Deno.env.get('PUBLIC_APP_URL') ?? 'https://app.vendus.com.br';
    destinationUrl = quiz ? `${publicBase}/q/${quiz.slug}` : publicBase;
  } else if (draft.destino === 'whatsapp') {
    // Buscar número da conexão
    const connId = destination_ref?.whatsapp_connection_id;
    const [meta, evo] = await Promise.all([
      service.from('whatsapp_meta_connections').select('phone_number').eq('id', connId).maybeSingle(),
      service.from('evolution_instances').select('phone_number').eq('id', connId).maybeSingle(),
    ]);
    const phone = (meta.data?.phone_number ?? evo.data?.phone_number ?? '').replace(/\D/g, '');
    const msg = encodeURIComponent(draft.mensagem_inicial_whatsapp ?? 'Olá! Vim pelo anúncio.');
    destinationUrl = `https://wa.me/${phone}?text=${msg}`;
  }
  const finalUrl = buildUrlWithUtms(destinationUrl);

  const createdIds: { campaign?: string; adset?: string; ads: string[]; creatives: string[]; images: string[] } = {
    ads: [], creatives: [], images: [],
  };

  const rollback = async () => {
    for (const id of createdIds.ads) await graphDelete(`/${id}`, token);
    for (const id of createdIds.creatives) await graphDelete(`/${id}`, token);
    if (createdIds.adset) await graphDelete(`/${createdIds.adset}`, token);
    if (createdIds.campaign) await graphDelete(`/${createdIds.campaign}`, token);
  };

  try {
    // 1) Campanha
    const camp = await graphPost(`/${ad_account_id}/campaigns`, token, {
      name: draft.nome_sugerido,
      objective: cfg.objective,
      status: 'PAUSED',
      special_ad_categories: ['NONE'],
      is_adset_budget_sharing_enabled: false,
    });
    if (!camp.ok) throw new Error(`Campanha: ${formatGraphError(camp.data, camp.status)}`);
    createdIds.campaign = camp.data.id;

    // 2) AdSet
    const dailyCents = Math.max(500, Math.round((draft.orcamento_diario_brl || 20) * 100));
    const targeting: any = {
      geo_locations: { countries: draft.localizacao?.paises?.length ? draft.localizacao.paises : ['BR'] },
      age_min: draft.localizacao?.idade_min ?? 18,
      age_max: draft.localizacao?.idade_max ?? 65,
      publisher_platforms: ['facebook', 'instagram'],
      targeting_automation: { advantage_audience: 0 },
    };
    if (draft.localizacao?.interesses?.length) {
      // Somente aceita se vier no formato {id, name}. Texto solto ignorado (usuário deve autocompletar no Ads Manager).
      const structured = draft.localizacao.interesses.filter((i: any) => i?.id && i?.name);
      if (structured.length) targeting.flexible_spec = [{ interests: structured }];
    }
    const adsetParams: any = {
      name: `${draft.nome_sugerido} — Conjunto`,
      campaign_id: createdIds.campaign,
      daily_budget: dailyCents,
      billing_event: 'IMPRESSIONS',
      optimization_goal: cfg.optimization_goal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting,
      status: 'PAUSED',
      start_time: draft.data_inicio ?? new Date(Date.now() + 3600000).toISOString(),
    };
    if (draft.data_fim) adsetParams.end_time = draft.data_fim;
    if (cfg.destination_type) adsetParams.destination_type = cfg.destination_type;
    // Para conversões, o AdSet precisa de promoted_object. Simplificação: se WhatsApp, usa page_id do body.
    if (draft.destino === 'whatsapp' && destination_ref?.facebook_page_id) {
      adsetParams.promoted_object = { page_id: destination_ref.facebook_page_id };
    }

    const adset = await graphPost(`/${ad_account_id}/adsets`, token, adsetParams);
    if (!adset.ok) throw new Error(`Conjunto: ${formatGraphError(adset.data, adset.status)}`);
    createdIds.adset = adset.data.id;

    // 3) Upload de mídia
    const imageHashes: string[] = [];
    const videoIds: string[] = [];
    for (const c of (draft.creatives ?? [])) {
      if (c.upload_base64 && c.upload_type === 'image') {
        const up = await graphPost(`/${ad_account_id}/adimages`, token, { bytes: c.upload_base64 });
        if (!up.ok) throw new Error(`Upload de imagem: ${formatGraphError(up.data, up.status)}`);
        const hashes = up.data?.images ? Object.values(up.data.images) : [];
        const first: any = hashes[0];
        if (first?.hash) imageHashes.push(first.hash);
      } else if (c.upload_base64 && c.upload_type === 'video') {
        videoIds.push(await uploadVideo(ad_account_id, token, c.upload_base64, c.filename));
      } else if (c.image_hash) {
        imageHashes.push(c.image_hash);
      } else if (c.video_id) {
        videoIds.push(c.video_id);
      }
    }
    if (!imageHashes.length && !videoIds.length && draft.destino !== 'form') {
      throw new Error('Envie ao menos uma imagem ou vídeo para o anúncio');
    }

    // 4) Creatives + Ads (1 por copy, alternando as mídias enviadas)
    const pageId = destination_ref?.facebook_page_id;
    if (!pageId) throw new Error('Selecione a Página do Facebook (Page ID) para publicar');
    const media = [
      ...imageHashes.map((id) => ({ type: 'image' as const, id })),
      ...videoIds.map((id) => ({ type: 'video' as const, id })),
    ];

    for (let i = 0; i < draft.copies.length; i++) {
      const copy = draft.copies[i];
      const selectedMedia = media[i % Math.max(1, media.length)] ?? null;
      const storyData = selectedMedia?.type === 'video'
        ? {
            video_data: {
              video_id: selectedMedia.id,
              message: copy.primary_text,
              title: copy.headline,
              link_description: copy.description,
              call_to_action: { type: cfg.cta, value: { link: finalUrl } },
            },
          }
        : {
            link_data: {
              message: copy.primary_text,
              link: finalUrl,
              name: copy.headline,
              description: copy.description,
              call_to_action: { type: cfg.cta, value: { link: finalUrl } },
              ...(selectedMedia?.id ? { image_hash: selectedMedia.id } : {}),
            },
          };
      const creativeParams: any = {
        name: `${draft.nome_sugerido} — Copy ${i + 1}`,
        object_story_spec: {
          page_id: pageId,
          ...storyData,
        },
        degrees_of_freedom_spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } },
      };
      const cr = await graphPost(`/${ad_account_id}/adcreatives`, token, creativeParams);
      if (!cr.ok) throw new Error(`Creative ${i + 1}: ${formatGraphError(cr.data, cr.status)}`);
      createdIds.creatives.push(cr.data.id);

      const ad = await graphPost(`/${ad_account_id}/ads`, token, {
        name: `${draft.nome_sugerido} — Anúncio ${i + 1}`,
        adset_id: createdIds.adset,
        creative: { creative_id: cr.data.id },
        status: 'PAUSED',
      });
      if (!ad.ok) throw new Error(`Anúncio ${i + 1}: ${formatGraphError(ad.data, ad.status)}`);
      createdIds.ads.push(ad.data.id);
    }

    // 5) Persistir no CRM
    const vendus_link = {
      destination_type: draft.destino,
      whatsapp_connection_id: destination_ref?.whatsapp_connection_id ?? null,
      agent_id: destination_ref?.agent_id ?? null,
      pipeline_id: destination_ref?.pipeline_id ?? null,
      stage_id: destination_ref?.stage_id ?? null,
      form_id: destination_ref?.form_id ?? null,
      quiz_id: destination_ref?.quiz_id ?? null,
      tags: destination_ref?.tags ?? [],
      destination_url: destinationUrl,
    };

    await service.from('marketing_campaigns').upsert({
      organization_id, provider: 'meta',
      external_id: createdIds.campaign,
      name: draft.nome_sugerido,
      status: 'PAUSED',
      objective: cfg.objective,
      daily_budget: null,
      ad_account_id,
    }, { onConflict: 'organization_id,provider,external_id' });

    await service.from('marketing_adsets').upsert({
      organization_id, provider: 'meta',
      external_id: createdIds.adset,
      campaign_external_id: createdIds.campaign,
      name: `${draft.nome_sugerido} — Conjunto`,
      status: 'PAUSED',
      daily_budget: dailyCents / 100,
    }, { onConflict: 'organization_id,provider,external_id' });

    for (let i = 0; i < createdIds.creatives.length; i++) {
      await service.from('marketing_creatives').upsert({
        organization_id, provider: 'meta',
        external_id: createdIds.creatives[i],
        name: `${draft.nome_sugerido} — Copy ${i + 1}`,
        headline: draft.copies[i]?.headline ?? null,
        body: draft.copies[i]?.primary_text ?? null,
        cta_type: cfg.cta,
        metadata: {
          source: 'vendus_campaign_creator',
          media_type: media[i % Math.max(1, media.length)]?.type ?? null,
        },
      }, { onConflict: 'organization_id,provider,external_id' });
    }

    for (let i = 0; i < createdIds.ads.length; i++) {
      await service.from('marketing_ads').upsert({
        organization_id, provider: 'meta',
        external_id: createdIds.ads[i],
        adset_external_id: createdIds.adset,
        campaign_external_id: createdIds.campaign,
        creative_external_id: createdIds.creatives[i] ?? null,
        name: `${draft.nome_sugerido} — Anúncio ${i + 1}`,
        status: 'PAUSED',
        metadata: { vendus_link },
      }, { onConflict: 'organization_id,provider,external_id' });
    }

    return json({
      ok: true,
      campaign_id: createdIds.campaign,
      adset_id: createdIds.adset,
      ads: createdIds.ads,
      ads_manager_url: `https://business.facebook.com/adsmanager/manage/campaigns?act=${ad_account_id.replace('act_', '')}&selected_campaign_ids=${createdIds.campaign}`,
    });
  } catch (e) {
    await rollback();
    return json({ error: 'publish_failed', details: (e as Error).message }, 400);
  }
});
