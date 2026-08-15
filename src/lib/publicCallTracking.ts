// Client-side tracking para /call/:slug
// - Injeta Meta Pixel + GA4 sob demanda (baseado em tracking.meta_pixel_id / tracking.ga4_id)
// - Dispara eventos client-side (fbq / gtag)
// - Ecoa evento para o servidor (voice-call-track) que faz Conversions API + GA4 Measurement Protocol
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

export interface TrackingConfig {
  meta_pixel_id?: string | null;
  ga4_id?: string | null;
}

let _pixelInjected: Record<string, true> = {};
let _ga4Injected: Record<string, true> = {};

export function ensurePixel(pixelId?: string | null) {
  if (!pixelId || typeof window === 'undefined' || _pixelInjected[pixelId]) return;
  _pixelInjected[pixelId] = true;
  // Snippet oficial Meta Pixel
  (function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement; t.async = true; t.src = v;
    const s = b.getElementsByTagName(e)[0]; s.parentNode!.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  window.fbq!('init', pixelId);
  window.fbq!('track', 'PageView');
}

export function ensureGA4(measurementId?: string | null) {
  if (!measurementId || typeof window === 'undefined' || _ga4Injected[measurementId]) return;
  _ga4Injected[measurementId] = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer!.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: true });
}

export function ensureTrackers(cfg: TrackingConfig | null | undefined) {
  ensurePixel(cfg?.meta_pixel_id || null);
  ensureGA4(cfg?.ga4_id || null);
}

function genEventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Eventos padrão suportados no client (Meta) — CustomEvent para o resto
const META_STANDARD = new Set([
  'PageView', 'Lead', 'InitiateCheckout', 'Schedule', 'Contact', 'CompleteRegistration',
  'AddToCart', 'ViewContent', 'Subscribe',
]);

export interface TrackEventInput {
  event: string;                       // PageView | Lead | Schedule | InitiateCheckout | CTA_Clicked etc
  session_id?: string | null;          // voice_call_sessions.id (para CAPI)
  params?: Record<string, unknown>;    // custom_data
  user_data?: {                        // usado por CAPI para melhorar match
    em?: string; ph?: string; fn?: string; ln?: string;
    external_id?: string;
  };
  value?: number;
  currency?: string;
}

/**
 * Dispara evento em Meta Pixel (client), GA4 (client via gtag) e ecoa ao servidor
 * para Conversions API + GA4 Measurement Protocol (deduplicado por event_id).
 */
export async function trackCallEvent(input: TrackEventInput) {
  if (typeof window === 'undefined') return;
  if (input.event === 'Purchase') {
    console.warn('[trackCallEvent] Purchase ignorado: use um webhook de checkout confirmado.');
    return;
  }
  const event_id = genEventId();
  const params = { ...(input.params || {}) };
  if (typeof input.value === 'number') params['value'] = input.value;
  if (input.currency) params['currency'] = input.currency;

  // Meta Pixel
  try {
    if (window.fbq) {
      const eventName = input.event;
      const isStandard = META_STANDARD.has(eventName);
      const fn = isStandard ? 'track' : 'trackCustom';
      window.fbq(fn, eventName, params, { eventID: event_id });
    }
  } catch { /* noop */ }

  // GA4 (gtag)
  try {
    if (window.gtag) {
      window.gtag('event', input.event, { ...params, event_id });
    }
  } catch { /* noop */ }

  // Server-side (CAPI + GA4 MP) — só quando temos session_id
  if (input.session_id) {
    try {
      await supabase.functions.invoke('voice-call-track', {
        body: {
          session_id: input.session_id,
          event: input.event,
          event_id,
          params,
          user_data: input.user_data || null,
          page_url: window.location.href,
          user_agent: navigator.userAgent,
          referrer: document.referrer || null,
        },
      });
    } catch (e) {
      console.warn('[trackCallEvent] server track failed', e);
    }
  }
}
