import { MarketingShell } from '../MarketingShell';
import { InsightsTab } from '../tabs/InsightsTab';

export function InsightsSection() {
  return (
    <MarketingShell scope="meta" title="Marketing · Insights" subtitle="Receita, ROAS, melhores campanhas, anúncios, criativos e vendedores.">
      <InsightsTab />
    </MarketingShell>
  );
}
