import { MarketingShell } from '../MarketingShell';
import { AttributionTab } from '../attribution/AttributionTab';

export function AttributionSection() {
  return (
    <MarketingShell
      scope="global"
      title="Marketing · Atribuição"
      subtitle="Leads com origem resolvida (UTM, fbclid, ctwa_clid) e leads pendentes de atribuição."
    >
      <AttributionTab />
    </MarketingShell>
  );
}
