// Mia — executa uma ação previamente preparada (após confirmação do usuário).
// Valida ownership e status antes de tocar nas tabelas reais.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function resolveUserByName(admin: any, organizationId: string, name: string | null | undefined): Promise<string | null> {
  if (!name) return null;
  const { data } = await admin.from("profiles")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .ilike("full_name", `%${name}%`)
    .limit(2);
  if (!data || data.length === 0) return null;
  if (data.length > 1) return null; // ambíguo
  return data[0].id;
}

async function resolveLeadByName(admin: any, organizationId: string, name: string | null | undefined): Promise<{ id: string; product_id: string | null; phone: string | null; email: string | null; name: string } | null> {
  if (!name) return null;
  const { data } = await admin.from("leads")
    .select("id, name, product_id, phone, email")
    .eq("organization_id", organizationId)
    .ilike("name", `%${name}%`)
    .limit(2);
  if (!data || data.length === 0) return null;
  if (data.length > 1) return null;
  return data[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const actionId = String(body?.action_id ?? "");
    if (!actionId) {
      return new Response(JSON.stringify({ error: "missing_action_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: action, error: loadErr } = await admin.from("mia_actions")
      .select("*").eq("id", actionId).maybeSingle();
    if (loadErr || !action) {
      return new Response(JSON.stringify({ error: "action_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: miaEnabled, error: miaAccessError } = await admin.rpc("organization_has_mia", { p_org_id: action.organization_id });
    if (miaAccessError || miaEnabled !== true) {
      return new Response(JSON.stringify({ error: "mia_not_in_plan" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ownership: dono OU admin/super_admin ──────────────────────────────
    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (callerRoles ?? []).some((r: any) => ["admin","super_admin"].includes(r.role));
    const isManager = (callerRoles ?? []).some((r: any) => r.role === "manager");
    const isOwner = action.user_id === userId;

    if (!isOwner && !isAdmin && !isManager) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["waiting_confirmation","approved","draft"].includes(action.status)) {
      return new Response(JSON.stringify({ error: "invalid_status", status: action.status }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MIDDLEWARE DE GOVERNANÇA ──────────────────────────────────────────
    // Ponto único onde toda ação passa. Corre ANTES do EdgeRuntime.waitUntil.

    // 1. Lê catálogo + override da org em paralelo
    const [catRes, overrideRes] = await Promise.all([
      admin.from("mia_action_catalog")
        .select("default_autonomy, reversible, is_external, category")
        .eq("action_type", action.action_type)
        .maybeSingle(),
      admin.from("mia_autonomy_settings")
        .select("level, daily_limit, max_value, active")
        .eq("organization_id", action.organization_id)
        .eq("action_type", action.action_type)
        .eq("active", true)
        .maybeSingle(),
    ]);

    const cat = catRes.data;
    const org = overrideRes.data;

    // Ações de navegação e ações sem catálogo: passa direto sem restrição
    const isNavAction = ["open_conversation","open_lead","open_calendar","open_tasks","open_report"].includes(action.action_type);
    const effectiveLevel: string = org?.level ?? cat?.default_autonomy ?? "um_clique";
    const isReversible:  boolean = cat?.reversible  ?? false;
    const isExternal:    boolean = cat?.is_external  ?? false;

    if (!isNavAction) {
      // 2. Ações externas (WhatsApp, e-mail, proposta): exigem admin ou manager
      if (isExternal && !isAdmin && !isManager) {
        return new Response(JSON.stringify({
          error:   "forbidden_external",
          message: "Ações que enviam mensagens externas exigem permissão de gestor ou admin.",
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 3. Nível "sugerir": só executa se approved_by estiver preenchido por um admin
      if (effectiveLevel === "sugerir" && !action.approved_by) {
        await admin.from("mia_actions")
          .update({ autonomy_level: effectiveLevel, requires_approval: true })
          .eq("id", actionId);
        return new Response(JSON.stringify({
          ok:      false,
          status:  "pending_approval",
          level:   effectiveLevel,
          message: "Esta ação requer aprovação manual de um administrador na Central de Decisões.",
        }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // 4. Limite diário (se configurado)
      if (org?.daily_limit) {
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const { count } = await admin.from("mia_actions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", action.organization_id)
          .eq("action_type", action.action_type)
          .eq("status", "executed")
          .gte("executed_at", todayStart.toISOString());
        if ((count ?? 0) >= org.daily_limit) {
          await admin.from("mia_actions")
            .update({ autonomy_level: "um_clique", requires_approval: true })
            .eq("id", actionId);
          return new Response(JSON.stringify({
            ok:      false,
            status:  "limit_exceeded",
            message: `Limite diário de ${org.daily_limit} ação(ões) do tipo "${action.action_type}" atingido. Aguardando aprovação.`,
          }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // 5. Captura undo_payload ANTES de executar (para ações reversíveis)
      if (isReversible && !action.undo_payload) {
        let undoPayload: Record<string, any> | null = null;
        if (action.action_type === "update_lead_stage") {
          const { data: lead } = await admin.from("leads")
            .select("current_stage_id").eq("id", action.payload?.lead_id ?? "").maybeSingle();
          // Lê também o nome da etapa atual para exibir no botão Desfazer
          const prevStageId = lead?.current_stage_id ?? null;
          let prevStageName: string | null = null;
          if (prevStageId) {
            const { data: s } = await admin.from("pipeline_stages")
              .select("name").eq("id", prevStageId).maybeSingle();
            prevStageName = s?.name ?? null;
          }
          undoPayload = {
            action_type:        "update_lead_stage",
            lead_id:            action.payload?.lead_id,
            lead_name:          action.payload?.lead_name,
            previous_stage_id:  prevStageId,
            previous_stage_name: prevStageName,
          };
        }
        // Registra autonomy + undo_payload atomicamente
        await admin.from("mia_actions").update({
          autonomy_level:    effectiveLevel,
          requires_approval: effectiveLevel !== "piloto",
          undo_payload:      undoPayload,
        }).eq("id", actionId);
      } else {
        // Apenas atualiza metadata de autonomia (sem undo_payload)
        await admin.from("mia_actions").update({
          autonomy_level:    effectiveLevel,
          requires_approval: effectiveLevel !== "piloto",
        }).eq("id", actionId);
      }
    }
    // ── FIM DO MIDDLEWARE ─────────────────────────────────────────────────

    // Marca como executing IMEDIATAMENTE para a Mia poder anunciar "tô mandando".
    // O envio pesado roda em background via EdgeRuntime.waitUntil.
    await admin.from("mia_actions").update({ status: "executing" }).eq("id", actionId);

    const isNav = ["open_conversation", "open_lead", "open_calendar", "open_tasks", "open_report"].includes(action.action_type);
    // Para nav-actions, executa síncrono (é instantâneo).
    if (isNav) {
      const result = { navigation: true, payload: action.payload || {} };
      await admin.from("mia_actions").update({
        status: "executed", result, executed_at: new Date().toISOString(),
      }).eq("id", actionId);
      return new Response(JSON.stringify({ ok: true, action_id: actionId, status: "executed", result }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Background worker — não bloqueia a resposta.
    const worker = (async () => {
      const orgId = action.organization_id;
      const payload = action.payload || {};
      let result: any = null;
      let errMsg: string | null = null;
      try {
        await runActionExecution(admin, action, userId, orgId, payload, actionId).then((r) => { result = r; });
      } catch (e: any) {
        errMsg = e?.message ?? String(e);
      }
      await admin.from("mia_actions").update({
        status: errMsg ? "failed" : "executed",
        result, error_message: errMsg,
        executed_at: errMsg ? null : new Date().toISOString(),
      }).eq("id", actionId);
    })();

    // @ts-ignore — EdgeRuntime existe no Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(worker);
    } else {
      // fallback local: fire-and-forget
      worker.catch((e) => console.error("[mia-execute-action] worker", e));
    }

    return new Response(JSON.stringify({
      ok: true, action_id: actionId, status: "executing",
      message: "Em execução. Você será notificado quando concluir.",
    }), {
      status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });



  } catch (e) {
    console.error("[mia-execute-action] unexpected", e);
    return new Response(JSON.stringify({ error: "internal", message: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function runActionExecution(
  admin: any,
  action: any,
  userId: string,
  orgId: string,
  payload: any,
  actionId: string,
): Promise<any> {
  let result: any = null;
    switch (action.action_type) {
      case "create_task": {
      let assigneeId = payload.assignee_id ?? null;
      if (!assigneeId && payload.assignee_name) {
        assigneeId = await resolveUserByName(admin, orgId, payload.assignee_name);
      }
      if (!assigneeId) {
        throw new Error(`Não encontrei usuário "${payload.assignee_name ?? ""}" na empresa.`);
      }
      const { data: task, error } = await admin.from("tasks").insert({
        user_id: assigneeId,
        title: payload.title ?? "Tarefa criada pela Mia",
        description: payload.description ?? null,
        due_date: payload.due_at ?? null,
        priority: payload.priority ?? "medium",
        status: "pending",
        type: "follow_up",
        created_by: userId,
      }).select("id").single();
      if (error) throw new Error(error.message);
      result = { task_id: task.id, assignee_id: assigneeId };
      break;
      }

      case "schedule_followup": {
      let lead = payload.lead_id ? null : await resolveLeadByName(admin, orgId, payload.lead_name);
      let leadId = payload.lead_id ?? lead?.id;
      if (!leadId) throw new Error(`Não encontrei lead "${payload.lead_name ?? ""}".`);

      if (!lead) {
        const { data } = await admin.from("leads").select("id, name, product_id, phone, email").eq("id", leadId).maybeSingle();
        lead = data;
      }

      const when = payload.when ? new Date(payload.when) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const { data: q, error } = await admin.from("ai_outreach_queue").insert({
        organization_id: orgId,
        lead_id: leadId,
        product_id: lead?.product_id ?? null,
        objective: payload.objective ?? "Follow-up agendado pela Mia",
        extra_context: payload.extra_context ?? null,
        lead_data: lead ? { name: lead.name, phone: lead.phone, email: lead.email } : {},
        status: "scheduled",
        followup_enabled: true,
        followup_interval_hours: 24,
        max_followups: 1,
        followups_sent: 0,
        next_followup_at: when.toISOString(),
      }).select("id").single();
      if (error) throw new Error(error.message);
      result = { queue_id: q.id, scheduled_for: when.toISOString() };
      break;
      }

      case "notify_seller": {
      let sellerId = payload.seller_id ?? null;
      if (!sellerId && payload.seller_name) {
        sellerId = await resolveUserByName(admin, orgId, payload.seller_name);
      }
      if (!sellerId) throw new Error(`Não encontrei vendedor "${payload.seller_name ?? ""}".`);
      const { data: n, error } = await admin.from("notifications").insert({
        user_id: sellerId,
        type: "info",
        title: payload.title ?? "Mensagem da Mia",
        message: payload.message ?? "",
        metadata: { from_mia: true, requested_by: userId },
      }).select("id").single();
      if (error) throw new Error(error.message);
      result = { notification_id: n.id };
      break;
      }

      case "send_whatsapp": {
      const to = payload.to;
      const text = payload.body;
      if (!to || !text) throw new Error("Faltam dados de envio do WhatsApp.");
      const fnName = payload.provider === "meta" ? "meta-whatsapp-send" : "evolution-send";
      const fnBody = payload.provider === "meta"
        ? { organization_id: orgId, connection_id: payload.connection_id, to, type: "text", text }
        : { organization_id: orgId, instance_id: payload.connection_id, type: "text", to, payload: { text } };
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify(fnBody),
      });
      const respBody = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`WhatsApp falhou: ${JSON.stringify(respBody).slice(0, 200)}`);
      result = { provider: payload.provider, response: respBody };
      await admin.from("mia_communications").insert({
        organization_id: orgId, requested_by: userId, action_id: actionId,
        channel: "whatsapp", recipient_type: payload.recipient_type ?? null, recipient_id: payload.recipient_id ?? null,
        recipient_label: payload.recipient_label ?? to, draft: { body: text }, final_message: { body: text, to },
        risk_level: action.risk_level ?? "medium", status: "sent",
        provider_message_id: respBody?.key?.id ?? respBody?.messages?.[0]?.id ?? null,
      });
      break;
      }

      case "send_email": {
      const to = payload.to;
      const subject = payload.subject ?? "Mensagem";
      const html = payload.body_html ?? "";
      if (!to || !html) throw new Error("Faltam dados de envio do e-mail.");
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({
        templateName: "platform-generic",
        recipientEmail: to,
        idempotencyKey: `mia-${actionId}`,
        templateData: { __subject: subject, __html: html, __preview: subject },
        }),
      });
      const respBody = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`E-mail falhou: ${JSON.stringify(respBody).slice(0, 200)}`);
      result = { response: respBody };
      await admin.from("mia_communications").insert({
        organization_id: orgId, requested_by: userId, action_id: actionId,
        channel: "email", recipient_type: payload.recipient_type ?? null, recipient_id: payload.recipient_id ?? null,
        recipient_label: payload.recipient_label ?? to, draft: { subject, body_html: html },
        final_message: { subject, body_html: html, to }, risk_level: action.risk_level ?? "high", status: "sent",
      });
      break;
      }

      case "send_notification": {
      const userIds: string[] = payload.user_ids ?? [];
      if (!userIds.length) throw new Error("Sem destinatários.");
      const rows = userIds.map((uid) => ({
        user_id: uid, type: "info", title: payload.title ?? "Mensagem da Mia",
        message: payload.message ?? "", metadata: { from_mia: true, requested_by: userId, audience: payload.audience },
      }));
      const { error } = await admin.from("notifications").insert(rows);
      if (error) throw new Error(error.message);
      result = { sent: userIds.length };
      await admin.from("mia_communications").insert({
        organization_id: orgId, requested_by: userId, action_id: actionId,
        channel: "notification", recipient_type: payload.audience ?? "user", recipient_id: null,
        recipient_label: payload.audience_label ?? `${userIds.length} usuários`,
        draft: { title: payload.title, message: payload.message }, final_message: { title: payload.title, message: payload.message, user_ids: userIds },
        risk_level: action.risk_level ?? "low", status: "sent",
      });
      break;
      }

      case "send_conversation_message": {
      const conversationId = payload.conversation_id;
      const provider = payload.provider as "evolution" | "meta" | "instagram";
      const to = payload.to;
      const text = payload.body;
      if (!conversationId || !to || !text) throw new Error("Faltam dados da conversa/mensagem.");

      let fnName = "evolution-send";
      let fnBody: any = { organization_id: orgId, instance_id: payload.evolution_instance_id, type: "text", to, payload: { text } };
      if (provider === "meta") {
        fnName = "meta-whatsapp-send";
        // meta-whatsapp-send insere em webchat_messages quando recebe conversation_id
        fnBody = { organization_id: orgId, connection_id: payload.meta_connection_id, conversation_id: conversationId, to, type: "text", text };
      } else if (provider === "instagram") {
        fnName = "instagram-send";
        fnBody = { organization_id: orgId, connection_id: payload.instagram_connection_id, conversation_id: conversationId, recipient_id: payload.ig_sender_id, type: "text", text };
      }
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify(fnBody),
      });
      const respBody = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`Envio falhou: ${JSON.stringify(respBody).slice(0, 200)}`);

      const providerMsgId = respBody?.meta_message_id
        ?? respBody?.key?.id
        ?? respBody?.body?.key?.id
        ?? respBody?.body?.data?.Info?.ID
        ?? respBody?.messages?.[0]?.id
        ?? respBody?.message_id
        ?? null;

      // Para evolution precisamos inserir manualmente em webchat_messages
      // (a evolution-send não escreve no inbox). Meta/Instagram já inserem.
      if (provider === "evolution") {
        await admin.from("webchat_messages").insert({
        conversation_id: conversationId,
        direction: "outbound",
        sender_type: "agent",
        sender_id: userId,
        content: text,
        content_type: "text",
        message_type: "text",
        delivery_status: "sent",
        meta_message_id: providerMsgId,
        metadata: { sent_via_mia: true, action_id: actionId },
        });
        await admin.from("webchat_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
      }

      result = { provider, conversation_id: conversationId, response: respBody, provider_message_id: providerMsgId };
      await admin.from("mia_communications").insert({
        organization_id: orgId, requested_by: userId, action_id: actionId,
        channel: provider, recipient_type: "lead", recipient_id: payload.recipient_id ?? null,
        recipient_label: payload.recipient_label ?? to,
        draft: { body: text }, final_message: { body: text, to, conversation_id: conversationId, sent_via_mia: true },
        risk_level: action.risk_level ?? "medium", status: "sent",
        provider_message_id: providerMsgId,
      });
      break;
      }

      case "assign_conversation": {
      const conversationId = payload.conversation_id;
      const toUserId = payload.to_user_id;
      const fromUserId = payload.from_user_id ?? null;
      if (!conversationId || !toUserId) throw new Error("Faltam dados de atribuição.");
      // Trigger enforce_single_attendant cuida de zerar agente IA quando seta humano
      const { error: updErr } = await admin.from("webchat_conversations")
        .update({ assigned_user_id: toUserId, status: "human_active", accepted_by: toUserId, accepted_at: new Date().toISOString(), current_agent_id: null })
        .eq("id", conversationId).eq("organization_id", orgId);
      if (updErr) throw new Error(updErr.message);
      await admin.from("webchat_assignment_events").insert({
        conversation_id: conversationId, from_user_id: fromUserId, to_user_id: toUserId,
        action: fromUserId ? "transferred" : "assigned",
      });
      if (fromUserId && fromUserId !== toUserId) {
        await admin.from("conversation_transfers").insert({
        conversation_id: conversationId, from_user_id: fromUserId, to_user_id: toUserId,
        created_by: userId, internal_note: "Atribuída via Mia",
        });
      }
      result = { conversation_id: conversationId, assigned_to: toUserId };
      break;
      }

      case "transfer_sector": {
      const conversationId = payload.conversation_id;
      const sectorId = payload.sector_id;
      if (!conversationId || !sectorId) throw new Error("Faltam dados do setor.");
      const { error: updErr } = await admin.from("webchat_conversations")
        .update({ sector_id: sectorId })
        .eq("id", conversationId).eq("organization_id", orgId);
      if (updErr) throw new Error(updErr.message);
      await admin.from("conversation_transfers").insert({
        conversation_id: conversationId, from_user_id: payload.from_user_id ?? null, to_queue_id: sectorId,
        created_by: userId, internal_note: "Setor alterado via Mia",
      });
      result = { conversation_id: conversationId, sector_id: sectorId };
      break;
      }

      case "close_conversation": {
      const conversationId = payload.conversation_id;
      if (!conversationId) throw new Error("Sem conversation_id.");
      const { error: updErr } = await admin.from("webchat_conversations")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", conversationId).eq("organization_id", orgId);
      if (updErr) throw new Error(updErr.message);
      if (payload.reason) {
        await admin.from("conversation_notes").insert({
        conversation_id: conversationId, user_id: userId,
        content: `[Mia · encerramento] ${payload.reason}`,
        }).then(() => {}).catch(() => {});
      }
      result = { conversation_id: conversationId, closed: true };
      break;
      }

      case "takeover_from_agent": {
      const conversationId = payload.conversation_id;
      if (!conversationId) throw new Error("Sem conversation_id.");
      const toUserId = payload.to_user_id ?? null;
      const update: any = toUserId
        ? { current_agent_id: null, assigned_user_id: toUserId, status: "human_active", accepted_by: toUserId, accepted_at: new Date().toISOString() }
        : { current_agent_id: null, status: "waiting_human" };
      const { error: updErr } = await admin.from("webchat_conversations")
        .update(update).eq("id", conversationId).eq("organization_id", orgId);
      if (updErr) throw new Error(updErr.message);
      await admin.from("agent_handoff_history").insert({
        organization_id: orgId, conversation_id: conversationId,
        from_agent_id: payload.from_agent_id ?? null, to_agent_id: null,
        reason: "Takeover via Mia", context: { requested_by: userId, to_user_id: toUserId },
      }).then(() => {}).catch(() => {});
      result = { conversation_id: conversationId, taken: true, to_user_id: toUserId };
      break;
      }

      case "handback_to_agent": {
      const conversationId = payload.conversation_id;
      const toAgentId = payload.to_agent_id;
      if (!conversationId || !toAgentId) throw new Error("Faltam dados de handback.");
      const { error: updErr } = await admin.from("webchat_conversations")
        .update({ current_agent_id: toAgentId, assigned_user_id: null, status: "bot_active" })
        .eq("id", conversationId).eq("organization_id", orgId);
      if (updErr) throw new Error(updErr.message);
      await admin.from("agent_handoff_history").insert({
        organization_id: orgId, conversation_id: conversationId,
        from_agent_id: null, to_agent_id: toAgentId,
        reason: "Handback via Mia", context: { requested_by: userId, from_user_id: payload.from_user_id ?? null },
      }).then(() => {}).catch(() => {});
      result = { conversation_id: conversationId, agent_id: toAgentId };
      break;
      }

      case "reschedule_booking": {
      const eventId = payload.event_id;
      const newStart = payload.new_start;
      const newEnd = payload.new_end;
      if (!eventId || !newStart || !newEnd) throw new Error("Faltam dados de remarcação.");
      const { error } = await admin.from("calendar_events")
        .update({ start_time: newStart, end_time: newEnd, sync_status: "pending_sync" })
        .eq("id", eventId).eq("organization_id", orgId);
      if (error) throw new Error(error.message);
      result = { event_id: eventId, rescheduled_to: newStart };
      break;
      }

      case "cancel_booking": {
      const eventId = payload.event_id;
      if (!eventId) throw new Error("Sem event_id.");
      const { error } = await admin.from("calendar_events")
        .update({ status: "cancelled", sync_status: "pending_sync" })
        .eq("id", eventId).eq("organization_id", orgId);
      if (error) throw new Error(error.message);
      result = { event_id: eventId, cancelled: true };
      break;
      }

      case "open_conversation":
      case "open_lead":
      case "open_calendar":
      case "open_tasks":
      case "open_report":
      // Apenas marca como executada — navegação é responsabilidade do frontend
      result = { navigation: true, payload };
      break;

      case "create_lead": {
        const { data: lead, error } = await admin.from("leads").insert({
          organization_id: orgId,
          name:         payload.name,
          email:        payload.email        ?? null,
          phone:        payload.phone        ?? null,
          company:      payload.company      ?? null,
          source:       payload.source       ?? "mia",
          temperature:  payload.temperature  ?? "cold",
          product_id:   payload.product_id   ?? null,
          assigned_to:  payload.assigned_to  ?? null,
          created_by:   userId,
        }).select("id").single();
        if (error) throw new Error(error.message);
        if (payload.notes) {
          await admin.from("lead_notes").insert({ lead_id: lead.id, user_id: userId, content: payload.notes })
            .then(() => {}).catch(() => {});
        }
        result = { lead_id: lead.id };
        break;
      }

      case "update_lead_stage": {
        const { error } = await admin.from("leads")
          .update({ current_stage_id: payload.stage_id, updated_at: new Date().toISOString() })
          .eq("id", payload.lead_id).eq("organization_id", orgId);
        if (error) throw new Error(error.message);
        await admin.from("lead_stage_history").insert({
          lead_id: payload.lead_id, stage_id: payload.stage_id, changed_by: userId,
        }).then(() => {}).catch(() => {});
        result = { lead_id: payload.lead_id, stage_id: payload.stage_id };
        break;
      }

      case "update_lead_temperature": {
        const { error } = await admin.from("leads")
          .update({ temperature: payload.temperature, updated_at: new Date().toISOString() })
          .eq("id", payload.lead_id).eq("organization_id", orgId);
        if (error) throw new Error(error.message);
        result = { lead_id: payload.lead_id, temperature: payload.temperature };
        break;
      }

      case "create_note": {
        const { data: note, error } = await admin.from("lead_notes").insert({
          lead_id: payload.lead_id, user_id: userId, content: payload.content,
        }).select("id").single();
        if (error) throw new Error(error.message);
        result = { note_id: note.id, lead_id: payload.lead_id };
        break;
      }

      case "create_calendar_event": {
        const { data: ev, error } = await admin.from("calendar_events").insert({
          organization_id: orgId,
          title:       payload.title,
          description: payload.description ?? null,
          start_time:  payload.start_time,
          end_time:    payload.end_time,
          location:    payload.location    ?? null,
          lead_id:     payload.lead_id     ?? null,
          user_id:     payload.user_id     ?? userId,
          event_type:  payload.event_type  ?? "reuniao",
          status:      "scheduled",
          created_by:  userId,
        }).select("id").single();
        if (error) throw new Error(error.message);
        result = { event_id: ev.id };
        break;
      }

      case "charge_overdue_task": {
        // Notifica o responsável pela tarefa atrasada (notificação interna)
        const targetUserId = payload.responsible_id;
        const taskTitle    = payload.task_title ?? "Tarefa";
        const daysOverdue  = payload.days_overdue ?? 0;
        if (!targetUserId) throw new Error("responsible_id ausente no payload");
        const { error } = await admin.from("notifications").insert({
          user_id:  targetUserId,
          type:     "warning",
          title:    `Tarefa atrasada ${daysOverdue > 0 ? `(${daysOverdue}d)` : ""}`,
          message:  `"${taskTitle}" está atrasada. Por favor, atualize o status ou entre em contato com o gestor.`,
          metadata: { from_mia: true, action_id: actionId, task_id: payload.task_id },
        });
        if (error) throw new Error(error.message);
        result = { notified: targetUserId, task_id: payload.task_id, days_overdue: daysOverdue };
        break;
      }

      default:
      throw new Error(`Tipo de ação não suportado: ${action.action_type}`);
    }
  return result;
}
