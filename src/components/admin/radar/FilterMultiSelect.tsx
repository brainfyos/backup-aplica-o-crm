import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, X, Check, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FMSItem {
  id: string;
  label: string;
  color?: string | null;
  sublabel?: string;
}

interface Props {
  title: string;
  items: FMSItem[];
  included: string[];
  excluded: string[];
  onToggleInclude: (id: string) => void;
  onToggleExclude: (id: string) => void;
  searchable?: boolean;
  placeholder?: string;
  emptyText?: string;
}

export function FilterMultiSelect({
  title,
  items,
  included,
  excluded,
  onToggleInclude,
  onToggleExclude,
  searchable = true,
  placeholder,
  emptyText = 'Nada encontrado',
}: Props) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'include' | 'exclude'>('include');

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const term = q.toLowerCase();
    return items.filter((it) => it.label.toLowerCase().includes(term));
  }, [items, q]);

  if (!items.length) return null;

  const activeIn = included.length;
  const activeEx = excluded.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{title}</Label>
        {(activeIn > 0 || activeEx > 0) && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            {activeIn > 0 && <span className="text-primary">+{activeIn}</span>}
            {activeEx > 0 && <span className="text-destructive">−{activeEx}</span>}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="h-7 p-0.5 grid grid-cols-2 w-full">
          <TabsTrigger value="include" className="h-6 text-[11px] gap-1">
            <Check className="h-3 w-3" /> Incluir {activeIn > 0 && `(${activeIn})`}
          </TabsTrigger>
          <TabsTrigger value="exclude" className="h-6 text-[11px] gap-1">
            <Ban className="h-3 w-3" /> Excluir {activeEx > 0 && `(${activeEx})`}
          </TabsTrigger>
        </TabsList>

        {searchable && items.length > 5 && (
          <div className="relative mt-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder || `Buscar ${title.toLowerCase()}...`}
              className="h-7 pl-7 text-xs"
            />
          </div>
        )}

        <TabsContent value="include" className="mt-2">
          <PillList
            items={filtered}
            selected={included}
            onToggle={onToggleInclude}
            variant="include"
            emptyText={emptyText}
          />
        </TabsContent>
        <TabsContent value="exclude" className="mt-2">
          <PillList
            items={filtered}
            selected={excluded}
            onToggle={onToggleExclude}
            variant="exclude"
            emptyText={emptyText}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PillList({
  items,
  selected,
  onToggle,
  variant,
  emptyText,
}: {
  items: FMSItem[];
  selected: string[];
  onToggle: (id: string) => void;
  variant: 'include' | 'exclude';
  emptyText: string;
}) {
  if (!items.length) {
    return <div className="text-[11px] text-muted-foreground py-1">{emptyText}</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
      {items.map((it) => {
        const isSel = selected.includes(it.id);
        const isInclude = variant === 'include';
        return (
          <Badge
            key={it.id}
            variant={isSel ? 'default' : 'outline'}
            className={cn(
              'cursor-pointer text-xs gap-1 select-none',
              isSel && !isInclude && 'bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90',
            )}
            style={
              isSel && isInclude && it.color
                ? { backgroundColor: it.color, borderColor: it.color }
                : undefined
            }
            onClick={() => onToggle(it.id)}
          >
            {it.label}
            {isSel && <X className="h-3 w-3" />}
          </Badge>
        );
      })}
    </div>
  );
}
