import { MarketingShell } from '../MarketingShell';
import { ConversionsTab } from '../tabs/ConversionsTab';

export function ConversionsSection() {
  return (
    <MarketingShell scope="meta" title="Marketing · Conversões">
      <ConversionsTab />
    </MarketingShell>
  );
}
