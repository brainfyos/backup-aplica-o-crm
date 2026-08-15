import {
  LayoutDashboard,
  Package,
  Users,
  TrendingUp,
  DollarSign,
  Target,
  Settings,
  Bell,
  LayoutGrid,
  MessageSquare,
  MessageCircle,
  BarChart3,
  CalendarDays,
  Zap,
  Webhook,
  FileText,
  Bot,
  Building2,
  Plug,
  Tag,
  Clock,
  CreditCard,
  LifeBuoy,
  Sparkles,
  SlidersHorizontal,
  Briefcase,
  Banknote,
  Megaphone,
  Code2,
  ListChecks,
  Filter,
  Activity,
  Route,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  History,
  BookOpen,
  Mic,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AdminMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
  /**
   * Quando `true`, o item só aparece para perfis com role `admin` ou
   * `super_admin`. Usado em áreas técnicas (Rastreamento, Conversões,
   * Atribuição) que exigem contexto de configuração.
   */
  adminOnly?: boolean;
  /** Feature efetiva necessária para exibir a seção durante rollouts controlados. */
  featureKey?: string;
}

export interface AdminMenuGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AdminMenuItem[];
}

// Itens fixos (sempre visíveis, sem accordion)
export const fixedItems: AdminMenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'mia', label: 'Mia', icon: Sparkles, featureKey: 'mia' },
  { id: 'pipeline', label: 'Pipeline', icon: LayoutGrid },
  { id: 'leads', label: 'Leads', icon: Target },
  { id: 'calendar', label: 'Agenda', icon: CalendarDays },

];

// Grupos em accordion
export const menuGroups: AdminMenuGroup[] = [
  {
    id: 'inbox',
    label: 'Atendimentos',
    icon: MessageSquare,
    items: [
      { id: 'inbox-chat', label: 'Chat', icon: MessageSquare },
      { id: 'inbox-panel', label: 'Painel', icon: LayoutGrid },
      { id: 'inbox-radar', label: 'Radar IA', icon: Sparkles },
      { id: 'inbox-followup', label: 'Follow-Up', icon: Zap },
      { id: 'inbox-reports', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    id: 'automation',
    label: 'Automação & IA',
    icon: Sparkles,
    items: [
      { id: 'agents', label: 'Agentes IA', icon: Bot },
      { id: 'campaigns', label: 'Campanhas Inteligentes', icon: Megaphone },
      { id: 'cadences', label: 'Cadências Inteligentes', icon: Sparkles },
      { id: 'instagram-automations', label: 'Fluxos do Instagram', icon: MessageCircle },
      { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    ],
  },
  {
    id: 'capture-channels',
    label: 'Captação',
    icon: Filter,
    items: [
      { id: 'capture-quiz', label: 'Quiz', icon: ListChecks },
      { id: 'capture-forms', label: 'Formulários', icon: FileText },
      { id: 'capture-seller-form', label: 'Form Vendedores', icon: FileText },
      { id: 'capture-chatbot', label: 'ChatBot', icon: MessageCircle },
      { id: 'capture-voice-call', label: 'Ligação Web', icon: PhoneCall },
      { id: 'capture-widget', label: 'Widget', icon: Code2 },
      { id: 'capture-whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { id: 'capture-templates', label: 'Templates', icon: LayoutGrid },
      { id: 'capture-results', label: 'Resultados', icon: Target },
      { id: 'capture-analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    items: [
      { id: 'marketing-overview', label: 'Visão Geral', icon: LayoutDashboard },
      { id: 'marketing-create', label: 'Criar Campanha', icon: Sparkles, adminOnly: true },
      { id: 'marketing-meta', label: 'Meta Ads', icon: Megaphone },
      { id: 'marketing-journey', label: 'Jornada do Lead', icon: Route },
      { id: 'marketing-attribution', label: 'Atribuição', icon: Target, adminOnly: true },
      { id: 'marketing-conversions', label: 'Conversões', icon: Zap, adminOnly: true },
      { id: 'marketing-insights', label: 'Insights', icon: BarChart3 },
      { id: 'marketing-optimizations', label: 'Otimizações com IA', icon: Sparkles },
      { id: 'marketing-tracking', label: 'Rastreamento', icon: Code2, adminOnly: true },
    ],
  },

  {
    id: 'management',
    label: 'Gestão',
    icon: Briefcase,
    items: [
      { id: 'products', label: 'Negócios', icon: Package },
      { id: 'sectors', label: 'Setores', icon: SlidersHorizontal },
      { id: 'team', label: 'Equipes', icon: Users },
      { id: 'operation', label: 'Central de Operação', icon: Activity },
      { id: 'financial', label: 'Financeiro', icon: DollarSign },
      { id: 'payments', label: 'Pagamentos', icon: Banknote },
    ],
  },
  {
    id: 'settings',
    label: 'Configurações',
    icon: Settings,
    items: [
      { id: 'connections', label: 'Conexões', icon: Plug },
      { id: 'integrations', label: 'Integrações', icon: Settings },
      { id: 'quick-replies', label: 'Respostas Rápidas', icon: MessageSquare },
      { id: 'custom-fields', label: 'Campos personalizados', icon: FileText },
      { id: 'tags', label: 'Etiquetas', icon: Tag },
      { id: 'notifications', label: 'Notificações', icon: Bell },
      { id: 'schedules', label: 'Horários', icon: Clock },
      { id: 'company', label: 'Empresa', icon: Building2 },
      { id: 'plan', label: 'Plano', icon: CreditCard },
      { id: 'support', label: 'Suporte', icon: LifeBuoy },
    ],
  },
];

export const allMenuItems: AdminMenuItem[] = [
  ...fixedItems,
  ...menuGroups.flatMap((g) => g.items),
];

// Helper: encontra o id do grupo que contém a seção ativa (para abrir o accordion)
export function findGroupIdForSection(sectionId: string): string | undefined {
  return menuGroups.find((g) => g.items.some((i) => i.id === sectionId))?.id;
}
