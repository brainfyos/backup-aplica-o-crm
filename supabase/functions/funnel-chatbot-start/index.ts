// Cria uma webchat_conversations a partir de um funil público (canal chat),
// auto-criando o lead se possível. Usado pelo PublicChat (/c/:slug) quando
// o fluxo encontra um bloco ai_takeover / agent_switch e precisa delegar
// o atendimento para um Agente IA real via webchat-bot.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface StartRequest {
  funnel_id: string;
  visitor_id: string;
  visitor_name?: string;
  visitor_email?: string;
  visitor_phone?: string;
  flow_variables?: Record<string, string>;
  agent_id?: string | null;
  ai_context?: string | null;
  override_can_do?: string[];
  override_cannot_do?: string[];
  override_handoff_triggers?: string[];
  current_page_url?: string;
  referrer_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body: StartRequest = await req.json();
    if (!body.funnel_id || !body.visitor_id) {
      return new Response(JSON.stringify({ error: 'funnel_id and visitor_id are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: funnel, error: funnelErr } = await supabase
      .from('capture_funnels')
      .select('id, organization_id, product_id, name')
      .eq('id', body.funnel_id)
      .single();

    if (funnelErr || !funnel) {
      return new Response(JSON.stringify({ error: 'Funnel not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reaproveita conversa recente do mesmo visitor (mesmo funil) se ainda aberta.
    const { data: existing } = await supabase
      .from('webchat_conversations')
      .select('id, lead_id, status')
      .eq('organization_id', funnel.organization_id)
      .eq('visitor_id', body.visitor_id)
      .eq('channel', 'web_chat')
      .order('created_at', { ascending: false })
      .limit(1);

    let conversation = existing?.[0] || null;
    if (conversation && conversation.status === 'closed') conversation = null;

    const flowVariables: Record<string, string> = { ...(body.flow_variables || {}) };
    if (body.ai_context) flowVariables['__ai_context'] = body.ai_context;
    if (body.override_can_do?.length) flowVariables['__override_can_do'] = JSON.stringify(body.override_can_do);
    if (body.override_cannot_do?.length) flowVariables['__override_cannot_do'] = JSON.stringify(body.override_cannot_do);
    if (body.override_handoff_triggers?.length) flowVariables['__override_handoff_triggers'] = JSON.stringify(body.override_handoff_triggers);

    if (!conversation) {
      const { data: created, error: insErr } = await supabase
        .from('webchat_conversations')
        .insert({
          organization_id: funnel.organization_id,
          product_id: funnel.product_id || null,
          channel: 'web_chat',
          status: 'bot_active',
          visitor_id: body.visitor_id,
          visitor_name: body.visitor_name || null,
          visitor_email: body.visitor_email || null,
          visitor_phone: body.visitor_phone || null,
          current_page_url: body.current_page_url || null,
          referrer_url: body.referrer_url || null,
          utm_source: body.utm_source || null,
          utm_medium: body.utm_medium || null,
          utm_campaign: body.utm_campaign || null,
          utm_content: body.utm_content || null,
          utm_term: body.utm_term || null,
          flow_source: 'funnel',
          current_agent_id: body.agent_id || null,
          flow_variables: flowVariables,
          metadata: { funnel_id: funnel.id, funnel_name: funnel.name, source_kind: 'funnel_chat' },
        })
        .select('id, lead_id')
        .single();

      if (insErr || !created) {
        console.error('[funnel-chatbot-start] insert conv failed:', insErr);
        return new Response(JSON.stringify({ error: 'Failed to create conversation', details: insErr?.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      conversation = { ...created, status: 'bot_active' } as any;
    } else {
      // Conversa reaproveitada → atualiza agente/contexto.
      await supabase
        .from('webchat_conversations')
        .update({
          current_agent_id: body.agent_id || null,
          flow_variables: flowVariables,
          status: 'bot_active',
        })
        .eq('id', conversation.id);
    }

    // Auto-cria lead se ainda não houver
    let leadId = conversation.lead_id || null;
    if (!leadId) {
      try {
        if (body.visitor_email || body.visitor_phone) {
          const orFilters: string[] = [];
          if (body.visitor_email) orFilters.push(`email.eq.${body.visitor_email}`);
          if (body.visitor_phone) {
            orFilters.push(`phone.eq.${body.visitor_phone}`);
            orFilters.push(`phone_normalized.eq.${body.visitor_phone}`);
          }
          const { data: existingLead } = await supabase
            .from('leads')
            .select('id')
            .eq('organization_id', funnel.organization_id)
            .or(orFilters.join(','))
            .limit(1)
            .maybeSingle();
          leadId = existingLead?.id || null;
        }
        if (!leadId) {
          const visitorShort = String(body.visitor_id || '').slice(-6) || 'novo';
          const { data: newLead } = await supabase
            .from('leads')
            .insert({
              organization_id: funnel.organization_id,
              product_id: funnel.product_id || null,
              name: body.visitor_name || `Visitante #${visitorShort}`,
              email: body.visitor_email || null,
              phone: body.visitor_phone || null,
              phone_normalized: body.visitor_phone || null,
              source: 'funnel_chat',
            })
            .select('id')
            .single();
          leadId = newLead?.id || null;
        }
        if (leadId) {
          await supabase
            .from('webchat_conversations')
            .update({ lead_id: leadId })
            .eq('id', conversation.id);
        }
      } catch (e) {
        console.error('[funnel-chatbot-start] lead auto-create failed (non-fatal):', e);
      }
    }

    return new Response(JSON.stringify({
      conversation_id: conversation.id,
      lead_id: leadId,
      organization_id: funnel.organization_id,
      product_id: funnel.product_id || null,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[funnel-chatbot-start] fatal:', err);
    return new Response(JSON.stringify({ error: 'Internal error', details: err?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
