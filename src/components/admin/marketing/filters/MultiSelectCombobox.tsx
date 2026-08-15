import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

export interface MultiOption {
  value: string;
  label: string;
  hint?: string;
}

interface MultiSelectComboboxProps {
  options: MultiOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = 'Selecionar…',
  emptyText = 'Nenhum resultado',
  allLabel,
  className,
  disabled,
}: MultiSelectComboboxProps) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const displayLabel = () => {
    if (selected.length === 0) return allLabel ?? placeholder;
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label ?? selected[0];
    }
    return `${selected.length} selecionados`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            selected.length === 0 && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{displayLabel()}</span>
          <div className="flex items-center gap-1 shrink-0">
            {selected.length > 0 && (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 gap-1 cursor-pointer hover:bg-muted"
                onClick={clear}
              >
                <X className="h-3 w-3" />
              </Badge>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSel = selected.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={`${opt.label} ${opt.value}`}
                    onSelect={() => toggle(opt.value)}
                    className="cursor-pointer"
                  >
                    <Check className={cn('mr-2 h-4 w-4', isSel ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{opt.label}</div>
                      {opt.hint && (
                        <div className="text-xs text-muted-foreground truncate">{opt.hint}</div>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
