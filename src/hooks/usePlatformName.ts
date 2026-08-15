import { useQuery } from '@tanstack/react-query';
import {
  PLATFORM_BRANDING_QUERY_OPTIONS,
  readCachedBrandingSync,
} from '@/hooks/usePlatformBranding';

/**
 * Wrapper magro em torno da mesma query canônica de branding (`platform-branding`).
 * Garante que sidebar, header, login e demais consumidores leiam exatamente
 * a mesma fonte de verdade aplicada por `usePlatformBranding`.
 */
export function usePlatformName() {
  const { data } = useQuery(PLATFORM_BRANDING_QUERY_OPTIONS);


  // Cache local serve apenas como placeholder enquanto a primeira request resolve
  const fallback = data ?? readCachedBrandingSync();

  return {
    platformName: fallback?.platform_name || 'Plataforma',
    poweredByText: fallback?.powered_by_text ?? 'Powered by',
    loginHeadline: fallback?.login_headline || 'Transforme leads em \nrotina de vendas',
    loginSubheadline:
      fallback?.login_subheadline ||
      'Playbooks, cadências, objeções e IA em um só lugar. Venda mais com consistência e inteligência.',
    loginStatsEnabled: fallback?.login_stats_enabled ?? true,
    footerText: fallback?.footer_text || '',
    loginBgImageUrl: (fallback as any)?.login_bg_image_url || null,
    loginBgLayout: (fallback as any)?.login_bg_layout || 'split-left',
    loginLogoPosition: (fallback as any)?.login_logo_position || 'left',
    hideWidgetBranding: (fallback as any)?.hide_widget_branding || false,
  };
}
