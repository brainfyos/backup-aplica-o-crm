// Mapeia destino escolhido pelo usuário → configuração da Meta.
export type CampaignDestination = 'whatsapp' | 'form' | 'quiz' | 'url';

export interface MetaObjectiveConfig {
  objective: string; // ex: OUTCOME_ENGAGEMENT
  optimization_goal: string;
  destination_type?: string; // WHATSAPP quando aplicável
  cta_type: string;
  friendly_label: string;
}

export const OBJECTIVE_MAP: Record<CampaignDestination, MetaObjectiveConfig> = {
  whatsapp: {
    objective: 'OUTCOME_ENGAGEMENT',
    optimization_goal: 'CONVERSATIONS',
    destination_type: 'WHATSAPP',
    cta_type: 'WHATSAPP_MESSAGE',
    friendly_label: 'Conversas no WhatsApp',
  },
  form: {
    objective: 'OUTCOME_LEADS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    cta_type: 'LEARN_MORE',
    friendly_label: 'Leads (formulário)',
  },
  quiz: {
    objective: 'OUTCOME_TRAFFIC',
    optimization_goal: 'LANDING_PAGE_VIEWS',
    cta_type: 'LEARN_MORE',
    friendly_label: 'Respostas do quiz',
  },
  url: {
    objective: 'OUTCOME_TRAFFIC',
    optimization_goal: 'LANDING_PAGE_VIEWS',
    cta_type: 'LEARN_MORE',
    friendly_label: 'Tráfego para página',
  },
};

export const DESTINATION_LABEL: Record<CampaignDestination, string> = {
  whatsapp: 'WhatsApp',
  form: 'Formulário',
  quiz: 'Quiz',
  url: 'Página externa',
};

export const UTM_TEMPLATE =
  'utm_source=FB&utm_medium={{adset.name}}|{{adset.id}}&utm_campaign={{campaign.name}}|{{campaign.id}}&utm_content={{ad.name}}|{{ad.id}}&utm_term={{placement}}';
