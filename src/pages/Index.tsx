import { useState, useEffect, useCallback, useMemo, useRef, useTransition, lazy, Suspense } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformName } from '@/hooks/usePlatformName';
import { useProducts, useAssignedProducts } from '@/hooks/useProducts';
import { useCadence } from '@/hooks/useCadence';
import { useObjections } from '@/hooks/useObjections';
import { useMaterials } from '@/hooks/useMaterials';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { EmptyState } from '@/components/product/EmptyState';
import { TaskAlerts } from '@/components/tasks/TaskAlerts';
import { Loader2 } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { onIdle, prefetch } from '@/lib/lazyWithRetry';
import { useSuperAdminFirstAccess } from '@/hooks/useSuperAdminFirstAccess';

// Factories nomeadas para reaproveitar no prefetch.
const f = {
  CadenceView: () => import('@/components/cadence/CadenceView').then(m => ({ default: m.CadenceView })),
  PlaybookView: () => import('@/components/playbook/PlaybookView').then(m => ({ default: m.PlaybookView })),
  ObjectionsView: () => import('@/components/objections/ObjectionsView').then(m => ({ default: m.ObjectionsView })),
  MaterialsView: () => import('@/components/materials/MaterialsView').then(m => ({ default: m.MaterialsView })),
  AIChat: () => import('@/components/ai/AIChat').then(m => ({ default: m.AIChat })),
  LeadsKanban: () => import('@/components/seller/LeadsKanban').then(m => ({ default: m.LeadsKanban })),
  SellerPortfolio: () => import('@/components/seller/SellerPortfolio').then(m => ({ default: m.SellerPortfolio })),
  TaskCenter: () => import('@/components/seller/TaskCenter').then(m => ({ default: m.TaskCenter })),
  ActivityCenter: () => import('@/components/seller/activity/ActivityCenter').then(m => ({ default: m.ActivityCenter })),
  FinancialPanel: () => import('@/components/seller/FinancialPanel').then(m => ({ default: m.FinancialPanel })),
  SellerInbox: () => import('@/components/seller/SellerInbox').then(m => ({ default: m.SellerInbox })),
  SellerBookings: () => import('@/components/seller/SellerBookings').then(m => ({ default: m.SellerBookings })),
  ProductDashboard: () => import('@/components/product/ProductDashboard').then(m => ({ default: m.ProductDashboard })),
  MobileProductDashboard: () => import('@/components/mobile/MobileProductDashboard').then(m => ({ default: m.MobileProductDashboard })),
  MobileKanban: () => import('@/components/mobile/MobileKanban').then(m => ({ default: m.MobileKanban })),
  MobileTaskList: () => import('@/components/mobile/MobileTaskList').then(m => ({ default: m.MobileTaskList })),
  MobileActivityCenter: () => import('@/components/mobile/MobileActivityCenter').then(m => ({ default: m.MobileActivityCenter })),
  MobileGoalsView: () => import('@/components/mobile/MobileGoalsView').then(m => ({ default: m.MobileGoalsView })),
};

const CadenceView = lazy(f.CadenceView);
const PlaybookView = lazy(f.PlaybookView);
const ObjectionsView = lazy(f.ObjectionsView);
const MaterialsView = lazy(f.MaterialsView);
const AIChat = lazy(f.AIChat);
const LeadsKanban = lazy(f.LeadsKanban);
const SellerPortfolio = lazy(f.SellerPortfolio);
const ActivityCenter = lazy(f.ActivityCenter);
const FinancialPanel = lazy(f.FinancialPanel);
const SellerInbox = lazy(f.SellerInbox);
const SellerBookings = lazy(f.SellerBookings);
const ProductDashboard = lazy(f.ProductDashboard);
const MobileProductDashboard = lazy(f.MobileProductDashboard);
const MobileKanban = lazy(f.MobileKanban);
const MobileTaskList = lazy(f.MobileTaskList);
const MobileActivityCenter = lazy(f.MobileActivityCenter);
const MobileGoalsView = lazy(f.MobileGoalsView);

// Mapa tab → factory(s) para prefetch on-hover.
const tabFactories: Record<string, Array<() => Promise<unknown>>> = {
  'product-dashboard': [f.ProductDashboard, f.MobileProductDashboard],
  leads: [f.LeadsKanban, f.MobileKanban],
  inbox: [f.SellerInbox],
  tasks: [f.ActivityCenter, f.TaskCenter, f.MobileActivityCenter, f.MobileTaskList],
  goals: [f.MobileGoalsView],
  financial: [f.FinancialPanel],
  bookings: [f.SellerBookings],
  cadence: [f.CadenceView],
  playbook: [f.PlaybookView],
  objections: [f.ObjectionsView],
  materials: [f.MaterialsView],
  ai: [f.AIChat],
};

export function prefetchIndexTab(tab: string) {
  const list = tabFactories[tab];
  if (list) list.forEach(prefetch);
}

type DBProduct = Tables<'products'>;

const SectionLoader = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const TabSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="h-24 rounded-xl bg-muted/40" />
    <div className="h-24 rounded-xl bg-muted/30" />
    <div className="h-24 rounded-xl bg-muted/20" />
  </div>
);

// Initial app loading: shows spinner immediately, but after 6s offers a
// "still loading" message + reload button so the user is never stuck staring
// at a blank spinner forever (slow networks, PWA cold starts, etc.).
function InitialLoadingScreen() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        {stuck ? 'Demorando mais que o esperado…' : 'Carregando seus produtos…'}
      </p>
      {stuck && (
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

const Index = () => {
  const { user, profile, isAdmin, isManager, isSuperAdmin } = useAuth();
  const { platformName } = usePlatformName();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState<string>(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl) return fromUrl;
    try {
      return sessionStorage.getItem('index:activeTab') || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const savedProductIdRef = useRef<string | null>(
    (() => { try { return sessionStorage.getItem('index:productId'); } catch { return null; } })()
  );
  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    try { sessionStorage.setItem('index:activeTab', tab); } catch { /* noop */ }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [selectedProduct, setSelectedProductState] = useState<DBProduct | null>(null);
  const setSelectedProduct = useCallback((product: DBProduct | null) => {
    setSelectedProductState(product);
    try {
      if (product?.id) sessionStorage.setItem('index:productId', product.id);
      else sessionStorage.removeItem('index:productId');
    } catch { /* noop */ }
  }, []);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(
    () => searchParams.get('c') || null
  );

  // Consome ?c=<id> da URL (vindo de notificações push) e abre a conversa.
  // Também aceita ?tab=deals&deal=<id> (venda) e ?tab=calendar&event=<id> (agendamento).
  useEffect(() => {
    const c = searchParams.get('c');
    const tab = searchParams.get('tab');
    const deal = searchParams.get('deal');
    const event = searchParams.get('event');
    if (!c && !tab && !deal && !event) return;
    if (c) setPendingConversationId(c);
    const nextTab = tab || (c ? 'inbox' : deal ? 'deals' : event ? 'calendar' : null);
    if (nextTab) {
      setActiveTabState(nextTab);
      try { sessionStorage.setItem('index:activeTab', nextTab); } catch { /* noop */ }
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('c');
      next.delete('view');
      next.delete('sector');
      next.delete('deal');
      next.delete('event');
      if (nextTab) next.set('tab', nextTab); else next.delete('tab');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  // Escuta navegação vinda do Service Worker (clique em push com app já aberto).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.type !== 'PUSH_NAVIGATE' || !data.url) return;
      try {
        const u = new URL(data.url, window.location.origin);
        const tab = u.searchParams.get('tab');
        const c = u.searchParams.get('c');
        if (c) setPendingConversationId(c);
        if (tab) {
          setActiveTabState(tab);
          try { sessionStorage.setItem('index:activeTab', tab); } catch { /* noop */ }
        }
      } catch { /* noop */ }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  const [inboxConversationOpen, setInboxConversationOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  
  const { shouldForceSetup } = useSuperAdminFirstAccess();

  const productsQuery = useProducts();
  const assignedQuery = useAssignedProducts(user?.id || '');
  const allProducts = productsQuery.data;
  const assignedProducts = assignedQuery.data;

  // Fetch data based on selected product
  const { data: cadence = [], isLoading: loadingCadence } = useCadence(selectedProduct?.id);
  const { data: objections = [], isLoading: loadingObjections } = useObjections(selectedProduct?.id);
  const { data: materials = [], isLoading: loadingMaterials } = useMaterials(selectedProduct?.id);

  // As queries usam `placeholderData: []`, o que zera `isLoading` imediatamente
  // mesmo durante o primeiro fetch. Sem considerar `isFetching && !isFetched`,
  // o EmptyState ("Aguardando liberação") piscava no refresh antes dos dados
  // reais chegarem. Aqui mantemos a tela de loading até o primeiro fetch concluir.
  const isLoading =
    productsQuery.isLoading ||
    assignedQuery.isLoading ||
    (productsQuery.isFetching && !productsQuery.isFetched) ||
    (assignedQuery.isFetching && !assignedQuery.isFetched);
  const isAdminOrManager = isAdmin() || isManager();

  const products = useMemo(() => {
    const assignedList = (assignedProducts?.map(ap => ap.products).filter(Boolean) as DBProduct[]) || [];
    // Admin/Manager/Super Admin → vê todos os produtos da organização.
    // Vendedor → vê só os produtos atribuídos.
    if (isAdminOrManager) return (allProducts || []);
    return assignedList;
  }, [assignedProducts, allProducts, isAdminOrManager]);

  // Prefetch tabs no idle. Mobile: somente as essenciais (4G-friendly).
  // Desktop: tudo.
  useEffect(() => {
    onIdle(() => {
      if (isMobile) {
        [f.ProductDashboard, f.MobileProductDashboard, f.LeadsKanban, f.MobileKanban, f.SellerInbox, f.MobileTaskList]
          .forEach(prefetch);
      } else {
        Object.values(f).forEach(prefetch);
      }
    }, 2500);
  }, [isMobile]);

  // Auto-seleção: restaura o produto salvo, ou seleciona o primeiro disponível.
  useEffect(() => {
    if (products.length === 0 || selectedProduct) return;
    const savedId = savedProductIdRef.current;
    const saved = savedId ? products.find((p) => p.id === savedId) : null;
    setSelectedProductState(saved || products[0]);
    // Só força product-dashboard se NÃO houver tab persistida.
    const hasSavedTab = (() => {
      try { return !!sessionStorage.getItem('index:activeTab'); } catch { return false; }
    })();
    if (!hasSavedTab && !searchParams.get('tab')) {
      setActiveTab('product-dashboard');
    }
  }, [products, selectedProduct, searchParams, setActiveTab]);

  const handleSelectProduct = useCallback((product: DBProduct) => {
    setSelectedProduct(product);
    setActiveTab('product-dashboard');
  }, []);

  const handleBackToProducts = useCallback(() => {
    setSelectedProduct(null);
    setActiveTab('products');
  }, []);

  const handleNavigate = useCallback((tab: string, payload?: { conversationId?: string; leadId?: string }) => {
    if (payload?.conversationId) setPendingConversationId(payload.conversationId);
    prefetchIndexTab(tab);
    startTransition(() => setActiveTab(tab));
  }, []);

  const handleWhatsApp = useCallback(async (phone: string, leadId: string, leadName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('start-whatsapp-conversation', {
        body: { phone, lead_id: leadId, lead_name: leadName },
      });
      if (error) throw error;
      setPendingConversationId(data.conversation_id);
      setActiveTab('inbox');
      toast({
        title: data.is_new ? 'Conversa criada' : 'Conversa encontrada',
        description: 'Abrindo no inbox...',
      });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  }, [toast]);

  const headerInfo = useMemo(() => {
    if (!selectedProduct) {
      return { title: 'Meus Produtos', subtitle: 'Selecione um produto para começar' };
    }
    const map: Record<string, { title: string; subtitle: string }> = {
      'product-dashboard': { title: 'Visão Geral', subtitle: selectedProduct.name },
      'leads': { title: 'Pipeline de Leads', subtitle: selectedProduct.name },
      'inbox': { title: 'Conversas', subtitle: selectedProduct.name },
      'tasks': { title: 'Tarefas', subtitle: 'Tarefas, follow-ups, ligações e mais' },
      'goals': { title: 'Metas', subtitle: selectedProduct.name },
      'financial': { title: 'Financeiro', subtitle: selectedProduct.name },
      'bookings': { title: 'Agendamentos', subtitle: selectedProduct.name },
      'cadence': { title: 'Cadência', subtitle: selectedProduct.name },
      'playbook': { title: 'Playbook', subtitle: selectedProduct.name },
      'objections': { title: 'Objeções', subtitle: selectedProduct.name },
      'materials': { title: 'Materiais', subtitle: selectedProduct.name },
      'ai': { title: 'IA Copiloto', subtitle: selectedProduct.name },
    };
    return map[activeTab] ?? { title: 'SalesOS', subtitle: '' };
  }, [activeTab, selectedProduct]);

  if (isLoading) {
    return <InitialLoadingScreen />;
  }

  // Primeiro acesso após remix: super admin vai direto ao painel global
  // para concluir senha + configuração inicial. Após isso, fluxo normal.
  if (isSuperAdmin() && shouldForceSetup) {
    return <Navigate to="/super-admin" replace />;
  }

  // Admin de empresa: por padrão redireciona ao painel administrativo.
  // Exceção (NÃO redireciona, deixa o admin usar o app do vendedor):
  // Admin tem produtos atribuídos a ele (atua também como vendedor) —
  //   nesse caso o "Voltar ao App" no painel admin deve funcionar.
  // O onboarding guiado é renderizado dentro do /admin via OnboardingBanner,
  // então não precisa mais bloquear o redirect aqui.
  const adminHasAssignedProducts =
    (assignedProducts?.length || 0) > 0;
  if (
    isAdmin() &&
    !isSuperAdmin() &&
    !adminHasAssignedProducts
  ) {
    return <Navigate to="/admin" replace />;
  }

  // Super Admin nunca fica preso no EmptyState: vai direto ao painel global
  // para configurar a plataforma. Independente do estado de platform_settings.
  if (isSuperAdmin() && products.length === 0) {
    return <Navigate to="/super-admin" replace />;
  }

  // Estado vazio - vendedor/manager sem produtos atribuídos
  if (products.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={platformName} subtitle="Bem-vindo" />
        <EmptyState />
      </div>
    );
  }

  // Renderiza UMA tab específica.
  const renderTab = (tab: string) => {
    if (!selectedProduct) return null;

    switch (tab) {
      case 'product-dashboard':
        return isMobile ? (
          <MobileProductDashboard product={selectedProduct} onNavigate={handleNavigate} />
        ) : (
          <ProductDashboard product={selectedProduct} onNavigate={handleNavigate} />
        );

      case 'leads':
        return isMobile ? (
          <MobileKanban
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            organizationId={profile?.organization_id || ''}
          />
        ) : (
          <LeadsKanban
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            organizationId={profile?.organization_id || ''}
            onWhatsApp={handleWhatsApp}
          />
        );

      case 'portfolio':
        return <SellerPortfolio />;


      case 'inbox':
        return (
          <SellerInbox
            productId={selectedProduct.id}
            pendingConversationId={pendingConversationId}
            onConversationSelected={() => setPendingConversationId(null)}
            onConversationOpenChange={setInboxConversationOpen}
          />
        );

      case 'tasks':
        return isMobile ? (
          <MobileActivityCenter
            userId={user?.id || ''}
            productId={selectedProduct.id}
            productName={selectedProduct.name}
          />
        ) : (
          <ActivityCenter
            userId={user?.id || ''}
            productId={selectedProduct.id}
            productName={selectedProduct.name}
          />
        );

      case 'goals':
        return <MobileGoalsView productId={selectedProduct.id} userId={user?.id || ''} />;

      case 'financial':
        return <FinancialPanel productId={selectedProduct.id} productName={selectedProduct.name} />;

      case 'bookings':
        return <SellerBookings userId={user?.id || ''} productId={selectedProduct.id} />;

      case 'cadence':
        if (loadingCadence) return <SectionLoader />;
        return <CadenceView cadence={cadence} productName={selectedProduct.name} />;

      case 'playbook':
        return (
          <PlaybookView product={{
            id: selectedProduct.id,
            name: selectedProduct.name,
            description: selectedProduct.description || '',
            pitch15s: selectedProduct.pitch_15s || '',
            pitch30s: selectedProduct.pitch_30s || '',
            pitch2min: selectedProduct.pitch_2min || '',
            icp: selectedProduct.icp || '',
            differentials: selectedProduct.differentials || [],
            pricing: (selectedProduct.pricing as any) || [],
            status: (selectedProduct.status as 'draft' | 'review' | 'published') || 'draft',
            createdAt: new Date(selectedProduct.created_at),
            updatedAt: new Date(selectedProduct.updated_at)
          }} />
        );

      case 'objections':
        if (loadingObjections) return <SectionLoader />;
        return (
          <ObjectionsView
            objections={objections}
            productId={selectedProduct.id}
            productName={selectedProduct.name}
          />
        );

      case 'materials':
        if (loadingMaterials) return <SectionLoader />;
        return <MaterialsView materials={materials} />;

      case 'ai':
        return <AIChat productName={selectedProduct.name} productId={selectedProduct.id} />;

      default:
        return null;
    }
  };

  // Mantém somente a tab ativa montada para desligar polling e realtime ocultos.
  const renderContent = () => {
    if (!selectedProduct) return <SectionLoader />;
    const isInboxFullBleed = activeTab === 'inbox' && isMobile && inboxConversationOpen;
    return (
      <div className={isInboxFullBleed ? 'h-full' : undefined}>
        <Suspense fallback={<TabSkeleton />}>{renderTab(activeTab)}</Suspense>
      </div>
    );
  };

  // Onboarding agora é feito pelo ImplantacaoWizard em /admin/implantacao
  const guidedModal = null;

  // Mobile Layout
  if (isMobile) {
    const fullBleed = activeTab === 'inbox' && inboxConversationOpen;
    return (
      <>
        {guidedModal}
        <MobileLayout
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          activeTab={activeTab}
          onTabChange={handleNavigate}
          hasProduct={!!selectedProduct}
          products={products}
          selectedProduct={selectedProduct}
          onSelectProduct={handleSelectProduct}
          fullBleed={fullBleed}
        >
          <div className={fullBleed ? 'h-full' : 'p-4'}>{renderContent()}</div>
        </MobileLayout>
      </>
    );
  }

  // Desktop Layout
  return (
    <div className="min-h-screen bg-background">
      {guidedModal}
      <TaskAlerts />

      <Sidebar
        activeTab={activeTab}
        onTabChange={handleNavigate}
        selectedProduct={selectedProduct}
        hasMultipleProducts={products.length > 1}
        onBackToProducts={handleBackToProducts}
        assignedProducts={products}
        onSelectProduct={handleSelectProduct}
        onCollapsedChange={setSidebarCollapsed}
      />

      <main className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          assignedProducts={products}
          selectedProduct={selectedProduct}
          onSelectProductObject={handleSelectProduct}
        />

        <div className="p-6">{renderContent()}</div>
      </main>
    </div>
  );
};

export default Index;
