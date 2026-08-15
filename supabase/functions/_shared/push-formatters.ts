// Padroniza títulos/subtítulos das notificações push para todo o app.
// Sempre 2 linhas no iOS/Android: title em negrito + body curto.

import type { PushPayload } from "./push.ts";

function pickName(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    if (!c) continue;
    const cleaned = String(c).trim();
    if (cleaned) return cleaned;
  }
  return "Contato";
}

function mediaPreview(contentType?: string | null, fallback?: string | null): string {
  const t = (contentType || "").toLowerCase();
  if (t.includes("image") || t === "photo") return "📷 Foto";
  if (t.includes("video")) return "🎬 Vídeo";
  if (t.includes("audio") || t === "ptt") return "🎤 Áudio";
  if (t.includes("document") || t === "file") return "📎 Documento";
  if (t.includes("sticker")) return "💠 Figurinha";
  if (t.includes("location")) return "📍 Localização";
  if (fallback && fallback.trim()) return fallback.trim();
  return "📎 Mídia";
}

export function formatMessagePush(args: {
  leadName?: string | null;
  visitorName?: string | null;
  fallbackPhone?: string | null;
  text?: string | null;
  contentType?: string | null;
  conversationId: string;
}): PushPayload {
  const title = pickName(args.leadName, args.visitorName, args.fallbackPhone);
  const text = (args.text || "").trim();
  const body = text ? text.slice(0, 140) : mediaPreview(args.contentType, null);
  return {
    title,
    body,
    url: `/?tab=inbox&c=${args.conversationId}`,
    tag: `conv-${args.conversationId}`,
    data: { conversation_id: args.conversationId },
  };
}

export function formatQueuePush(args: {
  leadName?: string | null;
  visitorName?: string | null;
  fallbackPhone?: string | null;
  sectorName?: string | null;
  conversationId: string;
  sectorId?: string | null;
}): PushPayload {
  const who = pickName(args.leadName, args.visitorName, args.fallbackPhone);
  const sector = args.sectorName?.trim();
  return {
    title: "Novo lead na fila",
    body: sector ? `${who} · ${sector}` : who,
    url: args.sectorId
      ? `/?tab=inbox&c=${args.conversationId}&view=queue&sector=${args.sectorId}`
      : `/?tab=inbox&c=${args.conversationId}`,
    tag: `queue-${args.conversationId}`,
    requireInteraction: true,
    data: { conversation_id: args.conversationId, queue: true },
  };
}

function formatBRL(amount?: number | null, currency?: string | null): string | null {
  if (amount == null || isNaN(Number(amount))) return null;
  const cur = (currency || "BRL").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${cur} ${Number(amount).toFixed(2)}`;
  }
}

export function formatSalePush(args: {
  leadName?: string | null;
  buyerName?: string | null;
  productName?: string | null;
  amount?: number | null;
  currency?: string | null;
  dealId?: string | null;
}): PushPayload {
  const who = pickName(args.leadName, args.buyerName);
  const money = formatBRL(args.amount, args.currency);
  const product = args.productName?.trim();
  const parts = [money, product].filter(Boolean).join(" · ");
  return {
    title: `Venda aprovada · ${who}`,
    body: parts || "Toque para ver detalhes",
    url: args.dealId ? `/?tab=deals&deal=${args.dealId}` : `/?tab=deals`,
    tag: args.dealId ? `sale-${args.dealId}` : `sale-${who}`,
    requireInteraction: true,
    data: { deal_id: args.dealId || null, kind: "sale_won" },
  };
}

function formatDateBR(iso: string, tz = "America/Sao_Paulo"): string {
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: tz,
    }).format(d);
    const time = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(d);
    return `${date.replace(".", "")} · ${time}`;
  } catch {
    return iso;
  }
}

export function formatBookingPush(args: {
  eventName?: string | null;
  leadName?: string | null;
  guestName?: string | null;
  startIso: string;
  timezone?: string | null;
  calendarEventId?: string | null;
}): PushPayload {
  const who = pickName(args.leadName, args.guestName);
  const eventName = args.eventName?.trim() || "Reunião";
  return {
    title: `${eventName} com ${who}`,
    body: formatDateBR(args.startIso, args.timezone || "America/Sao_Paulo"),
    url: args.calendarEventId
      ? `/?tab=calendar&event=${args.calendarEventId}`
      : `/?tab=calendar`,
    tag: args.calendarEventId ? `booking-${args.calendarEventId}` : undefined,
    requireInteraction: true,
    data: { calendar_event_id: args.calendarEventId || null, kind: "new_booking" },
  };
}
