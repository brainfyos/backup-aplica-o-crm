import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProducts } from '@/hooks/useProducts';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useSectors } from '@/hooks/useSectors';
import { useTeamMembers } from '@/hooks/useTeam';
import { useSquads } from '@/hooks/useSquads';
import { useAuth } from '@/hooks/useAuth';
import type { ScanFilters } from '@/hooks/useOpportunityScan';
import { FilterMultiSelect } from './FilterMultiSelect';

interface Props {
  value: ScanFilters;
  onChange: (v: ScanFilters) => void;
}

const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'webchat', label: 'WebChat' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'telegram', label: 'Telegram' },
];

const STATUSES = [
  { id: 'waiting_human', label: 'Aguardando' },
  { id: 'human_active', label: 'Em atendimento' },
  { id: 'bot_active', label: 'Com IA' },
];

const TEMPERATURES = [
  { id: 'hot', label: 'Quente', color: '#ef4444' },
  { id: 'warm', label: 'Morno', color: '#f59e0b' },
  { id: 'cold', label: 'Frio', color: '#3b82f6' },
];

export function RadarFilters({ value, onChange }: Props) {
  const { user, profile } = useAuth();
  const { data: products } = useProducts();
  const { data: tags } = useLeadTags();
  const { data: sectors } = useSectors();
  const { data: members } = useTeamMembers(profile?.organization_id || (user as any)?.organization_id);
  const { data: squads } = useSquads();

  function toggle<T extends keyof ScanFilters>(key: T, val: string) {
    const arr = (value[key] as unknown as string[]) || [];
    const next = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
    onChange({ ...value, [key]: next });
  }

  function clearAll() {
    onChange({
      inactivity_days_min: 0,
      inactivity_days_max: 14,
      min_client_messages: 1,
      include_ai_active: false,
      statuses: ['waiting_human', 'human_active', 'bot_active'],
    });
  }

  const activeCount =
    (value.product_ids?.length || 0) +
    (value.assigned_user_ids?.length || 0) +
    (value.tag_ids?.length || 0) +
    (value.sector_ids?.length || 0) +
    (value.channels?.length || 0) +
    (value.squad_ids?.length || 0) +
    (value.temperatures?.length || 0) +
    (value.exclude_product_ids?.length || 0) +
    (value.exclude_assigned_user_ids?.length || 0) +
    (value.exclude_tag_ids?.length || 0) +
    (value.exclude_sector_ids?.length || 0) +
    (value.exclude_channels?.length || 0) +
    (value.exclude_lead_ids?.length || 0) +
    (value.require_no_tags ? 1 : 0) +
    (value.require_no_sector ? 1 : 0) +
    (value.require_no_assigned ? 1 : 0) +
    (value.min_score ? 1 : 0) +
    (value.min_deal_value ? 1 : 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Filtros da análise</CardTitle>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <Badge variant="secondary" className="h-5 text-[10px]">
                {activeCount} {activeCount === 1 ? 'filtro' : 'filtros'}
              </Badge>
            )}
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll}>
                <X className="h-3 w-3 mr-1" /> Limpar
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Janela de inatividade */}
        <div>
          <Label className="text-xs text-muted-foreground">Período de inatividade (dias)</Label>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm w-8 text-center">{value.inactivity_days_min ?? 0}</span>
            <Slider
              value={[value.inactivity_days_min ?? 0, value.inactivity_days_max ?? 14]}
              onValueChange={([min, max]) =>
                onChange({ ...value, inactivity_days_min: min, inactivity_days_max: max })
              }
              max={30}
              min={0}
              step={1}
              className="flex-1"
            />
            <span className="text-sm w-8 text-center">{value.inactivity_days_max ?? 14}</span>
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Mínimo de mensagens do cliente</Label>
          <div className="flex items-center gap-3 mt-2">
            <Slider
              value={[value.min_client_messages ?? 1]}
              onValueChange={([v]) => onChange({ ...value, min_client_messages: v })}
              max={20}
              min={0}
              step={1}
              className="flex-1"
            />
            <span className="text-sm w-8 text-center">{value.min_client_messages ?? 1}</span>
          </div>
        </div>

        <Separator />

        {/* Status (apenas inclusão) */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Status da conversa</Label>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => {
              const sel = (value.statuses || []).includes(s.id);
              return (
                <Badge
                  key={s.id}
                  variant={sel ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => toggle('statuses', s.id)}
                >
                  {s.label}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Temperatura do lead */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Temperatura do lead</Label>
          <div className="flex flex-wrap gap-1.5">
            {TEMPERATURES.map((t) => {
              const sel = (value.temperatures || []).includes(t.id as any);
              return (
                <Badge
                  key={t.id}
                  variant={sel ? 'default' : 'outline'}
                  className="cursor-pointer text-xs gap-1.5"
                  style={sel ? { backgroundColor: t.color, borderColor: t.color } : undefined}
                  onClick={() => toggle('temperatures', t.id)}
                >
                  <span
                    className={cn('w-2 h-2 rounded-full inline-block')}
                    style={{ background: sel ? '#fff' : t.color }}
                  />
                  {t.label}
                </Badge>
              );
            })}
          </div>
        </div>

        {/* Valor mínimo do negócio */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Valor mínimo do negócio (R$)</Label>
          <Input
            type="number"
            min={0}
            value={value.min_deal_value ?? ''}
            placeholder="Ex: 1000"
            onChange={(e) =>
              onChange({
                ...value,
                min_deal_value: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
            className="h-8 text-xs"
          />
        </div>

        <Separator />

        <FilterMultiSelect
          title="Etiquetas"
          items={(tags || []).map((t: any) => ({ id: t.id, label: t.name, color: t.color }))}
          included={value.tag_ids || []}
          excluded={value.exclude_tag_ids || []}
          onToggleInclude={(id) => toggle('tag_ids', id)}
          onToggleExclude={(id) => toggle('exclude_tag_ids', id)}
          placeholder="Buscar etiquetas..."
        />

        <FilterMultiSelect
          title="Setor"
          items={(sectors || []).map((s: any) => ({ id: s.id, label: s.name, color: s.color }))}
          included={value.sector_ids || []}
          excluded={value.exclude_sector_ids || []}
          onToggleInclude={(id) => toggle('sector_ids', id)}
          onToggleExclude={(id) => toggle('exclude_sector_ids', id)}
        />

        <FilterMultiSelect
          title="Atendente"
          items={(members || []).map((m: any) => ({ id: m.id, label: m.full_name || m.email }))}
          included={value.assigned_user_ids || []}
          excluded={value.exclude_assigned_user_ids || []}
          onToggleInclude={(id) => toggle('assigned_user_ids', id)}
          onToggleExclude={(id) => toggle('exclude_assigned_user_ids', id)}
          placeholder="Buscar atendente..."
        />

        <FilterMultiSelect
          title="Squad"
          items={(squads || []).map((s: any) => ({ id: s.id, label: s.name }))}
          included={value.squad_ids || []}
          excluded={[]}
          onToggleInclude={(id) => toggle('squad_ids', id)}
          onToggleExclude={() => {}}
        />

        <FilterMultiSelect
          title="Produto"
          items={(products || []).map((p: any) => ({ id: p.id, label: p.name }))}
          included={value.product_ids || []}
          excluded={value.exclude_product_ids || []}
          onToggleInclude={(id) => toggle('product_ids', id)}
          onToggleExclude={(id) => toggle('exclude_product_ids', id)}
        />

        <FilterMultiSelect
          title="Canal"
          items={CHANNELS}
          included={value.channels || []}
          excluded={value.exclude_channels || []}
          onToggleInclude={(id) => toggle('channels', id)}
          onToggleExclude={(id) => toggle('exclude_channels', id)}
          searchable={false}
        />

        <Separator />

        {/* Toggles especiais */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Apenas conversas sem etiqueta</Label>
            <Switch
              checked={!!value.require_no_tags}
              onCheckedChange={(v) => onChange({ ...value, require_no_tags: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Apenas conversas sem setor</Label>
            <Switch
              checked={!!value.require_no_sector}
              onCheckedChange={(v) => onChange({ ...value, require_no_sector: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Apenas conversas sem atendente</Label>
            <Switch
              checked={!!value.require_no_assigned}
              onCheckedChange={(v) => onChange({ ...value, require_no_assigned: v })}
            />
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <Label className="text-sm">Incluir conversas com IA ativa</Label>
            <Switch
              checked={!!value.include_ai_active}
              onCheckedChange={(v) => onChange({ ...value, include_ai_active: v })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
