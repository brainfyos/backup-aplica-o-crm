import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLeadTags } from '@/hooks/useLeadTags';
import type { ActionsConfig, ActionConfig } from '@/hooks/useOpportunityScan';

interface Props {
  value: ActionsConfig;
  onChange: (v: ActionsConfig) => void;
}

const CLASSES: { key: keyof ActionsConfig; label: string; emoji: string; color: string }[] = [
  { key: 'hot', label: 'HOT — Quente', emoji: '🔥', color: 'text-red-500' },
  { key: 'warm', label: 'WARM — Morno', emoji: '🌤️', color: 'text-orange-500' },
  { key: 'cold', label: 'COLD — Frio', emoji: '❄️', color: 'text-blue-500' },
  { key: 'lost', label: 'LOST — Perdido', emoji: '💀', color: 'text-muted-foreground' },
];

export function RadarActionsConfig({ value, onChange }: Props) {
  const { data: tags } = useLeadTags();

  function update(key: keyof ActionsConfig, patch: Partial<ActionConfig>) {
    onChange({ ...value, [key]: { ...(value[key] || {}), ...patch } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ações automáticas</CardTitle>
        <CardDescription className="text-xs">O que fazer quando o radar classificar cada lead</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CLASSES.map(({ key, label, emoji, color }) => {
          const cfg = value[key] || {};
          return (
            <div key={key} className="rounded-md border p-3 space-y-2">
              <div className={`text-sm font-medium ${color}`}>{emoji} {label}</div>

              <div className="flex items-center justify-between text-sm">
                <Label className="cursor-pointer flex-1">Criar tarefa para o dono</Label>
                <Switch
                  checked={!!cfg.create_task?.enabled}
                  onCheckedChange={(v) => update(key, { create_task: { enabled: v, due_in_hours: cfg.create_task?.due_in_hours ?? 24 } })}
                />
              </div>

              {cfg.create_task?.enabled && (
                <div className="flex items-center gap-2 pl-2">
                  <Label className="text-xs text-muted-foreground">Prazo (h):</Label>
                  <Input
                    type="number"
                    className="h-7 w-16 text-xs"
                    value={cfg.create_task?.due_in_hours ?? 24}
                    onChange={(e) => update(key, { create_task: { enabled: true, due_in_hours: Number(e.target.value) } })}
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <Label className="cursor-pointer flex-1">Notificar dono do lead</Label>
                <Switch checked={!!cfg.notify_owner} onCheckedChange={(v) => update(key, { notify_owner: v })} />
              </div>

              <div className="flex items-center justify-between text-sm">
                <Label className="cursor-pointer flex-1">Aplicar etiqueta</Label>
                <Select
                  value={cfg.apply_tag_id || ''}
                  onValueChange={(v) => update(key, { apply_tag_id: v === '__none__' ? undefined : v })}
                >
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue placeholder="Nenhuma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {(tags || []).map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
