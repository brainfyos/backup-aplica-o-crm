import { useState, Suspense, useEffect, useTransition, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { MobileAdminLayout } from '@/components/admin/MobileAdminLayout';
import { ComingSoonSection } from '@/components/admin/ComingSoonSection';
import { SectionErrorBoundary } from '@/components/admin/SectionErrorBoundary';
import { lazyWithRetry, prefetch, onIdle } from '@/lib/lazyWithRetry';
import { allMenuItems } from '@/config/adminMenu';
import { OnboardingBanner } from '@/components/onboarding/OnboardingBanner';

// Factories nomeadas para podermos reutilizá-las no prefetch on-hover.
const f = {
  OperationCenter: () => import('@/components/admin/operation/OperationCenter').then(m => ({ default: m.OperationCenter })),
  AdminDashboard: () => import('@/components/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })),
  TeamManager: () => import('@/components/admin/TeamManager').then(m => ({ default: m.TeamManager })),
  FinancialDashboard: () => import('@/components/admin/FinancialDashboard').then(m => ({ default: m.FinancialDashboard })),
  CalendarManager: () => import('@/components/admin/CalendarManager').then(m => ({ default: m.CalendarManager })),
  IntegrationsManager: () => import('@/components/admin/integrations/IntegrationsManager').then(m => ({ default: m.IntegrationsManager })),
  NotificationManager: () => import('@/components/admin/NotificationManager').then(m => ({ default: m.NotificationManager })),
  ProductListPage: () => import('@/components/admin/products/ProductListPage').then(m => ({ default: m.ProductListPage })),
  ProductDetailPage: () => import('@/components/admin/products/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })),
  LeadsManager: () => import('@/components/admin/leads/LeadsManager').then(m => ({ default: m.LeadsManager })),
  LeadJourneyPage: () => import('@/components/admin/journey/LeadJourneyPage').then(m => ({ default: m.LeadJourneyPage })),
  KanbanBoard: () => import('@/components/admin/kanban/KanbanBoard').then(m => ({ default: m.KanbanBoard })),
  InboxManager: () => import('@/components/admin/InboxManager').then(m => ({ default: m.InboxManager })),
  FollowupPanel: () => import('@/components/admin/followup/FollowupPanel').then(m => ({ default: m.FollowupPanel })),
  ReportsManager: () => import('@/components/admin/reports/ReportsManager').then(m => ({ default: m.ReportsManager })),
  
  WebhooksManager: () => import('@/components/admin/webhooks/WebhooksManager').then(m => ({ default: m.WebhooksManager })),
  CustomFieldsManager: () => import('@/components/admin/CustomFieldsManager').then(m => ({ default: m.CustomFieldsManager })),
  AgentsManager: () => import('@/components/admin/agents/AgentsManager').then(m => ({ default: m.AgentsManager })),
  SectorsManager: () => import('@/components/admin/sectors/SectorsManager').then(m => ({ default: m.SectorsManager })),
  PlanSelector: () => import('@/components/admin/plan/PlanSelector').then(m => ({ default: m.PlanSelector })),
  CaktoAdminPanel: () => import('@/components/admin/payments/CaktoAdminPanel').then(m => ({ default: m.CaktoAdminPanel })),
  EvolutionInstancesPanel: () => import('@/components/admin/integrations/EvolutionInstancesPanel').then(m => ({ default: m.EvolutionInstancesPanel })),
  UnifiedConnectionsPanel: () => import('@/components/admin/integrations/UnifiedConnectionsPanel').then(m => ({ default: m.UnifiedConnectionsPanel })),
  TagsManager: () => import('@/components/admin/tags/TagsManager').then(m => ({ default: m.TagsManager })),
  BusinessHoursManager: () => import('@/components/admin/schedules/BusinessHoursManager').then(m => ({ default: m.BusinessHoursManager })),
  CompanySettings: () => import('@/components/admin/company/CompanySettings').then(m => ({ default: m.CompanySettings })),
  SupportTickets: () => import('@/components/admin/support/SupportTickets').then(m => ({ default: m.SupportTickets })),
  QuickRepliesManager: () => import('@/components/admin/QuickRepliesManager').then(m => ({ default: m.QuickRepliesManager })),
  CampaignsManager: () => import('@/components/admin/campaigns/CampaignsManager').then(m => ({ default: m.CampaignsManager })),
  CadencesManager: () => import('@/components/admin/cadences/CadencesManager').then(m => ({ default: m.CadencesManager })),
  ChatBotSection: () => import('@/components/admin/capture/channels/ChatBotSection').then(m => ({ default: m.ChatBotSection })),
  WhatsAppSection: () => import('@/components/admin/capture/channels/WhatsAppSection').then(m => ({ default: m.WhatsAppSection })),
  FormsSection: () => import('@/components/admin/capture/channels/FormsSection').then(m => ({ default: m.FormsSection })),
  WidgetSection: () => import('@/components/admin/capture/channels/WidgetSection').then(m => ({ default: m.WidgetSection })),
  QuizSection: () => import('@/components/admin/capture/channels/QuizSection').then(m => ({ default: m.QuizSection })),
  CaptureReportsSection: () => import('@/components/admin/capture/channels/CaptureReportsSection').then(m => ({ default: m.CaptureReportsSection })),
  CaptureTemplatesSection: () => import('@/components/admin/capture/channels/CaptureTemplatesSection').then(m => ({ default: m.CaptureTemplatesSection })),
  CaptureResultsSection: () => import('@/components/admin/capture/channels/CaptureResultsSection').then(m => ({ default: m.CaptureResultsSection })),
  CaptureAnalyticsSection: () => import('@/components/admin/capture/channels/CaptureAnalyticsSection').then(m => ({ default: m.CaptureAnalyticsSection })),
  SellerLeadFormManager: () => import('@/components/admin/seller-form/SellerLeadFormManager').then(m => ({ default: m.SellerLeadFormManager })),
  MarketingManager: () => import('@/components/admin/marketing/MarketingManager').then(m => ({ default: m.MarketingManager })),
  MktOverviewSection: () => import('@/components/admin/marketing/sections/OverviewSection').then(m => ({ default: m.OverviewSection })),
  MktMetaSection: () => import('@/components/admin/marketing/sections/MetaSection').then(m => ({ default: m.MetaSection })),
  MktJourneySection: () => import('@/components/admin/marketing/sections/JourneySection').then(m => ({ default: m.JourneySection })),
  MktAttributionSection: () => import('@/components/admin/marketing/sections/AttributionSection').then(m => ({ default: m.AttributionSection })),
  MktConversionsSection: () => import('@/components/admin/marketing/sections/ConversionsSection').then(m => ({ default: m.ConversionsSection })),
  MktInsightsSection: () => import('@/components/admin/marketing/sections/InsightsSection').then(m => ({ default: m.InsightsSection })),
  MktOptimizationsSection: () => import('@/components/admin/marketing/sections/OptimizationsSection').then(m => ({ default: m.OptimizationsSection })),
  MktTrackingSection: () => import('@/components/admin/marketing/sections/TrackingSection').then(m => ({ default: m.TrackingSection })),
  MktCreateCampaignSection: () => import('@/components/admin/marketing/sections/CreateCampaignSection').then(m => ({ default: m.CreateCampaignSection })),
  InstagramAutomationsSection: () => import('@/components/admin/instagram/InstagramAutomationsSection').then(m => ({ default: m.InstagramAutomationsSection })),
  VoiceDashboardTab: () => import('@/components/admin/voice/VoiceDashboardTab').then(m => ({ default: m.VoiceDashboardTab })),
  VoiceHistoryTab: () => import('@/components/admin/voice/VoiceHistoryTab').then(m => ({ default: m.VoiceHistoryTab })),
  VoiceAgentsTab: () => import('@/components/admin/voice/VoiceAgentsTab').then(m => ({ default: m.VoiceAgentsTab })),
  VoiceInboundTab: () => import('@/components/admin/voice/VoiceInboundTab').then(m => ({ default: m.VoiceInboundTab })),
  VoiceContextsTab: () => import('@/components/admin/voice/VoiceContextsTab').then(m => ({ default: m.VoiceContextsTab })),
  VoiceCampaignsTab: () => import('@/components/admin/voice/VoiceCampaignsTab').then(m => ({ default: m.VoiceCampaignsTab })),
  VoiceUsageTab: () => import('@/components/admin/voice/VoiceUsageTab').then(m => ({ default: m.VoiceUsageTab })),
  VoiceLiveTab: () => import('@/components/admin/voice/VoiceLiveTab').then(m => ({ default: m.VoiceLiveTab })),
  VoiceVoicesTab: () => import('@/components/admin/voice/VoiceVoicesTab').then(m => ({ default: m.VoiceVoicesTab })),
  VoiceWebhooksTab: () => import('@/components/admin/voice/VoiceWebhooksTab').then(m => ({ default: m.VoiceWebhooksTab })),
  VoicePlaceholder: () => import('@/components/admin/voice/VoicePlaceholder').then(m => ({ default: m.VoicePlaceholder })),
  VoiceHub: () => import('@/components/admin/voice/VoiceHub').then(m => ({ default: m.VoiceHub })),
  VoiceCallsManager: () => import('@/components/admin/capture/voicecall/VoiceCallsPage').then(m => ({ default: m.VoiceCallsPage })),
  AdminMia: () => import('@/components/mia/AdminMia').then(m => ({ default: m.AdminMia })),



};

// Lazy components (com retry + cache compartilhado para prefetch).
const OperationCenter = lazyWithRetry(f.OperationCenter);
const TeamManager = lazyWithRetry(f.TeamManager);
const FinancialDashboard = lazyWithRetry(f.FinancialDashboard);
const CalendarManager = lazyWithRetry(f.CalendarManager);
const IntegrationsManager = lazyWithRetry(f.IntegrationsManager);
const NotificationManager = lazyWithRetry(f.NotificationManager);
const ProductListPage = lazyWithRetry(f.ProductListPage);
const ProductDetailPage = lazyWithRetry(f.ProductDetailPage);
const LeadsManager = lazyWithRetry(f.LeadsManager);
const LeadJourneyPage = lazyWithRetry(f.LeadJourneyPage);
const KanbanBoard = lazyWithRetry(f.KanbanBoard);
const InboxManager = lazyWithRetry(f.InboxManager);
const FollowupPanel = lazyWithRetry(f.FollowupPanel);
const ReportsManager = lazyWithRetry(f.ReportsManager);

const WebhooksManager = lazyWithRetry(f.WebhooksManager);
const CustomFieldsManager = lazyWithRetry(f.CustomFieldsManager);
const AgentsManager = lazyWithRetry(f.AgentsManager);
const SectorsManager = lazyWithRetry(f.SectorsManager);
const PlanSelector = lazyWithRetry(f.PlanSelector);
const CaktoAdminPanel = lazyWithRetry(f.CaktoAdminPanel);
const EvolutionInstancesPanel = lazyWithRetry(f.EvolutionInstancesPanel);
const UnifiedConnectionsPanel = lazyWithRetry(f.UnifiedConnectionsPanel);
const TagsManager = lazyWithRetry(f.TagsManager);
const BusinessHoursManager = lazyWithRetry(f.BusinessHoursManager);
const CompanySettings = lazyWithRetry(f.CompanySettings);
const SupportTickets = lazyWithRetry(f.SupportTickets);
const QuickRepliesManager = lazyWithRetry(f.QuickRepliesManager);
const CampaignsManager = lazyWithRetry(f.CampaignsManager);
const CadencesManager = lazyWithRetry(f.CadencesManager);
const ChatBotSection = lazyWithRetry(f.ChatBotSection);
const WhatsAppSection = lazyWithRetry(f.WhatsAppSection);
const FormsSection = lazyWithRetry(f.FormsSection);
const WidgetSection = lazyWithRetry(f.WidgetSection);
const QuizSection = lazyWithRetry(f.QuizSection);
const CaptureReportsSection = lazyWithRetry(f.CaptureReportsSection);
const CaptureTemplatesSection = lazyWithRetry(f.CaptureTemplatesSection);
const CaptureResultsSection = lazyWithRetry(f.CaptureResultsSection);
const CaptureAnalyticsSection = lazyWithRetry(f.CaptureAnalyticsSection);
const SellerLeadFormManager = lazyWithRetry(f.SellerLeadFormManager);
const MarketingManager = lazyWithRetry(f.MarketingManager);
const MktOverviewSection = lazyWithRetry(f.MktOverviewSection);
const MktMetaSection = lazyWithRetry(f.MktMetaSection);
const MktJourneySection = lazyWithRetry(f.MktJourneySection);
const MktAttributionSection = lazyWithRetry(f.MktAttributionSection);
const MktConversionsSection = lazyWithRetry(f.MktConversionsSection);
const MktInsightsSection = lazyWithRetry(f.MktInsightsSection);
const MktOptimizationsSection = lazyWithRetry(f.MktOptimizationsSection);
const MktTrackingSection = lazyWithRetry(f.MktTrackingSection);
const MktCreateCampaignSection = lazyWithRetry(f.MktCreateCampaignSection);
const InstagramAutomationsSection = lazyWithRetry(f.InstagramAutomationsSection);
const VoiceDashboardTab = lazyWithRetry(f.VoiceDashboardTab);
const VoiceHistoryTab = lazyWithRetry(f.VoiceHistoryTab);
const VoiceAgentsTab = lazyWithRetry(f.VoiceAgentsTab);
const VoiceInboundTab = lazyWithRetry(f.VoiceInboundTab);
const VoiceContextsTab = lazyWithRetry(f.VoiceContextsTab);
const VoiceCampaignsTab = lazyWithRetry(f.VoiceCampaignsTab);
const VoiceUsageTab = lazyWithRetry(f.VoiceUsageTab);
const VoiceLiveTab = lazyWithRetry(f.VoiceLiveTab);
const VoiceVoicesTab = lazyWithRetry(f.VoiceVoicesTab);
const VoiceWebhooksTab = lazyWithRetry(f.VoiceWebhooksTab);
const VoicePlaceholder = lazyWithRetry(f.VoicePlaceholder);
const VoiceHub = lazyWithRetry(f.VoiceHub);
const VoiceCallsManager = lazyWithRetry(f.VoiceCallsManager);
const AdminMia = lazyWithRetry(f.AdminMia);






/**
 * Mapa: id da seção → factory de import. Usado pelo prefetch on-hover
 * (AdminSidebar/MobileAdminLayout chamam `prefetchSection(id)`).
 */
const sectionFactories: Record<string, () => Promise<unknown>> = {
  dashboard: f.OperationCenter,
  
  leads: f.LeadsManager,
  pipeline: f.KanbanBoard,
  calendar: f.CalendarManager,
  mia: f.AdminMia,
  inbox: f.InboxManager,
  'inbox-chat': f.InboxManager,
  'inbox-panel': f.InboxManager,
  'inbox-radar': f.InboxManager,
  'inbox-followup': f.FollowupPanel,
  'inbox-reports': f.InboxManager,
  agents: f.AgentsManager,
  
  team: f.TeamManager,
  products: f.ProductListPage,
  operation: f.OperationCenter,
  financial: f.FinancialDashboard,
  notifications: f.NotificationManager,
  webhooks: f.WebhooksManager,
  'custom-fields': f.CustomFieldsManager,
  integrations: f.IntegrationsManager,
  sectors: f.SectorsManager,
  plan: f.PlanSelector,
  payments: f.CaktoAdminPanel,
  connections: f.UnifiedConnectionsPanel,
  tags: f.TagsManager,
  schedules: f.BusinessHoursManager,
  company: f.CompanySettings,
  support: f.SupportTickets,
  'quick-replies': f.QuickRepliesManager,
  campaigns: f.CampaignsManager,
  cadences: f.CadencesManager,
  'capture-chatbot': f.ChatBotSection,
  'capture-whatsapp': f.WhatsAppSection,
  'capture-forms': f.FormsSection,
  'capture-widget': f.WidgetSection,
  'capture-quiz': f.QuizSection,
  'capture-reports': f.CaptureReportsSection,
  'capture-analytics': f.CaptureReportsSection,
  'capture-seller-form': f.SellerLeadFormManager,
  marketing: f.MktOverviewSection,
  'marketing-overview': f.MktOverviewSection,
  'marketing-meta': f.MktMetaSection,
  'marketing-journey': f.MktJourneySection,
  'marketing-attribution': f.MktAttributionSection,
  'marketing-conversions': f.MktConversionsSection,
  'marketing-insights': f.MktInsightsSection,
  'marketing-optimizations': f.MktOptimizationsSection,
  'marketing-tracking': f.MktTrackingSection,
  'marketing-create': f.MktCreateCampaignSection,
  'instagram-automations': f.InstagramAutomationsSection,
  'capture-voice-call': f.VoiceCallsManager,
};

export function prefetchAdminSection(id: string) {
  const factory = sectionFactories[id];
  if (factory) prefetch(factory);
}

export default function Admin() {
  const { isAdmin, isManager, profile } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    async function check() {
      if (!profile?.organization_id || !isAdmin()) { setNeedsOnboarding(false); return; }
      const { supabase } = await import('@/integrations/supabase/client');
      const { data } = await supabase.from('organizations')
        .select('onboarding_completed_at, settings').eq('id', profile.organization_id).maybeSingle();
      if (!active) return;
      const settings = data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
        ? data.settings as Record<string, unknown>
        : {};
      const appliedAt = typeof settings.implantacao_applied_at === 'string'
        ? settings.implantacao_applied_at
        : null;
      const completed = !!data?.onboarding_completed_at || !!appliedAt;
      if (completed) {
        // Backfill legacy: garante que a coluna oficial fique preenchida para próximas verificações.
        if (!data?.onboarding_completed_at && appliedAt) {
          supabase.from('organizations')
            .update({ onboarding_completed_at: appliedAt })
            .eq('id', profile.organization_id)
            .then(() => {});
        }
        setNeedsOnboarding(false);
        return;
      }
      // Permite ignorar a implantação até 3 vezes (X fecha e conta uma exibição).
      const key = `implantacao_skip_count_${profile.organization_id}`;
      const skips = parseInt(localStorage.getItem(key) || '0', 10) || 0;
      setNeedsOnboarding(skips < 3);
    }
    check();
    return () => { active = false; };
  }, [profile?.organization_id, isAdmin]);
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'dashboard';
  const [activeSection, setActiveSection] = useState(initialTab);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Sincroniza tab da URL → estado (permite navegação programática via ?tab=plan)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeSection) {
      setActiveSection(tab);
    }
  }, [searchParams, activeSection]);

  // Prefetch agressivo: assim que o app carrega, baixamos no idle todas as
  // seções principais. O usuário sente "clicou, abriu".
  useEffect(() => {
    onIdle(() => {
      Object.values(f).forEach((factory) => prefetch(factory));
    }, 2500);
  }, []);

  const handleSectionChange = useCallback((id: string) => {
    // Garante que o chunk começa a baixar antes da transição (caso ainda
    // não tenha sido prefechado).
    prefetchAdminSection(id);
    // Mantém ?tab=... na URL para que reload preserve a seção atual.
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
    startTransition(() => setActiveSection(id));
  }, [searchParams, setSearchParams]);

  if (!isAdmin() && !isManager()) {
    return <Navigate to="/" replace />;
  }

  // Perfis manager/seller não podem acessar áreas técnicas de Marketing
  // (Atribuição, Conversões, Rastreamento). Sidebar já esconde os links,
  // mas fazemos um redirect defensivo para quem entra por URL direta.
  const MARKETING_ADMIN_ONLY = new Set([
    'marketing-attribution',
    'marketing-conversions',
    'marketing-tracking',
  ]);
  if (MARKETING_ADMIN_ONLY.has(activeSection) && !isAdmin()) {
    return <Navigate to="/admin?tab=marketing-overview" replace />;
  }
  if (needsOnboarding === true) {
    return <Navigate to="/admin/implantacao" replace />;
  }

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
  };

  const handleBackToProducts = () => {
    setSelectedProductId(null);
  };

  // Renderiza o conteúdo de UMA seção específica.
  const renderSection = (sectionId: string) => {
    if (sectionId === 'products' && selectedProductId) {
      return (
        <ProductDetailPage
          productId={selectedProductId}
          onBack={handleBackToProducts}
        />
      );
    }

    const menuItem = allMenuItems.find((i) => i.id === sectionId);
    if (menuItem?.comingSoon) {
      return <ComingSoonSection title={menuItem.label} />;
    }

    switch (sectionId) {
      case 'dashboard': return <OperationCenter />;
      
      case 'leads': return <LeadsManager />;
      case 'lead-journey': return <MktJourneySection />;
      case 'pipeline': return <KanbanBoard />;
      case 'calendar': return <CalendarManager />;
      case 'mia': return <AdminMia />;
      case 'inbox': return <InboxManager key="chat" section="chat" />;
      case 'inbox-chat': return <InboxManager key="chat" section="chat" />;
      case 'inbox-panel': return <InboxManager key="panel" section="panel" />;
      case 'inbox-radar': return <InboxManager key="radar" section="radar" />;
      case 'inbox-followup': return <FollowupPanel />;
      case 'inbox-reports': return <InboxManager key="reports" section="reports" />;
      case 'agents': return <AgentsManager />;
      
      case 'team': return <TeamManager />;
      case 'products': return <ProductListPage onProductSelect={handleProductSelect} />;
      case 'operation': return <OperationCenter />;
      case 'financial': return <FinancialDashboard />;
      case 'notifications': return <NotificationManager />;
      case 'webhooks': return <WebhooksManager />;
      case 'custom-fields': return <CustomFieldsManager />;
      case 'integrations': return <IntegrationsManager />;
      case 'sectors': return <SectorsManager />;
      case 'plan': return <PlanSelector />;
      case 'payments': return <CaktoAdminPanel />;
      case 'connections': return <UnifiedConnectionsPanel />;
      case 'tags': return <TagsManager />;
      case 'schedules': return <BusinessHoursManager />;
      case 'company': return <CompanySettings />;
      case 'support': return <SupportTickets scope="admin" />;
      case 'quick-replies': return <QuickRepliesManager />;
      case 'campaigns': return <CampaignsManager />;
      case 'cadences': return <CadencesManager />;
      case 'capture-chatbot': return <ChatBotSection />;
      case 'capture-whatsapp': return <WhatsAppSection />;
      case 'capture-forms': return <FormsSection />;
      case 'capture-widget': return <WidgetSection />;
      case 'capture-quiz': return <QuizSection />;
      case 'capture-voice-call': return <VoiceCallsManager />;
      case 'capture-seller-form': return <SellerLeadFormManager />;
      case 'marketing':
      case 'marketing-overview': return <MktOverviewSection />;
      case 'marketing-meta': return <MktMetaSection />;
      case 'marketing-journey': return <MktJourneySection />;
      case 'marketing-attribution': return <MktAttributionSection />;
      case 'marketing-conversions': return <MktConversionsSection />;
      case 'marketing-insights': return <MktInsightsSection />;
      case 'marketing-optimizations': return <MktOptimizationsSection />;
      case 'marketing-tracking': return <MktTrackingSection />;
      case 'marketing-create': return <MktCreateCampaignSection />;
      case 'marketing-legacy': return <MarketingManager />;
      case 'instagram-automations': return <InstagramAutomationsSection />;
      // Hub único — todas as antigas abas viraram sub-abas do Dashboard
      case 'voice-dashboard':
      case 'voice-history':
      case 'voice-inbound':
      case 'voice-live':
      case 'voice-usage':
        return <VoiceHub />;
      case 'voice-agents': return <VoiceAgentsTab />;
      case 'voice-campaigns': return <VoiceCampaignsTab />;
      // Removidos do menu (Contextos, Vozes/Clone, Webhooks internos) — mantemos fallback silencioso
      case 'voice-voices':
      case 'voice-contexts':
      case 'voice-webhooks':
        return <VoiceHub />;
      case 'capture-analytics':
        return <CaptureAnalyticsSection />;
      case 'capture-reports':
        return <CaptureReportsSection />;
      case 'capture-templates':
        return <CaptureTemplatesSection />;
      case 'capture-results':
        return <CaptureResultsSection />;
      default: return <OperationCenter />;
    }
  };

  // Só a seção visível permanece montada. Isso encerra subscriptions, timers e
  // polling das telas anteriores em vez de deixá-los consumindo o banco ocultos.
  const renderContent = () => (
    <SectionErrorBoundary sectionName={activeSection}>
      <Suspense fallback={null}>{renderSection(activeSection)}</Suspense>
    </SectionErrorBoundary>
  );

  if (isMobile) {
    return (
      <MobileAdminLayout
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      >
        <OnboardingBanner />
        {renderContent()}
      </MobileAdminLayout>
    );
  }

  return (
    <div className="min-h-screen bg-background flex w-full">
      <AdminSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
      <main className="flex-1 overflow-auto">
        <OnboardingBanner />
        <div className={activeSection.startsWith('inbox') ? 'px-4 pt-4 pb-4' : 'p-6'}>
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
