// MiaGlobalMonitor — componente invisível montado na raiz da app.
// Ouve mia_actions em tempo real e dispara toasts quando a Mia cria
// ações pendentes enquanto o usuário está em outra tela.

import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizationEffectivePlan } from "@/hooks/useOrganizationPlan";

const MIA_PAGE_PATHS = ["/admin/mia", "/mia"];

export function MiaGlobalMonitor() {
  const { profile } = useAuth();
  const { data: effectivePlan } = useOrganizationEffectivePlan(profile?.organization_id);
  const navigate    = useNavigate();
  const location    = useLocation();
  const channelRef  = useRef<any>(null);
  const seenRef     = useRef<Set<string>>(new Set());

  useEffect(() => {
    const userId = profile?.id;
    if (!userId || effectivePlan?.features?.mia !== true) return;

    // Não mostra toast se já está na página da Mia
    const onMiaPage = MIA_PAGE_PATHS.some((p) => location.pathname.includes(p));
    if (onMiaPage) return;

    channelRef.current = supabase
      .channel(`mia-global-monitor-${userId}`)
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "mia_actions",
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row?.id || row.status !== "waiting_confirmation") return;
          if (seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);

          const preview = String(row.preview ?? "Nova ação pendente").slice(0, 80);
          const risk    = row.risk_level ?? "low";
          const emoji   = risk === "high" ? "⚠️" : "✅";

          toast(`${emoji} Mia precisa de confirmação`, {
            description: preview,
            duration:    8000,
            action: {
              label: "Ver",
              onClick: () => navigate("/admin?tab=mia"),
            },
          });
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [profile?.id, effectivePlan?.features?.mia, location.pathname, navigate]);

  return null;
}
