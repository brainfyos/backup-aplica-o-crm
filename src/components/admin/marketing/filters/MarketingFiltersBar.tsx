import { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, Filter, SlidersHorizontal } from 'lucide-react';
import { MultiSelectCombobox, MultiOption } from './MultiSelectCombobox';
import { DateRangeControl, DateRange } from './DateRangeControl';
import { objectiveOptions, objectiveLabel } from '@/lib/metaAdsLabels';

export interface MarketingFilters {
  range: DateRange;
  adAccounts: string[];
  campaignIds: string[];
  adsetIds: string[];
  adIds: string[];
  objectives: string[];
  status: 'all' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  onlyActive: boolean;
}

interface Props {
  filters: MarketingFilters;
  onChange: (patch: Partial<MarketingFilters>) => void;
  onReset: () => void;
  adAccountOptions: MultiOption[];
  campaignOptions: MultiOption[];
  adsetOptions: MultiOption[];
  adOptions: MultiOption[];
  availableObjectives: string[];
}

export function MarketingFiltersBar({
  filters,
  onChange,
  onReset,
  adAccountOptions: _adAccountOptions,
  campaignOptions,
  adsetOptions,
  adOptions,
  availableObjectives,
}: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const objOpts: MultiOption[] = (
    availableObjectives.length > 0
      ? availableObjectives.map((v) => ({ value: v, label: objectiveLabel(v) }))
      : objectiveOptions()
  ).sort((a, b) => a.label.localeCompare(b.label));
  const activeAdvanced = useMemo(() => [
    filters.campaignIds.length,
    filters.adsetIds.length,
    filters.adIds.length,
    filters.objectives.length,
    filters.status === 'all' ? 0 : 1,
    filters.onlyActive ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0), [filters]);

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <FieldWrap label="Período">
            <DateRangeControl value={filters.range} onChange={(range) => onChange({ range })} />
          </FieldWrap>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setAdvancedOpen((value) => !value)}
          className="sm:ml-auto justify-between gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros avançados
          {activeAdvanced > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {activeAdvanced}
            </span>
          )}
          <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {advancedOpen && (
        <div className="space-y-3 border-t pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FieldWrap label="Campanha">
              <MultiSelectCombobox options={campaignOptions} selected={filters.campaignIds}
                onChange={(campaignIds) => onChange({ campaignIds, adsetIds: [], adIds: [] })}
                allLabel="Todas as campanhas" />
            </FieldWrap>
            <FieldWrap label="Conjunto de anúncios">
              <MultiSelectCombobox options={adsetOptions} selected={filters.adsetIds}
                onChange={(adsetIds) => onChange({ adsetIds, adIds: [] })}
                allLabel="Todos os conjuntos" />
            </FieldWrap>
            <FieldWrap label="Anúncio">
              <MultiSelectCombobox options={adOptions} selected={filters.adIds}
                onChange={(adIds) => onChange({ adIds })} allLabel="Todos os anúncios" />
            </FieldWrap>
            <FieldWrap label="Objetivo da campanha">
              <MultiSelectCombobox options={objOpts} selected={filters.objectives}
                onChange={(objectives) => onChange({ objectives })} allLabel="Todos os objetivos" />
            </FieldWrap>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(180px,280px)_auto_1fr] gap-3 items-end">
            <FieldWrap label="Status">
              <Select value={filters.status}
                onValueChange={(v) => onChange({ status: v as MarketingFilters['status'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ACTIVE">Ativas</SelectItem>
                  <SelectItem value="PAUSED">Pausadas</SelectItem>
                  <SelectItem value="ARCHIVED">Arquivadas</SelectItem>
                </SelectContent>
              </Select>
            </FieldWrap>
            <div className="flex items-center gap-2 h-10 rounded-md border px-3 bg-background">
              <Switch checked={filters.onlyActive}
                onCheckedChange={(onlyActive) =>
                  onChange({ onlyActive, status: onlyActive ? 'ACTIVE' : filters.status })
                } />
              <Label className="text-sm cursor-pointer">Somente ativas</Label>
            </div>
            <Button variant="ghost" size="sm" onClick={onReset} className="h-10 justify-self-start sm:justify-self-end">
              <Filter className="h-3.5 w-3.5 mr-1.5" /> Limpar filtros
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldWrap({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs text-muted-foreground font-medium">{label}</Label>
      {children}
    </div>
  );
}
