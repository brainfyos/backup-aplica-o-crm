import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Toggle } from '@/components/ui/toggle';
import { Search, Filter, Bot, Users, Inbox as InboxIcon, Hash, RefreshCw, Wifi } from 'lucide-react';
import { useAttendancePanel, usePanelFiltersState } from '@/hooks/useAttendancePanel';
import { useSectors } from '@/hooks/useSectors';
import { PanelSection } from './panel/PanelSection';
import { PanelColumn } from './panel/PanelColumn';

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'webchat', label: 'Site' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'email', label: 'E-mail' },
  { value: 'sms', label: 'SMS' },
];

interface Props {
  onOpenConversation: (id: string) => void;
}

export function AttendancePanel({ onOpenConversation }: Props) {
  const { filters, setFilters } = usePanelFiltersState();
  const { sections, isLoading, isFetching, refetch } = useAttendancePanel(filters);
  const { data: sectors = [] } = useSectors();

  const sectorOptions = useMemo(
    () => [
      { id: '__none__', name: 'Sem setor', color: null as string | null },
      ...sectors.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    ],
    [sectors],
  );

  const toggleArr = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const activeFiltersCount = filters.channels.length + filters.sectorIds.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Painel de Atendimentos</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Wifi className="h-3 w-3 text-emerald-500" />
            Atualização em tempo real
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-muted/40 border border-border">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Buscar por lead, nome ou telefone…"
            className="pl-8 h-9"
          />
        </div>

        {/* Channel filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              Canal
              {filters.channels.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {filters.channels.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            {CHANNELS.map((c) => (
              <label key={c.value} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
                <Checkbox
                  checked={filters.channels.includes(c.value)}
                  onCheckedChange={() => setFilters((f) => ({ ...f, channels: toggleArr(f.channels, c.value) }))}
                />
                <span className="text-sm">{c.label}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        {/* Sector filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Setor
              {filters.sectorIds.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {filters.sectorIds.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 max-h-72 overflow-auto" align="start">
            {sectorOptions.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
                <Checkbox
                  checked={filters.sectorIds.includes(s.id)}
                  onCheckedChange={() => setFilters((f) => ({ ...f, sectorIds: toggleArr(f.sectorIds, s.id) }))}
                />
                {s.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />}
                <span className="text-sm">{s.name}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* Status toggles */}
        <div className="flex items-center gap-1 bg-background rounded-md border border-border p-0.5">
          <Toggle
            size="sm"
            pressed={filters.showQueue}
            onPressedChange={(v) => setFilters((f) => ({ ...f, showQueue: v }))}
            className="data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-700 dark:data-[state=on]:text-amber-400 h-7 text-xs gap-1"
          >
            <InboxIcon className="h-3.5 w-3.5" /> Fila
          </Toggle>
          <Toggle
            size="sm"
            pressed={filters.showAI}
            onPressedChange={(v) => setFilters((f) => ({ ...f, showAI: v }))}
            className="data-[state=on]:bg-violet-500/15 data-[state=on]:text-violet-700 dark:data-[state=on]:text-violet-400 h-7 text-xs gap-1"
          >
            <Bot className="h-3.5 w-3.5" /> IA
          </Toggle>
          <Toggle
            size="sm"
            pressed={filters.showHumans}
            onPressedChange={(v) => setFilters((f) => ({ ...f, showHumans: v }))}
            className="data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-700 dark:data-[state=on]:text-emerald-400 h-7 text-xs gap-1"
          >
            <Users className="h-3.5 w-3.5" /> Humanos
          </Toggle>
        </div>

        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, channels: [], sectorIds: [], search: '' }))}
            className="text-xs"
          >
            Limpar
          </Button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="space-y-6">
          {filters.showQueue && (
            <PanelSection
              title="Fila"
              icon={<InboxIcon className="h-4 w-4" />}
              count={sections.totals.queue}
              accent="amber"
            >
              {sections.queueBySector.length === 0 ? (
                <div className="w-full text-center text-sm text-muted-foreground py-8">🎉 Fila vazia</div>
              ) : (
                sections.queueBySector.map((g) => (
                  <PanelColumn
                    key={g.sectorId || 'none'}
                    title={g.name}
                    count={g.items.length}
                    color={g.color}
                    icon={<Hash className="h-4 w-4" />}
                    items={g.items}
                    onCardClick={onOpenConversation}
                    accent="amber"
                  />
                ))
              )}
            </PanelSection>
          )}

          {filters.showAI && (
            <PanelSection
              title="Agentes IA"
              icon={<Bot className="h-4 w-4" />}
              count={sections.totals.ai}
              accent="violet"
            >
              {sections.aiByAgent.length === 0 ? (
                <div className="w-full text-center text-sm text-muted-foreground py-8">
                  Nenhum agente atendendo no momento
                </div>
              ) : (
                sections.aiByAgent.map((g) => (
                  <PanelColumn
                    key={g.agentId}
                    title={g.name}
                    subtitle="Agente IA"
                    count={g.items.length}
                    avatarUrl={g.avatar}
                    initials={g.name.slice(0, 2).toUpperCase()}
                    icon={<Bot className="h-4 w-4" />}
                    items={g.items}
                    onCardClick={onOpenConversation}
                    accent="violet"
                  />
                ))
              )}
            </PanelSection>
          )}

          {filters.showHumans && (
            <PanelSection
              title="Atendentes Humanos"
              icon={<Users className="h-4 w-4" />}
              count={sections.totals.humans}
              accent="emerald"
            >
              {sections.humansByUser.length === 0 ? (
                <div className="w-full text-center text-sm text-muted-foreground py-8">
                  Nenhum atendente humano ativo
                </div>
              ) : (
                sections.humansByUser.map((g) => (
                  <PanelColumn
                    key={g.userId}
                    title={g.name}
                    subtitle="Atendente"
                    count={g.items.length}
                    avatarUrl={g.avatar}
                    initials={g.name.slice(0, 2).toUpperCase()}
                    items={g.items}
                    onCardClick={onOpenConversation}
                    accent="emerald"
                  />
                ))
              )}
            </PanelSection>
          )}
        </div>
      )}
    </div>
  );
}
