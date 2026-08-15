// Captura completa de identificadores de rastreamento (UTMs, Meta, referrer, UA).
// Usada por PublicForm/PublicQuiz/PublicChat/PublicBooking antes de submeter.

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export type TrackingParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  li_fat_id?: string;
  fbc?: string;
  fbp?: string;
  referrer_url?: string;
  landing_page?: string;
  user_agent?: string;
};

export function collectTrackingParams(): TrackingParams {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const get = (k: string) => p.get(k) || undefined;
  const fbclid = get('fbclid');
  // Se _fbc não existir mas fbclid sim, monta o formato padrão do Meta Pixel.
  const cookieFbc = readCookie('_fbc') || undefined;
  const fbc = cookieFbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);
  return {
    utm_source: get('utm_source'),
    utm_medium: get('utm_medium'),
    utm_campaign: get('utm_campaign'),
    utm_term: get('utm_term'),
    utm_content: get('utm_content'),
    fbclid,
    gclid: get('gclid'),
    ttclid: get('ttclid'),
    li_fat_id: get('li_fat_id'),
    fbc,
    fbp: readCookie('_fbp') || undefined,
    referrer_url: document.referrer || undefined,
    landing_page: window.location.href,
    user_agent: navigator.userAgent,
  };
}
