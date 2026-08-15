import { LeadJourneyPage } from '@/components/admin/journey/LeadJourneyPage';

/**
 * Jornada do Lead (única do sistema) dentro do módulo Marketing.
 * Não envolve MarketingShell porque a LeadJourneyPage já tem cabeçalho próprio
 * e filtros próprios (period/channel/origin/campaign). Quando origin='meta',
 * a página filtra client-side por leads com atribuição Meta resolvida.
 */
export function JourneySection() {
  return <LeadJourneyPage />;
}
