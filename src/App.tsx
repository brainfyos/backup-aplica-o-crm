import { Component, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SuperAdminRoute } from "@/components/auth/SuperAdminRoute";
import { BootstrapGuard } from "@/components/BootstrapGuard";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { usePlatformBranding } from "@/hooks/usePlatformBranding";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { MiaGlobalMonitor } from "@/components/mia/MiaGlobalMonitor";
import { MiaProvider } from "@/contexts/MiaContext";

// Lazy load all pages for code splitting
const Index = lazyWithRetry(() => import("./pages/Index"));
const Login = lazyWithRetry(() => import("./pages/Login"));
const Setup = lazyWithRetry(() => import("./pages/Setup"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const SuperAdmin = lazyWithRetry(() => import("./pages/SuperAdmin"));
const AcceptInvite = lazyWithRetry(() => import("./pages/AcceptInvite"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const OAuthConsent = lazyWithRetry(() => import("./pages/OAuthConsent"));
const PublicForm = lazyWithRetry(() => import("./pages/PublicForm"));
const PublicChat = lazyWithRetry(() => import("./pages/PublicChat"));
const PublicQuiz = lazyWithRetry(() => import("./pages/PublicQuiz"));

const SalesPage = lazyWithRetry(() => import("./pages/SalesPage"));

const PublicBooking = lazyWithRetry(() => import("./pages/PublicBooking"));
const PublicCall = lazyWithRetry(() => import("./pages/PublicCall"));
const BookingConfirmation = lazyWithRetry(() => import("./pages/BookingConfirmation"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));


const Unsubscribe = lazyWithRetry(() => import("./pages/Unsubscribe"));
const Docs = lazyWithRetry(() => import("./pages/Docs"));
const ImplantacaoPublic = lazyWithRetry(() => import("./pages/ImplantacaoPublic"));
const AdminImplantacao = lazyWithRetry(() => import("./pages/AdminImplantacao"));
const TrocarSenha = lazyWithRetry(() => import("./pages/TrocarSenha"));

// Global loading fallback
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Optimized QueryClient with global cache settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      // 'online' (default) blocks queries while the browser thinks it is offline,
      // which on mobile can leave the UI stuck on a spinner. 'always' lets the
      // query run and surface a real error/empty state instead.
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

// Component to apply platform branding
function PlatformBrandingLoader() {
  usePlatformBranding();
  return null;
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[RouteErrorBoundary]', error);
  }

  handleReload = () => {
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key))).catch(() => {});
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
          <div className="max-w-sm space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-foreground">Não foi possível carregar a aplicação</h1>
              <p className="text-sm text-muted-foreground">A versão local ficou desatualizada. Recarregue para buscar a versão mais recente.</p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthProvider>
        <TooltipProvider>
        <PlatformBrandingLoader />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <MiaProvider>
          <MiaGlobalMonitor />
          <RouteErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <BootstrapGuard />
              <Routes>
              <Route path="/setup" element={<Setup />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/definir-senha" element={<ResetPassword />} />
              <Route path="/aceitar-convite" element={<AcceptInvite />} />
              <Route path="/trocar-senha" element={<TrocarSenha />} />

              <Route path="/install" element={<Install />} />
              <Route path="/f/:slug" element={<PublicForm />} />
              <Route path="/c/:slug" element={<PublicChat />} />
              <Route path="/q/:slug" element={<PublicQuiz />} />
              
              <Route path="/agendar/:userSlug" element={<PublicBooking />} />
              <Route path="/call/:slug" element={<PublicCall />} />
              <Route path="/agendar/:userSlug/:eventSlug" element={<PublicBooking />} />
              <Route path="/confirmar/:token" element={<BookingConfirmation />} />
              <Route path="/vendas" element={<SalesPage />} />
              <Route path="/whitelabel" element={<Navigate to="/" replace />} />
              <Route path="/reagendar/:token" element={<BookingConfirmation />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />

              {/* Documentação pública (sem login) */}
              <Route path="/docs" element={<Docs />} />
              <Route path="/docs/:track" element={<Docs />} />
              <Route path="/docs/:track/:slug" element={<Docs />} />

              <Route 
                path="/" 
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                } 
              />
              {/* PWA / atalhos antigos podem abrir em /index ou /home — redireciona */}
              <Route path="/index" element={<Navigate to="/" replace />} />
              <Route path="/home" element={<Navigate to="/" replace />} />
              {/* Legacy routes redirect to docs */}
              <Route path="/ajuda" element={<Navigate to="/docs" replace />} />
              <Route path="/ajuda/:slug" element={<Navigate to="/docs" replace />} />
              <Route path="/novidades" element={<Navigate to="/docs/changelog" replace />} />

              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                } 
              />
              <Route
                path="/admin/implantacao"
                element={
                  <ProtectedRoute requiredRole="manager">
                    <AdminImplantacao />
                  </ProtectedRoute>
                }
              />
              <Route path="/implantacao/:token" element={<ImplantacaoPublic />} />
              <Route 
                path="/perfil" 
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/configuracoes" 
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/super-admin" 
                element={
                  <SuperAdminRoute>
                    <SuperAdmin />
                  </SuperAdminRoute>
                } 
              />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
          </MiaProvider>
        </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
