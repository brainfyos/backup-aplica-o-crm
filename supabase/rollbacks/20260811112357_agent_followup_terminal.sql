-- CONTINGÊNCIA — NÃO EXECUTAR COMO SQL AVULSO.
-- Se o rollback for necessário, copie este conteúdo para uma NOVA migration
-- timestampada. A coluna processing_started_at permanece por ser aditiva.
-- Réguas encerradas pelo backfill não são reabertas, evitando novos disparos.

BEGIN;

DROP INDEX IF EXISTS public.uq_agent_silence_open_ruler_per_lead_agent;

CREATE UNIQUE INDEX IF NOT EXISTS uq_outreach_active_per_lead_agent
  ON public.ai_outreach_queue (lead_id, agent_id)
  WHERE status IN ('pending', 'sent')
    AND followup_enabled = true
    AND agent_id IS NOT NULL;

-- Restaura somente o agendador anterior. Não desfaz dados terminais nem remove
-- a coluna de lease, portanto o código anterior continua compatível.
CREATE OR REPLACE FUNCTION public.fn_schedule_agent_followup_on_bot_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_conv RECORD;
  v_agent RECORD;
  v_intervals integer[];
  v_max int;
  v_next_attempt int;
  v_delay_min int;
  v_next_at timestamptz;
  v_existing RECORD;
  v_lead RECORD;
BEGIN
  IF NEW.sender_type NOT IN ('bot', 'agent') OR NEW.direction <> 'outbound' THEN
    RETURN NEW;
  END IF;

  IF NEW.metadata IS NOT NULL
     AND NEW.metadata ? 'origin'
     AND NEW.metadata->>'origin' = 'ai_followup' THEN
    UPDATE public.ai_outreach_queue
       SET last_interaction_at = now()
     WHERE conversation_id = NEW.conversation_id
       AND status IN ('sent', 'scheduled', 'processing')
       AND ruler_closed = false;
    RETURN NEW;
  END IF;

  SELECT id, organization_id, lead_id, current_agent_id, status, product_id
    INTO v_conv
    FROM public.webchat_conversations
   WHERE id = NEW.conversation_id;

  IF v_conv.lead_id IS NULL OR v_conv.current_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_conv.status::text IN ('human_active', 'waiting_human', 'closed') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.cadence_enrollments ce
     WHERE ce.lead_id = v_conv.lead_id
       AND ce.status = 'active'
  ) THEN
    UPDATE public.ai_outreach_queue
       SET status = 'completed',
           ruler_closed = true,
           followup_enabled = false,
           next_followup_at = NULL,
           error_message = 'cadence_active'
     WHERE lead_id = v_conv.lead_id
       AND status IN ('scheduled', 'sent', 'processing');
    RETURN NEW;
  END IF;

  SELECT id, followup_enabled, followup_max_attempts, followup_intervals_minutes,
         followup_extra_instructions, followup_channels, followup_attempt_hints
    INTO v_agent
    FROM public.product_agents
   WHERE id = v_conv.current_agent_id;

  IF v_agent IS NULL OR v_agent.followup_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_intervals := COALESCE(
    NULLIF(v_agent.followup_intervals_minutes, '{}'),
    ARRAY[15, 120, 1440]::integer[]
  );
  v_max := LEAST(
    COALESCE(v_agent.followup_max_attempts, array_length(v_intervals, 1)),
    array_length(v_intervals, 1)
  );

  SELECT name, email, phone
    INTO v_lead
    FROM public.leads
   WHERE id = v_conv.lead_id;

  SELECT id, last_attempt_executed, ruler_closed, followups_sent
    INTO v_existing
    FROM public.ai_outreach_queue
   WHERE lead_id = v_conv.lead_id
     AND agent_id = v_conv.current_agent_id
     AND status IN ('scheduled', 'sent', 'processing')
     AND ruler_closed = false
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_next_attempt := v_existing.last_attempt_executed + 1;
    IF v_next_attempt > v_max THEN
      UPDATE public.ai_outreach_queue
         SET ruler_closed = true,
             status = 'completed',
             followup_enabled = false,
             next_followup_at = NULL,
             last_interaction_at = now()
       WHERE id = v_existing.id;
      RETURN NEW;
    END IF;

    v_delay_min := v_intervals[v_next_attempt];
    v_next_at := now() + make_interval(mins => v_delay_min);

    UPDATE public.ai_outreach_queue
       SET status = 'sent',
           followup_enabled = true,
           max_followups = v_max,
           followup_intervals_minutes = v_intervals[1:v_max],
           followup_attempt_hints = COALESCE(v_agent.followup_attempt_hints, '[]'::jsonb),
           followup_kind = 'agent_silence',
           next_followup_at = v_next_at,
           last_interaction_at = now(),
           conversation_id = NEW.conversation_id,
           extra_context = v_agent.followup_extra_instructions,
           lead_data = jsonb_build_object('name', v_lead.name, 'email', v_lead.email, 'phone', v_lead.phone)
     WHERE id = v_existing.id;
  ELSE
    v_delay_min := v_intervals[1];
    v_next_at := now() + make_interval(mins => v_delay_min);

    INSERT INTO public.ai_outreach_queue (
      organization_id, lead_id, conversation_id, agent_id, product_id,
      objective, extra_context, lead_data, status, followup_enabled,
      followup_intervals_minutes, followup_attempt_hints, followup_kind,
      max_followups, followups_sent, last_attempt_executed, attempts_completed,
      ruler_closed, next_followup_at, last_interaction_at
    ) VALUES (
      v_conv.organization_id, v_conv.lead_id, NEW.conversation_id,
      v_conv.current_agent_id, v_conv.product_id,
      'Retomar contato após silêncio do lead', v_agent.followup_extra_instructions,
      jsonb_build_object('name', v_lead.name, 'email', v_lead.email, 'phone', v_lead.phone),
      'sent', true,
      v_intervals[1:v_max], COALESCE(v_agent.followup_attempt_hints, '[]'::jsonb),
      'agent_silence', v_max, 0, 0, '{}'::integer[],
      false, v_next_at, now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_schedule_agent_followup_on_bot_message rollback error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

COMMIT;
