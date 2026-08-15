// Compartilhado entre `evolution-webhook` e `whatsapp-media-fetch`.
// Decripta mídia WhatsApp localmente (Signal Protocol) e, como fallback,
// chama o endpoint /message/downloadimage do Evolution Go no formato
// canônico (byte arrays, Authorization: Bearer).

export function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.includes(',') ? b64.split(',', 2)[1] : b64;
  const normalized = cleaned.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function bytesFromAny(value: any): Uint8Array | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value.map((n) => Number(n) & 0xff));
  if (Array.isArray(value?.data)) return new Uint8Array(value.data.map((n: any) => Number(n) & 0xff));
  if (typeof value === 'string' && value.trim()) {
    try { return base64ToBytes(value); } catch { return null; }
  }
  return null;
}

function pickRaw(rawMessage: any, ...names: string[]): any {
  for (const name of names) {
    const v = rawMessage?.[name] ?? rawMessage?.[name.charAt(0).toUpperCase() + name.slice(1)];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function looksDecrypted(b64: string): boolean {
  if (!b64 || b64.length < 16) return false;
  try {
    const head = atob(b64.slice(0, 32));
    const bytes = new Uint8Array(head.length);
    for (let i = 0; i < head.length; i++) bytes[i] = head.charCodeAt(i);
    const ascii = (i: number, n: number) => String.fromCharCode(...Array.from(bytes.subarray(i, i + n)));
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
    if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return true;
    if (ascii(0, 4) === 'RIFF') return true;
    if (ascii(0, 4) === 'OggS') return true;
    if (ascii(0, 4) === 'fLaC') return true;
    if (ascii(0, 3) === 'ID3') return true;
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
    if (ascii(4, 4) === 'ftyp') return true;
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true;
    if (ascii(0, 4) === '%PDF') return true;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true; // ZIP / docx / xlsx
    if (ascii(0, 5) === '{\\rtf') return true;
    if (ascii(0, 4) === 'PK\x03\x04') return true;
    return false;
  } catch {
    return false;
  }
}

export type MediaKind = 'audio' | 'image' | 'video' | 'document' | 'sticker';

export async function decryptWhatsAppMedia(
  rawMessage: any,
  mediaType?: MediaKind | string,
): Promise<{ base64: string; mime?: string } | null> {
  if (!rawMessage) return null;
  const mediaKey = bytesFromAny(pickRaw(rawMessage, 'mediaKey'));
  const directPath = String(pickRaw(rawMessage, 'directPath') || '').trim();
  const url = String(pickRaw(rawMessage, 'url') || '').trim();
  const mediaUrl = url || (directPath ? `https://mmg.whatsapp.net${directPath.startsWith('/') ? directPath : `/${directPath}`}` : '');
  if (!mediaKey || !mediaUrl) return null;

  const resp = await fetch(mediaUrl);
  if (!resp.ok) {
    console.warn(`[wa-media] fetch encrypted body failed: ${resp.status}`);
    return null;
  }
  const encrypted = new Uint8Array(await resp.arrayBuffer());
  if (encrypted.byteLength <= 16) return null;

  const infoByType: Record<string, string> = {
    image: 'WhatsApp Image Keys',
    audio: 'WhatsApp Audio Keys',
    video: 'WhatsApp Video Keys',
    document: 'WhatsApp Document Keys',
    sticker: 'WhatsApp Image Keys',
  };
  const infos = Array.from(new Set([
    mediaType ? infoByType[String(mediaType)] : null,
    'WhatsApp Document Keys',
    'WhatsApp Image Keys',
    'WhatsApp Video Keys',
    'WhatsApp Audio Keys',
  ].filter(Boolean) as string[]));

  for (const info of infos) {
    try {
      const keyMaterial = await crypto.subtle.importKey('raw', mediaKey, 'HKDF', false, ['deriveBits']);
      const expanded = new Uint8Array(await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) },
        keyMaterial,
        112 * 8,
      ));
      const iv = expanded.slice(0, 16);
      const cipherKey = expanded.slice(16, 48);
      const macKey = expanded.slice(48, 80);
      const ciphertext = encrypted.slice(0, encrypted.byteLength - 10);
      const mac = encrypted.slice(encrypted.byteLength - 10);
      const hmacKey = await crypto.subtle.importKey('raw', macKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const check = new Uint8Array(iv.byteLength + ciphertext.byteLength);
      check.set(iv, 0);
      check.set(ciphertext, iv.byteLength);
      const digest = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, check));
      const macOk = mac.every((b, i) => b === digest[i]);
      if (!macOk) continue;
      const aesKey = await crypto.subtle.importKey('raw', cipherKey, { name: 'AES-CBC' }, false, ['decrypt']);
      const clear = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext));
      const b64 = bytesToBase64(clear);
      const mime = pickRaw(rawMessage, 'mimetype') || undefined;
      return { base64: b64, mime };
    } catch (e) {
      // try next info
    }
  }
  return null;
}

// Fallback via Evolution Go /message/downloadimage.
// Aceita qualquer tipo (imagem/vídeo/áudio/documento) desde que os campos
// estejam no formato correto: mediaKey/fileEncSHA256/fileSHA256 como
// arrays de inteiros (bytes), não strings base64.
export async function downloadViaEvolutionGo(
  evoUrl: string,
  apiKeys: string[],
  rawMessage: any,
): Promise<{ base64: string; mime?: string; status?: number; error?: string } | null> {
  if (!evoUrl || !rawMessage) return null;
  const mediaKey = bytesFromAny(pickRaw(rawMessage, 'mediaKey'));
  const fileEnc = bytesFromAny(pickRaw(rawMessage, 'fileEncSHA256'));
  const fileSha = bytesFromAny(pickRaw(rawMessage, 'fileSHA256'));
  const directPath = String(pickRaw(rawMessage, 'directPath') || '');
  const url = String(pickRaw(rawMessage, 'url') || '');
  const mimetype = String(pickRaw(rawMessage, 'mimetype') || '');
  const fileLength = Number(pickRaw(rawMessage, 'fileLength') || 0) || undefined;
  if (!mediaKey || !directPath) return null;

  const payload: Record<string, any> = {
    directPath,
    url: url || undefined,
    mimetype: mimetype || undefined,
    fileLength,
    mediaKey: Array.from(mediaKey),
    fileEncSHA256: fileEnc ? Array.from(fileEnc) : undefined,
    fileSHA256: fileSha ? Array.from(fileSha) : undefined,
  };

  const keys = Array.from(new Set(apiKeys.map((k) => String(k || '').trim()).filter(Boolean)));
  let lastStatus = 0;
  let lastError = '';

  for (const apiKey of keys) {
    for (const authMode of ['bearer', 'apikey'] as const) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authMode === 'bearer') headers['Authorization'] = `Bearer ${apiKey}`;
      else headers['apikey'] = apiKey;
      // 1 retry para 429/500 (bug conhecido)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(`${evoUrl.replace(/\/$/, '')}/message/downloadimage`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });
          lastStatus = res.status;
          const text = await res.text();
          if (!res.ok) {
            lastError = text.slice(0, 300);
            console.warn(`[wa-media] downloadimage ${res.status} auth=${authMode}: ${lastError}`);
            if (res.status === 429 || (res.status === 500 && text.includes('429'))) {
              await new Promise((r) => setTimeout(r, 1500));
              continue;
            }
            break;
          }
          const data = text ? JSON.parse(text) : null;
          const candidate =
            data?.image || data?.data?.image || data?.data?.base64 || data?.base64 || data?.Base64 ||
            data?.file || data?.data?.file || data?.media || data?.data?.media ||
            (typeof data === 'string' ? data : null);
          const b64 = typeof candidate === 'string'
            ? (candidate.includes(',') ? candidate.split(',', 2)[1] : candidate)
            : null;
          if (!b64 || b64.length < 50) {
            lastError = `resposta sem base64 (keys=${Object.keys(data || {}).join(',')})`;
            break;
          }
          if (!looksDecrypted(b64)) {
            lastError = 'bytes ainda parecem criptografados';
            break;
          }
          const mime = data?.mimetype || mimetype || undefined;
          return { base64: b64, mime };
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.warn(`[wa-media] downloadimage exception:`, lastError);
          break;
        }
      }
    }
  }
  return { base64: '', status: lastStatus, error: lastError || 'download falhou' };
}
