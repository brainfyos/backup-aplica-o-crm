import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Search, SlidersHorizontal, X, CalendarIcon, Plus, Database } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LeadFilters,
  CustomFieldRule,
  CustomFieldOperator,
  DatePreset,
} from '@/hooks/useLeadsManager';
import { LEAD_ORIGINS, LEAD_CHANNELS } from '@/hooks/useLeadTracking';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useCustomFields } from '@/hooks/useCustomFields';
import { useCustomFieldValues } from '@/hooks/useCustomFieldValues';
import { cn } from '@/lib/utils';

interface LeadsFiltersProps {
  filters: LeadFilters;
  onFilterChange: <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => void;
  onClearFilters: () => void;
  squads: { id: string; name: string }[];
  products: { id: string; name: string }[];
  stages: { id: string; name: string }[];
}

const temperatures = [
  { value: 'hot', label: 'Quente', color: 'bg-red-500' },
  { value: 'warm', label: 'Morno', color: 'bg-amber-500' },
  { value: 'cold', label: 'Frio', color: 'bg-blue-500' },
];

const datePresets: { value: Exclude<DatePreset, null>; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'custom', label: 'Personalizado' },
];

const OPERATORS_BY_TYPE: Record<
  CustomFieldRule['fieldType'],
  { value: CustomFieldOperator; label: string }[]
> = {
  text: [
    { value: 'eq', label: 'Igual a' },
    { value: 'neq', label: 'Diferente de' },
    { value: 'contains', label: 'Contém' },
    { value: 'gt', label: 'Maior que (>)' },
    { value: 'gte', label: 'Maior ou igual (≥)' },
    { value: 'lt', label: 'Menor que (<)' },
    { value: 'lte', label: 'Menor ou igual (≤)' },
    { value: 'between', label: 'Entre' },
    { value: 'is_empty', label: 'Está vazio' },
    { value: 'is_not_empty', label: 'Está preenchido' },
  ],
  number: [
    { value: 'eq', label: 'Igual a (=)' },
    { value: 'neq', label: 'Diferente de (≠)' },
    { value: 'gt', label: 'Maior que (>)' },
    { value: 'gte', label: 'Maior ou igual (≥)' },
    { value: 'lt', label: 'Menor que (<)' },
    { value: 'lte', label: 'Menor ou igual (≤)' },
    { value: 'between', label: 'Entre' },
    { value: 'is_empty', label: 'Está vazio' },
    { value: 'is_not_empty', label: 'Está preenchido' },
  ],
  select: [
    { value: 'eq', label: 'Igual a' },
    { value: 'neq', label: 'Diferente de' },
    { value: 'is_empty', label: 'Está vazio' },
    { value: 'is_not_empty', label: 'Está preenchido' },
  ],
  boolean: [
    { value: 'eq', label: 'É verdadeiro/falso' },
    { value: 'is_empty', label: 'Não definido' },
  ],
  date: [
    { value: 'eq', label: 'Em' },
    { value: 'gt', label: 'Depois de' },
    { value: 'lt', label: 'Antes de' },
    { value: 'between', label: 'Entre' },
    { value: 'is_empty', label: 'Está vazio' },
    { value: 'is_not_empty', label: 'Está preenchido' },
  ],
};

function ruleNeedsValue(op: CustomFieldOperator) {
  return op !== 'is_empty' && op !== 'is_not_empty';
}

function CustomFieldRuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: CustomFieldRule;
  onChange: (r: CustomFieldRule) => void;
  onRemove: () => void;
}) {
  const { fields } = useCustomFields();
  const field = fields.find((f) => f.field_key === rule.fieldKey);
  const operators = OPERATORS_BY_TYPE[rule.fieldType] || OPERATORS_BY_TYPE.text;
  const { data: distinctValues } = useCustomFieldValues(
    rule.fieldType === 'text' && (!field?.options || field.options.length === 0)
      ? rule.fieldKey
      : null
  );

  const inputType =
    rule.fieldType === 'number'
      ? 'number'
      : rule.fieldType === 'date'
      ? 'date'
      : 'text';

  return (
    <div className="rounded-md border p-2 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <Select
          value={rule.fieldKey}
          onValueChange={(v) => {
            const f = fields.find((x) => x.field_key === v);
            if (!f) return;
            onChange({
              ...rule,
              fieldKey: f.field_key,
              fieldLabel: f.name,
              fieldType: f.field_type,
              operator: OPERATORS_BY_TYPE[f.field_type][0].value,
              value: null,
              valueTo: null,
            });
          }}
        >
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f.id} value={f.field_key}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Select
        value={rule.operator}
        onValueChange={(v) =>
          onChange({ ...rule, operator: v as CustomFieldOperator, value: null, valueTo: null })
        }
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {ruleNeedsValue(rule.operator) && rule.fieldType === 'boolean' && (
        <Select
          value={String(rule.value ?? '')}
          onValueChange={(v) => onChange({ ...rule, value: v === 'true' })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Verdadeiro</SelectItem>
            <SelectItem value="false">Falso</SelectItem>
          </SelectContent>
        </Select>
      )}

      {ruleNeedsValue(rule.operator) && rule.fieldType === 'select' && field?.options?.length ? (
        <Select
          value={String(rule.value ?? '')}
          onValueChange={(v) => onChange({ ...rule, value: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione um valor" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {ruleNeedsValue(rule.operator) &&
        (rule.fieldType === 'text' || rule.fieldType === 'number' || rule.fieldType === 'date') && (
          <div className="space-y-2">
            <Input
              type={inputType}
              value={(rule.value as string | number | undefined) ?? ''}
              onChange={(e) =>
                onChange({
                  ...rule,
                  value:
                    rule.fieldType === 'number'
                      ? e.target.value === ''
                        ? null
                        : Number(e.target.value)
                      : e.target.value,
                })
              }
              placeholder="Valor"
              list={
                rule.fieldType === 'text' && distinctValues && distinctValues.length > 0
                  ? `cfvals-${rule.id}`
                  : undefined
              }
              className="h-8 text-xs"
            />
            {rule.fieldType === 'text' && distinctValues && distinctValues.length > 0 && (
              <datalist id={`cfvals-${rule.id}`}>
                {distinctValues.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            )}
            {rule.operator === 'between' && (
              <Input
                type={inputType}
                value={(rule.valueTo as string | number | undefined) ?? ''}
                onChange={(e) =>
                  onChange({
                    ...rule,
                    valueTo:
                      rule.fieldType === 'number'
                        ? e.target.value === ''
                          ? null
                          : Number(e.target.value)
                        : e.target.value,
                  })
                }
                placeholder="Até"
                className="h-8 text-xs"
              />
            )}
          </div>
        )}
    </div>
  );
}

export function LeadsFilters({
  filters,
  onFilterChange,
  onClearFilters,
  squads,
  products,
  stages,
}: LeadsFiltersProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const { data: leadTags } = useLeadTags();
  const { fields: customFields } = useCustomFields();

  const activeFiltersCount = [
    filters.temperature.length > 0,
    filters.origin.length > 0,
    filters.channel.length > 0,
    filters.stageId,
    filters.squadId,
    filters.productId,
    filters.dateFrom || filters.dateTo || filters.datePreset,
    filters.tagIds.length > 0,
    filters.excludeTagIds.length > 0,
    filters.excludeOrigin.length > 0,
    filters.excludeChannel.length > 0,
    filters.customFieldRules.length > 0,
  ].filter(Boolean).length;

  const toggleArrayFilter = (
    key: 'temperature' | 'origin' | 'channel' | 'excludeOrigin' | 'excludeChannel',
    value: string,
  ) => {
    const current = filters[key] as string[];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFilterChange(key, updated as any);
  };

  const addCustomFieldRule = (fieldKey: string) => {
    const f = customFields.find((x) => x.field_key === fieldKey);
    if (!f) return;
    const rule: CustomFieldRule = {
      id: crypto.randomUUID(),
      fieldKey: f.field_key,
      fieldLabel: f.name,
      fieldType: f.field_type,
      operator: OPERATORS_BY_TYPE[f.field_type][0].value,
      value: null,
      valueTo: null,
    };
    onFilterChange('customFieldRules', [...filters.customFieldRules, rule]);
  };

  const updateRule = (id: string, patch: CustomFieldRule) => {
    onFilterChange(
      'customFieldRules',
      filters.customFieldRules.map((r) => (r.id === id ? patch : r))
    );
  };

  const removeRule = (id: string) => {
    onFilterChange(
      'customFieldRules',
      filters.customFieldRules.filter((r) => r.id !== id)
    );
  };

  const filteredTags = (leadTags || []).filter((t) =>
    t.name.toLowerCase().includes(tagSearch.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email, telefone..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="pl-9"
          />
        </div>

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge className="h-5 min-w-5 p-0 flex items-center justify-center">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="end">
            <div className="flex items-center justify-between p-4 border-b">
              <h4 className="font-medium">Filtros Avançados</h4>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onClearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Limpar
                </Button>
              )}
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4 space-y-5">
              {/* Período */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Data de inscrição</label>
                <div className="flex flex-wrap gap-2">
                  {datePresets.map((p) => {
                    const active = filters.datePreset === p.value;
                    return (
                      <button
                        key={p.value}
                        onClick={() => {
                          if (p.value === 'custom') {
                            onFilterChange('datePreset', 'custom');
                          } else {
                            onFilterChange('datePreset', active ? null : p.value);
                            onFilterChange('dateFrom', null);
                            onFilterChange('dateTo', null);
                          }
                        }}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                          active
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {filters.datePreset === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {filters.dateFrom ? format(filters.dateFrom, 'dd/MM/yy', { locale: ptBR }) : 'De'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={filters.dateFrom || undefined}
                          onSelect={(date) => {
                            onFilterChange('dateFrom', date || null);
                            setDateFromOpen(false);
                          }}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                    <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {filters.dateTo ? format(filters.dateTo, 'dd/MM/yy', { locale: ptBR }) : 'Até'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={filters.dateTo || undefined}
                          onSelect={(date) => {
                            onFilterChange('dateTo', date || null);
                            setDateToOpen(false);
                          }}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              {/* Temperature */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Temperatura</label>
                <div className="flex flex-wrap gap-2">
                  {temperatures.map((temp) => (
                    <button
                      key={temp.value}
                      onClick={() => toggleArrayFilter('temperature', temp.value)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        filters.temperature.includes(temp.value)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div className={cn('w-2 h-2 rounded-full', temp.color)} />
                      {temp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Origin */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Origem</label>
                <div className="flex flex-wrap gap-2">
                  {LEAD_ORIGINS.map((origin) => (
                    <button
                      key={origin.value}
                      onClick={() => toggleArrayFilter('origin', origin.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        filters.origin.includes(origin.value)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      {origin.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Channel */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Canal</label>
                <div className="flex flex-wrap gap-2">
                  {LEAD_CHANNELS.map((channel) => (
                    <button
                      key={channel.value}
                      onClick={() => toggleArrayFilter('channel', channel.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        filters.channel.includes(channel.value)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      {channel.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Etiquetas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Etiquetas</label>
                  {filters.tagIds.length > 1 && (
                    <div className="flex rounded-md border overflow-hidden text-[10px]">
                      <button
                        onClick={() => onFilterChange('tagsMatchMode', 'any')}
                        className={cn(
                          'px-2 py-0.5',
                          filters.tagsMatchMode === 'any'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        Qualquer
                      </button>
                      <button
                        onClick={() => onFilterChange('tagsMatchMode', 'all')}
                        className={cn(
                          'px-2 py-0.5',
                          filters.tagsMatchMode === 'all'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        Todas
                      </button>
                    </div>
                  )}
                </div>
                {!leadTags || leadTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>
                ) : (
                  <>
                    <Input
                      placeholder="Buscar etiqueta..."
                      value={tagSearch}
                      onChange={(e) => setTagSearch(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                      {filteredTags.map((tag) => {
                        const active = filters.tagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => {
                              const next = active
                                ? filters.tagIds.filter((id) => id !== tag.id)
                                : [...filters.tagIds, tag.id];
                              onFilterChange('tagIds', next);
                            }}
                            className={cn(
                              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                              active
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border hover:border-primary/50'
                            )}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                          </button>
                        );
                      })}
                      {filteredTags.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nenhuma etiqueta encontrada.</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Exclusões */}
              <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-destructive" />
                  <label className="text-sm font-medium text-destructive">Excluir do resultado</label>
                </div>

                {/* Etiquetas a excluir */}
                {leadTags && leadTags.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Sem as etiquetas
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {leadTags.map((tag) => {
                        const active = filters.excludeTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => {
                              const next = active
                                ? filters.excludeTagIds.filter((id) => id !== tag.id)
                                : [...filters.excludeTagIds, tag.id];
                              onFilterChange('excludeTagIds', next);
                            }}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                              active
                                ? 'border-destructive bg-destructive/10 text-destructive line-through'
                                : 'border-border hover:border-destructive/50'
                            )}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Origens a excluir */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sem as origens</label>
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_ORIGINS.map((origin) => {
                      const active = filters.excludeOrigin.includes(origin.value);
                      return (
                        <button
                          key={origin.value}
                          onClick={() => toggleArrayFilter('excludeOrigin', origin.value)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                            active
                              ? 'border-destructive bg-destructive/10 text-destructive line-through'
                              : 'border-border hover:border-destructive/50'
                          )}
                        >
                          {origin.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Canais a excluir */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sem os canais</label>
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_CHANNELS.map((channel) => {
                      const active = filters.excludeChannel.includes(channel.value);
                      return (
                        <button
                          key={channel.value}
                          onClick={() => toggleArrayFilter('excludeChannel', channel.value)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                            active
                              ? 'border-destructive bg-destructive/10 text-destructive line-through'
                              : 'border-border hover:border-destructive/50'
                          )}
                        >
                          {channel.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Campos personalizados */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <label className="text-sm font-medium">Campos personalizados</label>
                </div>
                {customFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum campo personalizado cadastrado.
                  </p>
                ) : (
                  <>
                    {filters.customFieldRules.map((rule) => (
                      <CustomFieldRuleRow
                        key={rule.id}
                        rule={rule}
                        onChange={(r) => updateRule(rule.id, r)}
                        onRemove={() => removeRule(rule.id)}
                      />
                    ))}
                    <Select value="" onValueChange={(v) => addCustomFieldRule(v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <div className="flex items-center gap-2">
                          <Plus className="h-3.5 w-3.5" />
                          <SelectValue placeholder="Adicionar filtro por campo" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {customFields.map((f) => (
                          <SelectItem key={f.id} value={f.field_key}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>

              {/* Squad */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Squad</label>
                <Select
                  value={filters.squadId || '__all__'}
                  onValueChange={(v) => onFilterChange('squadId', v === '__all__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os squads" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os squads</SelectItem>
                    {squads.map((squad) => (
                      <SelectItem key={squad.id} value={squad.id}>
                        {squad.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Produto</label>
                <Select
                  value={filters.productId || '__all__'}
                  onValueChange={(v) => onFilterChange('productId', v === '__all__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os produtos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os produtos</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stage */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Estágio</label>
                <Select
                  value={filters.stageId || '__all__'}
                  onValueChange={(v) => onFilterChange('stageId', v === '__all__' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os estágios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os estágios</SelectItem>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.temperature.map((temp) => (
            <Badge key={temp} variant="secondary" className="gap-1">
              {temperatures.find((t) => t.value === temp)?.label}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleArrayFilter('temperature', temp)} />
            </Badge>
          ))}
          {filters.origin.map((origin) => (
            <Badge key={origin} variant="secondary" className="gap-1">
              {LEAD_ORIGINS.find((o) => o.value === origin)?.label}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleArrayFilter('origin', origin)} />
            </Badge>
          ))}
          {filters.channel.map((channel) => (
            <Badge key={channel} variant="secondary" className="gap-1">
              {LEAD_CHANNELS.find((c) => c.value === channel)?.label}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleArrayFilter('channel', channel)} />
            </Badge>
          ))}
          {filters.tagIds.map((tid) => {
            const t = leadTags?.find((x) => x.id === tid);
            if (!t) return null;
            return (
              <Badge key={tid} variant="secondary" className="gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => onFilterChange('tagIds', filters.tagIds.filter((id) => id !== tid))}
                />
              </Badge>
            );
          })}
          {filters.excludeTagIds.map((tid) => {
            const t = leadTags?.find((x) => x.id === tid);
            if (!t) return null;
            return (
              <Badge key={`ex-${tid}`} variant="destructive" className="gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                sem: {t.name}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() =>
                    onFilterChange(
                      'excludeTagIds',
                      filters.excludeTagIds.filter((id) => id !== tid),
                    )
                  }
                />
              </Badge>
            );
          })}
          {filters.excludeOrigin.map((origin) => (
            <Badge key={`ex-o-${origin}`} variant="destructive" className="gap-1">
              sem origem: {LEAD_ORIGINS.find((o) => o.value === origin)?.label ?? origin}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('excludeOrigin', origin)}
              />
            </Badge>
          ))}
          {filters.excludeChannel.map((channel) => (
            <Badge key={`ex-c-${channel}`} variant="destructive" className="gap-1">
              sem canal: {LEAD_CHANNELS.find((c) => c.value === channel)?.label ?? channel}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleArrayFilter('excludeChannel', channel)}
              />
            </Badge>
          ))}
          {filters.datePreset && filters.datePreset !== 'custom' && (
            <Badge variant="secondary" className="gap-1">
              {datePresets.find((p) => p.value === filters.datePreset)?.label}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onFilterChange('datePreset', null)} />
            </Badge>
          )}
          {filters.dateFrom && (
            <Badge variant="secondary" className="gap-1">
              De: {format(filters.dateFrom, 'dd/MM/yy')}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onFilterChange('dateFrom', null)} />
            </Badge>
          )}
          {filters.dateTo && (
            <Badge variant="secondary" className="gap-1">
              Até: {format(filters.dateTo, 'dd/MM/yy')}
              <X className="h-3 w-3 cursor-pointer" onClick={() => onFilterChange('dateTo', null)} />
            </Badge>
          )}
          {filters.customFieldRules.map((r) => {
            const op = OPERATORS_BY_TYPE[r.fieldType]?.find((o) => o.value === r.operator)?.label ?? r.operator;
            const valStr = ruleNeedsValue(r.operator)
              ? r.operator === 'between'
                ? `${r.value ?? '?'} – ${r.valueTo ?? '?'}`
                : String(r.value ?? '')
              : '';
            return (
              <Badge key={r.id} variant="secondary" className="gap-1">
                {r.fieldLabel} {op} {valStr}
                <X className="h-3 w-3 cursor-pointer" onClick={() => removeRule(r.id)} />
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
