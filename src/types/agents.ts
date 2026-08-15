export type AgentType = 'sdr' | 'closer' | 'support' | 'financial' | 'admin' | 'orchestrator' | 'custom';
export type ToneStyle = 'formal' | 'consultive' | 'friendly' | 'technical';
export type MessageStyle = 'short' | 'balanced' | 'detailed';

export interface SupportLink {
  title: string;
  url: string;
  description?: string;
}

export interface SupportQuickAnswer {
  question: string;
  answer: string;
}

export type QuickMenuAction = 'transfer_to_agent' | 'transfer_to_human' | 'start_flow';

export interface QuickMenuOption {
  label: string;
  action: QuickMenuAction;
  target_agent_id?: string | null;
  target_flow_id?: string | null;
  human_queue?: string | null;
}

export type QuickMenuMode = 'off' | 'always' | 'fallback';

export interface AgentToolConfigs {
  ai?: {
    /** Vazio = usa o roteamento definido para a empresa. */
    model?: string;
    /** Aplicado apenas a modelos que aceitam temperature. */
    temperature?: number;
    max_tokens?: number;
    reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
    context_mode?: 'economy' | 'balanced' | 'complete';
  };
  /** Vazio = todos os CTAs ativos do produto (compatibilidade retroativa). */
  allowed_cta_ids?: string[];
  allowed_tags?: string[];
  email_template_id?: string;
  email_default_subject?: string;
  allowed_material_ids?: string[];
  allowed_flow_ids?: string[];
  cadence_default_steps?: Array<{ day: number; action: string; template?: string }>;
  max_emails_per_day?: number;
  // Support agent only — populated via "📚 Suporte" tab
  support_links?: SupportLink[];
  support_quick_answers?: SupportQuickAnswer[];
  [key: string]: unknown;
}

// Type-safe version for internal use, JSON-compatible for Supabase
export type AgentToolConfigsJson = Record<string, unknown>;

export interface QualificationField {
  key: string;
  label: string;
  weight: number;
  hints?: string[];
}

export interface QualificationSchema {
  name: string;
  fields: QualificationField[];
}

export const QUALIFICATION_PRESETS: Record<string, QualificationSchema> = {
  bant: {
    name: 'BANT',
    fields: [
      { key: 'budget',    label: 'Budget (Orçamento)',     weight: 25, hints: ['valor disponível', 'faixa de investimento'] },
      { key: 'authority', label: 'Authority (Autoridade)', weight: 25, hints: ['quem decide', 'comitê', 'aprovação'] },
      { key: 'need',      label: 'Need (Necessidade)',     weight: 30, hints: ['dor', 'problema', 'objetivo'] },
      { key: 'timeline',  label: 'Timing (Tempo)',         weight: 20, hints: ['prazo', 'quando pretende'] },
    ],
  },
  gpct: {
    name: 'GPCT',
    fields: [
      { key: 'goals',     label: 'Goals (Metas)',         weight: 25, hints: ['o que quer alcançar'] },
      { key: 'plans',     label: 'Plans (Planos)',        weight: 25, hints: ['como pretende chegar lá'] },
      { key: 'challenges',label: 'Challenges (Desafios)', weight: 25, hints: ['o que está bloqueando'] },
      { key: 'timeline',  label: 'Timeline (Prazo)',      weight: 25, hints: ['até quando'] },
    ],
  },
  bmc: {
    name: 'Método BMC',
    fields: [
      { key: 'base_obra',  label: 'Base da Obra',           weight: 30, hints: ['construção nova', 'reforma', 'ampliação', 'residencial', 'comercial', 'construtora'] },
      { key: 'metragem',   label: 'Metragem e Material',    weight: 40, hints: ['ambientes', 'm²', 'produtos desejados', 'referências'] },
      { key: 'cronograma', label: 'Cronograma',             weight: 30, hints: ['quando comprar', 'quando instalar', 'prazo'] },
    ],
  },
};

export interface ProductAgent {
  id: string;
  organization_id: string;
  product_id: string | null;
  name: string;
  description?: string;
  avatar_url?: string;
  agent_type: AgentType;
  primary_objective: string;
  can_do: string[];
  cannot_do: string[];
  handoff_triggers: string[];
  end_conversation_triggers: string[];
  tone_style: ToneStyle;
  message_style: MessageStyle;
  always_end_with_question: boolean;
  additional_prompt?: string;
  required_phrases: string[];
  prohibited_phrases: string[];
  auto_tag_leads: boolean;
  default_tags: string[];
  can_update_pipeline: boolean;
  can_create_tasks: boolean;
  can_schedule_meetings: boolean;
  // New tool permissions
  can_apply_tags: boolean;
  can_update_lead: boolean;
  can_send_emails: boolean;
  never_ask_email?: boolean;
  can_send_materials: boolean;
  can_trigger_flows: boolean;
  can_transfer: boolean;
  can_notify: boolean;
  can_add_notes: boolean;
  can_start_cadence: boolean;
  can_qualify: boolean;
  tool_configs: Record<string, any>;
  /**
   * Schema customizado da tool `qualify_lead`. Permite cada empresa definir o
   * próprio método (BANT, GPCT, SPIN, Método BMC etc). Quando `null`/`undefined`,
   * o motor cai no BANT padrão (budget/authority/need/timeline).
   */
  qualification_schema?: QualificationSchema | Record<string, any> | null;
  // Channels
  active_in_funnels: boolean;
  active_in_chat: boolean;
  active_in_widget: boolean;
  active_in_inbox: boolean;
  active_in_copilot: boolean;
  active_in_whatsapp: boolean;
  active_in_instagram: boolean;
  active_in_facebook: boolean;
  is_active: boolean;
  is_default: boolean;
  // Handoff (transfer) configuration — applied when this agent transfers to another,
  // or when this agent receives a transferred conversation.
  handoff_outgoing_message?: string | null;   // sent BEFORE handing off. Vars: {{nome}}, {{produto}}, {{proximo_agente}}
  handoff_incoming_message?: string | null;   // sent AUTO when this agent takes over. Vars: {{nome}}, {{produto}}, {{agente_anterior}}, {{resumo}}
  handoff_delay_seconds?: number;             // wait between outgoing msg and the next agent's greeting (default 4)
  message_delay_seconds?: number;             // default delay between consecutive messages from this agent (default 2)
  handoff_include_summary?: boolean;          // when true, generate {{resumo}} of prior conversation
  // Automatic activation triggers (keyword/phrase-based agent switching)
  activation_keywords?: string[];
  activation_phrases?: string[];
  activation_priority?: number;
  activation_scope?: string; // 'all' | 'whatsapp' | 'chat' | 'inbox' | 'funnel'
  takeover_on_match?: boolean;
  // Vínculo legado (Evolution apenas). Mantido por compatibilidade — a lista
  // real multi-canal está em `dedicated_connections` (product_agent_connections).
  evolution_instance_id?: string | null;
  /**
   * Conexões dedicadas multi-canal. Vazio = atende em qualquer conexão.
   * Preenchido = agente só responde quando a mensagem chega em uma destas.
   * Campo transiente — persistido em `product_agent_connections`.
   */
  dedicated_connections?: Array<{ type: 'evolution' | 'meta_whatsapp' | 'instagram'; id: string }>;
  // Humanization config (timing, splitting, style) — see AgentHumanizationTab
  humanization?: Record<string, any> | null;
  // (Removido) ai_model: o modelo agora é gerenciado globalmente em org_ai_routing
  // (Configurações > Integrações > Roteamento de IA, capability='agent_chat').
  // === Agendamento (booking) ===
  // Anfitrião padrão cuja agenda a IA consulta e onde a reunião é criada.
  default_schedule_user_id?: string | null;
  // Tipos de evento (booking_event_types) que esse agente pode oferecer ao lead.
  allowed_event_type_ids?: string[];
  // Usuários extras que recebem notificação quando a IA confirma uma reunião.
  booking_notification_user_ids?: string[];
  // Se true, notifica todos os admins da organização ao confirmar.
  booking_notify_org_admins?: boolean;
  // Configurações exclusivas do Agente Admin Executivo (persistidas em auto_notification_settings)
  monitored_product_ids?: string[];
  // === Follow-up automático contextual ===
  followup_enabled?: boolean;
  followup_max_attempts?: number;
  followup_intervals_minutes?: number[];
  followup_tone?: 'short' | 'warm' | 'provocative';
  followup_extra_instructions?: string | null;
  followup_respect_business_hours?: boolean;
  followup_stop_on_human?: boolean;
  followup_stop_on_booking?: boolean;
  followup_channels?: string[];
  followup_attempt_hints?: Array<{ attempt: number; hint: string }> | any;
  // === Welcome + Quick Menu (Orquestrador) ===
  welcome_enabled?: boolean;
  welcome_message?: string | null;
  quick_menu_mode?: 'off' | 'always' | 'fallback';
  quick_menu_intro?: string | null;
  quick_menu_options?: QuickMenuOption[] | any;
  quick_menu_invalid_message?: string | null;
  // === Modo Voz (ligações) — não afeta WhatsApp/Inbox/Webchat ===
  voice_mode_enabled?: boolean;
  voice_behavior_prompt?: string | null;
  voice_max_sentences?: number;
  voice_max_seconds?: number;
  voice_always_end_with_question?: boolean;
  voice_show_tools_early?: boolean;
  voice_max_call_minutes?: number;
  voice_specific_rules?: string | null;
  voice_provider?: 'grok' | 'openai' | 'auto';
  openai_voice_id?: string | null;
  default_grok_voice_id?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentTemplate {
  name: string;
  description: string;
  icon: string;
  primary_objective: string;
  can_do: string[];
  cannot_do: string[];
  handoff_triggers: string[];
  tone_style: ToneStyle;
  message_style: MessageStyle;
}

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  sdr: 'SDR',
  closer: 'Closer',
  support: 'Suporte',
  financial: 'Financeiro',
  admin: 'Administrativo',
  orchestrator: 'Orquestrador',
  custom: 'Personalizado',
};

export const TONE_STYLE_LABELS: Record<ToneStyle, string> = {
  formal: 'Formal',
  consultive: 'Consultivo',
  friendly: 'Amigável',
  technical: 'Técnico',
};

export const MESSAGE_STYLE_LABELS: Record<MessageStyle, string> = {
  short: 'Curtas',
  balanced: 'Equilibradas',
  detailed: 'Detalhadas',
};

export const AGENT_TEMPLATES: Record<AgentType, AgentTemplate> = {
  sdr: {
    name: 'SDR Qualificador',
    description: 'Qualifica leads e encaminha para vendas',
    icon: '🎯',
    primary_objective: 'Qualificar leads e encaminhar para o closer quando houver interesse real',
    can_do: [
      'Fazer perguntas de qualificação',
      'Aplicar tags aos leads',
      'Avançar leads no funil',
      'Coletar informações de contato',
    ],
    cannot_do: [
      'Falar de preço fechado',
      'Fechar vendas',
      'Dar descontos',
    ],
    handoff_triggers: [
      'Lead pede para falar com humano',
      'Lead demonstra alto interesse de compra',
      'Lead tem objeções complexas',
    ],
    tone_style: 'friendly',
    message_style: 'balanced',
  },
  closer: {
    name: 'Closer Premium',
    description: 'Fecha vendas e converte leads qualificados',
    icon: '💼',
    primary_objective: 'Fechar vendas e converter leads qualificados em clientes',
    can_do: [
      'Negociar condições',
      'Apresentar propostas',
      'Falar sobre preços e planos',
      'Enviar links de pagamento',
      'Chamar humano quando necessário',
    ],
    cannot_do: [
      'Dar descontos não autorizados',
      'Prometer prazos irreais',
    ],
    handoff_triggers: [
      'Lead solicita condições especiais',
      'Lead quer falar com gerente',
      'Negociação complexa',
    ],
    tone_style: 'consultive',
    message_style: 'detailed',
  },
  support: {
    name: 'Suporte Técnico',
    description: 'Resolve problemas e dúvidas de clientes',
    icon: '🛠️',
    primary_objective: 'Resolver problemas e dúvidas de clientes de forma eficiente',
    can_do: [
      'Responder dúvidas técnicas',
      'Abrir tickets de suporte',
      'Escalar para equipe técnica',
      'Enviar tutoriais e documentação',
    ],
    cannot_do: [
      'Vender novos produtos',
      'Negociar contratos',
      'Fazer alterações em conta',
    ],
    handoff_triggers: [
      'Problema não resolvido após 3 tentativas',
      'Cliente insatisfeito',
      'Solicitação de reembolso',
    ],
    tone_style: 'friendly',
    message_style: 'detailed',
  },
  financial: {
    name: 'Financeiro',
    description: 'Lida com cobranças e questões financeiras',
    icon: '💰',
    primary_objective: 'Lidar com questões financeiras e cobranças de forma profissional',
    can_do: [
      'Informar sobre faturas',
      'Enviar boletos e links de pagamento',
      'Explicar cobranças',
      'Informar sobre atrasos',
    ],
    cannot_do: [
      'Negociar dívidas sem autorização',
      'Cancelar contratos',
      'Fazer estornos',
    ],
    handoff_triggers: [
      'Solicitação de negociação de dívida',
      'Disputa de cobrança',
      'Cancelamento de serviço',
    ],
    tone_style: 'formal',
    message_style: 'short',
  },
  admin: {
    name: 'Administrativo',
    description: 'Auxilia em questões administrativas',
    icon: '📋',
    primary_objective: 'Auxiliar em questões administrativas e direcionamentos',
    can_do: [
      'Responder sobre processos',
      'Direcionar para áreas corretas',
      'Informar horários e contatos',
      'Agendar reuniões',
    ],
    cannot_do: [
      'Tomar decisões finais',
      'Alterar cadastros',
      'Aprovar solicitações',
    ],
    handoff_triggers: [
      'Solicitação que requer aprovação',
      'Reclamação formal',
    ],
    tone_style: 'formal',
    message_style: 'balanced',
  },
  orchestrator: {
    name: 'Orquestrador Mestre',
    description: 'Classifica produto+intenção e roteia para o especialista',
    icon: '🧭',
    primary_objective: 'Classificar a mensagem recebida (produto + intenção) e rotear o lead para o especialista correto, ou pedir UMA pergunta de esclarecimento quando não conseguir classificar com confiança.',
    can_do: [
      'Identificar de qual produto o lead está falando',
      'Detectar intenção (informação, compra, suporte, financeiro, humano)',
      'Rotear para SDR / Closer / Suporte / Financeiro do produto certo',
      'Fazer UMA pergunta curta para desambiguar quando necessário',
      'Transferir para humano quando for solicitado',
    ],
    cannot_do: [
      'Vender, negociar ou explicar detalhes de produto',
      'Responder dúvidas técnicas (encaminha para Suporte)',
      'Falar de preço, condições ou plano (encaminha para Closer)',
      'Mais de 2 perguntas seguidas — se não classificar, transfere para humano',
    ],
    handoff_triggers: [
      'Lead pede explicitamente para falar com humano',
      'Não consegui classificar produto após 2 perguntas',
      'Mensagem ofensiva ou fora do escopo da empresa',
    ],
    tone_style: 'friendly',
    message_style: 'short',
  },
  custom: {
    name: 'Agente Personalizado',
    description: 'Configure do zero conforme sua necessidade',
    icon: '✨',
    primary_objective: '',
    can_do: [],
    cannot_do: [],
    handoff_triggers: [],
    tone_style: 'friendly',
    message_style: 'balanced',
  },
};

export const CHANNEL_LABELS = {
  active_in_funnels: 'Funis de Captura',
  active_in_chat: 'Chat do Site',
  active_in_widget: 'Widget',
  active_in_inbox: 'Inbox',
  active_in_copilot: 'Copilot do Vendedor',
  active_in_whatsapp: 'WhatsApp',
  active_in_instagram: 'Instagram',
  active_in_facebook: 'Facebook',
};
