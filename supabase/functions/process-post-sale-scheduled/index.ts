// Cron worker: processa fila de execuções pós-venda atrasadas.
// Dispara mensagem inline / agente IA / e-mail por template para runs vencidas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { authorizePlatformWorker, loadWorkerControl, workerCanRunFor } from '../_shared/worker-control.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55')) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v ?? '');
  }
  return out.replace(/\{\{[^}]+\}\}/g, '');
}

function buildVars(lead: any, eventData: Record<string, any> = {}): Record<string, string> {
  const vars: Record<string, string> = {
    lead_name: lead?.name || '',
    lead_email: lead?.email || '',
    lead_phone: lead?.phone || '',
    name: lead?.name || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
  };
  for (const [k, v] of Object.entries(eventData)) {
    if (k === '__raw' || v == null) continue;
    if (typeof v === 'object') {
      try { vars[k] = JSON.stringify(v); } catch { /* skip */ }
    } else {
      vars[k] = String(v);
    }
  }
  return vars;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  if (!(await authorizePlatformWorker(supabase, req))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const workerControl = await loadWorkerControl(supabase, 'post_sale');
  if (!workerControl.enabled) {
    return new Response(JSON.stringify({ processed: 0, reason: 'worker_disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: due, error: dueErr } = await supabase
    .from('post_sale_scheduled_runs')
    .select('*')
    .eq('status', 'pending')
    .lte('run_at', new Date().toISOString())
    .order('run_at', { ascending: true })
    .limit(500);

  if (dueErr) {
    console.error('[process-post-sale-scheduled] fetch error', dueErr);
    return new Response(JSON.stringify({ error: dueErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const processed: any[] = [];

  const runnable = (due ?? [])
    .filter((run) => workerCanRunFor(workerControl, run.organization_id))
    .slice(0, 50);

  for (const run of runnable) {
    // claim
    const { data: claimed } = await supabase
      .from('post_sale_scheduled_runs')
      .update({ status: 'running', attempts: (run.attempts ?? 0) + 1 })
      .eq('id', run.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) continue;

    // Defesa: se um evento "final" (compra_aprovada/reembolso/chargeback/cancelamento)
    // chegou DEPOIS desta run ser criada, cancela em vez de disparar.
    if (['pix_gerado', 'boleto_gerado', 'checkout_abandonado'].includes(run.event_type)) {
      const { data: laterClose } = await supabase
        .from('post_sale_scheduled_runs')
        .select('id')
        .eq('lead_id', run.lead_id)
        .in('event_type', ['compra_aprovada', 'reembolso', 'chargeback', 'assinatura_cancelada'])
        .gt('created_at', run.created_at)
        .limit(1);
      if (laterClose && laterClose.length > 0) {
        await supabase
          .from('post_sale_scheduled_runs')
          .update({
            status: 'cancelled',
            last_error: 'cancelled_by_later_closing_event',
            executed_at: new Date().toISOString(),
          })
          .eq('id', run.id);
        processed.push({ id: run.id, status: 'cancelled', reason: 'later_closing_event' });
        continue;
      }
    }

    const errors: string[] = [];


    try {
      const { data: action } = await supabase
        .from('post_sale_event_actions')
        .select('*')
        .eq('id', run.action_id)
        .maybeSingle();

      const { data: leadRow } = await supabase
        .from('leads')
        .select('id, name, email, phone, organization_id')
        .eq('id', run.lead_id)
        .maybeSingle();

      // Tenta achar um lead "alternativo" na mesma org com mesmo email que
      // tenha uma conversa WhatsApp ativa — cobre o caso em que o cliente
      // digitou telefone diferente no checkout vs WhatsApp.
      async function findAltLeadByEmail(srcLead: any): Promise<any | null> {
        if (!srcLead?.email) return null;
        const { data: candidates } = await supabase
          .from('leads')
          .select('id, name, email, phone, organization_id')
          .eq('organization_id', srcLead.organization_id)
          .eq('email', srcLead.email)
          .neq('id', srcLead.id)
          .limit(10);
        for (const c of candidates ?? []) {
          if (!c.phone) continue;
          const { data: conv } = await supabase
            .from('webchat_conversations')
            .select('id')
            .eq('lead_id', c.id)
            .eq('channel', 'whatsapp')
            .limit(1)
            .maybeSingle();
          if (conv?.id) return c;
        }
        return null;
      }

      async function dispatchFor(lead: any): Promise<string[]> {
        const localErrors: string[] = [];
        if (!action || !action.is_active) {
          localErrors.push('action missing or inactive');
          return localErrors;
        }
        if (!lead) {
          localErrors.push('lead not found');
          return localErrors;
        }
        const vars = buildVars(lead, run.event_data || {});

        // 1) Mensagem inline
        if (action.send_mode === 'message' && action.inline_message) {
          const message = replaceVars(action.inline_message, vars);
          if (action.message_channel === 'whatsapp' && lead.phone) {
            const phone = normalizePhone(lead.phone);
            const { data: sd, error: se } = await supabase.functions.invoke('evolution-send', {
              body: {
                type: 'text', to: phone, payload: { text: message },
                organization_id: run.organization_id,
                instance_id: action.evolution_instance_id ?? undefined,
              },
            });
            if (se || (sd && (sd as any).error)) {
              localErrors.push(`evolution-send: ${se?.message || (sd as any)?.error} (lead=${lead.id}, phone=${phone})`);
            }
          } else if (action.message_channel === 'email' && lead.email) {
            await supabase.rpc('enqueue_email', {
              queue_name: 'transactional_email',
              payload: {
                to: lead.email,
                subject: `Sobre ${run.event_data?.product_name ?? 'sua compra'}`,
                html: `<p>${message.replace(/\n/g, '<br/>')}</p>`,
                organization_id: run.organization_id,
                lead_id: lead.id,
              },
            });
          }
        }

        // 2) Agente IA
        if (action.agent_id && lead.phone) {
          const { data: od, error: oe } = await supabase.functions.invoke('manual-outreach', {
            body: {
              lead_ids: [lead.id],
              agent_id: action.agent_id,
              organization_id: run.organization_id,
              objective: action.agent_objective || `Evento ${run.event_type}`,
              extra_context: action.agent_extra_context,
              force_when_human: true,
              event_context: {
                event_type: run.event_type,
                source: run.source,
                ...(run.event_data || {}),
              },
            },
          });
          if (oe) {
            localErrors.push(`manual-outreach: ${oe.message} (lead=${lead.id}, phone=${lead.phone})`);
          } else {
            const r = (od as any)?.results?.[0];
            if (r?.error) localErrors.push(`manual-outreach: ${r.error} (lead=${lead.id})`);
            else if (r?.skipped) localErrors.push(`manual-outreach skipped: ${r.reason} (lead=${lead.id})`);
          }
        }

        // 3) E-mail por template
        if (action.email_template_id && lead.email) {
          const { data: tpl } = await supabase
            .from('email_templates')
            .select('subject, html_content')
            .eq('id', action.email_template_id)
            .maybeSingle();
          if (tpl) {
            await supabase.rpc('enqueue_email', {
              queue_name: 'transactional_email',
              payload: {
                to: lead.email,
                subject: replaceVars(tpl.subject || '', vars),
                html: replaceVars(tpl.html_content || '', vars),
                organization_id: run.organization_id,
                template_id: action.email_template_id,
                lead_id: lead.id,
              },
            });
          }
        }
        return localErrors;
      }

      let runErrors = await dispatchFor(leadRow);

      // Retry com lead alternativo se falha de entrega WhatsApp
      const looksLikeWhatsAppFailure = runErrors.some((e) =>
        /evolution-send|manual-outreach.*WhatsApp send failed|sem instância|sem inst\u00e2ncia/i.test(e),
      );
      if (looksLikeWhatsAppFailure) {
        const altLead = await findAltLeadByEmail(leadRow);
        if (altLead) {
          console.log('[process-post-sale-scheduled] retrying with alt lead', {
            run_id: run.id, original: leadRow?.id, alt: altLead.id,
          });
          const altErrors = await dispatchFor(altLead);
          if (altErrors.length === 0) {
            runErrors = [];
          } else {
            runErrors.push(`alt_lead_retry(${altLead.id}): ${altErrors.join(' | ')}`);
          }
        }
      }

      for (const e of runErrors) errors.push(e);

      const finalStatus = errors.length ? 'failed' : 'done';
      await supabase
        .from('post_sale_scheduled_runs')
        .update({
          status: finalStatus,
          executed_at: new Date().toISOString(),
          last_error: errors.length ? errors.join(' | ') : null,
        })
        .eq('id', run.id);

      processed.push({ id: run.id, status: finalStatus, errors });
    } catch (err) {
      console.error('[process-post-sale-scheduled] run failed', run.id, err);
      await supabase
        .from('post_sale_scheduled_runs')
        .update({
          status: 'failed',
          last_error: (err as Error).message,
          executed_at: new Date().toISOString(),
        })
        .eq('id', run.id);
      processed.push({ id: run.id, status: 'failed', error: (err as Error).message });
    }
  }

  return new Response(JSON.stringify({ processed: processed.length, items: processed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
