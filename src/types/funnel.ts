// =====================================================
// VENDUS CAPTURE: Tipos TypeScript para Funis de Leads
// STRATEGY FLOW BUILDER v2
// =====================================================

// Status do funil
export type FunnelStatus = 'draft' | 'active' | 'paused' | 'archived';

// Canais de publicação
export type FunnelChannel = 'chat' | 'form' | 'widget' | 'landing' | 'whatsapp';

// Regras de distribuição de leads
export type DistributionRule = 'manual' | 'round_robin' | 'squad' | 'user';

// =====================================================
// TIPOS DE BLOCOS - Organizados por Categoria
// =====================================================

// Categoria: EXPERIÊNCIA (o que o lead vê)
export type ExperienceBlockType = 
  | 'message'      // Mensagem do bot/sistema
  | 'buttons'      // Opções clicáveis / Menu
  | 'video'        // Exibir vídeo (YouTube, Vimeo, embed, HTML)
  | 'image'        // Exibir imagem
  | 'link'         // Link clicável
  | 'delay';       // Pausa/timing

// Tipo de incorporação de vídeo
export type VideoType = 'youtube' | 'vimeo' | 'embed' | 'custom_html';

// Categoria: CAPTURA (coletar dados)
export type CaptureBlockType = 
  | 'input'        // Captura de dados (texto, email, etc)
  | 'quick_form';  // Formulário rápido inline

// Categoria: IA (inteligência artificial)
export type AIBlockType = 
  | 'ai_takeover'    // IA assume conversa
  | 'ai_decide'      // IA decide próximo passo
  | 'ai_qualify'     // IA qualifica lead
  | 'ai_summarize'   // IA resume contexto
  | 'agent_switch';  // Trocar agente ativo

// Categoria: LÓGICA (decisões do sistema)
export type LogicBlockType = 
  | 'condition'    // Se/Então
  | 'ab_test'      // Teste A/B aleatório
  | 'score'        // Adicionar pontuação
  | 'tag';         // Adicionar tag

// Categoria: AÇÕES (o que o sistema faz)
export type ActionBlockType = 
  | 'create_lead'   // Criar lead no CRM
  | 'update_lead'   // Atualizar dados do lead
  | 'create_task'   // Criar tarefa
  | 'schedule'      // Agendar reunião
  | 'handoff'       // Transferir para humano
  | 'end';          // Tela final

// Categoria: INTEGRAÇÕES (sistemas externos)
export type IntegrationBlockType = 
  | 'webhook'      // Chamada API externa
  | 'crm_sync';    // Sincronizar com CRM externo

// Tipo consolidado de todos os blocos
export type FunnelBlockType = 
  | ExperienceBlockType 
  | CaptureBlockType 
  | AIBlockType 
  | LogicBlockType 
  | ActionBlockType 
  | IntegrationBlockType;

// Categorias do builder
export type BlockCategory = 'experience' | 'capture' | 'ai' | 'logic' | 'action' | 'integration';

// =====================================================
// Tipos auxiliares
// =====================================================

// Tipos de input disponíveis
export type FunnelInputType = 'name' | 'email' | 'phone' | 'text' | 'number' | 'cpf' | 'textarea';

// Layout de botões/opções
export type FunnelButtonLayout = 'vertical' | 'horizontal';

// Operadores de condição
export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';

// Alvos de handoff
export type HandoffTarget = 'queue' | 'user' | 'squad';

// Objetivos da IA
export type AIObjective = 'qualify' | 'sell' | 'schedule' | 'support' | 'custom';

// =====================================================
// Estrutura de um bloco do fluxo
// =====================================================

export interface FunnelBlockOption {
  id: string;
  label: string;
  value?: string;
  emoji?: string;
  next_block_id?: string | null;
  // Extensões Quiz (Fase 1)
  letter?: string;        // A, B, C, D
  image_url?: string;     // imagem clicável por opção
  score?: number;         // pontos somados ao selecionar
  tag?: string;           // tag aplicada ao lead
}

export interface FunnelBlockCondition {
  variable: string;
  operator: ConditionOperator;
  value: string | number;
}

// Estrutura para IA Decide
export interface AIDecideOutput {
  id: string;
  label: string;
  next_block_id: string | null;
}

// Estrutura para Teste A/B
export interface ABTestVariant {
  id: string;
  name: string;
  weight: number; // 0-100
  next_block_id: string | null;
}

// Estrutura para Criar Tarefa
export interface CreateTaskConfig {
  title_template: string;
  description_template: string;
  due_in_days: number;
  assign_to: 'lead_owner' | 'specific_user' | 'squad';
  user_id?: string;
  squad_id?: string;
}

// Estrutura para Webhook
export interface WebhookConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body_template?: string;
  save_response_to?: string;
  trigger?: 'on_block' | 'on_complete'; // Quando dispara: durante o fluxo ou ao concluir
  wait_for_response?: boolean; // Bloquear o fluxo até receber resposta?
  timeout_ms?: number; // Timeout em milissegundos (default 10000)
}

// Log de execução de webhook
export interface FunnelWebhookLog {
  id: string;
  funnel_id: string;
  block_id: string;
  lead_id: string | null;
  organization_id: string;
  request_url: string;
  request_method: string;
  request_headers: Record<string, string>;
  request_body: any;
  response_status: number | null;
  response_body: string | null;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  trigger_source: string;
  created_at: string;
}

// Configuração de troca automática de agente
export interface AutoSwitchAgentConfig {
  agent_id: string;
  trigger_condition: string; // Ex: "Lead demonstra interesse de compra"
}

export interface FunnelBlockData {
  // Comum
  content?: string;
  delay_ms?: number;

  // Canais onde este bloco aparece
  channels?: FunnelChannel[];

  // Quiz / Form (padrão inlead) — opcional, backward-compatible
  subtitle?: string;          // Subtítulo abaixo do título
  cta_label?: string;         // Texto do botão "Continuar"
  cta_emoji?: string;         // Emoji opcional no final do CTA
  show_duration?: boolean;    // Exibe badge "⏳ Duração de X..."
  duration_label?: string;    // Texto da duração (ex: "2min para responder")
  show_logo?: boolean;        // Sobrescreve exibição de logo no topo da tela
  
  
  // Input
  input_type?: FunnelInputType;
  variable_name?: string;
  placeholder?: string;
  required?: boolean;
  fallback_block_id?: string; // Se não responder
  
  // Opções (select/buttons)
  options?: FunnelBlockOption[];
  layout?: FunnelButtonLayout;
  
  // Lógica
  score_value?: number;
  apply_tags?: string[];
  
  // IA - Geral
  ai_context_prompt?: string;
  ai_takeover?: boolean;
  ai_enabled?: boolean;
  
  // IA - Decide
  ai_objective?: AIObjective;
  ai_qualification_criteria?: string[];
  ai_custom_prompt?: string;
  ai_outputs?: AIDecideOutput[];
  
  // Teste A/B
  ab_variants?: ABTestVariant[];
  
  // Handoff
  handoff_message?: string;
  handoff_target?: HandoffTarget;
  handoff_user_id?: string;
  handoff_squad_id?: string;
  
  // Condicional
  condition?: FunnelBlockCondition;
  true_next_block_id?: string;
  false_next_block_id?: string;
  
  // Vídeo
  video_url?: string;
  video_thumbnail?: string;
  video_type?: VideoType;
  embed_code?: string;
  
  // Imagem
  image_url?: string;
  image_alt?: string;
  
  // Link
  link_url?: string;
  link_title?: string;
  link_description?: string;
  link_open_new_tab?: boolean;
  
  // Final
  success_message?: string;
  redirect_url?: string;
  
  // Criar Tarefa
  task_config?: CreateTaskConfig;
  
  // Webhook
  webhook_config?: WebhookConfig;
  
  // Quick Form (múltiplos campos inline)
  form_fields?: {
    id: string;
    type: FunnelInputType;
    label: string;
    variable: string;
    required: boolean;
  }[];
  
  // Lead actions
  lead_field_updates?: Record<string, string>;
  
  // Agent switch / AI Takeover com agente
  agent_id?: string;  // ID do agente a ativar
  
  // Permissões override (sobrescrever regras do agente neste contexto)
  override_can_do?: string[];      // Adicionar ao que o agente pode fazer
  override_cannot_do?: string[];   // Adicionar ao que o agente NÃO pode fazer
  override_handoff_triggers?: string[];  // Triggers adicionais para handoff
  
  // Auto-switch de agente
  auto_switch_enabled?: boolean;   // IA pode trocar de agente?
  auto_switch_agents?: AutoSwitchAgentConfig[];  // Agentes disponíveis para troca automática
  
  // Schedule block (agendamento inline)
  schedule_event_type_id?: string;     // ID do tipo de evento (booking_event_types)
  schedule_user_id?: string;           // Usuário específico para agendar
  schedule_use_lead_owner?: boolean;   // Usar dono do lead
  schedule_message?: string;           // Mensagem antes do calendário
  schedule_success_message?: string;   // Mensagem após agendar

  // ============================================================
  // Inlead-style Builder (overrides locais por bloco) — opcional
  // ============================================================

  /** Sobrescritas visuais aplicadas APENAS a este bloco no render do quiz. */
  block_appearance?: {
    variant?: 'relief' | 'flat' | 'outline' | 'loose';
    indicator?: 'none' | 'number' | 'check' | 'radio';
    layout?: 'single' | 'grid-2' | 'carousel';
    orientation?: 'vertical' | 'horizontal';
    image_ratio?: 'auto' | '1:1' | '4:3' | '16:9';
    image_placement?: 'image-text' | 'text-image' | 'overlay';
    image_transparent?: boolean;
    shadow?: 'none' | 'soft' | 'medium' | 'strong';
    spacing?: 'compact' | 'simple' | 'spacious';
    width_pct?: number;        // 25..100 — controla a largura do conteúdo do step
    align?: 'left' | 'center' | 'right';
  };

  /** Regras de exibição do bloco (delay, dispositivo, condicional). */
  block_display?: {
    delay_seconds?: number;
    device?: 'all' | 'mobile' | 'desktop';
    rules?: Array<{
      id: string;
      source: string;
      operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'in';
      value: string | number | string[];
      combinator?: 'and' | 'or';
    }>;
  };

  /** Nome amigável da etapa (exibido na sidebar do builder). */
  step_label?: string;
}

export interface FunnelBlock {
  id: string;
  type: FunnelBlockType;
  position: { x: number; y: number };
  data: FunnelBlockData;
  next_block_id?: string | null;
}

// =====================================================
// Configurações de canais
// =====================================================

export interface FunnelChannelSettings {
  enabled: boolean;
  slug_override?: string | null;
}

export interface FunnelWhatsAppSettings {
  enabled: boolean;
  evolution_instance_id?: string | null;
  /** @deprecated mantido apenas para compat com configs antigas; ignorado pelo backend */
  trigger_mode?: 'always' | 'keyword';
  /** @deprecated mantido apenas para compat com configs antigas; ignorado pelo backend */
  trigger_keywords?: string[];
}

export interface FunnelChannelConfig {
  chat: FunnelChannelSettings;
  form: FunnelChannelSettings;
  widget: { enabled: boolean };
  landing?: FunnelChannelSettings;
  whatsapp?: FunnelWhatsAppSettings;
}

// =====================================================
// Configurações do Widget
// =====================================================

export type WidgetPosition = 'bottom-right' | 'bottom-left';

export interface FunnelWidgetConfig {
  position: WidgetPosition;
  primary_color: string;
  greeting: string;
  avatar_url?: string | null;
  allowed_domains: string[];
}

// =====================================================
// Tema visual do funil
// =====================================================

export interface FunnelTheme {
  primary_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  logo_url?: string | null;
  show_progress: boolean;
}

// =====================================================
// Scripts customizados
// =====================================================

export interface FunnelCustomScripts {
  header: string;
  footer: string;
}

// =====================================================
// Configuração de Round Robin
// =====================================================

export interface RoundRobinConfig {
  users: string[];
  current_index: number;
}

// =====================================================
// Entidade principal: Funnel
// =====================================================

export interface Funnel {
  id: string;
  organization_id: string;
  product_id: string;
  
  // Identificação
  name: string;
  description?: string | null;
  slug: string;
  
  // Status
  status: FunnelStatus;
  
  // Flow
  flow_blocks: FunnelBlock[];
  start_block_id?: string | null;
  
  // Canais
  channels: FunnelChannelConfig;
  widget_config: FunnelWidgetConfig;
  
  // Distribuição
  distribution_rule: DistributionRule;
  assigned_squad_id?: string | null;
  assigned_user_id?: string | null;
  round_robin_config: RoundRobinConfig;
  
  // Qualificação
  default_temperature: string;
  default_tags: string[];
  
  // Tracking
  facebook_pixel_id?: string | null;
  google_tag_id?: string | null;
  custom_scripts: FunnelCustomScripts;
  utm_capture: boolean;
  
  // Tema
  theme: FunnelTheme;
  /** Personalização visual independente por canal (chat, form, widget, quiz) */
  appearance?: FunnelAppearance | null;
  
  // AI
  ai_enabled: boolean;
  ai_context?: string | null;
  
  // Métricas
  total_views: number;
  total_leads: number;
  
  // Versionamento
  version?: string;
  
  // Metadata
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  
  // Joined relations
  products?: { name: string };
  profiles?: { full_name: string };
}

// =====================================================
// Analytics por canal
// =====================================================

export interface FunnelAnalytics {
  id: string;
  funnel_id: string;
  channel: FunnelChannel;
  date: string;
  views: number;
  starts: number;
  completions: number;
  leads_created: number;
}

// =====================================================
// Tipos auxiliares para o Builder
// =====================================================

export interface FunnelBuilderState {
  blocks: FunnelBlock[];
  selectedBlockId: string | null;
  startBlockId: string | null;
  isDirty: boolean;
}

export interface FunnelConnection {
  sourceBlockId: string;
  targetBlockId: string;
  sourceHandle?: string;
  type?: 'normal' | 'condition' | 'fallback';
}

// =====================================================
// Tipos para criação/atualização
// =====================================================

export interface CreateFunnelInput {
  product_id: string;
  name: string;
  description?: string;
  slug?: string;
  channel_type?: 'chatbot' | 'whatsapp' | 'form' | 'widget' | 'quiz';
  flow_blocks?: FunnelBlock[];
  start_block_id?: string | null;
  theme?: Record<string, any>;
  appearance?: Record<string, any>;
}

export interface UpdateFunnelInput {
  product_id?: string;
  name?: string;
  description?: string;
  slug?: string;
  status?: FunnelStatus;
  flow_blocks?: FunnelBlock[];
  start_block_id?: string | null;
  channels?: FunnelChannelConfig;
  widget_config?: FunnelWidgetConfig;
  distribution_rule?: DistributionRule;
  assigned_squad_id?: string | null;
  assigned_user_id?: string | null;
  round_robin_config?: RoundRobinConfig;
  default_temperature?: string;
  default_tags?: string[];
  facebook_pixel_id?: string | null;
  google_tag_id?: string | null;
  custom_scripts?: FunnelCustomScripts;
  utm_capture?: boolean;
  theme?: FunnelTheme;
  ai_enabled?: boolean;
  ai_context?: string | null;
}

// =====================================================
// Metadados de bloco para a paleta (v2 Strategy Builder)
// =====================================================

export interface BlockPaletteItem {
  type: FunnelBlockType;
  label: string;
  icon: string;
  description: string;
  category: BlockCategory;
  color: string; // Cor da categoria para visual
}

// Cores por categoria (HSL-based para theming)
export const CATEGORY_COLORS: Record<BlockCategory, { bg: string; border: string; text: string }> = {
  experience: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-600' },
  capture: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600' },
  ai: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-600' },
  logic: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-600' },
  action: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-600' },
  integration: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-600' },
};

export const FUNNEL_BLOCK_PALETTE: BlockPaletteItem[] = [
  // ===== EXPERIÊNCIA (O que o lead vê) =====
  { 
    type: 'message', 
    label: 'Mensagem', 
    icon: '💬', 
    description: 'Exibir texto ou conteúdo', 
    category: 'experience',
    color: 'bg-blue-500'
  },
  { 
    type: 'buttons', 
    label: 'Botões / Menu', 
    icon: '🔘', 
    description: 'Opções clicáveis para o lead', 
    category: 'experience',
    color: 'bg-blue-500'
  },
  { 
    type: 'video', 
    label: 'Vídeo', 
    icon: '🎬', 
    description: 'YouTube, Vimeo, embed ou HTML', 
    category: 'experience',
    color: 'bg-blue-500'
  },
  { 
    type: 'image', 
    label: 'Imagem', 
    icon: '🖼️', 
    description: 'Exibir imagem por URL', 
    category: 'experience',
    color: 'bg-blue-500'
  },
  { 
    type: 'link', 
    label: 'Link', 
    icon: '🔗', 
    description: 'URL clicável com título', 
    category: 'experience',
    color: 'bg-blue-500'
  },
  { 
    type: 'delay', 
    label: 'Pausa', 
    icon: '⏱️', 
    description: 'Aguardar antes de continuar', 
    category: 'experience',
    color: 'bg-blue-500'
  },
  
  // ===== CAPTURA (Coletar dados do lead) =====
  { 
    type: 'input', 
    label: 'Pergunta', 
    icon: '📝', 
    description: 'Capturar uma resposta', 
    category: 'capture',
    color: 'bg-emerald-500'
  },
  { 
    type: 'quick_form', 
    label: 'Formulário Rápido', 
    icon: '📋', 
    description: 'Múltiplos campos inline', 
    category: 'capture',
    color: 'bg-emerald-500'
  },
  
  // ===== IA (Inteligência Artificial) =====
  { 
    type: 'ai_takeover', 
    label: 'Agente IA', 
    icon: '🤖', 
    description: 'Sofia assume a conversa', 
    category: 'ai',
    color: 'bg-orange-500'
  },
  { 
    type: 'ai_decide', 
    label: 'IA Decide Caminho', 
    icon: '🧠', 
    description: 'IA escolhe próximo passo', 
    category: 'ai',
    color: 'bg-orange-500'
  },
  { 
    type: 'ai_qualify', 
    label: 'IA Qualifica', 
    icon: '⭐', 
    description: 'IA classifica o lead', 
    category: 'ai',
    color: 'bg-orange-500'
  },
  { 
    type: 'ai_summarize', 
    label: 'IA Resume', 
    icon: '📄', 
    description: 'IA resume o contexto', 
    category: 'ai',
    color: 'bg-orange-500'
  },
  { 
    type: 'agent_switch', 
    label: 'Trocar Agente', 
    icon: '🔄', 
    description: 'Mudar para outro agente IA', 
    category: 'ai',
    color: 'bg-orange-500'
  },
  
  // ===== LÓGICA (Decisões do sistema) =====
  { 
    type: 'condition', 
    label: 'Se / Então', 
    icon: '🔀', 
    description: 'Lógica condicional', 
    category: 'logic',
    color: 'bg-purple-500'
  },
  { 
    type: 'ab_test', 
    label: 'Teste A/B', 
    icon: '🎲', 
    description: 'Dividir aleatoriamente', 
    category: 'logic',
    color: 'bg-purple-500'
  },
  { 
    type: 'score', 
    label: 'Pontuação', 
    icon: '📊', 
    description: 'Adicionar score ao lead', 
    category: 'logic',
    color: 'bg-purple-500'
  },
  { 
    type: 'tag', 
    label: 'Etiqueta', 
    icon: '🏷️', 
    description: 'Adicionar etiqueta ao lead', 
    category: 'logic',
    color: 'bg-purple-500'
  },
  
  // ===== AÇÕES (O que o sistema faz) =====
  { 
    type: 'create_lead', 
    label: 'Criar Lead', 
    icon: '👤', 
    description: 'Criar lead no CRM', 
    category: 'action',
    color: 'bg-rose-500'
  },
  { 
    type: 'update_lead', 
    label: 'Atualizar Lead', 
    icon: '✏️', 
    description: 'Modificar dados do lead', 
    category: 'action',
    color: 'bg-rose-500'
  },
  { 
    type: 'create_task', 
    label: 'Criar Tarefa', 
    icon: '✅', 
    description: 'Agendar follow-up', 
    category: 'action',
    color: 'bg-rose-500'
  },
  { 
    type: 'schedule', 
    label: 'Agendar Reunião', 
    icon: '📅', 
    description: 'Marcar no calendário', 
    category: 'action',
    color: 'bg-rose-500'
  },
  { 
    type: 'handoff', 
    label: 'Transferir', 
    icon: '🙋', 
    description: 'Passar para humano', 
    category: 'action',
    color: 'bg-rose-500'
  },
  { 
    type: 'end', 
    label: 'Finalizar', 
    icon: '🏁', 
    description: 'Encerrar o fluxo', 
    category: 'action',
    color: 'bg-rose-500'
  },
  
  // ===== INTEGRAÇÕES (Sistemas externos) =====
  { 
    type: 'webhook', 
    label: 'Webhook / API', 
    icon: '🔗', 
    description: 'Chamar sistema externo', 
    category: 'integration',
    color: 'bg-cyan-500'
  },
  { 
    type: 'crm_sync', 
    label: 'Sincronizar CRM', 
    icon: '🔄', 
    description: 'Enviar para CRM externo', 
    category: 'integration',
    color: 'bg-cyan-500'
  },
];

// =====================================================
// Mapeamento de variáveis para campos do lead
// =====================================================

export const VARIABLE_TO_LEAD_FIELD: Record<string, string> = {
  'name': 'name',
  'nome': 'name',
  'email': 'email',
  'e-mail': 'email',
  'phone': 'phone',
  'telefone': 'phone',
  'whatsapp': 'phone',
  'celular': 'phone',
  'company': 'company',
  'empresa': 'company',
  'cpf': 'cpf',
};

// =====================================================
// Labels das categorias para UI
// =====================================================

export const CATEGORY_LABELS: Record<BlockCategory, { label: string; description: string }> = {
  experience: { label: 'Experiência', description: 'O que o lead vê' },
  capture: { label: 'Captura', description: 'Coletar dados' },
  ai: { label: 'IA', description: 'Inteligência artificial' },
  logic: { label: 'Lógica', description: 'Decisões do sistema' },
  action: { label: 'Ações', description: 'O que o sistema faz' },
  integration: { label: 'Integrações', description: 'Sistemas externos' },
};

// =====================================================
// Helpers
// =====================================================

export function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 50);
}

export function createDefaultBlock(type: FunnelBlockType, position: { x: number; y: number }): FunnelBlock {
  const block: FunnelBlock = {
    id: generateBlockId(),
    type,
    position,
    data: {
      channels: ['chat', 'form', 'widget'], // Habilitado em todos por padrão
    },
    next_block_id: null,
  };

  // Configurações padrão por tipo
  switch (type) {
    case 'message':
      block.data.content = 'Digite sua mensagem aqui...';
      block.data.delay_ms = 500;
      break;
    case 'input':
      block.data.input_type = 'text';
      block.data.placeholder = 'Digite sua resposta...';
      block.data.required = true;
      break;
    case 'buttons':
      block.data.options = [
        { id: generateBlockId(), label: 'Opção 1' },
        { id: generateBlockId(), label: 'Opção 2' },
      ];
      block.data.layout = 'vertical';
      break;
    case 'delay':
      block.data.delay_ms = 1000;
      break;
    case 'video':
      block.data.video_type = 'youtube';
      block.data.video_url = '';
      break;
    case 'image':
      block.data.image_url = '';
      block.data.image_alt = '';
      break;
    case 'link':
      block.data.link_url = '';
      block.data.link_title = '';
      block.data.link_description = '';
      block.data.link_open_new_tab = true;
      break;
    case 'end':
      block.data.success_message = 'Obrigado! Entraremos em contato em breve.';
      break;
    case 'ai_decide':
      block.data.ai_objective = 'qualify';
      block.data.ai_outputs = [
        { id: generateBlockId(), label: 'Qualificado', next_block_id: null },
        { id: generateBlockId(), label: 'Não Qualificado', next_block_id: null },
        { id: generateBlockId(), label: 'Precisa Humano', next_block_id: null },
      ];
      break;
    case 'agent_switch':
      // Placeholder - agent_id será selecionado no editor
      break;
    case 'ab_test':
      block.data.ab_variants = [
        { id: generateBlockId(), name: 'Variante A', weight: 50, next_block_id: null },
        { id: generateBlockId(), name: 'Variante B', weight: 50, next_block_id: null },
      ];
      break;
    case 'create_task':
      block.data.task_config = {
        title_template: 'Follow-up: {{lead_name}}',
        description_template: 'Entrar em contato com o lead.',
        due_in_days: 1,
        assign_to: 'lead_owner',
      };
      break;
    case 'quick_form':
      block.data.form_fields = [
        { id: generateBlockId(), type: 'name', label: 'Seu nome', variable: 'name', required: true },
        { id: generateBlockId(), type: 'email', label: 'Seu email', variable: 'email', required: true },
      ];
      break;
    case 'webhook':
      block.data.webhook_config = {
        url: '',
        method: 'POST',
      };
      break;
  }

  return block;
}

// Helper para obter cor da categoria de um bloco
export function getBlockCategoryColor(type: FunnelBlockType): { bg: string; border: string; text: string } {
  const item = FUNNEL_BLOCK_PALETTE.find(b => b.type === type);
  if (!item) return CATEGORY_COLORS.experience;
  return CATEGORY_COLORS[item.category];
}

// Helper para obter item da paleta
export function getPaletteItem(type: FunnelBlockType): BlockPaletteItem | undefined {
  return FUNNEL_BLOCK_PALETTE.find(b => b.type === type);
}

// =====================================================
// APPEARANCE — Personalização visual por canal
// =====================================================

export type ChannelKey = 'chat' | 'form' | 'widget' | 'quiz';

export type Density = 'compact' | 'cozy' | 'spacious';
export type ShadowLevel = 'none' | 'soft' | 'medium' | 'strong';
export type AnimationLevel = 'off' | 'subtle' | 'full';
export type DarkMode = 'light' | 'dark' | 'auto';
export type AvatarShape = 'circle' | 'square';
export type LogoPosition = 'left' | 'center';
export type BgImageMode = 'cover' | 'contain' | 'repeat';

export interface ChatChannelOptions {
  bubble_style: 'rounded' | 'squared' | 'bubble';
  bot_bubble_color: string;
  user_bubble_color: string;
  show_typing: boolean;
  header_gradient: boolean;
  input_placeholder: string;
  notification_sound: boolean;
}

export interface FormChannelOptions {
  layout: 'single' | 'step' | 'conversational';
  max_width: number;
  alignment: 'left' | 'center';
  input_style: 'filled' | 'outlined' | 'underline';
  button_style: 'filled' | 'outlined' | 'ghost';
  show_progress: boolean;
  side_image_url: string | null;
}

export interface WidgetChannelOptions {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  fab_size: 'sm' | 'md' | 'lg';
  fab_icon: string;
  callout_text: string;
  auto_open_delay: number;
  show_notification_badge: boolean;
  hide_on_mobile: boolean;
}

export interface QuizChannelOptions {
  layout: 'cards' | 'list' | 'carousel';
  option_columns: 1 | 2 | 3;
  show_counter: boolean;
  show_progress?: boolean;
  show_logo?: boolean;
  show_back_button?: boolean;
  max_width?: number;
  logo_width?: number;
  vertical_alignment?: 'top' | 'center';
  content_alignment?: 'left' | 'center';
  surface?: 'plain' | 'card';
  transition: 'fade' | 'slide' | 'none';
  result_image_url: string | null;
  result_message: string;
}

export type ChannelOptions =
  | ChatChannelOptions
  | FormChannelOptions
  | WidgetChannelOptions
  | QuizChannelOptions;

export interface ChannelAppearance {
  // base
  primary_color: string;
  secondary_color: string;
  background_color: string;
  background_image_url?: string | null;
  background_image_mode?: BgImageMode;
  background_image_opacity?: number;
  text_color: string;
  font_family: string;
  font_size_base: number;
  density: Density;
  border_radius: number;
  shadow: ShadowLevel;
  animations: AnimationLevel;
  dark_mode: DarkMode;
  custom_css?: string;
  // branding
  logo_url?: string | null;
  logo_position?: LogoPosition;
  // avatar
  avatar_enabled: boolean;
  avatar_url?: string | null;
  avatar_shape: AvatarShape;
  bot_name: string;
  show_online_status: boolean;
  // canal-específico
  channel_options: ChannelOptions;
}

export interface FunnelAppearance {
  chat: ChannelAppearance;
  form: ChannelAppearance;
  widget: ChannelAppearance;
  quiz: ChannelAppearance;
}

// Defaults por canal (espelham os defaults da migration SQL)
function baseDefaults(): Omit<ChannelAppearance, 'channel_options'> {
  return {
    primary_color: '#3B82F6',
    secondary_color: '#3B82F6',
    background_color: '#F8FAFC',
    background_image_url: null,
    background_image_mode: 'cover',
    background_image_opacity: 0.15,
    text_color: '#0F172A',
    font_family: 'Inter',
    font_size_base: 14,
    density: 'cozy',
    border_radius: 16,
    shadow: 'soft',
    animations: 'subtle',
    dark_mode: 'light',
    custom_css: '',
    logo_url: null,
    logo_position: 'left',
    avatar_enabled: true,
    avatar_url: null,
    avatar_shape: 'circle',
    bot_name: 'Assistente',
    show_online_status: true,
  };
}

export function defaultChannelOptions(channel: ChannelKey): ChannelOptions {
  switch (channel) {
    case 'chat':
      return {
        bubble_style: 'rounded',
        bot_bubble_color: '#3B82F6',
        user_bubble_color: '#E2E8F0',
        show_typing: true,
        header_gradient: true,
        input_placeholder: 'Mensagem',
        notification_sound: false,
      };
    case 'form':
      return {
        layout: 'step',
        max_width: 640,
        alignment: 'center',
        input_style: 'outlined',
        button_style: 'filled',
        show_progress: true,
        side_image_url: null,
      };
    case 'widget':
      return {
        position: 'bottom-right',
        fab_size: 'md',
        fab_icon: 'message-circle',
        callout_text: 'Posso ajudar?',
        auto_open_delay: 0,
        show_notification_badge: true,
        hide_on_mobile: false,
      };
    case 'quiz':
      return {
        layout: 'cards',
        option_columns: 2,
        show_counter: true,
        show_progress: true,
        show_logo: true,
        show_back_button: true,
        max_width: 560,
        logo_width: 128,
        vertical_alignment: 'center',
        content_alignment: 'left',
        surface: 'plain',
        transition: 'slide',
        result_image_url: null,
        result_message: 'Obrigado pela participação!',
      };
  }
}

export function defaultChannelAppearance(channel: ChannelKey): ChannelAppearance {
  const base = baseDefaults();
  const overrides: Partial<ChannelAppearance> =
    channel === 'form'
      ? { background_color: '#FFFFFF', font_size_base: 16, density: 'spacious', border_radius: 12, shadow: 'medium', logo_position: 'center', avatar_enabled: false, bot_name: '', show_online_status: false }
      : channel === 'widget'
      ? { background_color: '#FFFFFF', border_radius: 18, shadow: 'strong', animations: 'full', bot_name: 'Atendimento' }
      : channel === 'quiz'
      // Padrão inlead: indigo + branco, Inter, cantos suaves, sem avatar/bot
      ? { primary_color: '#6366F1', secondary_color: '#4F46E5', background_color: '#FFFFFF', text_color: '#0F172A', font_family: 'Inter', font_size_base: 16, density: 'spacious', border_radius: 16, shadow: 'medium', animations: 'subtle', dark_mode: 'light', logo_position: 'center', avatar_enabled: false, avatar_url: null, bot_name: '', show_online_status: false, background_image_opacity: 0.15 }
      : {};
  return { ...base, ...overrides, channel_options: defaultChannelOptions(channel) };
}

export function defaultFunnelAppearance(): FunnelAppearance {
  return {
    chat: defaultChannelAppearance('chat'),
    form: defaultChannelAppearance('form'),
    widget: defaultChannelAppearance('widget'),
    quiz: defaultChannelAppearance('quiz'),
  };
}

/**
 * Lê o tema de um canal específico do funil, com fallback inteligente:
 * 1) appearance[channel] se existir
 * 2) deriva a partir do theme legado preenchendo defaults do canal
 */
export function getChannelAppearance(
  funnel: Pick<Funnel, 'theme'> & { appearance?: FunnelAppearance | null },
  channel: ChannelKey
): ChannelAppearance {
  if (funnel.appearance?.[channel]) return funnel.appearance[channel];

  const base = defaultChannelAppearance(channel);
  const t = funnel.theme;
  if (!t) return base;
  return {
    ...base,
    primary_color: t.primary_color || base.primary_color,
    secondary_color: t.primary_color || base.secondary_color,
    background_color: t.background_color || base.background_color,
    text_color: t.text_color || base.text_color,
    font_family: t.font_family || base.font_family,
    logo_url: t.logo_url ?? base.logo_url,
  };
}

// Estende UpdateFunnelInput para incluir appearance (declaração mesclada)
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UpdateFunnelInput {
  appearance?: FunnelAppearance;
}

