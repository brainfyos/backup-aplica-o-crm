import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Trash2, Info, Zap } from 'lucide-react';
import { CadencePicker } from '@/components/admin/cadences/CadencePicker';
import type { PostCallRule } from '@/hooks/useVoiceCalls';

const OUTCOME_OPTIONS: { value: string; label: string }[] = [
  { value: 'agendou_reuniao', label: 'Agendou reunião' },
  { value: 'lead_qualificado', label: 'Lead qualificado' },
  { value: 'recebeu_proposta', label: 'Recebeu proposta' },
  { value: 'transferiu_humano', label: 'Transferiu para humano' },
  { value: 'callback', label: 'Pedir retorno (callback)' },
  { value: 'recusou', label: 'Recusou' },
  { value: 'outro', label: 'Outro' },
];

interface Props {
  rules: PostCallRule[];
  onChange: (rules: PostCallRule[]) => void;
}

export function VoiceCallAutomationsTab({ rules, onChange }: Props) {
  const add = () =>
    onChange([
      ...rules,
      {
        outcome: 'agendou_reuniao',
        create_task: false,
        notify_admins: true,
        task_priority: 'medium',
        task_due_hours: 24,
      },
    ]);

  const patch = (idx: number, r: Partial<PostCallRule>) => {
    const next = [...rules];
    next[idx] = { ...next[idx], ...r };
    onChange(next);
  };
  const remove = (idx: number) => onChange(rules.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Dispara automações quando a ligação encerra com o desfecho escolhido: inscrever o lead numa cadência,
          criar uma task para o dono e/ou notificar os admins. Rodam sempre — se a IA registrar o desfecho ou o próprio visitante escolher.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Regras por desfecho</h3>
          <p className="text-sm text-muted-foreground">Cada linha = um "se … então …".</p>
        </div>
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4 mr-2" /> Nova regra
        </Button>
      </div>

      {rules.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          Nenhuma automação configurada. Desfechos "Agendou reunião" e "Lead qualificado" ainda geram uma notificação padrão para os admins.
        </p>
      )}

      <div className="space-y-3">
        {rules.map((rule, idx) => (
          <Card key={idx}>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Quando o desfecho for</Label>
                  <Select value={rule.outcome} onValueChange={(v) => patch(idx, { outcome: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OUTCOME_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Inscrever lead em cadência</Label>
                <CadencePicker
                  value={rule.cadence_id ?? null}
                  onChange={(id) => patch(idx, { cadence_id: id })}
                  placeholder="Nenhuma cadência"
                />
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <label className="flex items-center justify-between text-sm">
                  <span className="font-medium">Criar task para o dono do lead</span>
                  <Switch
                    checked={!!rule.create_task}
                    onCheckedChange={(v) => patch(idx, { create_task: v })}
                  />
                </label>
                {rule.create_task && (
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6 space-y-1">
                      <Label className="text-xs">Título</Label>
                      <Input
                        placeholder="Ex.: Ligar de volta"
                        value={rule.task_title ?? ''}
                        onChange={(e) => patch(idx, { task_title: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Prioridade</Label>
                      <Select value={rule.task_priority ?? 'medium'} onValueChange={(v) => patch(idx, { task_priority: v as any })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baixa</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 space-y-1">
                      <Label className="text-xs">Prazo (horas)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={rule.task_due_hours ?? 24}
                        onChange={(e) => patch(idx, { task_due_hours: Number(e.target.value) || 24 })}
                      />
                    </div>
                  </div>
                )}
              </div>

              <label className="flex items-center justify-between text-sm rounded-lg border p-3">
                <span>
                  <span className="font-medium">Notificar admins</span>
                  <span className="block text-xs text-muted-foreground">Cria um item em Notificações do admin.</span>
                </span>
                <Switch
                  checked={!!rule.notify_admins}
                  onCheckedChange={(v) => patch(idx, { notify_admins: v })}
                />
              </label>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
