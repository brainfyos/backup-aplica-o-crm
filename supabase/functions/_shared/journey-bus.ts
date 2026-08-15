/**
 * Journey Bus — helper único para publicar eventos no Journey Engine.
 *
 * Regra de ouro: nada escreve direto na Timeline. Todo módulo do Vendus
 * (chat, agenda, pipeline, cadência, financeiro, WA, marketing…) publica
 * eventos por aqui. A camada de leitura (src/lib/leadJourney.ts) sempre
 * consome esses eventos.
 *
 * Uso típico:
 *   import { publishJourneyEvent } from '../_shared/journey-bus.ts';
 *   EdgeRuntime.waitUntil(publishJourneyEvent(supabase, {
 *     organization_id, subject_type: 'lead', subject_id: leadId,
 *     event_type: 'first_message_in', event_category: 'contact',
 *     source_module: 'evolution-webhook', channel: 'whatsapp',
 *     lead_id: leadId, conversation_id: convId,
 *     payload: { message_id, from, dedupe_key: `wa-in:${message_id}` },
 *   }));
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type JourneySubjectType =
  | 'lead' | 'customer' | 'user' | 'deal' | 'conversation' | 'order' | 'organization';

export type JourneyActorType = 'human' | 'ai' | 'system' | 'external';

export type JourneyCategory =
  | 'origin' | 'contact' | 'attendance' | 'qualification' | 'opportunity'
  | 'meeting' | 'proposal' | 'negotiation' | 'sale' | 'post_sale' | 'system';

export interface JourneyEventInput {
  organization_id: string;
  subject_type: JourneySubjectType;
  subject_id: string;
  event_type: string;
  event_category?: JourneyCategory;
  source_module: string;
  channel?: string | null;
  source?: string | null;
  title?: string | null;
  description?: string | null;
  payload?: Record<string, unknown>;
  actor_type?: JourneyActorType;
  actor_id?: string | null;
  lead_id?: string | null;
  conversation_id?: string | null;
  deal_id?: string | null;
  product_id?: string | null;
  pipeline_stage_id?: string | null;
  user_id?: string | null;
  agent_id?: string | null;
  occurred_at?: string;
  correlation_id?: string | null;
  session_id?: string | null;
  dedupe_key?: string | null;
}

/**
 * Publica um evento no Journey Engine. Nunca lança — falhas são logadas e
 * jamais bloqueiam o fluxo principal (atendimento, envio de mensagem, etc).
 */
export async function publishJourneyEvent(
  supabase: SupabaseClient,
  event: JourneyEventInput,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('emit_journey_event', {
      p_organization_id: event.organization_id,
      p_subject_type: event.subject_type,
      p_subject_id: event.subject_id,
      p_event_type: event.event_type,
      p_event_category: event.event_category ?? 'system',
      p_source_module: event.source_module,
      p_channel: event.channel ?? null,
      p_source: event.source ?? null,
      p_title: event.title ?? null,
      p_description: event.description ?? null,
      p_payload: event.payload ?? {},
      p_actor_type: event.actor_type ?? 'system',
      p_actor_id: event.actor_id ?? null,
      p_lead_id: event.lead_id ?? (event.subject_type === 'lead' ? event.subject_id : null),
      p_conversation_id: event.conversation_id ?? null,
      p_deal_id: event.deal_id ?? null,
      p_product_id: event.product_id ?? null,
      p_pipeline_stage_id: event.pipeline_stage_id ?? null,
      p_user_id: event.user_id ?? null,
      p_agent_id: event.agent_id ?? null,
      p_occurred_at: event.occurred_at ?? new Date().toISOString(),
      p_correlation_id: event.correlation_id ?? null,
      p_session_id: event.session_id ?? null,
      p_dedupe_key: event.dedupe_key ?? null,
    });

    if (error) {
      console.warn('[journey-bus] emit_journey_event error:', error.message, {
        event_type: event.event_type,
        source_module: event.source_module,
      });
      return null;
    }
    return (data as string | null) ?? null;
  } catch (err) {
    console.warn('[journey-bus] publish failed:', (err as Error).message);
    return null;
  }
}

/**
 * Envelopa a publicação em waitUntil para nunca bloquear a resposta HTTP.
 * Use dentro de edge functions:
 *   fireAndForgetJourneyEvent(supabase, { ... });
 */
export function fireAndForgetJourneyEvent(
  supabase: SupabaseClient,
  event: JourneyEventInput,
): void {
  const promise = publishJourneyEvent(supabase, event);
  // @ts-ignore EdgeRuntime é global do Deno Deploy/Supabase Edge
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(promise);
  }
}
