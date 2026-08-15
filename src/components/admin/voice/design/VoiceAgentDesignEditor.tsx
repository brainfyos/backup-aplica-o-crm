import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { PhoneFrame } from '@/components/publiccall/PhoneFrame';
import { LandingView } from '@/components/publiccall/views/LandingView';
import { RingingView } from '@/components/publiccall/views/RingingView';
import { DoneView } from '@/components/publiccall/views/DoneView';
import { DEFAULT_APPEARANCE, mergeAppearance, type PublicCallAppearance } from '@/components/publiccall/appearance';

type PreviewView = 'landing' | 'ringing' | 'in_call' | 'done';

const FONT_OPTIONS = ['Space Grotesk', 'Inter', 'DM Sans', 'Manrope', 'Poppins', 'Plus Jakarta Sans'];
const MONO_OPTIONS = ['Space Mono', 'JetBrains Mono', 'IBM Plex Mono', 'Fira Code'];

export function VoiceAgentDesignEditor({
  appearance,
  onChange,
  agentName,
  agentRole,
  agentPhoto,
  headline,
  subheadline,
  ctaLabel,
}: {
  appearance?: PublicCallAppearance | null;
  onChange: (a: PublicCallAppearance) => void;
  agentName: string;
  agentRole?: string | null;
  agentPhoto?: string | null;
  headline: string;
  subheadline: string;
  ctaLabel: string;
}) {
  const [view, setView] = useState<PreviewView>('landing');
  const value = mergeAppearance(appearance);
  const patch = (p: Partial<PublicCallAppearance>) => onChange({ ...(appearance || {}), ...p });

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_360px] pt-2">
      {/* Painel de edição */}
      <div className="space-y-4">
        <Section title="Cores">
          <div className="grid grid-cols-2 gap-3">
            <Color label="Fundo" v={value.bg_color} onChange={(v) => patch({ bg_color: v })} />
            <Color label="Cor de destaque" v={value.accent_color} onChange={(v) => patch({ accent_color: v })} />
            <Color label="Brilho do destaque" v={value.accent_glow} onChange={(v) => patch({ accent_glow: v })} />
            <Color label="Cor do CTA" v={value.cta_color} onChange={(v) => patch({ cta_color: v })} />
            <Color label="Texto do CTA" v={value.cta_text_color} onChange={(v) => patch({ cta_text_color: v })} />
            <Color label="Bolha do usuário" v={value.user_bubble_color} onChange={(v) => patch({ user_bubble_color: v })} />
            <Color label="Onda IA" v={value.wave_ia_color} onChange={(v) => patch({ wave_ia_color: v })} />
            <Color label="Onda usuário" v={value.wave_user_color} onChange={(v) => patch({ wave_user_color: v })} />
          </div>
        </Section>

        <Section title="Tipografia">
          <div className="grid grid-cols-3 gap-3">
            <FontSel label="Display" v={value.font_display} opts={FONT_OPTIONS} onChange={(v) => patch({ font_display: v })} />
            <FontSel label="Texto" v={value.font_body} opts={FONT_OPTIONS} onChange={(v) => patch({ font_body: v })} />
            <FontSel label="Mono" v={value.font_mono} opts={MONO_OPTIONS} onChange={(v) => patch({ font_mono: v })} />
          </div>
        </Section>

        <Section title="Textos">
          <div className="space-y-2">
            <Label className="text-xs">Micro-legenda abaixo do CTA</Label>
            <Input
              value={value.micro_below_cta}
              onChange={(e) => patch({ micro_below_cta: e.target.value })}
              placeholder={DEFAULT_APPEARANCE.micro_below_cta}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Status "chamando"</Label>
              <Input value={value.ringing_status} onChange={(e) => patch({ ringing_status: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Título do desfecho</Label>
              <Input value={value.done_title} onChange={(e) => patch({ done_title: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Subtítulo do desfecho</Label>
            <Textarea rows={2} value={value.done_subtitle} onChange={(e) => patch({ done_subtitle: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Botão "adicionar ao calendário"</Label>
              <Input value={value.add_to_calendar_label} onChange={(e) => patch({ add_to_calendar_label: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link "tocar de novo"</Label>
              <Input value={value.play_again_label} onChange={(e) => patch({ play_again_label: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nota do rodapé</Label>
            <Input value={value.footer_note} onChange={(e) => patch({ footer_note: e.target.value })} />
          </div>
        </Section>

        <Section title="Comportamento visual">
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Dynamic Island" v={value.show_dynamic_island} onChange={(v) => patch({ show_dynamic_island: v })} />
            <Toggle label="Barra inferior (home bar)" v={value.show_home_bar} onChange={(v) => patch({ show_home_bar: v })} />
            <Toggle label="Ondas ao chamar (ripples)" v={value.show_ripples} onChange={(v) => patch({ show_ripples: v })} />
            <Toggle label="Waveform em ligação" v={value.show_waveform} onChange={(v) => patch({ show_waveform: v })} />
            <Toggle label="Mostrar timer" v={value.show_timer} onChange={(v) => patch({ show_timer: v })} />
            <Toggle
              label='Modo "atender ligação"'
              v={value.enable_incoming_mode}
              onChange={(v) => patch({ enable_incoming_mode: v })}
            />
          </div>
          {value.enable_incoming_mode && (
            <div className="space-y-1 mt-2">
              <Label className="text-xs">Rótulo do botão "atender"</Label>
              <Input
                value={value.incoming_button_label || ''}
                onChange={(e) => patch({ incoming_button_label: e.target.value })}
                placeholder="Atender ligação"
              />
            </div>
          )}
        </Section>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({})}
            className="text-xs text-muted-foreground"
          >
            Restaurar padrão
          </Button>
        </div>
      </div>

      {/* Preview iPhone */}
      <div className="space-y-3">
        <div className="flex items-center gap-1 flex-wrap">
          {(['landing', 'ringing', 'in_call', 'done'] as PreviewView[]).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? 'default' : 'outline'}
              className="h-7 text-[11px]"
              onClick={() => setView(v)}
            >
              {v === 'landing' ? 'Landing' : v === 'ringing' ? 'Chamando' : v === 'in_call' ? 'Ligação' : 'Desfecho'}
            </Button>
          ))}
        </div>
        <div
          className="rounded-xl p-4 flex justify-center overflow-hidden"
          style={{ background: value.bg_color, transform: 'scale(0.72)', transformOrigin: 'top center', height: 620 }}
        >
          <PhoneFrame appearance={value} onCall={view === 'in_call'} timerText="00:12">
            {view === 'landing' && (
              <LandingView
                appearance={value}
                agentName={agentName}
                agentRole={agentRole}
                agentPhoto={agentPhoto}
                headline={agentName}
                subheadline={subheadline}
                ctaLabel={ctaLabel}
                onStart={() => setView('ringing')}
              />
            )}
            {view === 'ringing' && (
              <RingingView appearance={value} agentName={agentName} agentPhoto={agentPhoto} onHangup={() => setView('landing')} />
            )}
            {view === 'in_call' && (
              <div className="pc-view pc-on pc-call">
                <div className="pc-call-head">
                  <div className="pc-avatar" style={{ width: 46, height: 46, fontSize: 19 }}>
                    {agentPhoto ? <img src={agentPhoto} alt="" /> : agentName.slice(0, 1)}
                  </div>
                  <div className="pc-who">
                    <div className="pc-n">{agentName}</div>
                    <div className="pc-s"><i /> em ligação</div>
                  </div>
                  {value.show_timer && <div className="pc-timer">00:12</div>}
                </div>
                {value.show_waveform && (
                  <div className="pc-wave pc-talking">{Array.from({ length: 24 }).map((_, i) => <span key={i} />)}</div>
                )}
                <div className="pc-transcript">
                  <div className="pc-msg pc-ia">Olá! Como posso te ajudar hoje?</div>
                  <div className="pc-msg pc-me">Queria saber mais sobre o Vendus.</div>
                  <div className="pc-msg pc-ia">Perfeito, deixa eu te fazer uma pergunta rápida.</div>
                </div>
              </div>
            )}
            {view === 'done' && (
              <DoneView
                appearance={value}
                outcomeKind="agendou_reuniao"
                outcomeLabel={value.done_title}
                context={{
                  agentName,
                  agendamento: {
                    start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    end: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
                  },
                }}
                agentName={agentName}
                agentPhoto={agentPhoto}
              />
            )}
          </PhoneFrame>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}

function Color({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded-md border cursor-pointer bg-transparent"
        />
        <Input value={v} onChange={(e) => onChange(e.target.value)} className="h-9 flex-1 font-mono text-xs" />
      </div>
    </div>
  );
}

function FontSel({ label, v, opts, onChange }: { label: string; v: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={v} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Toggle({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <span className="text-xs">{label}</span>
      <Switch checked={v} onCheckedChange={onChange} />
    </div>
  );
}
