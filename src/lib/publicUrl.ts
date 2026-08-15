import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { readCachedBrandingSync } from '@/hooks/usePlatformBranding';

function normalizeUrl(value?: string | null): string | null {
  const raw = value?.trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

export function isEditorHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return (
    hostname.endsWith('.lovableproject.com') ||
    hostname.includes('-preview--') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  );
}

/**
 * Cascata de resolução do domínio público da plataforma:
 *  1) `public_app_url` salvo em `platform_settings` (Identidade Visual → Marca)
 *  2) `window.location.origin` quando disponível
 *  3) string vazia
 *
 * IMPORTANTE: não usar fallback hardcoded para `app.vendus.com.br` ou
 * `sales-guide-buddy-11.lovable.app`, senão parceiros que clonam o projeto
 * (remix) veem o domínio da Vendus em links de booking, formulários, widget etc.
 */
export function getPublicAppUrl(configuredUrl?: string | null): string {
  const configured =
    normalizeUrl(configuredUrl) ||
    normalizeUrl((readCachedBrandingSync() as any)?.public_app_url);

  if (configured) return configured;

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return '';
}

export function usePublicAppUrl() {
  return useQuery({
    queryKey: ['public-app-url'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('platform_branding_public')
        .select('public_app_url')
        .limit(1)
        .maybeSingle();
      return getPublicAppUrl(data?.public_app_url);
    },
    initialData: getPublicAppUrl(),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
