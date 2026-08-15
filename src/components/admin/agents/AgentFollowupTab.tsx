import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Repeat, MessageSquare, Clock, Lightbulb } from 'lucide-react';
import { ProductAgent } from '@/types/agents';

interface Props {
  formData: Partial<ProductAgent>;
  onChange: (updates: Partial<ProductAgent>) => void;
}

const MAX_ATTEMPTS = 5;
const DEFAULT_INTERVALS = [15, 120, 1440, 2880, 4320]; // min

const TONE_OPTIONS = [
  { value: 'short',        label: 'Curto e direto',           hint: '"Ainda aí? Posso continuar?"' },
  { value: 'warm',         label: 'Caloroso e consultivo',     hint: '"Oi {nome}, tudo bem? Ficou alguma dúvida?"' },
  { value: 'provocative',  label: 'Provocativo / quebra de objeção', hint: '"Se preço for o tema, consigo te mostrar o ROI rapidinho."' },
] as const;

const CHANNELS = [
  { id: 'whatsapp',  label: 'WhatsApp'  },
  { id: 'instagram', label: 'Instagram' },
  { id: 'webchat',   label: 'Webchat'   },
];

function formatInterval(min: number): string {
  if (min < 60)   return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}

export function AgentFollowupTab({ formData, onChange }: Props) {
  const enabled        = !!formData.followup_enabled;
  const maxAttempts    = formData.followup_max_attempts ?? 3;
  const intervals      = useMemo(
    () => formData.followup_intervals_minutes ?? DEFAULT_INTERVALS.slice(0, maxAttempts),
    [formData.followup_intervals_minutes, maxAttempts],
  );
  const tone           = formData.followup_tone ?? 'warm';
  const extra          = formData.followup_extra_instructions ?? '';
  const respectHours   = formData.followup_respect_business_hours ?? true;
  const stopOnHuman    = formData.followup_stop_on_human ?? true;
  const stopOnBooking  = formData.followup_stop_on_booking ?? true;
  const channels       = formData.followup_channels ?? ['whatsapp', 'instagram'];
  const hints: Array<{ attempt: number; hint: string }> =
    Array.isArray(formData.followup_attempt_hints) ? formData.followup_attempt_hints as any : [];

  const getHint = (attempt: number) =>
    hints.find((h) => h.attempt === attempt)?.hint ?? '';

  const setHint = (attempt: number, hint: string) => {
    const next = hints.filter((h) => h.attempt !== attempt);
    if (hint.trim()) next.push({ attempt, hint: hint.trim() });
    next.sort((a, b) => a.attempt - b.attempt);
    onChange({ followup_attempt_hints: next as any });
  };

  const setInterval = (idx: number, value: number) => {
    const next = [...intervals];
    next[idx] = Math.max(1, value);
    onChange({ followup_intervals_minutes: next });
  };

  const setMaxAttempts = (n: number) => {
    const clean = Math.min(MAX_ATTEMPTS, Math.max(1, n));
    const next = [...intervals];
    while (next.length < clean) next.push(DEFAULT_INTERVALS[next.length] ?? 1440);
    onChange({
      followup_max_attempts: clean,
      followup_intervals_minutes: next.slice(0, clean),
    });
  };

  const toggleChannel = (id: string) => {
    const has = channels.includes(id);
    const next = has ? channels.filter((c) => c !== id) : [...channels, id];
    onChange({ followup_channels: next });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <Repeat className="h-5 w-5 text-primary" />
          </div>
          <div>
            <Label className="text-base">Follow-up automático contextual</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Quando o lead "some" no meio da conversa, o agente envia uma retomada gerada por IA
              com o contexto real, citando o nome e o assunto. Tom natural, sem cara de robô.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onChange({ followup_enabled: v })}
        />
      </div>

      {enabled && (
        <>
          {/* Tentativas + intervalos */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">Tentativas e intervalos</Label>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Quantas tentativas?</Label>
                <Select
                  value={String(maxAttempts)}
                  onValueChange={(v) => setMaxAttempts(parseInt(v, 10))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} tentativa{n > 1 ? 's' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Após esgotar, o lead sai da régua automática.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Quanto tempo após o silêncio do lead?</Label>
              {Array.from({ length: maxAttempts }).map((_, i) => (
                <div key={i} className="grid grid-cols-[80px_1fr_90px] gap-2 items-center">
                  <span className="text-sm font-medium">
                    {i + 1}ª {i === 0 ? '➜' : '➜'}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={intervals[i] ?? DEFAULT_INTERVALS[i] ?? 60}
                    onChange={(e) => setInterval(i, parseInt(e.target.value || '0', 10))}
                  />
                  <span className="text-xs text-muted-foreground">
                    minutos ({formatInterval(intervals[i] ?? DEFAULT_INTERVALS[i] ?? 60)})
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Os intervalos contam a partir da última mensagem do agente sem resposta.
              </p>
            </div>
          </Card>

          {/* Tom */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">Tom da retomada</Label>
            </div>
            <div className="grid gap-2">
              {TONE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition ${
                    tone === opt.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'
                  }`}
                >
                  <input
                    type="radio"
                    className="mt-1"
                    checked={tone === opt.value}
                    onChange={() => onChange({ followup_tone: opt.value as any })}
                  />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground italic mt-0.5">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </Card>

          {/* Dicas por tentativa */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">Intenção de cada tentativa (opcional)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              A IA escreve a mensagem do zero usando o contexto. Aqui você só guia a intenção.
              Ex: "checar dúvida residual", "oferecer prova social", "oferecer ligação".
            </p>
            {Array.from({ length: maxAttempts }).map((_, i) => {
              const attempt = i + 1;
              return (
                <div key={attempt} className="grid grid-cols-[60px_1fr] gap-2 items-center">
                  <span className="text-sm font-medium">{attempt}ª</span>
                  <Input
                    placeholder="Ex: oferecer falar por ligação"
                    value={getHint(attempt)}
                    onChange={(e) => setHint(attempt, e.target.value)}
                  />
                </div>
              );
            })}
          </Card>

          {/* Instruções extras */}
          <Card className="p-4 space-y-2">
            <Label className="text-sm font-semibold">Instruções extras gerais</Label>
            <Textarea
              rows={3}
              placeholder="Ex: na última tentativa, ofereça enviar material em vídeo ou agendar uma call rápida."
              value={extra}
              onChange={(e) => onChange({ followup_extra_instructions: e.target.value })}
            />
          </Card>

          {/* Canais + Guardrails */}
          <Card className="p-4 space-y-4">
            <div>
              <Label className="text-sm font-semibold">Canais permitidos</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {CHANNELS.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={channels.includes(c.id)}
                      onCheckedChange={() => toggleChannel(c.id)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <Label className="text-sm font-semibold">Guardrails</Label>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Respeitar horário comercial</div>
                  <div className="text-xs text-muted-foreground">Adia a tentativa para o próximo expediente.</div>
                </div>
                <Switch checked={respectHours} onCheckedChange={(v) => onChange({ followup_respect_business_hours: v })} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Parar se conversa for para humano</div>
                  <div className="text-xs text-muted-foreground">Encerra a régua quando um atendente assume.</div>
                </div>
                <Switch checked={stopOnHuman} onCheckedChange={(v) => onChange({ followup_stop_on_human: v })} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Parar se reunião for agendada</div>
                  <div className="text-xs text-muted-foreground">Se a IA ou o vendedor agendou, não insiste.</div>
                </div>
                <Switch checked={stopOnBooking} onCheckedChange={(v) => onChange({ followup_stop_on_booking: v })} />
              </div>

              <div className="text-xs text-muted-foreground pt-2">
                Sempre interrompido quando o lead responde, marca opt-out, ou a conversa é fechada/perdida.
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
