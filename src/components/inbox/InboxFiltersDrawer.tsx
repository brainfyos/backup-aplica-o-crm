import { useMemo, useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ChevronRight, ChevronLeft, X, AlertTriangle, Globe, MessageCircle, Instagram, Facebook, Mail, Phone, BadgeCheck, Plug } from 'lucide-react';
import { useSectors } from '@/hooks/useSectors';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useTeamMembers } from '@/hooks/useTeam';
import { useProducts } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';
import { useEvolutionInstances } from '@/hooks/useEvolutionInstances';
import { useMetaWAConnections } from '@/hooks/useMetaWhatsApp';
import { useInstagramConnections } from '@/hooks/useInstagramConnections';
import { useAllAgents } from '@/hooks/useProductAgents';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export interface InboxFiltersState {
  search: string;
  showResolved: boolean;
  selectedTagIds: string[];
  selectedSectorIds: string[];
  selectedUserIds: string[];
  selectedProductIds: string[];
  selectedChannels: string[];      // webchat, whatsapp, instagram, facebook, email, sms
  selectedConnections: string[];   // "evolution:<id>" | "meta:<id>" | "instagram:<id>"
  selectedAgentIds: string[];      // IDs de product_agents (current_agent_id)
}

export const defaultInboxFilters: InboxFiltersState = {
  search: '',
  showResolved: false,
  selectedTagIds: [],
  selectedSectorIds: [],
  selectedUserIds: [],
  selectedProductIds: [],
  selectedChannels: [],
  selectedConnections: [],
  selectedAgentIds: [],
};

interface InboxFiltersDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: InboxFiltersState;
  onFiltersChange: (filters: InboxFiltersState) => void;
  isAdmin: boolean;
  canFilterByAgent?: boolean;
  onCloseAllTickets?: () => void;
  trigger?: React.ReactNode;
}

type Section = 'root' | 'product' | 'tag' | 'sector' | 'user' | 'status' | 'channel' | 'connection' | 'agent';

const CHANNEL_OPTIONS: { value: string; label: string; icon: React.ComponentType<any> }[] = [
  { value: 'webchat', label: 'Site', icon: Globe },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'instagram', label: 'Instagram', icon: Instagram },
  { value: 'facebook', label: 'Facebook', icon: Facebook },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: Phone },
];

export function InboxFiltersDrawer({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  isAdmin,
  canFilterByAgent = false,
  onCloseAllTickets,
  trigger,
}: InboxFiltersDrawerProps) {
  const { profile } = useAuth();
  const { data: sectors = [] } = useSectors();
  const { data: tags = [] } = useLeadTags();
  const { data: members = [] } = useTeamMembers(profile?.organization_id);
  const { data: products = [] } = useProducts();
  const { data: evolutionInstances = [] } = useEvolutionInstances();
  const { data: metaConnections = [] } = useMetaWAConnections();
  const { data: instagramConnections = [] } = useInstagramConnections();
  const { data: allAgents = [] } = useAllAgents();

  const [section, setSection] = useState<Section>('root');
  const [subSearch, setSubSearch] = useState('');

  useEffect(() => {
    if (open) {
      setSection('root');
      setSubSearch('');
    }
  }, [open]);

  useEffect(() => {
    setSubSearch('');
  }, [section]);

  const update = (patch: Partial<InboxFiltersState>) =>
    onFiltersChange({ ...filters, ...patch });

  const toggle = (
    key: 'selectedTagIds' | 'selectedSectorIds' | 'selectedUserIds' | 'selectedProductIds' | 'selectedChannels' | 'selectedConnections' | 'selectedAgentIds',
    id: string,
  ) => {
    const current = filters[key];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    update({ [key]: next } as Partial<InboxFiltersState>);
  };

  const counts = {
    product: filters.selectedProductIds.length,
    tag: filters.selectedTagIds.length,
    sector: filters.selectedSectorIds.length,
    user: filters.selectedUserIds.length,
    channel: filters.selectedChannels.length,
    connection: filters.selectedConnections.length,
    agent: filters.selectedAgentIds.length,
    status: filters.showResolved ? 1 : 0,
  };

  const totalActive =
    counts.product + counts.tag + counts.sector + (isAdmin ? counts.user : 0) +
    counts.channel + counts.connection + counts.status + (canFilterByAgent ? counts.agent : 0);

  const allSectorsSelected = useMemo(
    () =>
      sectors.length > 0 &&
      sectors.every((s: any) => filters.selectedSectorIds.includes(s.id)),
    [sectors, filters.selectedSectorIds],
  );

  // Lista unificada de conexões
  const connectionOptions = useMemo(() => {
    const evo = (evolutionInstances || []).map((i: any) => ({
      key: `evolution:${i.id}`,
      label: (i.display_name || i.name || 'WhatsApp') + (i.phone_number ? ` · +${i.phone_number}` : ''),
      provider: 'evolution' as const,
    }));
    const meta = (metaConnections || []).map((c: any) => ({
      key: `meta:${c.id}`,
      label: (c.display_name || 'WhatsApp Oficial') + (c.phone_number ? ` · +${c.phone_number}` : ''),
      provider: 'meta' as const,
    }));
    const ig = (instagramConnections || []).map((c: any) => ({
      key: `instagram:${c.id}`,
      label: c.ig_username ? `@${c.ig_username}` : (c.display_name || 'Instagram'),
      provider: 'instagram' as const,
    }));
    return [...evo, ...meta, ...ig];
  }, [evolutionInstances, metaConnections, instagramConnections]);

  const renderHeader = (title: string, onBack?: () => void) => (
    <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-background">
      {onBack ? (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-primary hover:opacity-80"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
      ) : (
        <span className="text-base font-semibold text-foreground">{title}</span>
      )}
      <button
        onClick={() => onOpenChange(false)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Fechar"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  const CategoryRow = ({
    label,
    count,
    onClick,
  }: {
    label: string;
    count: number;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border hover:bg-muted/40 transition-colors text-left"
    >
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {count > 0 && (
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );

  const OptionRow = ({
    label,
    checked,
    onToggle,
    color,
    icon: Icon,
    rightBadge,
  }: {
    label: string;
    checked: boolean;
    onToggle: () => void;
    color?: string | null;
    icon?: React.ComponentType<any>;
    rightBadge?: React.ReactNode;
  }) => (
    <label className="flex items-center justify-between px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/40">
      <div className="flex items-center gap-2 min-w-0 pr-3">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" style={color ? { color } : undefined} />}
        <span
          className="text-sm font-medium truncate"
          style={color ? { color } : undefined}
        >
          {label}
        </span>
        {rightBadge}
      </div>
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        style={color ? { borderColor: color } : undefined}
      />
    </label>
  );

  const filteredProducts = products.filter((p: any) =>
    !subSearch || p.name?.toLowerCase().includes(subSearch.toLowerCase()),
  );
  const filteredTags = tags.filter((t: any) =>
    !subSearch || t.name?.toLowerCase().includes(subSearch.toLowerCase()),
  );
  const filteredMembers = members.filter((m: any) =>
    !subSearch ||
    (m.full_name || '').toLowerCase().includes(subSearch.toLowerCase()) ||
    (m.email || '').toLowerCase().includes(subSearch.toLowerCase()),
  );
  const filteredConnections = connectionOptions.filter((c) =>
    !subSearch || c.label.toLowerCase().includes(subSearch.toLowerCase()),
  );

  const connectionIcon = (provider: 'evolution' | 'meta' | 'instagram') =>
    provider === 'instagram' ? Instagram : MessageCircle;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[320px] p-0 flex flex-col gap-0 max-h-[85vh] overflow-hidden rounded-lg shadow-lg"
      >
        {section === 'root' && (
          <>
            {renderHeader('Filtros')}

            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar atendimento e mensagem"
                  value={filters.search}
                  onChange={(e) => update({ search: e.target.value })}
                  className="pl-9 h-10"
                />
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <CategoryRow label="Produto" count={counts.product} onClick={() => setSection('product')} />
              <CategoryRow label="Etiqueta" count={counts.tag} onClick={() => setSection('tag')} />
              <CategoryRow label="Setor" count={counts.sector} onClick={() => setSection('sector')} />
              {isAdmin && (
                <CategoryRow label="Usuário" count={counts.user} onClick={() => setSection('user')} />
              )}
              {canFilterByAgent && (
                <CategoryRow label="Agente IA" count={counts.agent} onClick={() => setSection('agent')} />
              )}
              <CategoryRow label="Canal" count={counts.channel} onClick={() => setSection('channel')} />
              <CategoryRow label="Conexão" count={counts.connection} onClick={() => setSection('connection')} />
              <CategoryRow label="Status" count={counts.status} onClick={() => setSection('status')} />

              {totalActive > 0 && (
                <div className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() =>
                      onFiltersChange({ ...defaultInboxFilters, search: filters.search })
                    }
                  >
                    Limpar filtros
                  </Button>
                </div>
              )}
            </ScrollArea>

            {isAdmin && onCloseAllTickets && (
              <div className="p-3 border-t border-border shrink-0">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Encerrar Todos Atendimentos
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Encerrar todos os atendimentos abertos?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação encerrará todas as conversas em andamento. Não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={onCloseAllTickets}>Encerrar todos</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </>
        )}

        {section === 'product' && (
          <>
            {renderHeader('Produto', () => setSection('root'))}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar produto"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              {filteredProducts.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                  Nenhum produto encontrado
                </p>
              )}
              {filteredProducts.map((p: any) => (
                <OptionRow
                  key={p.id}
                  label={p.name}
                  checked={filters.selectedProductIds.includes(p.id)}
                  onToggle={() => toggle('selectedProductIds', p.id)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {section === 'tag' && (
          <>
            {renderHeader('Etiqueta', () => setSection('root'))}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar etiqueta"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              {filteredTags.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                  Nenhuma etiqueta cadastrada
                </p>
              )}
              {filteredTags.map((t: any) => (
                <OptionRow
                  key={t.id}
                  label={t.name}
                  color={t.color}
                  checked={filters.selectedTagIds.includes(t.id)}
                  onToggle={() => toggle('selectedTagIds', t.id)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {section === 'sector' && (
          <>
            {renderHeader('Setor', () => setSection('root'))}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
              <span className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
                Setores
              </span>
              {sectors.length > 0 && (
                <button
                  className="text-xs text-primary hover:underline font-medium"
                  onClick={() => {
                    update({
                      selectedSectorIds: allSectorsSelected
                        ? []
                        : sectors.map((s: any) => s.id),
                    });
                  }}
                >
                  {allSectorsSelected ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              )}
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <OptionRow
                label="Sem Setor"
                checked={filters.selectedSectorIds.includes('__none__')}
                onToggle={() => toggle('selectedSectorIds', '__none__')}
              />
              {sectors.map((s: any) => (
                <OptionRow
                  key={s.id}
                  label={s.name}
                  color={s.color}
                  checked={filters.selectedSectorIds.includes(s.id)}
                  onToggle={() => toggle('selectedSectorIds', s.id)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {section === 'user' && isAdmin && (
          <>
            {renderHeader('Usuário', () => setSection('root'))}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar usuário"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              {filteredMembers.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                  Nenhum membro encontrado
                </p>
              )}
              {filteredMembers.map((m: any) => (
                <OptionRow
                  key={m.id}
                  label={m.full_name || m.email}
                  checked={filters.selectedUserIds.includes(m.id)}
                  onToggle={() => toggle('selectedUserIds', m.id)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {section === 'agent' && canFilterByAgent && (
          <>
            {renderHeader('Agente IA', () => setSection('root'))}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar agente"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              {(() => {
                const filteredAgents = (allAgents || []).filter((a: any) =>
                  !subSearch || (a.name || '').toLowerCase().includes(subSearch.toLowerCase())
                );
                if (filteredAgents.length === 0) {
                  return (
                    <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                      Nenhum agente encontrado
                    </p>
                  );
                }
                return filteredAgents.map((a: any) => (
                  <OptionRow
                    key={a.id}
                    label={a.name + (a.product?.name ? ` · ${a.product.name}` : '')}
                    checked={filters.selectedAgentIds.includes(a.id)}
                    onToggle={() => toggle('selectedAgentIds', a.id)}
                  />
                ));
              })()}
            </ScrollArea>
          </>
        )}


        {section === 'channel' && (
          <>
            {renderHeader('Canal', () => setSection('root'))}
            <ScrollArea className="flex-1 min-h-0">
              {CHANNEL_OPTIONS.map((c) => (
                <OptionRow
                  key={c.value}
                  label={c.label}
                  icon={c.icon}
                  checked={filters.selectedChannels.includes(c.value)}
                  onToggle={() => toggle('selectedChannels', c.value)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {section === 'connection' && (
          <>
            {renderHeader('Conexão', () => setSection('root'))}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar conexão"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              {filteredConnections.length === 0 && (
                <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                  Nenhuma conexão cadastrada
                </p>
              )}
              {filteredConnections.map((c) => (
                <OptionRow
                  key={c.key}
                  label={c.label}
                  icon={connectionIcon(c.provider)}
                  rightBadge={
                    c.provider === 'meta' ? (
                      <BadgeCheck className="h-3.5 w-3.5 text-green-600 ml-1 shrink-0" aria-label="Oficial" />
                    ) : c.provider === 'evolution' ? (
                      <Plug className="h-3 w-3 text-muted-foreground ml-1 shrink-0" aria-label="QR" />
                    ) : null
                  }
                  checked={filters.selectedConnections.includes(c.key)}
                  onToggle={() => toggle('selectedConnections', c.key)}
                />
              ))}
            </ScrollArea>
          </>
        )}

        {section === 'status' && (
          <>
            {renderHeader('Status', () => setSection('root'))}
            <ScrollArea className="flex-1 min-h-0">
              <label className="flex items-center justify-between px-4 py-3.5 border-b border-border cursor-pointer hover:bg-muted/40">
                <div>
                  <span className="text-sm font-medium block">Ver Resolvidos</span>
                  <span className="text-xs text-muted-foreground">Exibir tickets finalizados</span>
                </div>
                <Switch
                  checked={filters.showResolved}
                  onCheckedChange={(v) => update({ showResolved: v })}
                />
              </label>
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
