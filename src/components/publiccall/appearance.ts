// Tipos e defaults do design editável da página /call/:slug (moldura iPhone).
// Salvo em voice_agents.appearance (jsonb).

export type PublicCallView = 'landing' | 'ringing' | 'in_call' | 'done';
export type DeviceTheme = 'phone' | 'android' | 'instagram' | 'whatsapp' | 'facetime';

export interface PublicCallAppearance {
  // Cores (HSL ou hex livre)
  bg_color?: string;               // fundo do "obsidian"
  accent_color?: string;           // cor primária (mia)
  accent_glow?: string;            // brilho (mia-glow)
  cta_color?: string;              // CTA verde neon
  cta_text_color?: string;
  user_bubble_color?: string;      // bolha do usuário na transcrição
  ia_bubble_color?: string;        // bolha da IA
  wave_ia_color?: string;
  wave_user_color?: string;
  // Fontes
  font_display?: string;           // ex: 'Space Grotesk'
  font_body?: string;              // ex: 'Inter'
  font_mono?: string;              // ex: 'Space Mono'
  // Textos
  micro_below_cta?: string;        // ex: "atendimento imediato · sem espera · por voz"
  ringing_status?: string;         // ex: "chamando"
  done_title?: string;
  done_subtitle?: string;
  add_to_calendar_label?: string;
  play_again_label?: string;
  footer_note?: string;
  // Comportamento visual
  show_ripples?: boolean;
  show_waveform?: boolean;
  show_timer?: boolean;
  show_home_bar?: boolean;
  show_dynamic_island?: boolean;
  // Wallpaper opcional (imagem de fundo dentro da tela)
  wallpaper_url?: string;
  // Landing: mostra também botão "Atender ligação" (simula chamada recebida)
  enable_incoming_mode?: boolean;
  incoming_button_label?: string;
  // Agenda padrão usada pela IA quando nenhum CTA schedule tem event_type_id
  default_event_type_id?: string | null;
}

export const DEFAULT_APPEARANCE: Required<
  Pick<
    PublicCallAppearance,
    | 'bg_color'
    | 'accent_color'
    | 'accent_glow'
    | 'cta_color'
    | 'cta_text_color'
    | 'user_bubble_color'
    | 'ia_bubble_color'
    | 'wave_ia_color'
    | 'wave_user_color'
    | 'font_display'
    | 'font_body'
    | 'font_mono'
    | 'micro_below_cta'
    | 'ringing_status'
    | 'done_title'
    | 'done_subtitle'
    | 'add_to_calendar_label'
    | 'play_again_label'
    | 'footer_note'
    | 'show_ripples'
    | 'show_waveform'
    | 'show_timer'
    | 'show_home_bar'
    | 'show_dynamic_island'
  >
> = {
  bg_color: '#0A0D13',
  accent_color: '#8B5CF6',
  accent_glow: '#A78BFA',
  cta_color: '#4ADE80',
  cta_text_color: '#052012',
  user_bubble_color: '#4ADE80',
  ia_bubble_color: '#FFFFFF',
  wave_ia_color: '#A78BFA',
  wave_user_color: '#4ADE80',
  font_display: 'Space Grotesk',
  font_body: 'Inter',
  font_mono: 'Space Mono',
  micro_below_cta: 'atendimento imediato · sem espera · por voz',
  ringing_status: 'chamando',
  done_title: 'Reunião confirmada!',
  done_subtitle: 'Você vai receber um lembrete no WhatsApp antes.',
  add_to_calendar_label: 'Adicionar ao calendário',
  play_again_label: '↺ tocar demo novamente: encerre e ligue de novo',
  footer_note: 'Toda ligação termina em um desfecho registrado.',
  show_ripples: true,
  show_waveform: true,
  show_timer: true,
  show_home_bar: true,
  show_dynamic_island: true,
};

export function mergeAppearance(a?: PublicCallAppearance | null): typeof DEFAULT_APPEARANCE & PublicCallAppearance {
  return { ...DEFAULT_APPEARANCE, ...(a || {}) };
}

// Injeta as variáveis CSS usadas pela moldura + views
export function appearanceCssVars(a: PublicCallAppearance): React.CSSProperties {
  const m = mergeAppearance(a);
  return {
    ['--pc-bg' as any]: m.bg_color,
    ['--pc-accent' as any]: m.accent_color,
    ['--pc-accent-glow' as any]: m.accent_glow,
    ['--pc-cta' as any]: m.cta_color,
    ['--pc-cta-text' as any]: m.cta_text_color,
    ['--pc-user' as any]: m.user_bubble_color,
    ['--pc-ia' as any]: m.ia_bubble_color,
    ['--pc-wave-ia' as any]: m.wave_ia_color,
    ['--pc-wave-user' as any]: m.wave_user_color,
    ['--pc-font-display' as any]: `'${m.font_display}', ui-sans-serif, system-ui`,
    ['--pc-font-body' as any]: `'${m.font_body}', ui-sans-serif, system-ui`,
    ['--pc-font-mono' as any]: `'${m.font_mono}', ui-monospace, SFMono-Regular`,
  } as React.CSSProperties;
}

export function initialsFor(name?: string | null): string {
  if (!name) return 'IA';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
}
