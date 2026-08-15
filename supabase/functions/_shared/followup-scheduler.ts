// Helper para enfileirar/cancelar follow-ups automáticos por agente.
// Reaproveita a tabela `ai_outreach_queue` e o cron `ai-followup-cron`.

interface ScheduleArgs {
  supabase: any;
  organizationId: string;
  leadId: string;
  agentId: string;
  conversationId?: string | null;
  productId?: string | null;
  channel?: 'whatsapp' | 'instagram' | 'webchat' | string;
  // snapshot do lead
  leadData?: { name?: string; email?: string; phone?: string };
}

/**
 * Cria/atualiza um agendamento de follow-up automático após o agente enviar mensagem.
 * Idempotente por (lead_id, agent_id, status='scheduled' OR 'sent').
 */
export async function scheduleAgentFollowup(args: ScheduleArgs): Promise<void> {
  const { supabase, organizationId, leadId, agentId, conversationId, productId, channel, leadData } = args;
  if (!leadId || !agentId) return;

  // Cadência ativa manda: nenhum follow-up autônomo paralelo.
  if (await hasActiveCadenceEnrollment(supabase, leadId)) {
    console.log(`[followup-scheduler] lead ${leadId} em cadência ativa — follow-up automático bloqueado`);
    return;
  }


  // Carrega config do agente
  const { data: agent } = await supabase
    .from('product_agents')
    .select(
      'followup_enabled, followup_max_attempts, followup_intervals_minutes, ' +
      'followup_tone, followup_extra_instructions, followup_respect_business_hours, ' +
      'followup_stop_on_human, followup_stop_on_booking, followup_channels, ' +
      'followup_attempt_hints, name'
    )
    .eq('id', agentId)
    .maybeSingle();

  if (!agent?.followup_enabled) return;

  const allowedChannels: string[] = agent.followup_channels ?? ['whatsapp', 'instagram'];
  if (channel && !allowedChannels.includes(channel)) return;

  const intervals: number[] = Array.isArray(agent.followup_intervals_minutes) && agent.followup_intervals_minutes.length > 0
    ? agent.followup_intervals_minutes
    : [15, 120, 1440];
  const maxAttempts = agent.followup_max_attempts ?? intervals.length;

  const firstDelayMin = intervals[0] ?? 15;
  const nextAt = new Date(Date.now() + firstDelayMin * 60000).toISOString();

  // A última régua é a fonte de verdade. Uma régua terminal nunca pode ser
  // recriada automaticamente por uma nova mensagem do bot/agente.
  const { data: existing } = await supabase
    .from('ai_outreach_queue')
    .select('id, status, followups_sent, last_attempt_executed, ruler_closed, max_followups, followup_intervals_minutes')
    .eq('lead_id', leadId)
    .eq('agent_id', agentId)
    .eq('followup_kind', 'agent_silence')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const basePayload = {
    organization_id: organizationId,
    lead_id: leadId,
    conversation_id: conversationId ?? null,
    agent_id: agentId,
    product_id: productId ?? null,
    objective: 'Retomar contato após silêncio do lead',
    extra_context: agent.followup_extra_instructions ?? null,
    lead_data: leadData ?? {},
    status: 'sent',
    followup_enabled: true,
    followup_interval_hours: Math.max(1, Math.round((intervals[0] ?? 60) / 60)),
    followup_intervals_minutes: intervals.slice(0, maxAttempts),
    followup_attempt_hints: agent.followup_attempt_hints ?? [],
    followup_kind: 'agent_silence',
    max_followups: maxAttempts,
    next_followup_at: nextAt,
  };

  if (existing) {
    if (existing.ruler_closed || ['completed', 'replied', 'failed'].includes(existing.status)) {
      console.log(`[followup-scheduler] régua terminal preservada para lead ${leadId}`);
      return;
    }

    if (!['pending', 'scheduled', 'sent', 'processing'].includes(existing.status)) {
      return;
    }

    // Régua progressiva: NÃO zera contador. Apenas reagenda próxima tentativa
    // a partir de last_attempt_executed atual.
    const lastExecuted = existing.last_attempt_executed ?? existing.followups_sent ?? 0;
    if (lastExecuted >= maxAttempts) {
      await supabase
        .from('ai_outreach_queue')
        .update({ ruler_closed: true, status: 'completed', followup_enabled: false, next_followup_at: null })
        .eq('id', existing.id);
      return;
    }
    const nextAttemptIdx = lastExecuted; // intervals[N] = delay para tentativa N+1
    const delayMin = intervals[nextAttemptIdx] ?? firstDelayMin;
    const advancedNext = new Date(Date.now() + delayMin * 60000).toISOString();
    await supabase
      .from('ai_outreach_queue')
      .update({
        ...basePayload,
        next_followup_at: advancedNext,
        processing_started_at: null,
        last_interaction_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('ai_outreach_queue').insert({
      ...basePayload,
      followups_sent: 0,
      last_attempt_executed: 0,
      attempts_completed: [],
      ruler_closed: false,
      processing_started_at: null,
      last_interaction_at: new Date().toISOString(),
    });
  }
}


/**
 * Cancela follow-ups pendentes quando o lead responde, é transferido para humano,
 * faz opt-out, ou agenda reunião. Usado por todos os webhooks de entrada.
 */
export async function cancelFollowupsForLead(
  supabase: any,
  leadId: string,
  reason: 'lead_replied' | 'human_takeover' | 'opt_out' | 'booking' = 'lead_replied',
): Promise<void> {
  if (!leadId) return;

  // Régua progressiva: resposta do lead NÃO encerra mais a régua — só avança o cronômetro
  // (feito pelo trigger fn_cancel_agent_followup_on_visitor_reply no banco).
  // Demais motivos (humano assumiu, opt-out, agendou reunião) encerram definitivamente.
  if (reason === 'lead_replied') return;

  await supabase
    .from('ai_outreach_queue')
    .update({
      status: 'completed',
      ruler_closed: true,
      followup_enabled: false,
      next_followup_at: null,
      processing_started_at: null,
    })
    .eq('lead_id', leadId)
    .in('status', ['scheduled', 'sent', 'processing']);
}


/**
 * Lead está inscrito em alguma cadência ativa?
 * Enquanto estiver, follow-ups autônomos do agente não podem ser criados nem enviados.
 */
export async function hasActiveCadenceEnrollment(supabase: any, leadId: string): Promise<boolean> {
  if (!leadId) return false;
  try {
    const { data } = await supabase
      .from('cadence_enrollments')
      .select('id')
      .eq('lead_id', leadId)
      .eq('status', 'active')
      .limit(1);
    return !!(data && data.length);
  } catch {
    return false;
  }
}

/**
 * Encerra réguas de follow-up automático abertas (usado ao inscrever em cadência).
 */
export async function closeFollowupsForCadence(supabase: any, leadId: string): Promise<void> {
  if (!leadId) return;
  await supabase
    .from('ai_outreach_queue')
    .update({
      status: 'completed',
      ruler_closed: true,
      followup_enabled: false,
      next_followup_at: null,
      processing_started_at: null,
      error_message: 'cadence_active',
    })
    .eq('lead_id', leadId)
    .in('status', ['scheduled', 'sent', 'processing']);
}
