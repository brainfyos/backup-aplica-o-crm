// voice-campaign-tick — cron a cada 1 min.
// Para cada campanha 'running', pega até (max_concurrent - em_progresso) targets 'pending'
// (respeitando scheduled_for e retry_interval), marca 'calling' e dispara xai-voice-call-start.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { authorizePlatformWorker, loadWorkerControl, workerCanRunFor } from '../_shared/worker-control.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('VITE_SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function dial(campaign: any, target: any, admin: any) {
  // Marca como calling ANTES de disparar (evita duplicação em concorrência)
  const { data: locked } = await admin
    .from('voice_campaign_targets')
    .update({ status: 'calling', last_attempt_at: new Date().toISOString(), attempts: (target.attempts || 0) + 1 })
    .eq('id', target.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (!locked) return { skipped: true };

  // Buscar system auth: usa a service key para chamar xai-voice-call-start via HTTP com um "system" user_id?
  // A função xai-voice-call-start exige Authorization de user autenticado.
  // Aqui replicamos a lógica principal DIRETO: cria call_log + chama xAI (sem depender de user JWT).
  const { data: agent } = await admin
    .from('voice_agents').select('*').eq('id', campaign.voice_agent_id).eq('organization_id', campaign.organization_id).maybeSingle();
  const { data: cred } = await admin
    .from('org_ai_credentials').select('api_key_encrypted').eq('organization_id', campaign.organization_id).eq('provider', 'xai').maybeSingle();
  const { data: org } = await admin
    .from('organizations').select('id, name').eq('id', campaign.organization_id).maybeSingle();

  if (!agent || !cred?.api_key_encrypted) {
    await admin.from('voice_campaign_targets').update({ status: 'failed', last_error: 'agent or xAI key missing' }).eq('id', target.id);
    return { error: 'missing agent/key' };
  }

  let lead: any = null;
  if (target.lead_id) {
    const { data } = await admin.from('leads').select('id, name, email, phone, company, stage').eq('id', target.lead_id).maybeSingle();
    lead = data;
  }

  // Resolve product_agent vinculado (fonte do prompt real)
  let productAgent: any = null;
  if (agent.product_agent_id) {
    const { data: pa } = await admin
      .from('product_agents').select('*')
      .eq('id', agent.product_agent_id).eq('organization_id', campaign.organization_id)
      .maybeSingle();
    productAgent = pa;
  }

  let contextText = '';
  if (campaign.voice_context_id) {
    const { data: ctx } = await admin.from('voice_contexts').select('content').eq('id', campaign.voice_context_id).maybeSingle();
    if (ctx?.content) contextText = `\n\n--- Contexto adicional ---\n${ctx.content}`;
  }

  const baseSystem = productAgent?.system_prompt || productAgent?.persona || agent.system_prompt || '';
  const objective  = productAgent?.objective || agent.objective || '';
  const promptParts = [
    baseSystem,
    objective ? `\n\nObjetivo desta ligação: ${objective}` : '',
    agent.context_override ? `\n\n--- Contexto extra do perfil de voz ---\n${agent.context_override}` : '',
    '\n\n--- Contexto do lead ---',
    `Nome: ${lead?.name || 'Desconhecido'}`,
    lead?.email ? `Email: ${lead.email}` : '',
    lead?.phone ? `Telefone: ${lead.phone}` : '',
    lead?.company ? `Empresa: ${lead.company}` : '',
    org?.name ? `\nEmpresa que representa: ${org.name}` : '',
    contextText,
  ].filter(Boolean).join('\n');

  const resolvedVoice = agent.grok_voice_id || agent.voice_option || 'ara';
  const digits = String(target.phone).replace(/\D+/g, '');
  const to = digits.startsWith('55') ? `+${digits}` : (digits.length >= 10 ? `+55${digits}` : `+${digits}`);

  const { data: callLog } = await admin.from('call_logs').insert({
    organization_id: campaign.organization_id,
    lead_id: target.lead_id,
    voice_agent_id: agent.id,
    campaign_id: campaign.id,
    campaign_target_id: target.id,
    provider: 'xai',
    direction: 'outbound',
    to_number: to,
    status: 'initiated',
    started_at: new Date().toISOString(),
    metadata: { via: 'campaign', campaign_name: campaign.name, agent_name: agent.name, voice: resolvedVoice, product_agent_id: agent.product_agent_id },
  }).select('id').single();

  if (!callLog) {
    await admin.from('voice_campaign_targets').update({ status: 'failed', last_error: 'call_log insert failed' }).eq('id', target.id);
    return { error: 'call_log insert failed' };
  }

  // Contexto reutilizável da biblioteca
  if (!contextText && campaign.context_id) {
    const { data: ctx2 } = await admin.from('voice_contexts').select('content').eq('id', campaign.context_id).maybeSingle();
    if (ctx2?.content) contextText = `\n\n--- Contexto (biblioteca) ---\n${ctx2.content}`;
  }

  // Tools ativas em campanha
  const campaignTools = [
    { type: 'function', function: { name: 'agendar_reuniao', description: 'Agenda reunião', parameters: { type: 'object', properties: { slot_iso: { type: 'string' } }, required: ['slot_iso'] } } },
    { type: 'function', function: { name: 'enviar_link_whatsapp', description: 'Envia link via WhatsApp', parameters: { type: 'object', properties: { link: { type: 'string' }, message: { type: 'string' } }, required: ['link'] } } },
    { type: 'function', function: { name: 'enviar_link_sms', description: 'Envia link via SMS', parameters: { type: 'object', properties: { link: { type: 'string' } }, required: ['link'] } } },
    { type: 'function', function: { name: 'enviar_link_email', description: 'Envia link por e-mail', parameters: { type: 'object', properties: { link: { type: 'string' } }, required: ['link'] } } },
    { type: 'function', function: { name: 'finalizar_compra', description: 'Gera checkout', parameters: { type: 'object', properties: { offer_id: { type: 'string' }, channel: { type: 'string' } } } } },
    { type: 'function', function: { name: 'marcar_desinteresse', description: 'Marca lead sem interesse', parameters: { type: 'object', properties: { motivo: { type: 'string' } } } } },
  ];

  // Escolhe número de origem
  const dialNumbers: string[] = Array.isArray(campaign.dial_numbers) ? campaign.dial_numbers : [];
  const strategy = campaign.dial_strategy || 'round_robin';
  const fromNumber = dialNumbers.length
    ? (strategy === 'random'
        ? dialNumbers[Math.floor(Math.random() * dialNumbers.length)]
        : dialNumbers[(target.attempts || 0) % dialNumbers.length])
    : undefined;

  try {
    const r = await fetch('https://api.x.ai/v1/voice/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cred.api_key_encrypted}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        from: fromNumber,
        voice: resolvedVoice,
        voice_settings: agent.voice_settings || undefined,
        language: agent.language || 'pt-BR',
        agent_id: agent.external_agent_id || undefined,
        system_prompt: agent.external_agent_id ? undefined : promptParts,
        tools: campaignTools,
        webhook_url: `${SUPABASE_URL}/functions/v1/xai-voice-webhook`,
        metadata: { call_log_id: callLog.id, organization_id: campaign.organization_id, lead_id: target.lead_id, campaign_id: campaign.id, campaign_target_id: target.id },
      }),
    });
    if (!r.ok) {
      const err = `xAI ${r.status}: ${(await r.text()).slice(0, 300)}`;
      await admin.from('call_logs').update({ status: 'failed', status_reason: err, ended_at: new Date().toISOString() }).eq('id', callLog.id);
      throw new Error(err);
    }
    const j = await r.json().catch(() => ({}));
    const callSid = j?.id || j?.call_id || j?.sid || null;
    await admin.from('call_logs').update({ call_sid: callSid, status: 'ringing' }).eq('id', callLog.id);
    return { ok: true, call_log_id: callLog.id };
  } catch (e) {
    const msg = (e as Error).message;
    // decide se pode retry
    const canRetry = (target.attempts || 0) + 1 < (campaign.max_attempts || 2);
    await admin.from('voice_campaign_targets').update({
      status: canRetry ? 'pending' : 'failed',
      last_error: msg,
      scheduled_for: canRetry ? new Date(Date.now() + (campaign.retry_interval_minutes || 60) * 60000).toISOString() : null,
    }).eq('id', target.id);
    return { error: msg };
  }
}

Deno.serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    if (!(await authorizePlatformWorker(admin, req))) return json({ error: 'unauthorized' }, 401);
    const workerControl = await loadWorkerControl(admin, 'voice_campaign');
    if (!workerControl.enabled) return json({ ok: true, campaigns: 0, reason: 'worker_disabled' });
    const { data: campaigns } = await admin.from('voice_campaigns').select('*').eq('status', 'running').limit(50);
    if (!campaigns?.length) return json({ ok: true, campaigns: 0 });

    const results: any[] = [];
    for (const c of campaigns) {
      if (!workerCanRunFor(workerControl, c.organization_id)) {
        results.push({ campaign: c.id, paused: true });
        continue;
      }
      // scheduled_at: se ainda não chegou a hora, pula
      if (c.scheduled_at && new Date(c.scheduled_at) > new Date()) { results.push({ campaign: c.id, scheduled: true }); continue; }

      // business_hours_only: 09h-18h no fuso configurado, seg-sex
      if (c.business_hours_only) {
        const tz = c.timezone || 'America/Sao_Paulo';
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false, weekday: 'short' });
        const parts = fmt.formatToParts(new Date());
        const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
        const wd = parts.find(p => p.type === 'weekday')?.value || '';
        const isWeekend = wd === 'Sat' || wd === 'Sun';
        if (isWeekend || hour < 9 || hour >= 18) { results.push({ campaign: c.id, outside_hours: true }); continue; }
      }

      // Count in-progress calls for this campaign
      const { count: inProgress } = await admin
        .from('call_logs').select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id)
        .in('status', ['initiated', 'ringing', 'in_progress']);

      const slots = Math.max(0, (c.max_concurrent || 3) - (inProgress || 0));
      if (slots === 0) { results.push({ campaign: c.id, slots: 0 }); continue; }


      const nowIso = new Date().toISOString();
      const { data: targets } = await admin
        .from('voice_campaign_targets')
        .select('*')
        .eq('campaign_id', c.id)
        .eq('status', 'pending')
        .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
        .lt('attempts', c.max_attempts || 2)
        .order('created_at', { ascending: true })
        .limit(slots);

      if (!targets?.length) {
        // If nothing pending remains, auto-complete campaign
        const { count: anyPending } = await admin.from('voice_campaign_targets')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id).eq('status', 'pending');
        if (!anyPending) {
          await admin.from('voice_campaigns').update({ status: 'completed', finished_at: nowIso }).eq('id', c.id);
        }
        results.push({ campaign: c.id, dialed: 0 });
        continue;
      }

      let dialed = 0;
      for (const t of targets) {
        const r = await dial(c, t, admin);
        if ((r as any)?.ok) dialed++;
      }
      results.push({ campaign: c.id, dialed });
    }
    return json({ ok: true, results });
  } catch (e) {
    console.error('[voice-campaign-tick] error', e);
    return json({ error: (e as Error).message }, 500);
  }
});
