import { AlertOctagon, CreditCard, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizationStatus } from "@/hooks/useOrganizationStatus";
import { usePlatformName } from "@/hooks/usePlatformName";

export function OrgSuspendedGate() {
  const { isSuspended } = useOrganizationStatus();
  const { isSuperAdmin, isAdmin, signOut } = useAuth();
  const { platformName } = usePlatformName();

  // Super admin nunca é bloqueado (precisa acessar o painel para reativar)
  if (!isSuspended || isSuperAdmin()) return null;

  // Permitir que o admin acesse a tela de planos para regularizar.
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const onPlanRoute =
      window.location.pathname.startsWith("/admin") && params.get("tab") === "plan";
    if (onPlanRoute) return null;
  }

  const goToBilling = () => {
    window.location.assign("/admin?tab=plan");
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e) {
      console.warn("[OrgSuspendedGate] signOut error:", e);
    } finally {
      window.location.assign("/login");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card shadow-2xl p-6 space-y-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertOctagon className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Empresa suspensa</h2>
          <p className="text-sm text-muted-foreground">
            O acesso ao {platformName} está temporariamente bloqueado porque a sua assinatura está
            inativa ou vencida. Para voltar a usar a plataforma, regularize o pagamento.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {isAdmin() && (
            <Button onClick={goToBilling} className="w-full" size="lg">
              <CreditCard className="mr-2 h-4 w-4" />
              Regularizar pagamento
            </Button>
          )}
          {!isAdmin() && (
            <p className="text-xs text-muted-foreground">
              Fale com o administrador da sua empresa para regularizar o pagamento.
            </p>
          )}
          <Button variant="ghost" onClick={handleSignOut} className="w-full">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
