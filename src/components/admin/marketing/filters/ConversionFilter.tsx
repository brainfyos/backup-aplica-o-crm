import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMarketingCtx } from '../context/MarketingFiltersContext';
import { useConversionDefinitions } from '@/hooks/useConversionDefinitions';
import { groupConversionGoals, normalizeConversionName } from '../lib/conversionGoals';

export function ConversionFilter() {
  const { orgId, selectedConversion, setSelectedConversionId } = useMarketingCtx();
  const { conversions } = useConversionDefinitions(orgId);
  const [open, setOpen] = useState(false);
  const goals = useMemo(() => groupConversionGoals(conversions), [conversions]);
  const selectedKey = selectedConversion ? normalizeConversionName(selectedConversion.name) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" size="sm" className="justify-between gap-2 min-w-[240px]">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="truncate flex-1 text-left">
            {goals.find((goal) => goal.key === selectedKey)?.label ?? 'Escolher objetivo'}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Buscar objetivo..." />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>Nenhum objetivo sincronizado. Execute a sincronização com a Meta.</CommandEmpty>
            <CommandGroup heading="O que você quer medir?">
              {goals.map((goal) => (
                <CommandItem
                  key={goal.key}
                  onSelect={() => { setSelectedConversionId(goal.recommended.external_id); setOpen(false); }}
                  className="flex items-center gap-2"
                >
                  <Check className={cn('h-4 w-4', goal.key === selectedKey ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{goal.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {goal.count30d.toLocaleString('pt-BR')} resultados nos últimos 30 dias
                    </div>
                  </div>
                  {goal.definitions.length > 1 && <Badge variant="secondary">duplicatas resolvidas</Badge>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
