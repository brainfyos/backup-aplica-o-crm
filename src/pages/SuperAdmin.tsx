import { useState } from 'react';
import { SuperAdminSidebar } from '@/components/superadmin/SuperAdminSidebar';
import { SuperAdminDashboard } from '@/components/superadmin/SuperAdminDashboard';
import { OrganizationsManager } from '@/components/superadmin/OrganizationsManager';
import { OrganizationDetailPage } from '@/components/superadmin/OrganizationDetailPage';
import { UsersManager } from '@/components/superadmin/UsersManager';
import { SubscriptionsManager } from '@/components/superadmin/SubscriptionsManager';
import { BillingManager } from '@/components/superadmin/BillingManager';
import { PlatformSettings } from '@/components/superadmin/PlatformSettings';
import { EmailSettings } from '@/components/superadmin/EmailSettings';
import { AuditLogs } from '@/components/superadmin/AuditLogs';
import { SystemHealth } from '@/components/superadmin/SystemHealth';
import { SalesLeadsManager } from '@/components/superadmin/SalesLeadsManager';
import { EvolutionManager } from '@/components/superadmin/EvolutionManager';
import { PlansManager } from '@/components/superadmin/PlansManager';
import { PlatformAIKeysManager } from '@/components/superadmin/PlatformAIKeysManager';
import { PlatformAIUsageDashboard } from '@/components/superadmin/PlatformAIUsageDashboard';
import { VoicePricingManager } from '@/components/superadmin/VoicePricingManager';
import { MetaOAuthSettings } from '@/components/superadmin/MetaOAuthSettings';
import { PushVapidTab } from '@/components/superadmin/PushVapidTab';
import { PlatformParityTab } from '@/components/superadmin/PlatformParityTab';






import { CaktoSuperAdminPanel } from '@/components/superadmin/payments/CaktoSuperAdminPanel';
import { DocsManager } from '@/components/superadmin/DocsManager';
import { SupportTickets } from '@/components/admin/support/SupportTickets';
import { AgentToolExecutionsPanel } from '@/components/superadmin/AgentToolExecutionsPanel';
import { AIQualityPanel } from '@/components/superadmin/AIQualityPanel';
import { OperationsControlCenter } from '@/components/superadmin/OperationsControlCenter';


export default function SuperAdmin() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const handleViewOrganization = (orgId: string) => {
    setSelectedOrgId(orgId);
    setActiveSection('org-detail');
  };

  const handleBackFromOrgDetail = () => {
    setSelectedOrgId(null);
    setActiveSection('organizations');
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <SuperAdminDashboard onNavigate={setActiveSection} />;
      case 'organizations':
        return <OrganizationsManager onViewOrganization={handleViewOrganization} />;
      case 'org-detail':
        return selectedOrgId ? (
          <OrganizationDetailPage orgId={selectedOrgId} onBack={handleBackFromOrgDetail} />
        ) : null;
      case 'users':
        return <UsersManager />;
      case 'plans':
        return <PlansManager />;
      case 'ai-keys':
        return <PlatformAIKeysManager />;
      case 'ai-usage':
        return <PlatformAIUsageDashboard />;
      case 'voice-pricing':
        return <VoicePricingManager />;
      case 'meta-oauth':
        return <MetaOAuthSettings />;





      case 'subscriptions':
        return <SubscriptionsManager />;
      case 'billing':
        return <BillingManager />;
      case 'payments':
        return <CaktoSuperAdminPanel />;
      case 'branding':
        return <PlatformSettings />;
      case 'email':
        return <EmailSettings />;
      case 'push':
        return <PushVapidTab />;
      case 'audit':
        return <AuditLogs />;
      case 'health':
        return <SystemHealth />;
      case 'operations-control':
        return <OperationsControlCenter />;
      case 'parity':
        return <PlatformParityTab />;

      case 'sales-leads':
        return <SalesLeadsManager />;
      case 'whatsapp':
        return <EvolutionManager />;
      case 'docs':
        return <DocsManager />;
      case 'support':
        return <SupportTickets scope="super_admin" />;
      case 'agent-tools':
        return <AgentToolExecutionsPanel />;
      case 'ai-quality':
        return <AIQualityPanel />;
      default:
        return <SuperAdminDashboard onNavigate={setActiveSection} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Wizard teleguiado desativado: a orientação é feita pelas aulas + checklist do dashboard. */}
      <SuperAdminSidebar 
        activeSection={activeSection} 
        onSectionChange={setActiveSection} 
      />
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto pt-[calc(3.5rem+env(safe-area-inset-top)+1rem)] lg:pt-6 min-w-0">
        {renderContent()}
      </main>
    </div>
  );
}
