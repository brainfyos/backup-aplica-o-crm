import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MarketingShell, MetaShellContext } from '../MarketingShell';
import { MobileHeader } from './MobileHeader';
import { MobileBottomNav, MobileTab } from './MobileBottomNav';
import { PeriodSheet } from './PeriodSheet';
import { ResumoScreen } from './screens/ResumoScreen';
import { CampanhasScreen } from './screens/CampanhasScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { MaisScreen } from './screens/MaisScreen';
import { CopilotSheet } from '../optimizations/CopilotSheet';

export function MarketingMobileShell() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<MobileTab>('resumo');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  return (
    <MarketingShell scope="meta" title="Marketing" bare>
      {(ctx: MetaShellContext) => (
        <div className="flex flex-col min-h-[100dvh] bg-background">
          <MobileHeader
            cred={ctx.cred}
            credentials={ctx.credentials}
            orgId={ctx.orgId}
            filters={ctx.filters}
            syncing={ctx.syncing}
            onOpenPeriod={() => setPeriodOpen(true)}
            onSync={() => { void ctx.onSync(); }}
            onSelectAccount={(id) => ctx.setActiveCredential(id)}
            onConnectedAccount={(id) => ctx.reloadCredentials(id)}
          />

          <main className="flex-1">
            {tab === 'resumo' && (
              <ResumoScreen ctx={ctx} onOpenCopilot={() => setCopilotOpen(true)} />
            )}
            {tab === 'campanhas' && <CampanhasScreen ctx={ctx} />}
            {tab === 'insights' && <InsightsScreen />}
            {tab === 'mais' && <MaisScreen />}
          </main>

          <MobileBottomNav
            active={tab}
            onChange={(t) => {
              if (t === 'criar') {
                navigate('/admin?tab=marketing-create');
                return;
              }
              setTab(t);
            }}
          />

          <PeriodSheet
            open={periodOpen}
            onOpenChange={setPeriodOpen}
            filters={ctx.filters}
            onChange={ctx.setFilters}
          />

          <CopilotSheet open={copilotOpen} onOpenChange={setCopilotOpen} hideTrigger />
        </div>
      )}
    </MarketingShell>
  );
}
