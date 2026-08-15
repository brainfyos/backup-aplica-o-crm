import { Button } from '@/components/ui/button';
import { CalendarDays, RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MarketingFilters } from '../filters/MarketingFiltersBar';
import { Credential } from '../MarketingShell';
import { AdAccountSwitcher } from './AdAccountSwitcher';

const PRESET_SHORT: Record<string, string> = {
  maximum: 'Máximo',
  today: 'Hoje',
  yesterday: 'Ontem',
  '7d': '7d',
  '30d': '30d',
  this_week: 'Semana',
  this_month: 'Mês',
  custom: 'Personalizado',
};

interface Props {
  cred: Credential | null;
  credentials: Credential[];
  orgId: string | null;
  filters: MarketingFilters;
  syncing: boolean;
  onOpenPeriod: () => void;
  onSync: () => void;
  onSelectAccount: (id: string) => Promise<void> | void;
  onConnectedAccount: (id?: string) => Promise<void> | void;
}

export function MobileHeader({
  cred,
  credentials,
  orgId,
  filters,
  syncing,
  onOpenPeriod,
  onSync,
  onSelectAccount,
  onConnectedAccount,
}: Props) {
  const preset = filters.range.preset;
  const label = preset === 'custom'
    ? `${format(filters.range.from, 'dd/MM', { locale: ptBR })} – ${format(filters.range.to, 'dd/MM', { locale: ptBR })}`
    : PRESET_SHORT[preset] ?? '30d';

  return (
    <div
      className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="px-3 py-2 flex items-center gap-2">
        <AdAccountSwitcher
          cred={cred}
          credentials={credentials}
          orgId={orgId}
          onSelect={onSelectAccount}
          onConnected={onConnectedAccount}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenPeriod}
          className="h-10 rounded-full px-3 shrink-0"
        >
          <CalendarDays className="h-4 w-4 mr-1.5" />
          <span className="text-xs">{label}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSync}
          disabled={syncing}
          className="h-10 w-10 shrink-0"
          aria-label="Sincronizar"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
