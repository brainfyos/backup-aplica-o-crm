// Inicia uma ligação de voz com o Grok Voice Agent (xAI).
// - Resolve chave da org em org_ai_credentials (provider=xai) — BYO obrigatório.
// - Cria registro em call_logs (status=initiated).
// - Chama a API xAI /v1/voice/calls (endpoint provisório — ajustar conforme doc final).
// - Retorna { call_log_id, call_sid }.
// Fase 1: se a chamada real falhar, o call_log fica marcado como 'failed' com status_reason.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { buildVoiceInstructions } from '../_shared/voice-prompt-builder.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const XAI_VOICE_ENDPOINT = 'https://api.x.ai/v1/voice/calls';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(raw: string) {
  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return `+${digits}`;
  if (digits.length >= 10) return `+55${digits}`;
  return `+${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing auth' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'not authenticated' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const {
      lead_id,
      product_agent_id: bodyProductAgentId,
      voice_agent_id: legacyVoiceAgentId,
      grok_voice_id: bodyGrokVoiceId,
      voice_settings: bodyVoiceSettings,
      language: bodyLanguage,
      context_override: bodyContextOverride,
      voice_context_id,
      phone_override,
    } = body || {};
    if (!lead_id) return json({ error: 'lead_id is required' }, 400);
    if (!bodyProductAgentId && !legacyVoiceAgentId) return json({ error: 'product_agent_id is required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Profile / org
    const { data: profile } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();
    if (!profile?.organization_id) return json({ error: 'user has no organization' }, 400);
    const orgId = profile.organization_id;

    // Legacy fallback
    let legacyAgent: any = null;
    let productAgentId: string | null = bodyProductAgentId || null;
    let grokVoiceId: string | null = bodyGrokVoiceId || null;
    let voiceSettings: any = bodyVoiceSettings || null;
    let language: string = bodyLanguage || 'pt-BR';
    let contextOverride: string | null = bodyContextOverride || null;
    if (!productAgentId && legacyVoiceAgentId) {
      const { data: va } = await admin.from('voice_agents').select('*').eq('id', legacyVoiceAgentId).eq('organization_id', orgId).maybeSingle();
      if (!va) return json({ error: 'voice agent not found' }, 404);
      legacyAgent = va;
      productAgentId = va.product_agent_id || null;
      grokVoiceId = grokVoiceId || va.grok_voice_id || va.voice_option || null;
      voiceSettings = voiceSettings || va.voice_settings || null;
      language = bodyLanguage || va.language || 'pt-BR';
      contextOverride = contextOverride || va.context_override || null;
    }
    if (!productAgentId) return json({ error: 'product_agent_id is required' }, 400);

    const [{ data: productAgent }, { data: lead }, { data: cred }, { data: org }] = await Promise.all([
      admin.from('product_agents').select('*').eq('id', productAgentId).eq('organization_id', orgId).maybeSingle(),
      admin.from('leads').select('id, name, email, phone, company, stage').eq('id', lead_id).eq('organization_id', orgId).maybeSingle(),
      admin.from('org_ai_credentials').select('api_key_encrypted, model_default').eq('organization_id', orgId).eq('provider', 'xai').maybeSingle(),
      admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle(),
    ]);
    if (!productAgent) return json({ error: 'agente de IA não encontrado' }, 404);
    if (!lead) return json({ error: 'lead not found' }, 404);
    if (!cred?.api_key_encrypted) return json({ error: 'xAI API key not configured — go to Integrações → xAI' }, 400);

    let product: any = null;
    if (productAgent.product_id) {
      const { data: p } = await admin.from('products').select('id, name, description').eq('id', productAgent.product_id).maybeSingle();
      product = p;
    }

    const phone = phone_override || lead.phone;
    if (!phone) return json({ error: 'lead has no phone' }, 400);
    const to = normalizePhone(phone);

    // Load optional context
    let contextText = contextOverride || '';
    if (voice_context_id) {
      const { data: ctx } = await admin.from('voice_contexts').select('content').eq('id', voice_context_id).eq('organization_id', orgId).maybeSingle();
      if (ctx?.content) contextText = `${contextText}\n\n--- Contexto adicional ---\n${ctx.content}`;
    }

    const systemPrompt = buildVoiceInstructions({
      productAgent,
      org,
      productName: product?.name,
      productDescription: product?.description,
      lead,
      extraContext: contextText || null,
    });
    const resolvedVoice = grokVoiceId || productAgent.default_grok_voice_id || 'ara';
    const resolvedVoiceSettings = voiceSettings && Object.keys(voiceSettings).length
      ? voiceSettings
      : (productAgent.voice_settings || {});

    // Create call_log first (status=initiated). We save it before dialing so a webhook can find it.
    const { data: callLog, error: clErr } = await admin
      .from('call_logs')
      .insert({
        organization_id: orgId,
        lead_id: lead.id,
        voice_agent_id: legacyAgent?.id || null,
        product_agent_id: productAgent.id,
        grok_voice_id: resolvedVoice,
        provider: 'xai',
        direction: 'outbound',
        from_number: null,
        to_number: to,
        status: 'initiated',
        started_at: new Date().toISOString(),
        initiated_by: userId,
        metadata: {
          agent_name: productAgent.name,
          voice: resolvedVoice,
          language,
          product_agent_id: productAgent.id,
          product_agent_name: productAgent.name,
        },
      })
      .select('id')
      .single();
    if (clErr || !callLog) return json({ error: clErr?.message || 'failed to create call log' }, 500);

    // Tools injetadas quando a ligação pertence a uma campanha
    const campaignTools = body?.campaign_id
      ? [
          { type: 'function', function: { name: 'agendar_reuniao', description: 'Agenda reunião no horário combinado', parameters: { type: 'object', properties: { slot_iso: { type: 'string' } }, required: ['slot_iso'] } } },
          { type: 'function', function: { name: 'enviar_link_whatsapp', description: 'Envia link via WhatsApp', parameters: { type: 'object', properties: { link: { type: 'string' }, message: { type: 'string' } }, required: ['link'] } } },
          { type: 'function', function: { name: 'enviar_link_sms', description: 'Envia link via SMS', parameters: { type: 'object', properties: { link: { type: 'string' } }, required: ['link'] } } },
          { type: 'function', function: { name: 'enviar_link_email', description: 'Envia link por e-mail', parameters: { type: 'object', properties: { link: { type: 'string' } }, required: ['link'] } } },
          { type: 'function', function: { name: 'finalizar_compra', description: 'Gera link de checkout no canal escolhido', parameters: { type: 'object', properties: { offer_id: { type: 'string' }, channel: { type: 'string', enum: ['whatsapp','sms','email'] } } } } },
          { type: 'function', function: { name: 'marcar_desinteresse', description: 'Marca lead sem interesse', parameters: { type: 'object', properties: { motivo: { type: 'string' } } } } },
        ]
      : [];

    // Call xAI Voice Agent API
    let callSid: string | null = null;
    let externalError: string | null = null;
    try {
      const payload = {
        to,
        voice: resolvedVoice,
        voice_settings: (resolvedVoiceSettings && Object.keys(resolvedVoiceSettings).length) ? resolvedVoiceSettings : undefined,
        language,
        agent_id: legacyAgent?.external_agent_id || undefined,
        system_prompt: legacyAgent?.external_agent_id ? undefined : systemPrompt,
        tools: campaignTools.length ? campaignTools : undefined,
        webhook_url: `${SUPABASE_URL}/functions/v1/xai-voice-webhook`,
        metadata: {
          call_log_id: callLog.id,
          organization_id: orgId,
          lead_id: lead.id,
          campaign_id: body?.campaign_id || null,
        },
      };
      const r = await fetch(XAI_VOICE_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cred.api_key_encrypted}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) externalError = `xAI ${r.status}: ${(await r.text()).slice(0, 300)}`;
      else { const j = await r.json().catch(() => ({})); callSid = j?.id || j?.call_id || j?.sid || null; }
    } catch (e) {
      externalError = e instanceof Error ? e.message : 'network error calling xAI';
    }

    if (externalError) {
      await admin.from('call_logs').update({
        status: 'failed',
        status_reason: externalError,
        ended_at: new Date().toISOString(),
      }).eq('id', callLog.id);
      return json({ call_log_id: callLog.id, error: externalError }, 502);
    }

    await admin.from('call_logs').update({
      call_sid: callSid,
      status: 'ringing',
    }).eq('id', callLog.id);

    return json({ call_log_id: callLog.id, call_sid: callSid });
  } catch (e) {
    console.error('[xai-voice-call-start] error', e);
    return json({ error: e instanceof Error ? e.message : 'unknown error' }, 500);
  }
});
