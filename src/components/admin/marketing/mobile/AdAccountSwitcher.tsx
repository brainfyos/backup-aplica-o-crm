import { useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ChevronDown, Search, Loader2 } from 'lucide-react';
import { MetaOAuthConnectButton } from '@/components/admin/integrations/MetaOAuthConnectButton';
import { Credential } from '../MarketingShell';

interface Props {
  cred: Credential | null;
  credentials: Credential[];
  orgId: string | null;
  onSelect: (id: string) => Promise<void> | void;
  onConnected?: (id?: string) => void;
}

export function AdAccountSwitcher({ cred, credentials, orgId, onSelect, onConnected }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return credentials;
    return credentials.filter((c) =>
      (c.account_name ?? '').toLowerCase().includes(term) ||
      (c.ad_account_id ?? '').toLowerCase().includes(term)
    );
  }, [credentials, q]);

  const handlePick = async (id: string) => {
    if (id === cred?.id) { setOpen(false); return; }
    setBusyId(id);
    try {
      await onSelect(id);
      setOpen(false);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-1 min-w-0 flex items-center gap-2 h-10 px-3 rounded-full bg-muted/60 active:bg-muted transition text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">
            Conta de anúncios
          </p>
          <p className="text-sm font-semibold truncate leading-tight">
            {cred?.account_name || cred?.ad_account_id || 'Selecionar conta'}
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[85vh] overflow-y-auto p-0"
        >
          <SheetHeader className="text-left px-4 pt-5 pb-3">
            <SheetTitle>Selecionar conta</SheetTitle>
          </SheetHeader>

          {credentials.length > 5 && (
            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Pesquisar contas"
                  className="pl-9 h-10 rounded-full bg-muted/50 border-transparent"
                />
              </div>
            </div>
          )}

          <div className="divide-y divide-border">
            {list.length === 0 && (
              <p className="px-4 py-8 text-sm text-center text-muted-foreground">
                Nenhuma conta encontrada.
              </p>
            )}
            {list.map((c) => {
              const active = c.id === cred?.id;
              const busy = busyId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handlePick(c.id)}
                  disabled={busy}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-muted/60 transition ${
                    active ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                  }`}>
                    {active && <div className="h-2 w-2 rounded-full bg-primary-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">
                      {c.account_name || 'Conta sem nome'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.ad_account_id?.replace(/^act_/, '') ?? '—'}
                      {c.last_sync_status === 'ok' ? ' · Sincronizada' : ''}
                    </p>
                  </div>
                  {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {!busy && active && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>

          {orgId && (
            <div className="px-4 py-4 border-t border-border sticky bottom-0 bg-background">
              <MetaOAuthConnectButton
                organizationId={orgId}
                purpose="ads"
                label="+ Conectar outra conta"
                onConnected={(id) => { onConnected?.(id); setOpen(false); }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
