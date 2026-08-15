import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type FormOptionAction =
  | { type: 'redirect'; url: string; new_tab?: boolean }
  | { type: 'add_tags'; tag_ids: string[] }
  | { type: 'start_ai_agent'; agent_id: string }
  | { type: 'start_ai_outreach'; agent_id: string; objective?: string }
  | { type: 'open_calendar'; event_type_id: string; ask_email?: boolean }
  | { type: 'assign_sector'; sector_id: string }
  | { type: 'assign_user'; user_id: string; as?: 'human' | 'closer' | 'sdr' }
  | { type: 'go_to_block'; target_block_id: string }
  | {
      type: 'set_custom_field';
      field_key: string;
      value_source: 'option_label' | 'option_value' | 'static';
      static_value?: string;
      _value?: string;
    };

interface SelectedOption {
  block_id: string;
  block_label: string;
  option_value: string;
  option_label: string;
  triggered_actions: string[];
}

interface SubmitRequest {
  form_id: string;
  responses: Record<string, unknown>;
  selected_actions?: FormOptionAction[];
  selected_options?: SelectedOption[];
  internal?: boolean;
  tracking?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    referrer_url?: string;
    landing_page?: string;
    user_agent?: string;
    fbclid?: string;
    gclid?: string;
    ttclid?: string;
    li_fat_id?: string;
    fbc?: string;
    fbp?: string;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { form_id, responses, tracking = {}, selected_actions = [], selected_options = [], internal = false }: SubmitRequest = await req.json();

    if (!form_id) {
      return new Response(JSON.stringify({ error: 'form_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Internal submissions (mobile app "Cadastrar cliente") require authenticated user.
    // The lead is attributed to that user and skips public-only side effects (UTMs, auto-dispatch).
    let internalUserId: string | null = null;
    let internalUserOrgId: string | null = null;
    if (internal) {
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) {
        return new Response(JSON.stringify({ error: 'Internal submission requires authentication' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      internalUserId = userData.user.id;
      const { data: prof } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', internalUserId)
        .maybeSingle();
      internalUserOrgId = (prof as any)?.organization_id || null;
    }


    // Helpers
    const normalizePhoneDigits = (raw: unknown): string => {
      let d = String(raw ?? '').replace(/\D/g, '');
      if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
      return d;
    };
    const isValidBRPhone = (raw: unknown): boolean => {
      const d = normalizePhoneDigits(raw);
      return d.length === 10 || d.length === 11;
    };
    const isEmpty = (v: unknown) =>
      v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

    // 1. Fetch form with product
    const { data: form, error: formError } = await supabase
      .from('forms')
      .select('*, products(*)')
      .eq('id', form_id)
      .eq('status', 'active')
      .single();

    if (formError || !form) {
      console.error('Form not found:', formError);
      return new Response(JSON.stringify({ error: 'Form not found or inactive' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (internal && internalUserOrgId && internalUserOrgId !== form.organization_id) {
      return new Response(JSON.stringify({ error: 'Form does not belong to your organization' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch form blocks for scoring and mapping
    const { data: blocks } = await supabase
      .from('form_blocks')
      .select('*')
      .eq('form_id', form_id)
      .order('order_index');

    // 2.1 Server-side validation: required + phone/email format
    const missing: string[] = [];
    let invalidPhoneLabel: string | null = null;
    let invalidEmailLabel: string | null = null;
    const skipTypes = new Set([
      'welcome_screen', 'end_screen', 'image', 'video_upload',
      'video_embed', 'carousel', 'divider', 'hidden_field',
      'conditional', 'score', 'tag',
    ]);
    for (const b of blocks || []) {
      if (skipTypes.has(b.block_type)) continue;
      const v = responses?.[b.id];
      const empty = isEmpty(v);
      if (b.required && empty) {
        missing.push(b.label || b.id);
        continue;
      }
      if (!empty && b.block_type === 'phone' && !isValidBRPhone(v)) {
        invalidPhoneLabel = b.label || 'WhatsApp';
      }
      if (!empty && b.block_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim())) {
        invalidEmailLabel = b.label || 'E-mail';
      }
    }
    if (missing.length) {
      return new Response(JSON.stringify({ error: `Campos obrigatórios não respondidos: ${missing.join(', ')}`, missing }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (invalidPhoneLabel) {
      return new Response(JSON.stringify({ error: `WhatsApp inválido em "${invalidPhoneLabel}". Use DDD + número.` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (invalidEmailLabel) {
      return new Response(JSON.stringify({ error: `E-mail inválido em "${invalidEmailLabel}".` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // 3. Create a map of block ID to label for readable responses
    const blockLabels: Record<string, string> = {};
    for (const block of blocks || []) {
      if (block.label) {
        blockLabels[block.id] = block.label;
      }
    }

    // 4. Transform responses to use labels instead of UUIDs
    const responsesWithLabels: Record<string, unknown> = {};
    for (const [blockId, value] of Object.entries(responses)) {
      const label = blockLabels[blockId] || blockId;
      responsesWithLabels[label] = value;
    }

    // 5. Calculate score and collect tags
    let totalScore = 0;
    const legacyTagNames: string[] = [];           // legacy apply_tags strings
    const addTagIds = new Set<string>();           // resolved CRM tag IDs to assign
    const removeTagIds = new Set<string>();        // CRM tag IDs to remove
    let finalStageId: string | null = null;        // last set_stage_id wins
    let finalTemperature: string | null = null;    // last set_temperature wins
    const customFields: Record<string, unknown> = {};
    const leadData: Record<string, string> = {};

    // Helper: evaluate a `when` condition against a response value
    const matchWhen = (
      when: { operator: string; value?: unknown } | undefined,
      value: unknown,
    ): boolean => {
      if (!when || when.operator === 'any') return value !== undefined && value !== null && value !== '';
      const v = value;
      const target = when.value;
      switch (when.operator) {
        case 'equals':
          if (Array.isArray(v)) return v.map(String).includes(String(target));
          return String(v ?? '') === String(target ?? '');
        case 'contains':
          if (Array.isArray(v)) return v.map(String).some((x) => x.includes(String(target ?? '')));
          return String(v ?? '').toLowerCase().includes(String(target ?? '').toLowerCase());
        case 'gte':
          return Number(v) >= Number(target);
        case 'lte':
          return Number(v) <= Number(target);
        default:
          return false;
      }
    };

    for (const block of blocks || []) {
      const responseValue = responses[block.id];
      const answered = responseValue !== undefined && responseValue !== null && responseValue !== '';

      // Static score
      if (block.score_value) totalScore += block.score_value;

      // Legacy score_rules
      if (block.score_rules && Array.isArray(block.score_rules)) {
        for (const rule of block.score_rules) {
          if (rule.value !== undefined && responseValue === rule.value) totalScore += rule.score || 0;
          else if (rule.min !== undefined && typeof responseValue === 'number') {
            if (responseValue >= rule.min && (!rule.max || responseValue <= rule.max)) totalScore += rule.score || 0;
          }
        }
      }

      // ----- Per-option / per-answer scoring -----
      const bs = (block.block_settings || {}) as Record<string, any>;
      if (answered) {
        if (block.block_type === 'select' || block.block_type === 'multi_select') {
          const opts = Array.isArray(block.options) ? (block.options as any[]) : [];
          const chosenValues = Array.isArray(responseValue)
            ? responseValue.map((v: any) => String(v))
            : [String(responseValue)];
          for (const opt of opts) {
            if (chosenValues.includes(String(opt?.value)) && Number.isFinite(Number(opt?.score))) {
              totalScore += Number(opt.score) || 0;
            }
          }
        } else if (block.block_type === 'yes_no') {
          const v = String(responseValue).toLowerCase();
          const isYes = v === 'true' || v === 'sim' || v === 'yes' || v === '1';
          const isNo = v === 'false' || v === 'não' || v === 'nao' || v === 'no' || v === '0';
          if (isYes && Number.isFinite(Number(bs.score_yes))) totalScore += Number(bs.score_yes) || 0;
          if (isNo && Number.isFinite(Number(bs.score_no))) totalScore += Number(bs.score_no) || 0;
        } else if (block.block_type === 'scale') {
          const per = Number(bs.score_per_point);
          const val = Number(responseValue);
          if (Number.isFinite(per) && Number.isFinite(val)) totalScore += per * val;
        }
      }

      // Legacy apply_tags (string names)
      if (block.apply_tags && Array.isArray(block.apply_tags)) legacyTagNames.push(...block.apply_tags);

      // Lead field mapping
      if (block.maps_to && answered) {
        leadData[block.maps_to] = block.block_type === 'phone'
          ? normalizePhoneDigits(responseValue)
          : String(responseValue);
      }

      // ----- Phase 2: CRM automations from block_settings.crm -----
      const crm = (block.block_settings || {}).crm || {};

      // Custom field
      if (crm.custom_field_key && answered) {
        customFields[String(crm.custom_field_key)] = responseValue;
      }

      // Always-on actions when block was answered
      if (answered) {
        (crm.add_tag_ids || []).forEach((id: string) => addTagIds.add(id));
        if (crm.set_stage_id) finalStageId = crm.set_stage_id;
        if (crm.set_temperature) finalTemperature = crm.set_temperature;
      }

      // Conditional automations
      if (Array.isArray(crm.automations)) {
        for (const rule of crm.automations) {
          if (!matchWhen(rule.when, responseValue)) continue;
          (rule.add_tag_ids || []).forEach((id: string) => addTagIds.add(id));
          (rule.remove_tag_ids || []).forEach((id: string) => removeTagIds.add(id));
          if (rule.set_stage_id) finalStageId = rule.set_stage_id;
          if (rule.set_temperature) finalTemperature = rule.set_temperature;
          if (rule.add_score) totalScore += rule.add_score;
        }
      }
    }

    // Form-level submit tags (applied on every submission)
    const submitTagIds: string[] = Array.isArray((form.settings as any)?.submit_tag_ids)
      ? (form.settings as any).submit_tag_ids.filter((x: unknown) => typeof x === 'string' && x)
      : [];
    submitTagIds.forEach((id) => addTagIds.add(id));

    // Resolve legacy tag names → IDs (lookup or create within org)
    if (legacyTagNames.length > 0) {
      const uniq = Array.from(new Set(legacyTagNames.map((t) => t.trim()).filter(Boolean)));
      const { data: existing } = await supabase
        .from('lead_tags')
        .select('id, name')
        .eq('organization_id', form.organization_id)
        .in('name', uniq);
      const byName = new Map((existing || []).map((t: any) => [t.name.toLowerCase(), t.id]));
      for (const name of uniq) {
        const id = byName.get(name.toLowerCase());
        if (id) {
          addTagIds.add(id);
        } else {
          const { data: created } = await supabase
            .from('lead_tags')
            .insert({ organization_id: form.organization_id, name, color: '#6B7280' })
            .select('id')
            .single();
          if (created?.id) addTagIds.add(created.id);
        }
      }
    }

    // 3.b Heurística: se algum campo essencial (name/email/phone) não foi mapeado via maps_to,
    // procurar pelo label do bloco (ex: "Qual seu nome completo?") OU pela chave do response.
    const matchLabel = (label: string, keywords: string[]) => {
      const l = (label || '').toLowerCase();
      return keywords.some((k) => l.includes(k));
    };
    const findByLabelOrResponseKey = (keywords: string[], typeMatch?: (t: string) => boolean): string | null => {
      const b = (blocks || []).find((b: any) => {
        const okType = typeMatch ? typeMatch(b.block_type) : true;
        return okType && matchLabel(b.label, keywords) && responses[b.id];
      });
      if (b) return String(responses[b.id]);
      // Fallback: chave do response (caso o body já venha com labels/aliases)
      const key = Object.keys(responses).find((k) => matchLabel(k, keywords));
      return key && responses[key] != null ? String(responses[key]) : null;
    };
    if (!leadData.name) {
      const v = findByLabelOrResponseKey(['nome', 'name'], (t) => ['short_text', 'long_text', 'text'].includes(t));
      if (v) leadData.name = v.trim();
    }
    if (!leadData.email) {
      const v = findByLabelOrResponseKey(['email', 'e-mail'], (t) => t === 'email' || t === 'short_text' || t === 'text');
      if (v) leadData.email = v.trim();
    }
    if (!leadData.phone) {
      const v = findByLabelOrResponseKey(['whatsapp', 'telefone', 'phone', 'celular'], (t) => t === 'phone' || t === 'short_text' || t === 'text');
      if (v) leadData.phone = normalizePhoneDigits(v);
    }

    // ---- Per-option actions (selected_actions from the client) ----
    // Process tag/agent/sector/user assignments + build redirect override (open_calendar/redirect).
    let overrideRedirectUrl: string | null = null;
    let overrideRedirectNewTab = false;
    let actionAgentId: string | null = null;
    let actionSectorId: string | null = null;
    let actionAssignedUserId: string | null = null;
    let actionSdrId: string | null = null;
    let actionCloserId: string | null = null;
    let openCalendarAction: Extract<FormOptionAction, { type: 'open_calendar' }> | null = null;
    let outreachAgentId: string | null = null;
    let outreachObjective: string | null = null;

    for (const a of selected_actions || []) {
      if (!a || typeof a !== 'object') continue;
      switch (a.type) {
        case 'add_tags':
          (a.tag_ids || []).forEach((id) => id && addTagIds.add(id));
          break;
        case 'assign_sector':
          if (a.sector_id) actionSectorId = a.sector_id;
          break;
        case 'assign_user':
          if (a.user_id) {
            if (a.as === 'sdr') actionSdrId = a.user_id;
            else if (a.as === 'closer') actionCloserId = a.user_id;
            else actionAssignedUserId = a.user_id;
          }
          break;
        case 'start_ai_agent':
          if (a.agent_id) actionAgentId = a.agent_id;
          break;
        case 'start_ai_outreach':
          if (a.agent_id) {
            outreachAgentId = a.agent_id;
            outreachObjective = a.objective || null;
          }
          break;
        case 'redirect':
          if (a.url) {
            overrideRedirectUrl = a.url;
            overrideRedirectNewTab = !!a.new_tab;
          }
          break;
        case 'open_calendar':
          if (a.event_type_id) openCalendarAction = a;
          break;
        case 'set_custom_field':
          if (a.field_key) {
            const v = a._value !== undefined
              ? a._value
              : (a.value_source === 'static' ? (a.static_value ?? '') : '');
            if (v !== '' && v !== undefined && v !== null) {
              customFields[a.field_key] = v;
            }
          }
          break;
      }
    }

    // Resolve open_calendar -> /agendar/<userSlug>/<eventSlug>?name=...&email=...&phone=...
    if (openCalendarAction) {
      const { data: et } = await supabase
        .from('booking_event_types')
        .select('id, slug, user_id, organization_id')
        .eq('id', openCalendarAction.event_type_id)
        .eq('organization_id', form.organization_id)
        .maybeSingle();
      if (et?.user_id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('booking_slug')
          .eq('id', et.user_id)
          .maybeSingle();
        if (prof?.booking_slug && et.slug) {
          const origin = (tracking.landing_page || '').match(/^https?:\/\/[^/]+/i)?.[0] || '';
          const qs = new URLSearchParams();
          if (leadData.name) qs.set('name', leadData.name);
          if (leadData.email) qs.set('email', leadData.email);
          if (leadData.phone) qs.set('phone', leadData.phone);
          qs.set('prefill', '1');
          overrideRedirectUrl = `${origin}/agendar/${prof.booking_slug}/${et.slug}?${qs.toString()}`;
          overrideRedirectNewTab = false;
        }
      }
    }

    // 4. Determine lead distribution
    let assigned_to: string | null = null;
    let squad_id: string | null = form.assigned_squad_id;
    let useAutoDispatch = false;

    switch (form.distribution_rule) {
      case 'user':
        assigned_to = form.assigned_user_id;
        break;


      case 'squad':
        squad_id = form.assigned_squad_id;
        useAutoDispatch = true;
        break;

      case 'round_robin':
        if (form.assigned_squad_id) {
          squad_id = form.assigned_squad_id;
          useAutoDispatch = true;
        } else {
          const config = form.round_robin_config || { users: [], current_index: 0 };
          if (config.users && config.users.length > 0) {
            assigned_to = config.users[config.current_index % config.users.length];
            await supabase
              .from('forms')
              .update({
                round_robin_config: {
                  ...config,
                  current_index: (config.current_index + 1) % config.users.length,
                },
              })
              .eq('id', form_id);
          }
        }
        break;

      case 'manual':
      default:
        break;
    }

    // Per-option assignment actions OVERRIDE form defaults
    if (actionAssignedUserId) {
      assigned_to = actionAssignedUserId;
      useAutoDispatch = false;
    }

    // Internal manual-app submissions: attribute the lead to the logged-in seller.
    if (internal && internalUserId) {
      assigned_to = internalUserId;
      useAutoDispatch = false;
    }

    // 5. Get first pipeline stage as fallback
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('product_id', form.product_id)
      .order('order_index')
      .limit(1)
      .single();

    const targetStageId = finalStageId || firstStage?.id || null;

    // Apply temperature thresholds from form settings when no explicit set_temperature was triggered.
    const thresholds = (form.settings as any)?.temperature_thresholds;
    const warmMin = Number(thresholds?.warm_min);
    const hotMin = Number(thresholds?.hot_min);
    const classifyByScore = (score: number): string | null => {
      if (!Number.isFinite(warmMin) || !Number.isFinite(hotMin)) return null;
      if (score >= hotMin) return 'hot';
      if (score >= warmMin) return 'warm';
      return 'cold';
    };
    const targetTemperature =
      finalTemperature || classifyByScore(totalScore) || form.default_temperature || 'warm';

    // 6. Upsert lead — match by email/phone within org
    let leadId: string | null = null;
    const settings = form.settings || {};

    if (settings.auto_create_lead !== false) {
      // Try to find an existing lead by email OR by phone (matching only digits,
      // since stored phones may be formatted like "(48) 99652-0589")
      let existingLead: any = null;
      const phoneDigits = leadData.phone ? normalizePhoneDigits(leadData.phone) : '';
      // Last 9 digits are enough to find candidates regardless of stored format
      const phoneSuffix = phoneDigits.length >= 9 ? phoneDigits.slice(-9) : phoneDigits;

      if (leadData.email || phoneSuffix) {
        // Fetch candidates: exact email match OR phone containing the suffix
        let query = supabase
          .from('leads')
          .select('*')
          .eq('organization_id', form.organization_id)
          .order('created_at', { ascending: false })
          .limit(20);

        const orClauses: string[] = [];
        if (leadData.email) orClauses.push(`email.eq.${leadData.email}`);
        if (phoneSuffix) orClauses.push(`phone.ilike.%${phoneSuffix}%`);
        query = query.or(orClauses.join(','));

        const { data: found } = await query;
        // Confirm phone match by comparing digit-only strings
        existingLead = (found || []).find((l: any) => {
          if (leadData.email && l.email && l.email.toLowerCase() === leadData.email.toLowerCase()) return true;
          if (phoneDigits && l.phone && normalizePhoneDigits(l.phone) === phoneDigits) return true;
          return false;
        }) || null;
      }


      // Accumulate score across submissions: existing lead score + delta from this submission
      const previousScore = Number((existingLead as any)?.score) || 0;
      const accumulatedScore = previousScore + totalScore;
      // Reclassify temperature based on the accumulated score (unless explicitly overridden)
      const accumulatedTemperature =
        finalTemperature || classifyByScore(accumulatedScore) || form.default_temperature || 'warm';

      const mergedMetadata = {
        ...(existingLead?.metadata || {}),
        form_id: form.id,
        form_name: form.name,
        form_responses: { ...((existingLead?.metadata || {}).form_responses || {}), ...responsesWithLabels },
        form_score: totalScore,
        form_selected_options: selected_options,
        custom_fields: {
          ...(((existingLead?.metadata || {}).custom_fields) || {}),
          ...customFields,
        },
      };

      if (existingLead) {
        const patch: Record<string, unknown> = {
          name: leadData.name || existingLead.name,
          email: leadData.email || existingLead.email,
          phone: leadData.phone || existingLead.phone,
          company: leadData.company || existingLead.company,
          position: leadData.position || existingLead.position,
          notes: leadData.notes || existingLead.notes,
          temperature: accumulatedTemperature,
          score: accumulatedScore,
          metadata: mergedMetadata,
        };
        if (targetStageId) patch.current_stage_id = targetStageId;
        if (actionAssignedUserId) patch.assigned_to = actionAssignedUserId;
        if (actionSdrId) patch.sdr_id = actionSdrId;
        if (actionCloserId) patch.closer_id = actionCloserId;
        if (actionSectorId) patch.sector_id = actionSectorId;

        const { data: updated, error: updateError } = await supabase
          .from('leads')
          .update(patch)
          .eq('id', existingLead.id)
          .select()
          .single();
        if (updateError) console.error('Error updating lead:', updateError);
        leadId = (updated?.id as string) || existingLead.id;
      } else {
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .insert({
            organization_id: form.organization_id,
            product_id: form.product_id,
            name: leadData.name || leadData.email || 'Lead sem nome',
            email: leadData.email || null,
            phone: leadData.phone || null,
            company: leadData.company || null,
            position: leadData.position || null,
            notes: leadData.notes || null,
            temperature: accumulatedTemperature,
            score: accumulatedScore,
            lead_origin: internal ? 'manual_app' : 'form',
            lead_channel: internal ? 'manual' : 'website',
            source: internal ? `Cadastro manual: ${form.name}` : `Formulário: ${form.name}`,
            current_stage_id: targetStageId,
            assigned_to,
            squad_id,
            utm_source: tracking.utm_source || null,
            utm_medium: tracking.utm_medium || null,
            utm_campaign: tracking.utm_campaign || null,
            utm_term: tracking.utm_term || null,
            utm_content: tracking.utm_content || null,
            referrer_url: tracking.referrer_url || null,
            landing_page: tracking.landing_page || null,
            user_agent: tracking.user_agent || null,
            fbc: tracking.fbc || null,
            fbp: tracking.fbp || null,
            fbclid: tracking.fbclid || null,
            client_ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null,
            metadata: mergedMetadata,
            ...(actionSectorId ? { sector_id: actionSectorId } : {}),
            ...(actionSdrId ? { sdr_id: actionSdrId } : {}),
            ...(actionCloserId ? { closer_id: actionCloserId } : {}),
          })
          .select()
          .single();

        if (leadError) {
          console.error('Error creating lead:', leadError);
        } else {
          leadId = lead?.id || null;
        }
      }

      if (leadId) {
        // Persist start_ai_agent choice on the lead metadata so the next conversation routes to it.
        if (actionAgentId) {
          try {
            await supabase.rpc('jsonb_merge_lead_metadata', { p_lead_id: leadId, p_patch: { assigned_agent_id: actionAgentId } });
          } catch {
            // Fallback: read-modify-write
            const { data: cur } = await supabase.from('leads').select('metadata').eq('id', leadId).maybeSingle();
            const md = (cur?.metadata as Record<string, unknown>) || {};
            await supabase.from('leads').update({ metadata: { ...md, assigned_agent_id: actionAgentId } }).eq('id', leadId);
          }
        }

        // Apply tags
        if (addTagIds.size > 0) {
          const rows = Array.from(addTagIds).map((tagId) => ({
            lead_id: leadId,
            tag_id: tagId,
            source: 'form',
          }));
          const { error: tagErr } = await supabase
            .from('lead_tag_assignments')
            .upsert(rows, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true });
          if (tagErr) console.warn('[form-submit] tag assign error:', tagErr.message);
        }
        if (removeTagIds.size > 0) {
          await supabase
            .from('lead_tag_assignments')
            .delete()
            .eq('lead_id', leadId)
            .in('tag_id', Array.from(removeTagIds));
        }

        // Auto Dispatch only on brand-new leads without assignee
        if (!existingLead && useAutoDispatch && squad_id) {
          try {
            const { data: assignedUserId } = await supabase.rpc('distribute_lead', {
              p_lead_id: leadId,
              p_squad_id: squad_id,
              p_organization_id: form.organization_id,
              p_product_id: form.product_id,
            });
            console.log(`[AutoDispatch] Lead ${leadId} -> User ${assignedUserId || 'queued'}`);
          } catch (e) {
            console.warn('[AutoDispatch] Distribution failed:', e);
          }
        }

        // Interaction record — include readable trail of which option triggered which actions
        const optionsTrail = (selected_options || [])
          .map((o) => {
            const actsLabel = (o.triggered_actions || []).length
              ? ` → ${o.triggered_actions.join(', ')}`
              : '';
            return `• ${o.block_label || 'Pergunta'}: "${o.option_label}"${actsLabel}`;
          })
          .join('\n');
        const interactionContent = optionsTrail
          ? `Formulário preenchido: ${form.name}\n\nEscolhas:\n${optionsTrail}`
          : `Formulário preenchido: ${form.name}`;
        await supabase
          .from('interactions')
          .insert({
            lead_id: leadId,
            channel: 'other',
            direction: 'inbound',
            content: interactionContent,
            metadata: {
              type: 'form_submission',
              form_id: form.id,
              score: totalScore,
              applied_tag_ids: Array.from(addTagIds),
              stage_id: targetStageId,
              temperature: targetTemperature,
              selected_options,
            },
          });


        // Auto-enroll in post-submit cadence (fire-and-forget)
        if ((form as any).post_cadence_id) {
          try {
            const supabaseUrl2 = Deno.env.get('SUPABASE_URL')!;
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            fetch(`${supabaseUrl2}/functions/v1/cadence-enroll`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({
                cadence_id: (form as any).post_cadence_id,
                lead_ids: [leadId],
                source: 'form',
                source_ref: { form_id: form.id, form_name: form.name },
              }),
            }).catch((e) => console.error('[form-submit] cadence-enroll non-fatal:', e));
          } catch (e) {
            console.error('[form-submit] cadence-enroll wrap non-fatal:', e);
          }
        }

        // Proactive WhatsApp outreach by AI agent (start_ai_outreach action)
        if (outreachAgentId && leadData.phone) {
          try {
            const supabaseUrl2 = Deno.env.get('SUPABASE_URL')!;
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            // Build a readable form-context string for the AI prompt
            const optionsTrail = (selected_options || [])
              .map((o) => `• ${o.block_label || 'Pergunta'}: "${o.option_label}"`)
              .join('\n');
            const respLines = Object.entries(responses || {})
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .slice(0, 20)
              .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
              .join('\n');
            const extraContext = [
              `Lead acabou de preencher o formulário "${form.name}".`,
              optionsTrail ? `\nOpção(ões) escolhida(s):\n${optionsTrail}` : '',
              respLines ? `\nRespostas:\n${respLines}` : '',
            ].filter(Boolean).join('\n');

            fetch(`${supabaseUrl2}/functions/v1/manual-outreach`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({
                lead_ids: [leadId],
                agent_id: outreachAgentId,
                organization_id: form.organization_id,
                objective: outreachObjective || `Continuar a conversa iniciada no formulário "${form.name}" e ajudar o lead pelo WhatsApp.`,
                extra_context: extraContext,
                mode: 'direct',
              }),
            }).catch((e) => console.error('[form-submit] manual-outreach non-fatal:', e));
          } catch (e) {
            console.error('[form-submit] manual-outreach wrap non-fatal:', e);
          }
        } else if (outreachAgentId && !leadData.phone) {
          console.warn('[form-submit] start_ai_outreach configurado mas lead sem telefone — pulando.');
        }
      }
    }


    // 8. Create submission record — embed selected_options under __meta so downstream
    // consumers (CRM, webhooks, exports) can see which option triggered which actions.
    const submissionResponses = {
      ...responsesWithLabels,
      __meta: { selected_options },
    };
    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .insert({
        form_id,
        lead_id: leadId,
        responses: submissionResponses,
        total_score: totalScore,
        tags: Array.from(addTagIds),
        utm_source: tracking.utm_source || null,
        utm_medium: tracking.utm_medium || null,
        utm_campaign: tracking.utm_campaign || null,
        utm_term: tracking.utm_term || null,
        utm_content: tracking.utm_content || null,
        referrer_url: tracking.referrer_url || null,
        landing_page: tracking.landing_page || null,
        user_agent: tracking.user_agent || null,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Error creating submission:', submissionError);
      throw submissionError;
    }

    // 8. Increment form submission count
    await supabase.rpc('increment_form_submissions_count', { p_form_id: form_id });

    // 9. Return success with redirect URL — per-option actions (open_calendar / redirect) take priority over the form-level theme redirect
    const theme = form.theme || {};
    const finalRedirect = overrideRedirectUrl || theme.redirect_url || null;

    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission?.id,
        lead_id: leadId,
        score: totalScore,
        redirect_url: finalRedirect,
        redirect_new_tab: overrideRedirectUrl ? overrideRedirectNewTab : false,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in form-submit:', error);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
