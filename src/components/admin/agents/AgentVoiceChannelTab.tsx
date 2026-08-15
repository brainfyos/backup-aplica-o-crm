import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PhoneCall, Info, RotateCcw, Sparkles } from 'lucide-react';
import { ProductAgent } from '@/types/agents';
import { DEFAULT_VOICE_BEHAVIOR_PROMPT } from './AgentPromptTemplates';
import { OPENAI_REALTIME_VOICES, DEFAULT_OPENAI_VOICE_ID } from '@/config/openaiRealtimeVoices';
import { GROK_NATIVE_VOICES, DEFAULT_GROK_VOICE_ID } from '@/config/grokVoicesCatalog';

interface Props {
  formData: Partial<ProductAgent>;
  onChange: (patch: Partial<ProductAgent>) => void;
}

export function AgentVoiceChannelTab({ formData, onChange }: Props) {
  const enabled = formData.voice_mode_enabled !== false;
  const prompt = formData.voice_behavior_prompt ?? DEFAULT_VOICE_BEHAVIOR_PROMPT;
  const maxSentences = formData.voice_max_sentences ?? 2;
  const maxSeconds = formData.voice_max_seconds ?? 10;
  const maxMinutes = formData.voice_max_call_minutes ?? 10;
  const alwaysAsk = formData.voice_always_end_with_question !== false;
  const toolsEarly = formData.voice_show_tools_early !== false;
  const specificRules = formData.voice_specific_rules ?? '';
  const provider = (formData.voice_provider ?? 'grok') as 'grok' | 'openai' | 'auto';
  const grokVoice = formData.default_grok_voice_id ?? DEFAULT_GROK_VOICE_ID;
  const openaiVoice = formData.openai_voice_id ?? DEFAULT_OPENAI_VOICE_ID;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-lg border bg-primary/5">
        <PhoneCall className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-sm">Modo Ligação de Voz</div>
              <p className="text-xs text-muted-foreground">
                Regras específicas para quando o agente atende por ligação (Web Call / voz).
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => onChange({ voice_mode_enabled: v })}
            />
          </div>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Estas configurações <strong>só se aplicam em ligações de voz</strong>. WhatsApp,
          Inbox, Webchat e demais canais continuam usando as configurações das outras abas —
          nada muda no comportamento atual desses canais.
        </AlertDescription>
      </Alert>

      <div className={enabled ? 'space-y-6' : 'opacity-50 pointer-events-none space-y-6'}>
        {/* Provedor de voz + voz */}
        <div className="space-y-3 p-4 rounded-lg border">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <Label className="text-sm font-medium">Engine de voz</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            OpenAI Realtime tem vozes mais humanas (com emoção, ritmo natural). Grok é o padrão
            atual — cada empresa cadastra sua própria chave OpenAI em <strong>Integrações → IA</strong>{' '}
            (provedor <code className="text-[10px] bg-muted px-1 rounded">openai</code>). Se a chave
            estiver ausente ou falhar, o sistema cai automaticamente no Grok.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Provedor</Label>
              <Select value={provider} onValueChange={(v) => onChange({ voice_provider: v as any })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grok">Grok (xAI) — padrão</SelectItem>
                  <SelectItem value="openai">OpenAI Realtime — mais humano</SelectItem>
                  <SelectItem value="auto">Auto (OpenAI se disponível, senão Grok)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Voz</Label>
              {provider === 'openai' || provider === 'auto' ? (
                <Select value={openaiVoice} onValueChange={(v) => onChange({ openai_voice_id: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_REALTIME_VOICES.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} {v.recommended && <Badge variant="secondary" className="ml-1 text-[9px] h-4">rec</Badge>}
                        <span className="text-muted-foreground text-[11px] ml-1">— {v.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={grokVoice} onValueChange={(v) => onChange({ default_grok_voice_id: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROK_NATIVE_VOICES.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} <span className="text-muted-foreground text-[11px] ml-1">— {v.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        {/* Regras específicas de voz */}
        <div className="space-y-2 p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Regras específicas para VOZ (opcional)</Label>
            {specificRules && <Badge variant="secondary" className="text-[10px]">personalizado</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Instruções extras que se aplicam <strong>apenas</strong> nas ligações desta agente. NÃO
            afetam o WhatsApp/Inbox. Use para pequenos ajustes de comportamento sem editar o prompt
            padrão inteiro.
          </p>
          <Textarea
            value={specificRules}
            onChange={(e) => onChange({ voice_specific_rules: e.target.value })}
            rows={4}
            placeholder="Ex: pode rir se o lead fizer piada; use 'meu bem' em clientes recorrentes; nunca fale sobre concorrentes; ao mencionar preço, sempre traga junto a garantia."
            className="text-xs resize-none"
          />
        </div>

        {/* Prompt base do modo voz */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Comportamento na ligação (prompt base)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ voice_behavior_prompt: DEFAULT_VOICE_BEHAVIOR_PROMPT })}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Restaurar padrão
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Injetado no prompt do agente durante ligações. Use{' '}
            <code className="text-[10px] bg-muted px-1 rounded">{'{MAX_MIN}'}</code> para a duração máxima.
            Prefira mexer nas <strong>regras específicas acima</strong> ao invés de reescrever este texto.
          </p>
          <Textarea
            value={prompt}
            onChange={(e) => onChange({ voice_behavior_prompt: e.target.value })}
            rows={12}
            className="font-mono text-xs"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="space-y-2">
            <Label className="text-xs">Máx. frases por turno: <strong>{maxSentences}</strong></Label>
            <Slider
              value={[maxSentences]}
              min={1}
              max={4}
              step={1}
              onValueChange={([v]) => onChange({ voice_max_sentences: v })}
            />
            <p className="text-[11px] text-muted-foreground">
              2 = balanceado. Pode chegar a 3 quando explicando valor.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Máx. segundos falando: <strong>{maxSeconds}s</strong></Label>
            <Slider
              value={[maxSeconds]}
              min={5}
              max={15}
              step={1}
              onValueChange={([v]) => onChange({ voice_max_seconds: v })}
            />
            <p className="text-[11px] text-muted-foreground">
              Acima disso, o lead desliga mentalmente.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">
              Duração máx. da ligação: <strong>{maxMinutes === 0 ? 'sem limite' : `${maxMinutes} min`}</strong>
            </Label>
            <Slider
              value={[maxMinutes]}
              min={0}
              max={20}
              step={1}
              onValueChange={([v]) => onChange({ voice_max_call_minutes: v })}
            />
            <p className="text-[11px] text-muted-foreground">
              Se ultrapassar, IA oferece desfecho alternativo.
            </p>
          </div>
        </div>

        <div className="space-y-3 mt-6">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <div className="text-sm font-medium">Sempre terminar com pergunta</div>
              <p className="text-xs text-muted-foreground">
                Cada fala devolve a bola pro lead — evita monólogo.
              </p>
            </div>
            <Switch
              checked={alwaysAsk}
              onCheckedChange={(v) => onChange({ voice_always_end_with_question: v })}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <div className="text-sm font-medium">Mostrar ferramentas cedo</div>
              <p className="text-xs text-muted-foreground">
                Ao detectar interesse, IA chama <code className="text-[10px]">listar_horarios_reuniao</code>{' '}
                em vez de recitar horários por voz.
              </p>
            </div>
            <Switch
              checked={toolsEarly}
              onCheckedChange={(v) => onChange({ voice_show_tools_early: v })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
