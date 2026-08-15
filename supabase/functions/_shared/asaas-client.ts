// Shared helpers for the Asaas integration.
export function asaasBaseUrl(env: string | null | undefined): string {
  return env === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}

export async function asaasFetch(
  env: string | null | undefined,
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: any }> {
  const url = `${asaasBaseUrl(env)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      access_token: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: res.status, body };
}

export function mapAsaasStatus(status: string | null | undefined):
  | 'confirmed' | 'refunded' | 'chargeback' | 'cancelled' | null {
  const s = String(status ?? '').toUpperCase();
  if (s === 'CONFIRMED' || s === 'RECEIVED' || s === 'RECEIVED_IN_CASH') return 'confirmed';
  if (s.startsWith('REFUND')) return 'refunded';
  if (s.includes('CHARGEBACK')) return 'chargeback';
  if (s === 'DELETED' || s === 'CANCELED' || s === 'CANCELLED') return 'cancelled';
  return null;
}
