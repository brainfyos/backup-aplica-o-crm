import { useState, ReactNode, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileMoreMenu } from './MobileMoreMenu';
import { TaskAlerts } from '@/components/tasks/TaskAlerts';
import { OfflineBanner } from '@/components/mobile/OfflineBanner';
import { PullToRefreshIndicator } from '@/components/mobile/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { QuickActionsSheet, type QuickAction } from '@/components/mobile/QuickActionsSheet';
import { QuickTaskDialog } from '@/components/mobile/QuickTaskDialog';
import { SellerCreateLeadDialog, type SellerLeadSubmitData } from '@/components/mobile/SellerCreateLeadDialog';
import { EventModal } from '@/components/calendar/EventModal';
import { useCreateLead } from '@/hooks/useLeads';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

import { SplashScreen } from '@/components/mobile/SplashScreen';
import { MobileOnboarding } from '@/components/mobile/MobileOnboarding';
import { Tables } from '@/integrations/supabase/types';

type DBProduct = Tables<'products'>;


interface MobileLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  hasProduct: boolean;
  showBack?: boolean;
  onBack?: () => void;
  products?: DBProduct[];
  selectedProduct?: DBProduct | null;
  onSelectProduct?: (product: DBProduct) => void;
  /**
   * Quando true, o conteúdo ocupa a tela inteira (sem bottom-nav, sem padding,
   * sem scroll do main e sem pull-to-refresh). Use para telas tipo chat aberto.
   */
  fullBleed?: boolean;
}

const ONBOARDING_KEY = 'salesos_onboarding_completed';
const SPLASH_KEY = 'salesos_splash_shown';

export function MobileLayout({
  children,
  title,
  subtitle,
  activeTab,
  onTabChange,
  hasProduct,
  showBack,
  onBack,
  products,
  selectedProduct,
  onSelectProduct,
  fullBleed = false,
}: MobileLayoutProps) {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();
  const createLead = useCreateLead();

  const handleQuickAction = (action: QuickAction) => {
    if (action === 'create-lead') setCreateLeadOpen(true);
    else if (action === 'portfolio') onTabChange('portfolio');
    else if (action === 'new-task') setNewTaskOpen(true);
    else if (action === 'new-event') setNewEventOpen(true);
  };

  const handleCreateLead = async (data: SellerLeadSubmitData) => {
    if (!profile?.id || !profile?.organization_id) {
      toast({ title: 'Erro', description: 'Não foi possível identificar sua organização', variant: 'destructive' });
      return;
    }
    try {
      const hasCustom = Object.keys(data.custom_fields).length > 0;
      await createLead.mutateAsync({
        organization_id: profile.organization_id,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        company: data.company || null,
        position: data.position || null,
        temperature: data.temperature,
        lead_origin: data.lead_origin || null,
        lead_channel: data.lead_channel || null,
        product_id: selectedProduct?.id || null,
        assigned_to: profile.id,
        notes: data.notes || null,
        metadata: hasCustom
          ? ({
              custom_fields: data.custom_fields,
              custom_field_labels: data.custom_field_labels,
            } as any)
          : null,
      } as any);
      toast({ title: 'Cliente cadastrado', description: 'Lead criado na sua carteira.' });
      setCreateLeadOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Não foi possível criar o lead', variant: 'destructive' });
    }
  };



  const { containerRef, pullDistance, isRefreshing, canRefresh, progress } = usePullToRefresh({
    disabled: fullBleed,
    onRefresh: async () => {
      await queryClient.invalidateQueries();
    },
  });

  useEffect(() => {
    const splashShown = sessionStorage.getItem(SPLASH_KEY);
    const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY);

    if (!splashShown) {
      setShowSplash(true);
      sessionStorage.setItem(SPLASH_KEY, 'true');
    } else if (!onboardingCompleted) {
      setShowOnboarding(true);
    }
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
    const onboardingCompleted = localStorage.getItem(ONBOARDING_KEY);
    if (!onboardingCompleted) {
      setShowOnboarding(true);
    }
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboarding(false);
  };

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Splash Screen */}
      {showSplash && (
        <SplashScreen onComplete={handleSplashComplete} />
      )}

      {/* Onboarding */}
      {showOnboarding && (
        <MobileOnboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {/* Offline Banner */}
      <OfflineBanner />

      {/* Task Alerts */}
      <TaskAlerts />

      {!fullBleed && (
        <MobileHeader
          title={title}
          subtitle={subtitle}
          showBack={showBack}
          onBack={onBack}
          products={products}
          selectedProduct={selectedProduct}
          onSelectProduct={onSelectProduct}
        />
      )}

      <main
        ref={containerRef}
        className={
          fullBleed
            ? 'flex-1 min-h-0 overflow-hidden relative'
            : 'flex-1 overflow-auto pb-20 relative'
        }
        style={fullBleed ? undefined : { overscrollBehaviorY: 'none' }}
      >
        {!fullBleed && (
          <PullToRefreshIndicator
            pullDistance={pullDistance}
            isRefreshing={isRefreshing}
            canRefresh={canRefresh}
            progress={progress}
          />
        )}
        {children}
      </main>

      {!fullBleed && (
        <>
          <MobileBottomNav
            activeTab={activeTab}
            onTabChange={onTabChange}
            onMoreClick={() => setMoreMenuOpen(true)}
            onPlusClick={() => setQuickOpen(true)}
            hasProduct={hasProduct}
          />

          <MobileMoreMenu
            open={moreMenuOpen}
            onClose={() => setMoreMenuOpen(false)}
            activeTab={activeTab}
            onTabChange={onTabChange}
            hasProduct={hasProduct}
          />

          <QuickActionsSheet
            open={quickOpen}
            onOpenChange={setQuickOpen}
            onAction={handleQuickAction}
          />

          <SellerCreateLeadDialog
            open={createLeadOpen}
            onOpenChange={setCreateLeadOpen}
            onSubmit={handleCreateLead}
            isLoading={createLead.isPending}
          />

          <QuickTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} />


          <EventModal
            open={newEventOpen}
            onOpenChange={setNewEventOpen}
            defaultProductId={selectedProduct?.id}
          />
        </>
      )}
    </div>
  );
}
