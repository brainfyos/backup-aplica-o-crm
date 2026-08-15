import { useState, useMemo } from 'react';
import { ChevronRight, Search, Check, Loader2, Building2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useUserOrganizations, useSwitchOrganization } from '@/hooks/useUserOrganizations';
import { toast } from 'sonner';

interface Props {
  collapsed?: boolean;
  variant?: 'sidebar' | 'mobile';
}

function shortId(id: string) {
  return id.slice(0, 5).toUpperCase();
}

export function OrgSwitcher({ collapsed = false, variant = 'sidebar' }: Props) {
  const { data: orgs = [], isLoading } = useUserOrganizations();
  const switchOrg = useSwitchOrganization();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const active = orgs.find((o) => o.is_active) ?? orgs[0];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) => o.name.toLowerCase().includes(q) || o.organization_id.toLowerCase().includes(q),
    );
  }, [orgs, query]);

  // Sempre mostra o switcher, mesmo com 1 só empresa vinculada
  if (!isLoading && orgs.length === 0) return null;

  const handleSelect = (orgId: string) => {
    if (orgId === active?.organization_id) {
      setOpen(false);
      return;
    }
    toast.promise(switchOrg.mutateAsync(orgId), {
      loading: 'Trocando de empresa...',
      success: 'Empresa alterada — recarregando',
      error: (e) => `Falha ao trocar: ${e?.message ?? 'erro'}`,
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'w-full flex items-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/30',
            'hover:bg-sidebar-accent transition-colors text-left',
            variant === 'sidebar' ? 'px-2.5 py-2' : 'px-3 py-2.5',
          )}
        >
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
            {active?.logo_url ? (
              <img src={active.logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Building2 size={16} className="text-primary" />
            )}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-foreground">
                  {active?.name ?? 'Selecionar empresa'}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  ID {active ? shortId(active.organization_id) : '—'}
                </p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={variant === 'sidebar' ? 'right' : 'top'}
        align="start"
        className="w-72 p-0"
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-muted-foreground">Nenhuma empresa</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.organization_id}
                onClick={() => handleSelect(o.organization_id)}
                disabled={switchOrg.isPending}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left',
                  o.is_active && 'bg-primary/5',
                )}
              >
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {o.logo_url ? (
                    <img src={o.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Building2 size={16} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{o.name}</p>
                  <p className="text-[11px] text-muted-foreground">ID {shortId(o.organization_id)}</p>
                </div>
                {o.is_active && <Check size={16} className="text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
