// Types for Vendus Forms - Lead Capture Engine

export type FormStatus = 'draft' | 'active' | 'paused' | 'archived';
export type DistributionRule = 'manual' | 'round_robin' | 'squad' | 'user';
export type FormBlockType = 
  | 'text' | 'email' | 'phone' | 'number' | 'textarea'
  | 'select' | 'multi_select' | 'yes_no' | 'scale'
  | 'conditional' | 'score' | 'tag' | 'hidden_field'
  | 'ai_question' | 'ai_followup'
  | 'welcome_screen' | 'end_screen'
  // Mídia (somente apresentação, não geram resposta)
  | 'image' | 'video_upload' | 'video_embed' | 'carousel' | 'divider';

export type TemplateCategory = 'general' | 'qualification' | 'diagnostic' | 'pre_sale' | 'feedback' | 'survey';

export type FormLayoutType = 'one_per_step' | 'all_in_one';
export type FormProgressPosition = 'top' | 'below_logo' | 'bottom' | 'none';
export type FormLogoSize = 'sm' | 'md' | 'lg' | 'xl';
export type FormLogoPosition = 'left' | 'center' | 'right';

export type FormHeadingWeight = 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';
export type FormHeadingTransform = 'none' | 'uppercase';
export type FormLetterSpacing = 'tighter' | 'tight' | 'normal' | 'wide' | 'widest';

export interface FormTheme {
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  border_radius: string;
  button_style: 'filled' | 'outlined' | 'text';
  logo_url: string | null;
  logo_size?: FormLogoSize;
  logo_position?: FormLogoPosition;
  show_progress: boolean;
  progress_color?: string | null;
  progress_position?: FormProgressPosition;
  layout_type?: FormLayoutType;
  redirect_url: string | null;
  // Typography of headings/questions (optional, retro-compatible)
  heading_font_family?: string | null;
  heading_weight?: FormHeadingWeight;
  heading_transform?: FormHeadingTransform;
  heading_letter_spacing?: FormLetterSpacing;
}

export interface TemperatureThresholds {
  /** Score mínimo para ser considerado "morno" (warm). */
  warm_min: number;
  /** Score mínimo para ser considerado "quente" (hot). */
  hot_min: number;
}

export interface FormSettings {
  show_branding: boolean;
  allow_multiple_submissions: boolean;
  notify_on_submission: boolean;
  auto_create_lead: boolean;
  /** Optional: id of a block to render as the "thank you" screen after submit. Replaces the default end_screen. */
  final_block_id?: string | null;
  /** Tags applied to the lead when the form is submitted. */
  submit_tag_ids?: string[];
  /** Faixas para classificar o lead em frio/morno/quente pelo score acumulado. */
  temperature_thresholds?: TemperatureThresholds;
}

export interface RoundRobinConfig {
  users: string[];
  current_index: number;
}

export interface CustomScripts {
  header: string;
  footer: string;
}

export interface ScoreRule {
  value?: string | boolean | number;
  min?: number;
  max?: number;
  score: number;
}

export interface LogicRule {
  field_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string | number | boolean;
  action: 'show' | 'hide' | 'skip_to';
  target_block_id?: string;
}

// Per-option actions (routing/automation triggered when the option is chosen).
// Stored inline on the option; backend processes the union of actions from all
// selected options on submit.
export type FormOptionAction =
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
      /** Resolved at submit time by the client (option label/value or static). Backend reads this. */
      _value?: string;
    };

export interface SelectOption {
  value: string;
  label: string;
  actions?: FormOptionAction[];
  /** Pontos somados ao score do lead quando esta opção é escolhida. */
  score?: number;
}

export interface ScaleOptions {
  min: number;
  max: number;
  min_label?: string;
  max_label?: string;
}

// Phase 2 — CRM automations per block
export type AutomationOperator = 'any' | 'equals' | 'contains' | 'gte' | 'lte';
export type LeadTemperature = 'cold' | 'warm' | 'hot';

export interface FormBlockAutomation {
  id?: string;
  when?: { operator: AutomationOperator; value?: string | number | boolean };
  add_tag_ids?: string[];
  remove_tag_ids?: string[];
  set_stage_id?: string | null;
  set_temperature?: LeadTemperature | null;
  add_score?: number;
}

export interface FormBlockCrmSettings {
  // Always-on actions whenever block is answered
  add_tag_ids?: string[];
  set_stage_id?: string | null;
  set_temperature?: LeadTemperature | null;
  custom_field_key?: string | null;
  // Conditional rules
  automations?: FormBlockAutomation[];
}

export interface FormBlock {
  id: string;
  form_id: string;
  order_index: number;
  block_type: FormBlockType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options: SelectOption[] | ScaleOptions;
  logic_rules: LogicRule[];
  maps_to?: string;
  score_value: number;
  score_rules: ScoreRule[];
  apply_tags: string[];
  validation: Record<string, unknown>;
  block_settings: Record<string, unknown>;
  created_at?: string;
}

export interface Form {
  id: string;
  organization_id: string;
  product_id: string;
  name: string;
  description?: string;
  slug: string;
  status: FormStatus;
  distribution_rule: DistributionRule;
  assigned_squad_id?: string;
  assigned_user_id?: string;
  default_temperature: string;
  round_robin_config: RoundRobinConfig;
  theme: FormTheme;
  facebook_pixel_id?: string;
  google_tag_id?: string;
  custom_scripts: CustomScripts;
  utm_capture: boolean;
  settings: FormSettings;
  created_by?: string;
  created_at: string;
  updated_at: string;
  views_count: number;
  submissions_count: number;
  // Joined data
  products?: { name: string };
}

export interface FormSubmission {
  id: string;
  form_id: string;
  lead_id?: string;
  responses: Record<string, unknown>;
  total_score: number;
  tags: string[];
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer_url?: string;
  landing_page?: string;
  user_agent?: string;
  ip_address?: string;
  geo_country?: string;
  geo_city?: string;
  status: 'started' | 'abandoned' | 'completed';
  started_at: string;
  completed_at?: string;
  step_analytics: StepAnalytic[];
  time_spent_seconds: number;
  created_at: string;
}

export interface StepAnalytic {
  block_id: string;
  viewed_at: string;
  answered_at?: string;
  time_spent_ms: number;
}

export interface FormTemplate {
  id: string;
  organization_id?: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  thumbnail_url?: string;
  blocks: Partial<FormBlock>[];
  theme: Partial<FormTheme>;
  settings: Partial<FormSettings>;
  is_public: boolean;
  is_system: boolean;
  usage_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Block configuration for the palette
export interface BlockConfig {
  type: FormBlockType;
  label: string;
  icon: string;
  category: 'input' | 'selection' | 'logic' | 'advanced' | 'screen' | 'media';
  defaultProps: Partial<FormBlock>;
}

export const BLOCK_CONFIGS: BlockConfig[] = [
  // Screens
  { type: 'welcome_screen', label: 'Tela de Boas-vindas', icon: 'Hand', category: 'screen', defaultProps: { label: 'Bem-vindo!', description: 'Responda algumas perguntas rápidas.' } },
  { type: 'end_screen', label: 'Tela Final', icon: 'CheckCircle', category: 'screen', defaultProps: { label: 'Obrigado!', description: 'Entraremos em contato em breve.' } },
  
  // Inputs
  { type: 'text', label: 'Texto Curto', icon: 'Type', category: 'input', defaultProps: { label: 'Qual é o seu nome?', placeholder: 'Digite aqui...', maps_to: 'name' } },
  { type: 'email', label: 'Email', icon: 'Mail', category: 'input', defaultProps: { label: 'Qual é o seu email?', placeholder: 'seu@email.com', maps_to: 'email', required: true } },
  { type: 'phone', label: 'Telefone', icon: 'Phone', category: 'input', defaultProps: { label: 'Qual é o seu telefone?', placeholder: '(00) 00000-0000', maps_to: 'phone' } },
  { type: 'number', label: 'Número', icon: 'Hash', category: 'input', defaultProps: { label: 'Quantos funcionários?', placeholder: '0' } },
  { type: 'textarea', label: 'Texto Longo', icon: 'AlignLeft', category: 'input', defaultProps: { label: 'Conte-nos mais sobre sua necessidade', placeholder: 'Descreva aqui...', maps_to: 'notes' } },
  
  // Selection
  { type: 'select', label: 'Seleção Única', icon: 'List', category: 'selection', defaultProps: { label: 'Escolha uma opção', options: [{ value: 'option1', label: 'Opção 1' }, { value: 'option2', label: 'Opção 2' }] } },
  { type: 'multi_select', label: 'Seleção Múltipla', icon: 'ListChecks', category: 'selection', defaultProps: { label: 'Selecione as opções', options: [{ value: 'option1', label: 'Opção 1' }, { value: 'option2', label: 'Opção 2' }] } },
  { type: 'yes_no', label: 'Sim ou Não', icon: 'ToggleLeft', category: 'selection', defaultProps: { label: 'Você tem interesse?' } },
  { type: 'scale', label: 'Escala', icon: 'SlidersHorizontal', category: 'selection', defaultProps: { label: 'De 1 a 10, como avalia?', options: { min: 1, max: 10 } } },
  
  // Logic
  { type: 'conditional', label: 'Condicional', icon: 'GitBranch', category: 'logic', defaultProps: { label: 'Condição' } },
  { type: 'score', label: 'Pontuação', icon: 'Target', category: 'logic', defaultProps: { label: 'Adicionar Score', score_value: 10 } },
  { type: 'tag', label: 'Tag', icon: 'Tag', category: 'logic', defaultProps: { label: 'Adicionar Tag', apply_tags: ['qualificado'] } },
  { type: 'hidden_field', label: 'Campo Oculto', icon: 'EyeOff', category: 'logic', defaultProps: { label: 'UTM Source', maps_to: 'utm_source' } },
  
  // Advanced
  { type: 'ai_question', label: 'Pergunta IA', icon: 'Sparkles', category: 'advanced', defaultProps: { label: 'Pergunta adaptativa da IA' } },
  { type: 'ai_followup', label: 'Follow-up IA', icon: 'MessageSquarePlus', category: 'advanced', defaultProps: { label: 'Pergunta de acompanhamento' } },

  // Mídia
  { type: 'image', label: 'Imagem', icon: 'Image', category: 'media', defaultProps: { label: 'Imagem', block_settings: { url: '', alt: '', link: '', width: 'full' } } },
  { type: 'video_upload', label: 'Vídeo (upload)', icon: 'Video', category: 'media', defaultProps: { label: 'Vídeo', block_settings: { url: '', autoplay: false, controls: true, loop: false } } },
  { type: 'video_embed', label: 'Vídeo (YouTube/Vimeo)', icon: 'Youtube', category: 'media', defaultProps: { label: 'Vídeo embed', block_settings: { url: '', autoplay: false } } },
  { type: 'carousel', label: 'Carrossel', icon: 'Images', category: 'media', defaultProps: { label: 'Carrossel', block_settings: { images: [] } } },
  { type: 'divider', label: 'Divisor', icon: 'Minus', category: 'media', defaultProps: { label: 'Divisor', block_settings: { style: 'line' } } },
];

/**
 * Converte URL do YouTube/Vimeo/Loom para URL de embed.
 * Retorna null se não reconhecer o formato.
 */
export function toEmbedUrl(raw: string, opts?: { autoplay?: boolean }): string | null {
  if (!raw) return null;
  const url = raw.trim();
  const autoplay = opts?.autoplay ? 1 : 0;

  // YouTube
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) {
    return `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1&autoplay=${autoplay}${autoplay ? '&mute=1' : ''}`;
  }

  // Vimeo
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) {
    return `https://player.vimeo.com/video/${vm[1]}?autoplay=${autoplay}${autoplay ? '&muted=1' : ''}`;
  }

  // Loom
  const loom = url.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/);
  if (loom) {
    return `https://www.loom.com/embed/${loom[1]}${autoplay ? '?autoplay=1' : ''}`;
  }

  return null;
}

export const MEDIA_BLOCK_TYPES: FormBlockType[] = ['image', 'video_upload', 'video_embed', 'carousel', 'divider'];
export function isMediaBlock(type: FormBlockType) {
  return MEDIA_BLOCK_TYPES.includes(type);
}

// Helper to get block config
export function getBlockConfig(type: FormBlockType): BlockConfig | undefined {
  return BLOCK_CONFIGS.find(b => b.type === type);
}

// Helper to create a new block
export function createFormBlock(type: FormBlockType, formId: string, orderIndex: number): FormBlock {
  const config = getBlockConfig(type);
  return {
    id: crypto.randomUUID(),
    form_id: formId,
    order_index: orderIndex,
    block_type: type,
    label: config?.defaultProps.label || 'Nova Pergunta',
    description: config?.defaultProps.description,
    placeholder: config?.defaultProps.placeholder,
    required: config?.defaultProps.required || false,
    options: config?.defaultProps.options || [],
    logic_rules: [],
    maps_to: config?.defaultProps.maps_to,
    score_value: config?.defaultProps.score_value || 0,
    score_rules: [],
    apply_tags: config?.defaultProps.apply_tags || [],
    validation: {},
    block_settings: {},
  };
}

// Generate slug from name
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
