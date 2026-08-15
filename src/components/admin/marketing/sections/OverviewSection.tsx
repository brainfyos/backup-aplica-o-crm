import { MarketingShell } from '../MarketingShell';
import { GlobalOverview } from '../global/GlobalOverview';

/**
 * Marketing → Visão Geral.
 * Resumo multicanal (Meta, WhatsApp, Instagram, Formulários, Widget, Quiz, API,
 * Webchat) + vendas/receita/gargalos globais. NÃO reaproveita o `OverviewTab`
 * (esse continua exclusivo da sub-aba de Meta Ads).
 */
export function OverviewSection() {
  return (
    <MarketingShell
      scope="global"
      title="Marketing · Visão Geral"
      subtitle="Panorama de todos os canais no período selecionado."
    >
      <GlobalOverview />
    </MarketingShell>
  );
}
